import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { label } from '../lib/format';

// Senior-care status colours. Green: in good standing; amber: needs someone; blue: neutral or historical; red: stopped or failed.
const GREEN = ['active', 'approved', 'available', 'occupied', 'completed', 'confirmed', 'delivered', 'signed', 'final', 'granted', 'accepted', 'admitted', 'converted', 'moved_in', 'published', 'satisfied', 'ok', 'applied', 'acknowledged', 'reviewed_ok', 'succeeded', 'ready']
const AMBER = ['pending', 'requested', 'draft', 'running', 'proposed', 'invited', 'offered', 'reserved', 'held', 'on_leave', 'cleaning', 'turnover', 'clinical_review', 'payer_check', 'received', 'tour_scheduled', 'toured', 'waitlisted', 'inquiry', 'contacted', 'open', 'due', 'leased', 'medicaid_pending', 'started']
const BLUE = ['expired', 'superseded', 'ended', 'consumed', 'released', 'discharged', 'withdrawn', 'closed', 'converted_out', 'unknown', 'not_required']
const RED = ['rejected', 'cancelled', 'failed', 'dead', 'revoked', 'suspended', 'declined', 'lost', 'no_show', 'out_of_service', 'overdue', 'breached', 'broken', 'reviewed_violation', 'deceased', 'retired']
const DOT: Record<string, string> = Object.fromEntries([
  ...GREEN.map(v => [v, 'bg-emerald-500']), ...AMBER.map(v => [v, 'bg-amber-500']), ...BLUE.map(v => [v, 'bg-sky-500']), ...RED.map(v => [v, 'bg-red-500']),
])

export const dotClass = (value?: string | null) => DOT[value ?? ''] || 'bg-muted-foreground/50'

/** A coloured dot plus the human label of a status. Put it on the title line (see Title), never in a far column. */
export function Status({ value, className, text }: { value?: string | null; className?: string; text?: string }) {
  if (!value) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground', className)}>
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', dotClass(value))} />
      {text ?? label(value)}
    </span>
  );
}

/** Title line of a row: the name, then its status dot on the same line. */
export function Title({ children, status, statusText, aside }: { children: React.ReactNode; status?: string | null; statusText?: string; aside?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="min-w-0 break-words font-medium">{children}</span>
      {status ? <Status value={status} text={statusText} /> : null}
      {aside}
    </div>
  );
}

export function Page({ title, crumbs = [], children }: { title: string; crumbs?: { label: string; href?: string }[]; children: React.ReactNode }) {
  return (
    <PageContainer
      title={title}
      breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, ...crumbs.map((c) => ({ type: (c.href ? 'link' : 'page') as 'link' | 'page', label: c.label, href: c.href })), { type: 'page', label: title }]}
      header={<h1 className="text-xl font-semibold tracking-tight">{title}</h1>}
    >
      <div className="min-w-0 space-y-6 px-4 pb-10 md:px-6">{children}</div>
    </PageContainer>
  );
}

export function Tabs({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {items.map((i) => (
          <Link key={i.key} href={i.href} className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium', i.key === active ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
            {i.label}{i.count !== undefined ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">{i.count}</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3 border-b pb-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Row({ children, href, className }: { children: React.ReactNode; href?: string; className?: string }) {
  const cls = cn('flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-3 text-sm last:border-b-0', href && 'hover:bg-muted/40', className);
  return href ? <Link href={href} className={cls}>{children}</Link> : <div className={cls}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-sm text-muted-foreground">{children}</p>;
}

export function Stat({ name, value }: { name: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{name}</div>
      <div className="mt-1 break-words text-lg font-semibold">{value}</div>
    </div>
  );
}

export const Meta = ({ children }: { children: React.ReactNode }) => <span className="min-w-0 break-words text-xs text-muted-foreground">{children}</span>;
