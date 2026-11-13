import { notFound } from 'next/navigation';
import { q, currentCommunity } from '../../lib/server';
import { sectionsFor, type ItemSetDefinition, type Signature } from '@/features/keystone/mds/itemSet';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, Stat } from '../../components/ui';
import { BillingAction, type BillingField } from '../../components/BillingAction';

type Mds = {
  id: string; reference: string; kind: string; ardDate: string; status: string; itemSetVersion: string; correctionNumber: number; correctionReason: string;
  items: Record<string, string> | null; signatures: Signature[] | null; editResults: { fatal?: { item: string; message: string }[]; warning?: { item: string; message: string }[] } | null;
  caaTriggers: { triggered?: { code: number; name: string; because: string[] }[]; verifyNote?: string } | null; hipps: string | null;
  itemSet: { definition: ItemSetDefinition } | null; resident: { firstName: string; lastName: string } | null; correctionOf: { id: string; reference: string } | null;
};
type Classification = { id: string; hipps: string | null; indicator: string; effectiveFrom: string; status: string; groups: Record<string, unknown> | null; cmi: Record<string, string> | null; functionScores: Record<string, number> | null };

/**
 * One MDS record: its items by section (each section saved and signed by the person who did it), then Complete runs the spec edits,
 * the CAA triggers and the PDPM classification. A completed record is changed only by a correction, which supersedes it.
 */
