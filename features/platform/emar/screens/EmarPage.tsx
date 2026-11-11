import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { onLoad, NOT_FOR_ROLE } from '../../lib/clinical';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { ClinicalAction } from '../../components/ClinicalAction';

type Slot = { id: string; drugName: string; scheduledFor: string; status: string; windowBefore: number; windowAfter: number; resident: { id: string; firstName: string; lastName: string; preferredName: string } | null };
type Prn = { id: string; dueAt: string; status: string; administration: { drugName: string; resident: { firstName: string; lastName: string } | null } | null };

/** The medication pass. Opening this screen creates the next 72 hours of slots and settles missed doses; no timer does. */
export default async function EmarPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="eMAR"><Empty>No community is assigned to you yet.</Empty></Page>;
  const opened = await onLoad('emar.open', community.id);
  if (!opened) return <Page title="eMAR"><Empty>{NOT_FOR_ROLE('the eMAR')}</Empty></Page>;
  const tz = community.timeZone;
  const now = new Date();
  const horizon = new Date(now.getTime() + 4 * 3_600_000).toISOString();
  const since = new Date(now.getTime() - 12 * 3_600_000).toISOString();
  const data = await q<{ administrationSlots: Slot[]; prnFollowUps: Prn[] }>(`query E($c: ID!, $from: DateTime!, $to: DateTime!) {
    administrationSlots(where: { community: { id: { equals: $c } }, scheduledFor: { gte: $from, lt: $to } }, orderBy: { scheduledFor: asc }, take: 200) {
      id drugName scheduledFor status windowBefore windowAfter resident { id firstName lastName preferredName }
    }
    prnFollowUps(where: { community: { id: { equals: $c } }, status: { in: ["pending", "missed"] } }, orderBy: { dueAt: asc }, take: 50) { id dueAt status administration { drugName resident { firstName lastName } } }
  }`, { c: community.id, from: since, to: horizon }).catch(() => null);
  if (!data) return <Page title="eMAR"><Empty>{NOT_FOR_ROLE('the eMAR')}</Empty></Page>;
  const due = data.administrationSlots.filter(s => s.status === 'scheduled');
  const done = data.administrationSlots.filter(s => s.status !== 'scheduled');
  return (
    <Page title="eMAR">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/emar" />
      <Section title={`To give · ${due.length}`}>
        {due.length ? due.map(s => {
          const overdue = new Date(s.scheduledFor).getTime() + s.windowAfter * 60_000 < now.getTime();
          return (
            <Row key={s.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={overdue ? 'overdue' : null}>{s.resident ? `${s.resident.preferredName || s.resident.firstName} ${s.resident.lastName}` : 'Resident'} · {s.drugName}</Title>
                <Meta>{when(s.scheduledFor, tz)} · window −{s.windowBefore}/+{s.windowAfter} min</Meta>
              </div>
              <ClinicalAction op="emar.administer" input={{ slotId: s.id, outcome: 'given', identityCheck: 'two_identifiers' }} confirm="Give this dose? Two identifiers checked.">Give</ClinicalAction>
              <ClinicalAction op="emar.administer" input={{ slotId: s.id }} fields={[{ name: 'outcome', label: 'Outcome', type: 'select', required: true, options: ['held', 'refused', 'not_given'].map(v => ({ value: v, label: label(v) })) }, { name: 'reason', label: 'Reason', required: true }]}>Hold or refuse</ClinicalAction>
            </Row>
          );
        }) : <Empty>No dose is due.</Empty>}
      </Section>
      <Section title={`PRN follow-ups · ${data.prnFollowUps.length}`}>
        {data.prnFollowUps.length ? data.prnFollowUps.map(f => (
          <Row key={f.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5"><Title status={f.status === 'missed' ? 'overdue' : 'pending'}>{f.administration?.drugName ?? 'PRN'} · {f.administration?.resident ? `${f.administration.resident.firstName} ${f.administration.resident.lastName}` : ''}</Title><Meta>due {when(f.dueAt, tz)}</Meta></div>
            <ClinicalAction op="emar.prnFollowUp" input={{ followUpId: f.id }} fields={[{ name: 'effect', label: 'Effect', type: 'select', required: true, options: ['effective', 'partly_effective', 'not_effective'].map(v => ({ value: v, label: label(v) })) }]}>Record effect</ClinicalAction>
          </Row>
        )) : <Empty>Nothing waiting.</Empty>}
      </Section>
      <Section title={`Recent · ${done.length}`}>
        {done.length ? done.slice(-30).reverse().map(s => (
          <Row key={s.id}><div className="min-w-0 flex-1 basis-60"><Title status={s.status}>{s.resident ? `${s.resident.firstName} ${s.resident.lastName}` : 'Resident'} · {s.drugName}</Title><Meta>{when(s.scheduledFor, tz)}</Meta></div></Row>
        )) : <Empty>No settled doses in the last 12 hours.</Empty>}
      </Section>
    </Page>
  );
}
