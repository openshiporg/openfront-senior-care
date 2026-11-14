import { enforceRateLimit } from '../lib/publicRateLimit'
import { runInTransaction } from '../lib/unitOfWork'
import { answerOffer, viewOffer } from '../scheduling/service'

type Ctx = { session: unknown; prisma: any; req?: any }

/** Public: the staff member opens the link they were given. Rate limited; a bad or expired link reads the same. */
export async function shiftOfferQuery(_: unknown, args: { token: string }, context: Ctx) {
  await enforceRateLimit(context, 'shift-offer-view', 60, 60 * 60_000)
  return viewOffer(context.prisma, args.token)
}

export async function answerShiftOffer(_: unknown, args: { token: string; answer: string }, context: Ctx) {
  await enforceRateLimit(context, 'shift-offer-answer', 20, 60 * 60_000)
  const answer = args.answer === 'accept' ? 'accept' : args.answer === 'decline' ? 'decline' : null
  if (!answer) throw new (await import('../lib/errors')).DomainError('INVALID_INPUT', 'Choose accept or decline.')
  return runInTransaction(context.prisma, uow => answerOffer(uow, { token: args.token, answer }), { serializable: true })
}
