import { createHash, createHmac } from 'node:crypto'
import {
  getNamedType,
  isInterfaceType,
  isObjectType,
  Kind,
  type DocumentNode,
  type ExecutionResult,
  type FieldNode,
  type FragmentDefinitionNode,
  type GraphQLNamedType,
  type GraphQLSchema,
  type SelectionSetNode,
} from 'graphql'
import { PHI_LISTS, PHI_REGISTRY } from '../models/phi'

/**
 * PHI read audit (DOMAIN I-PR1; adapted from openfront-hospital security/phiReadAudit.ts). Every
 * GraphQL operation that resolves a PHI list type or a protected-tier field writes one PhiReadAudit
 * row: which roots and protected fields were selected and HMAC references to the records returned.
 * Values are never stored. The classifier comes from the field annotations (models/phi.ts
 * PHI_REGISTRY / PHI_LISTS), so a new PHI field is audited the moment it is declared.
 */

type ResourceReference = { resourceType: string; referenceToken: string }
export type AuditOptions = {
  schema: GraphQLSchema
  referenceSecret: string
  variables?: Record<string, unknown>
  authority?: Record<string, unknown>
  purpose: string
  correlationReference: string
}

/** Resources a variable name points at (mutations that take ids). */
const VARIABLE_RESOURCE_TYPES: Record<string, string> = {
  residentId: 'Resident', stayId: 'Stay', representativeId: 'Representative', contactId: 'Contact', eventId: 'CensusEvent',
}

/** Names of protected fields, per GraphQL type (list key = type name in Keystone). */
function protectedFieldsOf(typeName: string): Record<string, string> | undefined {
  return PHI_REGISTRY[typeName]
}

const isPhiType = (typeName: string) => PHI_LISTS.has(typeName)

function operation(document: DocumentNode, operationName?: string | null) {
  const operations = document.definitions.filter(definition => definition.kind === Kind.OPERATION_DEFINITION)
  if (operationName) return operations.find(definition => definition.kind === Kind.OPERATION_DEFINITION && definition.name?.value === operationName)
  return operations.length === 1 ? operations[0] : undefined
}

function fieldsOf(type: GraphQLNamedType | null | undefined) {
  return type && (isObjectType(type) || isInterfaceType(type)) ? type.getFields() : null
}

function fieldType(parentType: GraphQLNamedType | null | undefined, field: FieldNode) {
  const definition = fieldsOf(parentType)?.[field.name.value]
  return definition ? getNamedType(definition.type) : null
}

export function referenceToken(secret: string, resourceType: string, id: string) {
  if (!secret || secret.length < 32) throw new Error('A strong PHI audit reference secret is required')
  return createHmac('sha256', secret).update(`${resourceType}\0${id}`).digest('hex')
}

function rootTypeOf(schema: GraphQLSchema, kind: string) {
  return kind === 'query' ? schema.getQueryType() : kind === 'mutation' ? schema.getMutationType() : schema.getSubscriptionType()
}

function selectionDescription(document: DocumentNode, operationName: string | null | undefined, schema: GraphQLSchema) {
  const roots = new Set<string>()
  const protectedSelected = new Set<string>()
  const fragments = new Map<string, FragmentDefinitionNode>()
  for (const definition of document.definitions) if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition)
  const selectedOperation = operation(document, operationName)
  let readsProtectedData = false
  const seenFragments = new Set<string>()

  const walk = (selectionSet: SelectionSetNode, parentType: GraphQLNamedType | null | undefined, root = false) => {
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        const name = selection.name.value
        const outputType = fieldType(parentType, selection)
        if (root) roots.add(name)
        const tier = parentType ? protectedFieldsOf(parentType.name)?.[name] : undefined
        if (tier) {
          readsProtectedData = true
          protectedSelected.add(`${parentType!.name}.${name}`)
        }
        if (outputType && isPhiType(outputType.name)) readsProtectedData = true
        if (selection.selectionSet) walk(selection.selectionSet, outputType)
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        const conditionType = selection.typeCondition ? schema.getType(selection.typeCondition.name.value) : parentType
        walk(selection.selectionSet, conditionType || parentType, root)
      } else if (!seenFragments.has(selection.name.value)) {
        seenFragments.add(selection.name.value)
        const fragment = fragments.get(selection.name.value)
        if (fragment) walk(fragment.selectionSet, schema.getType(fragment.typeCondition.name.value) || parentType, root)
      }
    }
  }
  if (selectedOperation) walk(selectedOperation.selectionSet, rootTypeOf(schema, selectedOperation.operation), true)
  return { operation: selectedOperation, rootFields: [...roots].sort(), selectedFields: [...protectedSelected].sort(), readsProtectedData, fragments }
}

function addReference(target: Map<string, ResourceReference>, secret: string, resourceType: string, id: unknown) {
  if (typeof id !== 'string' || !id || id.length > 200) return
  const token = referenceToken(secret, resourceType, id)
  target.set(`${resourceType}:${token}`, { resourceType, referenceToken: token })
}

