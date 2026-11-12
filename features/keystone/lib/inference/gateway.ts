import { createHash } from 'node:crypto'
import type { z } from 'zod'
import type { Db } from '../db'
import { DomainError, Codes } from '../errors'
import { principalKey, type Actor } from '../actor'
import { ADAPTERS, type AdapterResult } from './adapters'

/**
 * The inference gateway (INTEGRATIONS §1, Euler decision 3). It is the ONLY caller of a model adapter. In order it:
 *  1. resolves the provider (an explicit key, else the operator default);
 *  2. enforces the policy BEFORE any network call: OperatorSettings.inferencePolicy against the provider mode, a BAA registration for
 *     baa_hosted, never protected data to a no_phi provider, and never a real (non-synthetic) subject to a sandbox provider;
 *  3. calls the adapter with a timeout;
 *  4. validates the output against the block's schema (invalid output is `invalid_output`, never a guess);
 *  5. writes one InferenceCall row, allowed, refused or failed, outside any business transaction. No prompt or response text is stored:
 *     digests and token counts only.
 * It is never called inside a database transaction: callers run it before their command (see mutations/clinical.ts `prepare`).
 */

export type InferencePurpose = 'extract' | 'summarise' | 'draft_note' | 'classify' | 'workflow_build' | 'workflow_step'
export type InferenceMode = 'self_hosted' | 'baa_hosted' | 'sandbox' | 'no_phi'

export type InferenceRequest<T> = {
  purpose: InferencePurpose
  /** The versioned prompt template, e.g. "extract.fall_from_note@1". Sandbox fixtures are keyed by it. */
  task: string
  system: string
  /** Delimited source text. Passed as data, never as instructions. */
  data: { label: string; text: string }[]
  output: z.ZodType<T, z.ZodTypeDef, unknown>
  /**
   * Fail closed (dental 73f6104): staff free text and chart text are treated as protected health information. Only a call built from
   * catalogue metadata alone may say false.
   */
  carriesPhi: boolean
  dataCategories: string[]
  context: { communityId: string | null; actor: Actor; synthetic: boolean; workflowRunId?: string | null; agentRunId?: string | null }
  providerKey?: string | null
  maxTokens?: number
}

export type InferenceOutcome = 'ok' | 'refused_policy' | 'error' | 'timeout' | 'invalid_output'
export type InferenceResult<T> =
  | { ok: true; value: T; callId: string; outcome: 'ok' }
  | { ok: false; callId: string; outcome: Exclude<InferenceOutcome, 'ok'>; code: string; reason: string }

type ProviderRow = {
  id: string; key: string; adapter: string; mode: string; endpoint: string; model: string; status: string
  processorRegistration: { status: string; effectiveTo: Date | null; dataCategories: unknown } | null
}

const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const CLASS: Record<string, string> = { sandbox: 'sandbox_fixture', self_hosted: 'self_hosted', baa_hosted: 'baa_hosted' }

/** Why a call may not go to this provider, or null when it may. Pure: the caller loads the provider row and the policy. */
export function policyProblem(provider: ProviderRow | null, policy: string, request: Pick<InferenceRequest<unknown>, 'carriesPhi' | 'dataCategories' | 'context'>, now = new Date()): { code: string; reason: string } | null {
  if (!provider) return { code: Codes.INFERENCE_POLICY_REFUSED, reason: 'No inference provider is set up.' }
  if (provider.status !== 'active') return { code: Codes.INFERENCE_POLICY_REFUSED, reason: `Inference provider ${provider.key} is ${provider.status}.` }
  if (!ADAPTERS[provider.adapter]) return { code: Codes.INFERENCE_POLICY_REFUSED, reason: `No adapter ${provider.adapter} is registered.` }
  if (provider.mode === 'no_phi') {
    if (request.carriesPhi) return { code: Codes.INFERENCE_PHI_BLOCKED, reason: `Inference provider ${provider.key} is registered as no-PHI. Use a self-hosted model or one under a signed BAA.` }
    return null
  }
  if (provider.mode === 'sandbox') {
    // Recorded fixtures are for tests, seed and QA: a real resident's data never goes there, whatever the policy says.
    if (!request.context.synthetic) return { code: Codes.INFERENCE_PHI_BLOCKED, reason: `Inference provider ${provider.key} is a sandbox and only sees synthetic data.` }
    return null
  }
  if (provider.mode === 'self_hosted') return null
  if (provider.mode === 'baa_hosted') {
    const qaSynthetic = policy === 'any_registered' && process.env.SENIOR_CARE_ENV === 'qa' && request.context.synthetic
    if (policy === 'self_hosted_only') return { code: Codes.INFERENCE_POLICY_REFUSED, reason: `The operator's inference policy is self-hosted only; ${provider.key} is a BAA-hosted provider.` }
    if (qaSynthetic) return null
    const reg = provider.processorRegistration
    if (!reg || reg.status !== 'active' || (reg.effectiveTo && reg.effectiveTo.getTime() < now.getTime())) {
      return { code: Codes.INFERENCE_PHI_BLOCKED, reason: `Inference provider ${provider.key} has no active BAA registration.` }
    }
    const covered = new Set(Array.isArray(reg.dataCategories) ? (reg.dataCategories as string[]) : [])
    const missing = request.dataCategories.filter(c => !covered.has(c))
    if (missing.length) return { code: Codes.INFERENCE_PHI_BLOCKED, reason: `The BAA registration for ${provider.key} does not cover ${missing.join(', ')}.` }
    return null
  }
  return { code: Codes.INFERENCE_POLICY_REFUSED, reason: `Unknown provider mode ${provider.mode}.` }
}

