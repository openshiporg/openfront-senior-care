-- Phase 3 r1 (M8): money rows the app role could rewrite with SQL. Pattern from the home-services hs_money_period trigger:
-- the database, not the service, refuses. Triggers only; no table is altered except one CHECK on "Statement".
-- A closed month's charges change only inside adjustClosedPeriod, which sets the transaction-local setting
-- senior_care.adjusting to that period's id (set_config(..., true)).

CREATE FUNCTION "senior_care_raise"(msg TEXT) RETURNS void AS $$
BEGIN
  RAISE EXCEPTION '%', msg USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

-- Statement: totals and lines are frozen at close; paid never goes down; never deleted.
CREATE FUNCTION "senior_care_statement_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A statement is never deleted.'); END IF;
  IF NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor" OR NEW."lines"::text IS DISTINCT FROM OLD."lines"::text OR NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."resident" IS DISTINCT FROM OLD."resident" OR NEW."period" IS DISTINCT FROM OLD."period" OR NEW."community" IS DISTINCT FROM OLD."community"
     OR NEW."chargeHash" IS DISTINCT FROM OLD."chargeHash" OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt" OR NEW."dueOn" IS DISTINCT FROM OLD."dueOn" THEN
    PERFORM "senior_care_raise"('A closed statement is frozen; post an adjustment instead.');
  END IF;
  IF NEW."paidMinor" < OLD."paidMinor" THEN PERFORM "senior_care_raise"('A statement''s paid amount never goes down; refunds do not reopen it.'); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Statement_guard" BEFORE UPDATE OR DELETE ON "Statement" FOR EACH ROW EXECUTE FUNCTION "senior_care_statement_guard"();
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_paid_within_total" CHECK ("paidMinor" >= 0 AND "adjustedMinor" >= 0 AND "paidMinor" + "adjustedMinor" <= "totalMinor");

