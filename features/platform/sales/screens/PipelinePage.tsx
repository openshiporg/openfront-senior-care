import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs, Tabs, Count } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

type Lead = {
  id: string; reference: string; status: string; lostReason: string | null; nextActionAt: string | null; version: number; createdAt: string; updatedAt: string;
  primaryContact: { firstName: string; lastName: string; phone: string; email: string } | null;
  prospects: { firstName: string; lastName: string; desiredSetting: string | null; desiredMoveIn: string | null }[];
  referralSource: { name: string } | null;
  tours: { id: string; status: string; kind: string; version: number; slot: { startsAt: string } | null }[];
};
type Referral = {
  id: string; reference: string; status: string; receivedAt: string; responseDueAt: string | null; expectedPayer: string | null; declineReason: string | null; version: number;
  source: { name: string } | null; prospect: { firstName: string; lastName: string } | null;
};
type Tour = { id: string; status: string; kind: string; version: number; slot: { startsAt: string } | null; lead: { id: string; reference: string; primaryContact: { firstName: string; lastName: string } | null } | null };

const OPEN_LEAD = ['new', 'contacted', 'tour_scheduled', 'toured', 'assessment_scheduled', 'assessed', 'deposit_received', 'move_in_scheduled', 'waitlisted', 'nurture'];
const STAGES = [
  { key: 'open', label: 'Open', statuses: OPEN_LEAD.filter(s => s !== 'nurture') },
  { key: 'nurture', label: 'Nurture', statuses: ['nurture'] },
  { key: 'moved_in', label: 'Moved in', statuses: ['moved_in'] },
  { key: 'lost', label: 'Lost', statuses: ['lost'] },
];
const OPEN_REFERRAL = ['received', 'clinical_review', 'payer_check', 'accepted'];

