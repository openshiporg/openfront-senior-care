-- Phase 5 guards (shifts, credentials, agency, staffing, payroll). Hand-written, in the style of the 4b guards.
-- New objects only: nothing here drops, deletes or updates existing rows.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- One person cannot hold two overlapping active assignments (offers and closed assignments do not count).
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_no_overlap"
  EXCLUDE USING gist ("staffMember" WITH =, tsrange("startsAt", "endsAt") WITH &&)
  WHERE ("status" IN ('accepted', 'assigned', 'started'));

ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_window_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_window_check" CHECK ("endsAt" > "startsAt" AND "required" >= 1);

-- A person is on a shift once.
CREATE UNIQUE INDEX "ShiftAssignment_shift_staff_open_unique" ON "ShiftAssignment" ("shift", "staffMember")
  WHERE ("status" IN ('offered', 'accepted', 'assigned', 'started', 'completed'));

-- Verification evidence is append-only: a re-check is a new row.
CREATE TRIGGER "CredentialVerification_append_only" BEFORE UPDATE OR DELETE ON "CredentialVerification" FOR EACH ROW EXECUTE FUNCTION "senior_care_append_only"();

-- A verified credential carries evidence: a verified status is only reachable with a verification row behind it.
CREATE FUNCTION "senior_care_credential_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A credential is never deleted.'); END IF;
  IF NEW."status" = 'verified' AND OLD."status" IS DISTINCT FROM 'verified' AND NOT EXISTS (
    SELECT 1 FROM "CredentialVerification" WHERE "credential" = NEW."id" AND "result" = 'clear'
  ) THEN
    PERFORM "senior_care_raise"('A credential is verified only with a clear verification on file.');
  END IF;
  IF NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."staffMember" IS DISTINCT FROM OLD."staffMember" THEN
    PERFORM "senior_care_raise"('A credential''s kind and person never change.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Credential_guard" BEFORE UPDATE OR DELETE ON "Credential" FOR EACH ROW EXECUTE FUNCTION "senior_care_credential_guard"();

-- The same LEIE file is imported once per community, and one month once.
CREATE UNIQUE INDEX "LeieImport_community_hash_unique" ON "LeieImport" ("community", "fileHash");
CREATE UNIQUE INDEX "LeieImport_community_month_unique" ON "LeieImport" ("community", "month");

-- One invoice number per vendor; one staffing day per community and date; one export per period.
CREATE UNIQUE INDEX "AgencyInvoice_vendor_number_unique2" ON "AgencyInvoice" ("vendor", "invoiceNumber");
CREATE UNIQUE INDEX "StaffingDay_community_date_unique" ON "StaffingDay" ("community", "date");
CREATE UNIQUE INDEX "PayrollExport_community_period_unique" ON "PayrollExport" ("community", "periodStart", "periodEnd");

-- A payroll export is final once locked: its file and period never change, and it is never deleted.
CREATE FUNCTION "senior_care_payroll_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A payroll export is never deleted.'); END IF;
  IF NEW."csvHash" IS DISTINCT FROM OLD."csvHash" OR NEW."periodStart" IS DISTINCT FROM OLD."periodStart" OR NEW."periodEnd" IS DISTINCT FROM OLD."periodEnd" OR NEW."rows" IS DISTINCT FROM OLD."rows" THEN
    PERFORM "senior_care_raise"('A locked payroll period''s file never changes.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PayrollExport_guard" BEFORE UPDATE OR DELETE ON "PayrollExport" FOR EACH ROW EXECUTE FUNCTION "senior_care_payroll_guard"();

-- Staffing targets: a repealed rule stays as history and its value and metric never change.
CREATE FUNCTION "senior_care_target_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A staffing target is retired, never deleted.'); END IF;
  IF NEW."metric" IS DISTINCT FROM OLD."metric" OR NEW."value" IS DISTINCT FROM OLD."value" OR NEW."source" IS DISTINCT FROM OLD."source" THEN
    PERFORM "senior_care_raise"('A staffing target''s metric, value and source never change; add a new target.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StaffingTarget_guard" BEFORE UPDATE OR DELETE ON "StaffingTarget" FOR EACH ROW EXECUTE FUNCTION "senior_care_target_guard"();
