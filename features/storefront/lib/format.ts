import { label } from '@/lib/labels'

/** Minor units ("335000") → "$3,350"; cents are shown only when they are not zero. */
export function dollars(minor: string | null | undefined) {
  if (!minor || !/^-?\d+$/.test(minor)) return ''
  const negative = minor.startsWith('-')
  const abs = minor.replace('-', '').padStart(3, '0')
  const whole = abs.slice(0, -2).replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const cents = abs.slice(-2)
  return `${negative ? '−' : ''}$${whole}${cents === '00' ? '' : `.${cents}`}`
}

/** Always with cents, for statements and payments. */
export function dollarsExact(minor: string | null | undefined) {
  if (!minor || !/^-?\d+$/.test(minor)) return ''
  const negative = minor.startsWith('-')
  const abs = minor.replace('-', '').padStart(3, '0')
  const whole = abs.slice(0, -2).replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '−' : ''}$${whole}.${abs.slice(-2)}`
}

const parts = (value: string | Date, timeZone: string, options: Intl.DateTimeFormatOptions) => {
  const map: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat('en-US', { timeZone, ...options }).formatToParts(new Date(value))) map[part.type] = part.value
  return map
}

/** "Tue Nov 10 10:00 AM ET" in the community's own time zone. */
export function tourTime(value: string | Date, timeZone: string) {
  const p = parts(value, timeZone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'shortGeneric' })
  return `${p.weekday} ${p.month} ${p.day}, ${p.hour}:${p.minute} ${p.dayPeriod} ${p.timeZoneName ?? ''}`.trim()
}

/** "Tuesday, November 10" in the community's own time zone. */
export function longDay(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(value))
}

/** "10:00 AM ET" */
export function clockTime(value: string | Date, timeZone: string) {
  const p = parts(value, timeZone, { hour: 'numeric', minute: '2-digit', timeZoneName: 'shortGeneric' })
  return `${p.hour}:${p.minute} ${p.dayPeriod} ${p.timeZoneName ?? ''}`.trim()
}

/** "November 10, 2026" for a date or a YYYY-MM-DD string (a plain date is read as that calendar day). */
export function plainDate(value: string | Date | null | undefined, timeZone = 'UTC') {
  if (!value) return ''
  const plain = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  return new Intl.DateTimeFormat('en-US', { timeZone: plain ? 'UTC' : timeZone, month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(plain ? `${value}T00:00:00Z` : value))
}

/** "independent_living" → "Independent Living" (headline case, as the site's headings use). */
export function settingName(setting: string | null | undefined) {
  return label(setting).replace(/\b[a-z]/g, letter => letter.toUpperCase())
}

export const plainLabel = (value: string | null | undefined) => label(value)

/** "(614) 555-0175" → "tel:+16145550175" */
export function telHref(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return `tel:+${digits.length === 10 ? `1${digits}` : digits}`
}

const REGIONS: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'D.C.', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

/** "Columbus, Ohio" */
export function cityLine(city: string | null | undefined, region: string | null | undefined) {
  const state = region ? REGIONS[region.toUpperCase()] ?? region : ''
  return [city, state].filter(Boolean).join(', ')
}

/** Splits "Maple Ridge Senior Living" into the name and the small line under it. */
export function brandParts(name: string) {
  const match = /^(.*?)\s+((?:senior|assisted|independent|retirement|memory|nursing|health|care|rehabilitation)\b.*)$/i.exec(name.trim())
  return match && match[1] ? { main: match[1], sub: match[2] } : { main: name.trim(), sub: '' }
}
