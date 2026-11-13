import { describe, expect, it } from 'vitest'
import { policyProblem } from './gateway'
import { fallSpans } from './rules'
import { validateGraph, LIBRARY } from '../workflows/blocks'
import { Codes } from '../errors'

/** Gate 5 (pure half): the policy is decided before any adapter is touched. Gate 6: a graph is built only from the catalogue. */
const actor = { kind: 'user' as const, userId: 'u', permissions: new Set<never>() }
const base = { id: 'p', key: 'p', adapter: 'self_hosted_openai_compat', endpoint: 'http://model.local', model: 'm', status: 'active', processorRegistration: null }
const req = (synthetic = false, carriesPhi = true) => ({ carriesPhi, dataCategories: ['clinical_notes'], context: { communityId: 'c', actor, synthetic } })

describe('inference policy (fail closed)', () => {
  it('refuses a BAA-hosted provider under self_hosted_only, whatever the BAA', () => {
    const p = { ...base, adapter: 'azure_openai', mode: 'baa_hosted', processorRegistration: { status: 'active', effectiveTo: null, dataCategories: ['clinical_notes'] } }
    expect(policyProblem(p, 'self_hosted_only', req())).toMatchObject({ code: Codes.INFERENCE_POLICY_REFUSED })
    expect(policyProblem(p, 'self_hosted_or_baa', req())).toBeNull()
  })
  it('refuses a BAA provider whose registration is missing, lapsed or does not cover the data', () => {
    const p = { ...base, adapter: 'bedrock', mode: 'baa_hosted' }
    expect(policyProblem(p, 'self_hosted_or_baa', req())).toMatchObject({ code: Codes.INFERENCE_PHI_BLOCKED })
    expect(policyProblem({ ...p, processorRegistration: { status: 'active', effectiveTo: new Date(Date.now() - 1000), dataCategories: ['clinical_notes'] } }, 'self_hosted_or_baa', req())).toMatchObject({ code: Codes.INFERENCE_PHI_BLOCKED })
    expect(policyProblem({ ...p, processorRegistration: { status: 'active', effectiveTo: null, dataCategories: ['demographics'] } }, 'self_hosted_or_baa', req())).toMatchObject({ code: Codes.INFERENCE_PHI_BLOCKED })
  })
  it('never sends protected data to a no_phi provider; the built-in rules engine is self-hosted and reads real residents', () => {
    expect(policyProblem({ ...base, mode: 'no_phi' }, 'any_registered', req(true, true))).toMatchObject({ code: Codes.INFERENCE_PHI_BLOCKED })
    expect(policyProblem({ ...base, mode: 'no_phi' }, 'any_registered', req(false, false))).toBeNull()
    expect(policyProblem({ ...base, adapter: 'builtin_rules', mode: 'self_hosted' }, 'self_hosted_only', req(false))).toBeNull()
    expect(policyProblem({ ...base, adapter: 'gone', mode: 'sandbox' }, 'any_registered', req(true))).toMatchObject({ code: Codes.INFERENCE_POLICY_REFUSED })
  })
  it('refuses a draft or suspended provider, an unknown adapter, and no provider at all', () => {
    expect(policyProblem({ ...base, mode: 'self_hosted', status: 'suspended' }, 'self_hosted_only', req())).toMatchObject({ code: Codes.INFERENCE_POLICY_REFUSED })
    expect(policyProblem({ ...base, mode: 'self_hosted', adapter: 'nope' }, 'self_hosted_only', req())).toMatchObject({ code: Codes.INFERENCE_POLICY_REFUSED })
    expect(policyProblem(null, 'self_hosted_only', req())).toMatchObject({ code: Codes.INFERENCE_POLICY_REFUSED })
    expect(policyProblem({ ...base, mode: 'self_hosted' }, 'self_hosted_only', req())).toBeNull()
  })
})

describe('fall extraction fixture and the block catalogue', () => {
  it('finds the exact span of a fall and ignores denials', () => {
    const note = 'Resident ambulating with walker. At 02:10 she was found on the floor beside the bed, no visible injury. Denies pain. No falls before this.'
    const [e, ...rest] = fallSpans(note)
    expect(rest).toHaveLength(0)
    expect(note.slice(e.spanStart, e.spanEnd)).toBe(e.quote)
    expect(e.quote).toMatch(/found on the floor/)
    expect(fallSpans('Denies falls. Ambulating well.')).toHaveLength(0)
  })
  it('validates every library graph and refuses blocks outside the catalogue or out of order', () => {
    for (const item of LIBRARY) expect(() => validateGraph(item.graph)).not.toThrow()
    expect(() => validateGraph({ nodes: [{ block: 'freeform.unknown', params: {} }] })).toThrow(/not in the block catalogue/)
    expect(() => validateGraph({ nodes: [{ block: 'extract.fall_from_note', params: {} }, { block: 'rule.deadline_after_event', params: {} }] })).toThrow(/needs records/)
    expect(() => validateGraph({ nodes: [{ block: 'source.progress_notes', params: {} }] })).toThrow(/never opens a finding/)
    expect(() => validateGraph({ nodes: [{ block: 'source.progress_notes', params: { days: 999 } }, { block: 'extract.fall_from_note' }, { block: 'rule.deadline_after_event' }] })).toThrow(/days/)
  })
})
