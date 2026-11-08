import { addDays, localDate, zonedInstant } from '../lib/calendar'
import { COMMUNITY, FAMILY_NAMES, GIVEN_NAMES, NF_UNITS, RESIDENTIAL_UNITS, nfRooms, residentialApartments } from './operator'

/**
 * The census, sales and portal history of Maple Ridge (BUILD-PLAN §5), as a pure, deterministic
 * list of steps. Each step is one real domain command (admission, room change, leave, discharge,
 * referral, tour, waitlist offer, portal grant, midnight sign-off...) run by the fictional staff
 * member who would do it, at the time it happened. The history is time-shifted: it ends at the
 * anchor (the moment the seed was first loaded) and runs back 60 days, with long-stay residents
 * admitted before that.
 *
 * The plan simulates every bed and apartment while it is built, so each admission lands on a
 * place that is free at that moment, released beds are turned over before reuse, and the end
 * state matches the census targets (scaled for the `small` preset used by tests).
 *
 * Every person is invented. Family and representative emails use consumer mail domains with
 * numbered local parts, phone numbers use the reserved 555-01xx range, and every row is synthetic.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type Ref = { $ref: string; field: string }

export type StepKind =
  | 'referral_sources' | 'storefront' | 'tour_slots' | 'inquiry_phone' | 'inquiry_web' | 'waitlist_web' | 'activity'
  | 'tour_schedule' | 'tour_request_web' | 'tour_move' | 'lead_move' | 'referral' | 'referral_move'
  | 'waitlist_add' | 'waitlist_offer' | 'waitlist_resolve'
  | 'admit' | 'agreement' | 'notice' | 'room_change' | 'leave_start' | 'leave_end' | 'discharge' | 'death'
  | 'place_ready' | 'place_service' | 'invite' | 'accept' | 'scope_propose' | 'scope_grant'
  | 'break_glass_open' | 'break_glass_end' | 'break_glass_review'
  | 'snapshot' | 'sign_off' | 'clock_sweep' | 'finish'

export type PlanStep = { key: string; kind: StepKind; actor: string; at: string; input: { [key: string]: Json } }

export type Preset = 'full' | 'small'

const PRESETS = {
  full: { ltGenerated: 79, ltHospice: 6, ltPrivate: 12, ltMedicare: 2, birchBefore: 27, birchBeforeDischarged: 18, birchAdmits: 25, birchAdmitsDischarged: 5, alSingles: 39, mcGenerated: 20, ilGenerated: 18, extraHoldLeaves: 4, openLeaves: 3, portalAccounts: 30, signOffDays: 29, fullSales: true },
  small: { ltGenerated: 9, ltHospice: 2, ltPrivate: 2, ltMedicare: 1, birchBefore: 4, birchBeforeDischarged: 2, birchAdmits: 3, birchAdmitsDischarged: 1, alSingles: 3, mcGenerated: 2, ilGenerated: 2, extraHoldLeaves: 1, openLeaves: 1, portalAccounts: 4, signOffDays: 2, fullSales: false },
} as const

export const SEED_VERSION = 'seed-census-v1'
export const planPrefix = (preset: Preset) => `${SEED_VERSION}-${preset}`

/* ------------------------------------------------------------------ people */

const MORE_FAMILY = ['Albrecht', 'Brennan', 'Coleman', 'Dawkins', 'Esposito', 'Fairbanks', 'Greer', 'Haddad', 'Ingram', 'Jessup', 'Kaminski', 'Langford', 'McAllister', 'Nakamura', 'Ostrander', 'Pellegrino', 'Quarles', 'Rinaldi', 'Sandoval', 'Thibodeaux', 'Ulrich', 'Vandermeer', 'Wexler', 'Zielinski']
// Alternating female/male, like GIVEN_NAMES, so index parity gives the sex.
const MORE_GIVEN = ['Mildred', 'Arthur', 'Gladys', 'Herbert', 'Frances', 'Russell', 'Helen', 'Chester', 'Agnes', 'Milton', 'Ethel', 'Wendell', 'Louise', 'Orville', 'Pauline', 'Melvin', 'Thelma', 'Roy', 'Mabel', 'Stanley', 'Edna', 'Willard', 'Lucille', 'Harvey']
const FAMILY = [...FAMILY_NAMES, ...MORE_FAMILY]
const GIVEN = [...GIVEN_NAMES, ...MORE_GIVEN]
const REP_GIVEN = ['Karen', 'Michael', 'Susan', 'David', 'Lisa', 'Robert', 'Julie', 'Brian', 'Denise', 'Mark', 'Angela', 'Kevin', 'Tamara', 'Steven', 'Rachel', 'Gregory', 'Monica', 'Jeffrey', 'Heather', 'Scott', 'Nicole', 'Timothy', 'Erin', 'Douglas']
export const FAMILY_MAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com'] as const

const slug = (value: string) => value.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')
export const familyEmail = (first: string, last: string, n: number) => `${slug(first)}.${slug(last)}${(n * 37) % 89 + 11}@${FAMILY_MAIL_DOMAINS[n % 3]}`
export const familyPhone = (n: number) => `(614) 555-01${String(n % 100).padStart(2, '0')}`

type Rep = { firstName: string; lastName: string; email?: string; phone: string; roles: string[]; contactPriority: number }
type Resident = { code: string; firstName: string; lastName: string; sex: 'female' | 'male'; dateOfBirth: string; payer: PayerKey; hospice?: boolean; reps: Rep[]; selfRepresented?: boolean; placementReason?: string }

type PayerKey = 'medicare_a' | 'medicare_advantage' | 'medicaid_ffs' | 'medicaid_mco' | 'private' | 'ltc'
const PAYER_ID: Record<PayerKey, string> = {
  medicare_a: 'seed_payer_medicare_a', medicare_advantage: 'seed_payer_buckeye_ma', medicaid_ffs: 'seed_payer_ohio_medicaid',
  medicaid_mco: 'seed_payer_ohio_mco', private: 'seed_payer_private', ltc: 'seed_payer_lakeshore_ltc',
}
const MEDICAID: PayerKey[] = ['medicaid_ffs', 'medicaid_mco']

const MC_REASONS = [
  'Moderate dementia with exit-seeking; secured neighborhood agreed at the care conference with the healthcare POA.',
  'Alzheimer\'s disease with nighttime wandering; secured unit recommended by the attending physician and accepted by the family.',
  'Vascular dementia with two community elopements before admission; secured placement chosen with the representative.',
  'Frontotemporal dementia; needs a structured, secured setting per the neurologist\'s recommendation and family consent.',
]

/* ---------------------------------------------------------------- places */

type BedState = { id: string; unit: string; room: string; label: string; status: string; occupant: string | null }
type AptState = { id: string; unit: string; number: string; typeId: string; capacity: number; status: string; occupants: string[] }

const bedId = (unit: string, room: string, label: string) => `seed_room_${unit.toLowerCase()}_${room}_${label.toLowerCase()}`
const aptId = (unit: string, n: number) => `seed_apartment_${unit.toLowerCase()}_${n}`

// Places the named residents hold; auto-allocation never uses them.
const NAMED_BEDS = { eleanor: bedId('BIR', '112', 'A'), harold: bedId('CED', '204', 'B'), dolores: bedId('CED', '210', 'A'), clarence: bedId('WIL', '226', 'A'), walter: bedId('ASP', '318', 'A') }
const ISOLATION_BED = bedId('ASP', '305', 'A')
const NAMED_APTS = { ruth: aptId('HAR', 6), marguerite: aptId('MEA', 30) }
const RESERVED_PLACES = new Set<string>([...Object.values(NAMED_BEDS), ISOLATION_BED, ...Object.values(NAMED_APTS)])

class Places {
  beds = new Map<string, BedState>()
  apts = new Map<string, AptState>()
  where = new Map<string, { bed?: string; apt?: string; status: 'in_house' | 'on_leave' | 'ended'; held?: string | null }>()
  sex = new Map<string, string>()

  constructor() {
    for (const unit of NF_UNITS) for (const room of nfRooms(unit)) for (const label of room.beds) {
      const id = bedId(unit.code, room.number, label)
      this.beds.set(id, { id, unit: unit.code, room: room.number, label, status: 'available', occupant: null })
    }
    for (const unit of RESIDENTIAL_UNITS) for (const apt of residentialApartments(unit)) {
      this.apts.set(apt.id, { id: apt.id, unit: unit.code, number: apt.number, typeId: apt.apartmentTypeId, capacity: apt.capacity, status: 'available', occupants: [] })
    }
  }

  bed(id: string) {
    const bed = this.beds.get(id)
    if (!bed) throw new Error(`Seed plan: unknown bed ${id}`)
    return bed
  }
  apt(id: string) {
    const apt = this.apts.get(id)
    if (!apt) throw new Error(`Seed plan: unknown apartment ${id}`)
    return apt
  }

  /** First free bed in the units (in order), keeping semi-private rooms single-sex. */
  freeBed(units: string[], sex: string | null, options: { prefer?: string | null } = {}) {
    if (options.prefer && this.beds.get(options.prefer)?.status === 'available') return options.prefer
    const free = [...this.beds.values()].filter(bed => units.includes(bed.unit) && bed.status === 'available' && !RESERVED_PLACES.has(bed.id))
    free.sort((a, b) => units.indexOf(a.unit) - units.indexOf(b.unit))
    const roommateOk = (bed: BedState) => {
      const mates = [...this.beds.values()].filter(other => other.unit === bed.unit && other.room === bed.room && other.id !== bed.id && other.occupant)
      return mates.every(mate => this.sex.get(mate.occupant!) === sex)
    }
    const pick = free.find(roommateOk) ?? free[0]
    if (!pick) throw new Error(`Seed plan: no free bed in ${units.join('/')}`)
    return pick.id
  }

