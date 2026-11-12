-- Phase 3: the compound uniques declared in prismaConstraints.ts. Additive only.

-- CreateIndex
CREATE UNIQUE INDEX "BillingPeriod_community_month_key" ON "BillingPeriod"("community", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ResidentTrustLedger_resident_account_key" ON "ResidentTrustLedger"("resident", "account");

-- CreateIndex
CREATE UNIQUE INDEX "Statement_period_resident_key" ON "Statement"("period", "resident");

-- CreateIndex
CREATE UNIQUE INDEX "TrustReconciliation_account_month_key" ON "TrustReconciliation"("account", "month");
