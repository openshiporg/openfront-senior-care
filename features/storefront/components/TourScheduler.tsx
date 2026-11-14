'use client'

import Link from 'next/link'
import { useActionState, useId, useState } from 'react'
import { requestTourAction, type ActionState, type TourBooked } from '../actions'
import { CalendarIcon, LeafTwig, VideoIcon, WalkIcon } from './Chrome'

export type SchedulerSlot = { id: string; kind: 'in_person' | 'virtual' | 'either'; label: string; day: string; time: string }
type Kind = 'in_person' | 'virtual'

const matches = (slot: SchedulerSlot, kind: Kind) => slot.kind === 'either' || slot.kind === kind

/** "10:42 AM ET" in the community's time zone, for the moment a held time is released. */
function holdClock(value: string | null | undefined, timeZone: string) {
  if (!value) return ''
  try {
    const parts: Record<string, string> = {}
    for (const part of new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'shortGeneric' }).formatToParts(new Date(value))) parts[part.type] = part.value
    return `${parts.hour}:${parts.minute} ${parts.dayPeriod} ${parts.timeZoneName ?? ''}`.trim()
  } catch {
    return ''
  }
}

/**
 * The tour scheduler: in person or by video, an open time, a name and a phone number. It books through
 * `requestTour`, which holds the time and puts the request in front of the sales team.
 */
