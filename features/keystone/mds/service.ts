import { actorUserId, type Actor } from '../lib/actor'
import { addDays } from '../lib/calendar'
import { canonicalJson, sha256 } from '../lib/canonical'
import { auditCreate, casUpdate } from '../lib/cas'
import { DomainError, Codes } from '../lib/errors'
import { nextReference } from '../lib/sequence'
import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { classify, DEFAULT_TABLES, type PdpmTables } from '../pdpm/classify'
import { mdsToPdpmInput } from '../pdpm/mapMds'
import * as T from '../pdpm/tables'
import { caaTriggers, CAA_VERIFY_NOTE } from './caa'
import { A0310, ITEM_SETS, MDS_TEMPLATE_CODE, MDS_VERIFY_NOTE, itemSetFor, unsignedSections, type ItemSetDefinition, type Signature } from './itemSet'
import { batchEdits, isoToMds, runSpecEdits } from './specEdits'
import { EXPORT_VERIFY_NOTE, FVR_VERIFY_NOTE, itemSubset, parseFvr, recordXml, sha256Hex, zipStored } from './exportFile'

/**
 * MDS 3.0 commands (STATE-MACHINES §6.1-§6.4): open a record on an ARD, save items, sign sections, complete (spec edits,
 * CAA triggers, PDPM classification), correct (a new record that supersedes the old one and its classification), export the
 * iQIES file and read back the FVR. Every one is a staff button; nothing runs on a timer.
 */

const PPS_KINDS = new Set(['pps_5day', 'ipa'])
const OBRA_ASSESSMENTS = new Set(['obra_admission', 'obra_quarterly', 'obra_annual', 'obra_significant_change'])
const DATE = /^\d{4}-\d{2}-\d{2}$/
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)
const fail = (message: string, field?: string): never => { throw new DomainError(Codes.INVALID_INPUT, message, field ? { field } : {}) }
const guard = (message: string, reason: string, extra: Record<string, unknown> = {}): never => { throw new DomainError(Codes.GUARD_FAILED, message, { reason, ...extra }) }
export const dateIn = (value: unknown, field: string) => {
  const v = typeof value === 'string' ? value.slice(0, 10) : ''
  if (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) fail(`${field} must be a date.`, field)
  return v
}

/* ---------------------------------------------------------------- reference data */

