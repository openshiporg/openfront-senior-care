import { q, currentCommunity } from '../../lib/server';
import { label, when, quantity } from '../../lib/format';
import { NOT_FOR_ROLE } from '../../lib/clinical';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { ClinicalAction } from '../../components/ClinicalAction';

type Count = { id: string; reference: string; shift: string; status: string; startedAt: string; unit: { id: string; name: string } | null; outgoing: { name: string } | null; incoming: { name: string } | null };
type Disc = { id: string; status: string; resolution: string | null; supply: { label: string } | null; shiftCount: { reference: string } | null; createdAt: string };
type Supply = { id: string; label: string; kind: string; balance: string; unit: string; controlled: boolean; status: string; unitLocation: { name: string } | null };

/** Controlled-substance counts. The sheet never shows the expected balance: each nurse counts blind, and the DON resolves differences. */
export default async function CountsPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Controlled counts"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ shiftCounts: Count[]; countDiscrepancies: Disc[]; medicationSupplies: Supply[]; units: { id: string; name: string }[] }>(`query C($c: ID!) {
    shiftCounts(where: { community: { id: { equals: $c } } }, orderBy: { startedAt: desc }, take: 20) { id reference shift status startedAt unit { id name } outgoing { name } incoming { name } }
    countDiscrepancies(where: { community: { id: { equals: $c } }, status: { equals: "open" } }, orderBy: { createdAt: desc }, take: 20) { id status resolution createdAt supply { label } shiftCount { reference } }
    medicationSupplies(where: { community: { id: { equals: $c } }, status: { equals: "active" } }, orderBy: { label: asc }, take: 100) { id label kind balance unit controlled status unitLocation { name } }
    units(where: { community: { id: { equals: $c } } }, orderBy: { name: asc }) { id name }
  }`, { c: community.id }).catch(() => null);
  if (!data) return <Page title="Controlled counts"><Empty>{NOT_FOR_ROLE('controlled counts')}</Empty></Page>;
  const tz = community.timeZone;
  return (
    <Page title="Controlled counts">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/counts" />
      <Section title="Start a count" aside={null}>
        <div className="flex flex-wrap gap-2 p-1">
          {data.units.map(u => (
            <ClinicalAction key={u.id} op="count.start" input={{ unitId: u.id }} fields={[{ name: 'shift', label: 'Shift', type: 'select', required: true, options: ['day', 'evening', 'night'].map(v => ({ value: v, label: label(v) })) }, { name: 'incomingId', label: 'Incoming nurse (user id)', required: true }]}>{u.name}</ClinicalAction>
          ))}
          {!data.units.length ? <Empty>No units.</Empty> : null}
        </div>
      </Section>
      <Section title={`Open differences · ${data.countDiscrepancies.length}`}>
        {data.countDiscrepancies.length ? data.countDiscrepancies.map(d => (
          <Row key={d.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status="overdue">{d.supply?.label ?? 'Supply'}</Title><Meta>{d.shiftCount?.reference} · {when(d.createdAt, tz)}</Meta></div>
            <ClinicalAction op="count.resolve" input={{ discrepancyId: d.id }} fields={[{ name: 'resolution', label: 'Resolution', type: 'select', required: true, options: ['recount_matched', 'documentation_error', 'loss_suspected', 'found'].map(v => ({ value: v, label: label(v) })) }, { name: 'note', label: 'Note', type: 'textarea', required: true }, { name: 'witnessId', label: 'Witness (user id)' }]}>Resolve</ClinicalAction>
          </Row>
        )) : <Empty>No open differences.</Empty>}
      </Section>
      <Section title="Counts">
        {data.shiftCounts.length ? data.shiftCounts.map(c => (
          <Row key={c.id}><div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={c.status}>{c.reference} · {c.unit?.name} · {label(c.shift)}</Title><Meta>{c.outgoing?.name} → {c.incoming?.name} · {when(c.startedAt, tz)}</Meta></div></Row>
        )) : <Empty>No counts yet.</Empty>}
      </Section>
      <Section title="Supply on hand">
        {data.medicationSupplies.length ? data.medicationSupplies.map(s => (
          <Row key={s.id}><div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title>{s.label}{s.controlled ? ' · controlled' : ''}</Title><Meta>{label(s.kind)} · {s.unitLocation?.name ?? 'no location'} · {quantity(s.balance)} {s.unit}</Meta></div></Row>
        )) : <Empty>No supply recorded.</Empty>}
      </Section>
    </Page>
  );
}