-- BillingPeriod: closed never reopens, and its hash and count are frozen.
CREATE FUNCTION "senior_care_period_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A billing period is never deleted.'); END IF;
  IF OLD."status" = 'closed' AND (NEW."status" IS DISTINCT FROM 'closed' OR NEW."derivationHash" IS DISTINCT FROM OLD."derivationHash" OR NEW."statementCount" IS DISTINCT FROM OLD."statementCount"
     OR NEW."closedAt" IS DISTINCT FROM OLD."closedAt" OR NEW."closedBy" IS DISTINCT FROM OLD."closedBy" OR NEW."month" IS DISTINCT FROM OLD."month" OR NEW."community" IS DISTINCT FROM OLD."community") THEN
    PERFORM "senior_care_raise"('A closed billing period is frozen and never reopens.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "BillingPeriod_guard" BEFORE UPDATE OR DELETE ON "BillingPeriod" FOR EACH ROW EXECUTE FUNCTION "senior_care_period_guard"();

-- Rate schedules and lines: once published they are immutable (a change is a new schedule).
CREATE FUNCTION "senior_care_schedule_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'draft' THEN PERFORM "senior_care_raise"('A published rate schedule is never deleted.'); END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" <> 'draft' THEN
    IF NEW."name" IS DISTINCT FROM OLD."name" OR NEW."setting" IS DISTINCT FROM OLD."setting" OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
       OR NEW."noticeDays" IS DISTINCT FROM OLD."noticeDays" OR NEW."community" IS DISTINCT FROM OLD."community" OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt" OR NEW."approval" IS DISTINCT FROM OLD."approval" THEN
      PERFORM "senior_care_raise"('A published rate schedule is immutable; publish a new one.');
    END IF;
    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (OLD."status" = 'published' AND NEW."status" = 'retired') THEN
      PERFORM "senior_care_raise"('A rate schedule''s status only moves forward.');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RateSchedule_guard" BEFORE UPDATE OR DELETE ON "RateSchedule" FOR EACH ROW EXECUTE FUNCTION "senior_care_schedule_guard"();

CREATE FUNCTION "senior_care_rateline_guard"() RETURNS trigger AS $$
DECLARE
  sched TEXT;
BEGIN
  SELECT "status" INTO sched FROM "RateSchedule" WHERE "id" = CASE WHEN TG_OP = 'INSERT' THEN NEW."schedule" ELSE OLD."schedule" END;
  IF sched IS NOT NULL AND sched <> 'draft' THEN PERFORM "senior_care_raise"('The lines of a published rate schedule are immutable.'); END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RateLine_guard" BEFORE INSERT OR UPDATE OR DELETE ON "RateLine" FOR EACH ROW EXECUTE FUNCTION "senior_care_rateline_guard"();

-- Charges (replaces the Phase 3 guard function): adds description, derivation and links to the frozen columns, and
-- refuses any insert or status change in a closed month outside adjustClosedPeriod.
CREATE OR REPLACE FUNCTION "senior_care_charge_guard"() RETURNS trigger AS $$
DECLARE
  pstatus TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Charge is append-only; supersede or void it instead.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."date" IS DISTINCT FROM OLD."date"
     OR NEW."stay" IS DISTINCT FROM OLD."stay" OR NEW."resident" IS DISTINCT FROM OLD."resident" OR NEW."period" IS DISTINCT FROM OLD."period"
     OR NEW."payerKey" IS DISTINCT FROM OLD."payerKey" OR NEW."responsibility" IS DISTINCT FROM OLD."responsibility"
     OR NEW."derivationHash" IS DISTINCT FROM OLD."derivationHash" OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."description" IS DISTINCT FROM OLD."description" OR NEW."derivation"::text IS DISTINCT FROM OLD."derivation"::text
     OR NEW."adjustsCharge" IS DISTINCT FROM OLD."adjustsCharge" OR NEW."payer" IS DISTINCT FROM OLD."payer" OR NEW."community" IS DISTINCT FROM OLD."community"
     OR (OLD."supersededBy" IS NOT NULL AND NEW."supersededBy" IS DISTINCT FROM OLD."supersededBy") THEN
    RAISE EXCEPTION 'A charge is never edited; post a superseding charge or an adjustment.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."status" IN ('superseded', 'voided') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'A superseded or voided charge cannot come back.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."status" = 'posted' AND NEW."status" = 'open' THEN
    RAISE EXCEPTION 'A posted charge cannot reopen.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."supersededBy" IS DISTINCT FROM OLD."supersededBy") AND OLD."period" IS NOT NULL THEN
    SELECT "status" INTO pstatus FROM "BillingPeriod" WHERE "id" = OLD."period";
    IF pstatus = 'closed' AND current_setting('senior_care.adjusting', true) IS DISTINCT FROM OLD."period" THEN
      RAISE EXCEPTION 'This month is closed; correct it with an adjustment.' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "senior_care_charge_insert_guard"() RETURNS trigger AS $$
DECLARE
  pstatus TEXT;
BEGIN
  IF NEW."period" IS NOT NULL THEN
    SELECT "status" INTO pstatus FROM "BillingPeriod" WHERE "id" = NEW."period";
    IF pstatus = 'closed' AND current_setting('senior_care.adjusting', true) IS DISTINCT FROM NEW."period" THEN
      RAISE EXCEPTION 'This month is closed; correct it with an adjustment.' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Charge_insert_guard" BEFORE INSERT ON "Charge" FOR EACH ROW EXECUTE FUNCTION "senior_care_charge_insert_guard"();

-- Payment, Refund, Deposit: amounts never change, statuses never move backwards, nothing is deleted.
CREATE FUNCTION "senior_care_payment_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A payment is never deleted.'); END IF;
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."statement" IS DISTINCT FROM OLD."statement" OR NEW."resident" IS DISTINCT FROM OLD."resident"
     OR NEW."method" IS DISTINCT FROM OLD."method" OR NEW."community" IS DISTINCT FROM OLD."community" THEN
    PERFORM "senior_care_raise"('A payment''s amount and target never change.');
  END IF;
  IF OLD."status" IN ('succeeded', 'failed') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    PERFORM "senior_care_raise"('A settled payment cannot change status.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Payment_guard" BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION "senior_care_payment_guard"();

CREATE FUNCTION "senior_care_refund_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A refund is never deleted.'); END IF;
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."payment" IS DISTINCT FROM OLD."payment" OR NEW."deposit" IS DISTINCT FROM OLD."deposit"
     OR NEW."credit" IS DISTINCT FROM OLD."credit" OR NEW."resident" IS DISTINCT FROM OLD."resident" OR NEW."community" IS DISTINCT FROM OLD."community" THEN
    PERFORM "senior_care_raise"('A refund''s amount and target never change.');
  END IF;
  IF OLD."status" IN ('issued', 'rejected') AND (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."refundRef" IS DISTINCT FROM OLD."refundRef" OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt") THEN
    PERFORM "senior_care_raise"('An issued or rejected refund is final.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Refund_guard" BEFORE UPDATE OR DELETE ON "Refund" FOR EACH ROW EXECUTE FUNCTION "senior_care_refund_guard"();

CREATE FUNCTION "senior_care_deposit_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A deposit is never deleted.'); END IF;
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."resident" IS DISTINCT FROM OLD."resident"
     OR NEW."receivedOn" IS DISTINCT FROM OLD."receivedOn" OR NEW."community" IS DISTINCT FROM OLD."community" THEN
    PERFORM "senior_care_raise"('A deposit''s amount and kind never change.');
  END IF;
  IF OLD."status" <> 'held' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    PERFORM "senior_care_raise"('A deposit that left held cannot go back.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Deposit_guard" BEFORE UPDATE OR DELETE ON "Deposit" FOR EACH ROW EXECUTE FUNCTION "senior_care_deposit_guard"();

-- Medicaid liability and care-level assignments are append-only: only the status (and the supersede link) moves.
CREATE FUNCTION "senior_care_liability_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A Medicaid liability is never deleted; supersede it.'); END IF;
  IF NEW."liabilityMinor" IS DISTINCT FROM OLD."liabilityMinor" OR NEW."month" IS DISTINCT FROM OLD."month" OR NEW."stay" IS DISTINCT FROM OLD."stay"
     OR NEW."resident" IS DISTINCT FROM OLD."resident" OR NEW."community" IS DISTINCT FROM OLD."community" THEN
    PERFORM "senior_care_raise"('A Medicaid liability amount is never edited; record a new one that supersedes it.');
  END IF;
  IF OLD."status" = 'superseded' AND (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."supersededBy" IS DISTINCT FROM OLD."supersededBy") THEN
    PERFORM "senior_care_raise"('A superseded liability is final.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MedicaidLiability_guard" BEFORE UPDATE OR DELETE ON "MedicaidLiability" FOR EACH ROW EXECUTE FUNCTION "senior_care_liability_guard"();

CREATE FUNCTION "senior_care_care_assignment_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A care-level assignment is never deleted; assign a new one.'); END IF;
  IF NEW."careLevel" IS DISTINCT FROM OLD."careLevel" OR NEW."points" IS DISTINCT FROM OLD."points" OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
     OR NEW."noticeDeliveredOn" IS DISTINCT FROM OLD."noticeDeliveredOn" OR NEW."stay" IS DISTINCT FROM OLD."stay" OR NEW."resident" IS DISTINCT FROM OLD."resident"
     OR NEW."community" IS DISTINCT FROM OLD."community" OR NEW."source" IS DISTINCT FROM OLD."source" OR NEW."reason" IS DISTINCT FROM OLD."reason" THEN
    PERFORM "senior_care_raise"('A care-level assignment is never edited; assign a new one.');
  END IF;
  IF OLD."status" = 'superseded' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    PERFORM "senior_care_raise"('A superseded assignment is final.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CareLevelAssignment_guard" BEFORE UPDATE OR DELETE ON "CareLevelAssignment" FOR EACH ROW EXECUTE FUNCTION "senior_care_care_assignment_guard"();

-- A posted adjustment never changes (only the supersede status), and resident credit is never deleted.
CREATE FUNCTION "senior_care_adjustment_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('This record is never deleted.'); END IF;
  IF TG_TABLE_NAME = 'BalanceAdjustment' THEN
    IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."statement" IS DISTINCT FROM OLD."statement" OR NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."reason" IS DISTINCT FROM OLD."reason" THEN
      PERFORM "senior_care_raise"('An adjustment is never edited; supersede it.');
    END IF;
    IF OLD."status" IN ('posted', 'rejected', 'superseded') AND NEW."status" IS DISTINCT FROM OLD."status" AND NOT (OLD."status" = 'posted' AND NEW."status" = 'superseded') THEN
      PERFORM "senior_care_raise"('A decided adjustment cannot change.');
    END IF;
  ELSE
    IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."payment" IS DISTINCT FROM OLD."payment" OR NEW."resident" IS DISTINCT FROM OLD."resident" OR NEW."remainingMinor" > OLD."remainingMinor" THEN
      PERFORM "senior_care_raise"('A resident credit''s amount is fixed and what is left only goes down.');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "BalanceAdjustment_guard" BEFORE UPDATE OR DELETE ON "BalanceAdjustment" FOR EACH ROW EXECUTE FUNCTION "senior_care_adjustment_guard"();
CREATE TRIGGER "ResidentCredit_guard" BEFORE UPDATE OR DELETE ON "ResidentCredit" FOR EACH ROW EXECUTE FUNCTION "senior_care_adjustment_guard"();
ALTER TABLE "ResidentCredit" ADD CONSTRAINT "ResidentCredit_remaining_within_amount" CHECK ("remainingMinor" >= 0 AND "remainingMinor" <= "amountMinor");

-- Trust (replaces the Phase 3 guard function): a posted transaction is final; pending moves only to posted (with a real,
-- different signer) or rejected.
CREATE OR REPLACE FUNCTION "senior_care_trust_tx_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TrustTransaction is append-only; post a reversal instead.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."ledger" IS DISTINCT FROM OLD."ledger"
     OR NEW."preparedBy" IS DISTINCT FROM OLD."preparedBy" OR NEW."effectiveOn" IS DISTINCT FROM OLD."effectiveOn" OR NEW."account" IS DISTINCT FROM OLD."account"
     OR NEW."reverses" IS DISTINCT FROM OLD."reverses" THEN
    RAISE EXCEPTION 'A posted trust transaction is never edited; post a reversal.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."status" IN ('posted', 'rejected') AND (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."signedBy" IS DISTINCT FROM OLD."signedBy" OR NEW."postedAt" IS DISTINCT FROM OLD."postedAt") THEN
    RAISE EXCEPTION 'A posted or rejected trust transaction is final; post a reversal.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."status" = 'pending_signature' AND NEW."status" NOT IN ('pending_signature', 'posted', 'rejected') THEN
    RAISE EXCEPTION 'A pending withdrawal is posted or rejected.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."status" = 'pending_signature' AND NEW."status" = 'posted' AND (NEW."signedBy" IS NULL OR NEW."signedBy" = NEW."preparedBy" OR NEW."postedAt" IS NULL) THEN
    RAISE EXCEPTION 'A withdrawal posts only with a signer who is not the preparer.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."signedBy" IS NOT NULL AND NEW."signedBy" = NEW."preparedBy" THEN
    RAISE EXCEPTION 'The person who prepared a trust transaction cannot sign it.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A posted transaction has balanced lines that equal its amount (checked at commit, so the lines may come after the status).
CREATE FUNCTION "senior_care_trust_posted_has_lines"() RETURNS trigger AS $$
DECLARE
  debits BIGINT;
  credits BIGINT;
BEGIN
  IF NEW."status" <> 'posted' THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM("amountMinor") FILTER (WHERE "side" = 'debit' AND "bucket" = 'client_liability'), 0),
         COALESCE(SUM("amountMinor") FILTER (WHERE "side" = 'credit' AND "bucket" = 'client_liability'), 0)
    INTO debits, credits FROM "TrustLedgerLine" WHERE "transaction" = NEW."id";
  IF NOT EXISTS (SELECT 1 FROM "TrustLedgerLine" WHERE "transaction" = NEW."id") THEN
    RAISE EXCEPTION 'A posted trust transaction needs its ledger lines.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."kind" <> 'reversal' AND debits + credits <> NEW."amountMinor" THEN
    RAISE EXCEPTION 'A posted trust transaction''s resident lines must equal its amount.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "TrustTransaction_posted_has_lines" AFTER INSERT OR UPDATE ON "TrustTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "senior_care_trust_posted_has_lines"();

-- A signed reconciliation is final; signing needs a signer and a time and starts from tied.
CREATE FUNCTION "senior_care_recon_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'signed' THEN PERFORM "senior_care_raise"('A signed reconciliation is never deleted.'); END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'signed' THEN PERFORM "senior_care_raise"('A signed reconciliation is immutable.'); END IF;
  IF NEW."status" = 'signed' AND (OLD."status" <> 'tied' OR NEW."signedBy" IS NULL OR NEW."signedAt" IS NULL OR NEW."signedBy" = NEW."preparedBy" OR NEW."differenceMinor" <> 0) THEN
    PERFORM "senior_care_raise"('A reconciliation is signed only when tied, by a signer who is not the preparer.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "TrustReconciliation_guard" BEFORE UPDATE OR DELETE ON "TrustReconciliation" FOR EACH ROW EXECUTE FUNCTION "senior_care_recon_guard"();

-- Never negative at any historical point, in the database: after a line is inserted, lock the resident's ledger row and
-- check the running balance on every date (money in counts before money out within a date).
CREATE FUNCTION "senior_care_trust_never_negative"() RETURNS trigger AS $$
DECLARE
  lowest BIGINT;
BEGIN
  IF NEW."bucket" <> 'client_liability' OR NEW."ledger" IS NULL THEN RETURN NULL; END IF;
  -- NO KEY UPDATE serialises writers on this ledger (two of them conflict) without deadlocking against the key-share lock a line insert takes through its foreign key.
  PERFORM 1 FROM "ResidentTrustLedger" WHERE "id" = NEW."ledger" FOR NO KEY UPDATE;
  SELECT MIN(running) INTO lowest FROM (
    SELECT SUM(delta) OVER (ORDER BY d) AS running FROM (
      SELECT "effectiveOn" AS d, SUM(CASE WHEN "side" = 'credit' THEN "amountMinor" ELSE -"amountMinor" END) AS delta
        FROM "TrustLedgerLine" WHERE "ledger" = NEW."ledger" AND "bucket" = 'client_liability' GROUP BY "effectiveOn"
    ) per_day
  ) cumulative;
  IF lowest < 0 THEN
    RAISE EXCEPTION 'This would overdraw the resident''s trust ledger on or after %.', NEW."effectiveOn" USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "TrustLedgerLine_never_negative" AFTER INSERT ON "TrustLedgerLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "senior_care_trust_never_negative"();
