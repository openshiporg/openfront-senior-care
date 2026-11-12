import { PrismaClient } from '@prisma/client'

/**
 * Database tests run against a migrated, disposable Postgres schema named by SC_TEST_DATABASE_URL
 * (the scratch database's `vitest` schema in development). Pass the URL inline for the one command;
 * it is never written to a file. Without it the database suites are skipped, never faked.
 */
export const TEST_DATABASE_URL = process.env.SC_TEST_DATABASE_URL ?? ''
export const hasTestDatabase = /^postgres(ql)?:\/\//.test(TEST_DATABASE_URL) && /[?&]schema=vitest\b/.test(TEST_DATABASE_URL)

export function testPrisma(connectionLimit = 12) {
  const url = new URL(TEST_DATABASE_URL)
  url.searchParams.set('connection_limit', String(connectionLimit))
  url.searchParams.set('pool_timeout', '30')
  return new PrismaClient({ datasourceUrl: url.toString(), log: [] })
}

/** Empties every application table in the test schema. Append-only tables need their triggers off. */
export async function resetDatabase(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`
  if (!tables.length) return
  const list = tables.map(t => `"${t.tablename.replaceAll('"', '')}"`).join(', ')
  await prisma.$transaction([
    ...GUARDED.map(table => prisma.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER USER`)),
    prisma.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`),
    ...GUARDED.map(table => prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER USER`)),
  ])
}

const GUARDED = ['AuditEvent', 'ApprovalDecision', 'CensusEvent', 'CensusDay', 'PhiReadAudit', 'NoticeDelivery', 'CensusSignoff', 'MedicationSupplyMovement', 'MedicationAdministration', 'ShiftCountEntry', 'InferenceCall', 'TrustLedgerLine', 'PaymentAllocation', 'PaymentEvent', 'Charge', 'TrustTransaction', 'Statement', 'BillingPeriod', 'RateSchedule', 'RateLine', 'Payment', 'Refund', 'Deposit', 'MedicaidLiability', 'CareLevelAssignment', 'TrustReconciliation', 'BalanceAdjustment', 'ResidentCredit']

let counter = 0
export const uniqueKey = (prefix = 'test') => `${prefix}-${Date.now().toString(36)}-${(counter += 1).toString(36)}-${Math.random().toString(36).slice(2, 8)}`
