'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { storefrontGraphQL } from './lib/graphql'
import { removeAuthToken } from '@/features/dashboard/lib/cookies'

/**
 * Everything a visitor or a family member can do from the storefront. Each action calls the same
 * public GraphQL operation the backend exposes (requestTour, submitInquiry, joinWaitlist,
 * cancelTourByToken, acceptPortalInvitation, portalPay); nothing is decided here.
 */

export type ActionState<T = Record<string, unknown>> = { ok: boolean; error?: string; data?: T } | null

const field = (form: FormData, name: string, max = 4000) => String(form.get(name) ?? '').trim().slice(0, max)
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/i
const TRY_AGAIN = 'Something went wrong on our side. Please try again, or call us.'

async function mutate<T>(query: string, variables: Record<string, unknown>, name: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const result = await storefrontGraphQL<Record<string, T>>(query, variables)
  return result.ok ? { ok: true, data: result.data[name] } : { ok: false, error: result.error }
}

export type TourBooked = { publicCode: string; manageToken: string; holdExpiresAt: string; slotId: string; kind: 'in_person' | 'virtual' }

export async function requestTourAction(_: ActionState<TourBooked>, form: FormData): Promise<ActionState<TourBooked>> {
  const communitySlug = field(form, 'community', 120)
  const slotId = field(form, 'slotId', 80)
  const kind = field(form, 'kind', 20) === 'virtual' ? 'virtual' : 'in_person'
  if (!SLUG.test(communitySlug)) return { ok: false, error: TRY_AGAIN }
  if (!slotId) return { ok: false, error: 'Choose a tour time.' }
  const input = {
    communitySlug, slotId, kind,
    contactName: field(form, 'name', 120), contactPhone: field(form, 'phone', 40), contactEmail: field(form, 'email', 200),
    notes: field(form, 'notes', 2000), consentToContact: form.get('consent') === 'on',
  }
  const result = await mutate<{ publicCode: string; manageToken: string; holdExpiresAt: string }>(`mutation Tour($input: JSON!) { requestTour(input: $input) }`, { input }, 'requestTour')
  if (!result.ok) return { ok: false, error: result.error }
  // The open times changed: the community's pages, and the home page when it is served at the root, read them again.
  revalidatePath(`/${communitySlug}`, 'layout')
  revalidatePath('/')
  return { ok: true, data: { ...result.data, slotId, kind } }
}

export async function cancelTourAction(_: ActionState, form: FormData): Promise<ActionState> {
  const token = field(form, 'token', 2000)
  if (!token) return { ok: false, error: 'This link is invalid or has expired.' }
  const result = await mutate<{ status: string }>(`mutation Cancel($token: String!, $reason: String) { cancelTourByToken(token: $token, reason: $reason) }`, { token, reason: field(form, 'reason', 500) || null }, 'cancelTourByToken')
  if (!result.ok) return { ok: false, error: result.error }
  const slug = field(form, 'community', 120)
  if (SLUG.test(slug)) revalidatePath(`/${slug}`, 'layout')
  revalidatePath('/')
  return { ok: true, data: result.data }
}

function inquiryInput(form: FormData) {
  return {
    communitySlug: field(form, 'community', 120),
    contactName: field(form, 'name', 120), contactEmail: field(form, 'email', 200), contactPhone: field(form, 'phone', 40),
    relationship: field(form, 'relationship', 80), message: field(form, 'message', 4000),
    forWhomFirstName: field(form, 'forWhomFirstName', 80), forWhomLastName: field(form, 'forWhomLastName', 80),
    desiredSetting: field(form, 'setting', 40) || null,
    consentToContact: form.get('consent') === 'on',
    // Left empty by people; the backend quietly drops anything that fills it.
    website: field(form, 'leave_blank', 200),
  }
}

export async function submitInquiryAction(_: ActionState<{ publicCode: string }>, form: FormData): Promise<ActionState<{ publicCode: string }>> {
  const input = inquiryInput(form)
  if (!SLUG.test(input.communitySlug)) return { ok: false, error: TRY_AGAIN }
  const result = await mutate<{ publicCode: string }>(`mutation Inquiry($input: JSON!) { submitInquiry(input: $input) }`, { input }, 'submitInquiry')
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
}

