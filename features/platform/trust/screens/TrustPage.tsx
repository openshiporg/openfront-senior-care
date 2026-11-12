import { q, currentCommunity } from '../../lib/server';
import { label, money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';

type Account = { id: string; name: string; bankName: string; last4: string; status: string };
type Ledger = { id: string; reference: string; status: string; closedOn: string | null; conveyedOn: string | null; resident: { id: string; firstName: string; lastName: string } | null };
type Tx = { id: string; reference: string; kind: string; amountMinor: string; status: string; purpose: string; effectiveOn: string | null; resident: { firstName: string; lastName: string } | null; preparedBy: { name: string } | null; signedBy: { name: string } | null };
type Recon = { id: string; month: string; status: string; bankBalanceMinor: string; bookBalanceMinor: string; residentTotalMinor: string; differenceMinor: string; account: { name: string } | null };

/** Resident funds. A withdrawal over the threshold waits for a second person; the person who prepared it never signs it. */
export default async function TrustPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const { community, communities } = await currentCommunity((await searchParams)?.community);
  if (!community) return <Page title="Resident funds"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ trustAccounts: Account[]; residentTrustLedgers: Ledger[]; waiting: Tx[]; recent: Tx[]; trustReconciliations: Recon[] }>(`query T($id: ID!) {
    trustAccounts(where: { community: { id: { equals: $id } } }) { id name bankName last4 status }
    residentTrustLedgers(where: { community: { id: { equals: $id } } }, orderBy: { reference: asc }, take: 200) { id reference status closedOn conveyedOn resident { id firstName lastName } }
    waiting: trustTransactions(where: { community: { id: { equals: $id } }, status: { equals: "pending_signature" } }, orderBy: { createdAt: asc }, take: 50) { id reference kind amountMinor status purpose effectiveOn resident { firstName lastName } preparedBy { name } signedBy { name } }
    recent: trustTransactions(where: { community: { id: { equals: $id } }, status: { not: { equals: "pending_signature" } } }, orderBy: { createdAt: desc }, take: 20) { id reference kind amountMinor status purpose effectiveOn resident { firstName lastName } preparedBy { name } signedBy { name } }
    trustReconciliations(where: { community: { id: { equals: $id } } }, orderBy: { month: desc }, take: 6) { id month status bankBalanceMinor bookBalanceMinor residentTotalMinor differenceMinor account { name } }
  }`, { id: community.id }).catch(() => null);
  if (!data) return <Page title="Resident funds"><Empty>Your role doesn&apos;t include resident funds. Use the menu for the screens you can open.</Empty></Page>;
  const account = data.trustAccounts.find(a => a.status === 'active') ?? data.trustAccounts[0];
  const month = `${new Date().toISOString().slice(0, 7)}-01`;
  const paths = ['/dashboard/platform/trust'];
  void paths;
  return (
    <Page title="Resident funds">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/trust" />
      <Section title="Waiting for a second signature">
        {data.waiting.length ? data.waiting.map(t => (
          <Row key={t.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status="pending" statusText="Needs a signature">{t.resident ? `${t.resident.firstName} ${t.resident.lastName}` : 'Resident'} · {money(t.amountMinor)}</Title>
              <Meta>{t.purpose || 'Withdrawal'} · prepared by {t.preparedBy?.name ?? 'someone'}</Meta>
            </div>
            <span className="flex flex-wrap gap-2">
              <BillingAction op="trust.sign" input={{ transactionId: t.id }} confirm="Sign this withdrawal? You cannot sign one you prepared.">Sign</BillingAction>
              <BillingAction op="trust.reject" input={{ transactionId: t.id }} fields={[{ name: 'reason', label: 'Why', required: true }]}>Reject</BillingAction>
            </span>
          </Row>
        )) : <Empty>No withdrawal is waiting.</Empty>}
      </Section>
      <Section title="Resident ledgers" aside={account ? <span className="text-xs text-muted-foreground">{account.name} · {account.bankName} ending {account.last4}</span> : null}>
        {data.residentTrustLedgers.length ? data.residentTrustLedgers.map(l => (
          <Row key={l.id} href={`/dashboard/platform/trust/${l.id}`}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={l.status}>{l.resident ? `${l.resident.firstName} ${l.resident.lastName}` : 'Resident'}</Title>
              <Meta>{l.reference}{l.closedOn ? ` · closed ${when(l.closedOn, community.timeZone, 'date')}` : ''}</Meta>
            </div>
          </Row>
        )) : <Empty>No resident has a funds ledger yet. Open one from the resident&apos;s page once consent is on file.</Empty>}
      </Section>
      <Section title="Month-end reconciliation">
        {account ? (
          <BillingAction op="trust.reconcile" input={{ accountId: account.id, month }} fields={[{ name: 'bankBalanceMinor', label: 'Balance on the bank statement', type: 'money', required: true }]}>Reconcile this month</BillingAction>
        ) : null}
        {data.trustReconciliations.map(r => (
          <Row key={r.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={r.status}>{when(r.month, community.timeZone, 'date')}</Title>
              <Meta>Bank {money(r.bankBalanceMinor)} · book {money(r.bookBalanceMinor)} · residents {money(r.residentTotalMinor)}{r.differenceMinor !== '0' ? ` · off by ${money(r.differenceMinor)}` : ''}</Meta>
            </div>
            {r.status === 'tied' ? <BillingAction op="trust.sign_reconciliation" input={{ reconciliationId: r.id }}>Sign</BillingAction> : null}
          </Row>
        ))}
      </Section>
      <Section title="Recent activity">
        {data.recent.length ? data.recent.map(t => (
          <Row key={t.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={t.status}>{label(t.kind)} · {t.resident ? `${t.resident.firstName} ${t.resident.lastName}` : 'Resident'}</Title>
              <Meta>{t.reference}{t.effectiveOn ? ` · ${when(t.effectiveOn, community.timeZone, 'date')}` : ''}{t.signedBy ? ` · signed by ${t.signedBy.name}` : ''}</Meta>
            </div>
            <span className="text-sm tabular-nums">{money(t.amountMinor)}</span>
          </Row>
        )) : <Empty>No activity yet.</Empty>}
      </Section>
    </Page>
  );
}