/** Loads the MDS item-set template versions and the FY2026 PDPM tables and rates. Idempotent. */
export async function loadMdsReference(uow: UnitOfWork, actor: Actor) {
  let templates = 0, versions = 0, rates = 0
  for (const [i, set] of ITEM_SETS.entries()) {
    const exists = await uow.tx.assessmentTemplate.findFirst({ where: { code: MDS_TEMPLATE_CODE, templateVersion: i + 1 } })
    if (exists) continue
    const row = await uow.tx.assessmentTemplate.create({
      data: { code: MDS_TEMPLATE_CODE, name: `MDS 3.0 item set V${set.itemSetVersion}`, templateVersion: i + 1, scorer: 'mds', definition: set as never, settings: { effectiveFrom: set.effectiveFrom, effectiveTo: set.effectiveTo } as never, sourceNote: 'CMS MDS 3.0 RAI Manual and data specifications.', verifyNote: MDS_VERIFY_NOTE, status: 'active' },
    })
    auditCreate(uow, actor, 'AssessmentTemplate', row.id, 'assessment_template.loaded', { code: MDS_TEMPLATE_CODE, itemSetVersion: set.itemSetVersion })
    templates += 1
  }
  let version = await uow.tx.pdpmMappingVersion.findUnique({ where: { code: T.PDPM_VERSION } })
  if (!version) {
    const tables = { ptCmi: T.PT_CMI, otCmi: T.OT_CMI, slpCmi: T.SLP_CMI, nursingCmi: T.NURSING_CMI, ntaCmi: T.NTA_CMI, ntaPoints: T.NTA_POINTS, icdCategory: T.ICD_CATEGORY_STARTER, nursingHippsOrder: T.NURSING_HIPPS_ORDER }
    version = await uow.tx.pdpmMappingVersion.create({
      data: { code: T.PDPM_VERSION, effectiveFrom: day(T.PDPM_EFFECTIVE_FROM), effectiveTo: day(T.PDPM_EFFECTIVE_TO), tables: tables as never, sourceNote: T.HIPPS_SOURCE_NOTE, verifyNote: [T.PDPM_VERIFY_NOTE, T.VPD_VERIFY_NOTE, T.ICD_VERIFY_NOTE].join(' '), status: 'active' },
    })
    auditCreate(uow, actor, 'PdpmMappingVersion', version.id, 'pdpm.mapping_loaded', { code: T.PDPM_VERSION })
    versions += 1
  }
  const rows: { component: string; geography: string; rate: string; laborShare?: string; sourceNote: string; verifyNote: string }[] = [
    ...Object.entries(T.UNADJUSTED_URBAN).map(([k, v]) => ({ component: k === 'nonCaseMix' ? 'non_case_mix' : k, geography: 'urban', rate: v, laborShare: T.LABOR_SHARE[k as keyof typeof T.LABOR_SHARE], sourceNote: 'FY2026 unadjusted federal per diem, urban (RESEARCH §8.2).', verifyNote: `${T.PDPM_VERIFY_NOTE} ${T.LABOR_SHARE_VERIFY}` })),
    { component: 'snf_coinsurance', geography: 'national', rate: T.SNF_COINSURANCE_2026, sourceNote: 'SNF coinsurance per day, days 21-100 (calendar year 2026).', verifyNote: T.COINSURANCE_VERIFY },
    { component: 'wage_index', geography: 'cbsa_17460', rate: '1.0000', sourceNote: 'Starting CBSA wage index for the community; a person replaces it with the published figure.', verifyNote: 'Replace with the FY2026 SNF PPS wage index for the community CBSA.' },
  ]
  for (const r of rows) {
    const exists = await uow.tx.referenceRate.findFirst({ where: { component: r.component, geography: r.geography, effectiveFrom: day(T.PDPM_EFFECTIVE_FROM) } })
    if (exists) continue
    const effectiveTo = r.component === 'snf_coinsurance' ? day('2026-12-31') : day(T.PDPM_EFFECTIVE_TO)
    const row = await uow.tx.referenceRate.create({ data: { mappingVersionId: version.id, component: r.component, geography: r.geography, rate: r.rate, laborShare: r.laborShare ?? null, effectiveFrom: day(T.PDPM_EFFECTIVE_FROM), effectiveTo, sourceNote: r.sourceNote, verifyNote: r.verifyNote } })
    auditCreate(uow, actor, 'ReferenceRate', row.id, 'reference_rate.loaded', { component: r.component, geography: r.geography, rate: r.rate })
    rates += 1
  }
  return { templates, versions, rates }
}

async function itemSetRow(tx: Tx, ard: string) {
  const rows = await tx.assessmentTemplate.findMany({ where: { code: MDS_TEMPLATE_CODE, status: 'active' } })
  const sets = rows.map(r => ({ id: r.id, ...(r.definition as unknown as ItemSetDefinition) }))
  const set = itemSetFor(sets, ard)
  if (!set) guard(`No MDS item set covers ${ard}. Load the MDS reference data first.`, 'no_item_set')
  return set!
}

/* ---------------------------------------------------------------- the record */

