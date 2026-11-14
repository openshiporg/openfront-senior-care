import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';
import { OfferShift } from '../components/OfferShift';

type Shift = { id: string; role: string; startsAt: string; endsAt: string; required: number; status: string; unit: { name: string } | null };
type Assignment = { id: string; status: string; coverageReason: string; shift: { id: string } | null; staffMember: { id: string; name: string } | null };
type Staff = { id: string; name: string; status: string; jobCode: { category: string } | null };
type Day = { id: string; date: string; census: number; status: string; hprd: Record<string, string> | null; breaches: { metric: string; target: string; actual: string; source: string }[] | null };
type Target = { id: string; metric: string; value: string; source: string; status: string; ruleRef: string; effectiveFrom: string; effectiveTo: string | null };
type Vendor = { id: string; name: string; status: string; rateCard: Record<string, string> | null };
type Invoice = { id: string; invoiceNumber: string; status: string; amountMinor: string; expectedAmountMinor: string; invoicedMinutes: number; expectedMinutes: number; vendor: { name: string } | null };

const ROLES = [{ value: 'rn', label: 'RN' }, { value: 'lpn', label: 'LPN' }, { value: 'cna', label: 'CNA' }, { value: 'med_aide', label: 'Medication aide' }, { value: 'other', label: 'Other' }];
const METRICS = [{ value: 'total_nurse_hprd', label: 'Total nurse HPRD' }, { value: 'rn_hprd', label: 'RN HPRD' }, { value: 'cna_hprd', label: 'Aide HPRD' }, { value: 'direct_care_hprd', label: 'Direct care HPRD' }];
const money = (minor: string | null) => `$${(Number(BigInt(minor ?? '0')) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const hours = (m: number) => `${(m / 60).toFixed(2)} h`;

/** Shifts and who is on them, the staffing day against its targets, agency vendors and invoices. Offers are copyable links. */
export default async function SchedulePage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Schedule"><Empty>No community is assigned to you yet.</Empty></Page>;
  const id = community.id;
  const tz = community.timeZone;
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const data = await q<{ shifts: Shift[]; shiftAssignments: Assignment[]; staffMembers: Staff[]; staffingDays: Day[]; staffingTargets: Target[]; agencyVendors: Vendor[]; agencyInvoices: Invoice[]; authenticatedItem: { role: { canApproveTimecards: boolean; canManageSchedule: boolean } | null } | null }>(`query S($id: ID!, $since: DateTime!) {
    shifts(where: { community: { id: { equals: $id } }, endsAt: { gte: $since } }, orderBy: { startsAt: asc }, take: 120) { id role startsAt endsAt required status unit { name } }
    shiftAssignments(where: { community: { id: { equals: $id } }, endsAt: { gte: $since } }, take: 400) { id status coverageReason shift { id } staffMember { id name } }
    staffMembers(where: { community: { id: { equals: $id } }, status: { equals: "active" } }, orderBy: { name: asc }, take: 300) { id name status jobCode { category } }
    staffingDays(where: { community: { id: { equals: $id } } }, orderBy: { date: desc }, take: 14) { id date census status hprd breaches }
    staffingTargets(where: { community: { id: { equals: $id } } }, orderBy: [{ status: asc }, { metric: asc }], take: 40) { id metric value source status ruleRef effectiveFrom effectiveTo }
    agencyVendors(where: { community: { id: { equals: $id } } }, orderBy: { name: asc }, take: 30) { id name status rateCard }
    agencyInvoices(where: { community: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 20) { id invoiceNumber status amountMinor expectedAmountMinor invoicedMinutes expectedMinutes vendor { name } }
    authenticatedItem { ... on User { role { canApproveTimecards canManageSchedule } } }
  }`, { id, since }).catch(() => null);
  if (!data) return <Page title="Schedule"><Empty>Your role doesn&apos;t include scheduling. Use the menu for the screens you can open.</Empty></Page>;
  const canSchedule = Boolean(data.authenticatedItem?.role?.canManageSchedule);
  const canApprove = Boolean(data.authenticatedItem?.role?.canApproveTimecards);
  const byShift = new Map<string, Assignment[]>();
  for (const a of data.shiftAssignments) if (a.shift) byShift.set(a.shift.id, [...(byShift.get(a.shift.id) ?? []), a]);
  const peopleFor = (role: string) => data.staffMembers.filter(s => (s.jobCode?.category ?? 'other') === role).map(s => ({ value: s.id, label: s.name }));
  const today = data.staffingDays[0];

  return (
    <Page title="Schedule and staffing">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/schedule" />
      <Section title="Staffing against target" aside={canSchedule ? <BillingAction op="staffing.compute" input={{ communityId: id }} fields={[{ name: 'from', label: 'From date', type: 'date', required: true }, { name: 'days', label: 'Days (1 to 14)', type: 'text', defaultValue: '3' }]}>Recompute days</BillingAction> : null}>
        {data.staffingDays.length ? data.staffingDays.map(d => (
          <Row key={d.id}>
            <div className="min-w-0 flex-1 space-y-0.5">
              <Title status={d.status === 'breached' ? 'overdue' : 'satisfied'}>{when(d.date, tz, 'date')} · {d.census} residents · {d.status === 'breached' ? 'below target' : 'meets targets'}</Title>
              <Meta>{Object.entries(d.hprd ?? {}).map(([k, v]) => `${label(k)} ${v}`).join(' · ')}</Meta>
              {(d.breaches ?? []).map((b, i) => <Meta key={i}>Below {label(b.metric)}: {b.actual} against {b.target} ({b.source === 'jurisdiction_pack' ? 'Ohio' : 'operator policy'})</Meta>)}
            </div>
          </Row>
        )) : <Empty>No staffing days computed yet. Build shifts, then recompute.</Empty>}
        {today ? null : null}
      </Section>
      <Section title="Shifts" aside={canSchedule ? <BillingAction op="shift.create" input={{ communityId: id }} fields={[{ name: 'role', label: 'Role', type: 'select', required: true, options: ROLES }, { name: 'date', label: 'Date', type: 'date', required: true }, { name: 'startTime', label: 'Starts (24h, like 07:00)', type: 'text', required: true, defaultValue: '07:00' }, { name: 'endTime', label: 'Ends (like 15:00)', type: 'text', required: true, defaultValue: '15:00' }, { name: 'required', label: 'People needed', type: 'text', defaultValue: '1' }]}>New shift</BillingAction> : null}>
        {data.shifts.length ? data.shifts.map(s => {
          const rows = byShift.get(s.id) ?? [];
          const live = rows.filter(r => ['assigned', 'started', 'completed'].includes(r.status)).length;
          const people = peopleFor(s.role);
          return (
            <Row key={s.id}>
              <div className="min-w-0 flex-1 space-y-0.5">
                <Title status={s.status}>{s.role.toUpperCase()}{s.unit ? ` · ${s.unit.name}` : ''} · {when(s.startsAt, tz, 'full')} to {when(s.endsAt, tz, 'time')}</Title>
                <Meta>{live} of {s.required} filled · {label(s.status)}</Meta>
                {rows.map(a => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span>{a.staffMember?.name} · {label(a.status)}{a.coverageReason ? ` (${a.coverageReason})` : ''}</span>
                    {canSchedule && a.status === 'assigned' ? <><BillingAction op="shift.move" input={{ assignmentId: a.id, to: 'started' }}>Started</BillingAction><BillingAction op="shift.move" input={{ assignmentId: a.id, to: 'called_off' }} fields={[{ name: 'reason', label: 'Why', type: 'text', required: true }]}>Called off</BillingAction><BillingAction op="shift.move" input={{ assignmentId: a.id, to: 'no_show' }} confirm="Mark this person as a no-show?">No-show</BillingAction></> : null}
                    {canSchedule && a.status === 'started' ? <BillingAction op="shift.move" input={{ assignmentId: a.id, to: 'completed' }}>Completed</BillingAction> : null}
                    {canSchedule && ['offered', 'needs_coverage'].includes(a.status) ? <BillingAction op="shift.move" input={{ assignmentId: a.id, to: 'declined' }}>Withdraw</BillingAction> : null}
                  </div>
                ))}
              </div>
              {canSchedule && ['open', 'filled'].includes(s.status) ? (
                <div className="flex flex-wrap gap-2">
                  {s.status === 'open' ? <BillingAction op="shift.assign" input={{ shiftId: s.id }} fields={[{ name: 'staffMemberId', label: 'Assign', type: 'select', required: true, options: people }]}>Assign</BillingAction> : null}
                  {s.status === 'open' ? <OfferShift shiftId={s.id} people={people} /> : null}
                  <BillingAction op="shift.cancel" input={{ shiftId: s.id }} fields={[{ name: 'reason', label: 'Why', type: 'text', required: true }]}>Cancel</BillingAction>
                </div>
              ) : null}
            </Row>
          );
        }) : <Empty>No shifts yet.</Empty>}
      </Section>
      <Section title="Staffing targets" aside={canSchedule ? <BillingAction op="staffing.target" input={{ communityId: id }} fields={[{ name: 'metric', label: 'Measure', type: 'select', required: true, options: METRICS }, { name: 'value', label: 'Hours per resident day (like 3.20)', type: 'text', required: true }, { name: 'effectiveFrom', label: 'Effective from', type: 'date', required: true }, { name: 'note', label: 'Note', type: 'text' }]}>Set operator target</BillingAction> : null}>
        {data.staffingTargets.length ? data.staffingTargets.map(t => (
          <Row key={t.id}>
            <div className="min-w-0 flex-1">
              <Title status={t.status === 'active' ? 'active' : 'retired'}>{label(t.metric)} · {t.value}{t.status === 'repealed' ? ' · repealed (history only)' : ''}</Title>
              <Meta>{t.source === 'jurisdiction_pack' ? 'Rule pack' : 'Operator policy'} · from {when(t.effectiveFrom, tz, 'date')}{t.effectiveTo ? ` to ${when(t.effectiveTo, tz, 'date')}` : ''} · {t.ruleRef}</Meta>
            </div>
          </Row>
        )) : <Empty>No targets. Load the workforce section in onboarding.</Empty>}
      </Section>
      <Section title="Agency vendors" aside={canSchedule ? <BillingAction op="agency.vendor" input={{ communityId: id }} fields={[{ name: 'name', label: 'Agency name', type: 'text', required: true }, { name: 'contractStart', label: 'Contract starts', type: 'date' }, { name: 'contractEnd', label: 'Contract ends', type: 'date' }, { name: 'rn', label: 'RN rate, cents per hour', type: 'text' }, { name: 'lpn', label: 'LPN rate, cents per hour', type: 'text' }, { name: 'cna', label: 'CNA rate, cents per hour', type: 'text' }]}>Add vendor</BillingAction> : null}>
        {data.agencyVendors.length ? data.agencyVendors.map(v => (
          <Row key={v.id}>
            <div className="min-w-0 flex-1"><Title status={v.status}>{v.name}</Title><Meta>{Object.entries(v.rateCard ?? {}).map(([k, c]) => `${k.toUpperCase()} ${money(c)}/h`).join(' · ') || 'No rates'}</Meta></div>
            {canSchedule ? <BillingAction op="agency.invoice" input={{ vendorId: v.id }} fields={[{ name: 'invoiceNumber', label: 'Invoice number', type: 'text', required: true }, { name: 'periodStart', label: 'Period start', type: 'date', required: true }, { name: 'periodEnd', label: 'Period end', type: 'date', required: true }, { name: 'hours', label: 'Hours invoiced', type: 'text', required: true }, { name: 'amountMinor', label: 'Invoice total', type: 'money', required: true }]}>Match invoice</BillingAction> : null}
          </Row>
        )) : <Empty>No agency vendors.</Empty>}
        {data.agencyInvoices.map(i => (
          <Row key={i.id}>
            <div className="min-w-0 flex-1"><Title status={i.status === 'disputed' ? 'overdue' : i.status}>{i.vendor?.name} · invoice {i.invoiceNumber} · {money(i.amountMinor)}</Title><Meta>{label(i.status)} · invoiced {hours(i.invoicedMinutes)}, shifts worked {hours(i.expectedMinutes)} at {money(i.expectedAmountMinor)}</Meta></div>
            {canApprove && ['matched', 'disputed'].includes(i.status) ? <BillingAction op="agency.approve" input={{ invoiceId: i.id }} fields={i.status === 'disputed' ? [{ name: 'note', label: 'Why approve a mismatch', type: 'text', required: true }] : undefined}>Approve</BillingAction> : null}
          </Row>
        ))}
      </Section>
    </Page>
  );
}