async function resolveProvider(db: Db, key?: string | null): Promise<ProviderRow | null> {
  const select = { id: true, key: true, adapter: true, mode: true, endpoint: true, model: true, status: true, processorRegistration: { select: { status: true, effectiveTo: true, dataCategories: true } } }
  if (key) return db.inferenceProvider.findUnique({ where: { key }, select })
  return db.inferenceProvider.findFirst({ where: { isDefault: true, status: 'active' }, orderBy: { createdAt: 'asc' }, select })
}

/** One model call through the policy, with exactly one InferenceCall row whatever happens. */
export async function infer<T>(db: Db, request: InferenceRequest<T>): Promise<InferenceResult<T>> {
  const started = Date.now()
  const provider = await resolveProvider(db, request.providerKey)
  const settings = await db.operatorSettings.findFirst({ select: { inferencePolicy: true } })
  const policy = settings?.inferencePolicy ?? 'self_hosted_only'
  const inputHash = digest({ task: request.task, system: request.system, data: request.data })
  const log = async (outcome: InferenceOutcome, extra: { outputHash?: string; inputTokens?: number | null; outputTokens?: number | null; reason?: string; model?: string } = {}) => {
    const row = await db.inferenceCall.create({
      data: {
        communityId: request.context.communityId, purpose: request.purpose, provider: provider?.key ?? 'none', inferenceProviderId: provider?.id ?? null,
        providerClass: (provider && CLASS[provider.mode]) || 'other', mode: provider?.mode ?? 'none', model: extra.model ?? provider?.model ?? '',
        outcome, policyAtCall: policy, deidentification: 'none', dataCategories: request.dataCategories as never, syntheticOnly: request.context.synthetic,
        inputHash, outputHash: extra.outputHash ?? '', inputTokens: extra.inputTokens ?? null, outputTokens: extra.outputTokens ?? null,
        latencyMs: Date.now() - started, reason: (extra.reason ?? '').slice(0, 300), workflowRunId: request.context.workflowRunId ?? null,
        agentRunId: request.context.agentRunId ?? null, principal: principalKey(request.context.actor), at: new Date(),
        actorId: request.context.actor.kind === 'user' ? request.context.actor.userId : null,
      },
      select: { id: true },
    })
    return row.id
  }

  const problem = policyProblem(provider, policy, request)
  if (problem) return { ok: false, outcome: 'refused_policy', code: problem.code, reason: problem.reason, callId: await log('refused_policy', { reason: problem.reason }) }

  let result: AdapterResult
  try {
    result = await ADAPTERS[provider!.adapter].complete({ key: provider!.key, endpoint: provider!.endpoint, model: provider!.model }, request)
  } catch (error) {
    const timeout = error instanceof Error && /timeout|aborted/i.test(`${error.name} ${error.message}`)
    const reason = timeout ? 'The model did not answer in time.' : 'The model call failed.'
    return { ok: false, outcome: timeout ? 'timeout' : 'error', code: Codes.GUARD_FAILED, reason, callId: await log(timeout ? 'timeout' : 'error', { reason }) }
  }
  const usage = { outputHash: digest(result.text), inputTokens: result.tokens?.input ?? null, outputTokens: result.tokens?.output ?? null, model: result.model }
  let parsed: T
  try {
    const checked = request.output.safeParse(JSON.parse(result.text))
    if (!checked.success) throw new Error('schema')
    parsed = checked.data
  } catch {
    const reason = 'The model answer did not match the expected shape.'
    return { ok: false, outcome: 'invalid_output', code: Codes.GUARD_FAILED, reason, callId: await log('invalid_output', { ...usage, reason }) }
  }
  return { ok: true, outcome: 'ok', value: parsed, callId: await log('ok', usage) }
}

/** The same call, but a refusal or failure is an error for the person asking. */
export async function inferOrThrow<T>(db: Db, request: InferenceRequest<T>) {
  const result = await infer(db, request)
  if (!result.ok) throw new DomainError(result.code as never, result.reason, { inferenceCallId: result.callId, outcome: result.outcome })
  return result
}
