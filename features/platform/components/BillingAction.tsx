'use client';

import * as React from 'react';
import { type Field } from './ClinicalAction';
import { runCommand } from '../actions/commands';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { pillClass } from './ActionButton';

const newKey = (op: string) => `${op}:${crypto.randomUUID()}`;
const inputClass = 'h-11 w-full min-w-0 rounded-md border bg-background px-2 text-sm';

/** Dollars typed by a person → whole cents, without ever passing through a float. */
export function dollarsToMinor(text: string): string | null {
  const m = /^\s*\$?\s*(\d{1,12})(?:\.(\d{1,2}))?\s*$/.exec(text.replace(/,/g, ''));
  if (!m) return null;
  return `${m[1]}${(m[2] ?? '').padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
}

export type BillingField = Omit<Field, 'type'> & { type?: Field['type'] | 'money' | 'date' };

/**
 * One billingCommand op (mutations/billing.ts). With `fields` it opens a small form; amounts are typed in dollars and sent as
 * whole cents. The idempotency key is made once per intent and kept until the command succeeds.
 */
export function BillingAction({ op, input = {}, children, fields, confirm, className, onDone }: {
  op: string; input?: Record<string, unknown>; children: React.ReactNode; fields?: BillingField[]; confirm?: string; className?: string; onDone?: (data: unknown) => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const key = React.useRef<{ key: string; body: string } | null>(null);

  const submit = (extra: Record<string, unknown>) => {
    setError('');
    const payload = { ...input, ...extra };
    const body = JSON.stringify(payload);
    if (key.current?.body !== body) key.current = { key: newKey(op), body };
    const idempotencyKey = key.current.key;
    start(async () => {
      const r = await runCommand('billingCommand', { op, input: payload }, idempotencyKey);
      if (!r.ok) setError(r.error);
      else { key.current = null; setOpen(false); onDone?.(r.data); router.refresh(); }
    });
  };

  if (!fields?.length) {
    return (
      <span className="inline-flex max-w-full flex-col items-start gap-1">
        <button type="button" disabled={pending} className={cn(pillClass, 'min-h-11', className)} onClick={() => { if (confirm && !window.confirm(confirm)) return; submit({}); }}>
          {pending ? 'Working' : children}
        </button>
        {error ? <span role="alert" className="max-w-xs break-words text-xs text-red-600">{error}</span> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-2">
      <button type="button" className={cn(pillClass, 'min-h-11', className)} onClick={() => setOpen(v => !v)} aria-expanded={open}>{children}</button>
      {open ? (
        <form
          className="grid w-full min-w-60 max-w-md gap-2 rounded-md border bg-card p-3"
          onSubmit={e => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const out: Record<string, unknown> = {};
            for (const f of fields) {
              const raw = data.get(f.name);
              if (f.type === 'checkbox') { out[f.name] = raw === 'on'; continue; }
              const text = typeof raw === 'string' ? raw.trim() : '';
              if (text === '') continue;
              if (f.type === 'money') {
                const minor = dollarsToMinor(text);
                if (minor === null) { setError(`${f.label}: enter dollars and cents, like 1,250.00`); return; }
                out[f.name] = minor;
              } else out[f.name] = text;
            }
            submit(out);
          }}
        >
          {fields.map(f => (
            <label key={f.name} className="grid gap-1 text-xs font-medium">
              {f.label}
              {f.type === 'select' ? (
                <select name={f.name} required={f.required} defaultValue={f.defaultValue ?? ''} className={inputClass}>
                  <option value="">Choose…</option>
                  {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea name={f.name} required={f.required} rows={3} placeholder={f.placeholder} defaultValue={f.defaultValue} className="min-w-0 rounded-md border bg-background p-2 text-sm" />
              ) : f.type === 'checkbox' ? (
                <input name={f.name} type="checkbox" defaultChecked={f.defaultValue === 'true'} className="size-5" />
              ) : (
                <input name={f.name} type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'money' ? 'decimal' : undefined} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} className={inputClass} />
              )}
            </label>
          ))}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className={cn(pillClass, 'min-h-11 bg-primary text-primary-foreground')}>{pending ? 'Working' : 'Save'}</button>
            <button type="button" className="min-h-11 text-xs underline" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {error ? <span role="alert" className="break-words text-xs text-red-600">{error}</span> : null}
        </form>
      ) : null}
    </span>
  );
}
