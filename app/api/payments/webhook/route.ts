import { keystoneContext } from '@/features/keystone/context'
import { applyPaymentEvent } from '@/features/keystone/billing/payments'
import { systemActor } from '@/features/keystone/lib/actor'
import { stripeAdapter } from '@/features/integrations/payment'

export const dynamic = 'force-dynamic'

/**
 * Card processor events (Stripe). The signature is checked first; the event is then recorded once by its own id, so a
 * replay answers 200 and changes nothing. No queue and no retry loop here: the processor retries by itself.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  const headers = { 'stripe-signature': request.headers.get('stripe-signature') ?? undefined }
  let event
  try {
    event = stripeAdapter.readEvent(raw, headers)
  } catch {
    return Response.json({ ok: false }, { status: 400 })
  }
  try {
    const result = await applyPaymentEvent(keystoneContext.prisma as never, systemActor('payment_webhook'), event)
    return Response.json({ ok: true, duplicate: result.duplicate }, { status: 200 })
  } catch {
    return Response.json({ ok: false }, { status: 500 })
  }
}
