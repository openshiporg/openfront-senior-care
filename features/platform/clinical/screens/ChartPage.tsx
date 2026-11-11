import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { NOTE_TYPES, VITAL_TYPES, NOT_FOR_ROLE } from '../../lib/clinical';
import { Page, Section, Row, Empty, Meta, Title, Tabs } from '../../components/ui';
import { ClinicalAction } from '../../components/ClinicalAction';

const TABS = [
  { key: 'summary', label: 'Summary' }, { key: 'notes', label: 'Notes' }, { key: 'vitals', label: 'Vitals and intake' }, { key: 'assessments', label: 'Assessments' },
  { key: 'orders', label: 'Orders' }, { key: 'careplan', label: 'Care plan' }, { key: 'wounds', label: 'Wounds' },
];
const TEMPLATES = ['braden', 'morse', 'bims', 'phq9', 'painad', 'elopement'];

type R = { id: string; firstName: string; lastName: string; preferredName: string; reference: string; fallRisk: string | null; elopementRisk: string | null; allergies: { id: string; substance: string; reaction: string; severity: string }[] };

/** One resident's chart. A resident that does not exist (or is outside your community) is a 404. */
export default async function ChartPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ community?: string; tab?: string }> }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { community } = await currentCommunity(sp.community);
  const tz = community?.timeZone ?? 'America/New_York';
  const tab = TABS.some(t => t.key === sp.tab) ? sp.tab! : 'summary';
  const head = await q<{ resident: R | null }>(`query H($id: ID!) { resident(where: { id: $id }) { id firstName lastName preferredName reference fallRisk elopementRisk allergies(where: { status: { equals: "active" } }) { id substance reaction severity } } }`, { id }).catch(() => null);
  if (!head) return <Page title="Clinical chart"><Empty>{NOT_FOR_ROLE('the clinical chart')}</Empty></Page>;
  const r = head.resident;
  if (!r) notFound();
  const name = `${r.preferredName || r.firstName} ${r.lastName}`;
  const base = `/dashboard/platform/clinical/${id}?community=${community?.slug ?? ''}`;
  const body = await q<any>(BODY[tab], { id }).catch(() => null);
  return (
    <Page title={name} crumbs={[{ label: 'Clinical chart', href: `/dashboard/platform/clinical?community=${community?.slug ?? ''}` }]}>
      <div className="space-y-1">
        <Title>{name}</Title>
        <Meta>{r.reference}{r.fallRisk ? ` · falls: ${label(r.fallRisk)}` : ''}{r.elopementRisk ? ` · elopement: ${label(r.elopementRisk)}` : ''}</Meta>
        <Meta>Allergies: {r.allergies.length ? r.allergies.map(a => `${a.substance}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ') : 'none recorded'}</Meta>
      </div>
      <Tabs active={tab} items={TABS.map(t => ({ key: t.key, label: t.label, href: `${base}&tab=${t.key}` }))} />
      {!body ? <Empty>{NOT_FOR_ROLE('this part of the chart')}</Empty> : null}
      {body && tab === 'summary' ? (
        <>
          <Section title="Quick actions">
            <div className="flex flex-wrap gap-2 p-1">
              <ClinicalAction op="vitals.record" wrap="vitals" input={{ residentId: id }} fields={[{ name: 'kind', label: 'Reading', type: 'select', options: VITAL_TYPES, required: true }, { name: 'value', label: 'Value', type: 'number', required: true }]}>Record a vital</ClinicalAction>
              <ClinicalAction op="note.create" input={{ residentId: id, sign: true }} fields={[{ name: 'kind', label: 'Type', type: 'select', options: NOTE_TYPES, required: true }, { name: 'body', label: 'Note', type: 'textarea', required: true }]}>Add a note</ClinicalAction>
              <ClinicalAction op="incident.report" input={{ residentId: id }} fields={[{ name: 'kind', label: 'What happened', type: 'select', required: true, options: [['fall', 'Fall'], ['alleged_abuse', 'Alleged abuse'], ['alleged_neglect', 'Alleged neglect'], ['injury_unknown_source', 'Injury of unknown source'], ['medication_error', 'Medication error'], ['other', 'Other']].map(([value, label]) => ({ value, label })) }, { name: 'description', label: 'Description', type: 'textarea', required: true }]}>Report an incident</ClinicalAction>
            </div>
          </Section>
          <Section title={`Open tasks · ${body.tasks.length}`}>
            {body.tasks.length ? body.tasks.map((t: any) => (
              <Row key={t.id}><div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={t.status}>{t.title}</Title><Meta>{t.dueAt ? `due ${when(t.dueAt, tz)}` : 'no due time'}</Meta></div></Row>
            )) : <Empty>No open tasks.</Empty>}
          </Section>
          <Section title={`Active orders · ${body.orders.length}`}>
            {body.orders.length ? body.orders.map((o: any) => <Row key={o.id}><Title status={o.needsCountersign ? 'pending' : null}>{o.summary}</Title></Row>) : <Empty>No active orders.</Empty>}
          </Section>
        </>
      ) : null}
      {body && tab === 'notes' ? (
        <Section title="Progress notes">
          {body.progressNotes.length ? body.progressNotes.map((n: any) => (
            <Row key={n.id}><div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={n.status}>{label(n.kind)} · {n.author?.name ?? 'Unknown'}</Title><Meta>{when(n.eventAt, tz)}{n.lateEntry ? ' · late entry' : ''}</Meta><p className="whitespace-pre-wrap break-words text-sm">{n.status === 'entered_in_error' ? 'Entered in error.' : n.body}</p></div></Row>
          )) : <Empty>No notes yet.</Empty>}
        </Section>
      ) : null}
      {body && tab === 'vitals' ? (
        <>
          <Section title="Vital signs">
            {body.vitalSigns.length ? body.vitalSigns.map((v: any) => <Row key={v.id}><Title>{label(v.kind)}: {v.value} {v.unit}</Title><Meta>{when(v.takenAt, tz)}</Meta></Row>) : <Empty>No readings yet.</Empty>}
          </Section>
          <Section title="Intake" aside={<ClinicalAction op="intake.record" input={{ residentId: id }} fields={[{ name: 'kind', label: 'Type', type: 'select', required: true, options: [{ value: 'fluid', label: 'Fluid' }, { value: 'meal', label: 'Meal' }] }, { name: 'amountMl', label: 'Fluid (ml)', type: 'number' }, { name: 'percentEaten', label: 'Meal eaten (%)', type: 'number' }]}>Record intake</ClinicalAction>}>
            {body.intakeRecords.length ? body.intakeRecords.map((i: any) => <Row key={i.id}><Title>{label(i.kind)}{i.amountMl ? ` · ${i.amountMl} ml` : ''}{i.percentEaten !== null ? ` · ${i.percentEaten}%` : ''}</Title><Meta>{when(i.at, tz)}</Meta></Row>) : <Empty>No intake recorded.</Empty>}
          </Section>
        </>
      ) : null}
      {body && tab === 'assessments' ? (
        <Section title="Assessments" aside={<Meta>Scored from the template; each score is a record, not an edit.</Meta>}>
          {body.assessments.length ? body.assessments.map((a: any) => <Row key={a.id}><div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={a.status}>{a.templateCode.toUpperCase()} · {a.score ?? '—'}{a.band ? ` · ${a.band}` : ''}</Title><Meta>{when(a.completedAt, tz)}</Meta></div></Row>) : <Empty>No assessments yet. Templates: {TEMPLATES.join(', ')}.</Empty>}
        </Section>
      ) : null}
      {body && tab === 'orders' ? (
        <Section title="Orders">
          {body.orders.length ? body.orders.map((o: any) => (
            <Row key={o.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={o.status}>{o.summary}</Title><Meta>{label(o.source)}{o.needsCountersign ? ' · waiting for the prescriber to countersign' : ''}{o.allergyOverride ? ` · allergy override: ${o.allergyOverride}` : ''}</Meta></div>
              {o.needsCountersign && !o.countersignedAt ? <ClinicalAction op="order.countersign" input={{ orderId: o.id }} confirm="Countersign this verbal order?">Countersign</ClinicalAction> : null}
              {o.status === 'active' ? <ClinicalAction op="order.discontinue" input={{ orderId: o.id }} fields={[{ name: 'reason', label: 'Reason', required: true }]}>Discontinue</ClinicalAction> : null}
            </Row>
          )) : <Empty>No orders.</Empty>}
        </Section>
      ) : null}
      {body && tab === 'careplan' ? (
        <Section title="Care plans">
          {body.carePlans.length ? body.carePlans.map((p: any) => (
            <Row key={p.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={p.status}>{p.reference} · {label(p.kind)}</Title>{p.items.map((it: any) => <Meta key={it.id}>{label(it.kind)}: {it.text}{it.frequency && it.kind === 'intervention' ? ` (${label(it.frequency)})` : ''}</Meta>)}</div>
              {p.status === 'draft' ? <ClinicalAction op="carePlan.sign" input={{ carePlanId: p.id }} confirm="Sign this care plan?">Sign</ClinicalAction> : null}
            </Row>
          )) : <Empty>No care plan yet.</Empty>}
        </Section>
      ) : null}
      {body && tab === 'wounds' ? (
        <Section title="Wounds" aside={<ClinicalAction op="wound.open" input={{ residentId: id }} fields={[{ name: 'site', label: 'Site', required: true }, { name: 'kind', label: 'Type', type: 'select', required: true, options: ['pressure_injury', 'skin_tear', 'venous', 'arterial', 'diabetic', 'surgical', 'other'].map(v => ({ value: v, label: label(v) })) }]}>Open a wound</ClinicalAction>}>
          {body.wounds.length ? body.wounds.map((w: any) => (
            <Row key={w.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={w.status}>{w.site} · {label(w.kind)}</Title><Meta>{w.currentStage ? `stage ${w.currentStage} · ` : ''}last assessed {w.lastAssessedAt ? when(w.lastAssessedAt, tz) : 'never'}</Meta></div>
              {w.status === 'open' || w.status === 'active' ? <ClinicalAction op="wound.assess" input={{ woundId: w.id }} fields={[{ name: 'stage', label: 'Stage' }, { name: 'description', label: 'Description', type: 'textarea' }]}>Assess</ClinicalAction> : null}
            </Row>
          )) : <Empty>No wounds on file.</Empty>}
        </Section>
      ) : null}
      <Meta><Link className="underline" href={`/dashboard/platform/census/residents/${id}?community=${community?.slug ?? ''}`}>Face sheet</Link></Meta>
    </Page>
  );
}

const BODY: Record<string, string> = {
  summary: `query B($id: ID!) { tasks(where: { resident: { id: { equals: $id } }, status: { in: ["open", "in_progress"] } }, orderBy: { dueAt: asc }, take: 20) { id title status dueAt } orders(where: { resident: { id: { equals: $id } }, status: { equals: "active" } }, take: 50) { id summary needsCountersign } }`,
  notes: `query B($id: ID!) { progressNotes(where: { resident: { id: { equals: $id } } }, orderBy: { eventAt: desc }, take: 50) { id kind body status eventAt lateEntry author { name } } }`,
  vitals: `query B($id: ID!) { vitalSigns(where: { resident: { id: { equals: $id } } }, orderBy: { takenAt: desc }, take: 40) { id kind value unit takenAt } intakeRecords(where: { resident: { id: { equals: $id } } }, orderBy: { at: desc }, take: 30) { id kind amountMl percentEaten at } }`,
  assessments: `query B($id: ID!) { assessments(where: { resident: { id: { equals: $id } } }, orderBy: { completedAt: desc }, take: 30) { id templateCode score band status completedAt } }`,
  orders: `query B($id: ID!) { orders(where: { resident: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 60) { id summary status source needsCountersign countersignedAt allergyOverride } }`,
  careplan: `query B($id: ID!) { carePlans(where: { resident: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 5) { id reference kind status items(orderBy: { createdAt: asc }) { id kind text frequency } } }`,
  wounds: `query B($id: ID!) { wounds(where: { resident: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 30) { id site kind status currentStage lastAssessedAt } }`,
};
