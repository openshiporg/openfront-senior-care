'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { acceptInvitationAction, cancelTourAction, familySignInAction, joinWaitlistAction, portalPayAction, submitInquiryAction, type ActionState, type Paid } from '../actions'

type Option = { value: string; label: string }

/** Kept in state so a refused submission never clears what the person typed. */
function useText(initial = '') {
  const [value, setValue] = useState(initial)
  return { value, onChange: (event: { target: { value: string } }) => setValue(event.target.value) }
}

/**
 * A field people never see and never fill. Its name means nothing to a browser's autofill, so a real
 * visitor's saved details cannot land in it; a script that fills every input does, and is dropped.
 */
const Honeypot = () => (
  <div className="sf-hp" aria-hidden="true">
    <label>Leave this empty<input name="leave_blank" tabIndex={-1} autoComplete="off" /></label>
  </div>
)

function Consent({ text }: { text: string }) {
  const [checked, setChecked] = useState(false)
  return (
    <label className="sf-consent">
      <input type="checkbox" name="consent" checked={checked} onChange={event => setChecked(event.target.checked)} required />
      <span>{text}</span>
    </label>
  )
}

function Received({ title, code, children }: { title: string; code?: string; children: React.ReactNode }) {
  return (
    <div className="sf-card sf-done" aria-live="polite">
      <h2>{title}</h2>
      {children}
      {code ? <p className="sf-small">Your reference: <b>{code}</b></p> : null}
    </div>
  )
}