  freeApt(unit: string, options: { type?: string; single?: boolean; companion?: boolean } = {}) {
    const pick = [...this.apts.values()].find(apt => apt.unit === unit && apt.status === 'available' && !RESERVED_PLACES.has(apt.id)
      && (!options.type || apt.typeId === options.type) && (!options.single || apt.capacity === 1) && (!options.companion || apt.capacity === 2))
    if (!pick) throw new Error(`Seed plan: no free apartment in ${unit}${options.type ? ` (${options.type})` : ''}`)
    return pick.id
  }

  occupyBed(code: string, id: string, reserved = false) {
    const bed = this.bed(id)
    if (bed.status !== (reserved ? 'reserved' : 'available')) throw new Error(`Seed plan: ${id} is ${bed.status}, cannot admit ${code}`)
    bed.status = 'occupied'
    bed.occupant = code
    this.where.set(code, { bed: id, status: 'in_house' })
  }
  occupyApt(code: string, id: string, reserved = false) {
    const apt = this.apt(id)
    const ok = reserved ? apt.status === 'reserved' : apt.status === 'available' || (apt.status === 'occupied' && apt.occupants.length < apt.capacity)
    if (!ok) throw new Error(`Seed plan: ${id} is ${apt.status}, cannot admit ${code}`)
    apt.status = 'occupied'
    apt.occupants.push(code)
    this.where.set(code, { apt: id, status: 'in_house' })
  }
  /** Ends a resident's place: beds go to cleaning, emptied apartments to turnover. */
  release(code: string) {
    const at = this.where.get(code)
    if (!at) throw new Error(`Seed plan: ${code} is not placed`)
    const bedRef = at.bed ?? at.held
    if (bedRef) {
      const bed = this.bed(bedRef)
      bed.status = 'cleaning'
      bed.occupant = null
    }
    if (at.apt) {
      const apt = this.apt(at.apt)
      apt.occupants = apt.occupants.filter(c => c !== code)
      if (!apt.occupants.length) apt.status = 'turnover'
    }
    this.where.set(code, { status: 'ended' })
    return bedRef ?? at.apt!
  }
}

/* ------------------------------------------------------------------ plan */

type Act = { at: Date; seq: number; run: () => void }

export type PlanSummary = {
  residentsPresent: number
  nursing: { occupied: number; held: number; reserved: number; cleaning: number; outOfService: number; available: number }
  residential: Record<string, { residents: number; occupied: number; reserved: number; turnover: number; available: number }>
  payers: Record<string, number>
  hospice: number
  portalAccounts: number
  steps: number
}

