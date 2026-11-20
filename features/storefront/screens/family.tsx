import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { isSignedIn, portalCalendar, portalDocuments, portalMe, portalPayments, portalStatements, portalTrustBalance, portalUpdates, type PortalResident, type Site } from '../lib/data'
import { dollarsExact, plainDate, plainLabel, settingName, telHref } from '../lib/format'
import { PageTitle } from '../components/Chrome'
import { AcceptInvitationForm, FamilySignInForm, MfaSetupForm, PayStatementForm } from '../components/Forms'
import { familySignOutAction } from '../actions'

/** What each granted permission opens. Permissions without a page yet are simply not listed. */
const VIEWS = [
  { scope: 'updates', title: 'Updates' },
  { scope: 'calendar', title: 'Calendar' },
  { scope: 'statements', title: 'Statements' },
  { scope: 'payments', title: 'Payments' },
  { scope: 'trust_balance', title: 'Resident funds' },
  { scope: 'documents', title: 'Documents' },
] as const
type View = (typeof VIEWS)[number]['scope']

const viewsFor = (resident: PortalResident) => VIEWS.filter(view => resident.scopes.includes(view.scope))

function SignOut({ slug }: { slug: string }) {
  return (
    <form action={familySignOutAction} className="sf-signout">
      <input type="hidden" name="community" value={slug} />
      <button type="submit" className="sf-btn sf-btn-quiet">Sign out</button>
    </form>
  )
}

function Office({ site, lead = 'Questions?' }: { site: Site; lead?: string }) {
  return site.community.phone ? <p className="sf-small">{lead} Call {site.community.name} at <a href={telHref(site.community.phone)}>{site.community.phone}</a>.</p> : null
}

/* ------------------------------------------------------------------ sign in and invitation */

export async function FamilySignInScreen({ site }: { site: Site }) {
  if ((await isSignedIn()) && (await portalMe())) redirect(`/${site.community.slug}/family`)
  return (
    <>
      <PageTitle title="Family sign in" intro="For residents and the family members they have chosen. Sign in to see what the community has shared with you." />
      <section className="sf-band">
        <div className="sf-wrap sf-narrow sf-narrow-form">
          <FamilySignInForm slug={site.community.slug} />
          <div className="sf-card sf-quiet">
            <h2>New here?</h2>
            <p>Family accounts are opened by the community. Ask the business office for an invitation link, then choose your password.</p>
            <Office site={site} lead="Forgot your password or need an invitation?" />
          </div>
        </div>
      </section>
    </>
  )
}

