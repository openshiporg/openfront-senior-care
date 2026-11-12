import { q, currentCommunity } from '../../lib/server';
import { label, when, quantity } from '../../lib/format';
import { NOT_FOR_ROLE } from '../../lib/clinical';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { ClinicalAction } from '../../components/ClinicalAction';

type Count = { id: string; reference: string; shift: string; status: string; startedAt: string; unit: { id: string; name: string } | null; outgoing: { name: string } | null; incoming: { name: string } | null };
type Disc = { id: string; status: string; resolution: string | null; supply: { label: string } | null; shiftCount: { reference: string } | null; createdAt: string; expected?: string | null; outgoingCounted?: string | null; incomingCounted?: string | null };
type Supply = { id: string; label: string; kind: string; balance?: string | null; unit: string; controlled: boolean; status: string; unitLocation: { id: string; name: string } | null };
type Me = { id: string; role: { canResolveCountDiscrepancy: boolean | null; canManagePharmacy: boolean | null } | null } | null;
type Entry = { id: string; role: string; supply: { id: string } | null; shiftCount: { id: string } | null };

const SUPPLY_FIELDS = 'id label kind unit controlled status unitLocation { id name }';

/**
 * Controlled-substance counts. The sheet never shows the expected balance: each nurse counts blind, and the DON resolves differences.
 * Balances are shown only to the DON and pharmacy (they are also unreadable for anyone else at the GraphQL field level).
 */
export default async function CountsPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Controlled counts"><Empty>No community is assigned to you yet.</Empty></Page>;
  // Who is asking decides whether the balance is even requested: counting nurses never receive it (blind count, SM §9.5).
  const me = await q<{ authenticatedItem: Me }>(`{ authenticatedItem { ... on User { id role { canResolveCountDiscrepancy canManagePharmacy } } } }`).then(r => r.authenticatedItem).catch(() => null);
  const seesBalance = Boolean(me?.role?.canResolveCountDiscrepancy || me?.role?.canManagePharmacy);
  const data = await q<{ shiftCounts: (Count & { outgoing: { id: string; name: string } | null; incoming: { id: string; name: string } | null })[]; countDiscrepancies: Disc[]; medicationSupplies: Supply[]; units: { id: string; name: string }[]; shiftCountEntries: Entry[] }>(`query C($c: ID!) {
    shiftCounts(where: { community: { id: { equals: $c } } }, orderBy: { startedAt: desc }, take: 20) { id reference shift status startedAt unit { id name } outgoing { id name } incoming { id name } }
    countDiscrepancies(where: { community: { id: { equals: $c } }, status: { equals: "open" } }, orderBy: { createdAt: desc }, take: 20) { id status resolution createdAt outgoingCounted incomingCounted supply { label } shiftCount { reference }${seesBalance ? ' expected' : ''} }
    medicationSupplies(where: { community: { id: { equals: $c } }, status: { equals: "active" } }, orderBy: { label: asc }, take: 100) { ${SUPPLY_FIELDS}${seesBalance ? ' balance' : ''} }
    units(where: { community: { id: { equals: $c } } }, orderBy: { name: asc }) { id name }
    shiftCountEntries(where: { community: { id: { equals: $c } }, shiftCount: { status: { equals: "open" } } }, take: 500) { id role supply { id } shiftCount { id } }
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
            <div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status="overdue">{d.supply?.label ?? 'Supply'}</Title><Meta>{d.shiftCount?.reference} · {when(d.createdAt, tz)}</Meta>{d.expected != null ? <Meta>Expected {quantity(d.expected)} · counted {quantity(d.outgoingCounted ?? '')} and {quantity(d.incomingCounted ?? '')}</Meta> : null}</div>
            <ClinicalAction op="count.resolve" input={{ discrepancyId: d.id }} fields={[{ name: 'resolution', label: 'Resolution', type: 'select', required: true, options: ['recount_matched', 'documentation_error', 'loss_suspected', 'found'].map(v => ({ value: v, label: label(v) })) }, { name: 'note', label: 'Note', type: 'textarea', required: true }, { name: 'witnessId', label: 'Witness (user id)' }]}>Resolve</ClinicalAction>
          </Row>
        )) : <Empty>No open differences.</Empty>}
      </Section>
      <Section title="Counts">
        {data.shiftCounts.length ? data.shiftCounts.map(c => <Row key={c.id}><div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={c.status}>{c.reference} · {c.unit?.name} · {label(c.shift)}</Title><Meta>{c.outgoing?.name} → {c.incoming?.name} · {when(c.startedAt, tz)}</Meta></div></Row>) : <Empty>No counts yet.</Empty>}
      </Section>
      {data.shiftCounts.filter(c => c.status === 'open' && me?.id && (c.outgoing?.id === me.id || c.incoming?.id === me.id)).map(c => {
        const sheet = data.medicationSupplies.filter(s => s.controlled && s.unitLocation?.id === c.unit?.id);
        const mine = new Set(data.shiftCountEntries.filter(e => e.shiftCount?.id === c.id).map(e => e.supply?.id));
        return (
          <Section key={c.id} title={`Count sheet ${c.reference} · blind`} aside={<ClinicalAction op="count.complete" input={{ shiftCountId: c.id }} confirm="Finish the count? Both nurses must have counted every supply.">Finish count</ClinicalAction>}>
            {sheet.length ? sheet.map(s => (
              <Row key={s.id}>
                <div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={mine.has(s.id) ? 'done' : 'pending'}>{s.label}</Title><Meta>{mine.has(s.id) ? 'You counted this one.' : `Count what is in the drawer, in ${s.unit}. The expected number is not shown.`}</Meta></div>
                {mine.has(s.id) ? null : <ClinicalAction op="count.entry" input={{ shiftCountId: c.id, supplyId: s.id }} fields={[{ name: 'counted', label: `Counted (${s.unit})`, type: 'number', required: true }]}>Count</ClinicalAction>}
              </Row>
            )) : <Empty>No controlled supply on this unit.</Empty>}
          </Section>
        );
      })}
      <Section title="Supply on hand">
        {data.medicationSupplies.length ? data.medicationSupplies.map(s => (
          <Row key={s.id}><div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title>{s.label}{s.controlled ? ' · controlled' : ''}</Title><Meta>{label(s.kind)} · {s.unitLocation?.name ?? 'no location'}{seesBalance && s.balance != null ? ` · ${quantity(s.balance)} ${s.unit}` : ''}</Meta></div></Row>
        )) : <Empty>No supply recorded.</Empty>}
      </Section>
    </Page>
  );
}
