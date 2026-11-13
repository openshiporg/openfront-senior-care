-- ── Phase 3b money guards (hand-written; the same style as phase_3_r1_money_guards) ─────────────────────────────

-- One active payment plan per statement.
CREATE UNIQUE INDEX "PaymentPlan_one_active_per_statement" ON "PaymentPlan" ("statement") WHERE "status" = 'active';

-- A plan's total and instalments are fixed once made; it is only ever cancelled. Never deleted.
CREATE FUNCTION "senior_care_plan_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A payment plan is never deleted; cancel it.'); END IF;
  IF NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor" OR NEW."statement" IS DISTINCT FROM OLD."statement" OR NEW."instalmentCount" IS DISTINCT FROM OLD."instalmentCount" THEN
    PERFORM "senior_care_raise"('A payment plan''s total and instalments are fixed; cancel it and make a new one.');
  END IF;
  IF OLD."status" = 'cancelled' AND NEW."status" <> 'cancelled' THEN PERFORM "senior_care_raise"('A cancelled payment plan stays cancelled.'); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PaymentPlan_guard" BEFORE UPDATE OR DELETE ON "PaymentPlan" FOR EACH ROW EXECUTE FUNCTION "senior_care_plan_guard"();

-- An instalment's amount and due date never change, and it is never deleted. The payment it points at only moves forward:
-- it can change only when the current payment failed (a staff Retry) or when there is none yet.
CREATE FUNCTION "senior_care_instalment_guard"() RETURNS trigger AS $$
DECLARE
  prior TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A plan instalment is never deleted.'); END IF;
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."dueOn" IS DISTINCT FROM OLD."dueOn" OR NEW."plan" IS DISTINCT FROM OLD."plan" OR NEW."number" IS DISTINCT FROM OLD."number" THEN
    PERFORM "senior_care_raise"('A plan instalment''s amount and due date are fixed.');
  END IF;
  IF NEW."payment" IS DISTINCT FROM OLD."payment" AND OLD."payment" IS NOT NULL THEN
    SELECT "status" INTO prior FROM "Payment" WHERE "id" = OLD."payment";
    IF prior IS DISTINCT FROM 'failed' THEN PERFORM "senior_care_raise"('An instalment is charged again only after its last payment was declined.'); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PaymentPlanInstalment_guard" BEFORE UPDATE OR DELETE ON "PaymentPlanInstalment" FOR EACH ROW EXECUTE FUNCTION "senior_care_instalment_guard"();

-- The instalments of a plan add up to its total (checked at commit, so the rows can follow the plan).
CREATE FUNCTION "senior_care_plan_sums"() RETURNS trigger AS $$
DECLARE
  total BIGINT;
  sum_rows BIGINT;
  rows_count INTEGER;
  expected INTEGER;
BEGIN
  SELECT "totalMinor", "instalmentCount" INTO total, expected FROM "PaymentPlan" WHERE "id" = COALESCE(NEW."plan", OLD."plan");
  SELECT COALESCE(SUM("amountMinor"), 0), COUNT(*) INTO sum_rows, rows_count FROM "PaymentPlanInstalment" WHERE "plan" = COALESCE(NEW."plan", OLD."plan");
  IF sum_rows <> total OR rows_count <> expected THEN PERFORM "senior_care_raise"('A payment plan''s instalments must add up to its total.'); END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "PaymentPlanInstalment_sums" AFTER INSERT OR UPDATE ON "PaymentPlanInstalment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "senior_care_plan_sums"();
ALTER TABLE "PaymentPlanInstalment" ADD CONSTRAINT "PaymentPlanInstalment_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_total_positive" CHECK ("totalMinor" > 0);

-- A patient liability schedule's amounts never change; a new determination supersedes it. Never deleted.
CREATE FUNCTION "senior_care_liability_schedule_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A patient liability schedule is never deleted; record a new one.'); END IF;
  IF NEW."monthlyAmountMinor" IS DISTINCT FROM OLD."monthlyAmountMinor" OR NEW."personalNeedsAllowanceMinor" IS DISTINCT FROM OLD."personalNeedsAllowanceMinor" OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom" OR NEW."resident" IS DISTINCT FROM OLD."resident" THEN
    PERFORM "senior_care_raise"('A patient liability schedule is never edited; record a new determination.');
  END IF;
  IF OLD."status" = 'superseded' AND NEW."status" <> 'superseded' THEN PERFORM "senior_care_raise"('A superseded schedule stays superseded.'); END IF;
  IF OLD."effectiveTo" IS NOT NULL AND (NEW."effectiveTo" IS NULL OR NEW."effectiveTo" > OLD."effectiveTo") THEN PERFORM "senior_care_raise"('A schedule''s end date only moves earlier.'); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PatientLiabilitySchedule_guard" BEFORE UPDATE OR DELETE ON "PatientLiabilitySchedule" FOR EACH ROW EXECUTE FUNCTION "senior_care_liability_schedule_guard"();
ALTER TABLE "PatientLiabilitySchedule" ADD CONSTRAINT "PatientLiabilitySchedule_amounts_not_negative" CHECK ("monthlyAmountMinor" >= 0 AND "personalNeedsAllowanceMinor" >= 0);
ALTER TABLE "PatientLiabilitySchedule" ADD CONSTRAINT "PatientLiabilitySchedule_dates" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");

