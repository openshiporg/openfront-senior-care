import { actorFromSession, requirePermission } from '../lib/actor'
import { command } from '../lib/command'
import { seedOperatorPlatform } from '../seed/platform'
import { runCensusSeed } from '../seed/census'
import { seedClinical } from '../seed/clinical'

/** Onboarding: load the Ridgeline Senior Living / Maple Ridge spine (synthetic=true). Idempotent per key and per record. */
export async function loadOperatorSetup(_root: unknown, args: { idempotencyKey: string }, context: any) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageOnboarding')
  const result = await command(context.prisma, { name: 'setup.load_operator', actor, idempotencyKey: args.idempotencyKey, params: {} }, uow => seedOperatorPlatform(uow, actor))
  return { replay: result.replay, ...result.value }
}

/**
 * Onboarding: load Maple Ridge's residents, census history, sales pipeline and family portal through
 * the real domain commands (seed/census.ts). Each call works for about 10 seconds (the GraphQL
 * request limit is 15) and reports progress; the dialog calls again until `finished`. Finished steps
 * replay, so a dropped connection or a second click never duplicates anything.
 */
export async function loadCensusSetup(_root: unknown, _args: { idempotencyKey: string }, context: any) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageOnboarding')
  const progress = await runCensusSeed(context.prisma, { budgetMs: 9_000 })
  return { ...progress, created: progress.created }
}

/** Onboarding: Phase 2 clinical demo data (assessment templates, workflow library, invented medications and orders). Idempotent. */
export async function loadClinicalSetup(_root: unknown, args: { idempotencyKey: string }, context: any) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageOnboarding')
  const result = await command(context.prisma, { name: 'setup.load_clinical', actor, idempotencyKey: args.idempotencyKey, params: {} }, uow => seedClinical(uow, actor))
  return { replay: result.replay, ...result.value }
}
