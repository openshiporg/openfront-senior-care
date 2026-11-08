import Link from 'next/link';
import { q, currentCommunity } from '../../lib/server';
import { label, money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs, Stat } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

type Site = {
  id: string; published: boolean; heroTitle: string; heroBody: string; amenities: string[]; diningCopy: string; activitiesCopy: string; careLevelsCopy: string;
  faq: { q: string; a: string }[]; acceptedPayers: string[]; tourBookingEnabled: boolean; waitlistEnabled: boolean; updatedAt: string;
};
type Price = { id: string; label: string; setting: string | null; fromMinor: string; toMinor: string | null; period: string; communityFeeMinor: string | null; status: string; publishedAt: string | null; version: number; apartmentType: { name: string } | null };
type Snapshot = { id: string; setting: string; availableCount: number; computedAt: string; apartmentType: { name: string } | null };
type Slot = { id: string; startsAt: string; capacity: number; kind: string; tours: { status: string }[] };

/**
 * Staff editor for what the public storefront shows: copy, starting prices, live availability and
 * tour times. Publishing the site and moving a price are human-only, audited commands. Families never
 * see room numbers or residents, only counts by apartment type.
 */
export default async function StorefrontPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const { community, communities } = await currentCommunity((await searchParams)?.community);
  if (!community) return <Page title="Storefront"><Empty>No community is assigned to you yet.</Empty></Page>;
  const now = new Date().toISOString();
  const data = await q<{ community: { storefront: Site | null } | null; publishedPrices: Price[]; availabilitySnapshots: Snapshot[]; tourSlots: Slot[] }>(`query S($c: ID!, $now: DateTime!) {
    community(where: { id: $c }) { storefront { id published heroTitle heroBody amenities diningCopy activitiesCopy careLevelsCopy faq acceptedPayers tourBookingEnabled waitlistEnabled updatedAt } }
    publishedPrices(where: { community: { id: { equals: $c } } }, orderBy: [{ fromMinor: asc }]) { id label setting fromMinor toMinor period communityFeeMinor status publishedAt version apartmentType { name } }
    availabilitySnapshots(where: { community: { id: { equals: $c } } }) { id setting availableCount computedAt apartmentType { name } }
    tourSlots(where: { community: { id: { equals: $c } }, startsAt: { gte: $now } }, orderBy: { startsAt: asc }, take: 12) { id startsAt capacity kind tours { status } }
  }`, { c: community.id, now });
  const site = data.community?.storefront ?? null;
  const tz = community.timeZone;
  const paths = ['/dashboard/platform/sales/storefront'];
  const computed = data.availabilitySnapshots.map(s => s.computedAt).sort().at(-1);
  return (
    <Page title="Storefront" crumbs={[{ label: 'Sales', href: `/dashboard/platform/sales?community=${community.slug}` }]}>
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/sales/storefront" />
      {site ? (
        <>
          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <Title status={site.published ? 'published' : 'draft'} statusText={site.published ? 'Live' : 'Not published'}>{site.heroTitle}</Title>
                <p className="break-words text-sm text-muted-foreground">{site.heroBody}</p>
                <Meta>/{community.slug} · tours {site.tourBookingEnabled ? 'bookable online' : 'by phone only'} · waitlist {site.waitlistEnabled ? 'open online' : 'closed'} · edited {when(site.updatedAt, tz, 'day')}</Meta>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton op="setStorefrontPublished" vars={{ communityId: community.id, published: !site.published }} confirm={site.published ? 'Take the storefront offline? Inquiries, tours and the waitlist stop accepting requests.' : 'Publish the storefront?'} paths={paths}>{site.published ? 'Unpublish' : 'Publish'}</ActionButton>
                <Link className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium" href={`/dashboard/StorefrontSites/${site.id}`}>Edit copy</Link>
              </div>
            </div>
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Care levels and amenities">
              <p className="break-words text-sm">{site.careLevelsCopy}</p>
              <ul className="grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">{site.amenities.map(a => <li key={a} className="break-words">· {a}</li>)}</ul>
              <Meta>Accepted: {site.acceptedPayers.join(', ')}</Meta>
            </Section>
            <Section title="Questions families ask">
              {site.faq.map(f => <div key={f.q} className="space-y-0.5 text-sm"><p className="font-medium">{f.q}</p><p className="text-muted-foreground">{f.a}</p></div>)}
            </Section>
          </div>
        </>
      ) : <Empty>No storefront yet. Load the community setup from the dashboard home, or add one under Storefront sites.</Empty>}
      <Section title="Starting prices">
        {data.publishedPrices.length ? data.publishedPrices.map(p => (
          <Row key={p.id}>
            <div className="min-w-0 flex-1 basis-60 space-y-0.5">
              <Title status={p.status}>{p.label}</Title>
              <Meta>
                From {money(p.fromMinor)}{p.toMinor ? ` to ${money(p.toMinor)}` : ''} a {p.period}{p.communityFeeMinor ? ` · community fee ${money(p.communityFeeMinor)}` : ''}
                {p.setting ? ` · ${label(p.setting)}` : ''}{p.publishedAt ? ` · published ${when(p.publishedAt, tz, 'day')}` : ''}
              </Meta>
            </div>
            <div className="flex flex-wrap gap-2">
              {p.status === 'draft' ? <ActionButton op="movePublishedPrice" vars={{ priceId: p.id, to: 'published', expectedVersion: p.version }} paths={paths}>Publish</ActionButton> : null}
              {p.status === 'published' ? <ActionButton op="movePublishedPrice" vars={{ priceId: p.id, to: 'retired', expectedVersion: p.version }} confirm="Retire this price? It disappears from the storefront." paths={paths}>Retire</ActionButton> : null}
            </div>
          </Row>
        )) : <Empty>No prices yet.</Empty>}
      </Section>
      <Section title="Availability shown to families" aside={<ActionButton op="recomputeAvailability" vars={{ communityId: community.id }} paths={paths} className="h-7 px-2 text-xs">Recount</ActionButton>}>
        {data.availabilitySnapshots.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {data.availabilitySnapshots.map(s => <Stat key={s.id} name={s.apartmentType?.name ?? label(s.setting)} value={s.availableCount ? `${s.availableCount} open` : 'Waitlist'} />)}
          </div>
        ) : <Empty>Not counted yet.</Empty>}
        {computed ? <Meta>Counted {when(computed, tz)}</Meta> : null}
      </Section>
      <Section title="Tour times">
        {data.tourSlots.length ? data.tourSlots.map(s => {
          const booked = s.tours.filter(t => t.status === 'requested' || t.status === 'confirmed').length;
          return (
            <Row key={s.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={booked >= s.capacity ? 'reserved' : 'available'} statusText={booked >= s.capacity ? 'Full' : `${s.capacity - booked} open`}>{when(s.startsAt, tz)}</Title>
                <Meta>{label(s.kind)} · {booked} of {s.capacity} booked</Meta>
              </div>
            </Row>
          );
        }) : <Empty>No tour times ahead.</Empty>}
      </Section>
    </Page>
  );
}