export function TourScheduler({ slug, slots, phone, tel, bookingEnabled, timeZone, limit, full = false, heading = 'h2' }: {
  slug: string; slots: SchedulerSlot[]; phone: string; tel: string; bookingEnabled: boolean; timeZone: string
  /** Show only the next few times (the home page); the rest are one tap away. */
  limit?: number
  /** The tour page also takes an email address and a note. */
  full?: boolean
  heading?: 'h1' | 'h2'
}) {
  const base = `/${slug}`
  const first: Kind = slots.some(slot => matches(slot, 'in_person')) || !slots.some(slot => matches(slot, 'virtual')) ? 'in_person' : 'virtual'
  const [kind, setKind] = useState<Kind>(first)
  const [picked, setPicked] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [consent, setConsent] = useState(false)
  // The chosen time is remembered here: once it is held it may no longer be in the list of open times.
  const [requested, setRequested] = useState('')
  const [state, formAction, pending] = useActionState<ActionState<TourBooked>, FormData>(requestTourAction, null)
  const timesId = useId()

  const forKind = slots.filter(slot => matches(slot, kind))
  const visible = limit ? forKind.slice(0, limit) : forKind
  const selected = visible.find(slot => slot.id === picked)?.id ?? visible[0]?.id ?? ''
  const Heading = heading

  const head = (
    <div className="sf-sched-head">
      <CalendarIcon className="sf-sched-cal sf-only-phone" />
      <div>
        <Heading className="sf-sched-title">Schedule a tour</Heading>
        <p className="sf-sched-sub">See our community, meet our team, and get your questions answered.</p>
      </div>
    </div>
  )

  if (state?.ok && state.data) {
    const heldUntil = holdClock(state.data.holdExpiresAt, timeZone)
    return (
      <div className="sf-sched" aria-live="polite">
        <LeafTwig className="sf-sched-leaf" />
        <div className="sf-sched-head">
          <CalendarIcon className="sf-sched-cal sf-only-phone" />
          <div>
            <Heading className="sf-sched-title">Your tour request is in</Heading>
            <p className="sf-sched-sub">Thank you{name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : ''}. We are holding this time for you, and a member of our team will call {contactPhone || 'you'} to confirm it.</p>
          </div>
        </div>
        <dl className="sf-receipt">
          {requested ? <div><dt>When</dt><dd>{requested}</dd></div> : null}
          <div><dt>How</dt><dd>{state.data.kind === 'virtual' ? 'By video' : 'In person'}</dd></div>
          {heldUntil ? <div><dt>Held for you until</dt><dd>{heldUntil}</dd></div> : null}
          <div><dt>Your reference</dt><dd>{state.data.publicCode}</dd></div>
        </dl>
        {phone ? <p className="sf-small">We confirm every tour by phone. If you have not heard from us by then, call <a href={tel}>{phone}</a> and we will set it up with you.</p> : null}
        <p className="sf-small">Plans changed? <Link href={`${base}/tour/manage?token=${encodeURIComponent(state.data.manageToken)}`}>Cancel this tour</Link>. Keep this link: it is the only way to cancel online.</p>
      </div>
    )
  }

  if (!bookingEnabled || !slots.length) {
    return (
      <div className="sf-sched">
        <LeafTwig className="sf-sched-leaf" />
        {head}
        <p className="sf-sched-empty">{bookingEnabled ? 'Every tour time on the calendar is taken right now.' : 'We arrange tours by phone.'} {phone ? 'Call us and we will find a time that suits you.' : 'Leave us a message and we will find a time that suits you.'}</p>
        {phone ? <a className="sf-btn sf-btn-lg sf-btn-block" href={tel}>Call {phone}</a> : null}
        <Link className="sf-btn sf-btn-quiet sf-btn-block" href={`${base}/contact`}>Leave a message</Link>
      </div>
    )
  }

  return (
    <form className="sf-sched" action={formAction} onSubmit={() => setRequested(visible.find(slot => slot.id === selected)?.label ?? '')}>
      <LeafTwig className="sf-sched-leaf" />
      {head}
      <input type="hidden" name="community" value={slug} />
      <input type="hidden" name="kind" value={kind} />
      <div className="sf-seg" role="radiogroup" aria-label="How would you like to tour?">
        <button type="button" role="radio" aria-checked={kind === 'in_person'} className={kind === 'in_person' ? 'is-on' : ''} onClick={() => { setKind('in_person'); setPicked(null) }}><WalkIcon className="sf-ico sf-only-phone" />In person</button>
        <button type="button" role="radio" aria-checked={kind === 'virtual'} className={kind === 'virtual' ? 'is-on' : ''} onClick={() => { setKind('virtual'); setPicked(null) }}><VideoIcon className="sf-ico sf-only-phone" />By video</button>
      </div>

      <div className="sf-slots" role="radiogroup" aria-labelledby={timesId}>
        <div className="sf-slots-head">
          <span id={timesId} className="sf-slots-title">Choose a tour time</span>
          {limit && forKind.length > visible.length ? <Link className="sf-more" href={`${base}/tour`}>See all {forKind.length} open times</Link> : null}
        </div>
        {visible.length ? visible.map(slot => (
          <label key={slot.id} className={`sf-slot${selected === slot.id ? ' is-on' : ''}`}>
            <input type="radio" name="slotId" value={slot.id} checked={selected === slot.id} onChange={() => setPicked(slot.id)} />
            <span>{slot.label}</span>
          </label>
        )) : (
          <p className="sf-sched-empty">No {kind === 'virtual' ? 'video' : 'in-person'} times are open right now. Try {kind === 'virtual' ? 'in person' : 'by video'}{phone ? <>, or call <a href={tel}>{phone}</a></> : null}.</p>
        )}
      </div>

      <div className={`sf-fields${full ? ' is-full' : ''}`}>
        <label className="sf-field"><span>Your name</span><input name="name" value={name} onChange={event => setName(event.target.value)} placeholder="Full name" autoComplete="name" required maxLength={120} /></label>
        <label className="sf-field"><span>Phone number</span><input name="phone" type="tel" inputMode="tel" value={contactPhone} onChange={event => setContactPhone(event.target.value)} placeholder={phone || '(555) 555-0100'} autoComplete="tel" required maxLength={40} /></label>
        {full ? (
          <>
            <label className="sf-field"><span>Email <small>(optional)</small></span><input name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" maxLength={200} /></label>
            <label className="sf-field sf-field-wide"><span>Anything we should know? <small>(optional)</small></span><textarea name="notes" value={notes} onChange={event => setNotes(event.target.value)} rows={3} maxLength={2000} placeholder="Who the tour is for, what matters most, accessibility needs" /></label>
          </>
        ) : null}
      </div>

      <label className="sf-consent">
        <input type="checkbox" name="consent" checked={consent} onChange={event => setConsent(event.target.checked)} required />
        <span>You may call or text me about this tour.</span>
      </label>

      {state && !state.ok ? <p className="sf-error" role="alert">{state.error}</p> : null}

      <button type="submit" className="sf-btn sf-btn-lg sf-btn-block" disabled={pending || !selected}>
        <CalendarIcon className="sf-ico sf-only-phone" />
        {pending ? 'Scheduling…' : <><span className="sf-only-desk">Schedule a tour</span><span className="sf-only-phone">Schedule my tour</span></>}
      </button>
    </form>
  )
}