/** "Ask a question": the public inquiry. The sales team sees it on their pipeline at once. */
export function InquiryForm({ slug, settings, phone, tel }: { slug: string; settings: Option[]; phone: string; tel: string }) {
  const [state, action, pending] = useActionState<ActionState<{ publicCode: string }>, FormData>(submitInquiryAction, null)
  const name = useText(); const email = useText(); const tel2 = useText(); const relationship = useText(); const first = useText(); const last = useText(); const setting = useText(); const message = useText()
  if (state?.ok) {
    return (
      <Received title="Thank you. Your message is with our team." code={state.data?.publicCode}>
        <p>We will be in touch at {tel2.value || email.value}.{phone ? <> If it is urgent, call <a href={tel}>{phone}</a>.</> : null}</p>
        <p><Link href={`/${slug}/tour`}>Schedule a tour</Link> while you wait.</p>
      </Received>
    )
  }
  return (
    <form className="sf-card sf-form" action={action}>
      <input type="hidden" name="community" value={slug} />
      <Honeypot />
      <div className="sf-fields is-full">
        <label className="sf-field"><span>Your name</span><input name="name" {...name} placeholder="Full name" autoComplete="name" required maxLength={120} /></label>
        <label className="sf-field"><span>Phone number</span><input name="phone" type="tel" inputMode="tel" {...tel2} autoComplete="tel" maxLength={40} placeholder={phone || '(555) 555-0100'} /></label>
        <label className="sf-field"><span>Email</span><input name="email" type="email" {...email} autoComplete="email" maxLength={200} placeholder="you@example.com" /></label>
        <label className="sf-field"><span>Your relationship <small>(optional)</small></span><input name="relationship" {...relationship} maxLength={80} placeholder="Daughter, spouse, myself" /></label>
        <label className="sf-field"><span>Who is this for? <small>(optional)</small></span><input name="forWhomFirstName" {...first} maxLength={80} placeholder="First name" /></label>
        <label className="sf-field"><span>Their last name <small>(optional)</small></span><input name="forWhomLastName" {...last} maxLength={80} placeholder="Last name" /></label>
        {settings.length ? (
          <label className="sf-field sf-field-wide"><span>What are you looking for? <small>(optional)</small></span>
            <select name="setting" {...setting}><option value="">Not sure yet</option>{settings.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          </label>
        ) : null}
        <label className="sf-field sf-field-wide"><span>Your question</span><textarea name="message" {...message} rows={5} maxLength={4000} placeholder="Tell us a little about what you need" /></label>
      </div>
      <p className="sf-small">Leave a phone number or an email address, whichever you prefer.</p>
      <Consent text="You may contact me about my question." />
      {state && !state.ok ? <p className="sf-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="sf-btn sf-btn-lg" disabled={pending}>{pending ? 'Sending…' : 'Send my question'}</button>
    </form>
  )
}

/** Joins the waitlist for a kind of care or an apartment type. */
export function WaitlistForm({ slug, settings, apartmentTypes, initialSetting, initialType, phone, tel }: { slug: string; settings: Option[]; apartmentTypes: (Option & { setting: string | null })[]; initialSetting: string; initialType: string; phone: string; tel: string }) {
  const [state, action, pending] = useActionState<ActionState<{ publicCode: string }>, FormData>(joinWaitlistAction, null)
  const [setting, setSetting] = useState(initialSetting || settings[0]?.value || '')
  const [type, setType] = useState(initialType)
  const name = useText(); const email = useText(); const tel2 = useText(); const first = useText(); const last = useText(); const moveIn = useText()
  const types = apartmentTypes.filter(option => !option.setting || option.setting === setting)
  if (state?.ok) {
    return (
      <Received title="You are on the waitlist." code={state.data?.publicCode}>
        <p>We will call {tel2.value || 'you'}{tel2.value && email.value ? ' or write to ' + email.value : !tel2.value && email.value ? ' at ' + email.value : ''} when a place opens.{phone ? <> You can always reach us at <a href={tel}>{phone}</a>.</> : null}</p>
      </Received>
    )
  }
  return (
    <form className="sf-card sf-form" action={action}>
      <input type="hidden" name="community" value={slug} />
      <Honeypot />
      <div className="sf-fields is-full">
        <label className="sf-field"><span>Kind of care</span>
          <select name="setting" value={setting} onChange={event => { setSetting(event.target.value); setType('') }} required>{settings.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        </label>
        <label className="sf-field"><span>Apartment <small>(optional)</small></span>
          <select name="apartmentTypeId" value={types.some(option => option.value === type) ? type : ''} onChange={event => setType(event.target.value)}><option value="">Any</option>{types.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        </label>
        <label className="sf-field"><span>Your name</span><input name="name" {...name} placeholder="Full name" autoComplete="name" required maxLength={120} /></label>
        <label className="sf-field"><span>Phone number</span><input name="phone" type="tel" inputMode="tel" {...tel2} autoComplete="tel" maxLength={40} placeholder={phone || '(555) 555-0100'} /></label>
        <label className="sf-field"><span>Email</span><input name="email" type="email" {...email} autoComplete="email" maxLength={200} placeholder="you@example.com" /></label>
        <label className="sf-field"><span>Hoped-for move-in <small>(optional)</small></span><input name="desiredMoveIn" type="date" {...moveIn} /></label>
        <label className="sf-field"><span>Who is moving? <small>(optional)</small></span><input name="forWhomFirstName" {...first} maxLength={80} placeholder="First name" /></label>
        <label className="sf-field"><span>Their last name <small>(optional)</small></span><input name="forWhomLastName" {...last} maxLength={80} placeholder="Last name" /></label>
      </div>
      <p className="sf-small">Leave a phone number or an email address, whichever you prefer.</p>
      <Consent text="You may contact me when a place opens." />
      {state && !state.ok ? <p className="sf-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="sf-btn sf-btn-lg" disabled={pending}>{pending ? 'Adding you…' : 'Join the waitlist'}</button>
    </form>
  )
}

export function CancelTourForm({ slug, token }: { slug: string; token: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(cancelTourAction, null)
  const reason = useText()
  if (state?.ok) {
    return (
      <Received title="Your tour is cancelled.">
        <p>The time is open again for another family. When you are ready, <Link href={`/${slug}/tour`}>choose a new time</Link>.</p>
      </Received>
    )
  }
  return (
    <form className="sf-card sf-form" action={action}>
      <input type="hidden" name="community" value={slug} />
      <input type="hidden" name="token" value={token} />
      <label className="sf-field"><span>Would you tell us why? <small>(optional)</small></span><textarea name="reason" {...reason} rows={3} maxLength={500} /></label>
      {state && !state.ok ? <p className="sf-error" role="alert">{state.error}</p> : null}
      <div className="sf-actions">
        <button type="submit" className="sf-btn sf-btn-lg" disabled={pending}>{pending ? 'Cancelling…' : 'Cancel my tour'}</button>
        <Link className="sf-btn sf-btn-quiet" href={`/${slug}`}>Keep my tour</Link>
      </div>
    </form>
  )
}

export function FamilySignInForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(familySignInAction, null)
  const email = useText()
  return (
    <form className="sf-card sf-form" action={action}>
      <input type="hidden" name="community" value={slug} />
      <label className="sf-field"><span>Email</span><input name="email" type="email" {...email} autoComplete="username" required maxLength={200} placeholder="you@example.com" /></label>
      <label className="sf-field"><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
      {state && !state.ok ? <p className="sf-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="sf-btn sf-btn-lg sf-btn-block" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  )
}

export function AcceptInvitationForm({ slug, token }: { slug: string; token: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acceptInvitationAction, null)
  if (state?.ok) {
    return (
      <Received title="Your family account is ready.">
        <p>Sign in with your email address and the password you just chose.</p>
        <p><Link className="sf-btn" href={`/${slug}/family/sign-in`}>Sign in</Link></p>
      </Received>
    )
  }
  return (
    <form className="sf-card sf-form" action={action}>
      <input type="hidden" name="token" value={token} />
      <label className="sf-field"><span>Choose a password</span><input name="password" type="password" autoComplete="new-password" required minLength={12} /></label>
      <label className="sf-field"><span>Type it again</span><input name="passwordAgain" type="password" autoComplete="new-password" required minLength={12} /></label>
      <p className="sf-small">At least 12 characters. A short sentence you will remember works well.</p>
      {state && !state.ok ? <p className="sf-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="sf-btn sf-btn-lg sf-btn-block" disabled={pending}>{pending ? 'Saving…' : 'Create my account'}</button>
    </form>
  )
}

/** Pays a statement with a payment method the business office has saved for the resident. */
export function PayStatementForm({ slug, residentId, statementId, statementNumber, balance, methods, payKey, instalment }: {
  slug: string; residentId: string; statementId: string; statementNumber: string; balance: string
  methods: { id: string; label: string }[]
  /** Made once per page load, so pressing the button twice pays once. */
  payKey: string
  /** A statement on a payment plan is paid one instalment at a time, for the instalment's amount. */
  instalment: string | null
}) {
  const [state, action, pending] = useActionState<ActionState<Paid>, FormData>(portalPayAction, null)
  const [method, setMethod] = useState(methods[0]?.id ?? '')
  const amount = useText(balance)
  if (state?.ok) return <p className="sf-ok" role="status">Thank you. Your payment on statement {statementNumber} went through.</p>
  return (
    <form className="sf-pay" action={action}>
      <input type="hidden" name="community" value={slug} />
      <input type="hidden" name="residentId" value={residentId} />
      <input type="hidden" name="statementId" value={statementId} />
      <input type="hidden" name="idempotencyKey" value={`${payKey}-${statementId}`.slice(0, 120)} />
      <label className="sf-field"><span>Pay with</span>
        <select name="tokenId" value={method} onChange={event => setMethod(event.target.value)} required>{methods.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
      </label>
      {instalment ? <p className="sf-small">This statement is on a payment plan. This pays the next instalment of {instalment}.</p> : (
        <label className="sf-field"><span>Amount (USD)</span><input name="amount" inputMode="decimal" {...amount} required /></label>
      )}
      {state && !state.ok ? <p className="sf-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="sf-btn" disabled={pending || !method}>{pending ? 'Paying…' : instalment ? `Pay ${instalment}` : 'Pay now'}</button>
    </form>
  )
}
