import Link from 'next/link'
import { useId, type ReactNode } from 'react'
import type { Site } from '../lib/data'
import { brandParts, cityLine, settingName, telHref } from '../lib/format'

/* ------------------------------------------------------------------ marks */

/** A maple leaf drawn in a 100 by 100 box: the tip at the top, the stem end at (50, 97). */
const LEAF = 'M50 2 56.5 16 64 12 60.5 35 72 23 75 30.5 89 27.5 84.5 42 93 46.5 74 63 77 71 54 67.5 52 67.5 52.8 97 47.2 97 48 67.5 46 67.5 23 71 26 63 7 46.5 15.5 42 11 27.5 25 30.5 28 23 39.5 35 36 12 43.5 16Z'
const VEINS = 'M50 66V14M50 60 76 42M50 60 24 42M50 46 66 28M50 46 34 28'

/** Each drawing carries its own gradient id: a gradient inside a hidden copy would otherwise blank the visible ones. */
function useLeafPaint() {
  const id = `sf-leaf-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const defs = (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e2742b" />
        <stop offset="0.55" stopColor="#c8431d" />
        <stop offset="1" stopColor="#9d2c14" />
      </linearGradient>
    </defs>
  )
  const leaf = (transform: string) => (
    <g transform={transform}>
      <path fill={`url(#${id})`} stroke={`url(#${id})`} strokeWidth="2.5" strokeLinejoin="round" d={LEAF} />
      <path fill="none" stroke="#f6c9a0" strokeOpacity="0.55" strokeWidth="1.3" strokeLinecap="round" d={VEINS} />
    </g>
  )
  return { defs, leaf }
}

export function MapleLeaf({ className }: { className?: string }) {
  const { defs, leaf } = useLeafPaint()
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {defs}
      {leaf('rotate(-14 50 50)')}
    </svg>
  )
}

/** Two maple leaves hanging from a twig that comes in from the right: the corner of the tour scheduler. */
export function LeafTwig({ className }: { className?: string }) {
  const { defs, leaf } = useLeafPaint()
  return (
    <svg className={className} viewBox="0 0 132 134" aria-hidden="true" focusable="false">
      {defs}
      <path d="M132 42C116 43 100 47 86 54M110 47C108 56 104 65 100 72" fill="none" stroke="#8a4a26" strokeWidth="2.6" strokeLinecap="round" />
      {leaf('translate(86 54) rotate(-66) scale(0.8) translate(-50 -97)')}
      {leaf('translate(100 72) rotate(-150) scale(0.68) translate(-50 -97)')}
    </svg>
  )
}

/** A small branch of leaves, used beside the starting price. */
export function Sprig({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 80" aria-hidden="true" focusable="false">
      <path d="M32 78V30" stroke="#b8431f" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <g fill="#d9642a">
        <path d="M32 34C24 26 25 12 32 3c7 9 8 23 0 31Z" />
        <path d="M30 48C19 47 9 38 7 26c12 1 21 9 23 22Z" />
        <path d="M34 48c11-1 21-10 23-22-12 1-21 9-23 22Z" />
        <path d="M30 64C21 65 11 60 6 50c11-2 20 3 24 14Z" />
        <path d="M34 64c9 1 19-4 24-14-11-2-20 3-24 14Z" />
      </g>
    </svg>
  )
}

/** A soft hill. `rise` is the one under the home price strip: low on the left, climbing behind the strip on the right. */
export function Wave({ className, rise = false }: { className?: string; rise?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={rise ? 'M0 62C190 52 400 46 580 50s300 24 420 20S1280 12 1440 6v84H0Z' : 'M0 62C210 40 380 74 640 66s520-58 800-44v68H0Z'} />
    </svg>
  )
}

export function Swoosh({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 18" aria-hidden="true" focusable="false">
      <path d="M4 13C52 4 132 1 216 7" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  )
}

