import { actorFromSession, requirePermission } from '../lib/actor'
import { command } from '../lib/command'
import { seedOperatorPlatform } from '../seed/platform'

/** Onboarding: load the Ridgeline Senior Living / Maple Ridge spine (fictional, synthetic=true). Idempotent per key and per record. */
export async function loadOperatorSetup(_root: unknown, args: { idempotencyKey: string }, context: any) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageOnboarding')
  const result = await command(context.prisma, { name: 'setup.load_operator', actor, idempotencyKey: args.idempotencyKey, params: {} }, uow => seedOperatorPlatform(uow, actor))
  return { replay: result.replay, ...result.value }
}
