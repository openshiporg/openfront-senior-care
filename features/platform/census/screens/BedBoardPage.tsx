import Link from 'next/link';
import { cn } from '@/lib/utils';
import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Empty, Count, CommunityTabs, Tabs, dotClass } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

type Occupant = { stayId: string; presence: string; residentId?: string; name?: string; held?: boolean };
type Bed = { id: string; label: string; status: string; version: number; certification: string; statusReason: string; room: string; roomKind: string; occupant: Occupant | null };
type Apartment = { id: string; number: string; status: string; version: number; capacity: number; occupantCount: number; type: string | null; occupants: Occupant[] };
type Unit = { id: string; name: string; code: string; setting: string; specialty: string; secured: boolean; beds: Bed[]; apartments: Apartment[] };
type Summary = { date: string; totals: { present: number; inHouse: number; onLeaveHold: number; bySetting: Record<string, number> }; beds: Record<string, number>; apartments: Record<string, number>; closedThrough: string | null };

const BED_ORDER = ['occupied', 'held', 'reserved', 'cleaning', 'available', 'out_of_service'];
const APT_ORDER = ['occupied', 'reserved', 'turnover', 'available', 'out_of_service'];

/** Census home: today's census strip, then every unit's beds or apartments with live status. */
export default async function BedBoardPage({ searchParams }: { searchParams?: Promise<{ community?: string; unit?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Bed board"><Empty>No community is assigned to you yet. Load the operator setup from the dashboard home, or ask an administrator to assign you.</Empty></Page>;
  const data = await q<{ bedBoard: Unit[]; censusSummary: Summary }>(`query Board($id: ID!) { bedBoard(communityId: $id) censusSummary(communityId: $id) }`, { id: community.id });
  const units = data.bedBoard;
  const s = data.censusSummary;
  const unitCode = params.unit && units.some(u => u.code === params.unit) ? params.unit : 'all';
  const shown = unitCode === 'all' ? units : units.filter(u => u.code === unitCode);
  const base = `/dashboard/platform/census?community=${community.slug}`;
  return (
    <Page title="Bed board" crumbs={[{ label: 'Census' }]}>
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/census" />
      <section className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
        <Strip name="In the building tonight" value={s.totals.inHouse} sub={`${s.totals.present} residents, ${s.totals.onLeaveHold} on leave`} />
        <Strip name="Nursing beds" value={`${(s.beds.occupied ?? 0) + (s.beds.held ?? 0)} of ${Object.values(s.beds).reduce((a, b) => a + b, 0)}`} sub={`${s.beds.available ?? 0} ready to admit`} />
        <Strip name="Apartments" value={`${s.apartments.occupied ?? 0} of ${Object.values(s.apartments).reduce((a, b) => a + b, 0)}`} sub={`${s.apartments.available ?? 0} ready to lease`} />
        <Strip name="Census signed off through" value={s.closedThrough ? when(s.closedThrough, community.timeZone, 'date') : 'No day yet'} sub={<Link className="underline underline-offset-4" href={`/dashboard/platform/census/midnight?community=${community.slug}`}>Midnight census</Link>} />
      </section>
      <Tabs active={unitCode} items={[{ key: 'all', label: 'All units', href: base }, ...units.map(u => ({ key: u.code, label: u.name, href: `${base}&unit=${u.code}` }))]} />
      {shown.map(unit => <UnitSection key={unit.id} unit={unit} slug={community.slug} />)}
    </Page>
  );
}

function Strip({ name, value, sub }: { name: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{name}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function UnitSection({ unit, slug }: { unit: Unit; slug: string }) {
  const counts = new Map<string, number>();
  for (const p of [...unit.beds, ...unit.apartments]) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
  const order = unit.beds.length ? BED_ORDER : APT_ORDER;
  const paths = ['/dashboard/platform/census'];
  return (
    <Section title={`${unit.name} · ${label(unit.setting)}${unit.secured ? ' · secured' : ''}`} aside={<div className="hidden flex-wrap gap-3 sm:flex">{order.filter(st => counts.get(st)).map(st => <Count key={st} status={st} n={counts.get(st)!} />)}</div>}>
      <div className="flex flex-wrap gap-3 sm:hidden">{order.filter(st => counts.get(st)).map(st => <Count key={st} status={st} n={counts.get(st)!} />)}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {unit.beds.map(bed => (
          <Tile key={bed.id} title={bed.label} status={bed.status} sub={bed.roomKind === 'isolation' ? 'Isolation room' : label(bed.certification)}>
            {bed.occupant ? <Who o={bed.occupant} slug={slug} /> : bed.statusReason ? <span className="text-xs text-muted-foreground">{bed.statusReason}</span> : null}
            {bed.status === 'cleaning' ? <ActionButton op="markPlaceReady" vars={{ bedId: bed.id, expectedVersion: bed.version }} paths={paths} className="h-7 px-2 text-xs">Mark ready</ActionButton> : null}
          </Tile>
        ))}
        {[...unit.apartments].sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true })).map(apt => (
          <Tile key={apt.id} title={`Apt ${apt.number}`} status={apt.status} sub={`${apt.type ?? 'Apartment'}${apt.capacity > 1 ? ` · ${apt.occupantCount} of ${apt.capacity}` : ''}`}>
            {apt.occupants.map(o => <Who key={o.stayId} o={o} slug={slug} />)}
            {apt.status === 'turnover' ? <ActionButton op="markPlaceReady" vars={{ apartmentId: apt.id, expectedVersion: apt.version }} paths={paths} className="h-7 px-2 text-xs">Mark ready</ActionButton> : null}
          </Tile>
        ))}
      </div>
    </Section>
  );
}

function Tile({ title, status, sub, children }: { title: string; status: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className={cn('min-w-0 space-y-1 rounded-md border p-2.5', status === 'available' && 'border-emerald-500/40', status === 'out_of_service' && 'bg-muted/50')}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full', dotClass(status))} />
        <span className="font-mono text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{label(status)}</span>
      </div>
      <div className="truncate text-xs text-muted-foreground">{sub}</div>
      {children}
    </div>
  );
}

function Who({ o, slug }: { o: Occupant; slug: string }) {
  const away = o.presence !== 'in_house';
  return (
    <div className="min-w-0 text-sm">
      {o.residentId ? <Link href={`/dashboard/platform/census/residents/${o.residentId}?community=${slug}`} className="block truncate font-medium hover:underline">{o.name}</Link> : <span className="block truncate">Occupied</span>}
      {away ? <span className="text-xs text-amber-700 dark:text-amber-400">{label(o.presence)}</span> : null}
    </div>
  );
}
