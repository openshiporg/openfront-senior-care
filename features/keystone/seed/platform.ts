import { permissionNames } from '../access'
import { US_FED, US_FED_HOLIDAYS, US_FED_SOURCE } from '../lib/calendar'
import { auditCreate } from '../lib/cas'
import type { Actor } from '../lib/actor'
import type { UnitOfWork } from '../lib/unitOfWork'
import { APARTMENT_TYPES, APPROVAL_POLICIES, apartmentTypeFor, COMMUNITY, NF_UNITS, OPERATOR, PAYERS, RESIDENTIAL_UNITS, ROLES, STAFF } from './operator'
import { PACKS, US_OH_PACK } from './packs'

/**
 * Loads the operator spine and Maple Ridge places idempotently (BUILD-PLAN §5): operator settings,
 * the 25 roles, staff with community assignments, approval policies, the US-FED holiday calendar,
 * the US-FED and US-OH packs, the community, its units, rooms, beds and apartments, payers and the
 * bed-hold policy. Rows are keyed by deterministic `seed_` ids or natural keys and created only when
 * missing, so loading again changes nothing and never overwrites edits made since.
 * Every row is fictional and marked synthetic where the list has the flag.
 */

/**
 * Seeded people cannot sign in until an administrator sets a password or sends a reset link.
 * A bcrypt hash of 32 random bytes that were discarded, so no password matches it.
 */
const UNUSABLE_PASSWORD_HASH = '$2a$10$3dITCbIvf5zFA.1U8KZDhOHC3EEexi3KYy5ysZK1cRF6LHMm0H.ya'

const day = (date: string) => new Date(`${date}T00:00:00Z`)
const seedMeta = { metadata: { seed: true } }

