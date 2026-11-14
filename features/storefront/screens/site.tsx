import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSite, leadPrice, residencyFirst, startingPrice, type Availability, type Price, type Site, type TourSlot } from '../lib/data'
import { cityLine, clockTime, dollars, longDay, plainLabel, settingName, telHref, tourTime } from '../lib/format'
import { CallToTour, ContactStrip, PageTitle, PhoneIcon, PinIcon, Swoosh, Wave } from '../components/Chrome'
import { TourScheduler, type SchedulerSlot } from '../components/TourScheduler'
import { CancelTourForm, InquiryForm, WaitlistForm } from '../components/Forms'

export async function loadSite(slug: string): Promise<Site> {
  const site = await getSite(slug)
  if (!site) notFound()
  return site
}

/** `personal` pages (the family portal, a tour's cancel link) are kept out of search engines. */
export async function siteMetadata(slug: string, page?: string, personal = false): Promise<Metadata> {
  const site = await getSite(slug).catch(() => null)
  if (!site) return { title: 'Not found' }
  const base = site.site.seo.title || `${site.community.name} · ${cityLine(site.community.city, site.community.region)}`
  return {
    title: page ? `${page} · ${site.community.name}` : base,
    description: site.site.seo.description || site.site.heroBody.slice(0, 200),
    ...(personal ? { robots: { index: false, follow: false } } : {}),
  }
}

const schedulerSlots = (slots: TourSlot[], timeZone: string): SchedulerSlot[] =>
  slots.map(slot => ({ id: slot.id, kind: slot.kind, label: tourTime(slot.startsAt, timeZone), day: longDay(slot.startsAt, timeZone), time: clockTime(slot.startsAt, timeZone) }))

const priceRange = (price: Price) => `${dollars(price.fromMinor)}${price.toMinor ? ` to ${dollars(price.toMinor)}` : ''}`
const per = (period: string) => (period === 'day' ? 'day' : period === 'week' ? 'week' : period === 'year' ? 'year' : 'month')

function settingPrices(site: Site, setting: string) {
  return residencyFirst(site.prices.filter(price => (price.setting ?? '') === setting))
}
/** Open places for a setting, counted by apartment type where the community counts that way. */
function openCount(availability: Availability[], setting: string) {
  const rows = availability.filter(row => row.setting === setting)
  if (!rows.length) return null
  return rows.reduce((sum, row) => sum + (row.availableCount || 0), 0)
}

function Opening({ count, slug, setting, type, waitlist }: { count: number | null; slug: string; setting: string | null; type?: string; waitlist: boolean }) {
  if (count === null) return null
  if (count > 0) return <p className="sf-open"><i aria-hidden="true" />{count === 1 ? '1 available now' : `${count} available now`}</p>
  const query = new URLSearchParams({ ...(setting ? { setting } : {}), ...(type ? { type } : {}) }).toString()
  return <p className="sf-open is-full"><i aria-hidden="true" />None open today{waitlist ? <> · <Link href={`/${slug}/waitlist?${query}`}>Join the waitlist</Link></> : null}</p>
}

/* ------------------------------------------------------------------ home */

