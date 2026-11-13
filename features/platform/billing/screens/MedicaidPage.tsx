import { q, currentCommunity } from '../../lib/server';
import { liabilityClocks } from '@/features/keystone/billing/medicaid';
import { applicationClocks, pendingAr, pnaStatus, scheduleForMonth } from '@/features/keystone/billing/medicaidApplication';
import { label, money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';

type Liability = { id: string; month: string; liabilityMinor: string; status: string; noticeReceivedOn: string | null; infoRequestedOn: string | null; infoRespondedOn: string | null; appealFiledOn: string | null; resident: { firstName: string; lastName: string } | null };

const clockText = { info_response: 'Reply to the information request', appeal: 'Appeal window' } as const;

type Application = { id: string; reference: string; status: string; state: string; caseworker: string; requestedFrom: string | null; submittedOn: string | null; infoRequestedOn: string | null; infoDueOn: string | null; infoRespondedOn: string | null; decisionOn: string | null; effectiveOn: string | null; appealDueOn: string | null; appealFiledOn: string | null; resident: { id: string; firstName: string; lastName: string } | null; stay: { id: string } | null };
type Schedule = { id: string; monthlyAmountMinor: string; personalNeedsAllowanceMinor: string; effectiveFrom: string; effectiveTo: string | null; status: string; resident: { id: string; firstName: string; lastName: string } | null; stay: { id: string } | null };
type OpenStatement = { status: string; totalMinor: string; paidMinor: string; adjustedMinor: string; resident: { id: string } | null; period: { month: string } | null };

/** The staff buttons that move an application along, by status. */
const nextSteps: Record<string, { step: string; text: string; dueOn?: boolean; effectiveOn?: boolean }[]> = {
  preparing: [{ step: 'submit', text: 'Submitted' }],
  submitted: [{ step: 'info_request', text: 'Information requested', dueOn: true }, { step: 'approve', text: 'Approved', effectiveOn: true }, { step: 'deny', text: 'Denied' }],
  info_requested: [{ step: 'info_response', text: 'We replied' }],
  denied: [{ step: 'appeal', text: 'Appeal filed' }],
  appealed: [{ step: 'info_request', text: 'Information requested', dueOn: true }, { step: 'appeal_approved', text: 'Appeal won', effectiveOn: true }, { step: 'appeal_denied', text: 'Appeal lost' }],
};

/** Monthly Medicaid patient liability per resident. The reply and appeal deadlines are worked out when the page loads. */
export default async function MedicaidPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const { community, communities } = await currentCommunity((await searchParams)?.community);
  if (!community) return <Page title="Medicaid liability"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ medicaidLiabilities: Liability[] }>(`query M($id: ID!) { medicaidLiabilities(where: { community: { id: { equals: $id } }, status: { not: { equals: "superseded" } } }, orderBy: { month: desc }, take: 100) { id month liabilityMinor status noticeReceivedOn infoRequestedOn infoRespondedOn appealFiledOn resident { firstName lastName } } }`, { id: community.id }).catch(() => null);
  if (!data) return <Page title="Medicaid liability"><Empty>Your role doesn&apos;t include Medicaid liability. Use the menu for the screens you can open.</Empty></Page>;
  const today = new Date().toISOString().slice(0, 10);
  const day = (v: string | null) => (v ? v.slice(0, 10) : null);
  const extra = await q<{ medicaidApplications: Application[]; patientLiabilitySchedules: Schedule[]; statements: OpenStatement[] }>(`query A($id: ID!) {
    medicaidApplications(where: { community: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 100) { id reference status state caseworker requestedFrom submittedOn infoRequestedOn infoDueOn infoRespondedOn decisionOn effectiveOn appealDueOn appealFiledOn resident { id firstName lastName } stay { id } }
    patientLiabilitySchedules(where: { community: { id: { equals: $id } }, status: { not: { equals: "superseded" } } }, orderBy: { effectiveFrom: desc }, take: 200) { id monthlyAmountMinor personalNeedsAllowanceMinor effectiveFrom effectiveTo status resident { id firstName lastName } stay { id } }
    statements(where: { community: { id: { equals: $id } }, status: { equals: "issued" } }, take: 1000) { status totalMinor paidMinor adjustedMinor resident { id } period { month } }
  }`, { id: community.id }).catch(() => ({ medicaidApplications: [] as Application[], patientLiabilitySchedules: [] as Schedule[], statements: [] as OpenStatement[] }));
  const stays = (await q<{ stays: { id: string; resident: { firstName: string; lastName: string } | null }[] }>(`query S($id: ID!) { stays(where: { community: { id: { equals: $id } }, status: { equals: "admitted" } }, take: 300) { id resident { firstName lastName } } }`, { id: community.id }).catch(() => ({ stays: [] }))).stays;
  // PNA: what reached each resident's trust ledger this month as a deposit. Without trust access this is not shown.
  const monthStart = `${today.slice(0, 7)}-01`;
  const deposits = await q<{ trustTransactions: { amountMinor: string; resident: { id: string } | null }[] }>(`query D($id: ID!, $from: CalendarDay!) { trustTransactions(where: { community: { id: { equals: $id } }, kind: { equals: "deposit" }, status: { equals: "posted" }, effectiveOn: { gte: $from } }, take: 1000) { amountMinor resident { id } } }`, { id: community.id, from: monthStart }).catch(() => null);
  const credited = new Map<string, bigint>();
  for (const d of deposits?.trustTransactions ?? []) if (d.resident) credited.set(d.resident.id, (credited.get(d.resident.id) ?? 0n) + BigInt(d.amountMinor ?? '0'));
  const residentsWithSchedule = [...new Map(extra.patientLiabilitySchedules.filter(r => r.resident).map(r => [r.resident!.id, r.resident!])).values()];
  const monthEndOf = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
  return (
    <Page title="Medicaid liability">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/billing/medicaid" />
      <Section title="Medicaid applications" aside={stays.length ? (
        <BillingAction op="medicaid_app.start" fields={[
          { name: 'stayId', label: 'Resident', type: 'select', required: true, options: stays.map(st => ({ value: st.id, label: st.resident ? `${st.resident.lastName}, ${st.resident.firstName}` : st.id })) },
          { name: 'requestedFrom', label: 'Coverage asked from', type: 'date', required: true },
          { name: 'state', label: 'State' , defaultValue: 'OH' },
          { name: 'caseworker', label: 'Caseworker' },
        ]}>Start an application</BillingAction>
      ) : null}>
        {extra.medicaidApplications.length ? extra.medicaidApplications.map(a => {
          const clocks = applicationClocks({ status: a.status, infoRequestedOn: day(a.infoRequestedOn), infoDueOn: day(a.infoDueOn), infoRespondedOn: day(a.infoRespondedOn), decisionOn: day(a.decisionOn), appealDueOn: day(a.appealDueOn), appealFiledOn: day(a.appealFiledOn) }, today);
          const pending = ['preparing', 'submitted', 'info_requested', 'appealed'].includes(a.status)
            ? pendingAr(extra.statements.filter(st => st.resident?.id === a.resident?.id && st.period).map(st => ({ month: st.period!.month.slice(0, 10), status: st.status, totalMinor: BigInt(st.totalMinor ?? '0'), paidMinor: BigInt(st.paidMinor ?? '0'), adjustedMinor: BigInt(st.adjustedMinor ?? '0') })), day(a.requestedFrom))
            : null;
          return (
            <Row key={a.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={a.status === 'approved' ? 'active' : a.status === 'denied' ? 'overdue' : 'pending'}>{a.resident ? `${a.resident.firstName} ${a.resident.lastName}` : 'Resident'} · {label(a.status)}</Title>
                <Meta>{a.reference}{a.requestedFrom ? ` · coverage asked from ${when(a.requestedFrom, community.timeZone, 'date')}` : ''}{a.caseworker ? ` · caseworker ${a.caseworker}` : ''}{a.effectiveOn ? ` · effective ${when(a.effectiveOn, community.timeZone, 'date')}` : ''}</Meta>
                {pending !== null ? <Meta>Pending AR (open balance from the requested month): {money(pending.toString())}</Meta> : null}
                {clocks.map(c => <Meta key={c.name}>{clockText[c.name]}: {c.state === 'done' ? 'done' : c.state === 'overdue' ? `overdue since ${when(c.dueBy, community.timeZone, 'date')}` : `by ${when(c.dueBy, community.timeZone, 'date')} (${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} left)`}</Meta>)}
              </div>
              <span className="flex flex-wrap gap-2">
                {(nextSteps[a.status] ?? []).map(n => (
                  <BillingAction key={n.step} op="medicaid_app.advance" input={{ applicationId: a.id, step: n.step }} fields={[
                    { name: 'on', label: 'On', type: 'date', required: true, defaultValue: today },
                    ...(n.dueOn ? [{ name: 'dueOn', label: 'Reply due by (from the letter)', type: 'date' as const }] : []),
                    ...(n.effectiveOn ? [{ name: 'effectiveOn', label: 'Coverage effective from', type: 'date' as const }] : []),
                    { name: 'note', label: 'Note' },
                  ]}>{n.text}</BillingAction>
                ))}
                {a.status === 'approved' && a.resident ? (
                  <BillingAction op="liability_schedule.record" input={{ residentId: a.resident.id, stayId: a.stay?.id ?? null, applicationId: a.id }} fields={[
                    { name: 'monthlyAmountMinor', label: 'Monthly patient liability', type: 'money', required: true },
                    { name: 'personalNeedsAllowanceMinor', label: 'Personal needs allowance', type: 'money', required: true },
                    { name: 'effectiveFrom', label: 'Effective from', type: 'date', required: true, defaultValue: day(a.effectiveOn) ?? undefined },
                    { name: 'note', label: 'Notice reference' },
                  ]}>Record liability schedule</BillingAction>
                ) : null}
              </span>
            </Row>
          );
        }) : <Empty>No Medicaid applications yet.</Empty>}
      </Section>
      <Section title="Patient liability schedules">
        {extra.patientLiabilitySchedules.length ? extra.patientLiabilitySchedules.map(r => (
          <Row key={r.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={r.status === 'effective' ? 'active' : r.status}>{r.resident ? `${r.resident.firstName} ${r.resident.lastName}` : 'Resident'}</Title>
              <Meta>From {when(r.effectiveFrom, community.timeZone, 'date')}{r.effectiveTo ? ` to ${when(r.effectiveTo, community.timeZone, 'date')}` : ''} · personal needs allowance {money(r.personalNeedsAllowanceMinor)}</Meta>
            </div>
            <span className="text-sm tabular-nums">{money(r.monthlyAmountMinor)} a month</span>
          </Row>
        )) : <Empty>No schedule recorded. The monthly patient liability charge uses the schedule in effect; a monthly row below overrides it for its month.</Empty>}
      </Section>
      {deposits && residentsWithSchedule.length ? (
        <Section title="Personal needs allowance this month">
          {residentsWithSchedule.map(res => {
            const row = scheduleForMonth(extra.patientLiabilitySchedules.filter(r => r.resident?.id === res.id).map(r => ({ id: r.id, residentId: res.id, stayId: r.stay?.id ?? null, monthlyAmountMinor: BigInt(r.monthlyAmountMinor ?? '0'), personalNeedsAllowanceMinor: BigInt(r.personalNeedsAllowanceMinor ?? '0'), effectiveFrom: r.effectiveFrom.slice(0, 10), effectiveTo: day(r.effectiveTo), status: r.status })), monthStart, monthEndOf(monthStart));
            const status = pnaStatus({ allowanceMinor: row?.personalNeedsAllowanceMinor ?? null, creditedThisMonthMinor: credited.get(res.id) ?? 0n });
            return (
              <Row key={res.id}>
                <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                  <Title status={status.state === 'short' ? 'overdue' : status.state === 'credited' ? 'active' : 'open'}>{res.firstName} {res.lastName}</Title>
                  <Meta>{status.state === 'no_schedule' ? 'No schedule in effect this month.' : status.state === 'short' ? `${money(status.shortMinor.toString())} of the allowance has not reached the trust account this month.` : 'The allowance reached the trust account this month.'}</Meta>
                </div>
                <span className="text-sm tabular-nums">{row ? money(row.personalNeedsAllowanceMinor.toString()) : '—'}</span>
              </Row>
            );
          })}
        </Section>
      ) : null}
      <Section title="Patient liability by month">
        {data.medicaidLiabilities.length ? data.medicaidLiabilities.map(l => {
          const clocks = liabilityClocks({ infoRequestedOn: day(l.infoRequestedOn), infoRespondedOn: day(l.infoRespondedOn), noticeReceivedOn: day(l.noticeReceivedOn), appealFiledOn: day(l.appealFiledOn), status: l.status }, today);
          return (
            <Row key={l.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={l.status}>{l.resident ? `${l.resident.firstName} ${l.resident.lastName}` : 'Resident'}</Title>
                <Meta>{when(l.month, community.timeZone, 'date')} · {money(l.liabilityMinor)}</Meta>
                {clocks.map(c => <Meta key={c.name}>{clockText[c.name]}: {c.state === 'done' ? 'done' : c.state === 'overdue' ? `overdue since ${when(c.dueBy, community.timeZone, 'date')}` : `by ${when(c.dueBy, community.timeZone, 'date')} (${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} left)`}</Meta>)}
              </div>
              <span className="flex flex-wrap gap-2">
                {!l.infoRequestedOn ? <BillingAction op="medicaid.info_request" input={{ liabilityId: l.id, kind: 'requested', on: today }}>Information requested</BillingAction> : !l.infoRespondedOn ? <BillingAction op="medicaid.info_request" input={{ liabilityId: l.id, kind: 'responded', on: today }}>We replied</BillingAction> : null}
                {l.noticeReceivedOn && !l.appealFiledOn ? <BillingAction op="medicaid.appeal" input={{ liabilityId: l.id, filedOn: today }} confirm="Record that an appeal was filed today?">Appeal filed</BillingAction> : null}
              </span>
            </Row>
          );
        }) : <Empty>No Medicaid liability has been recorded.</Empty>}
      </Section>
    </Page>
  );
}
