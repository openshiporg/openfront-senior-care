-- Phase 3 guards (hand-written; the tables are in 20261112095204_phase_3_billing_trust). Additive only: indexes, CHECKs, triggers.

-- Money is positive where the side or the kind carries the sign.
ALTER TABLE "TrustLedgerLine" ADD CONSTRAINT "TrustLedgerLine_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "TrustLedgerLine" ADD CONSTRAINT "TrustLedgerLine_side_valid" CHECK ("side" IN ('debit', 'credit'));
ALTER TABLE "TrustLedgerLine" ADD CONSTRAINT "TrustLedgerLine_bucket_ledger" CHECK (("bucket" = 'client_liability') = ("ledger" IS NOT NULL));
ALTER TABLE "TrustTransaction" ADD CONSTRAINT "TrustTransaction_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "MedicaidLiability" ADD CONSTRAINT "MedicaidLiability_amount_nonnegative" CHECK ("liabilityMinor" >= 0);
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_paid_nonnegative" CHECK ("paidMinor" >= 0);

-- One live charge per (stay, day, kind, payer): superseded and voided rows keep history without colliding.
CREATE UNIQUE INDEX "Charge_one_live_per_key" ON "Charge" ("stay", "date", "kind", "payerKey") WHERE "status" IN ('open', 'posted');

-- One card or ACH payment in flight (pending or unknown) per statement: a second charge waits for "Check status".
CREATE UNIQUE INDEX "Payment_one_open_charge_per_statement" ON "Payment" ("statement") WHERE "method" IN ('card', 'ach') AND "status" IN ('pending', 'unknown') AND "statement" IS NOT NULL;
CREATE UNIQUE INDEX "Payment_idempotency_key_unique" ON "Payment" ("idempotencyKey") WHERE "idempotencyKey" <> '';
CREATE UNIQUE INDEX "PaymentEvent_provider_event_unique" ON "PaymentEvent" ("providerEventId") WHERE "providerEventId" <> '';
-- A provider reference belongs to exactly one payment, so a replayed event can only ever settle that one.
CREATE UNIQUE INDEX "Payment_provider_ref_unique" ON "Payment" ("providerRef") WHERE "providerRef" <> '';
-- A payment is allocated to a statement once.
CREATE UNIQUE INDEX "PaymentAllocation_payment_statement_unique" ON "PaymentAllocation" ("payment", "statement");

-- Append-only: allocations, webhook events and trust lines are never changed or removed.
CREATE FUNCTION "senior_care_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; post a superseding or reversing entry instead.', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TrustLedgerLine_append_only" BEFORE UPDATE OR DELETE ON "TrustLedgerLine" FOR EACH ROW EXECUTE FUNCTION "senior_care_append_only"();
CREATE TRIGGER "PaymentAllocation_append_only" BEFORE UPDATE OR DELETE ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION "senior_care_append_only"();
CREATE TRIGGER "PaymentEvent_append_only" BEFORE UPDATE OR DELETE ON "PaymentEvent" FOR EACH ROW EXECUTE FUNCTION "senior_care_append_only"();

-- Charges: never deleted; only the status and the superseding link may change, and only forward.
CREATE FUNCTION "senior_care_charge_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Charge is append-only; supersede or void it instead.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."date" IS DISTINCT FROM OLD."date"
     OR NEW."stay" IS DISTINCT FROM OLD."stay" OR NEW."resident" IS DISTINCT FROM OLD."resident" OR NEW."period" IS DISTINCT FROM OLD."period"
     OR NEW."payerKey" IS DISTINCT FROM OLD."payerKey" OR NEW."responsibility" IS DISTINCT FROM OLD."responsibility"
     OR NEW."derivationHash" IS DISTINCT FROM OLD."derivationHash" OR NEW."source" IS DISTINCT FROM OLD."source" THEN
    RAISE EXCEPTION 'A charge is never edited; post a superseding charge or an adjustment.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."status" IN ('superseded', 'voided') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'A superseded or voided charge cannot come back.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."status" = 'posted' AND NEW."status" = 'open' THEN
    RAISE EXCEPTION 'A posted charge cannot reopen.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Charge_guard" BEFORE UPDATE OR DELETE ON "Charge" FOR EACH ROW EXECUTE FUNCTION "senior_care_charge_guard"();

-- Trust: every transaction's debits equal its credits, checked at commit.
CREATE FUNCTION "senior_care_trust_balanced"() RETURNS trigger AS $$
DECLARE
  debits BIGINT;
  credits BIGINT;
BEGIN
  SELECT COALESCE(SUM("amountMinor") FILTER (WHERE "side" = 'debit'), 0), COALESCE(SUM("amountMinor") FILTER (WHERE "side" = 'credit'), 0)
    INTO debits, credits FROM "TrustLedgerLine" WHERE "transaction" = NEW."transaction";
  IF debits <> credits THEN
    RAISE EXCEPTION 'Trust transaction % does not balance (debits %, credits %).', NEW."transaction", debits, credits USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "TrustLedgerLine_balanced" AFTER INSERT ON "TrustLedgerLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "senior_care_trust_balanced"();

-- A trust transaction's money never changes after it posts (a correction is a reversal).
CREATE FUNCTION "senior_care_trust_tx_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TrustTransaction is append-only; post a reversal instead.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."ledger" IS DISTINCT FROM OLD."ledger"
     OR NEW."preparedBy" IS DISTINCT FROM OLD."preparedBy" OR NEW."effectiveOn" IS DISTINCT FROM OLD."effectiveOn" THEN
    RAISE EXCEPTION 'A posted trust transaction is never edited; post a reversal.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."signedBy" IS NOT NULL AND NEW."signedBy" = NEW."preparedBy" THEN
    RAISE EXCEPTION 'The person who prepared a trust transaction cannot sign it.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TrustTransaction_guard" BEFORE UPDATE OR DELETE ON "TrustTransaction" FOR EACH ROW EXECUTE FUNCTION "senior_care_trust_tx_guard"();
-- The same rule on insert: a withdrawal is never prepared and signed by one person.
ALTER TABLE "TrustTransaction" ADD CONSTRAINT "TrustTransaction_preparer_not_signer" CHECK ("signedBy" IS NULL OR "preparedBy" IS NULL OR "signedBy" <> "preparedBy");
ALTER TABLE "TrustReconciliation" ADD CONSTRAINT "TrustReconciliation_preparer_not_signer" CHECK ("signedBy" IS NULL OR "preparedBy" IS NULL OR "signedBy" <> "preparedBy");
