-- AlterTable
ALTER TABLE "CareLevelAssignment" ADD COLUMN     "reason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "credit" TEXT;

-- AlterTable
ALTER TABLE "Statement" ADD COLUMN     "adjustedMinor" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BalanceAdjustment" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "statement" TEXT,
    "kind" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending_approval',
    "approval" TEXT,
    "supersedes" TEXT,
    "requestedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidentCredit" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "payment" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "remainingMinor" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResidentCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BalanceAdjustment_community_idx" ON "BalanceAdjustment"("community");

-- CreateIndex
CREATE INDEX "BalanceAdjustment_resident_idx" ON "BalanceAdjustment"("resident");

-- CreateIndex
CREATE INDEX "BalanceAdjustment_statement_idx" ON "BalanceAdjustment"("statement");

-- CreateIndex
CREATE INDEX "BalanceAdjustment_approval_idx" ON "BalanceAdjustment"("approval");

-- CreateIndex
CREATE INDEX "BalanceAdjustment_supersedes_idx" ON "BalanceAdjustment"("supersedes");

-- CreateIndex
CREATE INDEX "BalanceAdjustment_requestedBy_idx" ON "BalanceAdjustment"("requestedBy");

-- CreateIndex
CREATE INDEX "ResidentCredit_community_idx" ON "ResidentCredit"("community");

-- CreateIndex
CREATE INDEX "ResidentCredit_resident_idx" ON "ResidentCredit"("resident");

-- CreateIndex
CREATE INDEX "ResidentCredit_payment_idx" ON "ResidentCredit"("payment");

-- CreateIndex
CREATE INDEX "Refund_credit_idx" ON "Refund"("credit");

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_statement_fkey" FOREIGN KEY ("statement") REFERENCES "Statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_supersedes_fkey" FOREIGN KEY ("supersedes") REFERENCES "BalanceAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_credit_fkey" FOREIGN KEY ("credit") REFERENCES "ResidentCredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentCredit" ADD CONSTRAINT "ResidentCredit_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentCredit" ADD CONSTRAINT "ResidentCredit_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentCredit" ADD CONSTRAINT "ResidentCredit_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
