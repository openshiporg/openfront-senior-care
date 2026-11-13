import Link from 'next/link';
import { q, currentCommunity } from '../../lib/server';
import { mdsWindows, SCHEDULE_VERIFY_NOTE, type MdsRecord } from '@/features/keystone/mds/schedule';
import { A0310 } from '@/features/keystone/mds/itemSet';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs, Count } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';

const residentName = (r: { firstName: string | null; lastName: string | null } | null) => (r && (r.firstName || r.lastName) ? [r.lastName, r.firstName].filter(Boolean).join(', ') : 'Resident');
type Stay = { id: string; admittedAt: string | null; dischargedAt: string | null; resident: { id: string; firstName: string; lastName: string } | null; coverages: { startDate: string; endDate: string | null; status: string; payer: { kind: string } | null }[] };
type Mds = { id: string; reference: string; kind: string; ardDate: string; status: string; hipps: string | null; correctionNumber: number; stay: { id: string } | null; resident: { firstName: string; lastName: string } | null };
type Submission = { id: string; reference: string; status: string; recordCount: number; fileName: string; generatedAt: string | null; fvrSummary: { accepted?: number; rejected?: number; notFound?: number } | null };

const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);
const KINDS = Object.keys(A0310).map(k => ({ value: k, label: label(k) }));

/**
 * The MDS calendar: every window the RAI schedule opens for each stay (entry, OBRA, PPS 5-day, PPS discharge), worked out when the
 * page loads from the stay, its Part A stretches and the records on file. The export and FVR are staff buttons.
 */
