import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';

type Week = { id: string; reference: string; weekStart: string; weekEnd: string; status: string; csvHash: string; problems: { message: string }[] | null; templateNote: string; confirmation: string };

/** The weekly NHSN respiratory vaccination and case summary. It is a CSV you download and upload to NHSN; nothing is sent from here. */
export default async function NhsnPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="NHSN"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ nhsnExports: Week[] }>(`query N($id: ID!) { nhsnExports(where: { community: { id: { equals: $id } } }, orderBy: { weekStart: desc }, take: 30) { id reference weekStart weekEnd status csvHash problems templateNote confirmation } }`, { id: community.id }).catch(() => null);
  if (!data) return <Page title="NHSN"><Empty>Your role doesn&apos;t include NHSN reporting. Use the menu for the screens you can open.</Empty></Page>;
  const tz = community.timeZone;
  return (
    <Page title="NHSN weekly report">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/nhsn" />
      <Section title="Weeks" aside={<BillingAction op="nhsn.generate" input={{ communityId: community.id }} fields={[{ name: 'weekStart', label: 'Week starting (Monday)', type: 'date', required: true }]}>Generate a week</BillingAction>}>
        {data.nhsnExports.length ? data.nhsnExports.map(w => (
          <Row key={w.id}>
            <div className="min-w-0 flex-1 space-y-0.5">
              <Title status={w.status}>{when(w.weekStart, tz, 'date')} to {when(w.weekEnd, tz, 'date')} · {label(w.status)}</Title>
              {(w.problems ?? []).map((p, i) => <Meta key={i}>Fix: {p.message}</Meta>)}
              {w.confirmation ? <Meta>NHSN confirmation: {w.confirmation}</Meta> : null}
              {w.templateNote ? <Meta>{w.templateNote}</Meta> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {w.csvHash ? <a className="inline-flex min-h-11 items-center text-sm underline" href={`/api/exports?kind=nhsn&id=${w.id}`}>Export CSV</a> : null}
              {w.status === 'generated' && w.csvHash ? <BillingAction op="nhsn.record" input={{ exportId: w.id, step: 'uploaded' }} confirm="Confirm you uploaded this file to NHSN.">I uploaded it</BillingAction> : null}
              {w.status === 'uploaded' ? <BillingAction op="nhsn.record" input={{ exportId: w.id, step: 'confirmed' }} fields={[{ name: 'confirmation', label: 'Confirmation shown by NHSN', type: 'text', required: true }]}>Record confirmation</BillingAction> : null}
            </div>
          </Row>
        )) : <Empty>No weeks generated.</Empty>}
      </Section>
    </Page>
  );
}
