import Link from 'next/link';
import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs, Tabs } from '../../components/ui';

type Event = {
  id: string; seq: number; kind: string; effectiveAt: string; recordedAt: string; leaveKind: string | null; holdElected: boolean; holdPaidBy: string | null; dischargeDisposition: string | null; initiatedBy: string | null; correctionReason: string;
  fromBed: { label: string } | null; toBed: { label: string } | null; fromApartment: { number: string } | null; toApartment: { number: string } | null;
  actor: { name: string } | null; actorAgent: { name: string } | null; hash: string;
  stay: { id: string; reference: string; resident: { id: string; firstName: string; preferredName: string; lastName: string } | null } | null;
};

const KINDS = [
  { key: 'all', label: 'All' },
  { key: 'admission', label: 'Admissions', kinds: ['admission', 'readmission'] },
  { key: 'room_change', label: 'Room changes', kinds: ['room_change'] },
  { key: 'leave', label: 'Leaves', kinds: ['leave_start', 'leave_end', 'hold_release'] },
  { key: 'discharge', label: 'Discharges', kinds: ['discharge', 'death'] },
  { key: 'correction', label: 'Corrections', kinds: ['correction'] },
];
const PAGE = 60;

const place = (b: { label: string } | null, a: { number: string } | null) => b?.label ?? (a ? `Apt ${a.number}` : '');

function describe(e: Event) {
  switch (e.kind) {
    case 'admission': case 'readmission': return `to ${place(e.toBed, e.toApartment)}`;
    case 'room_change': return `${place(e.fromBed, e.fromApartment)} → ${place(e.toBed, e.toApartment)}`;
    case 'leave_start': return `${label(e.leaveKind ?? 'other').toLowerCase()} · ${e.holdElected ? `bed held${e.holdPaidBy ? ` (${label(e.holdPaidBy).toLowerCase()})` : ''}` : 'no hold'}`;
    case 'leave_end': return e.toBed || e.toApartment ? `to ${place(e.toBed, e.toApartment)}` : 'to held bed';
    case 'discharge': return `${label(e.dischargeDisposition ?? 'other').toLowerCase()}${e.initiatedBy === 'facility' ? ' · facility-initiated' : ''}`;
    case 'correction': return e.correctionReason;
    default: return '';
  }
}

/** The append-only census log, newest first. Each row is hash-chained to the previous event of its stay. */
export default async function CensusEventsPage({ searchParams }: { searchParams?: Promise<{ community?: string; kind?: string; stay?: string; before?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Census events"><Empty>No community is assigned to you yet.</Empty></Page>;
  const kind = KINDS.find(k => k.key === params.kind) ?? KINDS[0];
  const stayId = /^[a-z0-9_-]{6,64}$/i.test(params.stay ?? '') ? params.stay! : null;
  const before = params.before && !Number.isNaN(Date.parse(params.before)) ? new Date(params.before).toISOString() : null;
  const where = {
    AND: [
      { stay: { community: { id: { equals: community.id } } } },
      ...(kind.kinds ? [{ kind: { in: kind.kinds } }] : []),
      ...(stayId ? [{ stay: { id: { equals: stayId } } }] : []),
      ...(before ? [{ effectiveAt: { lt: before } }] : []),
    ],
  };
  const { censusEvents } = await q<{ censusEvents: Event[] }>(`query Events($where: CensusEventWhereInput!, $take: Int!) {
    censusEvents(where: $where, orderBy: [{ effectiveAt: desc }], take: $take) {
      id seq kind effectiveAt recordedAt leaveKind holdElected holdPaidBy dischargeDisposition initiatedBy correctionReason hash
      fromBed { label } toBed { label } fromApartment { number } toApartment { number } actor { name } actorAgent { name }
      stay { id reference resident { id firstName preferredName lastName } }
    }
  }`, { where, take: PAGE });
  const base = `/dashboard/platform/census/events?community=${community.slug}${stayId ? `&stay=${stayId}` : ''}`;
  const tz = community.timeZone;
  const last = censusEvents.at(-1);
  return (
    <Page title="Census events" crumbs={[{ label: 'Census', href: `/dashboard/platform/census?community=${community.slug}` }]}>
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/census/events" />
      <Tabs active={kind.key} items={KINDS.map(k => ({ key: k.key, label: k.label, href: `${base}&kind=${k.key}` }))} />
      {stayId ? <p className="text-sm text-muted-foreground">One stay only. <Link className="underline underline-offset-4" href={`/dashboard/platform/census/events?community=${community.slug}`}>Show every stay</Link></p> : null}
      <Section title={before ? `Before ${when(before, tz)}` : 'Most recent'}>
        {censusEvents.length ? censusEvents.map(e => {
          const who = e.stay?.resident ? `${e.stay.resident.preferredName || e.stay.resident.firstName} ${e.stay.resident.lastName}` : e.stay?.reference ?? 'Stay';
          const late = new Date(e.recordedAt).getTime() - new Date(e.effectiveAt).getTime() > 6 * 3_600_000;
          return (
            <Row key={e.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title aside={late ? <span className="text-xs text-amber-700 dark:text-amber-400">Recorded {when(e.recordedAt, tz)}</span> : null}>
                  {e.stay?.resident ? <Link className="hover:underline" href={`/dashboard/platform/census/residents/${e.stay.resident.id}?community=${community.slug}`}>{who}</Link> : who} · {label(e.kind)}
                </Title>
                <Meta>{describe(e)}{describe(e) ? ' · ' : ''}{when(e.effectiveAt, tz)} · {e.actor?.name ?? (e.actorAgent ? `agent ${e.actorAgent.name}` : 'system')}</Meta>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{e.stay?.reference} #{e.seq} · {e.hash.slice(0, 8)}</span>
            </Row>
          );
        }) : <Empty>No census events match.</Empty>}
      </Section>
      {censusEvents.length === PAGE && last ? <Link className="text-sm underline underline-offset-4" href={`${base}&kind=${kind.key}&before=${encodeURIComponent(last.effectiveAt)}`}>Older events</Link> : null}
    </Page>
  );
}