export default async function MdsAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { community } = await currentCommunity(null);
  const data = await q<{ mdsAssessment: Mds | null }>(`query A($id: ID!) { mdsAssessment(where: { id: $id }) {
    id reference kind ardDate status itemSetVersion correctionNumber correctionReason items signatures editResults caaTriggers hipps
    itemSet { definition } resident { firstName lastName } correctionOf { id reference }
  } }`, { id }).catch(() => null);
  if (!data?.mdsAssessment) notFound();
  const m = data.mdsAssessment;
  const tz = community?.timeZone ?? 'America/New_York';
  const def = m.itemSet?.definition;
  const items = m.items ?? {};
  const classifications = (await q<{ pdpmClassifications: Classification[] }>(`query C($id: ID!) { pdpmClassifications(where: { assessment: { id: { equals: $id } } }, orderBy: { createdAt: desc }) { id hipps indicator effectiveFrom status groups cmi functionScores } }`, { id }).catch(() => null))?.pdpmClassifications ?? [];
  const sections = def ? [...sectionsFor(m.kind, def), ...(def.items.some(i => i.exported === false) ? ['PDPM'] : [])] : [];
  const signed = new Set((m.signatures ?? []).flatMap(s => s.sections));
  const editable = m.status === 'in_progress';
  const fieldFor = (itemId: string): BillingField => {
    const d = def!.items.find(i => i.id === itemId)!;
    const base = { name: d.id, label: `${d.id} ${d.label}`, defaultValue: items[d.id] ?? '' };
    return Array.isArray(d.values) ? { ...base, type: 'select', options: d.values.map(v => ({ value: v, label: v })) } : { ...base, placeholder: d.values === 'date' ? 'YYYYMMDD' : d.values === 'icd' ? 'ICD-10-CM' : String(d.values) };
  };
  return (
    <Page title={`MDS ${m.reference}`} crumbs={[{ label: 'MDS calendar', href: '/dashboard/platform/mds' }]}>
      <Section title={m.resident ? `${m.resident.firstName} ${m.resident.lastName}` : 'Resident'}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat name="Record" value={label(m.kind)} />
          <Stat name="ARD" value={when(m.ardDate, tz, 'date')} />
          <Stat name="Item set" value={`V${m.itemSetVersion}`} />
          <Stat name="HIPPS" value={m.hipps || '—'} />
        </div>
        <Title status={m.status}>{label(m.status)}</Title>
        {m.correctionOf ? <Meta>Correction {m.correctionNumber} of <a className="underline" href={`/dashboard/platform/mds/${m.correctionOf.id}`}>{m.correctionOf.reference}</a>: {m.correctionReason}</Meta> : null}
        <span className="flex flex-wrap gap-2 pt-1">
          {editable ? <BillingAction op="mds.complete" input={{ assessmentId: m.id }} fields={[{ name: 'completedOn', label: 'Completed on (Z0500B)', type: 'date', defaultValue: new Date().toISOString().slice(0, 10) }, { name: 'aids', label: 'AIDS on the claim (B20, from the hospital record)', type: 'checkbox' }]}>Complete</BillingAction> : null}
          {editable ? <BillingAction op="mds.entered_in_error" input={{ assessmentId: m.id }} fields={[{ name: 'reason', label: 'Why', required: true }]}>Entered in error</BillingAction> : null}
          {['completed', 'exported', 'accepted'].includes(m.status) ? <BillingAction op="mds.correct" input={{ assessmentId: m.id }} fields={[{ name: 'reason', label: 'What is being corrected and why', type: 'textarea', required: true }]}>Correct this record</BillingAction> : null}
        </span>
      </Section>

      {m.editResults?.fatal?.length || m.editResults?.warning?.length ? (
        <Section title="Spec edits">
          {(m.editResults.fatal ?? []).map((e, i) => <Meta key={`f${i}`}>Fatal · {e.item}: {e.message}</Meta>)}
          {(m.editResults.warning ?? []).map((e, i) => <Meta key={`w${i}`}>Warning · {e.item}: {e.message}</Meta>)}
        </Section>
      ) : null}

      {classifications.length ? (
        <Section title="PDPM classification">
          {classifications.map(c => (
            <Row key={c.id}>
              <div className="min-w-0 flex-1 space-y-0.5">
                <Title status={c.status === 'current' ? 'active' : 'superseded'}>{c.hipps} · {label(c.indicator)} · pays from {when(c.effectiveFrom, tz, 'date')}</Title>
                {c.groups ? <Meta>PT/OT {String(c.groups.pt)} · SLP {String(c.groups.slp)} · Nursing {String(c.groups.nursing)} · NTA {String(c.groups.nta)} (score {String(c.groups.ntaScore)}){c.groups.aids ? ' · AIDS' : ''}</Meta> : null}
                {c.cmi ? <Meta>CMI: PT {c.cmi.pt} · OT {c.cmi.ot} · SLP {c.cmi.slp} · Nursing {c.cmi.nursing} · NTA {c.cmi.nta}</Meta> : null}
                {c.functionScores ? <Meta>Function score: PT/OT {c.functionScores.ptOt} · Nursing {c.functionScores.nursing}</Meta> : null}
              </div>
              <a className="inline-flex min-h-11 items-center text-sm underline" href={`/dashboard/platform/mds/pdpm?classification=${c.id}`}>Per diem</a>
            </Row>
          ))}
        </Section>
      ) : null}

      {m.caaTriggers?.triggered?.length ? (
        <Section title="Care areas triggered">
          {m.caaTriggers.triggered.map(c => <Meta key={c.code}>{c.code}. {c.name} (from {c.because.join(', ')})</Meta>)}
          {m.caaTriggers.verifyNote ? <Meta>{m.caaTriggers.verifyNote}</Meta> : null}
        </Section>
      ) : null}

      {def ? sections.map(section => {
        const sectionItems = def.items.filter(i => i.section === section);
        if (!sectionItems.length) return null;
        const signer = (m.signatures ?? []).find(s => s.sections.includes(section));
        return (
          <Section key={section} title={section === 'PDPM' ? 'PDPM worksheet (not exported)' : `Section ${section}`} aside={editable && section !== 'PDPM' && !signed.has(section) ? (
            <BillingAction op="mds.sign_sections" input={{ assessmentId: m.id, sections: [section] }} fields={[{ name: 'title', label: 'Your title', required: true, placeholder: 'RN, MDS Coordinator' }]}>Sign section {section}</BillingAction>
          ) : null}>
            {signer ? <Meta>Signed by {signer.name}, {signer.title}, on {when(signer.signedOn, tz, 'date')}</Meta> : null}
            <div className="grid gap-1 sm:grid-cols-2">
              {sectionItems.map(i => <p key={i.id} className="text-xs"><span className="font-mono">{i.id}</span> {i.label}: <span className="font-medium">{items[i.id] ?? '—'}</span></p>)}
            </div>
            {editable ? <BillingAction op="mds.save_items" input={{ assessmentId: m.id }} fields={sectionItems.filter(i => !/^A0310/.test(i.id)).map(i => fieldFor(i.id))}>Edit section {section}</BillingAction> : null}
          </Section>
        );
      }) : <Empty>The item set for this record is not loaded.</Empty>}
    </Page>
  );
}
