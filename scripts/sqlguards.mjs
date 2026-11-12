// Phase 3 r1 (M8): proves the database refuses every money rewrite the review found, as a NON-OWNER app role.
// Usage: SG_DATABASE_URL=<owner url of a migrated scratch db> node scripts/sqlguards.mjs
// The URL is read from the environment and never printed. Fixtures are written as the owner; each probe runs as the app role
// inside a transaction that is always rolled back.
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const ownerUrl = process.env.SG_DATABASE_URL
if (!ownerUrl) throw new Error('Set SG_DATABASE_URL (owner URL of a migrated scratch database).')
const password = randomBytes(18).toString('hex')
const role = `sc_guard_app_${randomBytes(3).toString('hex')}`
const appUrl = new URL(ownerUrl)
appUrl.username = role
appUrl.password = password
appUrl.searchParams.delete('schema')

const owner = new PrismaClient({ datasourceUrl: ownerUrl, log: [] })
const app = new PrismaClient({ datasourceUrl: appUrl.toString(), log: [] })
const q = sql => owner.$executeRawUnsafe(sql)

let pass = 0
let fail = 0
const report = (ok, name, detail = '') => { if (ok) pass += 1; else fail += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const ROLLBACK = new Error('rollback')

/** Runs statements as the app role; always rolls back. Returns the error (or null if everything was accepted). */
async function attempt(statements, { immediate = false } = {}) {
  try {
    await app.$transaction(async tx => {
      for (const sql of statements) await tx.$executeRawUnsafe(sql)
      if (immediate) await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      throw ROLLBACK
    })
  } catch (error) {
    return error === ROLLBACK || error?.cause === ROLLBACK ? null : error
  }
  return null
}
const refused = async (name, statements, opts) => {
  const error = await attempt(Array.isArray(statements) ? statements : [statements], opts)
  report(Boolean(error), `refused: ${name}`, error ? String(error.message).split('\n').filter(Boolean).pop()?.slice(0, 110) : 'ACCEPTED')
}
const allowed = async (name, statements, opts) => {
  const error = await attempt(Array.isArray(statements) ? statements : [statements], opts)
  report(!error, `allowed: ${name}`, error ? String(error.message).split('\n').filter(Boolean).pop()?.slice(0, 110) : '')
}

async function fixtures() {
  await q(`INSERT INTO "User" ("id", "password", "email") VALUES ('g_u1', 'x', 'g1@test.local'), ('g_u2', 'x', 'g2@test.local')`)
  await q(`INSERT INTO "BillingPeriod" ("id", "month", "status") VALUES ('g_p_open', '2026-10-01', 'open')`)
  await q(`INSERT INTO "BillingPeriod" ("id", "month", "status", "derivationHash", "statementCount") VALUES ('g_p_closed', '2026-09-01', 'closed', 'abc', 1)`)
  await q(`INSERT INTO "Charge" ("id", "period", "date", "kind", "responsibility", "amountMinor", "source", "status", "payerKey", "derivationHash", "description") VALUES ('g_c1', 'g_p_open', '2026-10-05', 'rent', 'resident', 1000, 'derived', 'posted', 'resident', 'h1', 'Rent')`)
  await q(`UPDATE "BillingPeriod" SET "status" = 'closed', "derivationHash" = 'def', "statementCount" = 1 WHERE "id" = 'g_p_open'`)
  await q(`INSERT INTO "Statement" ("id", "period", "totalMinor", "paidMinor", "number") VALUES ('g_s1', 'g_p_closed', 1000, 0, 'G-1'), ('g_s2', 'g_p_closed', 1000, 500, 'G-2')`)
  await q(`INSERT INTO "RateSchedule" ("id", "setting", "status", "name") VALUES ('g_rs1', 'assisted_living', 'draft', 'Rates')`)
  await q(`INSERT INTO "RateLine" ("id", "schedule", "kind", "amountMinor", "per", "proration") VALUES ('g_rl1', 'g_rs1', 'apartment_rent', 600000, 'month', 'actual_days_in_month')`)
  await q(`UPDATE "RateSchedule" SET "status" = 'published', "publishedAt" = now(), "effectiveFrom" = '2026-01-01' WHERE "id" = 'g_rs1'`)
  await q(`INSERT INTO "Payment" ("id", "method", "amountMinor", "status", "statement", "idempotencyKey") VALUES ('g_pay1', 'check', 1000, 'succeeded', 'g_s1', 'g-k1'), ('g_pay2', 'check', 1000, 'pending', 'g_s2', 'g-k2')`)
  await q(`INSERT INTO "Refund" ("id", "amountMinor", "status", "payment") VALUES ('g_rf1', 500, 'issued', 'g_pay1')`)
  await q(`INSERT INTO "Deposit" ("id", "kind", "amountMinor", "method", "status") VALUES ('g_dep1', 'security', 100, 'check', 'held')`)
  await q(`INSERT INTO "MedicaidLiability" ("id", "liabilityMinor", "status", "month") VALUES ('g_ml1', 70000, 'determined', '2026-10-01')`)
  await q(`INSERT INTO "CareLevelAssignment" ("id", "points", "effectiveFrom", "status") VALUES ('g_cla1', 10, '2026-10-01', 'active')`)
  await q(`INSERT INTO "TrustAccount" ("id", "name") VALUES ('g_ta1', 'Resident funds')`)
  await q(`INSERT INTO "ResidentTrustLedger" ("id", "account", "reference") VALUES ('g_tl1', 'g_ta1', 'G-TRL')`)
  await owner.$transaction(async tx => {
    await tx.$executeRawUnsafe(`INSERT INTO "TrustTransaction" ("id", "ledger", "account", "kind", "amountMinor", "status", "preparedBy", "signedBy", "postedAt", "effectiveOn", "reference") VALUES ('g_tx1', 'g_tl1', 'g_ta1', 'deposit', 10000, 'posted', 'g_u1', NULL, now(), '2026-10-01', 'G-TX1')`)
    await tx.$executeRawUnsafe(`INSERT INTO "TrustLedgerLine" ("id", "transaction", "ledger", "account", "bucket", "side", "amountMinor", "effectiveOn") VALUES ('g_l1', 'g_tx1', NULL, 'g_ta1', 'bank_control', 'debit', 10000, '2026-10-01'), ('g_l2', 'g_tx1', 'g_tl1', 'g_ta1', 'client_liability', 'credit', 10000, '2026-10-01')`)
  })
  await q(`INSERT INTO "TrustTransaction" ("id", "ledger", "account", "kind", "amountMinor", "status", "preparedBy", "effectiveOn", "reference") VALUES ('g_tx2', 'g_tl1', 'g_ta1', 'withdrawal', 5000, 'pending_signature', 'g_u1', '2026-10-10', 'G-TX2')`)
  await q(`INSERT INTO "TrustReconciliation" ("id", "account", "month", "bankBalanceMinor", "bookBalanceMinor", "residentTotalMinor", "differenceMinor", "status", "preparedBy") VALUES ('g_rc1', 'g_ta1', '2026-10-01', 10000, 10000, 10000, 0, 'tied', 'g_u1'), ('g_rc2', 'g_ta1', '2026-09-01', 10000, 10000, 10000, 0, 'tied', 'g_u1')`)
  await q(`UPDATE "TrustReconciliation" SET "status" = 'signed', "signedBy" = 'g_u2', "signedAt" = now() WHERE "id" = 'g_rc1'`)
}

async function main() {
  await q(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`)
  await q(`GRANT USAGE ON SCHEMA public TO "${role}"`)
  await q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`)
  const [{ superuser }] = await app.$queryRawUnsafe(`SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`)
  report(!superuser, 'probes run as a non-superuser, non-owner role')
  await fixtures()

  // The app role cannot switch the guards off.
  await refused('ALTER TABLE ... DISABLE TRIGGER (not the owner)', `ALTER TABLE "Charge" DISABLE TRIGGER USER`)
  await refused('TRUNCATE a money table', `TRUNCATE "Payment" CASCADE`)

  // Statement
  await refused('Statement totalMinor edit', `UPDATE "Statement" SET "totalMinor" = 1 WHERE "id" = 'g_s1'`)
  await refused('Statement lines edit', `UPDATE "Statement" SET "lines" = '[{"x":1}]'::jsonb WHERE "id" = 'g_s1'`)
  await refused('Statement paidMinor above totalMinor', `UPDATE "Statement" SET "paidMinor" = 5000 WHERE "id" = 'g_s1'`)
  await refused('Statement paidMinor goes down', `UPDATE "Statement" SET "paidMinor" = 100 WHERE "id" = 'g_s2'`)
  await refused('Statement DELETE', `DELETE FROM "Statement" WHERE "id" = 'g_s1'`)
  // BillingPeriod
  await refused('BillingPeriod closed -> open', `UPDATE "BillingPeriod" SET "status" = 'open' WHERE "id" = 'g_p_closed'`)
  await refused('BillingPeriod derivationHash edit', `UPDATE "BillingPeriod" SET "derivationHash" = 'zzz' WHERE "id" = 'g_p_closed'`)
  await refused('BillingPeriod DELETE', `DELETE FROM "BillingPeriod" WHERE "id" = 'g_p_closed'`)
  // Rates
  await refused('published RateLine amount edit', `UPDATE "RateLine" SET "amountMinor" = 1 WHERE "id" = 'g_rl1'`)
  await refused('published RateLine DELETE', `DELETE FROM "RateLine" WHERE "id" = 'g_rl1'`)
  await refused('line added to a published schedule', `INSERT INTO "RateLine" ("id", "schedule", "kind", "amountMinor", "per", "proration") VALUES ('g_rl2', 'g_rs1', 'apartment_rent', 1, 'month', 'actual_days_in_month')`)
  await refused('published RateSchedule effectiveFrom edit', `UPDATE "RateSchedule" SET "effectiveFrom" = '2020-01-01' WHERE "id" = 'g_rs1'`)
  await refused('published RateSchedule DELETE', `DELETE FROM "RateSchedule" WHERE "id" = 'g_rs1'`)
  // Charge
  await refused('Charge description edit', `UPDATE "Charge" SET "description" = 'changed' WHERE "id" = 'g_c1'`)
  await refused('Charge derivation edit', `UPDATE "Charge" SET "derivation" = '{"a":1}'::jsonb WHERE "id" = 'g_c1'`)
  await refused('Charge posted -> voided in a closed month', `UPDATE "Charge" SET "status" = 'voided' WHERE "id" = 'g_c1'`)
  await refused('Charge posted INSERT into a closed period', `INSERT INTO "Charge" ("id", "period", "date", "kind", "responsibility", "amountMinor", "source", "status", "payerKey") VALUES ('g_c2', 'g_p_closed', '2026-09-05', 'rent', 'resident', 1, 'derived', 'posted', 'resident')`)
  await refused('Charge DELETE', `DELETE FROM "Charge" WHERE "id" = 'g_c1'`)
  // Payment, Refund, Deposit
  await refused('Payment amount edit', `UPDATE "Payment" SET "amountMinor" = 1 WHERE "id" = 'g_pay1'`)
  await refused('Payment succeeded -> pending', `UPDATE "Payment" SET "status" = 'pending' WHERE "id" = 'g_pay1'`)
  await refused('Payment DELETE', `DELETE FROM "Payment" WHERE "id" = 'g_pay1'`)
  await refused('Refund amount edit after issue', `UPDATE "Refund" SET "amountMinor" = 1 WHERE "id" = 'g_rf1'`)
  await refused('Refund DELETE', `DELETE FROM "Refund" WHERE "id" = 'g_rf1'`)
  await refused('Deposit amount edit', `UPDATE "Deposit" SET "amountMinor" = 1 WHERE "id" = 'g_dep1'`)
  // Append-only
  await refused('MedicaidLiability amount edit', `UPDATE "MedicaidLiability" SET "liabilityMinor" = 1 WHERE "id" = 'g_ml1'`)
  await refused('CareLevelAssignment back-date', `UPDATE "CareLevelAssignment" SET "effectiveFrom" = '2020-01-01' WHERE "id" = 'g_cla1'`)
  // Trust
  await refused('posted TrustTransaction -> voided/rejected', `UPDATE "TrustTransaction" SET "status" = 'rejected' WHERE "id" = 'g_tx1'`)
  await refused('posted TrustTransaction amount edit', `UPDATE "TrustTransaction" SET "amountMinor" = 1 WHERE "id" = 'g_tx1'`)
  await refused('pending withdrawal posted with a forged signer and no lines', `UPDATE "TrustTransaction" SET "status" = 'posted', "signedBy" = 'g_u2', "postedAt" = now() WHERE "id" = 'g_tx2'`, { immediate: true })
  await refused('pending withdrawal posted with no signer', `UPDATE "TrustTransaction" SET "status" = 'posted', "postedAt" = now() WHERE "id" = 'g_tx2'`, { immediate: true })
  await refused('pending withdrawal signed by its preparer', `UPDATE "TrustTransaction" SET "status" = 'posted', "signedBy" = 'g_u1', "postedAt" = now() WHERE "id" = 'g_tx2'`, { immediate: true })
  await refused('signed reconciliation edited', `UPDATE "TrustReconciliation" SET "bankBalanceMinor" = 1 WHERE "id" = 'g_rc1'`)
  await refused('signed reconciliation un-signed', `UPDATE "TrustReconciliation" SET "status" = 'untied', "signedBy" = NULL WHERE "id" = 'g_rc1'`)
  await refused('reconciliation signed by its preparer', `UPDATE "TrustReconciliation" SET "status" = 'signed', "signedBy" = 'g_u1', "signedAt" = now() WHERE "id" = 'g_rc2'`)
  await refused('balanced overdraw at a past date (never negative)', [
    `INSERT INTO "TrustTransaction" ("id", "ledger", "account", "kind", "amountMinor", "status", "preparedBy", "postedAt", "effectiveOn", "reference") VALUES ('g_tx3', 'g_tl1', 'g_ta1', 'withdrawal', 99999, 'posted', 'g_u1', now(), '2026-10-02', 'G-TX3')`,
    `INSERT INTO "TrustLedgerLine" ("id", "transaction", "ledger", "account", "bucket", "side", "amountMinor", "effectiveOn") VALUES ('g_l3', 'g_tx3', NULL, 'g_ta1', 'bank_control', 'credit', 99999, '2026-10-02'), ('g_l4', 'g_tx3', 'g_tl1', 'g_ta1', 'client_liability', 'debit', 99999, '2026-10-02')`,
  ], { immediate: true })
  await refused('unbalanced trust lines', [
    `INSERT INTO "TrustTransaction" ("id", "ledger", "account", "kind", "amountMinor", "status", "preparedBy", "postedAt", "effectiveOn", "reference") VALUES ('g_tx4', 'g_tl1', 'g_ta1', 'deposit', 100, 'posted', 'g_u1', now(), '2026-10-03', 'G-TX4')`,
    `INSERT INTO "TrustLedgerLine" ("id", "transaction", "ledger", "account", "bucket", "side", "amountMinor", "effectiveOn") VALUES ('g_l5', 'g_tx4', 'g_tl1', 'g_ta1', 'client_liability', 'credit', 100, '2026-10-03')`,
  ], { immediate: true })

  // The legitimate paths still work for the same role.
  await allowed('charge INSERT into an open period', [`INSERT INTO "BillingPeriod" ("id", "month", "status") VALUES ('g_p_new', '2026-11-01', 'open')`, `INSERT INTO "Charge" ("id", "period", "date", "kind", "responsibility", "amountMinor", "source", "status", "payerKey") VALUES ('g_c3', 'g_p_new', '2026-11-05', 'rent', 'resident', 1, 'derived', 'open', 'resident')`])
  await allowed('closed-month correction inside the adjust command (flag set)', [`SELECT set_config('senior_care.adjusting', 'g_p_closed', true)`, `INSERT INTO "Charge" ("id", "period", "date", "kind", "responsibility", "amountMinor", "source", "status", "payerKey") VALUES ('g_c4', 'g_p_closed', '2026-09-05', 'rent', 'resident', 1, 'derived', 'posted', 'resident')`])
  await allowed('a valid trust withdrawal (balanced, inside the balance)', [
    `INSERT INTO "TrustTransaction" ("id", "ledger", "account", "kind", "amountMinor", "status", "preparedBy", "postedAt", "effectiveOn", "reference") VALUES ('g_tx5', 'g_tl1', 'g_ta1', 'withdrawal', 4000, 'posted', 'g_u1', now(), '2026-10-05', 'G-TX5')`,
    `INSERT INTO "TrustLedgerLine" ("id", "transaction", "ledger", "account", "bucket", "side", "amountMinor", "effectiveOn") VALUES ('g_l6', 'g_tx5', NULL, 'g_ta1', 'bank_control', 'credit', 4000, '2026-10-05'), ('g_l7', 'g_tx5', 'g_tl1', 'g_ta1', 'client_liability', 'debit', 4000, '2026-10-05')`,
  ], { immediate: true })
  await allowed('a pending withdrawal signed by a different person with lines', [
    `UPDATE "TrustTransaction" SET "status" = 'posted', "signedBy" = 'g_u2', "postedAt" = now() WHERE "id" = 'g_tx2'`,
    `INSERT INTO "TrustLedgerLine" ("id", "transaction", "ledger", "account", "bucket", "side", "amountMinor", "effectiveOn") VALUES ('g_l8', 'g_tx2', NULL, 'g_ta1', 'bank_control', 'credit', 5000, '2026-10-10'), ('g_l9', 'g_tx2', 'g_tl1', 'g_ta1', 'client_liability', 'debit', 5000, '2026-10-10')`,
  ], { immediate: true })

  console.log(`\n${pass} passed, ${fail} failed`)
}

try {
  await main()
} finally {
  await app.$disconnect()
  try {
    await q(`DROP OWNED BY "${role}"`)
    await q(`DROP ROLE IF EXISTS "${role}"`)
  } catch (error) {
    console.log('cleanup of the guard role failed:', String(error.message).split('\n').pop())
  }
  await owner.$disconnect()
}
process.exit(fail ? 1 : 0)