export async function joinWaitlistAction(_: ActionState<{ publicCode: string }>, form: FormData): Promise<ActionState<{ publicCode: string }>> {
  const base = inquiryInput(form)
  if (!SLUG.test(base.communitySlug)) return { ok: false, error: TRY_AGAIN }
  const input = { ...base, setting: field(form, 'setting', 40), apartmentTypeId: field(form, 'apartmentTypeId', 80) || null, desiredMoveIn: field(form, 'desiredMoveIn', 10) || null }
  const result = await mutate<{ publicCode: string }>(`mutation Waitlist($input: JSON!) { joinWaitlist(input: $input) }`, { input }, 'joinWaitlist')
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
}

/* ------------------------------------------------------------------ family portal */

const SIGN_IN_ERROR = 'We could not sign you in. Check your email and password and try again.'

async function startSession(email: string, password: string): Promise<boolean> {
  const response = await storefrontGraphQL<{ authenticate: { sessionToken?: string; message?: string } | null }>(`mutation SignIn($email: String!, $password: String!) {
    authenticate: authenticateUserWithPassword(email: $email, password: $password) {
      ... on UserAuthenticationWithPasswordSuccess { sessionToken }
      ... on UserAuthenticationWithPasswordFailure { message }
    }
  }`, { email, password })
  const token = response.ok ? response.data?.authenticate?.sessionToken : null
  if (!token) return false
  const cookieStore = await cookies()
  cookieStore.set('keystonejs-session', token, { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', httpOnly: true, maxAge: 60 * 60 * 24 * 30 })
  return true
}

export async function familySignInAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = field(form, 'community', 120)
  const email = field(form, 'email', 200).toLowerCase()
  const password = String(form.get('password') ?? '')
  if (!email || !password) return { ok: false, error: 'Enter your email address and password.' }
  if (!(await startSession(email, password))) return { ok: false, error: SIGN_IN_ERROR }
  // The family page decides what a signed-in person sees; a staff account is pointed to the staff workspace there.
  redirect(SLUG.test(slug) ? `/${slug}/family` : '/')
}

export async function familySignOutAction(form: FormData) {
  const slug = field(form, 'community', 120)
  await storefrontGraphQL('mutation { endSession }')
  await removeAuthToken()
  redirect(SLUG.test(slug) ? `/${slug}/family/sign-in` : '/')
}

/** The invited family member chooses a password. The account becomes active and they sign in with it. */
export async function acceptInvitationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const token = field(form, 'token', 2000)
  const password = String(form.get('password') ?? '')
  const again = String(form.get('passwordAgain') ?? '')
  if (!token) return { ok: false, error: 'This invitation link is invalid or has expired.' }
  if (password.length < 12) return { ok: false, error: 'Use at least 12 characters.' }
  if (password !== again) return { ok: false, error: 'The two passwords do not match.' }
  const result = await mutate<{ status: string }>(`mutation Accept($token: String!, $password: String!) { acceptPortalInvitation(token: $token, password: $password) }`, { token, password }, 'acceptPortalInvitation')
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }
}

export type Paid = { paymentId: string; status: string; message?: string }

/** Pays an issued statement with a payment method already saved for the resident: the same card and bank path the business office uses. */
export async function portalPayAction(_: ActionState<Paid>, form: FormData): Promise<ActionState<Paid>> {
  const slug = field(form, 'community', 120)
  const residentId = field(form, 'residentId', 80)
  const statementId = field(form, 'statementId', 80)
  const tokenId = field(form, 'tokenId', 80)
  const idempotencyKey = field(form, 'idempotencyKey', 120)
  const amount = field(form, 'amount', 20).replace(/[$,\s]/g, '')
  if (!tokenId) return { ok: false, error: 'Choose a saved payment method.' }
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) return { ok: false, error: 'Reload the page and try again.' }
  let amountMinor: string | null = null
  if (amount) {
    const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(amount)
    if (!match) return { ok: false, error: 'Enter the amount in dollars and cents, like 250.00.' }
    amountMinor = String(BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0'))
  }
  const result = await mutate<Paid>(
    `mutation Pay($residentId: ID!, $statementId: ID!, $tokenId: ID!, $amountMinor: String, $idempotencyKey: String!) { portalPay(residentId: $residentId, statementId: $statementId, tokenId: $tokenId, amountMinor: $amountMinor, idempotencyKey: $idempotencyKey) }`,
    { residentId, statementId, tokenId, amountMinor, idempotencyKey }, 'portalPay',
  )
  if (!result.ok) return { ok: false, error: result.error }
  if (SLUG.test(slug)) revalidatePath(`/${slug}/family/${residentId}`)
  if (result.data?.status === 'failed') return { ok: false, error: result.data.message || 'The payment was declined. Please call the business office.' }
  return { ok: true, data: result.data }
}
