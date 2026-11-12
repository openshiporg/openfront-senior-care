import { list } from '@keystone-6/core'
import { checkbox, decimal, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import type { Permission } from '../access'
import { scopedGoverned } from './scope'
import { fixedChoice, lifecycle, medQty, systemText } from './domainFields'
import { phiFields } from './phi'
import { opt, phiList, ro } from './residentAccess'
import { rl, scope, stamps } from './clinical'

/* Medications (SCHEMA §7). Quantities are numeric(14,3). Movement, administration and count rows are append-only (database triggers). */

const MEDS: Permission[] = ['canAdministerMeds', 'canManagePharmacy', 'canResolveCountDiscrepancy', 'canReadClinical']

/**
 * Blind count (STATE-MACHINES §9.5): the people who count controlled stock (canAdministerMeds) must never see the expected balance.
 * Only the roles that resolve differences (the DON, canResolveCountDiscrepancy) and the pharmacy (canManagePharmacy) read balances,
 * the ledger and a discrepancy's expected number. Neither role can enter a count (count.entry needs canAdministerMeds and a named slot).
 */
export const BALANCE_READERS: Permission[] = ['canResolveCountDiscrepancy', 'canManagePharmacy']
const seesBalance = ({ session }: { session?: any }) => BALANCE_READERS.some(p => session?.data?.role?.[p] === true)
/** A quantity that reveals the expected count: unreadable, unfilterable and unsortable for anyone else (no inference through `where`). */
const hiddenQty = (options: { required?: boolean; description?: string } = {}) =>
  decimal({
    precision: 14,
    scale: 3,
    validation: { isRequired: options.required ?? false },
    access: { read: seesBalance, create: () => false, update: () => false },
    isFilterable: seesBalance,
    isOrderable: seesBalance,
    ui: { ...ro.ui, ...(options.description ? { description: options.description } : {}) },
  })
const when = () => timestamp({ ...ro })
const by = () => relationship({ ref: 'User', ...ro })

export const DRUG_SCHEDULES = ['none', 'ii', 'iii', 'iv', 'v'] as const

/** Reference data the pharmacy relationship supplies. Entered by hand with the `manual` adapter. */
export const MedicationReference = list({
  access: {
    operation: { query: ({ session }: any) => Boolean(session?.data?.role?.canAccessDashboard), create: ({ session }: any) => Boolean(session?.data?.role?.canManagePharmacy), update: ({ session }: any) => Boolean(session?.data?.role?.canManagePharmacy), delete: () => false },
  },
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'strength', 'form', 'schedule', 'status'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    genericName: text(),
    strength: text(),
    form: text(),
    ndc: text({ isIndexed: true }),
    schedule: select({ ...opt(DRUG_SCHEDULES), defaultValue: 'none', validation: { isRequired: true } }),
    highAlert: checkbox({ defaultValue: false }),
    status: select({ ...opt(['active', 'retired']), defaultValue: 'active', validation: { isRequired: true } }),
    source: select({ ...opt(['manual', 'pharmacy_feed']), defaultValue: 'manual', validation: { isRequired: true } }),
    ...stamps(),
  },
})

/** A dispensing pharmacy. Adapter `manual` means nothing is sent: staff enter what the pharmacy delivers. */
export const PharmacyRelationship = list({
  access: scopedGoverned(['canManagePharmacy', 'canAdministerMeds'], ['community']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'adapter', 'phone', 'status'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    name: systemText({ required: true }),
    adapter: fixedChoice(['manual']),
    phone: systemText(),
    status: lifecycle(['active', 'ended'], 'active'),
    ...stamps(),
  },
})

