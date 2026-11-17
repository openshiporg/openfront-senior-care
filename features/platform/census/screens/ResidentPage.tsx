import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, Stat } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';
import { money } from '../../lib/format';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

type Rep = { id: string; reference: string; self: boolean; roles: string[]; contactPriority: number; status: string; contact: { firstName: string; lastName: string; email: string; phone: string } | null; portalAccount: { reference: string; status: string } | null };
type Event = { id: string; seq: number; kind: string; effectiveAt: string; leaveKind: string | null; holdElected: boolean; holdPaidBy: string | null; dischargeDisposition: string | null; initiatedBy: string | null; correctionReason: string; fromBed: { label: string } | null; toBed: { label: string } | null; fromApartment: { number: string } | null; toApartment: { number: string } | null; actor: { name: string } | null };
type Stay = {
  id: string; reference: string; setting: string; status: string; presence: string; admittedAt: string | null; dischargedAt: string | null; admissionSource: string | null; dischargeDisposition: string | null; leaveDaysUsedThisYear: number; version: number;
  currentBed: { label: string } | null; heldBed: { label: string } | null; currentApartment: { number: string } | null; agreement: { id: string } | null;
  coverage: { id: string; rank: string; startDate: string; endDate: string | null; status: string; payer: { name: string; kind: string } | null }[];
  events: Event[];
};
type Resident = {
  id: string; reference: string; firstName: string; lastName: string; preferredName: string; dateOfBirth: string | null; sex: string | null; primaryLanguage: string; interpreterNeeded: boolean; veteran: boolean; status: string;
  representatives: Rep[]; stays: Stay[];
};
type Notice = { id: string; kind: string; method: string; deliveredAt: string | null; acknowledgement: string; copyToOmbudsmanAt: string | null; recipientRepresentative: { contact: { firstName: string; lastName: string } | null } | null };
type Clock = { id: string; obligationCode: string; status: string; dueAt: string; satisfiedAt: string | null; ruleRef: string; verifyNote: string };

const age = (dob: string | null) => {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const now = new Date();
  return now.getUTCFullYear() - y - (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d) ? 1 : 0);
};

function eventText(e: Event) {
  const bed = (b: { label: string } | null, a: { number: string } | null) => b?.label ?? (a ? `Apt ${a.number}` : '');
  switch (e.kind) {
    case 'admission': case 'readmission': return `${label(e.kind)} to ${bed(e.toBed, e.toApartment)}`;
    case 'room_change': return `Moved ${bed(e.fromBed, e.fromApartment)} → ${bed(e.toBed, e.toApartment)}`;
    case 'leave_start': return `${label(e.leaveKind ?? 'other')} leave · ${e.holdElected ? `bed held${e.holdPaidBy ? `, paid by ${label(e.holdPaidBy).toLowerCase()}` : ''}` : 'no bed hold'}`;
    case 'leave_end': return `Returned${e.toBed || e.toApartment ? ` to ${bed(e.toBed, e.toApartment)}` : ''}`;
    case 'discharge': return `Discharged · ${label(e.dischargeDisposition ?? 'other')}${e.initiatedBy === 'facility' ? ' · facility-initiated' : ''}`;
    case 'correction': return `Correction · ${e.correctionReason}`;
    default: return label(e.kind);
  }
}

