import Link from 'next/link';
import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { onLoad, NOT_FOR_ROLE } from '../../lib/clinical';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { ClinicalAction } from '../../components/ClinicalAction';

type Finding = { id: string; workflowCode: string; title: string; detail: string; severity: string | null; status: string; createdAt: string; resident: { id: string; firstName: string; lastName: string } | null; evidence: { id: string; recordType: string; quote: string }[] };

/** Workflow findings. Opening this page asks the engine to look once for the current window; "Run now" asks again, and a repeat in the same window changes nothing. */
export default async function FindingsPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Findings"><Empty>No community is assigned to you yet.</Empty></Page>;
  const ran = await onLoad('workflow.run', community.id);
  if (!ran) return <Page title="Findings"><Empty>{NOT_FOR_ROLE('workflow findings')}</Empty></Page>;
  const data = await q<{ findings: Finding[]; workflowRuns: { id: string; windowKey: string; findingsOpened: number; startedAt: string }[] }>(`query F($c: ID!) {
    findings(where: { community: { id: { equals: $c } }, status: { equals: "open" } }, orderBy: { createdAt: desc }, take: 100) { id workflowCode title detail severity status createdAt resident { id firstName lastName } evidence { id recordType quote } }
    workflowRuns(where: { community: { id: { equals: $c } } }, orderBy: { startedAt: desc }, take: 1) { id windowKey findingsOpened startedAt }
  }`, { c: community.id }).catch(() => null);
  if (!data) return <Page title="Findings"><Empty>{NOT_FOR_ROLE('workflow findings')}</Empty></Page>;
  const tz = community.timeZone;
  const last = data.workflowRuns[0];
  return (
    <Page title="Findings">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/findings" />
      <Section title={`${data.findings.length} open`} aside={<ClinicalAction op="workflow.run" input={{ communityId: community.id }}>Run now</ClinicalAction>}>
        {data.findings.length ? data.findings.map(f => (
          <Row key={f.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={f.severity === 'high' ? 'overdue' : null}>{f.title}</Title>
              <Meta>{label(f.workflowCode)}{f.resident ? <> · <Link className="underline" href={`/dashboard/platform/clinical/${f.resident.id}?community=${community.slug}`}>{f.resident.firstName} {f.resident.lastName}</Link></> : null} · {when(f.createdAt, tz)}</Meta>
              {f.detail ? <Meta>{f.detail}</Meta> : null}
              {f.evidence.map(e => <Meta key={e.id}>Evidence: {label(e.recordType)}{e.quote ? ` — ${e.quote}` : ''}</Meta>)}
            </div>
            <ClinicalAction op="finding.dismiss" input={{ findingId: f.id }} fields={[{ name: 'note', label: 'Why dismiss?', required: true }]}>Dismiss</ClinicalAction>
          </Row>
        )) : <Empty>No open finding.</Empty>}
      </Section>
      <Meta>{last ? `Last run ${when(last.startedAt, tz)} (window ${last.windowKey}).` : 'The engine has not run yet.'} Findings become tasks in the inbox; nothing is sent.</Meta>
    </Page>
  );
}