export async function openMds(uow: UnitOfWork, actor: Actor, input: { stayId: string; kind: string; ardDate: unknown }) {
  const kind = String(input.kind ?? '')
  if (!A0310[kind]) fail('Choose a record type.', 'kind')
  const ard = dateIn(input.ardDate, 'ardDate')
  const stay = await uow.tx.stay.findUnique({ where: { id: input.stayId }, select: { id: true, residentId: true, communityId: true, admittedAt: true, resident: { select: { firstName: true, lastName: true, dateOfBirth: true, sex: true } } } })
  if (!stay?.residentId || !stay.communityId) throw new DomainError(Codes.NOT_FOUND, 'Stay not found.')
  const set = await itemSetRow(uow.tx, ard)
  const header = A0310[kind]
  const entry = stay.admittedAt ? stay.admittedAt.toISOString().slice(0, 10) : ard
  if (ard < entry) fail('The ARD is before the entry date.', 'ardDate')
  const partA = await uow.tx.coveragePeriod.findFirst({ where: { stayId: stay.id, payer: { kind: 'medicare_a' }, startDate: { lte: day(ard) }, OR: [{ endDate: null }, { endDate: { gt: day(ard) } }] }, select: { startDate: true } })
  if (PPS_KINDS.has(kind) && !partA) guard('A PPS assessment needs a Medicare Part A coverage on its ARD.', 'no_part_a')
  const r = stay.resident
  const items: Record<string, string> = {
    A0310A: header.A, A0310B: header.B, A0310F: header.F, A0310H: header.H,
    A0500A: r?.firstName ?? '', A0500C: r?.lastName ?? '', A0900: r?.dateOfBirth ? isoToMds(iso(r.dateOfBirth)!) : '', A0800: r?.sex === 'male' ? '1' : r?.sex === 'female' ? '2' : '-',
    A1600: isoToMds(entry), ...(kind === 'entry' ? { A1700: '1' } : { A2300: isoToMds(ard) }),
    ...(partA ? { A2400A: '1', A2400B: isoToMds(iso(partA.startDate)!) } : OBRA_ASSESSMENTS.has(kind) ? { A2400A: '0' } : {}),
  }
  const existing = await uow.tx.mdsAssessment.findFirst({ where: { residentId: stay.residentId, kind, ardDate: day(ard), status: { notIn: ['superseded', 'entered_in_error'] } }, select: { id: true } })
  if (existing) guard('There is already a record of this type on this ARD.', 'duplicate', { assessmentId: existing.id })
  const row = await uow.tx.mdsAssessment.create({
    data: { reference: await nextReference(uow.tx, 'MDS', uow.now), residentId: stay.residentId, communityId: stay.communityId, stayId: stay.id, kind, ardDate: day(ard), itemSetId: set.id, itemSetVersion: set.itemSetVersion, items: items as never, signatures: [] as never, status: 'in_progress', correctionNumber: 0 },
  })
  auditCreate(uow, actor, 'MdsAssessment', row.id, 'mds.opened', { kind, ardDate: ard, itemSetVersion: set.itemSetVersion })
  return { assessmentId: row.id, reference: row.reference, itemSetVersion: set.itemSetVersion }
}

