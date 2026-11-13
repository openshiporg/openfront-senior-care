/* Small X12 helpers shared by the 837I writer and the 999/277CA/835 readers. Money is BigInt minor units and never passes through a float. */

export const X12_SEPARATORS = { element: '*', component: ':', repetition: '^', segment: '~' } as const

/** Characters that would break the envelope are removed, and text is upper-cased as payers expect. */
export const clean = (value: string | null | undefined, max = 60) =>
  String(value ?? '').replace(/[*:~^\r\n]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max)

export const digits = (value: string | null | undefined) => String(value ?? '').replace(/\D/g, '')

/** 1234500n -> "12345", 1234550n -> "12345.5", 5n -> "0.05" (X12 amounts drop trailing zeros). */
export function amountText(minor: bigint): string {
  const negative = minor < 0n
  const abs = negative ? -minor : minor
  const whole = abs / 100n
  const cents = abs % 100n
  const frac = cents === 0n ? '' : `.${cents.toString().padStart(2, '0').replace(/0$/, '')}`
  return `${negative ? '-' : ''}${whole}${frac}`
}

/** "12345.67" -> 1234567n, exact, no float. Rejects more than two decimals. */
export function parseAmount(text: string): bigint {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim())
  if (!m) throw new Error(`Not an amount: ${text.slice(0, 20)}`)
  const value = BigInt(m[2]) * 100n + BigInt((m[3] ?? '').padEnd(2, '0') || '0')
  return m[1] ? -value : value
}

export const ymd = (date: string) => date.replace(/-/g, '')
export const isoFromYmd = (text: string) => `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`

export function segment(...elements: (string | number | null | undefined)[]): string {
  const out = elements.map(e => (e === null || e === undefined ? '' : String(e)))
  while (out.length > 1 && out[out.length - 1] === '') out.pop()
  return out.join(X12_SEPARATORS.element) + X12_SEPARATORS.segment
}

export type Segment = { id: string; el: string[] }

/** Splits an interchange into segments using the separators declared in the fixed-width ISA. */
export function parseX12(text: string): { segments: Segment[]; element: string; component: string; segment: string } {
  const raw = text.replace(/^\uFEFF/, '').trimStart()
  if (!raw.startsWith('ISA') || raw.length < 106) throw new Error('This is not an X12 file: it does not start with an ISA segment.')
  const element = raw[3]
  const component = raw[104]
  const seg = raw[105]
  const body = raw.split(seg).map(s => s.replace(/^[\r\n\s]+/, '')).filter(Boolean)
  return { element, component, segment: seg, segments: body.map(s => { const parts = s.split(element); return { id: parts[0], el: parts.slice(1) } }) }
}
