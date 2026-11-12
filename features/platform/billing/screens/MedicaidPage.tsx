import { q, currentCommunity } from '../../lib/server';
import { liabilityClocks } from '@/features/keystone/billing/medicaid';
import { label, money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';

type Liability = { id: string; month: string; liabilityMinor: string; status: string; noticeReceivedOn: string | null; infoRequestedOn: string | null; infoRespondedOn: string | null; appealFiledOn: string | null; resident: { firstName: string; lastName: string } | null };

const clockText = { info_response: 'Reply to the information request', appeal: 'Appeal window' } as const;

/** Monthly Medicaid patient liability per resident. The reply and appeal deadlines are worked out when the page loads. */
export default async function MedicaidPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const { community, communities } = await currentCommunity((await searchParams)?.community);
  if (!community) return <Page title="Medicaid liability"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ medicaidLiabilities: Liability[] }>(`query M($id: ID!) { medicaidLiabilities(where: { community: { id: { equals: $id } }, status: { not: { equals: "superseded" } } }, orderBy: { month: desc }, take: 100) { id month liabilityMinor status noticeReceivedOn infoRequestedOn infoRespondedOn appealFiledOn resident { firstName lastName } } }`, { id: community.id }).catch(() => null);
  if (!data) return <Page title="Medicaid liability"><Empty>Your role doesn&apos;t include Medicaid liability. Use the menu for the screens you can open.</Empty></Page>;
  const today = new Date().toISOString().slice(0, 10);
  const day = (v: string | null) => (v ? v.slice(0, 10) : null);
  return (
    <Page title="Medicaid liability">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/billing/medicaid" />
      <Section title="Patient liability by month">
        {data.medicaidLiabilities.length ? data.medicaidLiabilities.map(l => {
          const clocks = liabilityClocks({ infoRequestedOn: day(l.infoRequestedOn), infoRespondedOn: day(l.infoRespondedOn), noticeReceivedOn: day(l.noticeReceivedOn), appealFiledOn: day(l.appealFiledOn), status: l.status }, today);
          return (
            <Row key={l.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={l.status}>{l.resident ? `${l.resident.firstName} ${l.resident.lastName}` : 'Resident'}</Title>
                <Meta>{when(l.month, community.timeZone, 'date')} · {money(l.liabilityMinor)}</Meta>
                {clocks.map(c => <Meta key={c.name}>{clockText[c.name]}: {c.state === 'done' ? 'done' : c.state === 'overdue' ? `overdue since ${when(c.dueBy, community.timeZone, 'date')}` : `by ${when(c.dueBy, community.timeZone, 'date')} (${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} left)`}</Meta>)}
              </div>
              <span className="flex flex-wrap gap-2">
                {!l.infoRequestedOn ? <BillingAction op="medicaid.info_request" input={{ liabilityId: l.id, kind: 'requested', on: today }}>Information requested</BillingAction> : !l.infoRespondedOn ? <BillingAction op="medicaid.info_request" input={{ liabilityId: l.id, kind: 'responded', on: today }}>We replied</BillingAction> : null}
                {l.noticeReceivedOn && !l.appealFiledOn ? <BillingAction op="medicaid.appeal" input={{ liabilityId: l.id, filedOn: today }} confirm="Record that an appeal was filed today?">Appeal filed</BillingAction> : null}
              </span>
            </Row>
          );
        }) : <Empty>No Medicaid liability has been recorded.</Empty>}
      </Section>
    </Page>
  );
}
