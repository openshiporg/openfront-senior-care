'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

/**
 * The only custom operations the dashboard screens can call. Each takes an idempotency key that the
 * client makes once per intent and reuses on retry, so a lost response never acts twice.
 */
const OPS: Record<string, Record<string, string>> = {
  refreshTimedStates: {},
  loadClinicalSetup: {},
  loadBillingSetup: {},
  loadWorkforceSetup: {},
  loadMdsSetup: {},
  decideApprovalRequest: { requestId: 'ID!', decision: 'String!', reason: 'String', expectedVersion: 'Int!' },
  cancelApprovalRequest: { requestId: 'ID!', expectedVersion: 'Int!', reason: 'String' },
  requestOperatorControls: { changes: 'JSON!', reason: 'String!' },
  admitResident: { input: 'JSON!' },
  changeRoom: { stayId: 'ID!', toBedId: 'ID', toApartmentId: 'ID', effectiveAt: 'String!', reason: 'String', companionRelationship: 'String', reservationId: 'ID', expectedVersion: 'Int' },
  startLeave: { stayId: 'ID!', leaveKind: 'String!', holdElected: 'Boolean!', holdPaidBy: 'String', facilityInitiated: 'Boolean!', effectiveAt: 'String!', destination: 'String', noticeAtTransfer: 'JSON', expectedVersion: 'Int' },
  releaseBedHold: { stayId: 'ID!', effectiveAt: 'String!', reason: 'String!', expectedVersion: 'Int' },
  endLeave: { stayId: 'ID!', effectiveAt: 'String!', toBedId: 'ID', toApartmentId: 'ID', reservationId: 'ID', expectedVersion: 'Int' },
  dischargeResident: { stayId: 'ID!', disposition: 'String!', initiatedBy: 'String!', effectiveAt: 'String!', noticeException: 'String', expectedVersion: 'Int' },
  recordDeath: { stayId: 'ID!', effectiveAt: 'String!', pronouncedBy: 'String!', expectedVersion: 'Int' },
  recordNotice: { input: 'JSON!' },
  correctCensus: { input: 'JSON!' },
  snapshotCensusDay: { communityId: 'ID!', date: 'String!' },
  signOffCensusDay: { communityId: 'ID!', date: 'String!', note: 'String' },
  reservePlace: { bedId: 'ID', apartmentId: 'ID', hours: 'Int!', purpose: 'String!', prospectId: 'ID', referralId: 'ID', waitlistEntryId: 'ID' },
  releaseReservation: { reservationId: 'ID!', reason: 'String', expectedVersion: 'Int' },
  markPlaceReady: { bedId: 'ID', apartmentId: 'ID', note: 'String', expectedVersion: 'Int' },
  setPlaceService: { bedId: 'ID', apartmentId: 'ID', inService: 'Boolean!', reason: 'String!', expectedVersion: 'Int' },
  recomputeAvailability: { communityId: 'ID!' },
  recordInquiry: { input: 'JSON!' },
  moveLead: { leadId: 'ID!', to: 'String!', lostReason: 'String', note: 'String', expectedVersion: 'Int!' },
  logSalesActivity: { leadId: 'ID!', kind: 'String!', summary: 'String!' },
  moveTour: { tourId: 'ID!', to: 'String!', reason: 'String', expectedVersion: 'Int!' },
  moveReferral: { referralId: 'ID!', to: 'String!', declineReason: 'String', bedId: 'ID', reservationHours: 'Int', expectedVersion: 'Int!' },
  addToWaitlist: { communityId: 'ID!', leadId: 'ID', prospectId: 'ID', apartmentTypeId: 'ID', setting: 'String!', priorityReason: 'String' },
  offerWaitlistPlace: { waitlistEntryId: 'ID!', apartmentId: 'ID', bedId: 'ID', hours: 'Int!', expectedVersion: 'Int!' },
  resolveWaitlistOffer: { waitlistEntryId: 'ID!', to: 'String!', expectedVersion: 'Int!' },
  recordAdmissionAgreement: { stayId: 'ID!', signedAt: 'String!', signedByRepresentativeId: 'ID', note: 'String' },
  recordReferral: { input: 'JSON!' },
  openTourSlots: { communityId: 'ID!', slots: 'JSON!' },
  scheduleTour: { leadId: 'ID!', slotId: 'ID!', kind: 'String!', notes: 'String' },
  setStorefrontPublished: { communityId: 'ID!', published: 'Boolean!' },
  movePublishedPrice: { priceId: 'ID!', to: 'String!', expectedVersion: 'Int!' },
  invitePortalRepresentative: { representativeId: 'ID!' },
  proposePortalScope: { representativeId: 'ID!', scope: 'String!' },
  grantPortalScope: { grantId: 'ID!', expectedVersion: 'Int' },
  revokePortalScope: { grantId: 'ID!', reason: 'String!', expectedVersion: 'Int' },
  openBreakGlass: { residentId: 'ID!', reason: 'String!', note: 'String!', hours: 'Int' },
  endBreakGlass: { grantId: 'ID!' },
  reviewBreakGlass: { grantId: 'ID!', outcome: 'String!', note: 'String!', expectedVersion: 'Int' },
  clinicalCommand: { op: 'String!', input: 'JSON' },
  billingCommand: { op: 'String!', input: 'JSON' },
  runWorkflowsOnLoad: { communityId: 'ID!' },
};

const KEY = /^[A-Za-z0-9._:-]{8,200}$/;

export async function runCommand(op: string, variables: Record<string, unknown>, idempotencyKey: string, paths: string[] = []) {
  const spec = OPS[op];
  if (!spec) return { ok: false as const, error: 'Unknown action' };
  if (!KEY.test(idempotencyKey)) return { ok: false as const, error: 'Missing request key. Reload the page and try again.' };
  const keys = Object.keys(variables).filter((k) => k in spec && variables[k] !== undefined && variables[k] !== '' && variables[k] !== null);
  const decl = [...keys.map((k) => `$${k}: ${spec[k]}`), '$idempotencyKey: String!'];
  const args = [...keys.map((k) => `${k}: $${k}`), 'idempotencyKey: $idempotencyKey'];
  const vars: Record<string, unknown> = { ...Object.fromEntries(keys.map((k) => [k, variables[k]])), idempotencyKey };
  const res = await keystoneClient(`mutation Run(${decl.join(', ')}) { ${op}(${args.join(', ')}) }`, vars);
  if (!res.success) return { ok: false as const, error: res.error || 'Action failed' };
  for (const p of paths) revalidatePath(p);
  return { ok: true as const, data: (res.data as Record<string, unknown>)?.[op] };
}