export const SUPPLY_KINDS = ['resident', 'house_stock', 'ekit'] as const
export const MedicationSupply = list({
  access: scopedGoverned(MEDS, ['community']),
  ui: { labelField: 'label', listView: { initialColumns: ['label', 'kind', 'balance', 'unit', 'controlled', 'status'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    resident: relationship({ ref: 'Resident', ...ro }),
    reference: relationship({ ref: 'MedicationReference', ...ro }),
    unitLocation: relationship({ ref: 'Unit', ...ro }),
    label: systemText({ required: true }),
    kind: fixedChoice(SUPPLY_KINDS),
    lot: systemText(),
    expiresOn: timestamp({ ...ro }),
    controlled: checkbox({ defaultValue: false, ...ro }),
    unit: systemText({ required: true }),
    balance: hiddenQty({ required: true, description: 'Hidden from counting nurses (blind count). DON and pharmacy only.' }),
    status: lifecycle(['active', 'quarantined', 'destroyed', 'empty'], 'active'),
    movements: relationship({ ref: 'MedicationSupplyMovement.supply', many: true, ...ro }),
    ...stamps(),
  },
})

export const MOVEMENT_KINDS = ['receive', 'administer', 'waste', 'transfer_out', 'transfer_in', 'destroy', 'adjust', 'count_adjust', 'return_to_pharmacy'] as const
/** The ledger. A balance is the sum of these rows; a correction is another row. */
export const MedicationSupplyMovement = list({
  // The ledger adds up to the balance, so it is closed to counters as a whole, not just balanceAfter.
  access: scopedGoverned(BALANCE_READERS, ['community']),
  ui: { labelField: 'kind', listView: { initialColumns: ['kind', 'quantity', 'balanceAfter', 'supply', 'at'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    supply: relationship({ ref: 'MedicationSupply.movements', ...ro }),
    seq: integer({ ...ro }),
    kind: fixedChoice(MOVEMENT_KINDS),
    quantity: medQty({ required: true, description: 'Signed: negative takes stock out.' }),
    balanceAfter: hiddenQty({ required: true }),
    /** An administer from a supply under an open count discrepancy (SM §9.5). The DB refuses one without this flag. */
    emergency: checkbox({ defaultValue: false, ...ro }),
    emergencyReason: systemText(),
    at: when(),
    actor: by(),
    witness: by(),
    reason: systemText(),
    administration: relationship({ ref: 'MedicationAdministration.movement', ...ro }),
    createdAt: timestamp({ defaultValue: { kind: 'now' }, ...ro }),
  },
})

export const MedicationDestruction = list({
  access: scopedGoverned(MEDS, ['community']),
  ui: { labelField: 'method', listView: { initialColumns: ['supply', 'quantity', 'method', 'destroyedAt'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    supply: relationship({ ref: 'MedicationSupply', ...ro }),
    quantity: medQty({ required: true }),
    method: systemText({ required: true }),
    destroyedAt: when(),
    destroyedBy: by(),
    witness: by(),
    movement: relationship({ ref: 'MedicationSupplyMovement', ...ro }),
    ...stamps(),
  },
})

export const SLOT_STATUSES = ['scheduled', 'given', 'held', 'refused', 'missed', 'not_given'] as const
/** One scheduled dose. Generated for the next 72 hours on the request that opens the eMAR. */
export const AdministrationSlot = list({
  access: rl(['canAdministerMeds', 'canReadClinical']),
  ui: { labelField: 'drugName', listView: { initialColumns: ['drugName', 'resident', 'scheduledFor', 'status'] } },
  fields: {
    ...scope(),
    detail: relationship({ ref: 'MedicationOrderDetail', ...ro }),
    order: relationship({ ref: 'Order', ...ro }),
    drugName: systemText({ required: true }),
    slotKey: systemText({ indexed: 'unique', required: true }),
    scheduledFor: when(),
    windowBefore: integer({ defaultValue: 60, ...ro }),
    windowAfter: integer({ defaultValue: 60, ...ro }),
    status: lifecycle(SLOT_STATUSES),
    settledAt: when(),
    ...stamps(),
  },
})
phiList('AdministrationSlot')

export const ADMIN_OUTCOMES = ['given', 'held', 'refused', 'missed', 'not_given'] as const
/** Append-only. A late entry records both when it happened and when it was written. */
export const MedicationAdministration = list({
  access: rl(['canAdministerMeds', 'canReadClinical']),
  ui: { labelField: 'outcome', listView: { initialColumns: ['outcome', 'drugName', 'resident', 'administeredAt', 'timing'] } },
  fields: {
    ...scope(),
    slot: relationship({ ref: 'AdministrationSlot', ...ro }),
    detail: relationship({ ref: 'MedicationOrderDetail', ...ro }),
    drugName: systemText({ required: true }),
    outcome: fixedChoice(ADMIN_OUTCOMES),
    prn: checkbox({ defaultValue: false, ...ro }),
    ...phiFields('MedicationAdministration', {
      doseGiven: ['clin', medQty, ro],
      reason: ['clin', text, ro],
      note: ['clin', text, ro],
    }),
    doseUnit: systemText(),
    administeredAt: when(),
    recordedAt: when(),
    lateEntry: checkbox({ defaultValue: false, ...ro }),
    timing: select({ ...opt(['on_time', 'early', 'late', 'not_scheduled']), ...ro }),
    identityCheck: select({ ...opt(['barcode', 'photo', 'two_identifiers']), ...ro }),
    holdVital: json({ ...ro }),
    administeredBy: by(),
    witness: by(),
    supply: relationship({ ref: 'MedicationSupply', ...ro }),
    movement: relationship({ ref: 'MedicationSupplyMovement.administration', many: true, ...ro }),
    followUpDueAt: when(),
    followUpOf: relationship({ ref: 'MedicationAdministration', ...ro }),
    createdAt: timestamp({ defaultValue: { kind: 'now' }, ...ro }),
  },
})
phiList('MedicationAdministration')

export const PrnFollowUp = list({
  access: rl(['canAdministerMeds', 'canReadClinical']),
  ui: { labelField: 'status', listView: { initialColumns: ['resident', 'dueAt', 'status', 'effect'] } },
  fields: {
    ...scope(),
    administration: relationship({ ref: 'MedicationAdministration', ...ro }),
    dueAt: when(),
    status: lifecycle(['open', 'done', 'missed']),
    effect: select({ ...opt(['effective', 'partly_effective', 'not_effective', 'adverse_reaction']), ...ro }),
    recordedBy: by(),
    recordedAt: when(),
    ...stamps(),
  },
})
phiList('PrnFollowUp')

/** A blind two-person count of controlled stock at shift change. */
export const ShiftCount = list({
  access: scopedGoverned(['canAdministerMeds', 'canResolveCountDiscrepancy'], ['community']),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'unit', 'status', 'startedAt'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    unit: relationship({ ref: 'Unit', ...ro }),
    reference: systemText({ indexed: 'unique', required: true }),
    shift: fixedChoice(['day', 'evening', 'night']),
    status: lifecycle(['open', 'matched', 'discrepancy', 'resolved']),
    outgoing: by(),
    incoming: by(),
    startedAt: when(),
    completedAt: when(),
    entries: relationship({ ref: 'ShiftCountEntry.shiftCount', many: true, ...ro }),
    ...stamps(),
  },
})

/** Append-only: what one person counted. The expected balance is never shown to the counters. */
export const ShiftCountEntry = list({
  // A counter sees only their own entries, so neither nurse can read the other's number before both submit.
  access: (() => {
    const base = scopedGoverned(['canAdministerMeds', 'canResolveCountDiscrepancy'], ['community'])
    return {
      ...base,
      filter: {
        query: async (args: any) => {
          const scoped = await base.filter.query(args)
          if (seesBalance(args)) return scoped
          const own = { countedBy: { id: { equals: args.session?.itemId ?? '' } } }
          return scoped === true ? own : { AND: [scoped, own] }
        },
      },
    }
  })(),
  ui: { labelField: 'role', listView: { initialColumns: ['shiftCount', 'supply', 'role', 'counted', 'countedBy'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    shiftCount: relationship({ ref: 'ShiftCount.entries', ...ro }),
    supply: relationship({ ref: 'MedicationSupply', ...ro }),
    role: fixedChoice(['outgoing', 'incoming']),
    counted: medQty({ required: true }),
    countedBy: by(),
    at: when(),
    createdAt: timestamp({ defaultValue: { kind: 'now' }, ...ro }),
  },
})

export const CountDiscrepancy = list({
  access: scopedGoverned(BALANCE_READERS, ['community']),
  ui: { labelField: 'status', listView: { initialColumns: ['supply', 'expected', 'outgoingCounted', 'incomingCounted', 'status'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    shiftCount: relationship({ ref: 'ShiftCount', ...ro }),
    supply: relationship({ ref: 'MedicationSupply', ...ro }),
    expected: hiddenQty({ required: true }),
    outgoingCounted: medQty({ required: true }),
    incomingCounted: medQty({ required: true }),
    status: lifecycle(['open', 'resolved']),
    resolution: fixedChoiceText(),
    resolutionNote: systemText(),
    resolvedBy: by(),
    resolvedAt: when(),
    adjustment: relationship({ ref: 'MedicationSupplyMovement', ...ro }),
    incident: relationship({ ref: 'Incident', ...ro }),
    ...stamps(),
  },
})

function fixedChoiceText() {
  return select({ ...opt(['recount_matched', 'documentation_error', 'loss_suspected', 'found']), ...ro })
}
