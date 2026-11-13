import { notFound } from 'next/navigation';
import { q, currentCommunity } from '../../lib/server';
import { label, money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, Stat } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';
import { conveyanceClock } from '@/features/keystone/trust/service';

type Line = { id: string; bucket: string; side: string; amountMinor: string; effectiveOn: string | null };
type Ledger = { id: string; reference: string; status: string; closedOn: string | null; closedReason: string | null; conveyedOn: string | null; conveyedTo: string; resident: { firstName: string; lastName: string } | null };
type Auth = { id: string; status: string; signedOn: string | null; kinds: string[] | null; perWithdrawalLimitMinor: string | null; revokedReason: string; recordedBy: { name: string } | null };
type Tx = { id: string; reference: string; kind: string; amountMinor: string; status: string; purpose: string; effectiveOn: string | null };

/** One resident's funds: balance, history and, after they leave, the 30-day clock to convey what is left. */
export default async function TrustLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { community } = await currentCommunity(null);
  const data = await q<{ residentTrustLedger: Ledger | null; trustLedgerLines: Line[]; trustTransactions: Tx[] }>(`query L($id: ID!) {
    residentTrustLedger(where: { id: $id }) { id reference status closedOn closedReason conveyedOn conveyedTo resident { firstName lastName } }
    trustLedgerLines(where: { ledger: { id: { equals: $id } } }, orderBy: { effectiveOn: asc }, take: 2000) { id bucket side amountMinor effectiveOn }
    trustTransactions(where: { ledger: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 50) { id reference kind amountMinor status purpose effectiveOn }
  }`, { id }).catch(() => null);
  if (!data?.residentTrustLedger) notFound();
  const auths = (await q<{ trustAuthorisations: Auth[] }>(`query A($id: ID!) { trustAuthorisations(where: { ledger: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 20) { id status signedOn kinds perWithdrawalLimitMinor revokedReason recordedBy { name } } }`, { id }).catch(() => ({ trustAuthorisations: [] as Auth[] }))).trustAuthorisations;
  const activeAuth = auths.find(a => a.status === 'active') ?? null;
  const l = data.residentTrustLedger;
  const tz = community?.timeZone ?? 'America/New_York';
  // The resident's balance is the client-liability side: credits less debits.
  const balance = data.trustLedgerLines.filter(x => x.bucket === 'client_liability').reduce((sum, x) => sum + (x.side === 'credit' ? BigInt(x.amountMinor) : -BigInt(x.amountMinor)), 0n);
  const clock = conveyanceClock({ status: l.status, closedOn: l.closedOn ? l.closedOn.slice(0, 10) : null, balanceMinor: balance, today: new Date().toISOString().slice(0, 10) });
  const name = l.resident ? `${l.resident.firstName} ${l.resident.lastName}` : 'Resident';
  return (
    <Page title={`Funds · ${name}`} crumbs={[{ label: 'Resident funds', href: '/dashboard/platform/trust' }]}>
      <Section title={l.reference}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat name="Balance" value={money(balance.toString())} />
          <Stat name="Status" value={label(l.status)} />
          <Stat name="Closed" value={l.closedOn ? when(l.closedOn, tz, 'date') : '—'} />
          <Stat name="Conveyed" value={l.conveyedOn ? when(l.conveyedOn, tz, 'date') : '—'} />
        </div>
        {clock.state !== 'not_due' && clock.state !== 'done' ? <Title status={clock.state === 'overdue' ? 'overdue' : 'due'}>{clock.state === 'overdue' ? `Conveyance was due ${clock.dueBy ? when(clock.dueBy, tz, 'date') : ''}` : `Convey the balance by ${clock.dueBy ? when(clock.dueBy, tz, 'date') : ''}`}</Title> : null}
        <div className="flex flex-wrap items-start gap-3 pt-1">
          {l.status === 'open' ? (
            <>
              <BillingAction op="trust.deposit" input={{ ledgerId: l.id }} fields={[{ name: 'amountMinor', label: 'Amount', type: 'money', required: true }, { name: 'purpose', label: 'What it is for' }]}>Deposit</BillingAction>
              <BillingAction op="trust.withdraw" input={{ ledgerId: l.id }} fields={[{ name: 'amountMinor', label: 'Amount', type: 'money', required: true }, { name: 'purpose', label: 'What it is for', required: true }]}>Withdraw</BillingAction>
              <BillingAction op="trust.close_ledger" input={{ ledgerId: l.id }} fields={[{ name: 'reason', label: 'Why it is closing', type: 'select', required: true, options: [{ value: 'discharge', label: 'Discharge' }, { value: 'death', label: 'Death' }, { value: 'transfer', label: 'Transfer' }] }]}>Close ledger</BillingAction>
            </>
          ) : null}
          {l.status === 'closed' && balance > 0n ? <BillingAction op="trust.convey" input={{ ledgerId: l.id }} fields={[{ name: 'conveyedTo', label: 'Paid to (estate, family member or agency)', required: true }]}>Convey the balance</BillingAction> : null}
        </div>
      </Section>
      <Section title="Written authorisation" aside={l.status === 'open' ? <BillingAction op="trust.authorisation_record" input={{ ledgerId: l.id }} fields={[
        { name: 'signedOn', label: 'Signed on', type: 'date', required: true },
        { name: 'kinds', label: 'Covers (comma separated: deposit, withdrawal_cash, withdrawal_purchase, liability_transfer)', required: true, defaultValue: 'deposit, withdrawal_cash, withdrawal_purchase' },
        { name: 'perWithdrawalLimitMinor', label: 'Limit for each withdrawal (blank for no limit)', type: 'money' },
      ]}>Record an authorisation</BillingAction> : null}>
        {!activeAuth ? <Title status="overdue">No active authorisation. Withdrawals are refused until one is recorded{auths.some(a => a.status === 'pending_approval') ? ' and approved' : ''}.</Title> : null}
        {auths.map(a => (
          <Row key={a.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={a.status === 'pending_approval' ? 'pending' : a.status}>{label(a.status)}{a.status === 'pending_approval' ? ' · waiting for a second person in Approvals' : ''}</Title>
              <Meta>{a.signedOn ? `Signed ${when(a.signedOn, tz, 'date')} · ` : ''}{(a.kinds ?? []).map(k => label(k)).join(', ')} · {a.perWithdrawalLimitMinor ? `up to ${money(a.perWithdrawalLimitMinor)} a withdrawal` : 'no limit'}{a.recordedBy ? ` · recorded by ${a.recordedBy.name}` : ''}{a.revokedReason ? ` · ${a.revokedReason}` : ''}</Meta>
            </div>
            {a.status === 'active' || a.status === 'pending_approval' ? <BillingAction op="trust.authorisation_revoke" input={{ authorisationId: a.id }} fields={[{ name: 'reason', label: 'Why', required: true }]}>Revoke</BillingAction> : null}
          </Row>
        ))}
      </Section>
      <Section title="History">
        {data.trustTransactions.length ? data.trustTransactions.map(t => (
          <Row key={t.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={t.status}>{label(t.kind)}</Title>
              <Meta>{t.reference}{t.effectiveOn ? ` · ${when(t.effectiveOn, tz, 'date')}` : ''}{t.purpose ? ` · ${t.purpose}` : ''}</Meta>
            </div>
            <span className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
              {money(t.amountMinor)}
              {t.status === 'posted' && t.kind !== 'reversal' ? <BillingAction op="trust.reverse" input={{ transactionId: t.id }} fields={[{ name: 'reason', label: 'Why', required: true }]}>Reverse</BillingAction> : null}
            </span>
          </Row>
        )) : <Empty>No activity yet.</Empty>}
      </Section>
    </Page>
  );
}
