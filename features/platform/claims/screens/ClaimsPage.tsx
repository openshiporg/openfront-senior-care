import { q, currentCommunity } from '../../lib/server';
import { label, money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';

type Claim = { id: string; reference: string; status: string; typeOfBill: string; periodFrom: string; periodTo: string; totalChargesMinor: string; paidMinor: string | null; exportHash: string; denialStatus: string; ackStatus: string; scrubberResult: { issues?: { severity: string; message: string }[] } | null; resident: { firstName: string | null; lastName: string | null } | null };
type Remit = { id: string; traceNumber: string; paymentDate: string; totalPaidMinor: string; status: string; claimCount: number | null; exceptions: { severity: string; message: string }[] | null; payer: { name: string } | null };
type Invoice = { id: string; vendor: string; invoiceNumber: string; amountMinor: string; status: string; consolidatedBilling: boolean };

const name = (r: Claim['resident']) => (r && (r.firstName || r.lastName) ? [r.lastName, r.firstName].filter(Boolean).join(', ') : 'Resident');

/** Part A claims: build from the month's billing lines, scrub, release, download the 837I, then upload what comes back. Nothing is sent from here. */
export default async function ClaimsPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Claims"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ claims: Claim[]; remittances: Remit[]; ancillaryInvoices: Invoice[]; payers: { id: string }[] }>(`query C($id: ID!) {
    claims(where: { community: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 100) { id reference status typeOfBill periodFrom periodTo totalChargesMinor paidMinor exportHash denialStatus ackStatus scrubberResult resident { firstName lastName } }
    remittances(where: { community: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 30) { id traceNumber paymentDate totalPaidMinor status claimCount exceptions payer { name } }
    ancillaryInvoices(where: { community: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 30) { id vendor invoiceNumber amountMinor status consolidatedBilling }
    payers(where: { kind: { equals: "medicare_a" } }, take: 1) { id }
  }`, { id: community.id }).catch(() => null);
  if (!data) return <Page title="Claims"><Empty>Your role doesn&apos;t include claims. Use the menu for the screens you can open.</Empty></Page>;
  const tz = community.timeZone;
  const medicareA = data.payers[0]?.id ?? '';
  const denied = data.claims.filter(c => ['open', 'working', 'appealed'].includes(c.denialStatus));
  return (
    <Page title="Claims" crumbs={[{ label: 'Billing', href: '/dashboard/platform/billing' }]}>
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/claims" />
      <Meta>The 837I is a file you download and upload to your Medicare contractor. A claim is accepted only when you upload a 277CA that says so, and paid only when you post an 835.</Meta>
      <Section title="Billing identity" aside={<BillingAction op="claim.billing_profile" input={{ communityId: community.id, payerId: medicareA }} fields={[{ name: 'npi', label: 'Facility NPI' }, { name: 'taxId', label: 'EIN (9 digits)' }, { name: 'taxonomy', label: 'Taxonomy code (10 characters)' }, { name: 'zip4', label: 'Billing ZIP+4 (9 digits)' }, { name: 'electronicPayerId', label: 'Medicare contractor electronic payer ID' }]}>Set billing identity</BillingAction>}>
        <Meta>The 837I carries the facility NPI, EIN, taxonomy and ZIP+4. Claims fail the scrub until they are set.</Meta>
      </Section>
      <Section title="Medicare Part A claims" aside={<BillingAction op="claim.create_month" input={{ communityId: community.id }} fields={[{ name: 'month', label: 'Month (first day)', type: 'date', required: true }]}>Create claims for a month</BillingAction>}>
        {data.claims.length ? data.claims.map(c => {
          const errors = (c.scrubberResult?.issues ?? []).filter(i => i.severity === 'error');
          return (
            <Row key={c.id}>
              <div className="min-w-0 flex-1 space-y-0.5">
                <Title status={c.status}>{c.reference} · {name(c.resident)} · TOB {c.typeOfBill}</Title>
                <Meta>{when(c.periodFrom, tz, 'date')} to {when(c.periodTo, tz, 'date')} · billed {money(c.totalChargesMinor)}{c.paidMinor && c.paidMinor !== '0' ? ` · paid ${money(c.paidMinor)}` : ''} · {label(c.status)}</Meta>
                {c.status === 'draft' && errors.length ? errors.map((e, i) => <Meta key={i}>Fix: {e.message}</Meta>) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {c.status === 'draft' ? <BillingAction op="claim.validate" input={{ claimId: c.id }}>Scrub and validate</BillingAction> : null}
                {c.status === 'validated' ? <BillingAction op="claim.release" input={{ claimId: c.id }} confirm="Release this claim? Someone other than the person who validated it must do this.">Release</BillingAction> : null}
                {c.status === 'released' || c.status === 'submitted' ? <BillingAction op="claim.export" input={{ claimId: c.id }}>Generate 837I</BillingAction> : null}
                {c.exportHash ? <a className="inline-flex min-h-11 items-center text-sm underline" href={`/api/exports?kind=claim&id=${c.id}`}>Download 837I</a> : null}
                {c.status === 'released' && c.exportHash ? <BillingAction op="claim.mark_submitted" input={{ claimId: c.id, exportHash: c.exportHash }} confirm="Confirm you uploaded this file to your Medicare contractor.">I uploaded it</BillingAction> : null}
                {['draft', 'validated', 'released', 'rejected'].includes(c.status) ? <BillingAction op="claim.cancel" input={{ claimId: c.id }} fields={[{ name: 'reason', label: 'Why', type: 'text', required: true }]}>Cancel</BillingAction> : null}
              </div>
            </Row>
          );
        }) : <Empty>No claims yet. Close a month of Part A billing, then create the month&apos;s claims.</Empty>}
      </Section>
      <Section title="Upload an acknowledgement" aside={<BillingAction op="claim.upload_ack" input={{ communityId: community.id }} fields={[{ name: 'text', label: 'Paste the 999 or 277CA file', type: 'textarea', required: true }, { name: 'claimId', label: 'Claim (only for a 999)', type: 'select', options: data.claims.filter(c => c.status === 'submitted').map(c => ({ value: c.id, label: c.reference })) }]}>Upload 999 / 277CA</BillingAction>}>
        <Meta>A 999 answers one file; a 277CA names each claim it accepts or rejects.</Meta>
      </Section>
      <Section title="Remittances (835)" aside={<BillingAction op="remittance.import" input={{ communityId: community.id, payerId: medicareA }} fields={[{ name: 'text', label: 'Paste the 835 file', type: 'textarea', required: true }]}>Import 835</BillingAction>}>
        {data.remittances.length ? data.remittances.map(r => {
          const blocking = (r.exceptions ?? []).filter(e => e.severity === 'blocking');
          return (
            <Row key={r.id}>
              <div className="min-w-0 flex-1 space-y-0.5">
                <Title status={r.status}>{r.traceNumber} · {r.payer?.name ?? 'Payer'} · {money(r.totalPaidMinor)}</Title>
                <Meta>{when(r.paymentDate, tz, 'date')} · {r.claimCount ?? 0} claims · {label(r.status)}</Meta>
                {(r.exceptions ?? []).map((e, i) => <Meta key={i}>{e.severity === 'blocking' ? 'Blocks posting' : 'Review'}: {e.message}</Meta>)}
              </div>
              {r.status === 'matched' && !blocking.length ? <BillingAction op="remittance.post" input={{ remittanceId: r.id }} confirm="Post this remittance? Every claim in it is credited together.">Post</BillingAction> : null}
            </Row>
          );
        }) : <Empty>No remittances imported.</Empty>}
      </Section>
      <Section title="Denial work queue">
        {denied.length ? denied.map(c => (
          <Row key={c.id}>
            <div className="min-w-0 flex-1"><Title status="open">{c.reference} · {name(c.resident)}</Title><Meta>{label(c.denialStatus)} · billed {money(c.totalChargesMinor)}</Meta></div>
            <BillingAction op="claim.work_denial" input={{ claimId: c.id }} fields={[{ name: 'to', label: 'Next step', type: 'select', required: true, options: ['working', 'appealed', 'resolved', 'written_off'].map(v => ({ value: v, label: label(v) })) }, { name: 'note', label: 'Note', type: 'textarea', required: true }]}>Work denial</BillingAction>
          </Row>
        )) : <Empty>No open denials.</Empty>}
      </Section>
      <Section title="Ancillary invoices">
        {data.ancillaryInvoices.length ? data.ancillaryInvoices.map(i => (
          <Row key={i.id}>
            <div className="min-w-0 flex-1"><Title status={i.status}>{i.vendor} · {i.invoiceNumber} · {money(i.amountMinor)}</Title><Meta>{label(i.status)}{i.consolidatedBilling ? ' · consolidated billing: belongs on the Part A claim' : ''}</Meta></div>
            <div className="flex flex-wrap gap-2">
              {i.status === 'received' ? <BillingAction op="ancillary.match" input={{ invoiceId: i.id }}>Match</BillingAction> : null}
              {i.status === 'matched' ? <BillingAction op="ancillary.approve" input={{ invoiceId: i.id }}>Approve</BillingAction> : null}
              {i.status === 'approved' ? <BillingAction op="ancillary.pay" input={{ invoiceId: i.id }}>Mark paid</BillingAction> : null}
            </div>
          </Row>
        )) : <Empty>No ancillary invoices.</Empty>}
      </Section>
    </Page>
  );
}
