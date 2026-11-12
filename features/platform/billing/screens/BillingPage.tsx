import Link from 'next/link';
import { q, currentCommunity } from '../../lib/server';
import { label, money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs, Stat } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';

type Period = { id: string; month: string; status: string; statementCount: number | null; closedAt: string | null };
type Statement = { id: string; number: string; status: string; totalMinor: string; paidMinor: string; dueOn: string | null; resident: { id: string; firstName: string; lastName: string } | null; period: { id: string } | null };

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const nextMonthOf = (month: string) => { const [y, m] = month.split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; };
const prevMonthOf = (month: string) => { const [y, m] = month.split('-').map(Number); return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`; };
const monthName = (month: string) => new Date(`${month}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Month-end: derive the charges, close the month (statements are issued from the closed charges) and charge stored autopay
 * cards. Each is a staff button; nothing here runs on a timer. A closed month is never edited: a later correction posts an
 * adjustment line in the next open month.
 */
export default async function BillingPage({ searchParams }: { searchParams?: Promise<{ community?: string; month?: string }> }) {
  const sp = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(sp.community);
  if (!community) return <Page title="Billing"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ billingPeriods: Period[] }>(`query B($id: ID!) { billingPeriods(where: { community: { id: { equals: $id } } }, orderBy: { month: desc }, take: 24) { id month status statementCount closedAt } }`, { id: community.id }).catch(() => null);
  if (!data) return <Page title="Billing"><Empty>Your role doesn&apos;t include billing. Use the menu for the screens you can open.</Empty></Page>;
  const today = new Date().toISOString().slice(0, 10);
  const lastEnded = prevMonthOf(monthStart(today));
  const periods = data.billingPeriods;
  const focus = sp.month && /^\d{4}-\d{2}-01$/.test(sp.month) ? sp.month : (periods.find(p => p.status === 'open')?.month.slice(0, 10) ?? lastEnded);
  const period = periods.find(p => p.month.slice(0, 10) === focus) ?? null;
  const statements = period
    ? (await q<{ statements: Statement[] }>(`query S($p: ID!) { statements(where: { period: { id: { equals: $p } } }, orderBy: { number: asc }, take: 200) { id number status totalMinor paidMinor dueOn resident { id firstName lastName } period { id } } }`, { p: period.id }).catch(() => ({ statements: [] as Statement[] }))).statements
    : [];
  const owed = statements.reduce((sum, s) => sum + (BigInt(s.totalMinor ?? '0') - BigInt(s.paidMinor ?? '0')), 0n);
  const paths = ['/dashboard/platform/billing'];
  const monthLinks = [...new Set([focus, lastEnded, ...periods.map(p => p.month.slice(0, 10))])].sort().reverse().slice(0, 8);
  return (
    <Page title="Billing" crumbs={[]}>
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/billing" />
      <div className="flex flex-wrap gap-2">
        {monthLinks.map(m => (
          <Link key={m} href={`/dashboard/platform/billing?community=${community.slug}&month=${m}`} className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm ${m === focus ? 'bg-muted font-medium' : 'text-muted-foreground underline'}`}>{monthName(m)}</Link>
        ))}
      </div>
      <Section title={monthName(focus)}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat name="Status" value={period ? label(period.status) : 'Not started'} />
          <Stat name="Statements" value={period?.statementCount ?? 0} />
          <Stat name="Still owed" value={money(owed.toString())} />
          <Stat name="Closed" value={period?.closedAt ? when(period.closedAt, community.timeZone, 'date') : '—'} />
        </div>
        <div className="flex flex-wrap items-start gap-3 pt-2">
          {period?.status !== 'closed' ? (
            <>
              <BillingAction op="billing.derive" input={{ communityId: community.id, month: focus }}>Work out charges</BillingAction>
              <BillingAction op="billing.close" input={{ communityId: community.id, month: focus }} confirm={`Close ${monthName(focus)}? Charges freeze and statements are issued. Later corrections post to ${monthName(nextMonthOf(focus))}.`}>Close month</BillingAction>
            </>
          ) : (
            <>
              <BillingAction op="billing.adjust_closed" input={{ communityId: community.id, month: focus }}>Post corrections to the next month</BillingAction>
              <BillingAction op="billing.autopay" input={{ periodId: period.id }} confirm="Charge every resident's stored card for what is still owed? A declined card is not retried.">Charge stored cards</BillingAction>
            </>
          )}
        </div>
        <Meta>Closing needs the census signed off through month end. A month that has not ended cannot close.</Meta>
      </Section>
      <Section title="Statements">
        {statements.length ? statements.map(s => (
          <Row key={s.id} href={`/dashboard/platform/billing/statements/${s.id}`}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={s.status}>{s.resident ? `${s.resident.firstName} ${s.resident.lastName}` : 'Resident'}</Title>
              <Meta>Statement {s.number}{s.dueOn ? ` · due ${when(s.dueOn, community.timeZone, 'date')}` : ''}</Meta>
            </div>
            <span className="text-sm tabular-nums">{money((BigInt(s.totalMinor) - BigInt(s.paidMinor)).toString())} <span className="text-muted-foreground">of {money(s.totalMinor)}</span></span>
          </Row>
        )) : <Empty>{period ? 'No statements for this month yet.' : 'Nothing has been worked out for this month yet.'}</Empty>}
      </Section>
    </Page>
  );
}
