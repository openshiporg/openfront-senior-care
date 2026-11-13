/** Human labels for enum values, shared by Keystone select options and the dashboard. Never show a raw enum. */
/** Words that stay upper-case when an enum is turned into a label. */
const ACRONYMS: Record<string, string> = {
  nf: 'NF', snf: 'SNF', al: 'AL', mc: 'MC', il: 'IL', pasrr: 'PASRR', poa: 'POA', ma: 'MA', mds: 'MDS', rn: 'RN', lpn: 'LPN',
  mco: 'MCO', ltc: 'LTC', irf: 'IRF', ltch: 'LTCH', ffs: 'FFS', phi: 'PHI', mfa: 'MFA', ed: 'ED', don: 'DON', adon: 'ADON',
  mcp: 'MCP', api: 'API', id: 'ID', a: 'A', b: 'B', ccrc: 'CCRC', us: 'US', oh: 'OH', ip: 'IP',
}

/** Enum values whose plain-English reading is not just the words of the value. */
const LABELS: Record<string, string> = {
  nursing_facility: 'Nursing facility', assisted_living: 'Assisted living', memory_care: 'Memory care', independent_living: 'Independent living',
  medicare_a: 'Medicare Part A', medicare_advantage: 'Medicare Advantage', medicaid_pending: 'Medicaid pending', medicaid_ffs: 'Medicaid',
  private_pay: 'Private pay', ltc_insurance: 'Long-term care insurance', hospice_agency: 'Hospice agency',
  out_of_service: 'Out of service', on_leave: 'On leave', moved_in: 'Moved in', no_show: 'No-show', tour_scheduled: 'Tour scheduled',
  healthcare_poa: 'Healthcare POA', financial_responsible: 'Financial responsible party', guardian: 'Court guardian', self: 'Self',
  bed_hold_policy: 'Bed-hold policy', bed_hold_at_transfer: 'Bed-hold notice at transfer', transfer_discharge: 'Transfer or discharge notice',
  privacy_practices: 'Notice of privacy practices', room_change: 'Room change', admission_agreement: 'Admission agreement', residency_agreement: 'Residency agreement',
  in_person: 'In person', phone_then_mail: 'Phone, then mail', refused_witnessed: 'Refused (witnessed)', not_required: 'Not required',
  acute_hospital: 'Acute-care hospital', community_home: 'Home in the community', another_nursing_facility: 'Another nursing facility', psychiatric_hospital: 'Psychiatric hospital',
  date_order: 'Date order', internal_transfer: 'Internal transfer', continuing_care: 'Continuing-care contract', chose_competitor: 'Chose another community',
  care_needs_exceed: 'Care needs exceed what we offer', stayed_home: 'Stayed home', no_response: 'No response', clinical_review: 'Clinical review', payer_check: 'Payer check',
  placement_agency: 'Placement agency', pasrr_level1: 'PASRR Level I', reviewed_ok: 'Reviewed, no concern', reviewed_violation: 'Reviewed, violation',
  self_hosted_only: 'Self-hosted only', baa_hosted: 'BAA-covered hosting', dem: 'Demographic', clin: 'Clinical', fin: 'Financial',
  full_time: 'Full time', part_time: 'Part time', prn: 'PRN (as needed)', either: 'In person or video', warn: 'Warning', csr: 'Customer service',
  in_house: 'In house', on_leave_hold: 'On leave, bed held', on_leave_no_hold: 'On leave, no hold', not_admitted: 'Not admitted', pre_admit: 'Pre-admission', satisfied_late: 'Satisfied late',
  hospital: 'Hospital', medicaid_mco: 'Medicaid managed care', commercial: 'Commercial insurance', hold_release: 'Bed-hold released', leave_start: 'Leave started', leave_end: 'Returned from leave',
  pps_5day: 'PPS 5-day', ipa: 'Interim payment assessment', obra_admission: 'OBRA admission', obra_quarterly: 'OBRA quarterly', obra_annual: 'OBRA annual', obra_significant_change: 'Significant change', pps_discharge: 'PPS discharge', discharge_return_anticipated: 'Discharge, return anticipated', discharge_return_not_anticipated: 'Discharge, return not anticipated', death_in_facility: 'Death in facility', entry: 'Entry tracking', nomnc: 'NOMNC (CMS-10123)', snfabn: 'SNF ABN (CMS-10055)', due_today: 'Due today', delivered_in_time: 'Delivered in time', delivered_late: 'Delivered late',
  operations: 'Operations', pub: 'Public', op: 'Operational', sens: 'Sensitive', ident: 'Identifier', approve: 'Approve', reject: 'Reject', treatment_operations: 'Treatment and operations', family_access: 'Family access',
}

const word = (w: string) => ACRONYMS[w.toLowerCase()] ?? w.toLowerCase()

/** "out_of_service" → "Out of service"; "census.admitted" → "Census · admitted". Never shows a raw enum. */
export function label(value: string | null | undefined): string {
  if (!value) return ''
  if (LABELS[value]) return LABELS[value]
  if (value.includes('.')) return value.split('.').map(label).join(' · ')
  const words = value.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[_\s-]+/).filter(Boolean).map(word)
  if (!words.length) return ''
  const first = words[0]
  words[0] = first === first.toUpperCase() ? first : first[0].toUpperCase() + first.slice(1)
  return words.join(' ')
}
