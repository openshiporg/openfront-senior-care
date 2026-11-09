import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx } from '../../../tests/helpers/sessions'
import { verifyAuditChain } from '../lib/audit'
import { verifyCensusChain, verifyCensusProjection } from '../lib/census'
import { loadOperatorSetup } from '../mutations/setup'
import { runCensusSeed } from './census'
import { buildCensusPlan } from './censusPlan'
import { COMMUNITY } from './operator'

/**
 * The census history loads through the real commands in request-sized pieces, lands exactly where
 * the plan says, reconciles (projections, place state, chains) and is safe to run again.
 */
describe.skipIf(!hasTestDatabase)('census seed (database)', () => {
  let prisma: PrismaClient
  const anchor = new Date(Math.floor((Date.now() - 60_000) / 60_000) * 60_000)

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    process.env.SESSION_SECRET ||= 'test-only-session-secret-0123456789abcdef'
    prisma = testPrisma(10)
    await resetDatabase(prisma)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, ctx(prisma, owner.id, ALL_DEFAULT))
  }, 300_000)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('loads in budgeted pieces and lands on the planned census', async () => {
    const first = await runCensusSeed(prisma as never, { preset: 'small', anchor, budgetMs: 1 })
    expect(first.finished).toBe(false)
    expect(first.done).toBeGreaterThan(0)
    let progress = first
    while (!progress.finished) progress = await runCensusSeed(prisma as never, { preset: 'small', budgetMs: 60_000 })
    expect(progress.anchor).toBe(anchor.toISOString())
    const { summary } = buildCensusPlan({ anchor, preset: 'small', timeZone: COMMUNITY.timeZone })

    const present = await prisma.stay.count({ where: { communityId: COMMUNITY.id, status: 'admitted' } })
    expect(present).toBe(summary.residentsPresent)
    const beds = await prisma.bed.groupBy({ by: ['status'], _count: true })
    const bedCount = (status: string) => beds.find(b => b.status === status)?._count ?? 0
    expect(bedCount('occupied')).toBe(summary.nursing.occupied)
    expect(bedCount('held')).toBe(summary.nursing.held)
    expect(bedCount('reserved')).toBe(summary.nursing.reserved)
    expect(bedCount('out_of_service')).toBe(summary.nursing.outOfService)

    // Every stay's projection rebuilds from its events and every chain verifies.
    const stays = await prisma.stay.findMany({ where: { communityId: COMMUNITY.id }, select: { id: true } })
    for (const stay of stays) {
      expect((await verifyCensusProjection(prisma as never, stay.id)).matches).toBe(true)
      expect((await verifyCensusChain(prisma as never, stay.id)).ok).toBe(true)
    }
    expect((await verifyAuditChain(prisma as never)).ok).toBe(true)

    // The exit-gate sales path ended in an admission; no family was mailed.
    expect(await prisma.lead.count({ where: { status: 'moved_in' } })).toBeGreaterThanOrEqual(1)
    expect(await prisma.waitlistEntry.count({ where: { status: 'converted' } })).toBeGreaterThanOrEqual(1)
    expect(await prisma.portalAccount.count({ where: { status: 'active' } })).toBeGreaterThan(0)
    expect(await prisma.censusSignoff.count()).toBeGreaterThanOrEqual(2)
    expect(await prisma.resident.count({ where: { synthetic: false } })).toBe(0)
  }, 1_200_000)

  it('is a no-op when run again', async () => {
    const before = await prisma.censusEvent.count()
    const again = await runCensusSeed(prisma as never, { preset: 'small', budgetMs: 60_000 })
    expect(again.finished).toBe(true)
    expect(again.created).toEqual({})
    expect(await prisma.censusEvent.count()).toBe(before)
  }, 120_000)
})
