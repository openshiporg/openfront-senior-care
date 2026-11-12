import { q, currentCommunity } from '../../lib/server';
import { keystoneContext } from '@/features/keystone/context';
import { rateChangeNotices } from '@/features/keystone/billing/rates';
import { label, money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';

type Schedule = { id: string; name: string; setting: string; effectiveFrom: string; noticeDays: number; status: string; lines: { id: string; kind: string; amountMinor: string; per: string; apartmentType: { name: string } | null; careLevel: { name: string } | null }[] };

const kindName: Record<string, string> = { apartment_rent: 'Apartment rent', care_level: 'Care level', second_person: 'Second person', med_management: 'Medication management', community_fee: 'Community fee', room_daily: 'Room, per day', bed_hold_daily: 'Bed hold, per day', ancillary: 'Extra services' };

/**
 * Rate schedules and the rate-change notices. A schedule is published by a second person; a change that affects residents needs
 * notice first. The notice is a printable page and the delivery date is recorded here. Nothing is sent from this app.
 */
export default async function RatesPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const { community, communities } = await currentCommunity((await searchParams)?.community);
  if (!community) return <Page title="Rates and notices"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ rateSchedules: Schedule[] }>(`query R($id: ID!) { rateSchedules(where: { community: { id: { equals: $id } } }, orderBy: { effectiveFrom: desc }, take: 20) { id name setting effectiveFrom noticeDays status lines { id kind amountMinor per apartmentType { name } careLevel { name } } } }`, { id: community.id }).catch(() => null);
  if (!data) return <Page title="Rates and notices"><Empty>Your role doesn&apos;t include rates. Use the menu for the screens you can open.</Empty></Page>;
  const published = data.rateSchedules.filter(s => s.status === 'published');
  // The schedules above came through the signed-in session's list access, so their ids are the only ones read here.
  const db = keystoneContext.prisma as never as Parameters<typeof rateChangeNotices>[0];
  const empty = { effectiveFrom: "", noticeBy: "", notices: [] as Awaited<ReturnType<typeof rateChangeNotices>>["notices"] };
  // Notices name residents, so they need billing read, not just rate access.
  const canSeeResidents = await q(`{ billingPeriodsCount }`).then(() => true, () => false);
  const notices = await Promise.all((canSeeResidents ? published.slice(0, 2) : []).map(async s => ({ id: s.id, ...(await rateChangeNotices(db, s.id).catch(() => empty)) })));
  return (
    <Page title="Rates and notices">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/billing/rates" />
      {data.rateSchedules.length ? data.rateSchedules.map(s => (
        <Section key={s.id} title={`${s.name} · from ${when(s.effectiveFrom, community.timeZone, 'date')}`}>
          <Title status={s.status}>{label(s.setting)}</Title>
          <Meta>{s.noticeDays} days of notice before a change.</Meta>
          {s.status === 'draft' ? <BillingAction op="rate.request_publish" input={{ scheduleId: s.id }} confirm="Ask a second person to approve publishing these rates?">Ask for approval to publish</BillingAction> : null}
          {s.lines.map(l => (
            <Row key={l.id}>
              <div className="min-w-0 flex-1 basis-60"><Title>{l.apartmentType?.name ?? l.careLevel?.name ?? kindName[l.kind] ?? label(l.kind)}</Title><Meta>{kindName[l.kind] ?? label(l.kind)} · per {l.per}</Meta></div>
              <span className="text-sm tabular-nums">{money(l.amountMinor)}</span>
            </Row>
          ))}
        </Section>
      )) : <Empty>No rate schedule has been set up yet.</Empty>}
      {notices.filter(n => n.notices.length).map(n => (
        <Section key={n.id} title={`Rate-change notices · effective ${when(n.effectiveFrom, community.timeZone, 'date')}`}>
          <Meta>Give each resident the printed notice by {when(n.noticeBy, community.timeZone, 'date')}, then record the date it was handed over.</Meta>
          {n.notices.map(r => (
            <Row key={r.residentId ?? r.name}>
              <div className="min-w-0 flex-1 basis-60"><Title status={r.state}>{r.name}</Title><Meta>{r.deliveredOn ? `Handed over ${when(r.deliveredOn, community.timeZone, 'date')}` : 'Not yet handed over'}</Meta></div>
              {r.deliveredOn || !r.residentId ? null : <BillingAction op="rate.notice_delivered" input={{ scheduleId: n.id, residentId: r.residentId, deliveredAt: new Date().toISOString() }} fields={[{ name: 'method', label: 'How it was given', type: 'select', required: true, options: [{ value: 'in_person', label: 'In person' }, { value: 'mail', label: 'Mailed' }, { value: 'representative', label: 'To the representative' }] }]}>Record delivery</BillingAction>}
            </Row>
          ))}
        </Section>
      ))}
    </Page>
  );
}
