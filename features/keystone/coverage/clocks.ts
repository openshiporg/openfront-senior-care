import { nextReviewDue, noticeState } from './medicare'

/** Read-side clocks for the coverage screen: NOMNC, MA next review. */
export function coverageClocks(input: { lastCoveredDay: string | null; noticeOn: string | null; today: string; auth?: { authFrom: string | null; authTo: string | null; lastReviewOn: string | null; intervalDays: number; status: string } | null }) {
  return {
    notice: input.lastCoveredDay ? noticeState(input.lastCoveredDay, input.noticeOn, input.today) : null,
    nextReview: input.auth?.status === 'approved' && input.auth.authFrom && input.auth.authTo ? nextReviewDue({ authFrom: input.auth.authFrom, authTo: input.auth.authTo, lastReviewOn: input.auth.lastReviewOn, intervalDays: input.auth.intervalDays }) : null,
  }
}
