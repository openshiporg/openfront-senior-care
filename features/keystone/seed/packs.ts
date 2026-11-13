/**
 * Jurisdiction packs as versioned configuration (BUILD-PLAN §1A "Packs", SCHEMA §12.1). Every
 * obligation carries its citation (`ruleRef`) and a `verifyNote` that the dashboard shows until
 * counsel confirms it. Phase-1 flows use the active ones; the rest load dormant and start when
 * their phase ships. State rules are data here, never code.
 */

export type DueRule =
  | { kind: 'duration'; hours: number }
  | { kind: 'calendar_days'; days: number }
  | { kind: 'working_days'; days: number }
  | { kind: 'at_start' }
  | { kind: 'operator_setting_hours'; setting: 'bedHoldNoticeGraceHours' }
  | { kind: 'published_dates'; dates: string[] }

export type ObligationSeed = {
  code: string
  description: string
  appliesTo: { settings?: string[]; payerKinds?: string[] }
  startFact: string
  dueRule: DueRule
  evidenceTypes: string[]
  waivable?: boolean
  ruleRef: string
  verifyNote: string
  ownerRole: string
  active: boolean
}

export type PackSeed = { id: string; code: string; name: string; packVersion: string; effectiveFrom: string; sourceNote: string; rules: Record<string, unknown>; obligations: ObligationSeed[] }

const NF = ['nursing_facility']

