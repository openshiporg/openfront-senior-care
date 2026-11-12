import Link from 'next/link';
import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { NOT_FOR_ROLE } from '../../lib/clinical';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { ClinicalAction } from '../../components/ClinicalAction';

type Evidence = { id: string; recordType: string; recordId: string; quote: string; role: string | null; spanStart: number | null; spanEnd: number | null };
type Finding = { id: string; workflowCode: string; title: string; detail: string; severity: string | null; status: string; createdAt: string; resident: { id: string; firstName: string; lastName: string } | null; evidence: Evidence[]; task: { id: string; kind: string; status: string; dueAt: string | null; ownerRole: string } | null; proposal: { id: string; status: string } | null };
type DryRun = { days: number; from: string; to: string; wouldOpen: number; pendingExtraction: number; perDay: { date: string; candidates: number }[]; diff: { added: number; removed: number; unchanged: number; addedSamples: { title: string; ownerRole: string; taskKind: string; evidence: { recordType: string; spanStart: number | null; spanEnd: number | null }[] }[]; removedSamples: { title: string }[] }; tasksByOwner: { ownerRole: string; count: number }[] };
type Version = { id: string; status: string; description: string; request: string; graph: { nodes: { block: string; params: Record<string, unknown> }[] } | null; dryRun: DryRun | null; dryRunAt: string | null; reviewNote: string; proposedBy: { id: string; name: string } | null; definition: { name: string; origin: string } | null };

/**
 * Workflow findings. Opening this page asks the engine to look once for the current window (extraction of notes runs first, outside the
 * transaction); "Run now" asks again, and a repeat in the same window changes nothing. Below the findings: "Describe the job", the
 * staff-described builder, with each proposal's 30-day dry run and its approval state.
 */