export const PinIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a7.5 7.5 0 0 0-7.5 7.5c0 5.3 6.2 11.6 6.9 12.3a.85.85 0 0 0 1.2 0c.7-.7 6.9-7 6.9-12.3A7.5 7.5 0 0 0 12 2Zm0 10.3a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z" /></svg>
)
export const PhoneIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.6 2.5 9 2c.6-.1 1.1.2 1.3.7l1.2 3c.2.5 0 1-.3 1.3L9.6 8.3a11.5 11.5 0 0 0 6.1 6.1l1.3-1.6c.3-.4.9-.5 1.3-.3l3 1.2c.5.2.8.8.7 1.3l-.5 2.4c-.1.6-.6 1-1.2 1C10.7 18.4 5.6 13.3 5.6 3.7c0-.6.4-1.1 1-1.2Z" /></svg>
)
export const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
)
export const WalkIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4" r="1.8" fill="currentColor" /><path d="m7 21 3-6.5L8.5 11l1-3.5 3.5-1 2.5 4 3 1.5M10 14.5l3.5 2.5.5 4M9.5 7.5 6.5 9.5l-.5 3" /></svg>
)
export const VideoIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="m15.5 10.5 6-3v9l-6-3" /></svg>
)
const Chevron = () => (
  <svg className="sf-chevron" viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="m1.5 1.5 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

/* ------------------------------------------------------------------ header and footer */

export function Brand({ name, href }: { name: string; href: string }) {
  const { main, sub } = brandParts(name)
  return (
    <Link href={href} className="sf-brand" aria-label={`${name} home`}>
      <MapleLeaf className="sf-brand-leaf" />
      <span className="sf-brand-text">
        <span className="sf-brand-main">{main}</span>
        {sub ? <span className="sf-brand-sub"><i aria-hidden="true" />{sub}<i aria-hidden="true" /></span> : null}
      </span>
    </Link>
  )
}

export function Header({ site }: { site: Site }) {
  const { community } = site
  const base = `/${community.slug}`
  const place = cityLine(community.city, community.region)
  const tel = telHref(community.phone)
  const life = [
    site.site.diningCopy ? { href: `${base}/life#dining`, text: 'Dining' } : null,
    site.site.activitiesCopy ? { href: `${base}/life#activities`, text: 'Activities' } : null,
    site.site.amenities.length ? { href: `${base}/life#amenities`, text: 'Amenities' } : null,
    site.team.length ? { href: `${base}/life#team`, text: 'Our team' } : null,
    site.site.faq.length ? { href: `${base}/life#questions`, text: 'Questions families ask' } : null,
  ].filter((item): item is { href: string; text: string } => Boolean(item))
  return (
    <header className="sf-header">
      <div className="sf-header-in">
        <div className="sf-header-id">
          <Brand name={community.name} href={base} />
          <div className="sf-header-place">
            {place ? <span className="sf-place-city"><PinIcon className="sf-ico sf-only-phone" />{place}</span> : null}
            {community.phone ? <a className="sf-place-phone sf-only-phone" href={tel}><PhoneIcon className="sf-ico" />{community.phone}</a> : null}
          </div>
        </div>
        <nav className="sf-nav" aria-label="Main">
          <div className="sf-nav-item">
            <Link href={`${base}/care`}>Care &amp; living{community.settingsOffered.length > 1 ? <Chevron /> : null}</Link>
            {community.settingsOffered.length > 1 ? (
              <div className="sf-menu">
                {community.settingsOffered.map(setting => <Link key={setting} href={`${base}/care#${setting}`}>{settingName(setting)}</Link>)}
              </div>
            ) : null}
          </div>
          <div className="sf-nav-item"><Link href={`${base}/pricing`}>Pricing</Link></div>
          <div className="sf-nav-item"><Link href={`${base}/floor-plans`}>Floor plans</Link></div>
          <div className="sf-nav-item">
            <Link href={`${base}/life`}>Life here{life.length > 1 ? <Chevron /> : null}</Link>
            {life.length > 1 ? <div className="sf-menu">{life.map(item => <Link key={item.href} href={item.href}>{item.text}</Link>)}</div> : null}
          </div>
          <div className="sf-nav-item"><Link href={`${base}/family`}>Family sign in</Link></div>
        </nav>
        <Link href={`${base}/tour`} className="sf-btn sf-header-cta"><CalendarIcon className="sf-ico sf-only-phone" />Schedule a tour</Link>
      </div>
    </header>
  )
}

export function Footer({ site }: { site: Site }) {
  const { community } = site
  const base = `/${community.slug}`
  const tel = telHref(community.phone)
  const street = [community.address, [community.city, [community.region, community.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean)
  return (
    <footer className="sf-footer">
      <Wave className="sf-footer-wave" />
      <div className="sf-footer-in">
        <div className="sf-footer-col sf-footer-about">
          <p className="sf-footer-name">{community.name}</p>
          <address>
            {street.map(line => <span key={line}>{line}</span>)}
            {community.phone ? <a href={tel}>{community.phone}</a> : null}
          </address>
        </div>
        <nav className="sf-footer-col" aria-label="Visit">
          <p className="sf-footer-head">Visit</p>
          <Link href={`${base}/tour`}>Schedule a tour</Link>
          <Link href={`${base}/contact`}>Ask a question</Link>
          {site.site.waitlistEnabled ? <Link href={`${base}/waitlist`}>Join the waitlist</Link> : null}
        </nav>
        <nav className="sf-footer-col" aria-label="Community">
          <p className="sf-footer-head">Community</p>
          <Link href={`${base}/care`}>Care &amp; living</Link>
          <Link href={`${base}/pricing`}>Pricing</Link>
          <Link href={`${base}/floor-plans`}>Floor plans</Link>
          <Link href={`${base}/life`}>Life here</Link>
        </nav>
        <nav className="sf-footer-col" aria-label="Families and team">
          <p className="sf-footer-head">Families &amp; team</p>
          <Link href={`${base}/family`}>Family sign in</Link>
          <Link href={`${base}/careers`}>Careers</Link>
          <Link href="/dashboard">Staff sign in</Link>
        </nav>
      </div>
      {site.site.acceptedPayers.length ? <p className="sf-footer-note">We accept {site.site.acceptedPayers.join(' · ')}</p> : null}
      <p className="sf-footer-note">© {new Date().getFullYear()} {community.name}</p>
    </footer>
  )
}

export function SiteShell({ site, children }: { site: Site; children: ReactNode }) {
  return (
    <>
      <a className="sf-skip" href="#main">Skip to the page</a>
      <Header site={site} />
      <main id="main" className="sf-main">{children}</main>
      <Footer site={site} />
    </>
  )
}

/* ------------------------------------------------------------------ page pieces */

/** The cream title band every inner page opens with: the same serif, maple red and sage stroke as the home headline. */
export function PageTitle({ title, intro, children }: { title: string; intro?: string | null; children?: ReactNode }) {
  return (
    <section className="sf-title">
      <MapleLeaf className="sf-title-leaf" />
      <div className="sf-wrap">
        <h1>{title}</h1>
        <Swoosh className="sf-swoosh" />
        {intro ? <p className="sf-lede">{intro}</p> : null}
        {children}
      </div>
    </section>
  )
}

/** The strip under the home photo: starting price on the left, where and how to reach the community on the right. */
export function ContactStrip({ site, lead }: { site: Site; lead: { title: string; amount: string; period: string } | null }) {
  const place = cityLine(site.community.city, site.community.region)
  return (
    <section className="sf-strip" aria-label="Starting price and contact">
      <div className="sf-strip-in">
        {lead ? (
          <Link href={`/${site.community.slug}/pricing`} className="sf-strip-price">
            <Sprig className="sf-strip-sprig" />
            <MapleLeaf className="sf-strip-leaf" />
            <span className="sf-strip-rule" aria-hidden="true" />
            <span className="sf-strip-text">
              <span className="sf-strip-title">{lead.title}</span>{' '}
              <span className="sf-strip-word">from</span>{' '}
              <span className="sf-strip-amount"><b>{lead.amount}</b>/{lead.period}</span>
            </span>
          </Link>
        ) : null}
        <div className="sf-strip-contact">
          {place ? <span><PinIcon className="sf-ico" />{place}</span> : null}
          {place && site.community.phone ? <span className="sf-strip-rule" aria-hidden="true" /> : null}
          {site.community.phone ? <a href={telHref(site.community.phone)}><PhoneIcon className="sf-ico" />{site.community.phone}</a> : null}
        </div>
      </div>
    </section>
  )
}

export function CallToTour({ site, title = 'Come and see for yourself' }: { site: Site; title?: string }) {
  const base = `/${site.community.slug}`
  return (
    <section className="sf-cta">
      <div className="sf-wrap sf-cta-in">
        <div>
          <h2>{title}</h2>
          <p>Look around, meet the team and ask everything you want to know. In person or by video.</p>
        </div>
        <div className="sf-cta-actions">
          <Link href={`${base}/tour`} className="sf-btn sf-btn-lg"><CalendarIcon className="sf-ico" />Schedule a tour</Link>
          {site.community.phone ? <a className="sf-link-phone" href={telHref(site.community.phone)}><PhoneIcon className="sf-ico" />{site.community.phone}</a> : null}
        </div>
      </div>
    </section>
  )
}
