/**
 * Display formatting for exact values. Inputs are the strings GraphQL returns for bigInt and
 * decimal fields; nothing here turns money into a float.
 */

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function splitDecimal(value: string) {
  const text = value.trim()
  const negative = text.startsWith('-')
  const [whole = '0', fraction = ''] = text.replace(/^[+-]/, '').split('.')
  return { negative, whole: whole.replace(/^0+(?=\d)/, '') || '0', fraction }
}

/** Minor units ("123456") → "$1,234.56". */
export function money(minor: string | bigint | null | undefined, currency = 'USD', digits = 2) {
  if (minor === null || minor === undefined || minor === '') return '—'
  const text = String(minor)
  if (!/^-?\d+$/.test(text)) return '—'
  const negative = text.startsWith('-')
  const abs = text.replace('-', '').padStart(digits + 1, '0')
  const whole = abs.slice(0, abs.length - digits)
  const fraction = digits ? `.${abs.slice(-digits)}` : ''
  const symbol = currency === 'USD' ? '$' : `${currency} `
  return `${negative ? '−' : ''}${symbol}${group(whole.replace(/^0+(?=\d)/, ''))}${fraction}`
}

/** An exact decimal string trimmed to at most `maxPlaces` (truncating display only) and at least `minPlaces`. */
export function decimalText(value: string | null | undefined, options: { minPlaces?: number; maxPlaces?: number; prefix?: string } = {}) {
  if (value === null || value === undefined || value === '') return '—'
  if (!/^[+-]?\d*(\.\d*)?$/.test(String(value).trim())) return '—'
  const { negative, whole, fraction } = splitDecimal(String(value))
  const max = options.maxPlaces ?? 10
  const min = options.minPlaces ?? 0
  let f = fraction.slice(0, max).replace(/0+$/, '')
  if (f.length < min) f = f.padEnd(min, '0')
  const isZero = /^0*$/.test(whole + f)
  return `${negative && !isZero ? '−' : ''}${options.prefix ?? ''}${group(whole)}${f ? `.${f}` : ''}`
}

/** Price in dollars from a decimal string: at least cents, up to 4 places. */
export const price = (value: string | null | undefined) => decimalText(value, { minPlaces: 2, maxPlaces: 4, prefix: '$' })

/** Quantity: up to 6 places (micro-shares). */
export const quantity = (value: string | null | undefined) => decimalText(value, { maxPlaces: 6 })

export const bps = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value} bps`)

function yearIn(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(d)
}

/**
 * Human dates: "Tue, Nov 10" (the year is added only when it is not the current year), with the time and
 * zone for 'full'. Never ISO. `date` reads a calendar date ("2026-11-10") as that day, not as UTC midnight.
 */
export function when(iso: string | null | undefined, tz = 'America/New_York', style: 'full' | 'time' | 'day' | 'seconds' | 'date' = 'full') {
  if (!iso) return ''
  const calendar = style === 'date' || /^\d{4}-\d{2}-\d{2}$/.test(iso)
  const d = calendar ? new Date(`${iso.slice(0, 10)}T12:00:00Z`) : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const zone = calendar ? 'UTC' : tz
  const withYear = yearIn(d, zone) !== yearIn(new Date(), tz)
  const dayPart: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) }
  if (calendar || style === 'day') return new Intl.DateTimeFormat('en-US', { timeZone: zone, ...dayPart }).format(d)
  const time: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', ...(style === 'seconds' ? { second: '2-digit' } : {}), timeZoneName: 'short' }
  if (style === 'time' || style === 'seconds') return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...time }).format(d)
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...dayPart, ...time }).format(d)
}

export { label } from '@/lib/labels'
