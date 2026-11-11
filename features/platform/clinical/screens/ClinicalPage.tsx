import Link from 'next/link';
import { q, currentCommunity } from '../../lib/server';
import { NOT_FOR_ROLE } from '../../lib/clinical';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';

type Rostered = { residentId: string; residentReference: string; name: string; place: string | null; setting: string };

/** Clinical chart entry: the current residents of one community, each linking to the chart. */
export default async function ClinicalPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Clinical chart"><Empty>No community is assigned to you yet.</Empty></Page>;
  const loaded = await q<{ residentRoster: Rostered[] }>(`query R($id: ID!) { residentRoster(communityId: $id, status: "admitted") }`, { id: community.id }).catch(() => null);
  if (!loaded) return <Page title="Clinical chart"><Empty>{NOT_FOR_ROLE('the resident roster')}</Empty></Page>;
  return (
    <Page title="Clinical chart">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/clinical" />
      <Section title={`${loaded.residentRoster.length} current residents`}>
        {loaded.residentRoster.length ? loaded.residentRoster.map(r => (
          <Row key={r.residentId} href={`/dashboard/platform/clinical/${r.residentId}?community=${community.slug}`}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title>{r.name}</Title>
              <Meta>{r.place ?? 'No place'} · {r.residentReference}</Meta>
            </div>
          </Row>
        )) : <Empty>No current residents.</Empty>}
      </Section>
      <Meta>Open a resident to chart notes, vitals, assessments, orders and the care plan. <Link className="underline" href={`/dashboard/platform/emar?community=${community.slug}`}>Go to the eMAR</Link></Meta>
    </Page>
  );
}