/** Resident face sheet: who they are, where they are, who speaks for them, the census trail and open clocks. */
export default async function ResidentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ community?: string }> }) {
  const { id } = await params;
  const { community } = await currentCommunity((await searchParams)?.community);
  const tz = community?.timeZone ?? 'America/New_York';
  const data = await q<{ resident: Resident | null; noticeDeliveries: Notice[]; complianceClocks: Clock[] }>(`query Face($id: ID!) {
    resident(where: { id: $id }) {
      id reference firstName lastName preferredName dateOfBirth sex primaryLanguage interpreterNeeded veteran status
      representatives(orderBy: { contactPriority: asc }) { id reference self roles contactPriority status contact { firstName lastName email phone } portalAccount { reference status } }
      stays(orderBy: { createdAt: desc }) {
        id reference setting status presence admittedAt dischargedAt admissionSource dischargeDisposition leaveDaysUsedThisYear version
        currentBed { label } heldBed { label } currentApartment { number } agreement { id }
        coverage(orderBy: { startDate: desc }) { id rank startDate endDate status payer { name kind } }
        events(orderBy: { seq: desc }) { id seq kind effectiveAt leaveKind holdElected holdPaidBy dischargeDisposition initiatedBy correctionReason fromBed { label } toBed { label } fromApartment { number } toApartment { number } actor { name } }
      }
    }
    noticeDeliveries(where: { resident: { id: { equals: $id } } }, orderBy: { deliveredAt: desc }, take: 30) { id kind method deliveredAt acknowledgement copyToOmbudsmanAt recipientRepresentative { contact { firstName lastName } } }
    complianceClocks(where: { resident: { id: { equals: $id } }, current: { equals: true } }, orderBy: { dueAt: desc }, take: 40) { id obligationCode status dueAt satisfiedAt ruleRef verifyNote }
  }`, { id });
  const r = data.resident;
  if (!r) notFound();
  const name = `${r.preferredName || r.firstName} ${r.lastName}`;
  const stay = r.stays[0];
  const place = stay?.currentBed?.label ?? (stay?.currentApartment ? `Apt ${stay.currentApartment.number}` : stay?.heldBed ? `${stay.heldBed.label} (held)` : '—');
  const primary = stay?.coverage.find(c => c.rank === 'primary' && !c.endDate);
  const openClocks = data.complianceClocks.filter(c => c.status === 'open' || c.status === 'overdue');
  const slug = community?.slug ?? '';
  // Billing set-up for this resident: each read needs its own permission; without it that part is not shown.
  const residentCommunity = community?.id ?? null;
  const deposits = (await q<{ deposits: { id: string; kind: string; amountMinor: string; status: string; receivedOn: string | null }[] }>(`query D($id: ID!) { deposits(where: { resident: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 20) { id kind amountMinor status receivedOn } }`, { id }).catch(() => null))?.deposits ?? null;
  const openStatements = deposits ? (await q<{ statements: { id: string; number: string }[] }>(`query S($id: ID!) { statements(where: { resident: { id: { equals: $id } }, status: { equals: "issued" } }, orderBy: { issuedAt: desc }, take: 12) { id number } }`, { id }).catch(() => ({ statements: [] }))).statements : [];
  const careLevels = stay && (stay.setting === 'assisted_living' || stay.setting === 'memory_care') ? (await q<{ careLevels: { id: string; name: string }[] }>(`query L($s: String!) { careLevels(where: { setting: { equals: $s }, status: { equals: "active" } }, orderBy: { minPoints: asc }) { id name } }`, { s: stay.setting }).catch(() => null))?.careLevels ?? null : null;
  const funds = (await q<{ trustAccounts: { id: string; name: string; status: string }[]; residentTrustLedgers: { id: string; reference: string; status: string }[] }>(`query F($id: ID!) { trustAccounts(where: { status: { equals: "active" } }, take: 5) { id name status } residentTrustLedgers(where: { resident: { id: { equals: $id } } }, take: 5) { id reference status } }`, { id }).catch(() => null));
  return (
    <Page title={name} crumbs={[{ label: 'Census', href: `/dashboard/platform/census?community=${slug}` }, { label: 'Residents', href: `/dashboard/platform/census/residents?community=${slug}` }]}>
      <div className="space-y-1">
        <Title status={stay ? (stay.status === 'admitted' ? stay.presence : stay.status) : r.status}>{r.firstName}{r.preferredName && r.preferredName !== r.firstName ? ` “${r.preferredName}”` : ''} {r.lastName}</Title>
        <Meta>{r.reference}{r.dateOfBirth ? ` · born ${when(r.dateOfBirth, tz, 'date')} (${age(r.dateOfBirth)})` : ''}{r.sex ? ` · ${label(r.sex)}` : ''}{r.primaryLanguage ? ` · ${r.primaryLanguage}${r.interpreterNeeded ? ', interpreter needed' : ''}` : ''}{r.veteran ? ' · veteran' : ''}</Meta>
      </div>
      {stay ? (
        <section className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
          <Stat name="Place" value={place} />
          <Stat name="Setting" value={label(stay.setting)} />
          <Stat name="Primary payer" value={primary?.payer?.name ?? '—'} />
          <Stat name={stay.status === 'admitted' ? 'Admitted' : 'Left'} value={when(stay.status === 'admitted' ? stay.admittedAt : stay.dischargedAt, tz, 'day') || '—'} />
        </section>
      ) : null}
      {openClocks.length ? (
        <Section title={`Open deadlines · ${openClocks.length}`}>
          {openClocks.map(c => (
            <Row key={c.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={c.status}>{label(c.obligationCode.toLowerCase())}</Title>
                <Meta>Due {when(c.dueAt, tz)} · {c.ruleRef}</Meta>
              </div>
            </Row>
          ))}
        </Section>
      ) : null}
      <Section title="Representatives">
        {r.representatives.filter(rep => !rep.self).length ? r.representatives.filter(rep => !rep.self).map(rep => (
          <Row key={rep.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={rep.status === 'active' ? null : rep.status}>{rep.contact ? `${rep.contact.firstName} ${rep.contact.lastName}` : rep.reference}</Title>
              <Meta>{rep.roles.map(label).join(', ')}{rep.contactPriority === 1 ? ' · first to call' : rep.contactPriority > 1 ? ` · call ${ordinal(rep.contactPriority)}` : ''}{rep.contact?.phone ? ` · ${rep.contact.phone}` : ''}{rep.contact?.email ? ` · ${rep.contact.email}` : ''}</Meta>
            </div>
            {rep.portalAccount ? <span className="text-xs text-muted-foreground">Family portal: {label(rep.portalAccount.status).toLowerCase()}</span> : null}
          </Row>
        )) : <Empty>{r.representatives.some(rep => rep.self) ? 'Represents themself; no one else is on file.' : 'No representative on file.'}</Empty>}
      </Section>
      {stay ? (
        <Section title="Coverage">
          {stay.coverage.map(c => (
            <Row key={c.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={c.endDate ? 'ended' : null}>{c.payer?.name ?? 'Payer'}</Title>
                <Meta>{label(c.rank)} · from {when(c.startDate, tz, 'date')}{c.endDate ? ` to ${when(c.endDate, tz, 'date')}` : ''}</Meta>
              </div>
            </Row>
          ))}
          {stay.setting === 'nursing_facility' ? <Meta>Bed-hold days used this year: {stay.leaveDaysUsedThisYear}</Meta> : null}
        </Section>
      ) : null}
      {r.stays.map(s => (
        <Section key={s.id} title={`Census · stay ${s.reference}`} aside={<Link className="text-xs underline underline-offset-4" href={`/dashboard/platform/census/events?community=${slug}&stay=${s.id}`}>All events</Link>}>
          {s.events.map(e => (
            <Row key={e.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <span className="break-words font-medium">{eventText(e)}</span>
                <Meta>{when(e.effectiveAt, tz)}{e.actor ? ` · ${e.actor.name}` : ''}</Meta>
              </div>
              <span className="font-mono text-xs text-muted-foreground">#{e.seq}</span>
            </Row>
          ))}
        </Section>
      ))}
      {deposits ? (
        <Section title="Deposits" aside={residentCommunity ? <BillingAction op="deposit.receive" input={{ communityId: residentCommunity, residentId: r.id }} fields={[
          { name: 'kind', label: 'Kind', type: 'select', required: true, options: [['security', 'Security'], ['pet', 'Pet'], ['reservation', 'Reservation'], ['community_fee', 'Community fee'], ['other', 'Other']].map(([value, text]) => ({ value, label: text })) },
          { name: 'amountMinor', label: 'Amount', type: 'money', required: true },
          { name: 'method', label: 'How it was paid', type: 'select', required: true, options: [['check', 'Check'], ['cash', 'Cash'], ['card', 'Card'], ['ach', 'Bank transfer'], ['other', 'Other']].map(([value, text]) => ({ value, label: text })) },
          { name: 'receivedOn', label: 'Received on', type: 'date', required: true },
          { name: 'note', label: 'Note' },
        ]}>Record a deposit</BillingAction> : null}>
          {deposits.length ? deposits.map(d => (
            <Row key={d.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={d.status}>{label(d.kind)} deposit · {label(d.status)}</Title>
                <Meta>{d.receivedOn ? `Received ${when(d.receivedOn, tz, 'date')}` : ''}</Meta>
              </div>
              <span className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
                {money(d.amountMinor)}
                {d.status === 'held' && openStatements.length ? <BillingAction op="deposit.apply" input={{ depositId: d.id }} fields={[{ name: 'statementId', label: 'Statement', type: 'select', required: true, options: openStatements.map(st => ({ value: st.id, label: st.number })) }]}>Apply to a statement</BillingAction> : null}
                {d.status === 'held' ? <BillingAction op="refund.request" input={{ depositId: d.id, amountMinor: d.amountMinor }} fields={[{ name: 'reason', label: 'Why', required: true }]}>Refund</BillingAction> : null}
                {d.status === 'held' ? <BillingAction op="deposit.forfeit" input={{ depositId: d.id }} fields={[{ name: 'reason', label: 'Why the deposit is kept', required: true }]}>Keep deposit</BillingAction> : null}
              </span>
            </Row>
          )) : <Empty>No deposit on file.</Empty>}
        </Section>
      ) : null}
      {stay && careLevels ? (
        <Section title="Care level">
          <div className="flex flex-wrap items-start gap-3">
            <BillingAction op="care_level.assign" input={{ stayId: stay.id }} fields={[
              { name: 'careLevelId', label: 'Care level', type: 'select', required: true, options: careLevels.map(l => ({ value: l.id, label: l.name })) },
              { name: 'effectiveFrom', label: 'Starts on', type: 'date', required: true },
              { name: 'noticeDeliveredOn', label: 'Notice given on', type: 'date' },
              { name: 'reason', label: 'Why' },
            ]}>Set the care level</BillingAction>
          </div>
        </Section>
      ) : null}
      {stay && deposits && stay.coverage.some(c => c.payer?.kind === 'medicaid') ? (
        <Section title="Medicaid patient liability">
          <div className="flex flex-wrap items-start gap-3">
            <BillingAction op="medicaid.record" input={{ stayId: stay.id }} fields={[
              { name: 'month', label: 'Month (first day)', type: 'date', required: true },
              { name: 'liabilityMinor', label: 'Liability for the month', type: 'money', required: true },
              { name: 'noticeReceivedOn', label: 'Notice received on', type: 'date' },
              { name: 'note', label: 'Note' },
            ]}>Record one month</BillingAction>
          </div>
        </Section>
      ) : null}
      {funds && residentCommunity && funds.trustAccounts.length && !funds.residentTrustLedgers.some(l => l.status === 'open') ? (
        <Section title="Resident funds">
          <div className="flex flex-wrap items-start gap-3">
            <BillingAction op="trust.open_ledger" input={{ communityId: residentCommunity, residentId: r.id }} fields={[
              { name: 'accountId', label: 'Bank account', type: 'select', required: true, defaultValue: funds.trustAccounts[0].id, options: funds.trustAccounts.map(a => ({ value: a.id, label: a.name })) },
              { name: 'consentOnFile', label: 'Written consent is on file', type: 'checkbox', required: true },
            ]}>Open a funds ledger</BillingAction>
          </div>
        </Section>
      ) : null}
      <Section title="Notices">
        {data.noticeDeliveries.length ? data.noticeDeliveries.map(n => (
          <Row key={n.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={n.acknowledgement === 'signed' ? 'signed' : null}>{label(n.kind)}</Title>
              <Meta>{label(n.method)} · {when(n.deliveredAt, tz)}{n.recipientRepresentative?.contact ? ` · to ${n.recipientRepresentative.contact.firstName} ${n.recipientRepresentative.contact.lastName}` : ''}{n.copyToOmbudsmanAt ? ` · ombudsman copy ${when(n.copyToOmbudsmanAt, tz, 'day')}` : ''}</Meta>
            </div>
          </Row>
        )) : <Empty>No notices recorded.</Empty>}
      </Section>
    </Page>
  );
}