export default async function FindingsPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Findings"><Empty>No community is assigned to you yet.</Empty></Page>;
  const ran = await keystoneClient(`mutation L($c: ID!, $k: String!) { runWorkflowsOnLoad(communityId: $c, idempotencyKey: $k) }`, { c: community.id, k: `workflow.page_load:${crypto.randomUUID()}` });
  if (!ran.success) return <Page title="Findings"><Empty>{NOT_FOR_ROLE('workflow findings')}</Empty></Page>;
  const data = await q<{ findings: Finding[]; workflowRuns: { id: string; windowKey: string; findingsOpened: number; startedAt: string; summary: { pendingExtraction?: number } | null }[]; workflowVersions: Version[]; authenticatedItem: { id: string; role: { canManageWorkflows: boolean; canManageCarePlans: boolean } | null } | null }>(`query F($c: ID!) {
    findings(where: { community: { id: { equals: $c } }, status: { equals: "open" } }, orderBy: { createdAt: desc }, take: 100) { id workflowCode title detail severity status createdAt resident { id firstName lastName } evidence { id recordType recordId quote role spanStart spanEnd } task { id kind status dueAt ownerRole } proposal { id status } }
    workflowRuns(where: { community: { id: { equals: $c } } }, orderBy: { startedAt: desc }, take: 1) { id windowKey findingsOpened startedAt summary }
    workflowVersions(where: { community: { id: { equals: $c } }, definition: { origin: { equals: "staff_described" } } }, orderBy: { createdAt: desc }, take: 10) { id status description request graph dryRun dryRunAt reviewNote proposedBy { id name } definition { name origin } }
    authenticatedItem { ... on User { id role { canManageWorkflows canManageCarePlans } } }
  }`, { c: community.id }).catch(() => null);
  if (!data) return <Page title="Findings"><Empty>{NOT_FOR_ROLE('workflow findings')}</Empty></Page>;
  const tz = community.timeZone;
  const last = data.workflowRuns[0];
  const me = data.authenticatedItem;
  const builds = me?.role?.canManageWorkflows ?? false;
  return (
    <Page title="Findings">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/findings" />
      <Section title={`${data.findings.length} open`} aside={<ClinicalAction op="workflow.run" input={{ communityId: community.id }}>Run now</ClinicalAction>}>
        {data.findings.length ? data.findings.map(f => (
          <Row key={f.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={f.severity === 'urgent' ? 'overdue' : null}>{f.title}</Title>
              <Meta>{label(f.workflowCode)}{f.resident ? <> · <Link className="underline" href={`/dashboard/platform/clinical/${f.resident.id}?community=${community.slug}`}>{f.resident.firstName} {f.resident.lastName}</Link></> : null} · {when(f.createdAt, tz)}</Meta>
              {f.detail ? <Meta>{f.detail}</Meta> : null}
              {f.evidence.filter(e => e.role !== 'resolution').map(e => <Meta key={e.id}>Evidence: {label(e.recordType)}{e.spanStart != null ? ` (characters ${e.spanStart}–${e.spanEnd})` : ''}{e.quote ? <> — <q>{e.quote}</q></> : ''}</Meta>)}
              {f.task ? <Meta>Task: {label(f.task.kind)} · {f.task.ownerRole || 'unassigned'} · {f.task.status}{f.task.dueAt ? ` · due ${when(f.task.dueAt, tz)}` : ''} · <Link className="underline" href={`/dashboard/platform/tasks?community=${community.slug}`}>Inbox</Link></Meta> : null}
              {f.proposal ? <Meta>Care-plan proposal: {f.proposal.status}{f.resident ? <> · <Link className="underline" href={`/dashboard/platform/clinical/${f.resident.id}?community=${community.slug}&tab=careplan`}>Review</Link></> : null}</Meta> : null}
            </div>
            <ClinicalAction op="finding.recheck" input={{ findingId: f.id }}>Re-check</ClinicalAction>
            {me?.role?.canManageCarePlans && !f.proposal && f.resident ? <ClinicalAction op="proposal.draftCarePlan" input={{ findingId: f.id }}>Draft care-plan update</ClinicalAction> : null}
            <ClinicalAction op="finding.dismiss" input={{ findingId: f.id }} fields={[{ name: 'note', label: 'Why dismiss?', required: true }]}>Dismiss</ClinicalAction>
          </Row>
        )) : <Empty>No open finding.</Empty>}
      </Section>
      <Meta>{last ? `Last run ${when(last.startedAt, tz)} (window ${last.windowKey}).` : 'The engine has not run yet.'}{last?.summary?.pendingExtraction ? ` ${last.summary.pendingExtraction} notes are still waiting to be read.` : ''} Findings become tasks in the inbox; nothing is sent.</Meta>

      {builds ? (
        <Section title="Describe the job" aside={<ClinicalAction op="workflow.build" input={{ communityId: community.id }} fields={[{ name: 'request', label: 'What should be watched, and who follows up?', type: 'textarea', required: true, placeholder: 'When a note says a resident fell, the charge nurse on shift holds a post-fall huddle within 72 hours.' }]}>New workflow</ClinicalAction>}>
          {data.workflowVersions.length ? data.workflowVersions.map(v => (
            <Row key={v.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={v.status}>{v.definition?.name ?? 'Workflow'}</Title>
                <Meta>&ldquo;{v.request}&rdquo;{v.proposedBy ? ` · proposed by ${v.proposedBy.name}` : ''}</Meta>
                <Meta>Steps: {(v.graph?.nodes ?? []).map(n => `${n.block}${Object.keys(n.params ?? {}).length ? ` (${Object.entries(n.params).map(([k, val]) => `${k} ${val}`).join(', ')})` : ''}`).join(' → ')}</Meta>
                {v.dryRun ? (
                  <>
                    <Meta>Dry run {v.dryRunAt ? when(v.dryRunAt, tz) : ''}: over {v.dryRun.days} days ({v.dryRun.from} to {v.dryRun.to}) it would have opened {v.dryRun.wouldOpen} findings{v.dryRun.pendingExtraction ? `; ${v.dryRun.pendingExtraction} notes could not be read` : ''}.</Meta>
                    <Meta>Diff with what is open now: +{v.dryRun.diff.added} new · −{v.dryRun.diff.removed} gone · {v.dryRun.diff.unchanged} the same.{v.dryRun.tasksByOwner.length ? ` Tasks: ${v.dryRun.tasksByOwner.map(t => `${t.count} to ${t.ownerRole || 'unassigned'}`).join(', ')}.` : ''}</Meta>
                    {v.dryRun.diff.addedSamples.slice(0, 5).map((s, i) => <Meta key={i}>+ {s.title} ({label(s.taskKind)}){s.evidence[0]?.spanStart != null ? ` · note span ${s.evidence[0].spanStart}–${s.evidence[0].spanEnd}` : ''}</Meta>)}
                  </>
                ) : <Meta>Not dry-run yet.</Meta>}
                {v.reviewNote ? <Meta>Review: {v.reviewNote}</Meta> : null}
                {v.status === 'dry_run_reviewed' ? <Meta>Waiting for the Director of Nursing&rsquo;s approval (Approvals).</Meta> : v.status === 'pending_activation' ? <Meta>Waiting for the administrator&rsquo;s approval (Approvals).</Meta> : null}
              </div>
              {v.status === 'proposed' ? <ClinicalAction op="workflow.dryRun" input={{ versionId: v.id }}>Dry run 30 days</ClinicalAction> : null}
              {v.status === 'proposed' && v.dryRun && v.proposedBy?.id === me?.id ? <ClinicalAction op="workflow.requestActivation" input={{ versionId: v.id, communityId: community.id }} fields={[{ name: 'reviewNote', label: 'What did you check in the dry run?', type: 'textarea', required: true }]}>Send for approval</ClinicalAction> : null}
              {['proposed', 'dry_run_reviewed'].includes(v.status) ? <ClinicalAction op="workflow.retire" input={{ versionId: v.id }} fields={[{ name: 'reason', label: 'Why withdraw it?', required: true }]}>Withdraw</ClinicalAction> : null}
            </Row>
          )) : <Empty>No staff-described workflow yet. Describe a job and the builder drafts it from the block catalogue; it runs only after a 30-day dry run and approval by the DON and the administrator.</Empty>}
        </Section>
      ) : null}
    </Page>
  );
}