function collectTypedReferences(selectionSet: SelectionSetNode, parentType: GraphQLNamedType | null | undefined, value: unknown, schema: GraphQLSchema, secret: string, resources: Map<string, ResourceReference>, fragments: Map<string, FragmentDefinitionNode>, seen = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) collectTypedReferences(selectionSet, parentType, item, schema, secret, resources, fragments, seen)
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  const typeName = parentType?.name || ''
  if (typeof record.id === 'string' && isPhiType(typeName)) addReference(resources, secret, typeName, record.id)
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (!selection.selectionSet) continue
      const name = selection.alias?.value || selection.name.value
      collectTypedReferences(selection.selectionSet, fieldType(parentType, selection), record[name], schema, secret, resources, fragments, new Set(seen))
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const conditionType = selection.typeCondition ? schema.getType(selection.typeCondition.name.value) : parentType
      collectTypedReferences(selection.selectionSet, conditionType || parentType, record, schema, secret, resources, fragments, new Set(seen))
    } else if (!seen.has(selection.name.value)) {
      const fragment = fragments.get(selection.name.value)
      if (fragment) {
        const next = new Set(seen)
        next.add(selection.name.value)
        collectTypedReferences(fragment.selectionSet, schema.getType(fragment.typeCondition.name.value) || parentType, record, schema, secret, resources, fragments, next)
      }
    }
  }
}

function collectVariableReferences(value: unknown, secret: string, resources: Map<string, ResourceReference>) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectVariableReferences(item, secret, resources)
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const resourceType = VARIABLE_RESOURCE_TYPES[key]
    if (resourceType) {
      if (Array.isArray(nested)) for (const id of nested) addReference(resources, secret, resourceType, id)
      else addReference(resources, secret, resourceType, nested)
    }
    collectVariableReferences(nested, secret, resources)
  }
}

export function phiReadAuditDescriptor(document: DocumentNode, operationName: string | null | undefined, result: ExecutionResult, options: AuditOptions) {
  const selection = selectionDescription(document, operationName, options.schema)
  if (!selection.operation || !selection.readsProtectedData) return null
  const resources = new Map<string, ResourceReference>()
  collectTypedReferences(selection.operation.selectionSet, rootTypeOf(options.schema, selection.operation.operation), result.data, options.schema, options.referenceSecret, resources, selection.fragments)
  collectVariableReferences(options.variables, options.referenceSecret, resources)
  const resourceReferences = [...resources.values()].sort((a, b) => `${a.resourceType}:${a.referenceToken}`.localeCompare(`${b.resourceType}:${b.referenceToken}`)).slice(0, 2_000)
  const selectionMaterial = JSON.stringify({ roots: selection.rootFields, fields: selection.selectedFields, operation: selection.operation.operation })
  return {
    operationType: selection.operation.operation,
    operationName: (operationName || selection.operation.name?.value || 'anonymous-operation').slice(0, 200),
    rootFields: selection.rootFields,
    selectedFields: selection.selectedFields,
    selectionDigest: createHash('sha256').update(selectionMaterial).digest('hex'),
    resourceReferences,
    resultReferenceDigest: resourceReferences.length ? createHash('sha256').update(resourceReferences.map(r => `${r.resourceType}:${r.referenceToken}`).join('\0')).digest('hex') : '',
    resultCount: resourceReferences.length,
    authority: options.authority || {},
    purpose: options.purpose,
    correlationReference: options.correlationReference,
    success: !result.errors?.length,
  }
}

export type PhiReadDescriptor = NonNullable<ReturnType<typeof phiReadAuditDescriptor>>

export async function recordPhiReadAudit(prisma: any, actor: { reference: string; kind: string; breakGlass: boolean }, descriptor: PhiReadDescriptor) {
  await prisma.phiReadAudit.create({
    data: {
      occurredAt: new Date(),
      actorReference: actor.reference,
      actorKind: actor.kind,
      operationType: descriptor.operationType,
      operationName: descriptor.operationName,
      rootFields: descriptor.rootFields,
      selectedFields: descriptor.selectedFields,
      selectionDigest: descriptor.selectionDigest,
      resultReferenceDigest: descriptor.resultReferenceDigest,
      resourceReferences: descriptor.resourceReferences,
      purpose: descriptor.purpose,
      breakGlass: actor.breakGlass,
      correlationReference: descriptor.correlationReference,
      resultCount: descriptor.resultCount,
      success: descriptor.success,
    },
  })
}

/** HMAC key for record references: a dedicated secret, else one derived from SESSION_SECRET. */
export function phiReferenceSecret() {
  const configured = process.env.PHI_AUDIT_SECRET?.trim()
  if (configured) return configured
  const session = process.env.SESSION_SECRET?.trim() ?? ''
  if (!session) return ''
  return createHmac('sha256', session).update('openfront-senior-care:phi-audit').digest('hex')
}
