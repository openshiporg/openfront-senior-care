'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../actions/commands';
import { pillClass } from './ActionButton';

export type Field = {
  name: string; label: string; type?: 'text' | 'number' | 'select' | 'textarea' | 'checkbox' | 'datetime';
  options?: { value: string; label: string }[]; required?: boolean; placeholder?: string; defaultValue?: string;
};

const newKey = (op: string) => `${op}:${crypto.randomUUID()}`;
const inputClass = 'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm';

/**
 * One clinical command (the registry op in mutations/clinical.ts). With `fields` it opens a small inline form;
 * without, it is a single button. The idempotency key is kept per intent until the command succeeds.
 */
export function ClinicalAction({ op, input = {}, children, fields, confirm, className, onDone, wrap }: {
  op: string; input?: Record<string, unknown>; children: React.ReactNode; fields?: Field[]; confirm?: string; className?: string; onDone?: (data: unknown) => void;
  /** 'vitals': the form's kind and value become one entry of `readings`. */
  wrap?: 'vitals';
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const key = React.useRef<{ key: string; body: string } | null>(null);

  const submit = (extra: Record<string, unknown>) => {
    setError('');
    let payload: Record<string, unknown> = { ...input, ...extra };
    if (wrap === 'vitals') {
      const { kind, value, ...rest } = payload;
      payload = { ...rest, readings: [{ kind, value }] };
    }
    const body = JSON.stringify(payload);
    if (key.current?.body !== body) key.current = { key: newKey(op), body };
    const idempotencyKey = key.current.key;
    start(async () => {
      const r = await runCommand('clinicalCommand', { op, input: payload }, idempotencyKey);
      if (!r.ok) setError(r.error);
      else { key.current = null; setOpen(false); onDone?.(r.data); router.refresh(); }
    });
  };

  if (!fields?.length) {
    return (
      <span className="inline-flex max-w-full flex-col items-start gap-1">
        <button type="button" disabled={pending} className={cn(pillClass, className)} onClick={() => { if (confirm && !window.confirm(confirm)) return; submit({}); }}>
          {pending ? 'Working' : children}
        </button>
        {error ? <span role="alert" className="max-w-xs break-words text-xs text-red-600">{error}</span> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-2">
      <button type="button" className={cn(pillClass, className)} onClick={() => setOpen(v => !v)} aria-expanded={open}>{children}</button>
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
              out[f.name] = f.type === 'number' ? Number(text) : f.type === 'datetime' ? new Date(text).toISOString() : text;
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
                <input name={f.name} type="checkbox" defaultChecked={f.defaultValue === 'true'} className="size-4" />
              ) : (
                <input name={f.name} type={f.type === 'datetime' ? 'datetime-local' : f.type === 'number' ? 'number' : 'text'} step={f.type === 'number' ? 'any' : undefined} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} className={inputClass} />
              )}
            </label>
          ))}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className={cn(pillClass, 'bg-primary text-primary-foreground')}>{pending ? 'Working' : 'Save'}</button>
            <button type="button" className="text-xs underline" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {error ? <span role="alert" className="break-words text-xs text-red-600">{error}</span> : null}
        </form>
      ) : null}
    </span>
  );
}
