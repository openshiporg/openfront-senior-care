import type { ChargeInput, ChargeResult, PaymentAdapter, RefundInput, RefundResult, WebhookEvent } from './index'

/**
 * A deterministic stand-in for Stripe TEST that obeys Stripe's idempotency rules, for proofs only:
 *  - the same key with the same parameters returns the original result and creates nothing new;
 *  - the same key with different parameters is an idempotency_error, which is `unknown`, never `failed`;
 *  - a decline is final for that key;
 *  - `resolve` only reads: it never creates a charge.
 * Behaviour per call is scripted with `script(...)`; the default is success.
 */
export type FakeScript = 'succeed' | 'decline' | 'processing' | 'requires_action' | 'lose_answer' | 'server_error'

type Intent = { id: string; amountMinor: bigint; currencyCode: string; status: 'succeeded' | 'declined' | 'processing' | 'requires_action'; key: string; payment: string }

export function createFakeStripe() {
  const intents = new Map<string, Intent>()
  const byKey = new Map<string, { intent: Intent; fingerprint: string }>()
  const refunds = new Map<string, { id: string; fingerprint: string }>()
  let sequence = 0
  let nextScript: FakeScript[] = []
  const calls = { charge: 0, resolve: 0, refund: 0, created: 0 }

  const answer = (intent: Intent): ChargeResult => {
    switch (intent.status) {
      case 'succeeded': return { outcome: 'succeeded', providerRef: intent.id, message: 'Paid.' }
      case 'declined': return { outcome: 'failed', providerRef: intent.id, message: 'The card was declined.' }
      case 'processing': return { outcome: 'processing', providerRef: intent.id, message: 'The bank is still processing this payment.' }
      default: return { outcome: 'requires_action', providerRef: intent.id, message: 'The bank needs the cardholder to confirm.' }
    }
  }

  const adapter: PaymentAdapter = {
    key: 'fake',
    async charge(input: ChargeInput) {
      calls.charge += 1
      const script = nextScript.shift() ?? 'succeed'
      const fingerprint = `${input.amountMinor}|${input.currencyCode}|${input.paymentMethod ?? ''}`
      const prior = byKey.get(input.idempotencyKey)
      if (prior) {
        if (prior.fingerprint !== fingerprint) return { outcome: 'unknown', providerRef: prior.intent.id, message: 'This payment was already sent to the card processor. Use "Check status".' }
        return answer(prior.intent)
      }
      if (script === 'server_error') return { outcome: 'unknown', providerRef: null, message: 'The card processor did not answer. Check the status in a moment.' }
      const status = script === 'decline' ? 'declined' : script === 'processing' ? 'processing' : script === 'requires_action' ? 'requires_action' : 'succeeded'
      sequence += 1
      calls.created += 1
      const intent: Intent = { id: `pi_test_${String(sequence).padStart(6, '0')}`, amountMinor: input.amountMinor, currencyCode: input.currencyCode, status, key: input.idempotencyKey, payment: input.metadata.payment ?? '' }
      intents.set(intent.id, intent)
      byKey.set(input.idempotencyKey, { intent, fingerprint })
      // The charge exists at the processor, but the answer never reached us.
      if (script === 'lose_answer') return { outcome: 'unknown', providerRef: null, message: 'The card processor did not answer. Check the status in a moment.' }
      return answer(intent)
    },
    async resolve(input) {
      calls.resolve += 1
      const found = (input.providerRef ? intents.get(input.providerRef) : null) ?? byKey.get(input.idempotencyKey)?.intent ?? null
      if (!found) return { outcome: 'unknown', providerRef: null, message: 'The card processor has no record of this payment yet. Check again in a minute, or look it up in the Stripe dashboard.' }
      return answer(found)
    },
    async refund(input: RefundInput): Promise<RefundResult> {
      calls.refund += 1
      const fingerprint = `${input.providerRef}|${input.amountMinor}`
      const prior = refunds.get(input.idempotencyKey)
      if (prior) return prior.fingerprint === fingerprint ? { outcome: 'succeeded', providerRef: prior.id, message: 'Refunded.' } : { outcome: 'unknown', providerRef: prior.id, message: 'This refund was already sent.' }
      if (!intents.has(input.providerRef)) return { outcome: 'failed', providerRef: null, message: 'The refund was refused.' }
      sequence += 1
      const id = `re_test_${String(sequence).padStart(6, '0')}`
      refunds.set(input.idempotencyKey, { id, fingerprint })
      return { outcome: 'succeeded', providerRef: id, message: 'Refunded.' }
    },
    readEvent(rawBody: string): WebhookEvent {
      const event = JSON.parse(rawBody) as { id: string; type: string; objectRef: string; outcome: WebhookEvent['outcome'] }
      return { id: event.id, type: event.type, objectRef: event.objectRef, outcome: event.outcome }
    },
  }

  return {
    adapter,
    calls,
    intents,
    /** Queue what the next charge calls do, in order. */
    script: (...steps: FakeScript[]) => { nextScript = [...steps] },
    /** The processor's own state changes (a bank settles a processing payment). */
    settle: (id: string, status: Intent['status']) => { const intent = intents.get(id); if (intent) intent.status = status },
  }
}