export async function seedOperatorPlatform(uow: UnitOfWork, actor: Actor) {
  const { tx } = uow
  const created: Record<string, number> = { operator: 0, roles: 0, staff: 0, assignments: 0, approvalPolicies: 0, calendars: 0, holidays: 0, packs: 0, obligations: 0, communities: 0, units: 0, rooms: 0, beds: 0, apartments: 0, payers: 0 }

  // Packs and the holiday calendar first: the community points at them.
  for (const pack of PACKS) {
    let row = await tx.jurisdictionPack.findUnique({ where: { code: pack.code } })
    if (!row) {
      row = await tx.jurisdictionPack.create({ data: { id: pack.id, code: pack.code, name: pack.name, packVersion: pack.packVersion, effectiveFrom: day(pack.effectiveFrom), status: 'active', rules: pack.rules as never, sourceNote: pack.sourceNote } })
      auditCreate(uow, actor, 'JurisdictionPack', row.id, 'pack.loaded', { code: pack.code, packVersion: pack.packVersion }, seedMeta)
      created.packs += 1
    }
    const have = new Set((await tx.regulatoryObligation.findMany({ where: { packId: row.id }, select: { code: true } })).map(o => o.code))
    const missing = pack.obligations.filter(o => !have.has(o.code))
    if (missing.length) {
      await tx.regulatoryObligation.createMany({
        data: missing.map(o => ({ packId: row!.id, code: o.code, description: o.description, appliesTo: o.appliesTo as never, startFact: o.startFact, dueRule: o.dueRule as never, evidenceTypes: o.evidenceTypes as never, waivable: Boolean(o.waivable), ruleRef: o.ruleRef, verifyNote: o.verifyNote, ownerRole: o.ownerRole, active: o.active })),
      })
      uow.audit({ eventType: 'pack.obligations_loaded', entityType: 'JurisdictionPack', entityId: row.id, actorUserId: actor.kind === 'user' ? actor.userId : null, after: { codes: missing.map(o => o.code) }, metadata: { seed: true } })
      created.obligations += missing.length
    }
  }

  let calendar = await tx.holidayCalendar.findUnique({ where: { code: US_FED.code } })
  if (!calendar) {
    calendar = await tx.holidayCalendar.create({ data: { id: 'seed_calendar_us_fed', code: US_FED.code, name: 'US federal holidays (observed)', timeZone: US_FED.timeZone, weekendDays: US_FED.weekendDays, coverageThrough: day(US_FED.coverageThrough), source: US_FED_SOURCE } })
    auditCreate(uow, actor, 'HolidayCalendar', calendar.id, 'calendar.created', { code: US_FED.code, coverageThrough: US_FED.coverageThrough }, seedMeta)
    created.calendars += 1
  }
  const haveDays = new Set((await tx.holidayDate.findMany({ where: { calendarId: calendar.id }, select: { date: true } })).map(d => d.date.toISOString().slice(0, 10)))
  const days = US_FED_HOLIDAYS.filter(([date]) => !haveDays.has(date))
  if (days.length) {
    await tx.holidayDate.createMany({ data: days.map(([date, name]) => ({ calendarId: calendar!.id, date: day(date), name })) })
    created.holidays = days.length
  }

  if (!(await tx.operatorSettings.findUnique({ where: { id: 1 } }))) {
    const packIds = (await tx.jurisdictionPack.findMany({ select: { id: true } })).map(p => ({ id: p.id }))
    await tx.operatorSettings.create({ data: { id: 1, ...OPERATOR, synthetic: true, jurisdictionPacks: { connect: packIds } } })
    auditCreate(uow, actor, 'OperatorSettings', '1', 'operator.created', OPERATOR, seedMeta)
    created.operator = 1
  }

  const haveRoles = new Set((await tx.role.findMany({ where: { id: { in: ROLES.map(r => r.id) } }, select: { id: true } })).map(r => r.id))
  const newRoles = ROLES.filter(role => !haveRoles.has(role.id))
  if (newRoles.length) {
    await tx.role.createMany({ data: newRoles.map(role => ({ id: role.id, name: role.name, description: role.description, ...Object.fromEntries(permissionNames.map(name => [name, role.permissions.includes(name)])) })) })
    for (const role of newRoles) auditCreate(uow, actor, 'Role', role.id, 'role.created', { name: role.name, permissions: role.permissions }, seedMeta)
    created.roles = newRoles.length
  }

  // The community and its places.
  let community = await tx.community.findUnique({ where: { slug: COMMUNITY.slug } })
  if (!community) {
    const ohio = await tx.jurisdictionPack.findUnique({ where: { code: US_OH_PACK.code }, select: { id: true } })
    community = await tx.community.create({ data: { ...COMMUNITY, settingsOffered: COMMUNITY.settingsOffered as never, identifiers: COMMUNITY.identifiers as never, jurisdictionPackId: ohio?.id ?? null, holidayCalendarId: calendar.id, status: 'active', synthetic: true } })
    auditCreate(uow, actor, 'Community', community.id, 'community.created', { name: community.name, reference: community.reference }, seedMeta)
    created.communities = 1
  }
  if (!community.bedHoldPolicyId) {
    const rule = (US_OH_PACK.rules.medicaidBedHold ?? {}) as { daysPerCalendarYear: number; rateRule: unknown; ruleRef: string; verifyNote: string }
    const policy = await tx.bedHoldPolicy.upsert({
      where: { id: 'seed_bed_hold_policy_maple_ridge' },
      create: { id: 'seed_bed_hold_policy_maple_ridge', name: 'Maple Ridge bed-hold policy', communityId: community.id, jurisdictionPackId: 'seed_pack_us_oh', medicaidHoldDaysPerYear: rule.daysPerCalendarYear, medicaidHoldPaid: true, medicaidHoldRateRule: rule.rateRule as never, therapeuticLeaveDaysPerYear: rule.daysPerCalendarYear, privateHoldDailyRateMinor: 31_500n, ruleRef: rule.ruleRef, verifyNote: `${rule.verifyNote} Private hold charge is the operator's contract rate (fictional).`, effectiveFrom: day('2026-01-01') },
      update: {},
    })
    await tx.community.update({ where: { id: community.id }, data: { bedHoldPolicyId: policy.id } })
    auditCreate(uow, actor, 'BedHoldPolicy', policy.id, 'bed_hold_policy.created', { medicaidHoldDaysPerYear: policy.medicaidHoldDaysPerYear, ruleRef: policy.ruleRef }, seedMeta)
  }

  const buildings = [
    { id: 'seed_building_health_center', name: 'Health Center', kind: 'nursing' },
    { id: 'seed_building_residences', name: 'The Residences', kind: 'residential' },
  ]
  for (const building of buildings) {
    if (await tx.building.findUnique({ where: { id: building.id } })) continue
    await tx.building.create({ data: { ...building, communityId: community.id } })
  }

  for (const unit of NF_UNITS) {
    if (await tx.unit.findUnique({ where: { id: unit.id } })) continue
    await tx.unit.create({ data: { id: unit.id, communityId: community.id, buildingId: 'seed_building_health_center', name: unit.name, code: unit.code, setting: 'nursing_facility', specialty: unit.specialty, secured: false, status: 'active' } })
    created.units += 1
    // Isolation rooms are private (one bed); the rest semi-private (A/B).
    const rooms: { number: string; kind: string; isolation: boolean; beds: string[] }[] = []
    let remaining: number = unit.beds
    for (let i = 0; remaining > 0; i += 1) {
      const isolation = i < unit.isolationRooms
      const number = String(unit.firstRoom + i)
      const beds = isolation || remaining === 1 ? ['A'] : ['A', 'B']
      rooms.push({ number, kind: beds.length === 1 ? 'private' : 'semi_private', isolation, beds })
      remaining -= beds.length
    }
    for (const room of rooms) {
      const roomId = `seed_room_${unit.code.toLowerCase()}_${room.number}`
      await tx.room.create({ data: { id: roomId, unitId: unit.id, number: room.number, kind: room.kind, isolationCapable: room.isolation, privateBath: room.isolation } })
      await tx.bed.createMany({ data: room.beds.map(label => ({ id: `${roomId}_${label.toLowerCase()}`, roomId, label: `${room.number}${label}`, certification: 'dual', licensed: true, status: 'available' })) })
      created.rooms += 1
      created.beds += room.beds.length
    }
  }

  for (const type of APARTMENT_TYPES) {
    if (await tx.apartmentType.findUnique({ where: { id: type.id } })) continue
    await tx.apartmentType.create({ data: { ...type, communityId: community.id } })
  }
  for (const unit of RESIDENTIAL_UNITS) {
    if (await tx.unit.findUnique({ where: { id: unit.id } })) continue
    await tx.unit.create({ data: { id: unit.id, communityId: community.id, buildingId: 'seed_building_residences', name: unit.name, code: unit.code, setting: unit.setting, secured: unit.secured, specialty: 'none', status: 'active' } })
    created.units += 1
    const rows = Array.from({ length: unit.count }, (_, index) => {
      const floor = unit.code === 'MEA' ? 1 + Math.floor(index / 16) : 1
      const number = unit.code === 'MEA' ? `${unit.prefix}${floor}-${String((index % 16) + 1).padStart(2, '0')}` : `${unit.prefix}${index + 1}`
      const typeId = apartmentTypeFor(unit.code, index)
      return { id: `seed_apartment_${unit.code.toLowerCase()}_${index + 1}`, unitId: unit.id, number, apartmentTypeId: typeId, capacity: typeId === 'seed_apt_companion' ? 2 : 1, allowsUnrelatedCompanion: false, status: 'available', occupantCount: 0 }
    })
    await tx.apartment.createMany({ data: rows })
    created.apartments += rows.length
  }

  for (const payer of PAYERS) {
    if (await tx.payer.findUnique({ where: { id: payer.id } })) continue
    await tx.payer.create({ data: { ...payer } })
    created.payers += 1
  }

  // Staff and their assignments to Maple Ridge (operator admins see every community without one).
  const haveUsers = await tx.user.findMany({ where: { OR: [{ id: { in: STAFF.map(p => p.id) } }, { email: { in: STAFF.map(p => p.email) } }] }, select: { id: true, email: true } })
  const newStaff = STAFF.filter(person => !haveUsers.some(u => u.id === person.id || u.email === person.email))
  if (newStaff.length) {
    await tx.user.createMany({ data: newStaff.map(person => ({ id: person.id, name: person.name, email: person.email, title: person.title, password: UNUSABLE_PASSWORD_HASH, kind: person.kind, roleId: person.roleId, synthetic: true, onboardingStatus: 'dismissed', accessExpiresAt: person.accessDays ? new Date(uow.now.getTime() + person.accessDays * 86_400_000) : null })) })
    for (const person of newStaff) auditCreate(uow, actor, 'User', person.id, 'user.created', { name: person.name, title: person.title, role: person.roleId }, seedMeta)
    created.staff = newStaff.length
  }
  const assignees = await tx.user.findMany({ where: { id: { in: STAFF.filter(p => p.roleId !== 'seed_role_operator_admin').map(p => p.id) } }, select: { id: true } })
  if (actor.kind === 'user' && !assignees.some(a => a.id === actor.userId)) assignees.push({ id: actor.userId })
  for (const user of assignees) {
    const exists = await tx.staffAssignment.findFirst({ where: { userId: user.id, communityId: community.id } })
    if (exists) continue
    const row = await tx.staffAssignment.create({ data: { userId: user.id, communityId: community.id, effectiveFrom: day('2026-01-01'), status: 'active' } })
    auditCreate(uow, actor, 'StaffAssignment', row.id, 'staff_assignment.created', { userId: user.id, communityId: community.id }, seedMeta)
    created.assignments += 1
  }

  const havePolicies = new Set((await tx.approvalPolicy.findMany({ select: { action: true } })).map(p => p.action))
  for (const policy of APPROVAL_POLICIES.filter(p => !havePolicies.has(p.action))) {
    const row = await tx.approvalPolicy.create({ data: { action: policy.action, description: policy.description, requiredPermission: policy.requiredPermission, minApprovals: 1, expiresAfterMinutes: policy.expiresAfterMinutes } })
    auditCreate(uow, actor, 'ApprovalPolicy', row.id, 'approval_policy.created', { action: policy.action, requiredPermission: policy.requiredPermission }, seedMeta)
    created.approvalPolicies += 1
  }

  return { communityId: community.id, created }
}