async function lockMds(tx: Tx, id: string) {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "MdsAssessment" WHERE "id" = $1 FOR UPDATE`, id)
  if (!rows.length) throw new DomainError(Codes.NOT_FOUND, 'MDS record not found.')
  return tx.mdsAssessment.findUniqueOrThrow({ where: { id } })
}
const itemsOf = (row: { items: unknown }) => ({ ...((row.items ?? {}) as Record<string, string>) })

export async function saveMdsItems(uow: UnitOfWork, actor: Actor, input: { assessmentId: string; items: unknown; expectedVersion?: number | null }) {
  const row = await lockMds(uow.tx, input.assessmentId)
  if (row.status !== 'in_progress') guard('This record is complete. Make a correction instead.', 'completed')
  if (input.expectedVersion != null && Number(input.expectedVersion) !== row.version) throw new DomainError(Codes.STALE_STATE, 'This record changed since you loaded it. Reload and try again.')
  if (!input.items || typeof input.items !== 'object' || Array.isArray(input.items)) fail('Send the items as an object.', 'items')
  const set = (await uow.tx.assessmentTemplate.findUniqueOrThrow({ where: { id: row.itemSetId! } })).definition as unknown as ItemSetDefinition
  const known = new Set(set.items.map(i => i.id))
  const header = new Set(['A0310A', 'A0310B', 'A0310F', 'A0310H'])
  const next = itemsOf(row)
  const changed: string[] = []
  for (const [k, v] of Object.entries(input.items as Record<string, unknown>)) {
    if (!known.has(k)) fail(`${k} is not in item set V${set.itemSetVersion}.`, k)
    if (header.has(k)) fail('The reason for assessment is fixed by the record type.', k)
    const value = v === null || v === undefined ? '' : String(v).trim()
    if (value.length > 200) fail(`${k} is too long.`, k)
    if (next[k] !== value) { changed.push(k); if (value === '') delete next[k]; else next[k] = value }
  }
  if (!changed.length) return { assessmentId: row.id, changed: 0 }
  // Signatures attest sections as they were: a change to a signed section clears that section's attestation.
  const touched = new Set(changed.map(k => set.items.find(i => i.id === k)!.section))
  const signatures = ((row.signatures ?? []) as Signature[]).map(s => ({ ...s, sections: s.sections.filter(sec => !touched.has(sec)) })).filter(s => s.sections.length)
  await casUpdate(uow, { model: 'MdsAssessment', id: row.id, version: row.version, from: ['in_progress'], to: 'in_progress', actor, eventType: 'mds.items_saved', data: { items: next, signatures }, audit: { changed } })
  return { assessmentId: row.id, changed: changed.length }
}

export async function signMdsSections(uow: UnitOfWork, actor: Actor, input: { assessmentId: string; sections: unknown; title: unknown; name?: unknown }) {
  const row = await lockMds(uow.tx, input.assessmentId)
  if (row.status !== 'in_progress') guard('This record is complete.', 'completed')
  const userId = actorUserId(actor)
  if (!userId) guard('A person signs the sections.', 'not_human')
  const set = (await uow.tx.assessmentTemplate.findUniqueOrThrow({ where: { id: row.itemSetId! } })).definition as unknown as ItemSetDefinition
  const sections = (Array.isArray(input.sections) ? input.sections : String(input.sections ?? '').split(',')).map(s => String(s).trim().toUpperCase()).filter(Boolean)
  const all = new Set(set.items.filter(i => i.exported !== false).map(i => i.section))
  if (!sections.length || sections.some(s => !all.has(s))) fail('Choose the sections you completed.', 'sections')
  const title = String(input.title ?? '').trim()
  if (!title) fail('Your title is required (for example RN, MDS Coordinator).', 'title')
  const user = await uow.tx.user.findUnique({ where: { id: userId! }, select: { name: true } })
  const signature: Signature = { userId: userId!, name: String(input.name ?? user?.name ?? ''), title, sections: [...new Set(sections)].sort(), signedOn: iso(uow.now)! }
  const signatures = [...((row.signatures ?? []) as Signature[]), signature]
  await casUpdate(uow, { model: 'MdsAssessment', id: row.id, version: row.version, from: ['in_progress'], to: 'in_progress', actor, eventType: 'mds.sections_signed', data: { signatures }, audit: { sections: signature.sections, title } })
  return { assessmentId: row.id, signed: signature.sections }
}

/** The PDPM tables of the mapping version in force on a date (falls back to the code tables). */
async function tablesOn(tx: Tx, date: string): Promise<{ id: string | null; code: string; tables: PdpmTables }> {
  const v = await tx.pdpmMappingVersion.findFirst({ where: { status: 'active', effectiveFrom: { lte: day(date) }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day(date) } }] }, orderBy: { effectiveFrom: 'desc' } })
  if (!v) return { id: null, code: T.PDPM_VERSION, tables: DEFAULT_TABLES }
  const t = v.tables as unknown as PdpmTables
  return { id: v.id, code: v.code, tables: { ptCmi: t.ptCmi, otCmi: t.otCmi, slpCmi: t.slpCmi, nursingCmi: t.nursingCmi, ntaCmi: t.ntaCmi } }
}

/** Where a classification starts paying: the 5-day from day 1 of the Part A stretch, an IPA from its ARD, OBRA from its ARD. */
async function effectiveFromFor(tx: Tx, row: { stayId: string | null; kind: string; ardDate: Date }) {
  const ard = iso(row.ardDate)!
  if (row.kind !== 'pps_5day') return ard
  const cov = await tx.coveragePeriod.findFirst({ where: { stayId: row.stayId, payer: { kind: 'medicare_a' }, startDate: { lte: row.ardDate }, OR: [{ endDate: null }, { endDate: { gt: row.ardDate } }] }, select: { startDate: true } })
  return cov ? iso(cov.startDate)! : ard
}

export async function completeMds(uow: UnitOfWork, actor: Actor, input: { assessmentId: string; completedOn?: unknown; aids?: unknown }) {
  const row = await lockMds(uow.tx, input.assessmentId)
  if (row.status !== 'in_progress') guard('This record is already complete.', 'completed')
  const set = (await uow.tx.assessmentTemplate.findUniqueOrThrow({ where: { id: row.itemSetId! } })).definition as unknown as ItemSetDefinition
  const completedOn = input.completedOn ? dateIn(input.completedOn, 'completedOn') : iso(uow.now)!
  const items = { ...itemsOf(row), Z0500B: isoToMds(completedOn) }
  const unsigned = unsignedSections(row.kind, set, (row.signatures ?? []) as Signature[])
  if (unsigned.length) guard(`Sections ${unsigned.join(', ')} are not signed yet (Z0400).`, 'unsigned_sections', { sections: unsigned })
  const edits = runSpecEdits(row.kind, items, set)
  if (edits.fatal.length) guard(`${edits.fatal.length} spec edit(s) fail: ${edits.fatal.slice(0, 3).map(e => e.message).join(' ')}`, 'spec_edits', { edits: edits.fatal })
  const caas = caaTriggers(row.kind, items)
  let classification: { id: string; hipps: string } | null = null
  let hipps = ''
  if (PPS_KINDS.has(row.kind) || OBRA_ASSESSMENTS.has(row.kind)) {
    classification = await writeClassification(uow, actor, row, items, Boolean(input.aids))
    hipps = classification.hipps
  }
  await casUpdate(uow, {
    model: 'MdsAssessment', id: row.id, version: row.version, from: ['in_progress'], to: 'completed', actor, eventType: 'mds.completed',
    data: { items, editResults: edits, caaTriggers: { triggered: caas, verifyNote: CAA_VERIFY_NOTE }, hipps, completedAt: uow.now, completedById: actorUserId(actor) },
    audit: { kind: row.kind, ardDate: iso(row.ardDate), hipps, caas: caas.map(c => c.code), warnings: edits.warning.length },
  })
  // A correction completes: the record it corrects and that record's classification are superseded.
  if (row.correctionOfId) {
    const prior = await lockMds(uow.tx, row.correctionOfId)
    await casUpdate(uow, { model: 'MdsAssessment', id: prior.id, version: prior.version, from: [prior.status], to: 'superseded', actor, eventType: 'mds.superseded', reason: row.correctionReason, audit: { by: row.id } })
  }
  return { assessmentId: row.id, hipps, caaTriggers: caas, warnings: edits.warning, classificationId: classification?.id ?? null }
}

async function writeClassification(uow: UnitOfWork, actor: Actor, row: { id: string; residentId: string | null; communityId: string | null; stayId: string | null; kind: string; ardDate: Date; correctionOfId: string | null }, items: Record<string, string>, aids: boolean) {
  const indicator = row.kind === 'pps_5day' ? 'five_day' : row.kind === 'ipa' ? 'ipa' : 'obra'
  const effectiveFrom = await effectiveFromFor(uow.tx, row)
  const tables = await tablesOn(uow.tx, iso(row.ardDate)!)
  const input = mdsToPdpmInput(items, { aids })
  const result = classify(input, indicator, tables.tables)
  const created = await uow.tx.pdpmClassification.create({
    data: {
      residentId: row.residentId, communityId: row.communityId, stayId: row.stayId, assessmentId: row.id, mappingVersionId: tables.id, indicator, effectiveFrom: day(effectiveFrom),
      hipps: result.hipps, cmi: result.cmi as never, groups: { ...result.groups, hippsNta: result.hippsNta, ntaScore: result.ntaScore, aids: result.aids, version: tables.code } as never, functionScores: result.functionScore as never,
      inputHash: sha256(canonicalJson({ input, indicator, version: tables.code })), status: 'current',
    },
  })
  auditCreate(uow, actor, 'PdpmClassification', created.id, 'pdpm.classified', { assessmentId: row.id, hipps: result.hipps, effectiveFrom, version: tables.code })
  if (row.correctionOfId) {
    const old = await uow.tx.pdpmClassification.findFirst({ where: { assessmentId: row.correctionOfId, status: 'current' } })
    if (old) {
      await uow.tx.pdpmClassification.update({ where: { id: old.id }, data: { status: 'superseded', supersededById: created.id } })
      uow.audit({ eventType: 'pdpm.superseded', entityType: 'PdpmClassification', entityId: old.id, actorUserId: actorUserId(actor), before: { status: 'current', hipps: old.hipps }, after: { status: 'superseded', by: created.id, hipps: result.hipps } })
    }
  }
  return { id: created.id, hipps: result.hipps }
}

/** A correction (modification) of a completed record: a new in-progress record with the same ARD and kind, the items copied. */
export async function correctMds(uow: UnitOfWork, actor: Actor, input: { assessmentId: string; reason: unknown }) {
  const row = await lockMds(uow.tx, input.assessmentId)
  if (!['completed', 'exported', 'accepted'].includes(row.status)) guard('Only a completed record can be corrected.', 'not_completed')
  const reason = String(input.reason ?? '').trim()
  if (reason.length < 5) fail('Say why the record is being corrected.', 'reason')
  const open = await uow.tx.mdsAssessment.findFirst({ where: { correctionOfId: row.id, status: 'in_progress' }, select: { id: true } })
  if (open) guard('A correction of this record is already open.', 'correction_open', { assessmentId: open.id })
  const items = itemsOf(row)
  delete items.Z0500B
  const created = await uow.tx.mdsAssessment.create({
    data: {
      reference: await nextReference(uow.tx, 'MDS', uow.now), residentId: row.residentId, communityId: row.communityId, stayId: row.stayId, kind: row.kind, ardDate: row.ardDate, itemSetId: row.itemSetId, itemSetVersion: row.itemSetVersion,
      items: items as never, signatures: [] as never, status: 'in_progress', correctionOfId: row.id, correctionNumber: (row.correctionNumber ?? 0) + 1, correctionReason: reason,
    },
  })
  auditCreate(uow, actor, 'MdsAssessment', created.id, 'mds.correction_opened', { correctionOf: row.id, correctionNumber: (row.correctionNumber ?? 0) + 1 }, { reason })
  return { assessmentId: created.id, reference: created.reference }
}

export async function markMdsInError(uow: UnitOfWork, actor: Actor, input: { assessmentId: string; reason: unknown }) {
  const row = await lockMds(uow.tx, input.assessmentId)
  if (row.status !== 'in_progress') guard('Only a record still in progress can be marked entered in error; correct a completed one.', 'completed')
  const reason = String(input.reason ?? '').trim()
  if (reason.length < 5) fail('Say why.', 'reason')
  await casUpdate(uow, { model: 'MdsAssessment', id: row.id, version: row.version, from: ['in_progress'], to: 'entered_in_error', actor, eventType: 'mds.entered_in_error', reason })
  return { assessmentId: row.id }
}

/* ---------------------------------------------------------------- export and FVR */

export async function exportMds(uow: UnitOfWork, actor: Actor, input: { communityId: string; assessmentIds?: unknown }) {
  const ids = Array.isArray(input.assessmentIds) ? input.assessmentIds.map(String) : null
  const rows = await uow.tx.mdsAssessment.findMany({ where: { communityId: input.communityId, status: 'completed', submissionId: null, ...(ids ? { id: { in: ids } } : {}) }, orderBy: [{ ardDate: 'asc' }, { reference: 'asc' }], take: 500 })
  if (!rows.length) guard('There are no completed records waiting to be exported.', 'nothing_to_export')
  const community = await uow.tx.community.findUniqueOrThrow({ where: { id: input.communityId }, select: { identifiers: true, region: true } }) as { identifiers: Record<string, string> | null; region: string }
  const facilityId = String(community.identifiers?.ccn ?? '')
  if (!facilityId) guard('Record the facility CCN in the community identifiers first.', 'no_ccn')
  const header = { facilityId, stateCode: String(community.identifiers?.state ?? community.region ?? 'OH').slice(0, 2).toUpperCase(), softwareVendor: 'Openfront', softwareName: 'Openfront Senior Care', softwareVersion: '4a' }
  const files: { name: string; content: string }[] = []
  const failed: { reference: string; fatal: unknown[] }[] = []
  const sets = new Map<string, ItemSetDefinition>()
  for (const row of rows) {
    if (!sets.has(row.itemSetId!)) sets.set(row.itemSetId!, (await uow.tx.assessmentTemplate.findUniqueOrThrow({ where: { id: row.itemSetId! } })).definition as unknown as ItemSetDefinition)
    const set = sets.get(row.itemSetId!)!
    const bad = batchEdits([{ reference: row.reference, kind: row.kind, items: itemsOf(row) }], set)
    if (bad.length) { failed.push({ reference: row.reference, fatal: bad[0].fatal }); continue }
    files.push({ name: `${row.reference}_${itemSubset(row.kind)}.xml`, content: recordXml({ reference: row.reference, kind: row.kind, items: itemsOf(row), correctionNumber: row.correctionNumber ?? 0 }, set, header) })
  }
  if (failed.length) guard(`${failed.length} record(s) fail the spec edits and cannot be exported.`, 'spec_edits', { failed })
  const zip = zipStored(files)
  const fileHash = sha256Hex(zip)
  const reference = await nextReference(uow.tx, 'MDSX', uow.now)
  const fileName = `${facilityId}_${reference}.zip`
  const submission = await uow.tx.mdsSubmission.create({
    data: { communityId: input.communityId, reference, recordCount: files.length, payload: { files, verifyNote: EXPORT_VERIFY_NOTE } as never, fileHash, fileName, status: 'generated', generatedAt: uow.now, generatedById: actorUserId(actor), assessments: { connect: rows.map(r => ({ id: r.id })) } },
  })
  const document = await uow.tx.document.create({ data: { title: `iQIES MDS submission ${reference}`, kind: 'mds_submission', communityId: input.communityId, phiTier: 'clin', storageKey: `mds-submission/${submission.id}`, sha256: fileHash, mimeType: 'application/zip', sizeBytes: zip.length, status: 'final' } })
  for (const row of rows) await casUpdate(uow, { model: 'MdsAssessment', id: row.id, version: row.version, from: ['completed'], to: 'exported', actor, eventType: 'mds.exported', audit: { submissionId: submission.id } })
  auditCreate(uow, actor, 'MdsSubmission', submission.id, 'mds.export_generated', { reference, records: files.length, fileHash, documentId: document.id })
  return { submissionId: submission.id, reference, fileName, fileHash, records: files.length, documentId: document.id }
}

/** Rebuilds the stored file and checks it still hashes to what was recorded (the download route uses this). */
export async function submissionFile(tx: Tx, submissionId: string) {
  const row = await tx.mdsSubmission.findUnique({ where: { id: submissionId } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Submission not found.')
  const zip = zipStored(((row.payload ?? {}) as { files?: { name: string; content: string }[] }).files ?? [])
  if (sha256Hex(zip) !== row.fileHash) throw new DomainError(Codes.GUARD_FAILED, 'The stored file does not match its hash.')
  return { zip, fileName: row.fileName, communityId: row.communityId }
}

export async function markUploaded(uow: UnitOfWork, actor: Actor, input: { submissionId: string }) {
  const row = await uow.tx.mdsSubmission.findUniqueOrThrow({ where: { id: input.submissionId } })
  await casUpdate(uow, { model: 'MdsSubmission', id: row.id, version: row.version, from: ['generated'], to: 'uploaded', actor, eventType: 'mds.uploaded', data: { uploadedAt: uow.now, uploadedById: actorUserId(actor) } })
  return { submissionId: row.id }
}

export async function recordFvr(uow: UnitOfWork, actor: Actor, input: { submissionId: string; text: unknown }) {
  const text = String(input.text ?? '')
  if (text.trim().length < 10) fail('Paste the Final Validation Report text.', 'text')
  if (text.length > 2_000_000) fail('The report is too large.', 'text')
  const row = await uow.tx.mdsSubmission.findUniqueOrThrow({ where: { id: input.submissionId }, include: { assessments: true } })
  if (!['generated', 'uploaded'].includes(row.status)) guard('This submission already has its FVR.', 'fvr_recorded')
  const outcomes = parseFvr(text, row.assessments.map(a => a.reference))
  const accepted = outcomes.filter(o => o.status === 'accepted').length
  const rejected = outcomes.filter(o => o.status === 'rejected').length
  for (const a of row.assessments) {
    const o = outcomes.find(x => x.reference === a.reference)!
    if (o.status === 'not_found' || a.status !== 'exported') continue
    await casUpdate(uow, { model: 'MdsAssessment', id: a.id, version: a.version, from: ['exported'], to: o.status, actor, eventType: `mds.${o.status}`, data: o.status === 'accepted' ? { acceptedAt: uow.now } : {}, audit: { edits: o.edits } })
  }
  const status = rejected && !accepted ? 'rejected' : rejected || outcomes.some(o => o.status === 'not_found') ? 'partially_accepted' : 'accepted'
  await casUpdate(uow, { model: 'MdsSubmission', id: row.id, version: row.version, from: [row.status], to: status, actor, eventType: 'mds.fvr_recorded', data: { fvr: { text: text.slice(0, 200_000), outcomes, verifyNote: FVR_VERIFY_NOTE }, fvrSummary: { accepted, rejected, notFound: outcomes.length - accepted - rejected }, fvrParsedAt: uow.now } })
  return { submissionId: row.id, status, accepted, rejected, outcomes }
}

/** Days from ARD to the transmission deadline etc. are read-side; this is the single exported helper for screens. */
export const transmitBy = (completedOn: string) => addDays(completedOn, 14)
