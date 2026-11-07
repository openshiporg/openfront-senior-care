import { createHash } from 'node:crypto'
import { can, principalKey, requirePermission, requireScope, type Actor } from '../lib/actor'
import { localDate } from '../lib/calendar'
import { closedThrough } from '../lib/census'
import { deriveCensusDay } from '../lib/censusDay'
import { DomainError, Codes } from '../lib/errors'
import { mcpSessionMarker } from '../mcp-oauth/session'
import { referenceToken, phiReferenceSecret } from '../security/phiReadAudit'
import { actorFor } from './actorFor'
import { assertCommunityAccess } from './run'

/**
 * Domain read queries (INTEGRATIONS §7.1 allow-list). They return JSON, so the GraphQL-level PHI
 * classifier can't see inside; each query that returns demographics writes its own PhiReadAudit
 * row (fail-closed: no audit, no data). Agents need `census.read`; names need
 * `resident.read_demographics` (agents) or canReadResidentDemographics (people).
 */

type Ctx = { session: any; prisma: any }

async function reader(context: Ctx, permissions: Parameters<typeof requirePermission>[1][]) {
  const actor = await actorFor(context)
  if (actor.kind === 'agent') requireScope(actor, 'census.read')
  else requirePermission(actor, ...permissions)
  const names = actor.kind === 'agent' ? actor.scopes.has('resident.read_demographics') : can(actor, 'canReadResidentDemographics')
  return { actor, names }
}

async function auditRead(context: Ctx, actor: Actor, operationName: string, residentIds: string[]) {
  if (!residentIds.length) return
  const secret = phiReferenceSecret()
  if (secret.length < 32) throw new DomainError(Codes.GUARD_FAILED, 'Protected data auditing is unavailable.')
  const references = residentIds.slice(0, 2000).map(id => referenceToken(secret, 'Resident', id))
  await context.prisma.phiReadAudit.create({
    data: {
      occurredAt: new Date(), actorReference: referenceToken(secret, 'principal', principalKey(actor)), actorKind: actor.kind,
      operationType: 'query', operationName, rootFields: [operationName], selectedFields: ['Resident.firstName', 'Resident.lastName'],
      selectionDigest: createHash('sha256').update(`${operationName}:names`).digest('hex'),
      resultReferenceDigest: createHash('sha256').update(references.join(',')).digest('hex'), resourceReferences: references,
      purpose: mcpSessionMarker(context.session) || actor.kind === 'agent' ? 'operations' : 'treatment_operations',
      breakGlass: false, resultCount: residentIds.length, success: true,
    },
  })
}

