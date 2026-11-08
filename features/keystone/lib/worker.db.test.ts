import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx } from '../../../tests/helpers/sessions'
import { loadOperatorSetup } from '../mutations/setup'
import { COMMUNITY } from '../seed/operator'
import { systemActor } from './actor'
import { reservePlace } from './places'
import { runInTransaction } from './unitOfWork'
import { workerHealth, workerTick } from './worker'

/**
 * The background worker (scheduler + outbox): time-based states settle without anyone clicking,
 * every queued message is handled, nothing is handled twice, and /api/health can see the heartbeat.
 */

const HOUR = 3_600_000

describe.skipIf(!hasTestDatabase)('background worker (database)', () => {
  let prisma: PrismaClient

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    prisma = testPrisma(6)
    await resetDatabase(prisma)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@ridgelineseniorcommunities.com`, password: 'x'.repeat(60) } })
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, ctx(prisma, owner.id, ALL_DEFAULT))
  }, 300_000)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('reports never_ran before the first tick', async () => {
    expect(await workerHealth(prisma)).toMatchObject({ status: 'never_ran', lastTickAt: null })
  })

  it('expires a lapsed waitlist offer, releases the apartment, recounts availability and records a heartbeat', async () => {
    const apartment = await prisma.apartment.findFirstOrThrow({ where: { status: 'available', unit: { communityId: COMMUNITY.id } }, orderBy: { id: 'asc' } })
    const past = new Date(Date.now() - 4 * HOUR)
    const entry = await prisma.waitlistEntry.create({ data: { reference: uniqueKey('WL'), communityId: COMMUNITY.id, setting: 'assisted_living', status: 'active', version: 1 } })
    // The offer was made 4 hours ago for 2 hours: it lapsed 2 hours ago.
    const hold = await runInTransaction(prisma, uow => reservePlace(uow, systemActor('test'), { apartmentId: apartment.id, hours: 2, purpose: 'waitlist_offer', waitlistEntryId: entry.id, idempotencyKey: uniqueKey('hold') }), { now: past })
    await prisma.waitlistEntry.update({ where: { id: entry.id }, data: { status: 'offered', offeredReservationId: hold.reservationId, offerExpiresAt: hold.expiresAt } })
    // A web tour request nobody confirmed.
    const tour = await prisma.tour.create({ data: { publicCode: uniqueKey('T'), communityId: COMMUNITY.id, kind: 'in_person', status: 'requested', holdExpiresAt: new Date(Date.now() - HOUR) } })

    const tick = await workerTick(prisma, { workerId: 'test-worker' })
    expect(tick.error).toBeUndefined()
    expect(tick.jobs).toMatchObject({ errors: 0 })

    expect(await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).toMatchObject({ status: 'expired' })
    // Expiry beats release: the job expires the reservation first; either way the hold is gone and the place is open.
    expect(['expired', 'released']).toContain((await prisma.placeReservation.findUniqueOrThrow({ where: { id: hold.reservationId } })).status)
    expect(await prisma.apartment.findUniqueOrThrow({ where: { id: apartment.id } })).toMatchObject({ status: 'available' })
    expect(await prisma.tour.findUniqueOrThrow({ where: { id: tour.id } })).toMatchObject({ status: 'cancelled', holdExpiresAt: null })

    // The availability.changed message was delivered and the public count was recomputed.
    expect(tick.outbox.delivered).toBeGreaterThan(0)
    expect(await prisma.outboxEvent.count({ where: { status: { not: 'delivered' } } })).toBe(0)
    expect(await prisma.availabilitySnapshot.count({ where: { communityId: COMMUNITY.id } })).toBeGreaterThan(0)

    const health = await workerHealth(prisma)
    expect(health).toMatchObject({ status: 'running', lastError: null, outbox: { pending: 0, failed: 0, dead: 0 } })
    expect(await prisma.jobRun.count({ where: { kind: 'waitlist_offer_expiry', status: 'succeeded' } })).toBeGreaterThan(0)
  }, 120_000)

  it('notifies staff once per message, never mails synthetic families, and flags an unknown topic', async () => {
    await prisma.outboxEvent.createMany({ data: [
      { topic: 'task.sales_callback', aggregateType: 'Lead', aggregateId: 'lead_x', dedupeKey: uniqueKey('cb'), payload: { leadId: 'lead_x', communityId: COMMUNITY.id }, status: 'pending', nextAttemptAt: new Date() },
      { topic: 'not.a.topic', aggregateType: 'X', aggregateId: 'x', dedupeKey: uniqueKey('bad'), payload: {}, status: 'pending', nextAttemptAt: new Date() },
    ] })
    const tick = await workerTick(prisma, { workerId: 'test-worker' })
    expect(tick.outbox).toMatchObject({ delivered: 1, failed: 1 })
    // Admissions (canManageSales, assigned to Maple Ridge) is told; the CNA role is not.
    const callbacks = await prisma.notification.findMany({ where: { template: 'sales.callback_due' }, select: { recipientId: true } })
    expect(callbacks.map(n => n.recipientId)).toContain('seed_user_patel')
    expect(callbacks.map(n => n.recipientId)).not.toContain('seed_user_achterberg')
    // Redelivering the same message adds nobody twice.
    const message = await prisma.outboxEvent.findFirstOrThrow({ where: { topic: 'task.sales_callback' } })
    await prisma.outboxEvent.update({ where: { id: message.id }, data: { status: 'pending', nextAttemptAt: new Date() } })
    await workerTick(prisma, { workerId: 'test-worker' })
    expect(await prisma.notification.count({ where: { template: 'sales.callback_due' } })).toBe(callbacks.length)

    // Health shows the failing message without its error text.
    expect((await workerHealth(prisma)).outbox.failed).toBe(1)
  }, 120_000)

  it('records a tour email for a synthetic family as not sent, with no mail call', async () => {
    const contact = await prisma.contact.create({ data: { firstName: 'Linda', lastName: 'Okafor', email: 'linda.okafor@gmail.com', synthetic: true } })
    const lead = await prisma.lead.create({ data: { reference: uniqueKey('LD'), communityId: COMMUNITY.id, primaryContactId: contact.id, synthetic: true } as never })
    const slot = await prisma.tourSlot.create({ data: { communityId: COMMUNITY.id, startsAt: new Date(Date.now() + 48 * HOUR), endsAt: new Date(Date.now() + 49 * HOUR), capacity: 2 } as never })
    const tour = await prisma.tour.create({ data: { publicCode: uniqueKey('T'), communityId: COMMUNITY.id, slotId: slot.id, leadId: lead.id, kind: 'in_person', status: 'confirmed' } })
    await prisma.outboxEvent.create({ data: { topic: 'mail.tour_confirmed', aggregateType: 'Tour', aggregateId: tour.id, dedupeKey: uniqueKey('tc'), payload: { tourId: tour.id }, status: 'pending', nextAttemptAt: new Date() } })
    const sent: string[] = []
    await workerTick(prisma, { workerId: 'test-worker', sendMail: async message => { sent.push(message.to); return { messageId: 'm1' } } })
    expect(sent).toEqual([])
    const notification = await prisma.notification.findFirstOrThrow({ where: { template: 'mail.tour_confirmed' }, include: { deliveries: true } })
    expect(notification.status).toBe('failed')
    expect(notification.deliveries[0]).toMatchObject({ outcome: 'failed', providerMessageId: 'synthetic recipient: not mailed' })
  }, 120_000)
})
