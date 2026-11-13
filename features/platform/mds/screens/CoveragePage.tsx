import { q, currentCommunity } from '../../lib/server';
import { benefitDays, stretchDates } from '@/features/keystone/billing/medicare';
import { counterSummary, MEDICARE_VERIFY_NOTE, qualifyingStay } from '@/features/keystone/coverage/medicare';
import { coverageClocks } from '@/features/keystone/coverage/clocks';
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';

const residentName = (r: { firstName: string | null; lastName: string | null } | null) => (r && (r.firstName || r.lastName) ? [r.lastName, r.firstName].filter(Boolean).join(', ') : 'Resident');
type Coverage = {
  id: string; status: string; startDate: string; endDate: string | null; lastCoveredDay: string | null; qualifyingStayFrom: string | null; qualifyingStayTo: string | null; qualifyingStayHospital: string;
  qualifyingStayEvidence: { id: string } | null; qualifyingStayEvidenceNote: string; skilledCertSignedAt: string | null; skilledCertBy: string; hospiceAgency: string; hospiceRoomBoardBps: number | null;
  payer: { id: string; name: string; kind: string } | null;
};
type Stay = { id: string; admittedAt: string | null; resident: { id: string; firstName: string; lastName: string } | null; coverages: Coverage[] };
type Notice = { subjectId: string; kind: string; deliveredAt: string | null };
type Auth = { id: string; reference: string; status: string; authFrom: string | null; authTo: string | null; reviewIntervalDays: number; coverage: { id: string } | null; reviews: { reviewedOn: string; outcome: string }[] };
type Prior = { daysUsed: number; asOf: string; source: string; resident: { id: string } | null };

const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);
const ACTIVE = ['active', 'ending', 'pending', 'retro_approved'];

/**
 * Coverage for each nursing-facility resident: Medicare Part A day count (1-20 full, 21-100 coinsurance, 101 not covered), the
 * qualifying stay and skilled certification, the last covered day with its NOMNC 2-day clock, MA authorisations and their next
 * concurrent review, and hospice elections. Every count and clock is worked out when the page loads.
 */