export function FamilyInviteScreen({ site, token }: { site: Site; token: string }) {
  return (
    <>
      <PageTitle title="Create your family account" intro={`${site.community.name} invited you to follow along with someone you love. Choose a password to finish.`} />
      <section className="sf-band">
        <div className="sf-wrap sf-narrow sf-narrow-form">
          {token ? <AcceptInvitationForm slug={site.community.slug} token={token} /> : (
            <div className="sf-card">
              <p>Open the invitation link the community gave you. It carries the code that connects your account.</p>
              <Office site={site} lead="No link?" />
              <p><Link className="sf-btn sf-btn-quiet" href={`/${site.community.slug}/family/sign-in`}>I already have an account</Link></p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ signed in */

/** The signed-in family member; an anonymous visitor goes to sign in; a signed-in person without family access gets null. */
async function requireFamily(site: Site) {
  if (!(await isSignedIn())) redirect(`/${site.community.slug}/family/sign-in`)
  return portalMe()
}

function NotAFamilyAccount({ site }: { site: Site }) {
  return (
    <>
      <PageTitle title="Family sign in" />
      <section className="sf-band">
        <div className="sf-wrap sf-narrow sf-narrow-form">
          <div className="sf-card">
            <p>You are signed in with an account that has no active family access.</p>
            <p>If you work here, your workspace is the staff dashboard.</p>
            <div className="sf-actions">
              <Link className="sf-btn" href="/dashboard">Go to the staff dashboard</Link>
              <SignOut slug={site.community.slug} />
            </div>
            <Office site={site} lead="Expecting family access?" />
          </div>
        </div>
      </section>
    </>
  )
}

export async function FamilyHomeScreen({ site }: { site: Site }) {
  const me = await requireFamily(site)
  if (!me) return <NotAFamilyAccount site={site} />
  const base = `/${site.community.slug}/family`
  if (me.residents.length === 1) redirect(`${base}/${me.residents[0].residentId}`)
  return (
    <>
      <PageTitle title="Your family" intro={me.residents.length ? 'Choose who you would like to check in on.' : null} />
      <section className="sf-band">
        <div className="sf-wrap sf-narrow">
          {me.residents.length ? (
            <div className="sf-plans">
              {me.residents.map(resident => (
                <Link key={resident.residentId} href={`${base}/${resident.residentId}`} className="sf-card sf-choice">
                  <h2>{resident.name}</h2>
                  <p className="sf-eyebrow">{resident.community}</p>
                  <span className="sf-arrow">Open</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="sf-card">
              <p>Your account is active, but nothing has been shared with it yet. The community turns on each kind of access after checking who may see it.</p>
              <Office site={site} lead="Waiting on access?" />
            </div>
          )}
          <SignOut slug={site.community.slug} />
        </div>
      </section>
    </>
  )
}

function Refused({ message, site, reason, residentId }: { message: string; site: Site; reason?: string | null; residentId?: string }) {
  return (
    <div className="sf-card">
      <p className="sf-error" role="alert">{message}</p>
      {reason === 'mfa_required' && residentId ? <MfaSetupForm slug={site.community.slug} residentId={residentId} /> : null}
      <Office site={site} lead="Need a hand?" />
    </div>
  )
}

export async function FamilyResidentScreen({ site, residentId, view }: { site: Site; residentId: string; view: string }) {
  const me = await requireFamily(site)
  if (!me) return <NotAFamilyAccount site={site} />
  const base = `/${site.community.slug}/family`
  const resident = me.residents.find(row => row.residentId === residentId)
  if (!resident) redirect(base)
  const views = viewsFor(resident)
  const current: View | null = views.find(item => item.scope === view)?.scope ?? views[0]?.scope ?? null
  return (
    <>
      <PageTitle title={resident.name} intro={resident.community}>
        <div className="sf-title-actions">
          {me.residents.length > 1 ? <Link className="sf-btn sf-btn-quiet" href={base}>Everyone</Link> : null}
          <SignOut slug={site.community.slug} />
        </div>
      </PageTitle>
      <section className="sf-band">
        <div className="sf-wrap sf-narrow">
          {views.length > 1 ? (
            <nav className="sf-tabs" aria-label={`${resident.name}`}>
              {views.map(item => <Link key={item.scope} href={`${base}/${residentId}?view=${item.scope}`} className={item.scope === current ? 'is-on' : ''} aria-current={item.scope === current ? 'page' : undefined}>{item.title}</Link>)}
            </nav>
          ) : null}
          {current === null ? (
            <div className="sf-card">
              <p>Nothing has been shared with your account for {resident.name} yet.</p>
              <Office site={site} lead="Waiting on access?" />
            </div>
          ) : null}
          {current === 'updates' ? <UpdatesView site={site} residentId={residentId} /> : null}
          {current === 'calendar' ? <CalendarView site={site} residentId={residentId} /> : null}
          {current === 'statements' ? <StatementsView site={site} residentId={residentId} canPay={resident.scopes.includes('payments')} /> : null}
          {current === 'payments' ? <PaymentsView site={site} residentId={residentId} /> : null}
          {current === 'trust_balance' ? <FundsView site={site} residentId={residentId} /> : null}
          {current === 'documents' ? <DocumentsView site={site} residentId={residentId} /> : null}
        </div>
      </section>
    </>
  )
}

type ViewProps = { site: Site; residentId: string }

async function UpdatesView({ site, residentId }: ViewProps) {
  const read = await portalUpdates(residentId)
  if (!read.ok) return <Refused message={read.error} reason={read.reason} residentId={residentId} site={site} />
  const data = read.data
  return (
    <div className="sf-card">
      <h2>{data.whereabouts === 'away' ? `${data.name} is away from the community right now` : data.whereabouts === 'at_community' ? `${data.name} is at the community today` : data.name}</h2>
      <dl className="sf-receipt">
        {data.community ? <div><dt>Community</dt><dd>{data.community}</dd></div> : null}
        {data.setting ? <div><dt>Living in</dt><dd>{settingName(data.setting)}</dd></div> : null}
        {data.since ? <div><dt>Resident since</dt><dd>{plainDate(data.since, site.community.timeZone)}</dd></div> : null}
      </dl>
      {data.communityPhone ? <p className="sf-small">To speak with the care team, call <a href={telHref(data.communityPhone)}>{data.communityPhone}</a>.</p> : null}
    </div>
  )
}

async function CalendarView({ site, residentId }: ViewProps) {
  const read = await portalCalendar(residentId)
  if (!read.ok) return <Refused message={read.error} reason={read.reason} residentId={residentId} site={site} />
  return (
    <div className="sf-card">
      <h2>Coming up</h2>
      {read.data.holidays.length ? (
        <ul className="sf-rows">{read.data.holidays.map(day => <li key={`${day.date}-${day.name}`}><span>{day.name}</span><span>{plainDate(day.date)}</span></li>)}</ul>
      ) : <p>No holidays in the next two months.</p>}
      <Office site={site} lead="Planning a visit?" />
    </div>
  )
}

async function StatementsView({ site, residentId, canPay }: ViewProps & { canPay: boolean }) {
  const read = await portalStatements(residentId)
  if (!read.ok) return <Refused message={read.error} reason={read.reason} residentId={residentId} site={site} />
  const statements = read.data.statements
  const owing = statements.some(row => row.status === 'issued' && BigInt(row.balanceMinor) > 0n)
  const paying = canPay && owing ? await portalPayments(residentId) : null
  const methods = paying?.ok ? paying.data.methods.map(method => ({ id: method.id, label: `${method.brand ? plainLabel(method.brand) : method.provider === 'ach' ? 'Bank account' : 'Card'}${method.last4 ? ` ending ${method.last4}` : ''}` })) : []
  const plans = paying?.ok ? paying.data.plans : []
  const payKey = randomUUID()
  if (!statements.length) return <div className="sf-card"><p>No statements yet.</p></div>
  return (
    <div className="sf-stack">
      {paying && !paying.ok ? <Refused message={paying.error} reason={paying.reason} residentId={residentId} site={site} /> : null}
      {statements.map(row => {
        const balance = BigInt(row.balanceMinor)
        const due = row.status === 'issued' && balance > 0n
        const plan = plans.find(item => item.statement?.id === row.id)
        const next = plan?.instalments.find(item => item.paymentStatus !== 'succeeded') ?? null
        return (
          <article key={row.id} className="sf-card">
            <div className="sf-care-head">
              <h2>Statement {row.number}</h2>
              <p className={`sf-open${due ? ' is-full' : ''}`}><i aria-hidden="true" />{due ? `${dollarsExact(row.balanceMinor)} due${row.dueOn ? ` ${plainDate(row.dueOn)}` : ''}` : plainLabel(row.status)}</p>
            </div>
            {Array.isArray(row.lines) && row.lines.length ? (
              <ul className="sf-rows">{row.lines.map((line, index) => <li key={index}><span>{line.description}</span><span>{dollarsExact(String(line.amountMinor))}</span></li>)}</ul>
            ) : null}
            <ul className="sf-rows sf-rows-total">
              <li><span>Total</span><span>{dollarsExact(row.totalMinor)}</span></li>
              <li><span>Paid</span><span>{dollarsExact(row.paidMinor)}</span></li>
              <li><span>Balance</span><span><b>{dollarsExact(row.balanceMinor)}</b></span></li>
            </ul>
            {row.issuedAt ? <p className="sf-small">Issued {plainDate(row.issuedAt, site.community.timeZone)}</p> : null}
            {due && canPay && paying?.ok ? (
              methods.length ? (
                <PayStatementForm
                  slug={site.community.slug} residentId={residentId} statementId={row.id} statementNumber={row.number} methods={methods} payKey={payKey}
                  balance={dollarsExact(row.balanceMinor).replace(/[$,]/g, '')} instalment={plan ? (next ? dollarsExact(next.amountMinor) : null) : null}
                />
              ) : <Office site={site} lead="To pay online, the business office first saves a card or bank account for the resident." />
            ) : null}
            {due && !canPay ? <Office site={site} lead="To pay this statement," /> : null}
          </article>
        )
      })}
    </div>
  )
}

async function PaymentsView({ site, residentId }: ViewProps) {
  const read = await portalPayments(residentId)
  if (!read.ok) return <Refused message={read.error} reason={read.reason} residentId={residentId} site={site} />
  const { payments, methods, plans } = read.data
  return (
    <div className="sf-stack">
      <div className="sf-card">
        <h2>Saved ways to pay</h2>
        {methods.length ? (
          <ul className="sf-rows">{methods.map(method => <li key={method.id}><span>{method.brand ? plainLabel(method.brand) : method.provider === 'ach' ? 'Bank account' : 'Card'}{method.last4 ? ` ending ${method.last4}` : ''}</span><span>{method.autopay ? 'Autopay on' : ''}</span></li>)}</ul>
        ) : <p>None saved yet.</p>}
        <Office site={site} lead="To add or remove a card or bank account," />
      </div>
      {plans.map(plan => (
        <div key={plan.id} className="sf-card">
          <h2>Payment plan {plan.reference}</h2>
          <p className="sf-small">{dollarsExact(plan.totalMinor)} in {plan.instalments.length} instalments{plan.statement ? ` for statement ${plan.statement.number}` : ''}</p>
          <ul className="sf-rows">{plan.instalments.map(item => <li key={item.id}><span>Instalment {item.number}{item.dueOn ? ` · due ${plainDate(item.dueOn)}` : ''}</span><span>{dollarsExact(item.amountMinor)} · {item.paymentStatus ? plainLabel(item.paymentStatus) : 'Not paid yet'}</span></li>)}</ul>
        </div>
      ))}
      <div className="sf-card">
        <h2>Payments</h2>
        {payments.length ? (
          <ul className="sf-rows">{payments.map(payment => (
            <li key={payment.id}>
              <span>{payment.initiatedAt ? plainDate(payment.initiatedAt, site.community.timeZone) : payment.reference}{payment.statement ? ` · statement ${payment.statement.number}` : ''}<small> {plainLabel(payment.method)}</small></span>
              <span>{dollarsExact(payment.amountMinor)} · {plainLabel(payment.status)}</span>
            </li>
          ))}</ul>
        ) : <p>No payments yet.</p>}
      </div>
    </div>
  )
}

async function FundsView({ site, residentId }: ViewProps) {
  const read = await portalTrustBalance(residentId)
  if (!read.ok) return <Refused message={read.error} reason={read.reason} residentId={residentId} site={site} />
  return (
    <div className="sf-card">
      <h2>Resident funds</h2>
      {read.data.hasLedger ? (
        <>
          <p className="sf-figure">{dollarsExact(read.data.balanceMinor)}</p>
          <p className="sf-small">Held by the community for the resident&rsquo;s personal use.</p>
        </>
      ) : <p>The community holds no personal funds for this resident.</p>}
      <Office site={site} lead="To deposit or withdraw," />
    </div>
  )
}

async function DocumentsView({ site, residentId }: ViewProps) {
  const read = await portalDocuments(residentId)
  if (!read.ok) return <Refused message={read.error} reason={read.reason} residentId={residentId} site={site} />
  const { documents, notices } = read.data
  return (
    <div className="sf-stack">
      <div className="sf-card">
        <h2>Signed documents</h2>
        {documents.length ? (
          <ul className="sf-rows">{documents.map(doc => <li key={doc.id}><span>{doc.title || plainLabel(doc.kind)}<small> {plainLabel(doc.kind)}</small></span><span>{plainDate(doc.signedAt ?? doc.createdAt, site.community.timeZone)}</span></li>)}</ul>
        ) : <p>No signed documents yet.</p>}
        <Office site={site} lead="For a copy of any document," />
      </div>
      {notices.length ? (
        <div className="sf-card">
          <h2>Notices</h2>
          <ul className="sf-rows">{notices.map(notice => <li key={notice.id}><span>{plainLabel(notice.kind)}{notice.method ? <small> {plainLabel(notice.method)}</small> : null}</span><span>{notice.deliveredAt ? plainDate(notice.deliveredAt, site.community.timeZone) : ''}</span></li>)}</ul>
        </div>
      ) : null}
    </div>
  )
}