export const US_FED_PACK: PackSeed = {
  id: 'seed_pack_us_fed',
  code: 'US-FED',
  name: 'United States federal requirements for long-term care facilities (42 CFR Part 483)',
  packVersion: '2026.11',
  effectiveFrom: '2026-01-01',
  sourceNote: 'Fetched 2026-11-07 from law.cornell.edu (42 CFR 483.15) and opm.gov (federal holidays). Values marked (verify) need counsel review before production use.',
  rules: {
    noticeOfTransferDischargeDays: { value: 30, ruleRef: '42 CFR 483.15(c)(4)(i)', verifyNote: 'Fetched 2026-11-07. Exceptions in 483.15(c)(4)(ii)(A)-(E) allow notice "as soon as practicable".' },
    ombudsmanCopy: { value: true, ruleRef: '42 CFR 483.15(c)(3)(i)', verifyNote: 'A copy of the transfer/discharge notice goes to the Office of the State LTC Ombudsman.' },
    bedHoldNoticeAtTransfer: { value: true, ruleRef: '42 CFR 483.15(d)(2)', verifyNote: 'Fetched 2026-11-07: the text says "at the time of transfer" with no fixed hour window. The grace window is OperatorSettings.bedHoldNoticeGraceHours (operator policy, verify with counsel).' },
  },
  obligations: [
    { code: 'BEDHOLD_AT_TRANSFER', description: 'Give the resident or representative written bed-hold notice at the time of transfer to a hospital or on therapeutic leave.', appliesTo: { settings: NF }, startFact: 'census.leave_start', dueRule: { kind: 'operator_setting_hours', setting: 'bedHoldNoticeGraceHours' }, evidenceTypes: ['notice_delivery:bed_hold_at_transfer'], ruleRef: '42 CFR 483.15(d)(2)', verifyNote: 'Regulation says "at the time of transfer"; the due window equals OperatorSettings.bedHoldNoticeGraceHours (operator policy, verify with counsel).', ownerRole: 'Charge Nurse (RN/LPN)', active: true },
    { code: 'BEDHOLD_POLICY_BEFORE_TRANSFER', description: 'Bed-hold policy given before transfer (at admission and again in advance of a planned transfer).', appliesTo: { settings: NF }, startFact: 'census.admission', dueRule: { kind: 'at_start' }, evidenceTypes: ['notice_delivery:bed_hold_policy'], ruleRef: '42 CFR 483.15(d)(1)', verifyNote: 'Fetched 2026-11-07.', ownerRole: 'Admissions', active: true },
    { code: 'DISCHARGE_NOTICE_30D', description: 'Written transfer/discharge notice at least 30 days before a facility-initiated discharge, with a copy to the Ombudsman.', appliesTo: { settings: NF }, startFact: 'census.discharge_planned', dueRule: { kind: 'calendar_days', days: 30 }, evidenceTypes: ['notice_delivery:transfer_discharge', 'ombudsman_copy'], ruleRef: '42 CFR 483.15(c)(3)-(4)', verifyNote: 'Fetched 2026-11-07. Exceptions (c)(4)(ii)(A)-(E) shorten the notice to "as soon as practicable".', ownerRole: 'Social Services', active: true },
    { code: 'TRANSFER_NOTICE_OMBUDSMAN', description: 'Copy of the transfer or discharge notice for a facility-initiated transfer or discharge sent to the Long-Term Care Ombudsman.', appliesTo: { settings: NF }, startFact: 'census.facility_initiated_transfer', dueRule: { kind: 'calendar_days', days: 30 }, evidenceTypes: ['ombudsman_copy'], ruleRef: '42 CFR 483.15(c)(3)(i)', verifyNote: 'CMS guidance allows a monthly list for emergency transfers (verify current State Operations Manual Appendix PP).', ownerRole: 'Social Services', active: true },
    { code: 'PRIVACY_NOTICE_AT_ADMISSION', description: 'Notice of privacy practices given at admission.', appliesTo: {}, startFact: 'census.admission', dueRule: { kind: 'at_start' }, evidenceTypes: ['notice_delivery:privacy_practices'], ruleRef: '45 CFR 164.520', verifyNote: 'Verify with the privacy officer.', ownerRole: 'Admissions', active: true },
    { code: 'ADMISSION_AGREEMENT', description: 'Signed admission agreement on file.', appliesTo: {}, startFact: 'census.admission', dueRule: { kind: 'calendar_days', days: 7 }, evidenceTypes: ['document:admission_agreement'], waivable: true, ruleRef: 'Operator policy; 42 CFR 483.15(a) limits terms', verifyNote: 'Operator policy window (verify).', ownerRole: 'Admissions', active: true },
    { code: 'CP_BASELINE_48H', description: 'Baseline care plan within 48 hours of admission.', appliesTo: { settings: NF }, startFact: 'census.admission', dueRule: { kind: 'duration', hours: 48 }, evidenceTypes: ['care_plan:baseline'], ruleRef: '42 CFR 483.21(a)', verifyNote: 'Phase 2.', ownerRole: 'Director of Nursing', active: false },
    { code: 'CP_COMPREHENSIVE_7D', description: 'Comprehensive care plan within 7 days after the comprehensive assessment.', appliesTo: { settings: NF }, startFact: 'mds.admission_completed', dueRule: { kind: 'calendar_days', days: 7 }, evidenceTypes: ['care_plan:comprehensive'], ruleRef: '42 CFR 483.21(b)(2)(i)', verifyNote: 'Phase 2.', ownerRole: 'MDS Coordinator', active: false },
    { code: 'F609_INITIAL_2H', description: 'Report alleged abuse or serious bodily injury within 2 hours.', appliesTo: { settings: NF }, startFact: 'incident.alleged_abuse_sbi', dueRule: { kind: 'duration', hours: 2 }, evidenceTypes: ['submission:state_incident'], ruleRef: '42 CFR 483.12(c)(1)', verifyNote: 'Phase 2.', ownerRole: 'Executive Director', active: false },
    { code: 'F609_INITIAL_24H', description: 'Report other allegations within 24 hours.', appliesTo: { settings: NF }, startFact: 'incident.alleged_other', dueRule: { kind: 'duration', hours: 24 }, evidenceTypes: ['submission:state_incident'], ruleRef: '42 CFR 483.12(c)(1)', verifyNote: 'Phase 2.', ownerRole: 'Executive Director', active: false },
    { code: 'F609_INVESTIGATION_5WD', description: 'Investigation results within 5 working days.', appliesTo: { settings: NF }, startFact: 'incident.reported', dueRule: { kind: 'working_days', days: 5 }, evidenceTypes: ['submission:state_incident_followup'], ruleRef: '42 CFR 483.12(c)(4)', verifyNote: 'Phase 2.', ownerRole: 'Executive Director', active: false },
    { code: 'MDS_ADMISSION_D14', description: 'Admission MDS completed by day 14.', appliesTo: { settings: NF }, startFact: 'census.admission', dueRule: { kind: 'calendar_days', days: 13 }, evidenceTypes: ['mds:admission'], ruleRef: '42 CFR 483.20(b)(2)(i)', verifyNote: 'Phase 4.', ownerRole: 'MDS Coordinator', active: false },
    { code: 'MDS_SUBMIT_14D', description: 'MDS transmitted within 14 days after completion.', appliesTo: { settings: NF }, startFact: 'mds.completed', dueRule: { kind: 'calendar_days', days: 14 }, evidenceTypes: ['submission:mds_batch'], ruleRef: '42 CFR 483.20(f)(3)', verifyNote: 'Phase 4.', ownerRole: 'MDS Coordinator', active: false },
    { code: 'NOMNC_2D', description: 'Notice of Medicare Non-Coverage at least 2 days before covered services end.', appliesTo: { settings: NF, payerKinds: ['medicare_a', 'medicare_advantage'] }, startFact: 'coverage.ending_planned', dueRule: { kind: 'calendar_days', days: 2 }, evidenceTypes: ['notice_delivery:nomnc'], ruleRef: '42 CFR 405.1200', verifyNote: 'Phase 4.', ownerRole: 'Business Office', active: false },
    { code: 'PBJ_QUARTER', description: 'Payroll-Based Journal staffing data submitted by the quarterly deadline.', appliesTo: { settings: NF }, startFact: 'quarter.closed', dueRule: { kind: 'published_dates', dates: ['2026-11-14', '2027-02-14', '2027-05-15', '2027-08-14'] }, evidenceTypes: ['submission:pbj_quarter'], ruleRef: '42 CFR 483.70(p)', verifyNote: 'Deadlines are 45 days after quarter end (verify CMS PBJ page).', ownerRole: 'Human Resources', active: false },
    { code: 'NHSN_WEEKLY_RPV', description: 'Weekly respiratory pathogen and vaccination reporting to NHSN.', appliesTo: { settings: NF }, startFact: 'week.closed', dueRule: { kind: 'calendar_days', days: 7 }, evidenceTypes: ['submission:nhsn_weekly'], ruleRef: '42 CFR 483.80(g)', verifyNote: 'Phase 4 (verify the current reporting scope).', ownerRole: 'Infection Preventionist', active: false },
    { code: 'TRUST_CONVEYANCE_30D', description: 'Convey trust funds and a final accounting within 30 days of death.', appliesTo: {}, startFact: 'census.death', dueRule: { kind: 'calendar_days', days: 30 }, evidenceTypes: ['trust:conveyance'], ruleRef: '42 CFR 483.10(f)(10)(v)', verifyNote: 'Phase 3.', ownerRole: 'Trust Officer', active: false },
    { code: 'TRUST_QUARTERLY_STATEMENT', description: 'Quarterly trust statement to the resident or representative.', appliesTo: {}, startFact: 'quarter.closed', dueRule: { kind: 'calendar_days', days: 30 }, evidenceTypes: ['notice_delivery:trust_quarterly'], ruleRef: '42 CFR 483.10(f)(10)(iii)', verifyNote: 'Phase 3.', ownerRole: 'Trust Officer', active: false },
    { code: 'SSI_THRESHOLD_NOTICE', description: 'Notify when the trust balance comes within $200 of the SSI resource limit.', appliesTo: { payerKinds: ['medicaid_ffs', 'medicaid_mco'] }, startFact: 'trust.threshold', dueRule: { kind: 'calendar_days', days: 7 }, evidenceTypes: ['notice_delivery:ssi_threshold'], ruleRef: '42 CFR 483.10(f)(10)(iv)', verifyNote: 'Phase 3.', ownerRole: 'Trust Officer', active: false },
    { code: 'PHYSICIAN_VISIT_30_60', description: 'Physician visits every 30 days for the first 90 days, then every 60 days.', appliesTo: { settings: NF }, startFact: 'census.admission', dueRule: { kind: 'calendar_days', days: 30 }, evidenceTypes: ['physician_visit'], ruleRef: '42 CFR 483.30(c)', verifyNote: 'Phase 2 (10-day grace per 483.30(c)(2)).', ownerRole: 'Director of Nursing', active: false },
    { code: 'POC_10D', description: 'Plan of correction within 10 calendar days of receiving the CMS-2567.', appliesTo: { settings: NF }, startFact: 'survey.statement_received', dueRule: { kind: 'calendar_days', days: 10 }, evidenceTypes: ['plan_of_correction'], ruleRef: '42 CFR 488.402(d)', verifyNote: 'Phase 6.', ownerRole: 'Executive Director', active: false },
  ],
}

