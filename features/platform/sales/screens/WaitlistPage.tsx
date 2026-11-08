import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs, Tabs } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

type Entry = {
  id: string; reference: string; setting: string | null; priority: number; priorityReason: string | null; status: string; offerExpiresAt: string | null; version: number; createdAt: string;
  apartmentType: { name: string } | null;
  prospect: { firstName: string; lastName: string; desiredMoveIn: string | null } | null;
  lead: { reference: string; primaryContact: { firstName: string; lastName: string; phone: string } | null } | null;
  offeredReservation: { reference: string; bed: { label: string } | null; apartment: { number: string } | null } | null;
};

const VIEWS = [
  { key: 'waiting', label: 'Waiting', statuses: ['active', 'offered'] },
  { key: 'accepted', label: 'Accepted', statuses: ['accepted', 'converted'] },
  { key: 'closed', label: 'Closed', statuses: ['declined', 'expired', 'withdrawn'] },
];

/**
 * Waitlist by setting and apartment type, in priority then date order. An offer reserves a place for
 * a fixed number of hours; the reservation expires on its own if the family doesn't answer.
 */
export default async function WaitlistPage({ searchParams }: { searchParams?: Promise<{ community?: string; view?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Waitlist"><Empty>No community is assigned to you yet.</Empty></Page>;
  const view = VIEWS.find(v => v.key === params.view) ?? VIEWS[0];
  const data = await q<{ waitlistEntries: Entry[] }>(`query W($c: ID!, $statuses: [String!]!) {
    waitlistEntries(where: { community: { id: { equals: $c } }, status: { in: $statuses } }, orderBy: [{ priority: asc }, { createdAt: asc }], take: 200) {
      id reference setting priority priorityReason status offerExpiresAt version createdAt apartmentType { name }
      prospect { firstName lastName desiredMoveIn } lead { reference primaryContact { firstName lastName phone } }
      offeredReservation { reference bed { label } apartment { number } }
    }
  }`, { c: community.id, statuses: view.statuses });
  const tz = community.timeZone;
  const groups = new Map<string, Entry[]>();
  for (const e of data.waitlistEntries) {
    const key = e.apartmentType?.name ?? label(e.setting ?? 'other');
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const base = `/dashboard/platform/sales/waitlist?community=${community.slug}`;
  const paths = ['/dashboard/platform/sales/waitlist'];
  return (
    <Page title="Waitlist" crumbs={[{ label: 'Sales', href: `/dashboard/platform/sales?community=${community.slug}` }]}>
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/sales/waitlist" />
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `${base}&view=${v.key}` }))} />
      {groups.size ? [...groups.entries()].map(([group, entries]) => (
        <Section key={group} title={`${group} · ${entries.length}`}>
          {entries.map((e, i) => {
            const who = e.prospect ? `${e.prospect.firstName} ${e.prospect.lastName}` : e.lead?.primaryContact ? `${e.lead.primaryContact.firstName} ${e.lead.primaryContact.lastName}` : e.reference;
            const place = e.offeredReservation?.bed?.label ?? (e.offeredReservation?.apartment ? `Apt ${e.offeredReservation.apartment.number}` : null);
            return (
              <Row key={e.id}>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <Title status={e.status} statusText={e.status === 'offered' && place ? `Offered ${place}` : undefined}>{view.key === 'waiting' ? `${i + 1}. ` : ''}{who}</Title>
                  <Meta>
                    {label(e.priorityReason ?? 'date_order')} · joined {when(e.createdAt, tz, 'day')}
                    {e.prospect?.desiredMoveIn ? ` · hoping to move ${when(e.prospect.desiredMoveIn, tz, 'date')}` : ''}
                    {e.lead?.primaryContact && e.prospect && `${e.lead.primaryContact.firstName} ${e.lead.primaryContact.lastName}` !== who ? ` · contact ${e.lead.primaryContact.firstName} ${e.lead.primaryContact.lastName}${e.lead.primaryContact.phone ? `, ${e.lead.primaryContact.phone}` : ''}` : ''}
                    {e.status === 'offered' && e.offerExpiresAt ? ` · answer by ${when(e.offerExpiresAt, tz)}` : ''}
                  </Meta>
                </div>
                {e.status === 'offered' ? (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton op="resolveWaitlistOffer" vars={{ waitlistEntryId: e.id, to: 'accepted', expectedVersion: e.version }} paths={paths}>Accepted</ActionButton>
                    <ActionButton op="resolveWaitlistOffer" vars={{ waitlistEntryId: e.id, to: 'declined', expectedVersion: e.version }} confirm="Record that the family declined? The place is released." paths={paths}>Declined</ActionButton>
                  </div>
                ) : null}
              </Row>
            );
          })}
        </Section>
      )) : <Empty>No one in this view.</Empty>}
    </Page>
  );
}