-- One open Medicaid application per stay.
CREATE UNIQUE INDEX "MedicaidApplication_one_open_per_stay" ON "MedicaidApplication" ("stay") WHERE "status" IN ('preparing', 'submitted', 'info_requested', 'appealed');

-- A trust authorisation is active only after a second person approved it when it needed one, and that person is not the recorder.
-- Its terms never change; a revoked or rejected one stays so. Never deleted.
CREATE FUNCTION "senior_care_trust_auth_guard"() RETURNS trigger AS $$
DECLARE
  approver TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A trust authorisation is never deleted; revoke it.'); END IF;
  IF NEW."kinds"::text IS DISTINCT FROM OLD."kinds"::text OR NEW."perWithdrawalLimitMinor" IS DISTINCT FROM OLD."perWithdrawalLimitMinor" OR NEW."ledger" IS DISTINCT FROM OLD."ledger" OR NEW."signedOn" IS DISTINCT FROM OLD."signedOn" THEN
    PERFORM "senior_care_raise"('A trust authorisation''s terms are never edited; record a new one.');
  END IF;
  IF OLD."status" IN ('revoked', 'rejected') AND NEW."status" <> OLD."status" THEN PERFORM "senior_care_raise"('A revoked authorisation stays revoked.'); END IF;
  IF OLD."status" = 'pending_approval' AND NEW."status" = 'active' THEN
    SELECT d."decidedBy" INTO approver FROM "ApprovalRequest" r JOIN "ApprovalDecision" d ON d."request" = r."id" AND d."decision" = 'approve'
      WHERE r."id" = NEW."approval" AND r."status" = 'approved' ORDER BY d."at" DESC LIMIT 1;
    IF approver IS NULL OR approver = NEW."recordedBy" THEN PERFORM "senior_care_raise"('A trust authorisation over the threshold is active only after a different person approves it.'); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "TrustAuthorisation_guard" BEFORE UPDATE OR DELETE ON "TrustAuthorisation" FOR EACH ROW EXECUTE FUNCTION "senior_care_trust_auth_guard"();
CREATE UNIQUE INDEX "TrustAuthorisation_one_active_per_ledger" ON "TrustAuthorisation" ("ledger") WHERE "status" = 'active';

-- Quarterly statements and interest runs are frozen records.
CREATE FUNCTION "senior_care_frozen"() RETURNS trigger AS $$
BEGIN
  PERFORM "senior_care_raise"(TG_TABLE_NAME || ' rows are frozen once made.');
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "TrustStatement_frozen" BEFORE UPDATE OR DELETE ON "TrustStatement" FOR EACH ROW EXECUTE FUNCTION "senior_care_frozen"();
CREATE TRIGGER "InterestAllocationRun_frozen" BEFORE UPDATE OR DELETE ON "InterestAllocationRun" FOR EACH ROW EXECUTE FUNCTION "senior_care_frozen"();

-- An interest run's shares add up to its interest, and each names a posted interest transaction for that amount on that account.
CREATE FUNCTION "senior_care_interest_run_check"() RETURNS trigger AS $$
DECLARE
  share_sum BIGINT;
  posted_sum BIGINT;
BEGIN
  SELECT COALESCE(SUM((a->>'amountMinor')::BIGINT), 0) INTO share_sum FROM jsonb_array_elements(NEW."allocations") a;
  SELECT COALESCE(SUM(t."amountMinor"), 0) INTO posted_sum FROM jsonb_array_elements(NEW."allocations") a
    JOIN "TrustTransaction" t ON t."id" = a->>'transactionId' AND t."kind" = 'interest' AND t."status" = 'posted' AND t."account" = NEW."account" AND t."amountMinor" = (a->>'amountMinor')::BIGINT;
  IF share_sum <> NEW."interestMinor" OR posted_sum <> NEW."interestMinor" THEN
    PERFORM "senior_care_raise"('An interest run''s posted shares must add up to its interest.');
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "InterestAllocationRun_sums" AFTER INSERT ON "InterestAllocationRun" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "senior_care_interest_run_check"();

-- Surety bonds: amounts and dates never change; an active bond is only ever replaced. One active bond per account.
CREATE FUNCTION "senior_care_bond_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A surety bond record is never deleted.'); END IF;
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."expiresOn" IS DISTINCT FROM OLD."expiresOn" OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom" OR NEW."bondNumber" IS DISTINCT FROM OLD."bondNumber" OR NEW."carrier" IS DISTINCT FROM OLD."carrier" THEN
    PERFORM "senior_care_raise"('A surety bond record is never edited; record the new bond.');
  END IF;
  IF OLD."status" = 'replaced' AND NEW."status" <> 'replaced' THEN PERFORM "senior_care_raise"('A replaced bond stays replaced.'); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SuretyBond_guard" BEFORE UPDATE OR DELETE ON "SuretyBond" FOR EACH ROW EXECUTE FUNCTION "senior_care_bond_guard"();
CREATE UNIQUE INDEX "SuretyBond_one_active_per_account" ON "SuretyBond" ("account") WHERE "status" = 'active';
ALTER TABLE "SuretyBond" ADD CONSTRAINT "SuretyBond_amount_positive" CHECK ("amountMinor" > 0);
