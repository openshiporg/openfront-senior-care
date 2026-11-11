import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

type Totals = { present: number; inHouse: number; onLeaveHold: number; bySetting: Record<string, number>; byPayer: Record<string, number> };
type Signoff = { id: string; date: string; totals: Totals; signedAt: string; note: string; signedBy: { name: string } | null };
type Summary = { date: string; totals: Totals; closedThrough: string | null };

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const breakdown = (rec: Record<string, number>) => Object.entries(rec).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${label(k).toLowerCase()}`).join(' · ');

/**
 * Midnight census: who was here at 23:59 each night. A person signs off each ended day; once signed
 * it is closed, and a later census change dated on or before it needs a second person's approval.
 */
export default async function MidnightPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const { community, communities } = await currentCommunity((await searchParams)?.community);
  if (!community) return <Page title="Midnight census"><Empty>No community is assigned to you yet.</Empty></Page>;
  const tz = community.timeZone;
  const today = await q<{ censusSummary: Summary }>(`query S($id: ID!) { censusSummary(communityId: $id) }`, { id: community.id }).catch(() => null);
  if (!today) return <Page title="Midnight census"><Empty>Your role doesn&apos;t include the midnight census. Use the menu for the screens you can open.</Empty></Page>;
  const yesterday = addDays(today.censusSummary.date, -1);
  const data = await q<{ y: Summary; censusSignoffs: Signoff[] }>(`query M($id: ID!, $date: String!) {
    y: censusSummary(communityId: $id, date: $date)
    censusSignoffs(where: { community: { id: { equals: $id } } }, orderBy: { date: desc }, take: 31) { id date totals signedAt note signedBy { name } }
  }`, { id: community.id, date: yesterday });
  const closed = data.y.closedThrough;
  // Days that ended and aren't closed yet, oldest first (at most a week shown).
  const pending: string[] = [];
  for (let d = closed ? addDays(closed, 1) : yesterday; d <= yesterday && pending.length < 7; d = addDays(d, 1)) pending.push(d);
  const paths = ['/dashboard/platform/census/midnight', '/dashboard/platform/census'];
  return (
    <Page title="Midnight census" crumbs={[{ label: 'Census', href: `/dashboard/platform/census?community=${community.slug}` }]}>
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/census/midnight" />
      <Section title="Waiting for sign-off">
        {pending.length ? pending.map(date => {
          const t = date === yesterday ? data.y.totals : null;
          return (
            <Row key={date}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status="pending" statusText="Not signed off">{when(date, tz, 'date')}</Title>
                <Meta>{t ? `${t.present} residents at midnight · ${t.onLeaveHold} on leave with a bed held · ${breakdown(t.bySetting)}` : 'Signing off includes every earlier open day.'}</Meta>
              </div>
              {date === pending.at(-1) ? <ActionButton op="signOffCensusDay" vars={{ communityId: community.id, date }} confirm={`Sign off the census through ${when(date, tz, 'date')}? Later changes to these days will need a second person's approval.`} paths={paths}>Sign off</ActionButton> : null}
            </Row>
          );
        }) : <Empty>Every ended day is signed off. Today&apos;s census can be signed off after midnight.</Empty>}
      </Section>
      <Section title="Signed off">
        {data.censusSignoffs.length ? data.censusSignoffs.map(s => (
          <Row key={s.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status="signed" statusText="Closed">{when(s.date, tz, 'date')}</Title>
              <Meta>{s.totals.present} residents · {breakdown(s.totals.byPayer ?? {})}</Meta>
              <Meta>Signed by {s.signedBy?.name ?? 'someone'} · {when(s.signedAt, tz)}{s.note ? ` · ${s.note}` : ''}</Meta>
            </div>
            <span className="text-sm font-medium tabular-nums">{s.totals.present}</span>
          </Row>
        )) : <Empty>No census day is signed off yet.</Empty>}
      </Section>
    </Page>
  );
}
