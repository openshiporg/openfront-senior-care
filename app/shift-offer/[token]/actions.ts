'use server';

import { headers } from 'next/headers';
import { keystoneContext } from '@/features/keystone/context';
import { DomainError } from '@/features/keystone/lib/errors';
import { enforceRateLimit } from '@/features/keystone/lib/publicRateLimit';
import { runInTransaction } from '@/features/keystone/lib/unitOfWork';
import { answerOffer } from '@/features/keystone/scheduling/service';

/** Accept or decline an open shift from the copied link. Handled here, in the request: nothing is sent. */
export async function answerShiftOfferAction(token: string, answer: 'accept' | 'decline') {
  try {
    const h = await headers();
    const forwarded = (h.get('x-forwarded-for') ?? '').split(',').map(x => x.trim()).filter(Boolean);
    // The last entry is the one the platform proxy added; earlier ones can be written by the caller.
    const req = { headers: {}, socket: { remoteAddress: forwarded[forwarded.length - 1] ?? 'unknown' } };
    await enforceRateLimit({ prisma: keystoneContext.prisma, req: req as never }, 'shift-offer-answer', 20, 60 * 60_000);
    const out = await runInTransaction(keystoneContext.prisma as never, uow => answerOffer(uow, { token, answer }), { serializable: true });
    return { ok: true as const, status: out.status };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false as const, error: error.message };
    return { ok: false as const, error: 'Something went wrong. Ask your scheduler.' };
  }
}