export default async function CoveragePage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const { community, communities } = await currentCommunity((await searchParams)?.community);
  if (!community) return <Page title="Coverage"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ stays: Stay[]; payers: { id: string; name: string; kind: string }[] }>(`query C($id: ID!) {
    stays(where: { community: { id: { equals: $id } }, setting: { equals: "nursing_facility" }, status: { in: ["admitted", "on_leave"] } }, orderBy: { admittedAt: asc }, take: 300) {
      id admittedAt resident { id firstName lastName }
      coverages: coverage(orderBy: { startDate: asc }) { id status startDate endDate lastCoveredDay qualifyingStayFrom qualifyingStayTo qualifyingStayHospital qualifyingStayEvidence { id } qualifyingStayEvidenceNote skilledCertSignedAt skilledCertBy hospiceAgency hospiceRoomBoardBps payer { id name kind } }
    }
    payers(take: 100) { id name kind }
  }`, { id: community.id }).catch(() => null);
  if (!data) return <Page title="Coverage"><Empty>Your role doesn&apos;t include coverage. Use the menu for the screens you can open.</Empty></Page>;
  const coverageIds = data.stays.flatMap(s => s.coverages.map(c => c.id));
  const residentIds = data.stays.map(s => s.resident?.id).filter((v): v is string => Boolean(v));
  const extra = await q<{ noticeDeliveries: Notice[]; authorisations: Auth[]; priorSnfDaysObservations: Prior[] }>(`query E($ids: [String!], $res: [ID!]) {
    noticeDeliveries(where: { subjectType: { equals: "CoveragePeriod" }, subjectId: { in: $ids }, kind: { in: ["nomnc", "snfabn"] } }, orderBy: { deliveredAt: asc }, take: 500) { subjectId kind deliveredAt }
    authorisations(where: { resident: { id: { in: $res } } }, orderBy: { createdAt: desc }, take: 300) { id reference status authFrom authTo reviewIntervalDays coverage { id } reviews(orderBy: { reviewedOn: desc }, take: 1) { reviewedOn outcome } }
    priorSnfDaysObservations(where: { resident: { id: { in: $res } } }, orderBy: { asOf: desc }, take: 300) { daysUsed asOf source resident { id } }
  }`, { ids: coverageIds, res: residentIds }).catch(() => ({ noticeDeliveries: [] as Notice[], authorisations: [] as Auth[], priorSnfDaysObservations: [] as Prior[] }));
  const today = new Date().toISOString().slice(0, 10);
  const tz = community.timeZone;
  const payerOptions = data.payers.map(p => ({ value: p.id, label: `${p.name} (${label(p.kind)})` }));
  return (
    <Page title="Coverage">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/mds/coverage" />
      <Section title="Nursing-facility residents">
        {data.stays.length ? data.stays.map(stay => {
          const current = stay.coverages.find(c => ACTIVE.includes(c.status) && day(c.startDate)! <= today && (!c.endDate || day(c.endDate)! > today)) ?? null;
          const partA = stay.coverages.filter(c => c.payer?.kind === 'medicare_a' && c.status !== 'cancelled');
          const stretches = partA.map(c => ({ from: day(c.startDate)!, to: c.endDate ? addDays(day(c.endDate)!, -1) : null }));
          const prior = extra.priorSnfDaysObservations.find(p => p.resident?.id === stay.resident?.id && (!stretches[0] || day(p.asOf)! <= stretches[0].from));
          const counted = stretches.length ? [...benefitDays({ stayId: stay.id, stretches, priorDaysUsed: prior?.daysUsed ?? 0, classifications: [], qualifyingStayOk: true, skilledCertOk: true }, today).values()] : [];
          const summary = counted.length ? counterSummary(counted) : null;
          const auth = current ? extra.authorisations.find(a => a.coverage?.id === current.id && a.status !== 'denied') ?? null : null;
          const notice = current ? extra.noticeDeliveries.find(n => n.subjectId === current.id && n.deliveredAt) ?? null : null;
          const clocks = coverageClocks({ lastCoveredDay: day(current?.lastCoveredDay), noticeOn: day(notice?.deliveredAt), today, auth: auth ? { authFrom: day(auth.authFrom), authTo: day(auth.authTo), lastReviewOn: day(auth.reviews[0]?.reviewedOn), intervalDays: auth.reviewIntervalDays, status: auth.status } : null });
          const qs = current?.payer?.kind === 'medicare_a' ? qualifyingStay({ inpatientFrom: day(current.qualifyingStayFrom), inpatientTo: day(current.qualifyingStayTo), snfAdmission: day(current.startDate)!, hasEvidence: Boolean(current.qualifyingStayEvidence || current.qualifyingStayEvidenceNote) }) : null;
          const name = residentName(stay.resident);
          return (
            <Row key={stay.id}>
              <div className="min-w-0 flex-1 basis-72 space-y-0.5">
                <Title status={current?.status ?? 'unknown'}>{name} · {current?.payer ? current.payer.name : 'No current coverage'}</Title>
                {summary ? <Meta>Part A days this spell: {summary.fullDaysUsed} full, {summary.coinsuranceDaysUsed} coinsurance{summary.exhaustedDays ? `, ${summary.exhaustedDays} beyond day 100 (not covered)` : ''}{prior ? ` · ${prior.daysUsed} prior days (${label(prior.source)}, as of ${when(prior.asOf, tz, 'date')})` : ''} · {Math.max(0, 100 - (summary.lastCountedDay ?? 0))} left · {stretchDates(stretches, today).length} covered dates</Meta> : null}
                {qs ? <Meta>Qualifying stay: {qs.ok ? `${when(current!.qualifyingStayFrom, tz, 'date')} to ${when(current!.qualifyingStayTo, tz, 'date')}${current!.qualifyingStayHospital ? ` at ${current!.qualifyingStayHospital}` : ''}` : `missing: ${qs.problems.map(label).join(', ')}`} · Skilled certification: {current!.skilledCertSignedAt ? `signed ${when(current!.skilledCertSignedAt, tz, 'date')} by ${current!.skilledCertBy}` : 'not on file'}</Meta> : null}
                {current?.lastCoveredDay ? <Meta>Last covered day {when(current.lastCoveredDay, tz, 'date')} · NOMNC {clocks.notice ? `${label(clocks.notice.status)} (due by ${when(clocks.notice.dueBy, tz, 'date')}${clocks.notice.daysLeft !== null && clocks.notice.status === 'due' ? `, ${clocks.notice.daysLeft} day(s) left` : ''})` : ''}</Meta> : null}
                {auth ? <Meta>Authorisation {auth.reference} · {label(auth.status)}{auth.authFrom ? ` · ${when(auth.authFrom, tz, 'date')} to ${when(auth.authTo, tz, 'date')}` : ''}{clocks.nextReview ? ` · next review by ${when(clocks.nextReview, tz, 'date')}` : ''}</Meta> : null}
                {current?.payer?.kind === 'hospice_agency' ? <Meta>Hospice: {current.hospiceAgency} · room and board passed through at {(current.hospiceRoomBoardBps ?? 0) / 100}%</Meta> : null}
              </div>
              <span className="flex flex-wrap gap-2">
                <BillingAction op="coverage.change_payer" input={{ stayId: stay.id }} fields={[
                  { name: 'payerId', label: 'New payer', type: 'select', required: true, options: payerOptions },
                  { name: 'from', label: 'From', type: 'date', required: true, defaultValue: today },
                  { name: 'memberReference', label: 'Member number' },
                  { name: 'hospiceAgency', label: 'Hospice agency (hospice only)' },
                  { name: 'hospiceRoomBoardBps', label: 'Room-and-board share, basis points (hospice only)', placeholder: '9500' },
                  { name: 'endOverrideReason', label: 'If ending Part A without a NOMNC, why', type: 'select', options: ['resident_refused_notice', 'death', 'emergency_transfer', 'other'].map(v => ({ value: v, label: label(v) })) },
                ]}>Change payer</BillingAction>
                {current?.payer?.kind === 'medicare_a' ? (
                  <>
                    <BillingAction op="coverage.qualifying_stay" input={{ coverageId: current.id }} fields={[
                      { name: 'from', label: 'Inpatient from', type: 'date', required: true }, { name: 'to', label: 'Inpatient to (discharge)', type: 'date', required: true },
                      { name: 'hospital', label: 'Hospital', required: true }, { name: 'evidenceNote', label: 'Where the record is' },
                    ]}>Qualifying stay</BillingAction>
                    <BillingAction op="coverage.skilled_cert" input={{ coverageId: current.id }} fields={[{ name: 'signedOn', label: 'Signed on', type: 'date', required: true }, { name: 'signedBy', label: 'Physician or NP', required: true }]}>Skilled certification</BillingAction>
                    {stay.resident ? <BillingAction op="coverage.prior_days" input={{ residentId: stay.resident.id }} fields={[
                      { name: 'source', label: 'From', type: 'select', required: true, options: ['hets', 'cwf_manual', 'hospital_record', 'resident_report'].map(v => ({ value: v, label: label(v) })) },
                      { name: 'daysUsed', label: 'SNF days already used this spell', required: true }, { name: 'asOf', label: 'As of', type: 'date', required: true, defaultValue: today },
                    ]}>Prior days</BillingAction> : null}
                  </>
                ) : null}
                {current && ['medicare_a', 'medicare_advantage'].includes(current.payer?.kind ?? '') ? (
                  <>
                    <BillingAction op="coverage.last_covered_day" input={{ coverageId: current.id }} fields={[{ name: 'lastCoveredDay', label: 'Last covered day', type: 'date', required: true }, { name: 'reason', label: 'Why' }]}>Last covered day</BillingAction>
                    <BillingAction op="coverage.notice" input={{ coverageId: current.id }} fields={[
                      { name: 'kind', label: 'Notice', type: 'select', required: true, options: [{ value: 'nomnc', label: label('nomnc') }, { value: 'snfabn', label: label('snfabn') }] },
                      { name: 'deliveredOn', label: 'Delivered on', type: 'date', required: true, defaultValue: today },
                      { name: 'method', label: 'How', type: 'select', required: true, options: ['in_person', 'mail', 'phone_then_mail'].map(v => ({ value: v, label: label(v) })) },
                      { name: 'acknowledgement', label: 'Acknowledgement', type: 'select', options: ['signed', 'refused_witnessed'].map(v => ({ value: v, label: label(v) })) },
                    ]}>Record notice</BillingAction>
                  </>
                ) : null}
                {current && ['medicare_advantage', 'medicaid_mco', 'commercial'].includes(current.payer?.kind ?? '') && !auth ? (
                  <BillingAction op="authorisation.request" input={{ coverageId: current.id }} fields={[{ name: 'requestedOn', label: 'Requested on', type: 'date', required: true, defaultValue: today }, { name: 'levelOfCare', label: 'Level of care' }, { name: 'reviewIntervalDays', label: 'Review every (days)', defaultValue: '7' }]}>Request authorisation</BillingAction>
                ) : null}
                {auth?.status === 'requested' ? <BillingAction op="authorisation.decide" input={{ authorisationId: auth.id }} fields={[{ name: 'decision', label: 'Decision', type: 'select', required: true, options: [{ value: 'approved', label: 'Approved' }, { value: 'denied', label: 'Denied' }] }, { name: 'authFrom', label: 'Authorised from', type: 'date' }, { name: 'authTo', label: 'Authorised to', type: 'date' }, { name: 'payerAuthNumber', label: 'Plan authorisation number' }]}>Record decision</BillingAction> : null}
                {auth?.status === 'approved' ? <BillingAction op="authorisation.review" input={{ authorisationId: auth.id }} fields={[{ name: 'reviewedOn', label: 'Reviewed on', type: 'date', required: true, defaultValue: today }, { name: 'outcome', label: 'Outcome', type: 'select', required: true, options: ['continued', 'extended', 'last_covered_day_set', 'denied'].map(v => ({ value: v, label: label(v) })) }, { name: 'newAuthTo', label: 'New authorised-to / last covered day', type: 'date' }, { name: 'reviewer', label: 'Plan reviewer' }]}>Concurrent review</BillingAction> : null}
                {current?.payer?.kind === 'hospice_agency' ? <BillingAction op="coverage.hospice_revoke" input={{ coverageId: current.id }} fields={[{ name: 'revokedOn', label: 'Revoked on', type: 'date', required: true }, { name: 'nextPayerId', label: 'Payer after', type: 'select', required: true, options: payerOptions.filter(p => !/Hospice/.test(p.label)) }]}>Revoke hospice</BillingAction> : null}
              </span>
            </Row>
          );
        }) : <Empty>No nursing-facility residents in house.</Empty>}
        <Meta>{MEDICARE_VERIFY_NOTE}</Meta>
      </Section>
    </Page>
  );
}
