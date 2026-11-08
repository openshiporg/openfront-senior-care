import { describe, expect, it } from 'vitest'
import { buildCensusPlan, FAMILY_MAIL_DOMAINS, type PlanStep } from './censusPlan'

const ANCHOR = new Date('2026-11-08T17:00:00Z')

function emailsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string' && /@/.test(value) && !value.startsWith('$')) out.push(value)
  else if (Array.isArray(value)) value.forEach(v => emailsIn(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach(v => emailsIn(v, out))
  return out
}

describe.each(['small', 'full'] as const)('census plan (%s)', preset => {
  const { steps, summary } = buildCensusPlan({ anchor: ANCHOR, preset })

  it('has unique step keys, runs in time order and never goes past the anchor', () => {
    expect(new Set(steps.map(s => s.key)).size).toBe(steps.length)
    for (let i = 1; i < steps.length; i += 1) expect(steps[i].at >= steps[i - 1].at).toBe(true)
    expect(steps.every(s => new Date(s.at) <= ANCHOR)).toBe(true)
  })

  it('only refers to results of earlier steps', () => {
    const seen = new Set<string>()
    const refs = (value: unknown): string[] =>
      value && typeof value === 'object' ? ('$ref' in value ? [(value as { $ref: string }).$ref] : Object.values(value).flatMap(refs)) : []
    for (const step of steps) {
      for (const ref of refs(step.input)) expect(seen.has(ref), `${step.key} → ${ref}`).toBe(true)
      seen.add(step.key)
    }
  })

  it('never puts two residents in one bed', () => {
    const occupant = new Map<string, string>()
    const stayBed = new Map<string, string>()
    const free = (stay: string) => { const bed = stayBed.get(stay); if (bed) { occupant.delete(bed); stayBed.delete(stay) } }
    const take = (step: PlanStep, stay: string, bed: string) => {
      expect(occupant.get(bed), `${step.key} into ${bed}`).toBeUndefined()
      occupant.set(bed, stay); stayBed.set(stay, bed)
    }
    const stayOf = (input: any) => (input.stay?.$ref as string) ?? ''
    for (const step of steps) {
      const input = step.input as any
      if (step.kind === 'admit' && input.bedId) take(step, step.key, input.bedId)
      if (step.kind === 'room_change') { free(stayOf(input)); take(step, stayOf(input), input.toBedId) }
      if (step.kind === 'leave_start' && !input.holdElected) free(stayOf(input))
      if (step.kind === 'leave_end' && input.toBedId) take(step, stayOf(input), input.toBedId)
      if (step.kind === 'discharge' || step.kind === 'death') free(stayOf(input))
    }
  })

  it('gives families only personal mail addresses and staff none outside the operator', () => {
    const emails = steps.flatMap(s => emailsIn(s.input))
    expect(emails.length).toBeGreaterThan(0)
    for (const email of emails) expect(FAMILY_MAIL_DOMAINS.some(domain => email.endsWith(`@${domain}`)), email).toBe(true)
    expect(emails.some(e => /\.(example|invalid|test)$/.test(e))).toBe(false)
  })

  it('walks the exit-gate sales path to an admission', () => {
    const kinds = steps.map(s => s.kind)
    for (const kind of ['inquiry_phone', 'tour_schedule', 'waitlist_add', 'waitlist_offer', 'waitlist_resolve', 'referral', 'admit', 'leave_start', 'leave_end', 'room_change', 'discharge', 'sign_off'] as const) expect(kinds).toContain(kind)
    expect(summary.residentsPresent).toBeGreaterThan(preset === 'full' ? 180 : 20)
  })

  if (preset === 'full') it('fills the nursing center the way an operating building is filled', () => {
    const n = summary.nursing
    expect(n.occupied + n.held).toBeGreaterThanOrEqual(108)
    expect(n.available).toBeGreaterThan(0)
    expect(summary.hospice).toBeGreaterThanOrEqual(6)
    expect(summary.portalAccounts).toBe(30)
  })
})
