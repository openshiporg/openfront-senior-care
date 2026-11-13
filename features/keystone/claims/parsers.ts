import { isoFromYmd, parseAmount, parseX12, type Segment } from './x12'

/* Readers for the response files a person uploads: 999 (implementation acknowledgement), 277CA (claim acknowledgement) and 835 (remittance).
   Nothing is assumed accepted: a claim only moves when one of these files says so. */

export type Ack999 = { kind: '999'; accepted: boolean; status: string; errors: string[] }
export type ClaimAck = { claimReference: string; accepted: boolean; payerClaimNumber: string | null; category: string; status: string; message: string }
export type Ack277 = { kind: '277CA'; claims: ClaimAck[] }

const first = (segments: Segment[], id: string) => segments.find(s => s.id === id)

export function detectKind(text: string): '999' | '277' | '835' | 'unknown' {
  try {
    const { segments } = parseX12(text)
    const st = first(segments, 'ST')?.el[0]
    return st === '999' ? '999' : st === '277' ? '277' : st === '835' ? '835' : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function parse999(text: string): Ack999 {
  const { segments } = parseX12(text)
  if (first(segments, 'ST')?.el[0] !== '999') throw new Error('This is not a 999 acknowledgement.')
  const ak9 = first(segments, 'AK9')
  if (!ak9) throw new Error('The 999 has no AK9 summary segment.')
  const status = ak9.el[0]
  const errors = segments.filter(s => s.id === 'IK3' || s.id === 'IK4').map(s => `${s.id} ${s.el.join(' ')}`.trim())
  return { kind: '999', accepted: status === 'A', status, errors }
}

/** STC01 is category:status[:entity]. A1 and A2 are acknowledgements of receipt; A3, A4, A6, A7 and A8 are rejections. */
const ACCEPT = new Set(['A0', 'A1', 'A2', 'A5'])
export function parse277CA(text: string): Ack277 {
  const { segments, component } = parseX12(text)
  if (first(segments, 'ST')?.el[0] !== '277') throw new Error('This is not a 277CA acknowledgement.')
  const claims: ClaimAck[] = []
  let current: ClaimAck | null = null
  for (const s of segments) {
    if (s.id === 'TRN' && s.el[0] === '2') {
      current = { claimReference: s.el[1] ?? '', accepted: false, payerClaimNumber: null, category: '', status: '', message: '' }
      claims.push(current)
    } else if (s.id === 'STC' && current) {
      const [category, status] = (s.el[0] ?? '').split(component)
      if (!current.category) { current.category = category; current.status = status ?? '' }
      current.accepted = ACCEPT.has(category)
      current.message = s.el[11] ?? current.message
    } else if (s.id === 'REF' && s.el[0] === '1K' && current) {
      current.payerClaimNumber = s.el[1] ?? null
    }
  }
  if (!claims.length) throw new Error('The 277CA names no claims (no TRN*2 segment).')
  return { kind: '277CA', claims }
}

export type Adjustment = { group: string; reason: string; amountMinor: bigint; quantity?: string }
export type RemitClaim = {
  claimReference: string
  statusCode: string
  billedMinor: bigint
  paidMinor: bigint
  patientResponsibilityMinor: bigint
  payerClaimNumber: string
  adjustments: Adjustment[]
  /** Group CO, PR, OA and PI summed (positive = reduces payment). */
  contractualMinor: bigint
  prMinor: bigint
  otherMinor: bigint
}
export type Remit835 = { kind: '835'; traceNumber: string; paymentDate: string; totalPaidMinor: bigint; payerName: string; claims: RemitClaim[]; plbMinor: bigint }

export function parse835(text: string): Remit835 {
  const { segments, component } = parseX12(text)
  if (first(segments, 'ST')?.el[0] !== '835') throw new Error('This is not an 835 remittance.')
  const bpr = first(segments, 'BPR')
  const trn = first(segments, 'TRN')
  if (!bpr || !trn?.el[1]) throw new Error('The 835 has no BPR payment or TRN trace number.')
  const claims: RemitClaim[] = []
  let current: RemitClaim | null = null
  let plb = 0n
  let payerName = ''
  for (const s of segments) {
    if (s.id === 'N1' && s.el[0] === 'PR') payerName = s.el[1] ?? ''
    if (s.id === 'CLP') {
      current = { claimReference: s.el[0], statusCode: s.el[1], billedMinor: parseAmount(s.el[2] || '0'), paidMinor: parseAmount(s.el[3] || '0'), patientResponsibilityMinor: parseAmount(s.el[4] || '0'), payerClaimNumber: s.el[6] ?? '', adjustments: [], contractualMinor: 0n, prMinor: 0n, otherMinor: 0n }
      claims.push(current)
    } else if (s.id === 'CAS' && current) {
      const group = s.el[0]
      for (let i = 1; i + 1 < s.el.length; i += 3) {
        if (!s.el[i]) continue
        const amountMinor = parseAmount(s.el[i + 1] || '0')
        current.adjustments.push({ group, reason: s.el[i], amountMinor, quantity: s.el[i + 2] || undefined })
        if (group === 'CO') current.contractualMinor += amountMinor
        else if (group === 'PR') current.prMinor += amountMinor
        else current.otherMinor += amountMinor
      }
    } else if (s.id === 'PLB') {
      for (let i = 2; i + 1 < s.el.length; i += 2) plb += parseAmount(s.el[i + 1] || '0')
    } else if (s.id === 'SVC') void component
  }
  const date = bpr.el[15] ? isoFromYmd(bpr.el[15]) : ''
  if (!date) throw new Error('The 835 has no payment date (BPR16).')
  return { kind: '835', traceNumber: trn.el[1], paymentDate: date, totalPaidMinor: parseAmount(bpr.el[1] || '0'), payerName, claims, plbMinor: plb }
}
