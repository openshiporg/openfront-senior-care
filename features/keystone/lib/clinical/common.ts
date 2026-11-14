import { auditCreate } from '../cas'
import { actorUserId, type Actor } from '../actor'
import { DomainError, Codes } from '../errors'
import { nextReference } from '../sequence'
import type { Tx } from '../db'
import type { UnitOfWork } from '../unitOfWork'
import { Decimal, dec } from '../decimal'

/* Shared helpers for the Phase 2 clinical commands. */

export const invalid = (message: string, field?: string): never => {
  throw new DomainError(Codes.INVALID_INPUT, message, field ? { field } : {})
}
export const notFound = (what: string): never => {
  throw new DomainError(Codes.NOT_FOUND, `${what} not found.`)
}

export const text = (value: unknown, field: string, options: { max?: number; min?: number; required?: boolean } = {}) => {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!v) {
    if (options.required === false) return ''
    return invalid(`${field} is required.`, field)
  }
  if (options.min && v.length < options.min) invalid(`${field} needs at least ${options.min} characters.`, field)
  if (v.length > (options.max ?? 20_000)) invalid(`${field} is too long.`, field)
  return v
}

export const oneOf = <T extends string>(value: unknown, allowed: readonly T[], field: string): T => {
  if (!allowed.includes(value as T)) invalid(`Choose a valid ${field}.`, field)
  return value as T
}

export const when = (value: unknown, field: string, fallback?: Date) => {
  if (value == null || value === '') {
    if (fallback) return fallback
    return invalid(`${field} is required.`, field)
  }
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) invalid(`${field} is not a valid time.`, field)
  return d
}

export const num = (value: unknown, field: string, options: { min?: number; max?: number } = {}) => {
  const n = typeof value === 'number' ? value : Number(String(value ?? ''))
  if (!Number.isFinite(n)) return invalid(`${field} must be a number.`, field)
  if (options.min !== undefined && n < options.min) invalid(`${field} must be at least ${options.min}.`, field)
  if (options.max !== undefined && n > options.max) invalid(`${field} must be at most ${options.max}.`, field)
  return n
}

export const qty = (value: unknown, field: string): Decimal => {
  try {
    const d = dec(typeof value === 'number' ? String(value) : (value as string))
    if (!d.isFinite()) return invalid(`${field} must be a number.`, field)
    return d
  } catch {
    return invalid(`${field} must be a number.`, field)
  }
}

export async function residentFor(tx: Tx, residentId: unknown) {
  if (typeof residentId !== 'string' || !residentId) return invalid('Choose a resident.', 'residentId')
  const resident = await tx.resident.findUnique({ where: { id: residentId }, select: { id: true, communityId: true, currentStayId: true, firstName: true, lastName: true } })
  if (!resident || !resident.communityId) return notFound('Resident')
  const stay = resident.currentStayId ? await tx.stay.findUnique({ where: { id: resident.currentStayId }, select: { id: true, setting: true, status: true, admittedAt: true } }) : null
  return { ...resident, communityId: resident.communityId, stay }
}

export const communityZone = async (tx: Tx, communityId: string) => (await tx.community.findUnique({ where: { id: communityId }, select: { timeZone: true } }))?.timeZone ?? 'America/New_York'

export const ROLE_NAMES = {
  charge: 'Charge Nurse (RN/LPN)',
  don: 'Director of Nursing',
  adon: 'Assistant Director of Nursing',
  director: 'Executive Director',
  ip: 'Infection Preventionist',
  pharmacist: 'Consultant Pharmacist',
} as const

export type TaskInput = {
  communityId: string
  residentId?: string | null
  kind: string
  title: string
  detail?: string
  dedupeKey?: string
  ownerRole?: string
  dueAt?: Date | null
  escalateAt?: Date | null
  escalationOwnerRole?: string
  subjectType?: string
  subjectId?: string
  createdByWorkflow?: string
}

/**
 * A task in the staff inbox (never a sent message). Idempotent on dedupeKey. It is routed to the
 * person on shift now (a started or assigned ShiftAssignment) whose role matches `ownerRole`, else the first
 * holder of that role assigned to the community.
 */
export async function createTask(uow: UnitOfWork, actor: Actor, input: TaskInput) {
  if (input.dedupeKey) {
    const existing = await uow.tx.task.findUnique({ where: { dedupeKey: input.dedupeKey } })
    if (existing) return { task: existing, created: false }
  }
  let assigneeId: string | null = null
  if (input.ownerRole) {
    const holders = { role: { name: input.ownerRole }, assignments: { some: { communityId: input.communityId, status: 'active' } } }
    // The person on shift right now takes it (the roster, Phase 5); with nobody on shift the first holder by id does.
    const onShift = await uow.tx.user.findFirst({
      where: { ...holders, from_StaffMember_user: { some: { communityId: input.communityId, from_ShiftAssignment_staffMember: { some: { status: { in: ['assigned', 'started'] }, startsAt: { lte: uow.now }, endsAt: { gt: uow.now } } } } } },
      select: { id: true },
      orderBy: { id: 'asc' },
    })
    const holder = onShift ?? (await uow.tx.user.findFirst({ where: holders, select: { id: true }, orderBy: { id: 'asc' } }))
    assigneeId = holder?.id ?? null
  }
  const task = await uow.tx.task.create({
    data: {
      communityId: input.communityId, residentId: input.residentId ?? null, kind: input.kind, title: input.title, detail: input.detail ?? '',
      dedupeKey: input.dedupeKey ?? undefined, status: 'open', ownerRole: input.ownerRole ?? '', assigneeId, dueAt: input.dueAt ?? null,
      escalateAt: input.escalateAt ?? input.dueAt ?? null, escalationOwnerRole: input.escalationOwnerRole ?? '',
      subjectType: input.subjectType ?? '', subjectId: input.subjectId ?? '', createdByWorkflow: input.createdByWorkflow ?? '',
    },
  })
  auditCreate(uow, actor, 'Task', task.id, 'task.created', { kind: task.kind, ownerRole: task.ownerRole, subjectId: task.subjectId })
  return { task, created: true }
}

export const ref = (uow: UnitOfWork, prefix: string) => nextReference(uow.tx, prefix, uow.now)
export const userOf = (actor: Actor) => actorUserId(actor)
