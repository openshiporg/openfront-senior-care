import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { NOT_FOR_ROLE } from '../../lib/clinical';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { ClinicalAction } from '../../components/ClinicalAction';

type Case = { id: string; syndrome: string; status: string; onsetAt: string; criteriaMet: boolean; organism: string; resident: { firstName: string; lastName: string } | null };
type Prec = { id: string; kind: string; status: string; reviewOn: string | null; resident: { firstName: string; lastName: string } | null };
type Abx = { id: string; drugName: string; indication: string; status: string; timeoutDueAt: string | null; resident: { firstName: string; lastName: string } | null };
type Out = { id: string; name: string; status: string; declaredAt: string; organism: string };

const who = (r: { firstName: string; lastName: string } | null) => (r ? `${r.firstName} ${r.lastName}` : 'Resident');

/** Infection prevention and control: cases, precautions, antibiotic time-outs and outbreaks. */
export default async function IpacPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Infection control"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ infectionCases: Case[]; precautionOrders: Prec[]; antibioticCourses: Abx[]; outbreaks: Out[] }>(`query P($c: ID!) {
    infectionCases(where: { community: { id: { equals: $c } }, status: { in: ["suspected", "confirmed"] } }, orderBy: { onsetAt: desc }, take: 50) { id syndrome status onsetAt criteriaMet organism resident { firstName lastName } }
    precautionOrders(where: { community: { id: { equals: $c } }, status: { equals: "active" } }, orderBy: { createdAt: desc }, take: 50) { id kind status reviewOn resident { firstName lastName } }
    antibioticCourses(where: { community: { id: { equals: $c } }, status: { equals: "active" } }, orderBy: { timeoutDueAt: asc }, take: 50) { id drugName indication status timeoutDueAt resident { firstName lastName } }
    outbreaks(where: { community: { id: { equals: $c } } }, orderBy: { declaredAt: desc }, take: 10) { id name status declaredAt organism }
  }`, { c: community.id }).catch(() => null);
  if (!data) return <Page title="Infection control"><Empty>{NOT_FOR_ROLE('infection control')}</Empty></Page>;
  const tz = community.timeZone;
  const now = Date.now();
  return (
    <Page title="Infection control">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/ipac" />
      <Section title={`Outbreaks · ${data.outbreaks.length}`} aside={<ClinicalAction op="ipac.declareOutbreak" input={{ communityId: community.id }} fields={[{ name: 'name', label: 'Name', required: true }, { name: 'organism', label: 'Organism' }]}>Declare an outbreak</ClinicalAction>}>
        {data.outbreaks.length ? data.outbreaks.map(o => (
          <Row key={o.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={o.status}>{o.name}</Title><Meta>{o.organism || 'organism not set'} · declared {when(o.declaredAt, tz, 'day')}</Meta></div>
            {o.status !== 'closed' ? <ClinicalAction op="ipac.closeOutbreak" input={{ outbreakId: o.id }} confirm="Close this outbreak?">Close</ClinicalAction> : null}
          </Row>
        )) : <Empty>No outbreak.</Empty>}
      </Section>
      <Section title={`Open cases · ${data.infectionCases.length}`}>
        {data.infectionCases.length ? data.infectionCases.map(c => (
          <Row key={c.id}><div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={c.status}>{label(c.syndrome)} · {who(c.resident)}</Title><Meta>onset {when(c.onsetAt, tz, 'day')}{c.criteriaMet ? ' · criteria met' : ' · criteria not met'}{c.organism ? ` · ${c.organism}` : ''}</Meta></div></Row>
        )) : <Empty>No open case.</Empty>}
      </Section>
      <Section title={`Precautions · ${data.precautionOrders.length}`}>
        {data.precautionOrders.length ? data.precautionOrders.map(p => (
          <Row key={p.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={p.status}>{label(p.kind)} · {who(p.resident)}</Title><Meta>{p.reviewOn ? `review ${when(p.reviewOn, tz, 'date')}` : 'no review date'}</Meta></div>
            <ClinicalAction op="ipac.endPrecaution" input={{ precautionId: p.id }} confirm="End this precaution?">End</ClinicalAction>
          </Row>
        )) : <Empty>No active precaution.</Empty>}
      </Section>
      <Section title={`Antibiotic courses · ${data.antibioticCourses.length}`}>
        {data.antibioticCourses.length ? data.antibioticCourses.map(a => {
          const late = a.timeoutDueAt && new Date(a.timeoutDueAt).getTime() < now;
          return (
            <Row key={a.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={late ? 'overdue' : null}>{a.drugName} · {who(a.resident)}</Title><Meta>{a.indication} · 72-hour time-out {a.timeoutDueAt ? `due ${when(a.timeoutDueAt, tz)}` : ''}</Meta></div>
              <ClinicalAction op="ipac.antibioticTimeout" input={{ courseId: a.id }} fields={[{ name: 'outcome', label: 'Outcome', type: 'select', required: true, options: ['continue', 'narrow', 'stop', 'change'].map(v => ({ value: v, label: label(v) })) }]}>Record time-out</ClinicalAction>
            </Row>
          );
        }) : <Empty>No active course.</Empty>}
      </Section>
    </Page>
  );
}
