import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs, Tabs } from '../../components/ui';

type Rostered = {
  stayId: string; stayReference: string; setting: string; status: string; presence: string; admittedAt: string | null; dischargedAt: string | null;
  residentId: string; residentReference: string; name: string; place: string | null; payer: { name: string; kind: string } | null;
};

const VIEWS = [
  { key: 'admitted', label: 'Current' },
  { key: 'pre_admit', label: 'Pre-admission' },
  { key: 'discharged', label: 'Discharged' },
  { key: 'deceased', label: 'Deceased' },
];

/** Resident roster for one community, grouped by setting. Reading names writes a protected-data read audit. */
export default async function ResidentsPage({ searchParams }: { searchParams?: Promise<{ community?: string; view?: string; setting?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Residents"><Empty>No community is assigned to you yet.</Empty></Page>;
  const view = VIEWS.some(v => v.key === params.view) ? params.view! : 'admitted';
  const { residentRoster: roster } = await q<{ residentRoster: Rostered[] }>(`query Roster($id: ID!, $status: String) { residentRoster(communityId: $id, status: $status) }`, { id: community.id, status: view });
  const ORDER = ['nursing_facility', 'assisted_living', 'memory_care', 'independent_living'];
  const present = ORDER.filter(st => roster.some(r => r.setting === st));
  const setting = present.includes(params.setting ?? '') ? params.setting! : 'all';
  const settings = setting === 'all' ? present : [setting];
  const base = `/dashboard/platform/census/residents?community=${community.slug}`;
  return (
    <Page title="Residents" crumbs={[{ label: 'Census', href: `/dashboard/platform/census?community=${community.slug}` }]}>
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/census/residents" />
      <Tabs active={view} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `${base}&view=${v.key}`, count: v.key === view ? roster.length : undefined }))} />
      {present.length > 1 ? (
        <Tabs active={setting} items={[{ key: 'all', label: 'All settings', href: `${base}&view=${view}`, count: roster.length }, ...present.map(st => ({ key: st, label: label(st), href: `${base}&view=${view}&setting=${st}`, count: roster.filter(r => r.setting === st).length }))]} />
      ) : null}
      {roster.length ? settings.map(setting => {
        const rows = roster.filter(r => r.setting === setting).sort((a, b) => (view === 'admitted' ? a.name.localeCompare(b.name) : 0));
        return (
          <Section key={setting} title={`${label(setting)} · ${rows.length}`}>
            {rows.map(r => (
              <Row key={r.stayId} href={`/dashboard/platform/census/residents/${r.residentId}?community=${community.slug}`}>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <Title status={view === 'admitted' ? r.presence : r.status}>{r.name}</Title>
                  <Meta>
                    {r.place ? `${r.place} · ` : ''}{r.payer ? `${r.payer.name} · ` : ''}
                    {view === 'admitted' || view === 'pre_admit' ? `admitted ${when(r.admittedAt, community.timeZone, 'day')}` : `left ${when(r.dischargedAt, community.timeZone, 'day')}`}
                  </Meta>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{r.residentReference}</span>
              </Row>
            ))}
          </Section>
        );
      }) : <Empty>No residents in this view.</Empty>}
    </Page>
  );
}