/** Phase 3 billing rules, kept as data in the Ohio pack (verify with counsel before go-live). Merged into an existing pack by seedBilling. */
export const OH_BILLING_RULES = {
  careLevelIncreaseNoticeDays: { value: 30, ruleRef: 'Ohio Adm. Code 3701-16 / resident contract (verify)', verifyNote: 'An increase in care level bills only after this many days of written notice; a decrease applies at once.' },
  depositRefund: {
    value: {
      security: { refundable: true, refundWindowDays: null, forfeitable: true },
      pet: { refundable: true, refundWindowDays: null, forfeitable: true },
      reservation: { refundable: true, refundWindowDays: 30, forfeitable: true },
      community_fee: { refundable: true, refundWindowDays: 30, forfeitable: false },
      other: { refundable: true, refundWindowDays: null, forfeitable: false },
    },
    ruleRef: 'Resident contract and Ohio Adm. Code 3701-16 (verify)',
    verifyNote: 'refundWindowDays counts from the day the deposit was received; null means no window. forfeitable means the operator may keep it (needs a second approver).',
  },
  trustResourceThreshold: {
    value: { limitMinor: '200000', marginMinor: '20000' },
    ruleRef: '20 CFR 416.1205 (SSI resource limit $2,000 for an individual); Ohio Adm. Code 5160:1-3-05.1; 42 CFR 483.10(f)(10)(v)(B) (verify)',
    verifyNote: 'A Medicaid resident whose trust funds reach the limit less the margin ($200 below) gets the notice; above the limit is over. Amounts are minor units.',
  },
  trustAuthorisationApproval: {
    value: { overMinor: '50000' },
    ruleRef: 'Operator policy (maker-checker on resident funds; verify)',
    verifyNote: 'A trust authorisation with no per-withdrawal limit, or a limit above this many minor units, needs a second person with trust approval before it is active.',
  },
} as const