export function buildCensusPlan(options: { anchor: Date; preset?: Preset; timeZone?: string }): { steps: PlanStep[]; summary: PlanSummary } {
  const preset = options.preset ?? 'full'
  const P = PRESETS[preset]
  const tz = options.timeZone ?? COMMUNITY.timeZone
  const T = new Date(Math.floor(options.anchor.getTime() / 60_000) * 60_000)
  const today = localDate(tz, T)
  const prefix = planPrefix(preset)
  const at = (dayOffset: number, hhmm: string) => {
    const instant = zonedInstant(tz, addDays(today, dayOffset), hhmm)
    if (instant.getTime() > T.getTime()) throw new Error(`Seed plan: day ${dayOffset} ${hhmm} is after the anchor`)
    return instant
  }
  const date = (dayOffset: number) => addDays(today, dayOffset)
  const plus = (instant: Date, minutes: number) => new Date(instant.getTime() + minutes * 60_000)

  const steps: PlanStep[] = []
  const acts: Act[] = []
  let seq = 0
  const schedule = (when: Date, run: () => void) => acts.push({ at: when, seq: seq++, run })
  const key = (kind: string, id: string) => `${prefix}:${kind}:${id}`
  const emit = (kind: StepKind, id: string, actor: string, when: Date, input: PlanStep['input']) => {
    const k = key(kind, id)
    steps.push({ key: k, kind, actor, at: when.toISOString(), input })
    return k
  }
  const ref = (stepKey: string, field: string): Ref => ({ $ref: stepKey, field })
  const places = new Places()
  const residents = new Map<string, Resident>()
  const ending = new Set<string>()
  const used = new Set<string>()
  let personSeq = 0

  const PATEL = 'seed_user_patel', BROOKS = 'seed_user_brooks', RAMOS = 'seed_user_ramos', LINDQVIST = 'seed_user_lindqvist'
  const CASTELLANOS = 'seed_user_castellanos', FERRIS = 'seed_user_ferris', FERREIRA_KAHN = 'seed_user_ferreira_kahn'
  const PUBLIC = 'system:storefront', SCHEDULER = 'system:scheduler'
  const nurseFor = (unit: string) => (unit === 'BIR' ? RAMOS : LINDQVIST)

  const usedNames = new Set<string>()
  const newPerson = (payer: PayerKey, extra: Partial<Resident> = {}): Resident => {
    let i = personSeq++
    let first = '', last = '', g = 0
    for (let attempt = 0; ; attempt += 1) {
      g = (i * 17 + attempt) % GIVEN.length
      first = GIVEN[g]
      last = FAMILY[(i * 31 + Math.floor(i / FAMILY.length) + attempt * 7) % FAMILY.length]
      if (!usedNames.has(`${first} ${last}`)) break
    }
    usedNames.add(`${first} ${last}`)
    const code = `r${String(i + 1).padStart(3, '0')}`
    const sex = g % 2 === 0 ? 'female' : 'male'
    return { code, firstName: first, lastName: last, sex, dateOfBirth: `${1929 + ((i * 7) % 22)}-${String(((i * 5) % 12) + 1).padStart(2, '0')}-${String(((i * 11) % 28) + 1).padStart(2, '0')}`, payer, reps: familyReps(last, i), ...extra }
  }
  function familyReps(last: string, i: number): Rep[] {
    const a = REP_GIVEN[(i * 5) % REP_GIVEN.length]
    const b = REP_GIVEN[(i * 5 + 7) % REP_GIVEN.length]
    const married = i % 4 === 3 ? FAMILY[(i * 13 + 5) % FAMILY.length] : last
    if (i % 3 === 0) {
      return [
        { firstName: a, lastName: married, email: familyEmail(a, married, i), phone: familyPhone(i), roles: ['healthcare_poa', 'family'], contactPriority: 1 },
        { firstName: b, lastName: last, email: familyEmail(b, last, i + 41), phone: familyPhone(i + 41), roles: ['financial_responsible', 'family'], contactPriority: 2 },
      ]
    }
    return [{ firstName: a, lastName: married, email: familyEmail(a, married, i), phone: familyPhone(i), roles: ['healthcare_poa', 'financial_responsible', 'family'], contactPriority: 1 }]
  }
  const remember = (r: Resident) => {
    residents.set(r.code, r)
    places.sex.set(r.code, r.sex)
    return r
  }

  /* --------------------------------------------------- admission helpers */

  type AdmitPlan = { r: Resident; when: Date; place: { bed?: string; apt?: string; units?: string[]; aptUnit?: string; aptType?: string; companionOf?: string }; source: string; agreement: 'same' | 'later' | 'none'; prospect?: Ref; reservation?: Ref; reserved?: boolean; qualifying?: boolean }

  const admittedAt = new Map<string, Date>()
  const admit = (plan: AdmitPlan) => (admittedAt.set(plan.r.code, plan.when), schedule(plan.when, () => {
    const { r } = plan
    let bed = plan.place.bed
    let apt = plan.place.apt
    if (!bed && !apt && plan.place.units) bed = places.freeBed(plan.place.units, r.sex)
    if (!bed && !apt && plan.place.companionOf) apt = places.where.get(plan.place.companionOf)?.apt
    if (!bed && !apt && plan.place.aptUnit) apt = places.freeApt(plan.place.aptUnit, { type: plan.place.aptType, single: !plan.place.aptType })
    if (bed) places.occupyBed(r.code, bed, plan.reserved)
    else places.occupyApt(r.code, apt!, plan.reserved)
    const nursing = Boolean(bed)
    const effective = plan.when
    const pasrr = nursing && !plan.prospect ? { completedAt: plus(effective, -26 * 60).toISOString(), result: 'Level I negative: no serious mental illness or intellectual disability indicated; Level II not required.' } : null
    const reps = [...r.reps, ...(r.hospice ? [{ firstName: 'Carmen', lastName: 'Ostrowski', phone: familyPhone(77), roles: ['hospice_contact'], contactPriority: 9 }] : [])]
    const memberPrefix = r.payer.startsWith('medicare') ? 'SEED-MBI' : MEDICAID.includes(r.payer) ? 'SEED-OHMCD' : r.payer === 'ltc' ? 'SEED-LTC' : ''
    const notices = [
      ...(nursing ? [{ kind: 'bed_hold_policy', method: 'in_person', deliveredAt: effective.toISOString(), acknowledgement: 'signed', note: 'Bed-hold and readmission policy explained at admission.' }] : []),
      { kind: 'privacy_practices', method: 'in_person', deliveredAt: effective.toISOString(), acknowledgement: 'signed', note: 'Notice of privacy practices given at admission.' },
    ]
    emit('admit', r.code, PATEL, effective, {
      resident: { firstName: r.firstName, lastName: r.lastName, dateOfBirth: r.dateOfBirth, sex: r.sex, primaryLanguage: 'English' },
      representatives: reps.map(rep => ({ firstName: rep.firstName, lastName: rep.lastName, email: rep.email ?? null, phone: rep.phone, roles: rep.roles, contactPriority: rep.contactPriority })),
      selfRepresented: Boolean(r.selfRepresented),
      bedId: bed ?? null, apartmentId: apt ?? null,
      payerId: PAYER_ID[r.payer], memberReference: memberPrefix ? `${memberPrefix}-${r.code.toUpperCase()}` : null,
      qualifyingStayFrom: plan.qualifying ? localDate(tz, plus(effective, -5 * 1440)) : null, qualifyingStayTo: plan.qualifying ? localDate(tz, effective) : null,
      admissionSource: plan.source, effectiveAt: effective.toISOString(), pasrrLevel1: pasrr, placementReason: r.placementReason ?? null,
      companionRelationship: plan.place.companionOf ? 'spouse' : null, notices, prospectId: plan.prospect ?? null, reservationId: plan.reservation ?? null,
      agreementSignedAt: plan.agreement === 'same' ? plus(effective, 1).toISOString() : null,
    })
    if (plan.agreement === 'later') {
      schedule(plus(effective, 20 * 60), () => emit('agreement', r.code, PATEL, plus(effective, 20 * 60), { stay: ref(key('admit', r.code), 'stayId'), resident: ref(key('admit', r.code), 'residentId'), signedAt: plus(effective, 20 * 60).toISOString(), note: 'Signed by the representative at the care conference.' }))
    }
  }))

  const readyLater = (placeId: string, when: Date, unit: string, apartment = false) => schedule(when, () => {
    if (apartment) {
      const apt = places.apt(placeId)
      if (apt.status !== 'turnover') return
      apt.status = 'available'
      emit('place_ready', placeId + '_' + when.getTime(), LINDQVIST, when, { apartmentId: placeId, note: 'Apartment turned over: deep clean, paint touch-up and safety check done.' })
    } else {
      const bed = places.bed(placeId)
      if (bed.status !== 'cleaning') return
      bed.status = 'available'
      emit('place_ready', placeId + '_' + when.getTime(), nurseFor(unit), when, { bedId: placeId, note: 'Terminal clean done; bed made up.' })
    }
  })

  const discharge = (code: string, when: Date, input: { disposition: string; facility?: boolean; noticeException?: string | null; keepDirty?: boolean }) => schedule(when, () => {
    const place = places.release(code)
    const unit = places.beds.get(place)?.unit
    emit('discharge', code, PATEL, when, { stay: ref(key('admit', code), 'stayId'), disposition: input.disposition, initiatedBy: input.facility ? 'facility' : 'resident', effectiveAt: when.toISOString(), noticeException: input.noticeException ?? null })
    if (!input.keepDirty) readyLater(place, plus(when, unit ? 180 : 3 * 1440), unit ?? '', !unit)
  })

  const death = (code: string, when: Date, pronouncedBy: string) => schedule(when, () => {
    const place = places.release(code)
    const unit = places.beds.get(place)?.unit ?? ''
    emit('death', code, RAMOS, when, { stay: ref(key('admit', code), 'stayId'), effectiveAt: when.toISOString(), pronouncedBy })
    readyLater(place, plus(when, 7 * 60), unit)
  })

  const roomNotice = (code: string, when: Date, note: string) => emit('notice', `room_change_${code}_${when.getTime()}`, BROOKS, when, { stay: ref(key('admit', code), 'stayId'), kind: 'room_change', method: 'in_person', deliveredAt: when.toISOString(), acknowledgement: 'signed', note })

  const movedFrom = new Map<string, string>()
  const moveRoom = (id: string, when: Date, pick: () => { code: string; units: string[]; prefer?: string | null }, reason: string) => schedule(plus(when, -18 * 60), () => {
    const { code, units, prefer } = pick()
    used.add(code)
    roomNotice(code, plus(when, -18 * 60), `Room change discussed with the resident and representative: ${reason.toLowerCase()}`)
    schedule(when, () => {
      const from = places.where.get(code)!
      const to = places.freeBed(units, places.sex.get(code) ?? null, { prefer })
      const fromBed = places.bed(from.bed!)
      fromBed.status = 'cleaning'
      fromBed.occupant = null
      places.where.delete(code)
      places.occupyBed(code, to)
      emit('room_change', id, nurseFor(fromBed.unit), when, { stay: ref(key('admit', code), 'stayId'), toBedId: to, effectiveAt: when.toISOString(), reason })
      readyLater(fromBed.id, plus(when, 150), fromBed.unit)
      movedFrom.set(id, fromBed.id)
    })
  })

  type LeavePlan = { code: string; start: Date; end?: Date; hold: 'medicaid' | 'private' | 'none'; ombudsmanCopy: boolean; returnUnits?: string[] }
  const leave = (id: string, plan: LeavePlan) => schedule(plan.start, () => {
    const where = places.where.get(plan.code)!
    const bed = places.bed(where.bed!)
    if (plan.hold === 'none') {
      bed.status = 'cleaning'
      bed.occupant = null
      readyLater(bed.id, plus(plan.start, 180), bed.unit)
      places.where.set(plan.code, { status: 'on_leave', held: null })
    } else {
      bed.status = 'held'
      places.where.set(plan.code, { status: 'on_leave', held: bed.id })
    }
    const startKey = emit('leave_start', id, nurseFor(bed.unit), plan.start, {
      stay: ref(key('admit', plan.code), 'stayId'), leaveKind: 'hospital', holdElected: plan.hold !== 'none', holdPaidBy: plan.hold === 'none' ? 'none' : plan.hold,
      facilityInitiated: true, effectiveAt: plan.start.toISOString(), destination: 'Scioto Ridge Medical Center emergency department (fictional)',
      noticeAtTransfer: { method: 'phone_then_mail', deliveredAt: plan.start.toISOString(), acknowledgement: 'not_required', note: plan.hold === 'none' ? 'Bed-hold notice given; the representative declined the hold.' : 'Bed-hold notice explained by phone; written copy mailed to the representative.' },
    })
    if (plan.ombudsmanCopy) {
      const when = plus(plan.start, 2 * 1440 + 120)
      schedule(when, () => emit('notice', `ombudsman_${id}`, BROOKS, when, { stay: ref(key('admit', plan.code), 'stayId'), censusEvent: ref(startKey, 'eventId'), kind: 'other', method: 'email', deliveredAt: when.toISOString(), copyToOmbudsmanAt: when.toISOString(), note: 'Transfer notice copy sent to the regional Long-Term Care Ombudsman.' }))
    }
    if (plan.end) {
      const end = plan.end
      schedule(end, () => {
        let toBedId: string | null = null
        if (plan.hold === 'none') {
          toBedId = places.freeBed(plan.returnUnits ?? [bed.unit], places.sex.get(plan.code) ?? null)
          places.where.delete(plan.code)
          places.occupyBed(plan.code, toBedId)
        } else {
          bed.status = 'occupied'
          places.where.set(plan.code, { bed: bed.id, status: 'in_house' })
        }
        emit('leave_end', id, nurseFor(bed.unit), end, { stay: ref(key('admit', plan.code), 'stayId'), effectiveAt: end.toISOString(), toBedId })
      })
    }
  })

  /* --------------------------------------------- storefront and sources */

  const sourcesAt = at(-95, '08:30')
  schedule(sourcesAt, () => emit('referral_sources', 'maple_ridge', PATEL, sourcesAt, {}))
  schedule(plus(sourcesAt, 30), () => emit('storefront', 'maple_ridge', CASTELLANOS, plus(sourcesAt, 30), {}))

  /* -------------------------------------------- residents before the window */

  const harold = remember({ code: 'harold', firstName: 'Harold', lastName: 'Benningfield', sex: 'male', dateOfBirth: '1937-03-18', payer: 'medicaid_ffs', reps: [{ firstName: 'Diane', lastName: 'Benningfield', email: familyEmail('Diane', 'Benningfield', 3), phone: familyPhone(14), roles: ['healthcare_poa', 'financial_responsible', 'family'], contactPriority: 1 }] })
  const walter = remember({ code: 'walter', firstName: 'Walter', lastName: 'Dziedzic', sex: 'male', dateOfBirth: '1934-11-02', payer: 'medicaid_ffs', hospice: true, reps: [{ firstName: 'Teresa', lastName: 'Dziedzic', email: familyEmail('Teresa', 'Dziedzic', 5), phone: familyPhone(22), roles: ['healthcare_poa', 'family'], contactPriority: 1 }, { firstName: 'Paul', lastName: 'Dziedzic', email: familyEmail('Paul', 'Dziedzic', 6), phone: familyPhone(23), roles: ['financial_responsible', 'family'], contactPriority: 2 }] })
  const clarence = remember({ code: 'clarence', firstName: 'Clarence', lastName: 'Teague', sex: 'male', dateOfBirth: '1939-07-25', payer: 'private', reps: [{ firstName: 'Monica', lastName: 'Teague-Ellis', email: familyEmail('Monica', 'TeagueEllis', 8), phone: familyPhone(31), roles: ['healthcare_poa', 'financial_responsible', 'family'], contactPriority: 1 }] })
  admit({ r: harold, when: at(-1240, '14:10'), place: { bed: NAMED_BEDS.harold }, source: 'acute_hospital', agreement: 'same' })
  admit({ r: walter, when: at(-410, '13:00'), place: { bed: NAMED_BEDS.walter }, source: 'community_home', agreement: 'same' })
  admit({ r: clarence, when: at(-690, '11:20'), place: { bed: NAMED_BEDS.clarence }, source: 'assisted_living', agreement: 'same' })

  // Long-term nursing residents (Cedar, Willow, Aspen): Medicaid, private pay, hospice, a few skilled.
  const lt: Resident[] = []
  for (let i = 0; i < P.ltGenerated; i += 1) {
    const payer: PayerKey = i < P.ltHospice ? 'medicaid_ffs' : i < P.ltHospice + P.ltPrivate ? 'private' : i < P.ltHospice + P.ltPrivate + P.ltMedicare ? (i % 2 ? 'medicare_advantage' : 'medicare_a') : MEDICAID[i % 5 < 3 ? 0 : 1]
    const r = remember(newPerson(payer, { hospice: i < P.ltHospice }))
    lt.push(r)
  }
  // The court-appointed guardian: one Medicaid resident with no family.
  const ward = lt.find(r => MEDICAID.includes(r.payer) && !r.hospice)!
  ward.reps = [{ firstName: 'Bernadette', lastName: 'Kowal', email: familyEmail('Bernadette', 'Kowal', 52), phone: familyPhone(52), roles: ['guardian'], contactPriority: 1 }]
  lt.forEach((r, i) => {
    // Skilled (Medicare) long-term residents are mid-benefit; everyone else has been here months or years.
    const days = r.payer === 'medicare_a' || r.payer === 'medicare_advantage' ? 34 + i * 3 : 75 + ((i * 97) % 1150)
    const units = r.payer === 'medicare_a' || r.payer === 'medicare_advantage' ? ['WIL', 'CED', 'ASP'] : i % 3 === 0 ? ['ASP', 'CED', 'WIL'] : i % 3 === 1 ? ['CED', 'WIL', 'ASP'] : ['WIL', 'ASP', 'CED']
    admit({ r, when: at(-days, `${10 + (i % 7)}:${String((i * 13) % 60).padStart(2, '0')}`), place: { units }, source: i % 4 === 0 ? 'acute_hospital' : i % 4 === 1 ? 'community_home' : i % 4 === 2 ? 'assisted_living' : 'another_nursing_facility', agreement: 'same' })
  })

  // Birch short-stay residents admitted before the window.
  const birchBefore: Resident[] = []
  for (let i = 0; i < P.birchBefore; i += 1) {
    const r = remember(newPerson(i % 3 === 2 ? 'medicare_advantage' : 'medicare_a'))
    birchBefore.push(r)
    admit({ r, when: at(-(62 + ((i * 7) % 27)), `${15 + (i % 4)}:${String((i * 11) % 60).padStart(2, '0')}`), place: { units: ['BIR'] }, source: 'acute_hospital', agreement: 'same', qualifying: r.payer === 'medicare_a' })
  }

  // Assisted living (Meadow): Marguerite, two couples in companion suites, singles.
  const marguerite = remember({ code: 'marguerite', firstName: 'Marguerite', lastName: 'Sauvé', sex: 'female', dateOfBirth: '1936-05-09', payer: 'private', reps: [{ firstName: 'Luc', lastName: 'Sauvé', email: familyEmail('Luc', 'Sauve', 11), phone: familyPhone(44), roles: ['healthcare_poa', 'financial_responsible', 'family'], contactPriority: 1 }] })
  admit({ r: marguerite, when: at(-530, '10:00'), place: { apt: NAMED_APTS.marguerite }, source: 'community_home', agreement: 'same' })
  const al: Resident[] = [marguerite]
  for (let c = 0; c < 2; c += 1) {
    const a = remember(newPerson('private'))
    const b = remember(newPerson('private'))
    b.lastName = a.lastName
    b.reps = a.reps
    if (a.sex === b.sex) b.sex = a.sex === 'female' ? 'male' : 'female'
    places.sex.set(b.code, b.sex)
    const when = at(-(300 + c * 140), '11:00')
    admit({ r: a, when, place: { aptUnit: 'MEA', aptType: 'seed_apt_companion' }, source: 'community_home', agreement: 'same' })
    admit({ r: b, when: plus(when, 5), place: { companionOf: a.code }, source: 'community_home', agreement: 'same' })
    al.push(a, b)
  }
  for (let i = 0; i < P.alSingles; i += 1) {
    const r = remember(newPerson(i % 6 === 5 ? 'ltc' : 'private'))
    al.push(r)
    admit({ r, when: at(-(70 + ((i * 61) % 1300)), `${9 + (i % 6)}:30`), place: { aptUnit: 'MEA' }, source: 'community_home', agreement: 'same' })
  }

  // Memory care (Harbor, secured): Ruth and the rest, each with a documented placement reason.
  const ruth = remember({ code: 'ruth', firstName: 'Ruth', lastName: 'Okonkwo-Hale', sex: 'female', dateOfBirth: '1941-01-30', payer: 'private', placementReason: MC_REASONS[0], reps: [{ firstName: 'Adaeze', lastName: 'Okonkwo-Hale', email: familyEmail('Adaeze', 'OkonkwoHale', 12), phone: familyPhone(57), roles: ['healthcare_poa', 'family'], contactPriority: 1 }, { firstName: 'Simon', lastName: 'Hale', email: familyEmail('Simon', 'Hale', 13), phone: familyPhone(58), roles: ['financial_responsible', 'family'], contactPriority: 2 }] })
  admit({ r: ruth, when: at(-240, '10:30'), place: { apt: NAMED_APTS.ruth }, source: 'community_home', agreement: 'same' })
  const mc: Resident[] = [ruth]
  for (let i = 0; i < P.mcGenerated; i += 1) {
    const r = remember(newPerson(i % 5 === 4 ? 'ltc' : 'private', { placementReason: MC_REASONS[(i + 1) % MC_REASONS.length] }))
    mc.push(r)
    admit({ r, when: at(-(80 + ((i * 53) % 900)), `${10 + (i % 5)}:15`), place: { aptUnit: 'HAR' }, source: i % 2 ? 'assisted_living' : 'community_home', agreement: 'same' })
  }

  // Independent living (Grove): residents represent themselves, with an emergency contact.
  for (let i = 0; i < P.ilGenerated; i += 1) {
    const r = newPerson('private', { selfRepresented: true })
    r.reps = [{ ...r.reps[0], roles: ['emergency_contact'], contactPriority: 1 }]
    remember(r)
    admit({ r, when: at(-(90 + ((i * 71) % 1400)), '10:45'), place: { aptUnit: 'GRO' }, source: 'community_home', agreement: 'same' })
  }

  /* --------------------------------------------------- the 60-day window */

  // Birch: short-stay discharges home, new hospital admissions, and Eleanor from a referral.
  const homeDispositions = ['community_home', 'community_home', 'assisted_living', 'community_home']
  for (let k = 0; k < P.birchBeforeDischarged; k += 1) {
    const day = -58 + Math.round((k * 54) / Math.max(1, P.birchBeforeDischarged - 1))
    const r = birchBefore[k]
    ending.add(r.code)
    discharge(r.code, at(day, `${10 + (k % 3)}:30`), { disposition: homeDispositions[k % homeDispositions.length] })
  }
  const birchNew: { r: Resident; day: number }[] = []
  for (let j = 0; j < P.birchAdmits; j += 1) {
    const day = -57 + Math.round((j * 56) / Math.max(1, P.birchAdmits - 1))
    const r = remember(newPerson(j % 3 === 1 ? 'medicare_advantage' : 'medicare_a'))
    birchNew.push({ r, day })
    const last = j === P.birchAdmits - 1
    admit({ r, when: at(day, `${15 + (j % 4)}:${String((j * 17) % 60).padStart(2, '0')}`), place: { units: ['BIR'] }, source: 'acute_hospital', agreement: last ? 'none' : 'later', qualifying: r.payer === 'medicare_a' })
  }
  for (let j = 0; j < P.birchAdmitsDischarged; j += 1) {
    const { r, day } = birchNew[j]
    ending.add(r.code)
    discharge(r.code, at(day + 21, '11:15'), { disposition: 'community_home' })
  }

  // Skilled stay ends; the resident moves to long-term care in Cedar.
  const toLongTerm = birchNew.find((entry, j) => j >= P.birchAdmitsDischarged && entry.day <= -29)!
  used.add(toLongTerm.r.code)
  moveRoom('to_long_term', at(-28, '13:30'), () => ({ code: toLongTerm.r.code, units: ['CED', 'WIL'] }), 'Skilled stay ending; transition to long-term care in Cedar.')

  // A Birch resident goes to hospital without a hold, then returns to another Birch bed.
  const noHold = birchBefore[P.birchBeforeDischarged]
  used.add(noHold.code)
  leave('birch_no_hold', { code: noHold.code, start: at(-30, '21:40'), end: at(-26, '16:20'), hold: 'none', ombudsmanCopy: true, returnUnits: ['BIR'] })

  // Hospital leaves with a Medicaid bed hold: Harold and others returned; some are out now.
  const medicaidLt = lt.filter(r => MEDICAID.includes(r.payer) && !r.hospice && r !== ward)
  let pick = 0
  const nextMedicaid = () => {
    const r = medicaidLt[pick++]
    if (!r) throw new Error('Seed plan: not enough Medicaid residents for the leave flows')
    used.add(r.code)
    return r
  }
  used.add('harold')
  leave('harold_hospital', { code: 'harold', start: at(-40, '06:50'), end: at(-36, '15:10'), hold: 'medicaid', ombudsmanCopy: true })
  for (let i = 0; i < P.extraHoldLeaves; i += 1) {
    const r = nextMedicaid()
    const start = -55 + i * 9
    leave(`hold_${i + 1}`, { code: r.code, start: at(start, `${(i * 5) % 12 + 8}:20`), end: at(start + 2 + (i % 4), '14:40'), hold: 'medicaid', ombudsmanCopy: true })
  }
  for (let i = 0; i < P.openLeaves; i += 1) {
    const r = nextMedicaid()
    leave(`open_${i + 1}`, { code: r.code, start: at(i === 0 ? -2 : -1, i === 2 ? '19:05' : '03:35'), hold: 'medicaid', ombudsmanCopy: false })
  }
  // Private-pay hold.
  used.add('clarence')
  leave('clarence_hospital', { code: 'clarence', start: at(-15, '02:15'), end: at(-12, '13:50'), hold: 'private', ombudsmanCopy: true })

  // Deaths: one hospice resident, one long-term resident.
  const hospiceDeath = lt.find(r => r.hospice)!
  ending.add(hospiceDeath.code)
  death(hospiceDeath.code, at(-18, '04:10'), 'Hospice registered nurse, with Dr. Ilse Brandvold notified')
  const medicaidDeath = nextMedicaid()
  ending.add(medicaidDeath.code)
  death(medicaidDeath.code, at(-33, '05:45'), 'Dr. Ilse Brandvold')

  // Facility-initiated discharge with 30 days' written notice and the Ombudsman copy.
  const improved = lt.find(r => r.payer === 'private')!
  ending.add(improved.code)
  const noticeAt = at(-45, '15:00')
  schedule(noticeAt, () => emit('notice', `discharge_${improved.code}`, BROOKS, noticeAt, { stay: ref(key('admit', improved.code), 'stayId'), kind: 'transfer_discharge', method: 'in_person', deliveredAt: noticeAt.toISOString(), acknowledgement: 'signed', copyToOmbudsmanAt: plus(noticeAt, 60).toISOString(), note: 'Health improved; nursing-facility care no longer needed. Discharge to assisted living discussed with the resident; appeal rights explained.' }))
  discharge(improved.code, at(-14, '11:00'), { disposition: 'assisted_living', facility: true })

  // Room changes inside the long-term units.
  moveRoom('roommate', at(-17, '14:00'), () => {
    const code = [...places.where.entries()].find(([c, w]) => w.status === 'in_house' && w.bed && places.bed(w.bed).unit === 'WIL' && !used.has(c) && !ending.has(c) && residents.get(c)!.payer !== 'private')?.[0]
    if (!code) throw new Error('Seed plan: no Willow resident for the roommate change')
    return { code, units: ['WIL', 'CED'] }
  }, 'Roommate compatibility; requested by the resident and representative.')
  let isolationCode = ''
  moveRoom('isolation', at(-11, '10:20'), () => {
    const code = [...places.where.entries()].find(([c, w]) => w.status === 'in_house' && w.bed && places.bed(w.bed).unit === 'ASP' && !used.has(c) && !ending.has(c) && !residents.get(c)!.hospice)?.[0]
    if (!code) throw new Error('Seed plan: no Aspen resident for the isolation move')
    isolationCode = code
    return { code, units: ['ASP'], prefer: ISOLATION_BED }
  }, 'Contact precautions for C. difficile; private isolation room per the infection preventionist.')
  moveRoom('isolation_return', at(-4, '11:00'), () => {
    const original = movedFrom.get('isolation') ?? null
    return { code: isolationCode, units: ['ASP', 'CED', 'WIL'], prefer: original }
  }, 'Precautions discontinued after the infection preventionist\'s review; returning to the original room.')

  // A bed out of service.
  const oosAt = at(-20, '09:40')
  schedule(oosAt, () => {
    const id = places.freeBed(['ASP', 'WIL', 'CED'], null)
    places.bed(id).status = 'out_of_service'
    emit('place_service', 'oos_1', FERRIS, oosAt, { bedId: id, inService: false, reason: 'Bathroom renovation after a water leak; maintenance work order open.' })
  })

  // New long-term admissions: Dolores (Medicaid pending), one with the agreement overdue, one recent.
  const dolores = remember({ code: 'dolores', firstName: 'Dolores', lastName: 'Feinberg-Ruiz', sex: 'female', dateOfBirth: '1940-08-14', payer: 'private', reps: [{ firstName: 'Gabriel', lastName: 'Ruiz', email: familyEmail('Gabriel', 'Ruiz', 9), phone: familyPhone(36), roles: ['healthcare_poa', 'financial_responsible', 'family'], contactPriority: 1 }] })
  admit({ r: dolores, when: at(-21, '13:15'), place: { bed: NAMED_BEDS.dolores }, source: 'community_home', agreement: 'later' })
  const ltLate = remember(newPerson('medicaid_ffs'))
  admit({ r: ltLate, when: at(-12, '14:30'), place: { units: ['CED', 'WIL', 'ASP'] }, source: 'another_nursing_facility', agreement: 'none' })
  const ltRecent = remember(newPerson('medicaid_mco'))
  admit({ r: ltRecent, when: at(-6, '15:45'), place: { units: ['WIL', 'CED', 'ASP'] }, source: 'acute_hospital', agreement: 'later' })

  // Assisted living and memory care moves in the window.
  const alMoveOut = al[5]
  ending.add(alMoveOut.code)
  discharge(alMoveOut.code, at(-12, '10:00'), { disposition: 'community_home' })
  const alDirect = remember(newPerson('private'))
  al.push(alDirect)
  admit({ r: alDirect, when: at(-20, '11:30'), place: { aptUnit: 'MEA', aptType: 'seed_apt_studio' }, source: 'community_home', agreement: 'later' })
  const alMoveOut2 = al[al.length - 2]
  ending.add(alMoveOut2.code)
  discharge(alMoveOut2.code, at(-2, '13:00'), { disposition: 'another_nursing_facility', keepDirty: true })
  const mcNew = remember(newPerson('private', { placementReason: MC_REASONS[2] }))
  mc.push(mcNew)
  admit({ r: mcNew, when: at(-15, '10:40'), place: { aptUnit: 'HAR' }, source: 'assisted_living', agreement: 'later' })

  /* ------------------------------------------------------------- sales */

  const slot = (id: string, startsAt: Date, openedAt: Date) => schedule(openedAt, () => emit('tour_slots', id, PATEL, openedAt, { slots: [{ startsAt: startsAt.toISOString(), minutes: 45, capacity: 2, kind: 'either' }] }))
  const phoneLead = (id: string, when: Date, input: { contactName: string; relationship: string; forWhom: [string, string]; setting: string; message: string; n: number; source?: string; referralSourceId?: string | null }) => {
    const [first, ...rest] = input.contactName.split(' ')
    schedule(when, () => emit('inquiry_phone', id, PATEL, when, { contactName: input.contactName, contactEmail: familyEmail(first, rest.join(''), input.n), contactPhone: familyPhone(input.n), relationship: input.relationship, message: input.message, forWhomFirstName: input.forWhom[0], forWhomLastName: input.forWhom[1], desiredSetting: input.setting, consentToContact: true, source: input.source ?? 'phone', referralSourceId: input.referralSourceId ?? null }))
    return key('inquiry_phone', id)
  }
  const activity = (id: string, lead: string, when: Date, kind: string, summary: string) => schedule(when, () => emit('activity', id, PATEL, when, { lead: ref(lead, 'leadId'), kind, summary, at: when.toISOString() }))
  const tour = (id: string, lead: string, startsAt: Date, bookedAt: Date, outcome: 'completed' | 'no_show' | 'cancelled' | null) => {
    slot(`slot_${id}`, startsAt, plus(bookedAt, -30))
    schedule(bookedAt, () => emit('tour_schedule', id, PATEL, bookedAt, { lead: ref(lead, 'leadId'), slotStartsAt: startsAt.toISOString(), kind: 'in_person', notes: 'Booked by phone.' }))
    if (outcome) {
      const when = outcome === 'cancelled' ? plus(startsAt, -1440) : plus(startsAt, 75)
      schedule(when, () => emit('tour_move', id, PATEL, when, { tour: ref(key('tour_schedule', id), 'tourId'), to: outcome, reason: outcome === 'cancelled' ? 'Family rescheduling after a hospital stay.' : null }))
    }
  }
  const leadMove = (id: string, lead: string, when: Date, to: string, lostReason: string | null = null, note: string | null = null) => schedule(when, () => emit('lead_move', id, PATEL, when, { lead: ref(lead, 'leadId'), to, lostReason, note }))

  // Exit gate (4): inquiry → tour → waitlist → offer (reservation) → accepted → move-in.
  const agnesLead = phoneLead('agnes', at(-40, '10:15'), { contactName: 'Janet Whitfield', relationship: 'Daughter', forWhom: ['Agnes', 'Whitfield'], setting: 'assisted_living', message: 'Mother is 86 and no longer safe living alone after a fall; wants a one-bedroom.', n: 61 })
  activity('agnes_call', agnesLead, at(-40, '10:40'), 'call', 'Discussed care needs, pricing and the one-bedroom waitlist. Tour booked.')
  tour('agnes', agnesLead, at(-35, '14:00'), at(-38, '09:00'), 'completed')
  const agnesWaitlist = key('waitlist_add', 'agnes')
  const wlAt = at(-34, '10:00')
  schedule(wlAt, () => emit('waitlist_add', 'agnes', PATEL, wlAt, { lead: ref(agnesLead, 'leadId'), prospect: ref(agnesLead, 'prospectId'), setting: 'assisted_living', apartmentTypeId: 'seed_apt_one_bed', priorityReason: 'date_order' }))
  leadMove('agnes_waitlisted', agnesLead, plus(wlAt, 5), 'waitlisted', null, 'Deposit waived until a one-bedroom opens.')
  const offerAt = at(-6, '09:30')
  let agnesApt = ''
  schedule(offerAt, () => {
    agnesApt = places.freeApt('MEA', { type: 'seed_apt_one_bed' })
    places.apt(agnesApt).status = 'reserved'
    emit('waitlist_offer', 'agnes', PATEL, offerAt, { entry: ref(agnesWaitlist, 'waitlistEntryId'), apartmentId: agnesApt, hours: 120 })
  })
  const acceptAt = at(-5, '16:00')
  schedule(acceptAt, () => emit('waitlist_resolve', 'agnes', PATEL, acceptAt, { entry: ref(agnesWaitlist, 'waitlistEntryId'), to: 'accepted' }))
  leadMove('agnes_move_in', agnesLead, plus(acceptAt, 10), 'move_in_scheduled', null, 'Move-in set for Thursday morning.')
  const agnes = remember({ code: 'agnes', firstName: 'Agnes', lastName: 'Whitfield', sex: 'female', dateOfBirth: '1940-02-11', payer: 'private', reps: [{ firstName: 'Janet', lastName: 'Whitfield', email: familyEmail('Janet', 'Whitfield', 61), phone: familyPhone(61), roles: ['healthcare_poa', 'financial_responsible', 'family'], contactPriority: 1 }] })
  al.push(agnes)
  const agnesAdmit = at(-3, '10:30')
  schedule(plus(agnesAdmit, -1), () => admit({ r: agnes, when: agnesAdmit, place: { apt: agnesApt }, reserved: true, source: 'community_home', agreement: 'same', prospect: ref(agnesLead, 'prospectId'), reservation: ref(key('waitlist_offer', 'agnes'), 'reservationId') }))

  // Eleanor: hospital referral → review → payer check → accepted with a bed hold → admitted.
  const eleanorRef = key('referral', 'eleanor')
  const refAt = at(-10, '13:20')
  schedule(refAt, () => emit('referral', 'eleanor', PATEL, refAt, { sourceId: 'seed_referral_source_scioto_ridge', firstName: 'Eleanor', lastName: 'Whitcombe', dateOfBirth: '1938-09-21', desiredSetting: 'nursing_facility', expectedPayer: 'medicare_a', clinicalSummary: 'Right hip fracture after a fall at home; ORIF on hospital day 1. Weight bearing as tolerated. Needs PT/OT five days a week, pain management and wound checks.', pasrrLevel1: { completedAt: at(-11, '16:00').toISOString(), result: 'Level I negative: Level II not required.' }, responseHours: 4, receivedAt: refAt.toISOString() }))
  const referralMove = (id: string, refKey: string, when: Date, to: string, extra: Record<string, Json> = {}) => schedule(when, () => emit('referral_move', id, PATEL, when, { referral: ref(refKey, 'referralId'), to, ...extra }))
  referralMove('eleanor_review', eleanorRef, at(-10, '13:50'), 'clinical_review')
  referralMove('eleanor_payer', eleanorRef, at(-10, '14:30'), 'payer_check')
  const eleanorAccept = at(-10, '15:10')
  schedule(eleanorAccept, () => {
    places.bed(NAMED_BEDS.eleanor).status = 'reserved'
    emit('referral_move', 'eleanor_accept', PATEL, eleanorAccept, { referral: ref(eleanorRef, 'referralId'), to: 'accepted', bedId: NAMED_BEDS.eleanor, reservationHours: 48 })
  })
  const eleanor = remember({ code: 'eleanor', firstName: 'Eleanor', lastName: 'Whitcombe', sex: 'female', dateOfBirth: '1938-09-21', payer: 'medicare_a', reps: [{ firstName: 'Catherine', lastName: 'Whitcombe-Shaw', email: familyEmail('Catherine', 'WhitcombeShaw', 2), phone: familyPhone(9), roles: ['healthcare_poa', 'family'], contactPriority: 1 }, { firstName: 'Robert', lastName: 'Whitcombe', email: familyEmail('Robert', 'Whitcombe', 4), phone: familyPhone(10), roles: ['financial_responsible', 'family'], contactPriority: 2 }] })
  admit({ r: eleanor, when: at(-9, '15:30'), place: { bed: NAMED_BEDS.eleanor }, reserved: true, source: 'acute_hospital', agreement: 'later', qualifying: true, prospect: ref(eleanorRef, 'prospectId'), reservation: ref(key('referral_move', 'eleanor_accept'), 'reservationId') })

  // A referral accepted now, holding a Birch bed for tomorrow's admission.
  const theoRef = key('referral', 'theodore')
  const theoAt = at(-1, '11:05')
  schedule(theoAt, () => emit('referral', 'theodore', PATEL, theoAt, { sourceId: 'seed_referral_source_alum_creek', firstName: 'Theodore', lastName: 'Brannigan', dateOfBirth: '1944-04-03', desiredSetting: 'nursing_facility', expectedPayer: 'medicare_advantage', clinicalSummary: 'Community-acquired pneumonia with deconditioning; on oxygen 2 L, weaning. Needs therapy and IV antibiotic completion.', pasrrLevel1: { completedAt: at(-2, '17:30').toISOString(), result: 'Level I negative: Level II not required.' }, responseHours: 4, receivedAt: theoAt.toISOString() }))
  referralMove('theodore_review', theoRef, at(-1, '12:00'), 'clinical_review')
  referralMove('theodore_payer', theoRef, at(-1, '13:30'), 'payer_check')
  schedule(T, () => {
    const id = places.freeBed(['BIR'], 'male')
    places.bed(id).status = 'reserved'
    emit('referral_move', 'theodore_accept', PATEL, T, { referral: ref(theoRef, 'referralId'), to: 'accepted', bedId: id, reservationHours: 72 })
  })

  // Long-term waitlist with a Cedar bed offered now.
  const fischerLead = phoneLead('nf_waitlist', at(-25, '11:30'), { contactName: 'Brian Lindgren', relationship: 'Son', forWhom: ['Gerald', 'Lindgren'], setting: 'nursing_facility', message: 'Father has Parkinson\'s disease; home care is no longer enough. Medicaid application filed.', n: 63 })
  const nfWlAt = at(-21, '10:00')
  schedule(nfWlAt, () => emit('waitlist_add', 'nf_waitlist', PATEL, nfWlAt, { lead: ref(fischerLead, 'leadId'), prospect: ref(fischerLead, 'prospectId'), setting: 'nursing_facility', apartmentTypeId: null, priorityReason: 'date_order' }))
  leadMove('nf_waitlisted', fischerLead, plus(nfWlAt, 5), 'waitlisted')
  schedule(T, () => {
    const id = places.freeBed(['CED', 'WIL', 'ASP'], 'male')
    places.bed(id).status = 'reserved'
    emit('waitlist_offer', 'nf_waitlist', PATEL, T, { entry: ref(key('waitlist_add', 'nf_waitlist'), 'waitlistEntryId'), bedId: id, hours: 72 })
  })

  if (P.fullSales) {
    // Memory care waitlist joined on the website; a suite offered now.
    const mcWlAt = at(-14, '20:12')
    schedule(mcWlAt, () => emit('waitlist_web', 'mc_web', PUBLIC, mcWlAt, { communitySlug: COMMUNITY.slug, contactName: 'Rachel Sandoval', contactEmail: familyEmail('Rachel', 'Sandoval', 64), contactPhone: familyPhone(64), relationship: 'Daughter', message: 'Dad was diagnosed with Alzheimer\'s last year and has started wandering at night.', forWhomFirstName: 'Ernesto', forWhomLastName: 'Sandoval', setting: 'memory_care', apartmentTypeId: 'seed_apt_mc_suite', desiredMoveIn: date(10), consentToContact: true, website: '' }))
    schedule(T, () => {
      const id = places.freeApt('HAR')
      places.apt(id).status = 'reserved'
      emit('waitlist_offer', 'mc_web', PATEL, T, { entry: { $ref: key('waitlist_web', 'mc_web'), field: 'waitlistEntryId' }, apartmentId: id, hours: 96 })
    })

    // Open referrals.
    const recvAt = at(-1, '16:40')
    schedule(recvAt, () => emit('referral', 'open_agency', PATEL, recvAt, { sourceId: 'seed_referral_source_buckeye_placement', firstName: 'Lorraine', lastName: 'Esposito', dateOfBirth: '1942-12-12', desiredSetting: 'nursing_facility', expectedPayer: 'medicaid', clinicalSummary: 'Long-term placement: advanced COPD, needs two-person transfers. Medicaid active.', pasrrLevel1: { completedAt: at(-3, '12:00').toISOString(), result: 'Level I negative: Level II not required.' }, responseHours: 24, receivedAt: recvAt.toISOString() }))
    const recv2 = at(-1, '18:10')
    schedule(recv2, () => emit('referral', 'open_hospital', PATEL, recv2, { sourceId: 'seed_referral_source_scioto_ridge', firstName: 'Vernon', lastName: 'Quarles', dateOfBirth: '1946-06-28', desiredSetting: 'nursing_facility', expectedPayer: 'medicare_a', clinicalSummary: 'Left total knee replacement, uncomplicated. Discharge expected tomorrow; needs short-term rehab.', pasrrLevel1: { completedAt: at(-1, '15:00').toISOString(), result: 'Level I negative: Level II not required.' }, responseHours: 4, receivedAt: recv2.toISOString() }))
    const reviewRef = at(-2, '09:25')
    schedule(reviewRef, () => emit('referral', 'in_review', PATEL, reviewRef, { sourceId: 'seed_referral_source_okafor_im', firstName: 'Irene', lastName: 'Albrecht', dateOfBirth: '1936-10-05', desiredSetting: 'nursing_facility', expectedPayer: 'private_pay', clinicalSummary: 'Progressive weakness and weight loss at home; family requests long-term care.', pasrrLevel1: null, responseHours: 48, receivedAt: reviewRef.toISOString() }))
    referralMove('in_review_move', key('referral', 'in_review'), at(-2, '11:00'), 'clinical_review')
    const declAt = at(-20, '10:05')
    schedule(declAt, () => emit('referral', 'declined', PATEL, declAt, { sourceId: 'seed_referral_source_alum_creek', firstName: 'Floyd', lastName: 'Greer', dateOfBirth: '1945-01-17', desiredSetting: 'nursing_facility', expectedPayer: 'medicare_a', clinicalSummary: 'Respiratory failure; tracheostomy with ventilator dependence.', pasrrLevel1: null, responseHours: 4, receivedAt: declAt.toISOString() }))
    referralMove('declined_review', key('referral', 'declined'), at(-20, '10:30'), 'clinical_review')
    referralMove('declined_move', key('referral', 'declined'), at(-20, '11:10'), 'declined', { declineReason: 'clinical_needs' })

    // Website inquiries from the last few days, still new.
    const web = [
      { id: 'web_1', day: -3, time: '21:14', name: 'Heather Ulrich', forWhom: ['Mildred', 'Ulrich'], setting: 'assisted_living', message: 'Looking for assisted living for my mother, who needs help with medications and bathing.' },
      { id: 'web_2', day: -2, time: '07:42', name: 'Scott Brennan', forWhom: ['Arthur', 'Brennan'], setting: 'nursing_facility', message: 'My father needs a short rehab stay after knee surgery next month. Do you take Medicare Advantage?' },
      { id: 'web_3', day: -2, time: '19:30', name: 'Nicole Haddad', forWhom: ['Helen', 'Haddad'], setting: 'independent_living', message: 'Interested in an independent one-bedroom. Are pets allowed?' },
      { id: 'web_4', day: -1, time: '12:05', name: 'Douglas Pellegrino', forWhom: ['Ethel', 'Pellegrino'], setting: 'memory_care', message: 'Mom has dementia and is getting lost. What does memory care cost?' },
    ]
    web.forEach((w, i) => {
      const when = at(w.day, w.time)
      const [first, ...rest] = w.name.split(' ')
      schedule(when, () => emit('inquiry_web', w.id, PUBLIC, when, { communitySlug: COMMUNITY.slug, contactName: w.name, contactEmail: familyEmail(first, rest.join(''), 70 + i), contactPhone: familyPhone(70 + i), relationship: 'Family', message: w.message, forWhomFirstName: w.forWhom[0], forWhomLastName: w.forWhom[1], desiredSetting: w.setting, consentToContact: true, website: '' }))
    })

    // Phone leads at each stage.
    const contacted = [
      ['call_1', -12, 'Karen Zielinski', ['Doris', 'Zielinski'], 'assisted_living', 'Asked about respite stays while the family travels.'],
      ['call_2', -9, 'Michael Rinaldi', ['Leonard', 'Rinaldi'], 'nursing_facility', 'Father on hospice at home; asked about hospice in a nursing home.'],
      ['call_3', -7, 'Angela Coleman', ['Bernice', 'Coleman'], 'memory_care', 'Mother with Lewy body dementia; asked about staff training.'],
      ['call_4', -5, 'Kevin Dawkins', ['Earl', 'Dawkins'], 'independent_living', 'Couple selling their house in spring; wants a waitlist position.'],
      ['call_5', -4, 'Denise Fairbanks', ['Virginia', 'Fairbanks'], 'assisted_living', 'Price comparison with two other communities.'],
    ] as const
    contacted.forEach(([id, day, name, forWhom, setting, message], i) => {
      const lead = phoneLead(id, at(day, '11:20'), { contactName: name, relationship: 'Son or daughter', forWhom: [forWhom[0], forWhom[1]], setting, message, n: 80 + i })
      activity(`${id}_email`, lead, at(day, '15:05'), 'email', 'Sent the brochure, pricing sheet and the dining menu.')
    })

    // Upcoming tours in the next two weeks (slots open now).
    const futureSlots: Json[] = []
    for (let d = 1; d <= 14; d += 1) {
      const day = date(d)
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
      if (weekday === 0) continue
      for (const time of weekday === 6 ? ['11:00'] : ['10:00', '14:00']) futureSlots.push({ startsAt: zonedInstant(tz, day, time).toISOString(), minutes: 45, capacity: 2, kind: 'either' })
    }
    schedule(T, () => emit('tour_slots', 'next_two_weeks', PATEL, T, { slots: futureSlots.slice(0, 60) }))
    const upcoming = [
      ['tour_1', -6, 'Steven Ingram', ['Howard', 'Ingram'], 'assisted_living', 0],
      ['tour_2', -4, 'Julie Thibodeaux', ['Lorraine', 'Thibodeaux'], 'memory_care', 3],
      ['tour_3', -3, 'Gregory Jessup', ['Raymond', 'Jessup'], 'independent_living', 6],
    ] as const
    upcoming.forEach(([id, day, name, forWhom, setting, slotIndex], i) => {
      const lead = phoneLead(id, at(day, '10:05'), { contactName: name, relationship: 'Family', forWhom: [forWhom[0], forWhom[1]], setting, message: 'Wants to see the apartments and have lunch in the dining room.', n: 90 + i })
      const s = futureSlots[slotIndex] as { startsAt: string }
      schedule(T, () => emit('tour_schedule', id, PATEL, T, { lead: ref(lead, 'leadId'), slotStartsAt: s.startsAt, kind: 'in_person', notes: 'Lunch in the bistro after the tour.' }))
    })
    // A tour requested on the website and confirmed by the sales team.
    const webTourSlot = futureSlots[4] as { startsAt: string }
    schedule(T, () => emit('tour_request_web', 'web_tour', PUBLIC, T, { communitySlug: COMMUNITY.slug, slotStartsAt: webTourSlot.startsAt, kind: 'in_person', contactName: 'Tamara Wexler', contactEmail: familyEmail('Tamara', 'Wexler', 95), contactPhone: familyPhone(95), notes: 'Coming with my brother.', consentToContact: true }))
    schedule(T, () => emit('tour_move', 'web_tour_confirm', PATEL, T, { tour: ref(key('tour_request_web', 'web_tour'), 'tourId'), to: 'confirmed', reason: null }))

    // Toured, no-show, cancelled and lost leads.
    const toured = phoneLead('toured_1', at(-19, '09:40'), { contactName: 'Lisa Nakamura', relationship: 'Daughter', forWhom: ['Margaret', 'Nakamura'], setting: 'assisted_living', message: 'Mother is moving from Dayton to be closer to family.', n: 101 })
    tour('toured_1', toured, at(-16, '10:00'), at(-18, '14:00'), 'completed')
    activity('toured_1_note', toured, at(-16, '11:30'), 'note', 'Loved the courtyard studio; wants to compare with one more community before deciding.')
    const toured2 = phoneLead('toured_2', at(-12, '13:00'), { contactName: 'Robert Langford', relationship: 'Husband', forWhom: ['Shirley', 'Langford'], setting: 'memory_care', message: 'Wife\'s dementia is progressing; I can no longer manage at night.', n: 102 })
    tour('toured_2', toured2, at(-9, '14:00'), at(-11, '09:10'), 'completed')
    const noShow = phoneLead('no_show', at(-14, '15:20'), { contactName: 'Erin McAllister', relationship: 'Niece', forWhom: ['Irene', 'McAllister'], setting: 'assisted_living', message: 'Aunt lives alone in Westerville.', n: 103 })
    tour('no_show', noShow, at(-11, '10:00'), at(-13, '10:30'), 'no_show')
    leadMove('no_show_lost', noShow, at(-8, '09:00'), 'lost', 'no_response', 'Three calls and an email without a reply.')
    const cancelled = phoneLead('cancelled', at(-10, '10:00'), { contactName: 'Timothy Vandermeer', relationship: 'Son', forWhom: ['Lloyd', 'Vandermeer'], setting: 'nursing_facility', message: 'Father in hospital; planning ahead for long-term care.', n: 104 })
    tour('cancelled', cancelled, at(-5, '14:00'), at(-9, '11:00'), 'cancelled')
    const lostCompetitor = phoneLead('lost_competitor', at(-48, '10:30'), { contactName: 'Monica Ostrander', relationship: 'Daughter', forWhom: ['Evelyn', 'Ostrander'], setting: 'assisted_living', message: 'Comparing three communities.', n: 105 })
    tour('lost_competitor', lostCompetitor, at(-44, '10:00'), at(-46, '15:00'), 'completed')
    leadMove('lost_competitor_lost', lostCompetitor, at(-38, '16:00'), 'lost', 'chose_competitor', 'Chose a community closer to her son in Dublin.')
    const lostCost = phoneLead('lost_cost', at(-31, '14:45'), { contactName: 'Jeffrey Yoder', relationship: 'Son', forWhom: ['Eugene', 'Yoder'], setting: 'independent_living', message: 'Budget question.', n: 106 })
    leadMove('lost_cost_lost', lostCost, at(-29, '10:00'), 'lost', 'cost', 'Over budget; staying in their condo with home care for now.')
    const nurture = phoneLead('nurture', at(-27, '09:15'), { contactName: 'Susan Kaminski', relationship: 'Daughter', forWhom: ['Gladys', 'Kaminski'], setting: 'assisted_living', message: 'Not ready yet; maybe next year.', n: 107 })
    leadMove('nurture_move', nurture, at(-27, '09:40'), 'nurture', null, 'Follow up in the spring.')
  }

  /* -------------------------------------------------------------- portal */

  // One portal login per email: a spouse sharing a representative is invited once.
  const invitedEmails = new Set<string>()
  const portalCandidates = [...residents.values()].filter(r => {
    const email = r.reps[0]?.email
    const admitted = admittedAt.get(r.code)
    if (ending.has(r.code) || r.selfRepresented || !email || !admitted || admitted.getTime() > at(-4, '00:00').getTime() || invitedEmails.has(email)) return false
    invitedEmails.add(email)
    return true
  })
  const stride = Math.max(1, Math.floor(portalCandidates.length / P.portalAccounts))
  const portal = portalCandidates.filter((_, i) => i % stride === 0).slice(0, P.portalAccounts)
  portal.forEach((r, i) => {
    // Invited a day or more after admission, never before; the last few invitations are still open.
    const admittedDay = Math.ceil((admittedAt.get(r.code)!.getTime() - T.getTime()) / 86_400_000) - 1
    let day = Math.max(-50 + Math.floor((i * 44) / Math.max(1, portal.length)), admittedDay + 2)
    const pending = i >= portal.length - Math.max(1, Math.round(P.portalAccounts / 8))
    if (pending || day > -2) day = -2
    const inviteAt = at(day, '10:00')
    const rep = r.reps[0]
    schedule(inviteAt, () => emit('invite', r.code, BROOKS, inviteAt, { resident: ref(key('admit', r.code), 'residentId'), priority: rep.contactPriority }))
    if (pending) return
    const acceptAt = at(day, '20:30')
    schedule(acceptAt, () => emit('accept', r.code, PUBLIC, acceptAt, { account: ref(key('invite', r.code), 'accountId') }))
    const roles = rep.roles
    const scopes = roles.includes('guardian') ? ['updates', 'calendar', 'care_summary', 'documents', 'statements', 'trust_balance']
      : roles.includes('healthcare_poa') && roles.includes('financial_responsible') ? ['updates', 'calendar', 'documents', 'care_summary', 'statements']
        : roles.includes('healthcare_poa') ? ['updates', 'calendar', 'documents', 'care_summary'] : ['updates', 'calendar', 'statements', 'payments']
    const proposeAt = at(day + 1, '09:15')
    schedule(proposeAt, () => emit('scope_propose', r.code, PATEL, proposeAt, { resident: ref(key('admit', r.code), 'residentId'), priority: rep.contactPriority, scopes }))
    const awaiting = i >= portal.length - Math.max(1, Math.round(P.portalAccounts / 10)) - Math.max(1, Math.round(P.portalAccounts / 8))
    if (!awaiting && day + 1 <= -1) {
      const grantAt = at(day + 1, '13:40')
      schedule(grantAt, () => emit('scope_grant', r.code, BROOKS, grantAt, { proposals: ref(key('scope_propose', r.code), 'grantIds') }))
    }
  })

  /* ---------------------------------------------------------- break-glass */

  const bgAt = at(-6, '22:40')
  schedule(bgAt, () => {
    const code = [...places.where.entries()].find(([c, w]) => w.status === 'in_house' && w.bed && places.bed(w.bed).unit === 'WIL' && !ending.has(c))?.[0]
    if (!code) throw new Error('Seed plan: no Willow resident for break-glass')
    emit('break_glass_open', 'night_cover', RAMOS, bgAt, { resident: ref(key('admit', code), 'residentId'), reason: 'coverage_gap', note: 'Covering Willow overnight after a call-off; needed the medication history for a resident with chest pain.', hours: 2 })
    const endAt = plus(bgAt, 50)
    schedule(endAt, () => emit('break_glass_end', 'night_cover', RAMOS, endAt, { grant: ref(key('break_glass_open', 'night_cover'), 'grantId') }))
    const reviewAt = at(-5, '10:15')
    schedule(reviewAt, () => emit('break_glass_review', 'night_cover', FERREIRA_KAHN, reviewAt, { grant: ref(key('break_glass_open', 'night_cover'), 'grantId'), outcome: 'reviewed_ok', note: 'Matches the staffing log: Willow call-off that night. Access limited to the medication record. Appropriate.' }))
  })
  const bg2 = at(-2, '05:20')
  schedule(bg2, () => {
    const code = [...places.where.entries()].find(([c, w]) => w.status === 'in_house' && w.bed && places.bed(w.bed).unit === 'CED' && !ending.has(c))?.[0]
    if (!code) throw new Error('Seed plan: no Cedar resident for break-glass')
    emit('break_glass_open', 'rapid_response', LINDQVIST, bg2, { resident: ref(key('admit', code), 'residentId'), reason: 'emergency_care', note: 'Rapid response on Cedar; reviewed the advance directives and code status while the charge nurse called 911.', hours: 1 })
    const endAt = plus(bg2, 35)
    schedule(endAt, () => emit('break_glass_end', 'rapid_response', LINDQVIST, endAt, { grant: ref(key('break_glass_open', 'rapid_response'), 'grantId') }))
  })

  /* ---------------------------------------------------- midnight census */

  for (let d = -(P.signOffDays + 1); d <= -2; d += 1) {
    const when = at(d + 1, '09:30')
    schedule(when, () => emit('sign_off', date(d), LINDQVIST, when, { date: date(d), note: d === -9 ? 'Reconciled with the Birch hospital transfer log.' : null }))
  }
  schedule(T, () => emit('snapshot', date(-1), SCHEDULER, T, { date: date(-1) }))
  schedule(T, () => emit('clock_sweep', 'anchor', SCHEDULER, T, {}))
  schedule(T, () => emit('finish', 'anchor', PATEL, T, {}))

  /* ------------------------------------------------------------------ run */

  for (;;) {
    if (!acts.length) break
    let next = 0
    for (let i = 1; i < acts.length; i += 1) if (acts[i].at.getTime() < acts[next].at.getTime() || (acts[i].at.getTime() === acts[next].at.getTime() && acts[i].seq < acts[next].seq)) next = i
    const [act] = acts.splice(next, 1)
    act.run()
  }

  const keys = new Set<string>()
  for (const step of steps) {
    if (keys.has(step.key)) throw new Error(`Seed plan: duplicate step ${step.key}`)
    keys.add(step.key)
  }

  const present = [...places.where.entries()].filter(([, w]) => w.status !== 'ended')
  const beds = [...places.beds.values()]
  const count = (status: string) => beds.filter(bed => bed.status === status).length
  const residential: PlanSummary['residential'] = {}
  for (const unit of RESIDENTIAL_UNITS) {
    const apts = [...places.apts.values()].filter(apt => apt.unit === unit.code)
    residential[unit.code] = { residents: apts.reduce((n, apt) => n + apt.occupants.length, 0), occupied: apts.filter(a => a.status === 'occupied').length, reserved: apts.filter(a => a.status === 'reserved').length, turnover: apts.filter(a => a.status === 'turnover').length, available: apts.filter(a => a.status === 'available').length }
  }
  const payers: Record<string, number> = {}
  let hospice = 0
  for (const [code, w] of present) {
    if (!w.bed && !w.held) continue
    const r = residents.get(code)!
    payers[r.payer] = (payers[r.payer] ?? 0) + 1
    if (r.hospice) hospice += 1
  }
  return {
    steps,
    summary: {
      residentsPresent: present.length,
      nursing: { occupied: count('occupied'), held: count('held'), reserved: count('reserved'), cleaning: count('cleaning'), outOfService: count('out_of_service'), available: count('available') },
      residential, payers, hospice, portalAccounts: portal.length, steps: steps.length,
    },
  }
}
