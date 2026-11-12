import { notFound } from 'next/navigation';
import { q, currentCommunity } from '../../lib/server';
import { label, money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, Stat } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';

type Line = { kind: string; description: string; from: string; to: string; days: number; amountMinor: string };
type Payment = { id: string; method: string; status: string; amountMinor: string; settledAt: string | null; initiatedAt: string | null; failureCode: string; autopay: boolean };
type Credit = { id: string; amountMinor: string; remainingMinor: string; status: string };
type Adjustment = { id: string; kind: string; amountMinor: string; reason: string; status: string };
type Statement = {
  id: string; number: string; status: string; totalMinor: string; paidMinor: string; adjustedMinor: string; dueOn: string | null; issuedAt: string | null; lines: Line[];
  resident: { id: string; firstName: string; lastName: string } | null; period: { month: string } | null;
};

const kindLabel: Record<string, string> = { rent: 'Apartment rent', second_person: 'Second person', care_level: 'Care level', room_board: 'Room and board', patient_liability: 'Patient liability', bed_hold: 'Bed hold', community_fee: 'Community fee', late_fee: 'Late fee', ancillary: 'Extra services', adjustment: 'Adjustment for an earlier month', deposit_application: 'Deposit applied' };

/** A statement, what was paid against it and the staff buttons to take or refund a payment. A missing statement is a 404. */
export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { community } = await currentCommunity(null);
  const data = await q<{ statement: Statement | null; payments: Payment[]; adjustments: Adjustment[]; credits: Credit[] }>(`query S($id: ID!) {
    statement(where: { id: $id }) { id number status totalMinor paidMinor adjustedMinor dueOn issuedAt lines resident { id firstName lastName } period { month } }
    adjustments: balanceAdjustments(where: { statement: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 50) { id kind amountMinor reason status }
    payments(where: { statement: { id: { equals: $id } } }, orderBy: { initiatedAt: desc }, take: 50) { id method status amountMinor settledAt initiatedAt failureCode autopay }
  }`, { id }).catch(() => null);
  if (!data?.statement) notFound();
  const s = data.statement;
  // Money on account for this resident that no statement took (an overpayment); it is applied or refunded from here.
  const credits = s.resident ? (await q<{ residentCredits: Credit[] }>(`query C($r: ID!) { residentCredits(where: { resident: { id: { equals: $r } }, status: { equals: "open" } }, take: 20) { id amountMinor remainingMinor status } }`, { r: s.resident.id }).catch(() => ({ residentCredits: [] as Credit[] }))).residentCredits : [];
  const tz = community?.timeZone ?? 'America/New_York';
  const balance = BigInt(s.totalMinor) - BigInt(s.paidMinor) - BigInt(s.adjustedMinor ?? '0');
  return (
    <Page title={`Statement ${s.number}`} crumbs={[{ label: 'Billing', href: '/dashboard/platform/billing' }]}>
      <Section title={s.resident ? `${s.resident.firstName} ${s.resident.lastName}` : 'Resident'} aside={<a className="inline-flex min-h-11 items-center text-sm underline" href={`/api/statements/${s.id}/pdf`}>Download PDF</a>}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat name="Total" value={money(s.totalMinor)} />
          <Stat name="Paid" value={money(s.paidMinor)} />
          {BigInt(s.adjustedMinor ?? '0') > 0n ? <Stat name="Adjusted" value={money(s.adjustedMinor)} /> : null}
          <Stat name="Balance" value={money(balance.toString())} />
          <Stat name="Due" value={s.dueOn ? when(s.dueOn, tz, 'date') : '—'} />
        </div>
        <Title status={s.status}>{label(s.status)}</Title>
        {balance > 0n ? (
          <div className="flex flex-wrap items-start gap-3 pt-1">
            <BillingAction op="payment.record" input={{ statementId: s.id }} fields={[
              { name: 'method', label: 'How it was paid', type: 'select', required: true, options: [{ value: 'check', label: 'Check' }, { value: 'cash', label: 'Cash' }, { value: 'other', label: 'Other' }] },
              { name: 'amountMinor', label: 'Amount', type: 'money', required: true, defaultValue: (Number(balance) / 100).toFixed(2) },
              { name: 'reference', label: 'Check number or note' },
            ]}>Record a payment</BillingAction>
            {[['adjustment.create', 'Adjust balance'], ['writeoff.create', 'Write off']].map(([op, text]) => (
              <BillingAction key={op} op={op} input={{ statementId: s.id }} fields={[
                { name: 'amountMinor', label: 'Amount', type: 'money', required: true, defaultValue: (Number(balance) / 100).toFixed(2) },
                { name: 'reason', label: 'Why', required: true },
              ]}>{text}</BillingAction>
            ))}
          </div>
        ) : null}
      </Section>
      {credits.length ? (
        <Section title="Credit on account">
          {credits.map(c => (
            <Row key={c.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={c.status}>Money received that no statement could take</Title>
                <Meta>{money(c.remainingMinor)} left of {money(c.amountMinor)}</Meta>
              </div>
              <span className="flex flex-wrap items-center gap-2 text-sm">
                {balance > 0n ? <BillingAction op="credit.apply" input={{ creditId: c.id, statementId: s.id }}>Apply here</BillingAction> : null}
                <BillingAction op="refund.request" input={{ creditId: c.id }} fields={[{ name: 'amountMinor', label: 'Refund amount', type: 'money', required: true, defaultValue: (Number(c.remainingMinor) / 100).toFixed(2) }, { name: 'reason', label: 'Why', required: true }]}>Refund</BillingAction>
              </span>
            </Row>
          ))}
        </Section>
      ) : null}
      {data.adjustments?.length ? (
        <Section title="Adjustments and write-offs">
          {data.adjustments.map(a => (
            <Row key={a.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={a.status}>{label(a.kind)} · {label(a.status)}</Title>
                <Meta>{a.reason}</Meta>
              </div>
              <span className="text-sm tabular-nums">{money(a.amountMinor)}</span>
            </Row>
          ))}
        </Section>
      ) : null}
      <Section title="Charges">
        {(s.lines ?? []).length ? s.lines.map((l, i) => (
          <Row key={i}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title>{l.description || kindLabel[l.kind] || label(l.kind)}</Title>
              <Meta>{kindLabel[l.kind] ?? label(l.kind)} · {l.days} day{l.days === 1 ? '' : 's'}</Meta>
            </div>
            <span className="text-sm tabular-nums">{money(l.amountMinor)}</span>
          </Row>
        )) : <Empty>This statement has no charge lines.</Empty>}
      </Section>
      <Section title="Payments">
        {data.payments.length ? data.payments.map(p => (
          <Row key={p.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={p.status}>{label(p.method)}{p.autopay ? ' · autopay' : ''}</Title>
              <Meta>{p.settledAt ? when(p.settledAt, tz) : p.initiatedAt ? `Started ${when(p.initiatedAt, tz)}` : ''}{p.failureCode ? ` · ${label(p.failureCode)}` : ''}</Meta>
            </div>
            <span className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
              {money(p.amountMinor)}
              {p.status === 'unknown' || p.status === 'pending' ? <BillingAction op="payment.check_status" input={{ paymentId: p.id }}>Check status</BillingAction> : null}
              {p.status === 'succeeded' ? <BillingAction op="refund.request" input={{ paymentId: p.id }} fields={[{ name: 'amountMinor', label: 'Refund amount', type: 'money', required: true }, { name: 'reason', label: 'Why', required: true }]}>Refund</BillingAction> : null}
            </span>
          </Row>
        )) : <Empty>Nothing has been paid against this statement.</Empty>}
      </Section>
    </Page>
  );
}
