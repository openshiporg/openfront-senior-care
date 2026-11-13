-- Phase 4b guards (claims, remittances, workforce). Hand-written, in the style of phase_3 and phase_4a guards.
-- Nothing here drops, deletes or updates existing rows: new tables only.

-- An 835 is imported once per payer and trace number.
CREATE UNIQUE INDEX "Remittance_payer_trace_unique" ON "Remittance" ("payer", "traceNumber");

-- Postings and punches are append-only: a correction is a new row.
CREATE TRIGGER "RemittancePosting_append_only" BEFORE UPDATE OR DELETE ON "RemittancePosting" FOR EACH ROW EXECUTE FUNCTION "senior_care_append_only"();
CREATE TRIGGER "TimePunch_append_only" BEFORE UPDATE OR DELETE ON "TimePunch" FOR EACH ROW EXECUTE FUNCTION "senior_care_append_only"();

-- A posting never credits more than the remittance paid, and a claim is never credited more than it billed.
CREATE FUNCTION "senior_care_posting_guard"() RETURNS trigger AS $$
DECLARE
  remitted BIGINT;
  posted BIGINT;
  billed BIGINT;
  claimed BIGINT;
BEGIN
  IF NEW."remittance" IS NULL OR NEW."claim" IS NULL THEN
    PERFORM "senior_care_raise"('A posting names its remittance and its claim.');
  END IF;
  SELECT "totalPaidMinor" INTO remitted FROM "Remittance" WHERE "id" = NEW."remittance" FOR UPDATE;
  SELECT COALESCE(SUM("paidMinor"), 0) INTO posted FROM "RemittancePosting" WHERE "remittance" = NEW."remittance";
  IF posted + NEW."paidMinor" > remitted THEN
    PERFORM "senior_care_raise"('Posting would credit more than the remittance paid.');
  END IF;
  SELECT "totalChargesMinor" INTO billed FROM "Claim" WHERE "id" = NEW."claim" FOR UPDATE;
  SELECT COALESCE(SUM("paidMinor"), 0) INTO claimed FROM "RemittancePosting" WHERE "claim" = NEW."claim";
  IF claimed + NEW."paidMinor" > billed THEN
    PERFORM "senior_care_raise"('Posting would credit a claim more than it billed.');
  END IF;
  IF claimed + NEW."paidMinor" < 0 THEN
    PERFORM "senior_care_raise"('A reversal cannot take a claim below zero paid.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RemittancePosting_guard" BEFORE INSERT ON "RemittancePosting" FOR EACH ROW EXECUTE FUNCTION "senior_care_posting_guard"();

-- Remittance: the trace, payer, total and file never change; the status only moves forward; nothing is deleted.
CREATE FUNCTION "senior_care_remittance_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A remittance is never deleted.'); END IF;
  IF NEW."traceNumber" IS DISTINCT FROM OLD."traceNumber" OR NEW."payer" IS DISTINCT FROM OLD."payer" OR NEW."totalPaidMinor" IS DISTINCT FROM OLD."totalPaidMinor"
     OR NEW."fileHash" IS DISTINCT FROM OLD."fileHash" OR NEW."paymentDate" IS DISTINCT FROM OLD."paymentDate" THEN
    PERFORM "senior_care_raise"('A remittance''s trace, payer, total and file never change.');
  END IF;
  IF OLD."status" = 'posted' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    PERFORM "senior_care_raise"('A posted remittance is final.');
  END IF;
  IF OLD."status" = 'matched' AND NEW."status" = 'imported' THEN
    PERFORM "senior_care_raise"('A matched remittance cannot go back to imported.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Remittance_guard" BEFORE UPDATE OR DELETE ON "Remittance" FOR EACH ROW EXECUTE FUNCTION "senior_care_remittance_guard"();

-- Claim: never deleted; once validated, what it bills and for whom never changes; paid never exceeds billed; a final claim is final.
CREATE FUNCTION "senior_care_claim_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A claim is never deleted; cancel it.'); END IF;
  IF OLD."status" <> 'draft' AND (NEW."totalChargesMinor" IS DISTINCT FROM OLD."totalChargesMinor" OR NEW."resident" IS DISTINCT FROM OLD."resident"
     OR NEW."stay" IS DISTINCT FROM OLD."stay" OR NEW."payer" IS DISTINCT FROM OLD."payer" OR NEW."periodFrom" IS DISTINCT FROM OLD."periodFrom"
     OR NEW."periodTo" IS DISTINCT FROM OLD."periodTo" OR NEW."typeOfBill" IS DISTINCT FROM OLD."typeOfBill") THEN
    PERFORM "senior_care_raise"('A validated claim''s amount, period and type of bill never change; cancel it and make a replacement claim.');
  END IF;
  IF COALESCE(NEW."paidMinor", 0) < 0 OR COALESCE(NEW."paidMinor", 0) > NEW."totalChargesMinor" THEN
    PERFORM "senior_care_raise"('A claim''s paid amount is between zero and what it billed.');
  END IF;
  IF OLD."status" IN ('finalised', 'cancelled') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    PERFORM "senior_care_raise"('A finalised or cancelled claim cannot change status.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Claim_guard" BEFORE UPDATE OR DELETE ON "Claim" FOR EACH ROW EXECUTE FUNCTION "senior_care_claim_guard"();

-- Claim lines are frozen once the claim leaves draft.
CREATE FUNCTION "senior_care_claim_line_guard"() RETURNS trigger AS $$
DECLARE
  claim_id TEXT;
  claim_status TEXT;
BEGIN
  claim_id := CASE WHEN TG_OP = 'INSERT' THEN NEW."claim" ELSE OLD."claim" END;
  SELECT "status" INTO claim_status FROM "Claim" WHERE "id" = claim_id;
  IF claim_status IS NOT NULL AND claim_status <> 'draft' THEN
    IF TG_OP = 'UPDATE' AND NEW."paidMinor" IS DISTINCT FROM OLD."paidMinor"
       AND NEW."chargeMinor" IS NOT DISTINCT FROM OLD."chargeMinor" AND NEW."units" IS NOT DISTINCT FROM OLD."units"
       AND NEW."revenueCode" IS NOT DISTINCT FROM OLD."revenueCode" AND NEW."hippsCode" IS NOT DISTINCT FROM OLD."hippsCode"
       AND NEW."claim" IS NOT DISTINCT FROM OLD."claim" THEN
      RETURN NEW; -- only the paid amount moves, by posting
    END IF;
    PERFORM "senior_care_raise"('A claim''s lines are frozen once it is validated.');
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ClaimLine_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ClaimLine" FOR EACH ROW EXECUTE FUNCTION "senior_care_claim_line_guard"();

-- Ancillary invoices: the amount never changes, nothing is deleted, a paid invoice is final.
CREATE FUNCTION "senior_care_ancillary_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('An invoice is never deleted.'); END IF;
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" OR NEW."vendor" IS DISTINCT FROM OLD."vendor" OR NEW."invoiceNumber" IS DISTINCT FROM OLD."invoiceNumber" THEN
    PERFORM "senior_care_raise"('An invoice''s amount, vendor and number never change.');
  END IF;
  IF OLD."status" = 'paid' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    PERFORM "senior_care_raise"('A paid invoice is final.');
  END IF;
  IF NEW."status" IN ('approved', 'paid') AND NEW."approvedBy" IS NOT NULL AND NEW."approvedBy" = NEW."receivedBy" THEN
    PERFORM "senior_care_raise"('The person who entered an invoice cannot approve it.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AncillaryInvoice_guard" BEFORE UPDATE OR DELETE ON "AncillaryInvoice" FOR EACH ROW EXECUTE FUNCTION "senior_care_ancillary_guard"();
CREATE UNIQUE INDEX "AncillaryInvoice_vendor_number_unique" ON "AncillaryInvoice" ("vendor", "invoiceNumber");

-- Time corrections and timecards: the person who asked or submitted is never the one who approves.
ALTER TABLE "TimeCorrection" ADD CONSTRAINT "TimeCorrection_requester_not_approver" CHECK ("status" = 'requested' OR "decidedBy" IS NULL OR "decidedBy" IS DISTINCT FROM "requestedBy");
ALTER TABLE "Timecard" ADD CONSTRAINT "Timecard_submitter_not_approver" CHECK ("approvedBy" IS NULL OR "approvedBy" IS DISTINCT FROM "submittedBy");
CREATE UNIQUE INDEX "Timecard_staff_week_unique" ON "Timecard" ("staffMember", "weekStart");
CREATE UNIQUE INDEX "StaffMember_community_employee_unique" ON "StaffMember" ("community", "employeeId");
CREATE UNIQUE INDEX "PbjQuarter_community_quarter_unique" ON "PbjQuarter" ("community", "federalFiscalYear", "quarter");
CREATE UNIQUE INDEX "NhsnExport_community_week_unique" ON "NhsnExport" ("community", "weekStart");
CREATE UNIQUE INDEX "JobCode_community_code_unique" ON "JobCode" ("community", "code");

-- A timecard that feeds an exported PBJ file is not edited after approval.
CREATE FUNCTION "senior_care_timecard_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A timecard is never deleted.'); END IF;
  IF OLD."status" IN ('approved', 'exported') AND (NEW."dayMinutes"::text IS DISTINCT FROM OLD."dayMinutes"::text OR NEW."totalMinutes" IS DISTINCT FROM OLD."totalMinutes") THEN
    PERFORM "senior_care_raise"('An approved timecard is is not edited.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Timecard_guard" BEFORE UPDATE OR DELETE ON "Timecard" FOR EACH ROW EXECUTE FUNCTION "senior_care_timecard_guard"();
