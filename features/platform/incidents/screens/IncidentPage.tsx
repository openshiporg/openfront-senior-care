import { notFound } from 'next/navigation';
import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { NOT_FOR_ROLE } from '../../lib/clinical';
import { Page, Section, Row, Empty, Meta, Title } from '../../components/ui';
import { ClinicalAction } from '../../components/ClinicalAction';

type Inc = {
  id: string; reference: string; kind: string; status: string; description: string; occurredAt: string; reportableDecision: string | null; allegedAbuseOrSbi: boolean;
  resident: { firstName: string; lastName: string } | null;
};
type Clock = { id: string; obligationCode: string; status: string; dueAt: string; ruleRef: string; verifyNote: string };
type Report = { id: string; kind: string; status: string; confirmation: string };

/** One incident with its clocks, investigation and reports. Unknown ids are a 404. */
export default async function IncidentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ community?: string }> }) {
  const { id } = await params;
  const { community } = await currentCommunity((await searchParams)?.community);
  const tz = community?.timeZone ?? 'America/New_York';
  const data = await q<{ incident: Inc | null; complianceClocks: Clock[]; regulatoryReports: Report[]; incidentInvestigations: { id: string; status: string; rootCause: string }[] }>(`query I($id: ID!, $sid: String!) {
    incident(where: { id: $id }) { id reference kind status description occurredAt reportableDecision allegedAbuseOrSbi resident { firstName lastName } }
    complianceClocks(where: { subjectId: { equals: $sid }, current: { equals: true } }, orderBy: { dueAt: asc }) { id obligationCode status dueAt ruleRef verifyNote }
    regulatoryReports(where: { incident: { id: { equals: $id } } }, orderBy: { createdAt: desc }) { id kind status confirmation }
    incidentInvestigations(where: { incident: { id: { equals: $id } } }, orderBy: { createdAt: desc }) { id status rootCause }
  }`, { id, sid: id }).catch(() => null);
  if (!data) return <Page title="Incident"><Empty>{NOT_FOR_ROLE('incidents')}</Empty></Page>;
  const i = data.incident;
  if (!i) notFound();
  const slug = community?.slug ?? '';
  return (
    <Page title={i.reference} crumbs={[{ label: 'Incidents', href: `/dashboard/platform/incidents?community=${slug}` }]}>
      <div className="space-y-1">
        <Title status={i.status}>{label(i.kind)}{i.resident ? ` · ${i.resident.firstName} ${i.resident.lastName}` : ''}</Title>
        <Meta>{when(i.occurredAt, tz)}{i.reportableDecision ? ` · ${label(i.reportableDecision)}` : ''}</Meta>
        <p className="whitespace-pre-wrap break-words text-sm">{i.description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {i.status !== 'closed' ? <ClinicalAction op="incident.investigate" input={{ incidentId: id }}>Start investigation</ClinicalAction> : null}
        {i.status !== 'closed' ? <ClinicalAction op="incident.draftReport" input={{ incidentId: id }} fields={[{ name: 'kind', label: 'Report', type: 'select', required: true, options: [{ value: 'f609_initial', label: 'Initial report' }, { value: 'f609_five_day', label: 'Five-day follow-up' }] }]}>Draft a report</ClinicalAction> : null}
        {i.status !== 'closed' ? <ClinicalAction op="incident.requestDowngrade" input={{ incidentId: id }} fields={[{ name: 'reason', label: 'Why is this not reportable?', type: 'textarea', required: true }]}>Ask to downgrade</ClinicalAction> : null}
        {i.status !== 'closed' ? <ClinicalAction op="incident.close" input={{ incidentId: id }} confirm="Close this incident?">Close</ClinicalAction> : null}
      </div>
      <Section title={`Clocks · ${data.complianceClocks.length}`}>
        {data.complianceClocks.length ? data.complianceClocks.map(c => (
          <Row key={c.id}><div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={c.status}>{label(c.obligationCode.toLowerCase())}</Title><Meta>due {when(c.dueAt, tz)} · {c.ruleRef}{c.verifyNote ? ` · ${c.verifyNote}` : ''}</Meta></div></Row>
        )) : <Empty>No clock is running for this incident.</Empty>}
      </Section>
      <Section title="Reports">
        {data.regulatoryReports.length ? data.regulatoryReports.map(r => (
          <Row key={r.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={r.status}>{label(r.kind)}</Title><Meta>{r.confirmation ? `confirmation ${r.confirmation}` : 'not yet submitted'}</Meta></div>
            {r.status === 'draft' ? <ClinicalAction op="incident.recordSubmission" input={{ reportId: r.id }} fields={[{ name: 'channel', label: 'Sent through', required: true, placeholder: 'state portal' }, { name: 'confirmation', label: 'Confirmation number', required: true }]}>Record submission</ClinicalAction> : null}
          </Row>
        )) : <Empty>No report drafted.</Empty>}
      </Section>
      <Section title="Investigations">
        {data.incidentInvestigations.length ? data.incidentInvestigations.map(v => <Row key={v.id}><Title status={v.status}>{v.status === 'open' ? 'Open' : 'Complete'}</Title><Meta>{v.rootCause}</Meta></Row>) : <Empty>Not started.</Empty>}
      </Section>
    </Page>
  );
}
