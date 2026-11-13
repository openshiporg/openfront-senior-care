'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { cn } from '@/lib/utils';
import { pillClass } from './ActionButton';
import { runCommand } from '../actions/commands';

const newKey = (op: string) => `${op}:${crypto.randomUUID()}`;

type Setup = { clientSecret: string; setupIntentId: string; publishableKey: string };

/**
 * Put a card on file for a resident. The card number is typed into Stripe's own card field (Stripe Elements), so it goes straight to
 * Stripe and never through this app. Then the server reads the confirmed SetupIntent back from Stripe and keeps only the payment
 * method id, brand and last four. With a Stripe test key the field takes 4242 4242 4242 4242.
 */
export function SaveCardAction({ residentId, children }: { residentId: string; children: React.ReactNode }) {
  const [pending, start] = React.useTransition();
  const [setup, setSetup] = React.useState<Setup | null>(null);
  const [stripe, setStripe] = React.useState<Promise<Stripe | null> | null>(null);
  const [error, setError] = React.useState('');
  const setupKey = React.useRef(newKey('card.setup'));

  const open = () => {
    setError('');
    start(async () => {
      const r = await runCommand('billingCommand', { op: 'card.setup', input: { residentId } }, setupKey.current);
      if (!r.ok) { setError(r.error); return; }
      const data = r.data as Setup;
      setStripe(loadStripe(data.publishableKey));
      setSetup(data);
    });
  };

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-2">
      <button type="button" disabled={pending} className={cn(pillClass, 'min-h-11')} onClick={() => (setup ? setSetup(null) : open())} aria-expanded={!!setup}>
        {pending ? 'Working' : children}
      </button>
      {error ? <span role="alert" className="max-w-xs break-words text-xs text-red-600">{error}</span> : null}
      {setup && stripe ? (
        <Elements stripe={stripe} options={{ clientSecret: setup.clientSecret }}>
          <CardForm residentId={residentId} setupIntentId={setup.setupIntentId} onClose={() => { setSetup(null); setupKey.current = newKey('card.setup'); }} />
        </Elements>
      ) : null}
    </span>
  );
}

function CardForm({ residentId, setupIntentId, onClose }: { residentId: string; setupIntentId: string; onClose: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [autopay, setAutopay] = React.useState(false);
  const saveKey = React.useRef(newKey('card.save'));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true); setError('');
    const confirmed = await stripe.confirmSetup({ elements, redirect: 'if_required' });
    if (confirmed.error) { setError(confirmed.error.message ?? 'The card was not accepted.'); setBusy(false); return; }
    const r = await runCommand('billingCommand', { op: 'card.save', input: { residentId, setupIntentId, autopay } }, saveKey.current);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onClose();
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="grid w-full min-w-60 max-w-md gap-3 rounded-md border bg-card p-3">
      <PaymentElement />
      <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" className="size-5" checked={autopay} onChange={e => setAutopay(e.target.checked)} />Use for autopay</label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !stripe} className={cn(pillClass, 'min-h-11 bg-primary text-primary-foreground')}>{busy ? 'Working' : 'Save card'}</button>
        <button type="button" className="min-h-11 text-xs underline" onClick={onClose}>Cancel</button>
      </div>
      {error ? <span role="alert" className="break-words text-xs text-red-600">{error}</span> : null}
    </form>
  );
}
