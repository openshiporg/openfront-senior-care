import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';

type Card = { id: string; weekStart: string; totalMinutes: number | null; status: string; issues: unknown[] | null; staffMember: { id: string; name: string; employeeId: string } | null };
type Correction = { id: string; kind: string; observedAt: string; reason: string; status: string; staffMember: { name: string } | null };
type Staff = { id: string; name: string; employeeId: string; status: string; jobCode: { title: string; pbjJobTitleCode: string } | null };
type Quarter = { id: string; reference: string; status: string; dueOn: string; validation: { ok?: boolean; problems?: { message: string }[]; entries?: number } | null; xmlHash: string };

const hours = (m: number | null) => `${Math.floor((m ?? 0) / 60)}h ${String((m ?? 0) % 60).padStart(2, '0')}m`;

/** Staff, punches, timecards and the PBJ quarter. The PBJ file is an Export button; CMS receives it only when you upload it. */
export default async function WorkforcePage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Staffing and PBJ"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ timecards: Card[]; timeCorrections: Correction[]; staffMembers: Staff[]; pbjQuarters: Quarter[] }>(`query W($id: ID!) {
    timecards(where: { community: { id: { equals: $id } } }, orderBy: { weekStart: desc }, take: 100) { id weekStart totalMinutes status issues staffMember { id name employeeId } }
    timeCorrections(where: { community: { id: { equals: $id }, status: { equals: "requested" } } }, take: 50) { id kind observedAt reason status staffMember { name } }
    staffMembers(where: { community: { id: { equals: $id } } }, orderBy: { name: asc }, take: 300) { id name employeeId status jobCode { title pbjJobTitleCode } }
    pbjQuarters(where: { community: { id: { equals: $id } } }, orderBy: { startDate: desc }, take: 8) { id reference status dueOn validation xmlHash }
  }`, { id: community.id }).catch(() => null);
  if (!data) return <Page title="Staffing and PBJ"><Empty>Your role doesn&apos;t include staffing. Use the menu for the screens you can open.</Empty></Page>;
  const tz = community.timeZone;
  return (
    <Page title="Staffing and PBJ">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/workforce" />
      <Section title="Staff" aside={<BillingAction op="workforce.import_punches" input={{ communityId: community.id }} fields={[{ name: 'csv', label: 'Punch file: employeeId,kind,observedAt,source', type: 'textarea', required: true }]}>Import punches</BillingAction>}>
        {data.staffMembers.length ? data.staffMembers.map(s => (
          <Row key={s.id}>
            <div className="min-w-0 flex-1"><Title status={s.status}>{s.name} · {s.employeeId}</Title><Meta>{s.jobCode ? `${s.jobCode.title} · CMS job ${s.jobCode.pbjJobTitleCode || 'not mapped'}` : 'No job code'}</Meta></div>
            <BillingAction op="timecard.build" input={{ staffMemberId: s.id }} fields={[{ name: 'weekStart', label: 'Week starting (Monday)', type: 'date', required: true }]}>Build timecard</BillingAction>
          </Row>
        )) : <Empty>No staff yet.</Empty>}
      </Section>
      <Section title="Timecards">
        {data.timecards.length ? data.timecards.map(c => (
          <Row key={c.id}>
            <div className="min-w-0 flex-1"><Title status={c.status}>{c.staffMember?.name} · week of {when(c.weekStart, tz, 'date')}</Title><Meta>{hours(c.totalMinutes)} · {label(c.status)}{c.issues?.length ? ` · ${c.issues.length} punch problem(s)` : ''}</Meta></div>
            <div className="flex flex-wrap gap-2">
              {c.status === 'open' ? <BillingAction op="timecard.submit" input={{ timecardId: c.id }}>Submit</BillingAction> : null}
              {c.status === 'submitted' ? <BillingAction op="timecard.approve" input={{ timecardId: c.id }}>Approve</BillingAction> : null}
              {['submitted', 'approved'].includes(c.status) ? <BillingAction op="timecard.reopen" input={{ timecardId: c.id }} fields={[{ name: 'reason', label: 'Why', type: 'text', required: true }]}>Reopen</BillingAction> : null}
            </div>
          </Row>
        )) : <Empty>No timecards built.</Empty>}
      </Section>
      <Section title="Punch corrections waiting">
        {data.timeCorrections.length ? data.timeCorrections.map(c => (
          <Row key={c.id}>
            <div className="min-w-0 flex-1"><Title status={c.status}>{c.staffMember?.name} · {label(c.kind)} at {when(c.observedAt, tz, 'full')}</Title><Meta>{c.reason}</Meta></div>
            <div className="flex gap-2"><BillingAction op="workforce.decide_correction" input={{ correctionId: c.id, decision: 'approved' }}>Approve</BillingAction><BillingAction op="workforce.decide_correction" input={{ correctionId: c.id, decision: 'rejected' }}>Reject</BillingAction></div>
          </Row>
        )) : <Empty>No corrections waiting.</Empty>}
      </Section>
      <Section title="PBJ quarters" aside={<BillingAction op="pbj.open_quarter" input={{ communityId: community.id }} fields={[{ name: 'date', label: 'Any date in the quarter', type: 'date', required: true }]}>Open a quarter</BillingAction>}>
        {data.pbjQuarters.length ? data.pbjQuarters.map(p => (
          <Row key={p.id}>
            <div className="min-w-0 flex-1 space-y-0.5">
              <Title status={p.status}>{p.reference} · {label(p.status)}</Title>
              <Meta>Due {when(p.dueOn, tz, 'date')}{p.validation?.entries ? ` · ${p.validation.entries} hour entries` : ''}</Meta>
              {(p.validation?.problems ?? []).slice(0, 8).map((x, i) => <Meta key={i}>Fix: {x.message}</Meta>)}
            </div>
            <div className="flex flex-wrap gap-2">
              {['open', 'ready'].includes(p.status) ? <BillingAction op="pbj.validate" input={{ quarterId: p.id }}>Build and validate</BillingAction> : null}
              {p.xmlHash ? <a className="inline-flex min-h-11 items-center text-sm underline" href={`/api/exports?kind=pbj&id=${p.id}`}>Export PBJ file</a> : null}
              {p.status === 'ready' ? <BillingAction op="pbj.mark_exported" input={{ quarterId: p.id }}>Mark exported</BillingAction> : null}
              {p.status === 'exported' ? <BillingAction op="pbj.record_outcome" input={{ quarterId: p.id, outcome: 'submitted' }} confirm="Confirm you uploaded this file to CMS.">I uploaded it</BillingAction> : null}
              {p.status === 'submitted' ? <BillingAction op="pbj.record_outcome" input={{ quarterId: p.id }} fields={[{ name: 'outcome', label: 'CMS report says', type: 'select', required: true, options: [{ value: 'accepted', label: 'Accepted' }, { value: 'rejected', label: 'Rejected' }] }, { name: 'note', label: 'Reason from the report (if rejected)', type: 'textarea' }]}>Record CMS report</BillingAction> : null}
            </div>
          </Row>
        )) : <Empty>No quarter opened.</Empty>}
      </Section>
    </Page>
  );
}