/** Live census counts for a community-local date (no PHI). */
export async function censusSummary(_root: unknown, args: { communityId: string; date?: string | null }, context: Ctx) {
  const { actor } = await reader(context, ['canRecordCensus', 'canAdmitDischarge', 'canReadResidentDemographics', 'canManageSales'])
  return context.prisma.$transaction(async (tx: any) => {
    await assertCommunityAccess(tx, actor, args.communityId)
    const community = await tx.community.findUnique({ where: { id: args.communityId }, select: { timeZone: true, name: true } })
    const date = args.date ?? localDate(community.timeZone, new Date())
    const derived = await deriveCensusDay(tx, args.communityId, date)
    const [beds, apartments] = await Promise.all([
      tx.bed.groupBy({ by: ['status'], where: { licensed: true, room: { unit: { communityId: args.communityId } } }, _count: { _all: true } }),
      tx.apartment.groupBy({ by: ['status'], where: { unit: { communityId: args.communityId } }, _count: { _all: true } }),
    ])
    const counts = (rows: { status: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map(row => [row.status, row._count._all]))
    return { community: community.name, date, timeZone: community.timeZone, totals: derived.totals, beds: counts(beds), apartments: counts(apartments), closedThrough: await closedThrough(tx, args.communityId) }
  }, { timeout: 15_000 })
}

/** Every bed and apartment with status; resident initials-free names only with demographics access. */
export async function bedBoard(_root: unknown, args: { communityId: string; unitId?: string | null }, context: Ctx) {
  const { actor, names } = await reader(context, ['canRecordCensus', 'canAdmitDischarge', 'canManagePlaces'])
  const rows = await context.prisma.$transaction(async (tx: any) => {
    await assertCommunityAccess(tx, actor, args.communityId)
    const units = await tx.unit.findMany({
      where: { communityId: args.communityId, ...(args.unitId ? { id: args.unitId } : {}) }, orderBy: { code: 'asc' },
      select: {
        id: true, name: true, code: true, setting: true, specialty: true, secured: true,
        rooms: { orderBy: { number: 'asc' }, select: { number: true, kind: true, beds: { orderBy: { label: 'asc' }, select: { id: true, label: true, status: true, version: true, certification: true, statusReason: true } } } },
        apartments: { orderBy: { number: 'asc' }, select: { id: true, number: true, status: true, version: true, capacity: true, occupantCount: true, apartmentType: { select: { name: true } } } },
      },
    })
    const stays = await tx.stay.findMany({
      where: { communityId: args.communityId, status: 'admitted' },
      select: { id: true, reference: true, presence: true, currentBedId: true, heldBedId: true, currentApartmentId: true, version: true, residentId: true, resident: { select: { firstName: true, lastName: true, preferredName: true } } },
    })
    return { units, stays }
  }, { timeout: 15_000 })
  const byBed = new Map<string, any>()
  const byApartment = new Map<string, any[]>()
  for (const stay of rows.stays) {
    const who = { stayId: stay.id, stayReference: stay.reference, presence: stay.presence, version: stay.version, ...(names ? { residentId: stay.residentId, name: `${stay.resident?.preferredName || stay.resident?.firstName} ${stay.resident?.lastName}` } : {}) }
    if (stay.currentBedId) byBed.set(stay.currentBedId, who)
    if (stay.heldBedId) byBed.set(stay.heldBedId, { ...who, held: true })
    if (stay.currentApartmentId) byApartment.set(stay.currentApartmentId, [...(byApartment.get(stay.currentApartmentId) ?? []), who])
  }
  if (names) await auditRead(context, actor, 'bedBoard', rows.stays.map((stay: { residentId: string }) => stay.residentId).filter(Boolean))
  return rows.units.map((unit: any) => ({
    id: unit.id, name: unit.name, code: unit.code, setting: unit.setting, specialty: unit.specialty, secured: unit.secured,
    beds: unit.rooms.flatMap((room: any) => room.beds.map((bed: any) => ({ ...bed, room: room.number, roomKind: room.kind, occupant: byBed.get(bed.id) ?? null }))),
    apartments: unit.apartments.map((apartment: any) => ({ ...apartment, type: apartment.apartmentType?.name ?? null, occupants: byApartment.get(apartment.id) ?? [] })),
  }))
}

/** The current-resident roster with place, presence and primary payer kind. */
export async function residentRoster(_root: unknown, args: { communityId: string; status?: string | null }, context: Ctx) {
  const { actor, names } = await reader(context, ['canReadResidentDemographics'])
  if (!names) throw new DomainError(Codes.NOT_AUTHORIZED, 'Reading the roster needs resident demographics access.')
  const status = args.status && ['admitted', 'discharged', 'deceased', 'pre_admit'].includes(args.status) ? args.status : 'admitted'
  const stays = await context.prisma.$transaction(async (tx: any) => {
    await assertCommunityAccess(tx, actor, args.communityId)
    return tx.stay.findMany({
      where: { communityId: args.communityId, status }, orderBy: { admittedAt: 'desc' }, take: 500,
      select: {
        id: true, reference: true, setting: true, status: true, presence: true, admittedAt: true, dischargedAt: true, version: true,
        resident: { select: { id: true, reference: true, firstName: true, lastName: true, preferredName: true } },
        currentBed: { select: { label: true } }, heldBed: { select: { label: true } }, currentApartment: { select: { number: true } },
        coverage: { where: { rank: 'primary', endDate: null }, take: 1, select: { payer: { select: { name: true, kind: true } } } },
      },
    })
  }, { timeout: 15_000 })
  await auditRead(context, actor, 'residentRoster', stays.map((stay: any) => stay.resident?.id).filter(Boolean))
  return stays.map((stay: any) => ({
    stayId: stay.id, stayReference: stay.reference, setting: stay.setting, status: stay.status, presence: stay.presence, admittedAt: stay.admittedAt, dischargedAt: stay.dischargedAt, version: stay.version,
    residentId: stay.resident?.id, residentReference: stay.resident?.reference, name: `${stay.resident?.preferredName || stay.resident?.firstName} ${stay.resident?.lastName}`,
    place: stay.currentBed?.label ?? (stay.currentApartment ? `Apt ${stay.currentApartment.number}` : stay.heldBed ? `${stay.heldBed.label} (held)` : null),
    payer: stay.coverage?.[0]?.payer ?? null,
  }))
}