export default async function MdsCalendarPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const { community, communities } = await currentCommunity((await searchParams)?.community);
  if (!community) return <Page title="MDS calendar"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ stays: Stay[]; mdsAssessments: Mds[] }>(`query M($id: ID!) {
    stays(where: { community: { id: { equals: $id } }, setting: { equals: "nursing_facility" }, status: { in: ["admitted", "on_leave"] } }, orderBy: { admittedAt: asc }, take: 300) { id admittedAt dischargedAt resident { id firstName lastName } coverages: coverage { startDate endDate status payer { kind } } }
    mdsAssessments(where: { community: { id: { equals: $id } }, status: { notIn: ["superseded", "entered_in_error"] } }, orderBy: { ardDate: desc }, take: 1000) { id reference kind ardDate status hipps correctionNumber stay { id } resident { firstName lastName } }
  }`, { id: community.id }).catch(() => null);
  if (!data) return <Page title="MDS calendar"><Empty>Your role doesn&apos;t include the MDS. Use the menu for the screens you can open.</Empty></Page>;
  const submissions = (await q<{ mdsSubmissions: Submission[] }>(`query S($id: ID!) { mdsSubmissions(where: { community: { id: { equals: $id } } }, orderBy: { generatedAt: desc }, take: 30) { id reference status recordCount fileName generatedAt fvrSummary } }`, { id: community.id }).catch(() => null))?.mdsSubmissions ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const tz = community.timeZone;
  const rows = data.stays.map(stay => {
    const records: MdsRecord[] = data.mdsAssessments.filter(m => m.stay?.id === stay.id).map(m => ({ kind: m.kind, ardDate: m.ardDate.slice(0, 10), status: m.status }));
    const partA = stay.coverages.filter(c => c.payer?.kind === 'medicare_a' && c.status !== 'cancelled').map(c => ({ from: c.startDate.slice(0, 10), to: c.endDate ? c.endDate.slice(0, 10) : null }));
    const windows = mdsWindows({ entryDate: day(stay.admittedAt) ?? today, partA, dischargeDate: day(stay.dischargedAt) }, records, today).filter(w => w.state !== 'done' || w.ardTo >= today);
    return { stay, windows };
  });
  const due = rows.flatMap(r => r.windows).filter(w => w.state === 'overdue' || w.state === 'due_today' || w.state === 'open');
  const completed = data.mdsAssessments.filter(m => m.status === 'completed');
  const inProgress = data.mdsAssessments.filter(m => m.status === 'in_progress');
  return (
    <Page title="MDS calendar">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/mds" />
      <div className="flex flex-wrap gap-2">
        <Count status="overdue" n={due.filter(w => w.state === 'overdue').length} text="overdue" />
        <Count status="pending" n={due.filter(w => w.state !== 'overdue').length} text="open now" />
        <Count status="active" n={completed.length} text="ready to export" />
        <Link className="inline-flex min-h-11 items-center text-sm underline" href="/dashboard/platform/mds/pdpm">PDPM by resident</Link>
      </div>

      <Section title="Windows by resident">
        {rows.length ? rows.map(({ stay, windows }) => (
          <Row key={stay.id}>
            <div className="min-w-0 flex-1 basis-72 space-y-0.5">
              <Title>{residentName(stay.resident)}</Title>
              <Meta>Entry {when(stay.admittedAt, tz, 'date')}{stay.coverages.some(c => c.payer?.kind === 'medicare_a' && !c.endDate) ? ' · Medicare Part A' : ''}</Meta>
              {windows.length ? windows.map(w => (
                <p key={`${w.kind}-${w.ardFrom}`} className="text-xs">
                  <span className="font-medium">{label(w.kind)}</span>{' · '}
                  <span className={w.state === 'overdue' ? 'text-red-600' : w.state === 'done' ? 'text-muted-foreground' : ''}>{label(w.state)}</span>
                  {' · ARD '}{w.ardFrom === w.ardTo ? when(w.ardFrom, tz, 'date') : `${when(w.ardFrom, tz, 'date')} to ${when(w.ardTo, tz, 'date')}`}
                  {' · complete by '}{when(w.completeBy, tz, 'date')}{' · transmit by '}{when(w.transmitBy, tz, 'date')}
                </p>
              )) : <Meta>Nothing due.</Meta>}
            </div>
            <BillingAction op="mds.open" input={{ stayId: stay.id }} fields={[
              { name: 'kind', label: 'Record', type: 'select', required: true, options: KINDS, defaultValue: windows.find(w => w.state !== 'done')?.kind },
              { name: 'ardDate', label: 'Assessment reference date', type: 'date', required: true, defaultValue: windows.find(w => w.state !== 'done' && w.state !== 'upcoming')?.ardTo ?? today },
            ]}>Open a record</BillingAction>
          </Row>
        )) : <Empty>No nursing-facility residents in house.</Empty>}
        <Meta>{SCHEDULE_VERIFY_NOTE}</Meta>
      </Section>

      <Section title="Records in progress">
        {inProgress.length ? inProgress.map(m => (
          <Row key={m.id} href={`/dashboard/platform/mds/${m.id}`}>
            <Title status={m.status}>{residentName(m.resident)} · {label(m.kind)}</Title>
            <Meta>{m.reference} · ARD {when(m.ardDate, tz, 'date')}{m.correctionNumber ? ` · correction ${m.correctionNumber}` : ''}</Meta>
          </Row>
        )) : <Empty>No records in progress.</Empty>}
      </Section>

      <Section title="iQIES export" aside={completed.length ? <BillingAction op="mds.export" input={{ communityId: community.id }} confirm={`Build the submission file for ${completed.length} completed record(s)?`}>Export {completed.length} record(s)</BillingAction> : null}>
        <Meta>The file is built here and uploaded to iQIES by a person. Paste the Final Validation Report back to record what was accepted.</Meta>
        {completed.map(m => (
          <Row key={m.id} href={`/dashboard/platform/mds/${m.id}`}>
            <Title status={m.status}>{residentName(m.resident)} · {label(m.kind)}</Title>
            <Meta>{m.reference} · ARD {when(m.ardDate, tz, 'date')}{m.hipps ? ` · HIPPS ${m.hipps}` : ''}</Meta>
          </Row>
        ))}
        {submissions === null ? <Meta>Submissions need regulatory submission access.</Meta> : submissions.length ? submissions.map(s => (
          <Row key={s.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={s.status}>{s.reference} · {s.recordCount} record(s)</Title>
              <Meta>{s.fileName} · built {when(s.generatedAt, tz)}{s.fvrSummary ? ` · FVR: ${s.fvrSummary.accepted ?? 0} accepted, ${s.fvrSummary.rejected ?? 0} rejected, ${s.fvrSummary.notFound ?? 0} not in report` : ''}</Meta>
            </div>
            <span className="flex flex-wrap gap-2">
              <a className="inline-flex min-h-11 items-center text-sm underline" href={`/api/mds/submission?id=${s.id}`}>Download</a>
              {s.status === 'generated' ? <BillingAction op="mds.mark_uploaded" input={{ submissionId: s.id }}>Uploaded to iQIES</BillingAction> : null}
              {['generated', 'uploaded'].includes(s.status) ? <BillingAction op="mds.record_fvr" input={{ submissionId: s.id }} fields={[{ name: 'text', label: 'Final Validation Report (paste the text)', type: 'textarea', required: true }]}>Record the FVR</BillingAction> : null}
            </span>
          </Row>
        )) : <Empty>No submissions yet.</Empty>}
      </Section>
    </Page>
  );
}
