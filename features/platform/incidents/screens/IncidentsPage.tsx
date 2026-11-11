import Link from 'next/link';
import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { INCIDENT_TYPES, NOT_FOR_ROLE } from '../../lib/clinical';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { ClinicalAction } from '../../components/ClinicalAction';

type Inc = { id: string; reference: string; kind: string; status: string; occurredAt: string; description: string; reportableDecision: string | null; resident: { firstName: string; lastName: string } | null };

/** Incidents for one community, newest first. */
export default async function IncidentsPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Incidents"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ incidents: Inc[] }>(`query I($c: ID!) { incidents(where: { community: { id: { equals: $c } } }, orderBy: { occurredAt: desc }, take: 100) { id reference kind status occurredAt description reportableDecision resident { firstName lastName } } }`, { c: community.id }).catch(() => null);
  if (!data) return <Page title="Incidents"><Empty>{NOT_FOR_ROLE('incidents')}</Empty></Page>;
  const tz = community.timeZone;
  return (
    <Page title="Incidents">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/incidents" />
      <Section title={`${data.incidents.length} incidents`} aside={<ClinicalAction op="incident.report" input={{ communityId: community.id }} fields={[{ name: 'kind', label: 'Type', type: 'select', options: INCIDENT_TYPES, required: true }, { name: 'description', label: 'Description', type: 'textarea', required: true }]}>Report</ClinicalAction>}>
        {data.incidents.length ? data.incidents.map(i => (
          <Row key={i.id} href={`/dashboard/platform/incidents/${i.id}?community=${community.slug}`}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={i.status}>{i.reference} · {label(i.kind)}</Title><Meta>{i.resident ? `${i.resident.firstName} ${i.resident.lastName} · ` : ''}{when(i.occurredAt, tz)}{i.reportableDecision ? ` · ${label(i.reportableDecision)}` : ''}</Meta></div>
          </Row>
        )) : <Empty>No incidents.</Empty>}
      </Section>
      <Meta>Abuse and neglect allegations start the F609 clocks. <Link className="underline" href={`/dashboard/platform/compliance?community=${community.slug}`}>See compliance clocks</Link></Meta>
    </Page>
  );
}
