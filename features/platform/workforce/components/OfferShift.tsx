'use client';

import * as React from 'react';
import { BillingAction } from '../../components/BillingAction';

/** Offer an open shift to one person. The link is shown once; the scheduler copies it and gives it to them. Nothing is sent. */
export function OfferShift({ shiftId, people }: { shiftId: string; people: { value: string; label: string }[] }) {
  const [link, setLink] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const full = link && typeof window !== 'undefined' ? `${window.location.origin}${link}` : link;
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-2">
      <BillingAction op="shift.offer" input={{ shiftId }} fields={[{ name: 'staffMemberId', label: 'Offer to', type: 'select', required: true, options: people }]} onDone={d => setLink(String((d as { link?: string } | null)?.link ?? ''))}>Offer by link</BillingAction>
      {link ? (
        <span className="flex max-w-full flex-col gap-1 text-xs">
          <span>Copy this link and give it to them. It works once and expires.</span>
          <input readOnly value={full} onFocus={e => e.currentTarget.select()} className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-xs" aria-label="Offer link" />
          <button type="button" className="min-h-9 self-start rounded-md border px-3" onClick={() => { void navigator.clipboard?.writeText(full).then(() => setCopied(true)); }}>{copied ? 'Copied' : 'Copy link'}</button>
        </span>
      ) : null}
    </span>
  );
}
