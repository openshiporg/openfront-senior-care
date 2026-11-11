import Link from 'next/link';
import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { ActionButton } from '../../components/ActionButton';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';

type Summary = { date: string; totals: { present: number; inHouse: number; onLeaveHold: number; bySetting: Record<string, number>; byPayer: Record<string, number> }; beds: Record<string, number>; apartments: Record<string, number>; closedThrough: string | null };
type Clock = { id: string; obligationCode: string; status: string; dueAt: string; resident: { id: string; firstName: string; preferredName: string; lastName: string } | null; obligation: { description: string } | null };
type Event = { id: string; kind: string; effectiveAt: string; stay: { resident: { id: string; firstName: string; preferredName: string; lastName: string } | null } | null };

const SETTINGS = ['nursing_facility', 'assisted_living', 'memory_care', 'independent_living'];
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
/** The obligation as a phrase for a row: "Signed admission agreement on file" (no trailing period). */
const obligationText = (c: { obligation?: { description: string } | null; obligationCode: string }) => (c.obligation?.description || label(c.obligationCode.toLowerCase())).replace(/\.\s*$/, '');
const nameOf = (r: { firstName: string; preferredName: string; lastName: string }) => `${r.preferredName || r.firstName} ${r.lastName}`;

/** The administrator's morning view: tonight's census by level of care, what's due, and what changed. */
export default async function HomePage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const { community, communities } = await currentCommunity((await searchParams)?.community);
  if (!community) {
    return (
      <Page title="Today">
        <Empty>No community yet. Use “Load Maple Ridge” in the sidebar to load an operator, a community and its census, or ask an administrator to assign you to a community.</Empty>
      </Page>
    );
  }
  const tz = community.timeZone;
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const safe = async <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [summary, clocks, events, pending] = await Promise.all([
    safe(q<{ censusSummary: Summary }>(`query H($c: ID!) { censusSummary(communityId: $c) }`, { c: community.id }).then(d => d.censusSummary), null),
    safe(q<{ complianceClocks: Clock[]; overdue: number }>(`query K($c: ID!) {
      complianceClocks(where: { community: { id: { equals: $c } }, current: { equals: true }, status: { in: ["overdue", "open"] } }, orderBy: { dueAt: asc }, take: 6) { id obligationCode status dueAt resident { id firstName preferredName lastName } obligation { description } }
      overdue: complianceClocksCount(where: { community: { id: { equals: $c } }, current: { equals: true }, status: { equals: "overdue" } })
    }`, { c: community.id }), null),
    safe(q<{ censusEvents: Event[] }>(`query E($c: ID!, $since: DateTime!) {
      censusEvents(where: { stay: { community: { id: { equals: $c } } }, effectiveAt: { gte: $since }, kind: { not: { equals: "correction" } } }, orderBy: { effectiveAt: desc }, take: 8) { id kind effectiveAt stay { resident { id firstName preferredName lastName } } }
    }`, { c: community.id, since }).then(d => d.censusEvents), []),
    safe(q<{ referrals: number; offers: number; approvals: number }>(`query P($c: ID!) {
      referrals: referralsCount(where: { community: { id: { equals: $c } }, status: { in: ["received", "clinical_review", "payer_check"] } })
      offers: waitlistEntriesCount(where: { community: { id: { equals: $c } }, status: { equals: "offered" } })
      approvals: approvalRequestsCount(where: { status: { equals: "pending" } })
    }`, { c: community.id }), null),
  ]);
  const slug = community.slug;
  return (
    <Page title="Today">
      <CommunityTabs communities={communities} active={slug} path="/dashboard" />
      {summary ? (
        <section className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{community.name} · {when(summary.date, tz, 'date')}</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">{summary.totals.present} <span className="text-base font-normal text-muted-foreground">residents</span></div>
            </div>
            <Meta>{summary.totals.inHouse} in the building · {summary.totals.onLeaveHold} on leave with a bed held · {summary.closedThrough ? `census signed off through ${when(summary.closedThrough, tz, 'date')}` : 'no census day signed off yet'}</Meta>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SETTINGS.filter(st => summary.totals.bySetting[st] !== undefined).map(st => (
              <div key={st} className="min-w-0">
                <div className="text-xs text-muted-foreground">{label(st)}</div>
                <div className="text-lg font-semibold tabular-nums">{summary.totals.bySetting[st]}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-sm">
            <span><span className="font-medium tabular-nums">{summary.beds.available ?? 0}</span> <span className="text-muted-foreground">of {sum(summary.beds)} nursing beds ready</span></span>
            <span><span className="font-medium tabular-nums">{summary.apartments.available ?? 0}</span> <span className="text-muted-foreground">of {sum(summary.apartments)} apartments ready</span></span>
            {Object.entries(summary.totals.byPayer).sort((a, b) => b[1] - a[1]).map(([k, n]) => <span key={k}><span className="font-medium tabular-nums">{n}</span> <span className="text-muted-foreground">{label(k)}</span></span>)}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="font-medium underline underline-offset-4" href={`/dashboard/platform/census?community=${slug}`}>Bed board</Link>
            <Link className="font-medium underline underline-offset-4" href={`/dashboard/platform/census/midnight?community=${slug}`}>Midnight census</Link>
            <Link className="font-medium underline underline-offset-4" href={`/dashboard/platform/census/residents?community=${slug}`}>Residents</Link>
          </div>
        </section>
      ) : <Empty>Your role doesn&apos;t include the census. Use the menu for the screens you can open.</Empty>}
      {pending && (pending.referrals || pending.offers || pending.approvals) ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {pending.referrals ? <Link className="hover:underline" href={`/dashboard/platform/sales?community=${slug}`}><span className="font-medium">{pending.referrals}</span> referrals waiting for an answer</Link> : null}
          {pending.offers ? <Link className="hover:underline" href={`/dashboard/platform/sales/waitlist?community=${slug}`}><span className="font-medium">{pending.offers}</span> waitlist offers out</Link> : null}
          {pending.approvals ? <Link className="hover:underline" href="/dashboard/platform/approvals"><span className="font-medium">{pending.approvals}</span> approvals waiting</Link> : null}
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {clocks ? (
          <Section title={`Deadlines${clocks.overdue ? ` · ${clocks.overdue} overdue` : ''}`} aside={<Link className="text-xs underline underline-offset-4" href={`/dashboard/platform/compliance?community=${slug}`}>All</Link>}>
            {clocks.complianceClocks.length ? clocks.complianceClocks.map(c => (
              <Row key={c.id}>
                <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                  <Title status={c.status}>{c.resident ? <Link className="hover:underline" href={`/dashboard/platform/census/residents/${c.resident.id}?community=${slug}`}>{nameOf(c.resident)}</Link> : obligationText(c)}</Title>
                  <Meta>{c.resident ? `${obligationText(c)} · ` : ''}due {when(c.dueAt, tz)}</Meta>
                </div>
              </Row>
            )) : <Empty>Nothing is due.</Empty>}
          </Section>
        ) : null}
        <Section title="Census changes, last 3 days" aside={<Link className="text-xs underline underline-offset-4" href={`/dashboard/platform/census/events?community=${slug}`}>All</Link>}>
          {events.length ? events.map(e => (
            <Row key={e.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <span className="font-medium">{e.stay?.resident ? nameOf(e.stay.resident) : 'Resident'} · {label(e.kind).toLowerCase()}</span>
                <Meta>{when(e.effectiveAt, tz)}</Meta>
              </div>
            </Row>
          )) : <Empty>No census changes in the last 3 days.</Empty>}
        </Section>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Meta>Updated {when(new Date().toISOString(), tz, 'time')}</Meta>
        <ActionButton op="refreshTimedStates" vars={{}} paths={['/dashboard']}>Refresh deadlines, holds and offers</ActionButton>
      </div>
    </Page>
  );
}
