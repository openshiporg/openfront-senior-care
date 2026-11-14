'use client';

import * as React from 'react';
import { answerShiftOfferAction } from './actions';

export function OfferAnswer({ token }: { token: string }) {
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);
  const answer = (a: 'accept' | 'decline') =>
    start(async () => {
      const r = await answerShiftOfferAction(token, a);
      setResult(r.ok ? { ok: true, text: r.status === 'assigned' ? 'You are on this shift. Thank you.' : 'You declined this shift.' } : { ok: false, text: r.error });
    });
  if (result?.ok) return <p role="status" className="text-sm font-medium">{result.text}</p>;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => answer('accept')} className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">{pending ? 'Working' : 'Accept shift'}</button>
        <button type="button" disabled={pending} onClick={() => answer('decline')} className="min-h-11 rounded-md border px-4 text-sm">Decline</button>
      </div>
      {result ? <p role="alert" className="text-sm text-red-600">{result.text}</p> : null}
    </div>
  );
}