/** Sales pipeline: hospital referrals with their response clock, upcoming tours, then leads by stage. */
export default async function PipelinePage({ searchParams }: { searchParams?: Promise<{ community?: string; stage?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Pipeline"><Empty>No community is assigned to you yet.</Empty></Page>;
  const stage = STAGES.find(s => s.key === params.stage) ?? STAGES[0];
  const now = new Date().toISOString();
  const data = await q<{ leads: Lead[]; referrals: Referral[]; tours: Tour[]; counts: { status: string }[] }>(`query Pipeline($c: ID!, $statuses: [String!]!, $openRef: [String!]!, $now: DateTime!) {
    leads(where: { community: { id: { equals: $c } }, status: { in: $statuses } }, orderBy: { updatedAt: desc }, take: 80) {
      id reference status lostReason nextActionAt version createdAt updatedAt
      primaryContact { firstName lastName phone email } prospects { firstName lastName desiredSetting desiredMoveIn } referralSource { name }
      tours(orderBy: { createdAt: desc }, take: 1) { id status kind version slot { startsAt } }
    }
    referrals(where: { community: { id: { equals: $c } }, status: { in: $openRef } }, orderBy: { receivedAt: asc }) { id reference status receivedAt responseDueAt expectedPayer declineReason version source { name } prospect { firstName lastName } }
    tours(where: { community: { id: { equals: $c } }, status: { in: ["requested", "confirmed"] }, slot: { startsAt: { gte: $now } } }, orderBy: { createdAt: asc }, take: 20) { id status kind version slot { startsAt } lead { id reference primaryContact { firstName lastName } } }
    counts: leads(where: { community: { id: { equals: $c } } }) { status }
  }`, { c: community.id, statuses: stage.statuses, openRef: OPEN_REFERRAL, now });
  const tz = community.timeZone;
  const base = `/dashboard/platform/sales?community=${community.slug}`;
  const paths = ['/dashboard/platform/sales'];
  const byStatus = new Map<string, number>();
  for (const l of data.counts) byStatus.set(l.status, (byStatus.get(l.status) ?? 0) + 1);
  const tours = [...data.tours].sort((a, b) => (a.slot?.startsAt ?? '').localeCompare(b.slot?.startsAt ?? ''));
  return (
    <Page title="Pipeline" crumbs={[{ label: 'Sales' }]}>
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/sales" />
      <div className="flex flex-wrap gap-x-5 gap-y-2">{OPEN_LEAD.filter(s => byStatus.get(s)).map(s => <Count key={s} status={s} n={byStatus.get(s)!} />)}</div>
      <Section title={`Hospital and agency referrals · ${data.referrals.length}`}>
        {data.referrals.length ? data.referrals.map(r => {
          const overdue = r.status !== 'accepted' && r.responseDueAt && r.responseDueAt < now;
          const next = r.status === 'received' ? 'clinical_review' : r.status === 'clinical_review' ? 'payer_check' : null;
          return (
            <Row key={r.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={overdue ? 'overdue' : r.status} statusText={overdue ? 'Response overdue' : undefined}>{r.prospect ? `${r.prospect.firstName} ${r.prospect.lastName}` : r.reference}</Title>
                <Meta>{r.source?.name ?? 'Direct'} · received {when(r.receivedAt, tz)}{r.expectedPayer ? ` · ${label(r.expectedPayer)}` : ''}{r.responseDueAt && r.status !== 'accepted' ? ` · answer by ${when(r.responseDueAt, tz)}` : ''}</Meta>
              </div>
              <div className="flex flex-wrap gap-2">
                {next ? <ActionButton op="moveReferral" vars={{ referralId: r.id, to: next, expectedVersion: r.version }} paths={paths}>{next === 'clinical_review' ? 'Start review' : 'Check payer'}</ActionButton> : null}
                {r.status !== 'accepted' ? <ActionButton op="moveReferral" vars={{ referralId: r.id, to: 'declined', declineReason: 'other', expectedVersion: r.version }} confirm="Decline this referral? The hospital is told the community can't take the patient." paths={paths}>Decline</ActionButton> : null}
              </div>
            </Row>
          );
        }) : <Empty>No open referrals.</Empty>}
      </Section>
      <Section title={`Upcoming tours · ${tours.length}`}>
        {tours.length ? tours.map(t => (
          <Row key={t.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={t.status}>{t.lead?.primaryContact ? `${t.lead.primaryContact.firstName} ${t.lead.primaryContact.lastName}` : t.lead?.reference ?? 'Guest'}</Title>
              <Meta>{when(t.slot?.startsAt, tz)} · {label(t.kind).toLowerCase()} tour</Meta>
            </div>
            <div className="flex flex-wrap gap-2">
              {t.status === 'requested' ? <ActionButton op="moveTour" vars={{ tourId: t.id, to: 'confirmed', expectedVersion: t.version }} paths={paths}>Confirm</ActionButton> : null}
              <ActionButton op="moveTour" vars={{ tourId: t.id, to: 'cancelled', expectedVersion: t.version }} ask="Why is this tour cancelled?" paths={paths}>Cancel</ActionButton>
            </div>
          </Row>
        )) : <Empty>No tours booked ahead.</Empty>}
      </Section>
      <Tabs active={stage.key} items={STAGES.map(s => ({ key: s.key, label: s.label, href: `${base}&stage=${s.key}`, count: s.statuses.reduce((n, st) => n + (byStatus.get(st) ?? 0), 0) }))} />
      <Section title={`${stage.label} leads`}>
        {data.leads.length ? data.leads.map(l => {
          const contact = l.primaryContact ? `${l.primaryContact.firstName} ${l.primaryContact.lastName}` : l.reference;
          const prospect = l.prospects[0];
          const tour = l.tours[0];
          return (
            <Row key={l.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={l.status}>{contact}</Title>
                <Meta>
                  {prospect && `${prospect.firstName} ${prospect.lastName}` !== contact ? `For ${prospect.firstName} ${prospect.lastName} · ` : ''}
                  {prospect?.desiredSetting ? `${label(prospect.desiredSetting)} · ` : ''}
                  {l.referralSource ? `${l.referralSource.name} · ` : ''}
                  {l.status === 'lost' && l.lostReason ? `${label(l.lostReason)} · ` : ''}
                  {tour?.slot ? `tour ${when(tour.slot.startsAt, tz, 'day')} (${label(tour.status).toLowerCase()}) · ` : ''}
                  updated {when(l.updatedAt, tz, 'day')} · <span className="font-mono">{l.reference}</span>
                </Meta>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {tour?.status === 'confirmed' && tour.slot && tour.slot.startsAt < now ? <ActionButton op="moveTour" vars={{ tourId: tour.id, to: 'completed', expectedVersion: tour.version }} paths={paths}>Toured</ActionButton> : null}
                {l.status !== 'moved_in' && l.status !== 'lost' ? <ActionButton op="moveLead" vars={{ leadId: l.id, to: 'lost', lostReason: 'no_response', expectedVersion: l.version }} confirm="Mark this lead lost (no response)?" paths={paths}>Lost</ActionButton> : null}
              </div>
            </Row>
          );
        }) : <Empty>No leads at this stage.</Empty>}
      </Section>
    </Page>
  );
}
