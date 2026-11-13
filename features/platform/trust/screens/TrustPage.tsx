import { q, currentCommunity } from '../../lib/server';
import { label, money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';
import { bondStatus, quarterEnd, quarterLabel, quarterStart, resourceAlert, trustRules } from '@/features/keystone/trust/extras';

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
  const today = new Date().toISOString().slice(0, 10);
  // Alerts, worked out when the page loads (no job): the resource limit for Medicaid residents and the surety bond.
  const more = account ? await q<{ trustLedgerLines: { bucket: string; side: string; amountMinor: string; effectiveOn: string; ledger: { id: string } | null }[]; suretyBonds: { id: string; carrier: string; bondNumber: string; amountMinor: string; effectiveFrom: string; expiresOn: string | null; status: string }[]; coveragePeriods: { stay: { resident: { id: string } | null } | null }[]; interestAllocationRuns: { id: string; month: string; interestMinor: string; allocations: { ledgerId: string; amountMinor: string }[] }[]; trustStatements: { id: string; quarter: string; closingMinor: string; resident: { firstName: string; lastName: string } | null }[]; community: { jurisdictionPack: { rules: unknown } | null } | null }>(`query X($a: ID!, $c: ID!, $today: CalendarDay!) {
    trustLedgerLines(where: { account: { id: { equals: $a } }, bucket: { equals: "client_liability" } }, take: 20000) { bucket side amountMinor effectiveOn ledger { id } }
    suretyBonds(where: { account: { id: { equals: $a } } }, orderBy: { createdAt: desc }, take: 10) { id carrier bondNumber amountMinor effectiveFrom expiresOn status }
    coveragePeriods(where: { status: { equals: "active" }, startDate: { lte: $today }, payer: { kind: { in: ["medicaid_ffs", "medicaid_mco"] } }, stay: { community: { id: { equals: $c } } }, OR: [{ endDate: null }, { endDate: { gte: $today } }] }, take: 500) { stay { resident { id } } }
    interestAllocationRuns(where: { account: { id: { equals: $a } } }, orderBy: { month: desc }, take: 6) { id month interestMinor allocations }
    trustStatements(where: { community: { id: { equals: $c } } }, orderBy: { quarter: desc }, take: 60) { id quarter closingMinor resident { firstName lastName } }
    community(where: { id: $c }) { jurisdictionPack { rules } }
  }`, { a: account.id, c: community.id, today }).catch(() => null) : null;
  const rules = trustRules(more?.community?.jurisdictionPack?.rules);
  const medicaid = new Set((more?.coveragePeriods ?? []).map(c => c.stay?.resident?.id).filter(Boolean) as string[]);
  const balances = new Map<string, bigint>();
  let funds = 0n;
  for (const line of more?.trustLedgerLines ?? []) {
    if (line.effectiveOn.slice(0, 10) > today) continue;
    const delta = line.side === 'credit' ? BigInt(line.amountMinor) : -BigInt(line.amountMinor);
    funds += delta;
    if (line.ledger) balances.set(line.ledger.id, (balances.get(line.ledger.id) ?? 0n) + delta);
  }
  const alerts = data.residentTrustLedgers.filter(l => l.status === 'open' && l.resident).map(l => ({ ledger: l, ...resourceAlert(balances.get(l.id) ?? 0n, medicaid.has(l.resident!.id), rules.resource), balance: balances.get(l.id) ?? 0n })).filter(a => a.state === 'near_limit' || a.state === 'over_limit');
  const bond = more?.suretyBonds.find(b => b.status === 'active') ?? null;
  const bondState = more ? bondStatus(bond ? { amountMinor: BigInt(bond.amountMinor), expiresOn: bond.expiresOn ? bond.expiresOn.slice(0, 10) : null } : null, funds, today) : null;
  const lastQuarter = quarterStart(new Date(Date.parse(`${quarterStart(today)}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
  const lastMonth = (() => { const [y, m] = today.split('-').map(Number); return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`; })();
  return (
    <Page title="Resident funds">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/trust" />
      {more ? (
        <Section title="Alerts">
          {alerts.map(a => (
            <Row key={a.ledger.id} href={`/dashboard/platform/trust/${a.ledger.id}`}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={a.state === 'over_limit' ? 'overdue' : 'due'}>{a.ledger.resident!.firstName} {a.ledger.resident!.lastName} · {a.state === 'over_limit' ? 'over the Medicaid resource limit' : 'near the Medicaid resource limit'}</Title>
                <Meta>Holds {money(a.balance.toString())} against a limit of {money(a.limitMinor.toString())}. Tell the resident or representative so the funds can be spent down or the county told.</Meta>
              </div>
            </Row>
          ))}
          {bondState ? (
            <Row>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={bondState.state === 'ok' ? 'active' : bondState.state === 'renewal_due' ? 'due' : 'overdue'}>Surety bond · {label(bondState.state)}</Title>
                <Meta>{bond ? `${bond.carrier} ${bond.bondNumber} · ${money(bond.amountMinor)}${bond.expiresOn ? ` · expires ${when(bond.expiresOn, community.timeZone, 'date')}` : ''}` : 'No bond is recorded.'} Resident funds held: {money(funds.toString())}.{bondState.shortMinor > 0n ? ` Short by ${money(bondState.shortMinor.toString())}.` : ''}</Meta>
              </div>
              {account ? <BillingAction op="trust.record_bond" input={{ accountId: account.id }} fields={[
                { name: 'carrier', label: 'Carrier', required: true },
                { name: 'bondNumber', label: 'Bond number', required: true },
                { name: 'amountMinor', label: 'Bond amount', type: 'money', required: true },
                { name: 'effectiveFrom', label: 'Effective from', type: 'date', required: true },
                { name: 'expiresOn', label: 'Expires on', type: 'date', required: true },
              ]}>{bond ? 'Record the renewed bond' : 'Record the bond'}</BillingAction> : null}
            </Row>
          ) : null}
          {!alerts.length ? <Meta>No Medicaid resident is near the {money(rules.resource.limitMinor.toString())} resource limit.</Meta> : null}
        </Section>
      ) : null}
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
      {account && more ? (
        <Section title="Interest and quarterly statements">
          <div className="flex flex-wrap items-start gap-3">
            <BillingAction op="trust.allocate_interest" input={{ accountId: account.id }} fields={[
              { name: 'month', label: 'Month (first day)', type: 'date', required: true, defaultValue: lastMonth },
              { name: 'interestMinor', label: 'Interest on the bank statement', type: 'money', required: true },
            ]}>Allocate interest</BillingAction>
            <BillingAction op="trust.quarterly_statements" input={{ accountId: account.id, quarter: lastQuarter }} confirm={`Make the ${quarterLabel(lastQuarter)} statements for every resident? Statements already made are kept as they are.`}>Make {quarterLabel(lastQuarter)} statements</BillingAction>
          </div>
          <Meta>Interest is shared by each resident&apos;s average daily balance, to the cent, and posted as balanced entries on the month&apos;s last day. Each month is allocated once; a correction is a reversal.</Meta>
          {more.interestAllocationRuns.map(r => (
            <Row key={r.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status="posted">Interest for {when(r.month, community.timeZone, 'date')}</Title>
                <Meta>{(r.allocations ?? []).length} resident{(r.allocations ?? []).length === 1 ? '' : 's'}</Meta>
              </div>
              <span className="text-sm tabular-nums">{money(r.interestMinor)}</span>
            </Row>
          ))}
          {more.trustStatements.slice(0, 30).map(st => (
            <Row key={st.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title>{st.resident ? `${st.resident.firstName} ${st.resident.lastName}` : 'Resident'} · {quarterLabel(st.quarter.slice(0, 10))}</Title>
                <Meta>To {when(quarterEnd(st.quarter.slice(0, 10)), community.timeZone, 'date')} · closing {money(st.closingMinor)}</Meta>
              </div>
              <a className="inline-flex min-h-11 items-center text-sm underline" href={`/api/trust/statements/${st.id}/pdf`}>PDF</a>
            </Row>
          ))}
        </Section>
      ) : null}
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