export function HomeScreen({ site }: { site: Site }) {
  const { community } = site
  const base = `/${community.slug}`
  const tel = telHref(community.phone)
  const lead = leadPrice(site)
  return (
    <>
      <section className="sf-hero">
        <div className="sf-hero-copy">
          <h1>Come see what a good day looks like.</h1>
          <Swoosh className="sf-swoosh" />
        </div>
        <div className="sf-hero-photo">
          <Image src="/storefront/courtyard.jpg" alt="A family laughing together on a courtyard bench under autumn maples" fill preload sizes="100vw" />
        </div>
        <div className="sf-hero-panel">
          <TourScheduler slug={community.slug} slots={schedulerSlots(site.tourSlots, community.timeZone)} phone={community.phone} tel={tel} bookingEnabled={site.site.tourBookingEnabled} timeZone={community.timeZone} limit={3} />
        </div>
      </section>

      <ContactStrip site={site} lead={lead ? { title: lead.setting ? settingName(lead.setting) : lead.label, amount: dollars(lead.fromMinor), period: per(lead.period) } : null} />
      <Wave className="sf-wave" rise />

      <section className="sf-band sf-band-sage">
        <div className="sf-wrap sf-intro">
          <div>
            {site.site.heroTitle ? <p className="sf-eyebrow">{site.site.heroTitle}</p> : null}
            <h2>Welcome to {community.name}</h2>
            <p className="sf-lede">{site.site.heroBody}</p>
            <Link className="sf-arrow" href={`${base}/care`}>How we care</Link>
          </div>
          {community.settingsOffered.length ? (
            <ul className="sf-settings">
              {community.settingsOffered.map(setting => {
                const from = startingPrice(settingPrices(site, setting))
                return (
                  <li key={setting}>
                    <Link href={`${base}/care#${setting}`}>
                      <span className="sf-settings-name">{settingName(setting)}</span>
                      {from ? <span className="sf-settings-price">from <b>{dollars(from.fromMinor)}</b>/{per(from.period)}</span> : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </section>

      {site.site.amenities.length || site.site.diningCopy || site.site.activitiesCopy ? (
        <section className="sf-band">
          <div className="sf-wrap sf-two">
            <div>
              <h2>A good day, every day</h2>
              {site.site.activitiesCopy ? <p>{site.site.activitiesCopy}</p> : null}
              {site.site.diningCopy ? <p>{site.site.diningCopy}</p> : null}
              <Link className="sf-arrow" href={`${base}/life`}>Life here</Link>
            </div>
            {site.site.amenities.length ? <ul className="sf-leaflist">{site.site.amenities.map(item => <li key={item}>{item}</li>)}</ul> : null}
          </div>
        </section>
      ) : null}

      {site.site.faq.length ? (
        <section className="sf-band sf-band-cream">
          <div className="sf-wrap sf-section">
            <h2>Questions families ask</h2>
            <div>
              <Faq items={site.site.faq.slice(0, 4)} />
              <Link className="sf-arrow" href={`${base}/contact`}>Ask your own question</Link>
            </div>
          </div>
        </section>
      ) : null}

      <CallToTour site={site} />
    </>
  )
}

function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="sf-faq">
      {items.map(item => (
        <details key={item.q}>
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ care & living */

export function CareScreen({ site }: { site: Site }) {
  const { community } = site
  const base = `/${community.slug}`
  return (
    <>
      <PageTitle title="Care & living" intro={site.site.careLevelsCopy || site.site.heroBody} />
      <section className="sf-band">
        <div className="sf-wrap sf-stack">
          {community.settingsOffered.map(setting => {
            const prices = settingPrices(site, setting)
            const types = site.apartmentTypes.filter(type => type.setting === setting)
            return (
              <article key={setting} id={setting} className="sf-card sf-care">
                <div className="sf-care-head">
                  <h2>{settingName(setting)}</h2>
                  <Opening count={openCount(site.availability, setting)} slug={community.slug} setting={setting} waitlist={site.site.waitlistEnabled} />
                </div>
                {prices.length ? (
                  <ul className="sf-pricelist">
                    {prices.map(price => (
                      <li key={price.id}><span>{price.label}</span><span><em>from</em> <b>{dollars(price.fromMinor)}</b>/{per(price.period)}</span></li>
                    ))}
                  </ul>
                ) : <p className="sf-small">Call us for current rates{community.phone ? <> at <a href={telHref(community.phone)}>{community.phone}</a></> : null}.</p>}
                {types.length ? <p className="sf-small">Apartments: {types.map(type => type.name).join(', ')}. <Link href={`${base}/floor-plans#${setting}`}>See floor plans</Link></p> : null}
                <div className="sf-actions">
                  <Link className="sf-btn" href={`${base}/tour`}>Schedule a tour</Link>
                  <Link className="sf-btn sf-btn-quiet" href={`${base}/contact?setting=${setting}`}>Ask about {plainLabel(setting).toLowerCase()}</Link>
                </div>
              </article>
            )
          })}
        </div>
      </section>
      {site.site.acceptedPayers.length ? (
        <section className="sf-band sf-band-sage">
          <div className="sf-wrap sf-section">
            <h2>Ways to pay</h2>
            <div>
              <ul className="sf-leaflist sf-leaflist-two">{site.site.acceptedPayers.map(item => <li key={item}>{item}</li>)}</ul>
              <Link className="sf-arrow" href={`${base}/pricing`}>See pricing</Link>
            </div>
          </div>
        </section>
      ) : null}
      <CallToTour site={site} />
    </>
  )
}

/* ------------------------------------------------------------------ pricing */

export function PricingScreen({ site }: { site: Site }) {
  const { community } = site
  const base = `/${community.slug}`
  const groups = [...new Set(site.prices.map(price => price.setting ?? ''))]
  const order = community.settingsOffered
  groups.sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)))
  const disclaimers = [...new Set(site.prices.map(price => price.disclaimer).filter((value): value is string => Boolean(value)))]
  return (
    <>
      <PageTitle title="Pricing" intro="Starting prices, published by our team. Your own monthly fee depends on the apartment you choose and the care you need, and we will walk you through it line by line." />
      <section className="sf-band">
        <div className="sf-wrap sf-stack">
          {groups.length ? groups.map(setting => (
            <article key={setting || 'other'} className="sf-card">
              <div className="sf-care-head">
                <h2>{setting ? settingName(setting) : 'Other services'}</h2>
                {setting ? <Opening count={openCount(site.availability, setting)} slug={community.slug} setting={setting} waitlist={site.site.waitlistEnabled} /> : null}
              </div>
              <div className="sf-pricetable" role="table" aria-label={setting ? settingName(setting) : 'Other services'}>
                {settingPrices(site, setting).map(price => (
                  <div role="row" key={price.id} className="sf-pricerow">
                    <span role="cell" className="sf-pricerow-name">{price.label}</span>
                    <span role="cell" className="sf-pricerow-amount"><b>{priceRange(price)}</b> a {per(price.period)}</span>
                    <span role="cell" className="sf-pricerow-fee">{price.communityFeeMinor ? `One-time community fee ${dollars(price.communityFeeMinor)}` : 'No community fee'}</span>
                  </div>
                ))}
              </div>
            </article>
          )) : <p className="sf-lede">Call us for current rates{community.phone ? <> at <a href={telHref(community.phone)}>{community.phone}</a></> : null}.</p>}
          {disclaimers.map(text => <p key={text} className="sf-small">{text}</p>)}
        </div>
      </section>
      {site.site.acceptedPayers.length ? (
        <section className="sf-band sf-band-sage">
          <div className="sf-wrap sf-section">
            <h2>Ways to pay</h2>
            <div>
              <ul className="sf-leaflist sf-leaflist-two">{site.site.acceptedPayers.map(item => <li key={item}>{item}</li>)}</ul>
              <Link className="sf-arrow" href={`${base}/contact`}>Ask about your coverage</Link>
            </div>
          </div>
        </section>
      ) : null}
      <CallToTour site={site} title="See what your fee includes" />
    </>
  )
}

/* ------------------------------------------------------------------ floor plans */

export function FloorPlansScreen({ site }: { site: Site }) {
  const { community } = site
  const base = `/${community.slug}`
  const order = community.settingsOffered
  const types = [...site.apartmentTypes].sort((a, b) => order.indexOf(a.setting ?? '') - order.indexOf(b.setting ?? '') || (a.squareFeet ?? 0) - (b.squareFeet ?? 0))
  const seen = new Set<string>()
  return (
    <>
      <PageTitle title="Floor plans" intro="Here is what we offer, what each apartment starts at, and what is open today." />
      <section className="sf-band">
        <div className="sf-wrap">
          {types.length ? (
            <div className="sf-plans">
              {types.map(type => {
                const price = startingPrice(site.prices.filter(row => row.apartmentTypeId === type.id))
                const priceNote = price && price.label.trim().toLowerCase() !== type.name.trim().toLowerCase() ? price.label : null
                const snapshot = site.availability.find(row => row.apartmentTypeId === type.id) ?? null
                const anchor = type.setting && !seen.has(type.setting) ? type.setting : undefined
                if (type.setting) seen.add(type.setting)
                const facts = [
                  type.bedrooms === 0 ? 'Studio' : type.bedrooms ? `${type.bedrooms} bedroom${type.bedrooms === 1 ? '' : 's'}` : null,
                  type.squareFeet ? `${type.squareFeet.toLocaleString('en-US')} sq ft` : null,
                ].filter(Boolean)
                return (
                  <article key={type.id} id={anchor} className="sf-card sf-plan">
                    {type.setting ? <p className="sf-eyebrow">{settingName(type.setting)}</p> : null}
                    <h2>{type.name}</h2>
                    {facts.length ? <p className="sf-plan-facts">{facts.join(' · ')}</p> : null}
                    {type.description ? <p>{type.description}</p> : null}
                    {price ? <p className="sf-plan-price"><em>from</em> <b>{dollars(price.fromMinor)}</b>/{per(price.period)}{priceNote ? <small>{priceNote}</small> : null}</p> : null}
                    <Opening count={snapshot ? snapshot.availableCount : null} slug={community.slug} setting={type.setting} type={type.id} waitlist={site.site.waitlistEnabled && (snapshot ? snapshot.waitlistOpen !== false : true)} />
                    <div className="sf-actions">
                      <Link className="sf-btn" href={`${base}/tour`}>Tour this apartment</Link>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : <p className="sf-lede">Call us and we will send you our floor plans{community.phone ? <>: <a href={telHref(community.phone)}>{community.phone}</a></> : null}.</p>}
        </div>
      </section>
      <CallToTour site={site} title="Walk through one in person" />
    </>
  )
}

/* ------------------------------------------------------------------ life here */

export function LifeScreen({ site }: { site: Site }) {
  const base = `/${site.community.slug}`
  return (
    <>
      <PageTitle title="Life here" intro={`Meals, things to do, the places to spend a day and the people you will meet at ${site.community.name}.`} />
      {site.site.diningCopy ? (
        <section id="dining" className="sf-band sf-anchor">
          <div className="sf-wrap sf-section"><h2>Dining</h2><p className="sf-lede">{site.site.diningCopy}</p></div>
        </section>
      ) : null}
      {site.site.activitiesCopy ? (
        <section id="activities" className="sf-band sf-band-sage sf-anchor">
          <div className="sf-wrap sf-section"><h2>Activities</h2><p className="sf-lede">{site.site.activitiesCopy}</p></div>
        </section>
      ) : null}
      {site.site.amenities.length ? (
        <section id="amenities" className="sf-band sf-anchor">
          <div className="sf-wrap sf-section"><h2>Amenities</h2><ul className="sf-leaflist sf-leaflist-two">{site.site.amenities.map(item => <li key={item}>{item}</li>)}</ul></div>
        </section>
      ) : null}
      {site.team.length ? (
        <section id="team" className="sf-band sf-band-cream sf-anchor">
          <div className="sf-wrap sf-section">
            <h2>Our team</h2>
            <div className="sf-plans">
              {site.team.map(person => (
                <article key={`${person.name}-${person.title}`} className="sf-card">
                  <h3>{person.name}</h3>
                  {person.title ? <p className="sf-eyebrow">{person.title}</p> : null}
                  {person.bio ? <p>{person.bio}</p> : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      {site.site.faq.length ? (
        <section id="questions" className="sf-band sf-anchor">
          <div className="sf-wrap sf-section">
            <h2>Questions families ask</h2>
            <div>
              <Faq items={site.site.faq} />
              <Link className="sf-arrow" href={`${base}/contact`}>Ask your own question</Link>
            </div>
          </div>
        </section>
      ) : null}
      <CallToTour site={site} />
    </>
  )
}

/* ------------------------------------------------------------------ tour */

function Whereabouts({ site }: { site: Site }) {
  const { community } = site
  const lines = [community.address, [community.city, [community.region, community.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean)
  return (
    <aside className="sf-aside">
      <h2>Find us</h2>
      {lines.length ? <p className="sf-aside-row"><PinIcon className="sf-ico" /><span>{lines.map(line => <span key={line} className="sf-line">{line}</span>)}</span></p> : null}
      {community.phone ? <p className="sf-aside-row"><PhoneIcon className="sf-ico" /><a href={telHref(community.phone)}>{community.phone}</a></p> : null}
    </aside>
  )
}

export function TourScreen({ site }: { site: Site }) {
  const { community } = site
  return (
    <section className="sf-band sf-band-first">
      <div className="sf-wrap sf-split">
        <div className="sf-split-main">
          <TourScheduler slug={community.slug} slots={schedulerSlots(site.tourSlots, community.timeZone)} phone={community.phone} tel={telHref(community.phone)} bookingEnabled={site.site.tourBookingEnabled} timeZone={community.timeZone} full heading="h1" />
        </div>
        <div className="sf-split-side">
          <Whereabouts site={site} />
          <aside className="sf-aside">
            <h2>What to expect</h2>
            <ul className="sf-leaflist">
              <li>Meet a member of our team</li>
              <li>See the apartments and the shared spaces</li>
              <li>Bring anyone you like, and every question</li>
              <li>By video, we show you around on camera</li>
            </ul>
          </aside>
        </div>
      </div>
    </section>
  )
}

export function ManageTourScreen({ site, token }: { site: Site; token: string }) {
  const { community } = site
  return (
    <>
      <PageTitle title="Cancel a tour" intro={token ? 'Cancelling frees the time for another family. You can choose a new time whenever you are ready.' : null} />
      <section className="sf-band">
        <div className="sf-wrap sf-narrow">
          {token ? <CancelTourForm slug={community.slug} token={token} /> : (
            <div className="sf-card">
              <p>Open the cancel link from your tour confirmation to cancel online.{community.phone ? <> If you no longer have it, call <a href={telHref(community.phone)}>{community.phone}</a> and we will take care of it.</> : null}</p>
              <p><Link className="sf-btn" href={`/${community.slug}/tour`}>Schedule a tour</Link></p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ contact, waitlist, careers */

const settingOptions = (site: Site) => site.community.settingsOffered.map(setting => ({ value: setting, label: settingName(setting) }))

export function ContactScreen({ site }: { site: Site }) {
  const { community } = site
  return (
    <>
      <PageTitle title="Ask a question" intro="Tell us what you need to know. A member of our team reads every message and gets back to you." />
      <section className="sf-band">
        <div className="sf-wrap sf-split">
          <div className="sf-split-main"><InquiryForm slug={community.slug} settings={settingOptions(site)} phone={community.phone} tel={telHref(community.phone)} /></div>
          <div className="sf-split-side"><Whereabouts site={site} /></div>
        </div>
      </section>
    </>
  )
}

export function WaitlistScreen({ site, setting, type }: { site: Site; setting: string; type: string }) {
  const { community } = site
  const settings = settingOptions(site)
  return (
    <>
      <PageTitle title="Join the waitlist" intro="When the apartment you want is taken, we keep your place in line and contact you when one opens." />
      <section className="sf-band">
        <div className="sf-wrap sf-split">
          <div className="sf-split-main">
            {site.site.waitlistEnabled && settings.length ? (
              <WaitlistForm
                slug={community.slug} settings={settings} phone={community.phone} tel={telHref(community.phone)}
                apartmentTypes={site.apartmentTypes.map(row => ({ value: row.id, label: row.name, setting: row.setting }))}
                initialSetting={settings.some(option => option.value === setting) ? setting : ''}
                initialType={site.apartmentTypes.some(row => row.id === type) ? type : ''}
              />
            ) : (
              <div className="sf-card">
                <p>We add families to the waitlist by phone.{community.phone ? <> Call <a href={telHref(community.phone)}>{community.phone}</a> and we will take your details.</> : null}</p>
                <p><Link className="sf-btn" href={`/${community.slug}/contact`}>Leave a message</Link></p>
              </div>
            )}
          </div>
          <div className="sf-split-side"><Whereabouts site={site} /></div>
        </div>
      </section>
    </>
  )
}

export function CareersScreen({ site }: { site: Site }) {
  const { community } = site
  return (
    <>
      <PageTitle title="Careers" intro={`These are the roles ${community.name} is hiring for today.`} />
      <section className="sf-band">
        <div className="sf-wrap sf-stack">
          {site.jobs.length ? site.jobs.map(job => (
            <article key={job.id} className="sf-card">
              <h2>{job.title}</h2>
              <p className="sf-eyebrow">{[plainLabel(job.employmentType), job.payRange].filter(Boolean).join(' · ')}</p>
              {job.body ? <p className="sf-pre">{job.body}</p> : null}
              {community.phone ? <p className="sf-small">To apply, call <a href={telHref(community.phone)}>{community.phone}</a> and ask for the hiring manager.</p> : null}
            </article>
          )) : (
            <div className="sf-card">
              <p>We have no open roles today.{community.phone ? <> You are welcome to call <a href={telHref(community.phone)}>{community.phone}</a> and introduce yourself.</> : null}</p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ several communities */

export function ChooserScreen({ communities }: { communities: { slug: string; name: string; city: string; region: string }[] }) {
  return (
    <>
    <main id="main" className="sf-main">
      <PageTitle title="Our communities" intro="Choose a community to see care, pricing and open tour times." />
      <section className="sf-band">
        <div className="sf-wrap">
          <div className="sf-plans">
            {communities.map(community => (
              <Link key={community.slug} href={`/${community.slug}`} className="sf-card sf-choice">
                <h2>{community.name}</h2>
                <p className="sf-eyebrow">{cityLine(community.city, community.region)}</p>
                <span className="sf-arrow">Visit</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
    <footer className="sf-footer"><Wave className="sf-footer-wave" /><p className="sf-footer-note"><Link href="/dashboard">Staff sign in</Link></p></footer>
    </>
  )
}
