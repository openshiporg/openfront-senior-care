import type { ItemSetDefinition } from './itemSet'
import { A0310 } from './itemSet'

/**
 * The spec edits a record must pass before it can go into a submission file (CMS MDS 3.0 data specifications: format,
 * range, consistency and the A0310 combination rules). Fatal edits block export; warnings are shown. This runs locally and
 * the same function runs on every record of an export, so a file the button makes has already passed these edits.
 */
export type EditResult = { fatal: { item: string; code: string; message: string }[]; warning: { item: string; code: string; message: string }[] }

const DATE = /^\d{8}$/
const validDate = (v: string) => {
  if (!DATE.test(v)) return false
  const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}
const ICD = /^[A-TV-Z][0-9][0-9A-Z](\.?[0-9A-Z]{1,4})?$/
export const isoToMds = (iso: string) => iso.replace(/-/g, '')

export function runSpecEdits(kind: string, items: Record<string, string | undefined>, def: Pick<ItemSetDefinition, 'items'>): EditResult {
  const out: EditResult = { fatal: [], warning: [] }
  const fatal = (item: string, code: string, message: string) => out.fatal.push({ item, code, message })
  const warn = (item: string, code: string, message: string) => out.warning.push({ item, code, message })

  for (const item of def.items) {
    const v = items[item.id]
    const blank = v === undefined || v === ''
    if (blank) {
      if (item.requiredFor?.includes(kind)) fatal(item.id, 'required', `${item.id} (${item.label}) is required on this record.`)
      continue
    }
    if (v === '-' && item.values !== 'text') continue // dash = not assessed: allowed, PDPM treats it as the lowest code
    if (item.values === 'date') { if (!validDate(v)) fatal(item.id, 'format', `${item.id} must be a date as YYYYMMDD.`) }
    else if (item.values === 'icd') { if (!ICD.test(v.toUpperCase())) fatal(item.id, 'format', `${item.id} is not an ICD-10-CM code.`) }
    else if (item.values === 'text') { if (v.length > 200) fatal(item.id, 'format', `${item.id} is too long.`) }
    else if (typeof item.values === 'string' && item.values.startsWith('int:')) {
      const [lo, hi] = item.values.slice(4).split('-').map(Number)
      if (!/^\d+$/.test(v) || Number(v) < lo || Number(v) > hi) fatal(item.id, 'range', `${item.id} must be a whole number from ${lo} to ${hi}.`)
    } else if (Array.isArray(item.values) && !item.values.includes(v)) fatal(item.id, 'range', `${item.id} has a value outside the allowed codes.`)
  }
  for (const key of Object.keys(items)) if (!def.items.some(i => i.id === key) && items[key] !== undefined) warn(key, 'unknown_item', `${key} is not in this item set and is not exported.`)

  // A0310 combination must match the record kind.
  const header = A0310[kind]
  if (header) {
    for (const [suffix, value] of Object.entries(header)) if (items[`A0310${suffix}`] !== undefined && items[`A0310${suffix}`] !== value) fatal(`A0310${suffix}`, 'consistency', `A0310${suffix} must be ${value} for this record type.`)
  }
  // Date consistency.
  const entry = items.A1600, ard = items.A2300, z = items.Z0500B, dob = items.A0900
  if (entry && ard && validDate(entry) && validDate(ard) && ard < entry) fatal('A2300', 'consistency', 'The ARD is before the entry date.')
  if (z && ard && validDate(z) && validDate(ard) && z < ard) fatal('Z0500B', 'consistency', 'The completion date is before the ARD.')
  if (dob && entry && validDate(dob) && validDate(entry) && dob >= entry) fatal('A0900', 'consistency', 'The birth date is not before the entry date.')
  // Skip patterns: BIMS conducted → C0500 present; not conducted → staff assessment C1000.
  if (items.C0100 === '1' && (items.C0500 === undefined || items.C0500 === '')) fatal('C0500', 'skip', 'C0100 = 1, so the BIMS summary (C0500) is required.')
  if (items.C0100 === '0' && (items.C1000 === undefined || items.C1000 === '')) fatal('C1000', 'skip', 'C0100 = 0, so the staff assessment (C1000) is required.')
  if (items.A2400A === '1' && !items.A2400B) fatal('A2400B', 'skip', 'A2400A = 1, so the start of the Medicare stay (A2400B) is required.')
  if (kind === 'pps_5day' && items.A2400A !== '1') fatal('A2400A', 'consistency', 'A 5-day PPS assessment needs a Medicare-covered stay (A2400A = 1).')
  return out
}

/** Every fatal edit across a batch, keyed by record reference. Empty = the file passes. */
export function batchEdits(records: { reference: string; kind: string; items: Record<string, string | undefined> }[], def: Pick<ItemSetDefinition, 'items'>) {
  return records.map(r => ({ reference: r.reference, ...runSpecEdits(r.kind, r.items, def) })).filter(r => r.fatal.length)
}
