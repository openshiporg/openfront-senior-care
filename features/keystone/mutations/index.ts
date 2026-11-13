import { mergeSchemas } from '@graphql-tools/schema'
import type { GraphQLSchema } from 'graphql'
import redirectToInit from './redirectToInit'
import updateActiveUser from './updateActiveUser'
import { op } from './op'
import * as setup from './setup'
import * as audit from './audit'
import * as approvals from './approvals'
import * as census from './census'
import * as front from './frontOfHouse'
import * as reads from './reads'
import * as clinical from './clinical'
import * as billing from './billing'
import * as workflowReads from './workflowReads'
import '../lib/operatorControls'
import '../lib/censusCorrection'

const graphql = String.raw

// Every domain resolver checks permission (and community assignment) itself and runs as one
// idempotent command: the state change, audit events and clocks commit in one
// transaction (features/keystone/lib). Census commands run at Serializable isolation.
export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      scalar JSON
      type Query {
        redirectToInit: Boolean
        verifyAuditChain: JSON
        verifyStay(stayId: ID!): JSON
        censusSummary(communityId: ID!, date: String): JSON
        bedBoard(communityId: ID!, unitId: ID): JSON
        residentRoster(communityId: ID!, status: String): JSON
        storefrontCommunity(slug: String!): JSON
        portalMe: JSON
        portalUpdates(residentId: ID!): JSON
        portalCalendar(residentId: ID!): JSON
        portalDocuments(residentId: ID!): JSON
        portalStatements(residentId: ID!): JSON
        portalTrustBalance(residentId: ID!): JSON
        portalPayments(residentId: ID!): JSON
        listBlockTypes: JSON
        getBlockType(code: String!): JSON
        listWorkflows(communityId: ID!): JSON
        getWorkflowVersion(versionId: ID!): JSON
        getWorkflowRun(runId: ID!): JSON
        listFindings(communityId: ID!, status: String): JSON
        getFinding(findingId: ID!): JSON
      }
      input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String }
      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        loadOperatorSetup(idempotencyKey: String!): JSON
        loadCensusSetup(idempotencyKey: String!): JSON
        loadClinicalSetup(idempotencyKey: String!): JSON
        loadBillingSetup(idempotencyKey: String!): JSON
        loadMdsSetup(idempotencyKey: String!): JSON
        refreshTimedStates(idempotencyKey: String!): JSON
        decideApprovalRequest(requestId: ID!, decision: String!, reason: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        cancelApprovalRequest(requestId: ID!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        requestOperatorControls(changes: JSON!, reason: String!, idempotencyKey: String!): JSON

        admitResident(input: JSON!, idempotencyKey: String!): JSON
        changeRoom(stayId: ID!, toBedId: ID, toApartmentId: ID, effectiveAt: String!, observedAt: String, reason: String, companionRelationship: String, reservationId: ID, expectedVersion: Int, idempotencyKey: String!): JSON
        startLeave(stayId: ID!, leaveKind: String!, holdElected: Boolean!, holdPaidBy: String, facilityInitiated: Boolean!, effectiveAt: String!, observedAt: String, destination: String, noticeAtTransfer: JSON, expectedVersion: Int, idempotencyKey: String!): JSON
        releaseBedHold(stayId: ID!, effectiveAt: String!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        endLeave(stayId: ID!, effectiveAt: String!, observedAt: String, toBedId: ID, toApartmentId: ID, reservationId: ID, expectedVersion: Int, idempotencyKey: String!): JSON
        dischargeResident(stayId: ID!, disposition: String!, initiatedBy: String!, effectiveAt: String!, observedAt: String, noticeException: String, expectedVersion: Int, idempotencyKey: String!): JSON
        recordDeath(stayId: ID!, effectiveAt: String!, pronouncedBy: String!, observedAt: String, expectedVersion: Int, idempotencyKey: String!): JSON
        recordNotice(input: JSON!, idempotencyKey: String!): JSON
        recordAdmissionAgreement(stayId: ID!, signedAt: String!, signedByRepresentativeId: ID, note: String, idempotencyKey: String!): JSON
        correctCensus(input: JSON!, idempotencyKey: String!): JSON
        snapshotCensusDay(communityId: ID!, date: String!, idempotencyKey: String!): JSON
        signOffCensusDay(communityId: ID!, date: String!, note: String, idempotencyKey: String!): JSON

        reservePlace(bedId: ID, apartmentId: ID, hours: Int!, purpose: String!, prospectId: ID, referralId: ID, waitlistEntryId: ID, idempotencyKey: String!): JSON
        releaseReservation(reservationId: ID!, reason: String, expectedVersion: Int, idempotencyKey: String!): JSON
        markPlaceReady(bedId: ID, apartmentId: ID, note: String, expectedVersion: Int, idempotencyKey: String!): JSON
        setPlaceService(bedId: ID, apartmentId: ID, inService: Boolean!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        recomputeAvailability(communityId: ID!, idempotencyKey: String!): JSON

        submitInquiry(input: JSON!): JSON
        requestTour(input: JSON!): JSON
        joinWaitlist(input: JSON!): JSON
        recordReferral(input: JSON!, idempotencyKey: String!): JSON
        openTourSlots(communityId: ID!, slots: JSON!, idempotencyKey: String!): JSON
        scheduleTour(leadId: ID!, slotId: ID!, kind: String!, notes: String, idempotencyKey: String!): JSON
        setStorefrontPublished(communityId: ID!, published: Boolean!, idempotencyKey: String!): JSON
        movePublishedPrice(priceId: ID!, to: String!, expectedVersion: Int!, idempotencyKey: String!): JSON
        cancelTourByToken(token: String!, reason: String): JSON
        acceptPortalInvitation(token: String!, password: String!): JSON
        recordInquiry(input: JSON!, idempotencyKey: String!): JSON
        moveLead(leadId: ID!, to: String!, lostReason: String, note: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        logSalesActivity(leadId: ID!, kind: String!, summary: String!, idempotencyKey: String!): JSON
        moveTour(tourId: ID!, to: String!, reason: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        moveReferral(referralId: ID!, to: String!, declineReason: String, bedId: ID, reservationHours: Int, expectedVersion: Int!, idempotencyKey: String!): JSON
        addToWaitlist(communityId: ID!, leadId: ID, prospectId: ID, apartmentTypeId: ID, setting: String!, priorityReason: String, idempotencyKey: String!): JSON
        offerWaitlistPlace(waitlistEntryId: ID!, apartmentId: ID, bedId: ID, hours: Int!, expectedVersion: Int!, idempotencyKey: String!): JSON
        resolveWaitlistOffer(waitlistEntryId: ID!, to: String!, expectedVersion: Int!, idempotencyKey: String!): JSON

        invitePortalRepresentative(representativeId: ID!, idempotencyKey: String!): JSON
        proposePortalScope(representativeId: ID!, scope: String!, consentDocumentId: ID, idempotencyKey: String!): JSON
        grantPortalScope(grantId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
        revokePortalScope(grantId: ID!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        setPortalAccountStatus(accountId: ID!, to: String!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON

        openBreakGlass(residentId: ID!, reason: String!, note: String!, hours: Int, idempotencyKey: String!): JSON
        endBreakGlass(grantId: ID!, idempotencyKey: String!): JSON
        reviewBreakGlass(grantId: ID!, outcome: String!, note: String!, expectedVersion: Int, idempotencyKey: String!): JSON

        clinicalCommand(op: String!, input: JSON, idempotencyKey: String!): JSON
        runWorkflowsOnLoad(communityId: ID!, idempotencyKey: String!): JSON
        billingCommand(op: String!, input: JSON, idempotencyKey: String!): JSON
        portalPay(residentId: ID!, statementId: ID!, tokenId: ID!, amountMinor: String, idempotencyKey: String!): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        verifyAuditChain: op(audit.verifyAuditChain),
        verifyStay: op(census.verifyStay),
        censusSummary: op(reads.censusSummary),
        bedBoard: op(reads.bedBoard),
        residentRoster: op(reads.residentRoster),
        storefrontCommunity: op(front.storefrontCommunityQuery),
        portalMe: op(front.portalMeQuery),
        portalUpdates: op(front.portalUpdatesQuery),
        portalCalendar: op(front.portalCalendarQuery),
        portalDocuments: op(front.portalDocumentsQuery),
        portalStatements: op(front.portalStatementsQuery),
        portalTrustBalance: op(front.portalTrustBalanceQuery),
        portalPayments: op(front.portalPaymentsQuery),
        listBlockTypes: op(workflowReads.listBlockTypes),
        getBlockType: op(workflowReads.getBlockType),
        listWorkflows: op(workflowReads.listWorkflows),
        getWorkflowVersion: op(workflowReads.getWorkflowVersion),
        getWorkflowRun: op(workflowReads.getWorkflowRun),
        listFindings: op(workflowReads.listFindings),
        getFinding: op(workflowReads.getFinding),
      },
      Mutation: {
        updateActiveUser,
        loadOperatorSetup: op(setup.loadOperatorSetup),
        loadCensusSetup: op(setup.loadCensusSetup),
        loadClinicalSetup: op(setup.loadClinicalSetup),
        loadBillingSetup: op(setup.loadBillingSetup),
        loadMdsSetup: op(setup.loadMdsSetup),
        refreshTimedStates: op(front.refreshTimedStatesMutation),
        decideApprovalRequest: op(approvals.decideApprovalRequest),
        cancelApprovalRequest: op(approvals.cancelApprovalRequest),
        requestOperatorControls: op(approvals.requestOperatorControls),

        admitResident: op(census.admitResidentMutation),
        changeRoom: op(census.changeRoomMutation),
        startLeave: op(census.startLeaveMutation),
        releaseBedHold: op(census.releaseBedHoldMutation),
        endLeave: op(census.endLeaveMutation),
        dischargeResident: op(census.dischargeResidentMutation),
        recordDeath: op(census.recordDeathMutation),
        recordNotice: op(census.recordNoticeMutation),
        recordAdmissionAgreement: op(census.recordAdmissionAgreementMutation),
        correctCensus: op(census.correctCensus),
        snapshotCensusDay: op(census.snapshotCensusDayMutation),
        signOffCensusDay: op(census.signOffCensusDayMutation),

        reservePlace: op(front.reservePlaceMutation),
        releaseReservation: op(front.releaseReservation),
        markPlaceReady: op(front.markPlaceReadyMutation),
        setPlaceService: op(front.setPlaceServiceMutation),
        recomputeAvailability: op(front.recomputeAvailabilityMutation),

        submitInquiry: op(front.submitInquiryMutation),
        requestTour: op(front.requestTourMutation),
        joinWaitlist: op(front.joinWaitlistMutation),
        recordReferral: op(front.recordReferralMutation),
        openTourSlots: op(front.openTourSlotsMutation),
        scheduleTour: op(front.scheduleTourMutation),
        setStorefrontPublished: op(front.setStorefrontPublishedMutation),
        movePublishedPrice: op(front.movePublishedPriceMutation),
        cancelTourByToken: op(front.cancelTourByToken),
        acceptPortalInvitation: op(front.acceptPortalInvitationMutation),
        recordInquiry: op(front.recordInquiryMutation),
        moveLead: op(front.moveLeadMutation),
        logSalesActivity: op(front.logSalesActivityMutation),
        moveTour: op(front.moveTourMutation),
        moveReferral: op(front.moveReferralMutation),
        addToWaitlist: op(front.addToWaitlistMutation),
        offerWaitlistPlace: op(front.offerWaitlistPlaceMutation),
        resolveWaitlistOffer: op(front.resolveWaitlistOfferMutation),

        invitePortalRepresentative: op(front.invitePortalRepresentative),
        proposePortalScope: op(front.proposePortalScopeMutation),
        grantPortalScope: op(front.grantPortalScopeMutation),
        revokePortalScope: op(front.revokePortalScopeMutation),
        setPortalAccountStatus: op(front.setPortalAccountStatusMutation),

        openBreakGlass: op(front.openBreakGlassMutation),
        endBreakGlass: op(front.endBreakGlassMutation),
        reviewBreakGlass: op(front.reviewBreakGlassMutation),

        clinicalCommand: op(clinical.clinicalCommand),
        runWorkflowsOnLoad: op(clinical.runWorkflowsOnLoad),
        billingCommand: op(billing.billingCommand),
        portalPay: op(front.portalPayMutation),
      },
    },
  })
}