export const US_OH_PACK: PackSeed = {
  id: 'seed_pack_us_oh',
  code: 'US-OH',
  name: 'Ohio nursing facility and residential care facility rules',
  packVersion: '2026.11',
  effectiveFrom: '2026-01-01',
  sourceNote: 'Fetched 2026-11-07 from codes.ohio.gov (Ohio Adm. Code 5160-3-16.4). Other Ohio values are marked (verify).',
  rules: {
    medicaidBedHold: {
      daysPerCalendarYear: 30,
      rateRule: { kind: 'percent_of_per_diem_by_prior_year_occupancy', occupancyThresholdPct: '95', aboveThresholdPct: '50', atOrBelowThresholdPct: '18' },
      paymentInFull: true,
      requiresIntentToReturn: true,
      admissionDayCountsAsOccupied: true,
      ruleRef: 'Ohio Adm. Code 5160-3-16.4(D)(1)-(3), (A)(6), (C)(1); ORC 5165.34',
      verifyNote: 'Fetched 2026-11-07 from codes.ohio.gov. Confirm the prior-year occupancy figure with the Medicaid cost report each year.',
    },
    ...OH_BILLING_RULES,
    dnrComfortCare: { codes: ['dnr_cc', 'dnr_cca'], ruleRef: 'ORC 2133.21-2133.26; Ohio Adm. Code 3701-62', verifyNote: 'Ohio DNR Comfort Care / Comfort Care-Arrest protocol (verify current forms).' },
  },
  obligations: [
    { code: 'OH_BEDHOLD_DAYS_TRACKED', description: 'Track Medicaid bed-hold leave days per calendar year (30-day cap) and the resident\'s intent to return.', appliesTo: { settings: NF, payerKinds: ['medicaid_ffs', 'medicaid_mco'] }, startFact: 'census.leave_start', dueRule: { kind: 'at_start' }, evidenceTypes: ['census_event:leave_start'], ruleRef: 'Ohio Adm. Code 5160-3-16.4(D)(1)', verifyNote: 'Fetched 2026-11-07.', ownerRole: 'Business Office', active: true },
    { code: 'OH_INCIDENT_SELF_REPORT', description: 'Ohio nursing home self-report of incidents to ODH.', appliesTo: { settings: NF }, startFact: 'incident.reported', dueRule: { kind: 'working_days', days: 5 }, evidenceTypes: ['submission:state_incident'], ruleRef: 'Ohio Adm. Code 3701-17 (verify)', verifyNote: 'Phase 2 (verify the ODH self-report rule and timelines).', ownerRole: 'Executive Director', active: false },
    { code: 'OH_AL_RESIDENT_ASSESSMENT', description: 'Residential care facility resident assessment before or at move-in.', appliesTo: { settings: ['assisted_living', 'memory_care'] }, startFact: 'census.admission', dueRule: { kind: 'at_start' }, evidenceTypes: ['assessment:al_resident'], ruleRef: 'Ohio Adm. Code 3701-16 (verify)', verifyNote: 'Phase 2 (verify the OAC 3701-16 timing).', ownerRole: 'Director of Nursing', active: false },
  ],
}

export const PACKS = [US_FED_PACK, US_OH_PACK]
