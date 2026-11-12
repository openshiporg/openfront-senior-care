-- Phase 2 r1 guards.

-- SM §9.5: an open count discrepancy freezes routine doses from that supply. The service refuses first (lib/clinical/medications.ts
-- postMovement, under the supply row lock); this trigger refuses any other writer. An emergency dose must carry its reason.
CREATE OR REPLACE FUNCTION sc_frozen_supply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" = 'administer' AND NOT NEW."emergency"
     AND EXISTS (SELECT 1 FROM "CountDiscrepancy" d WHERE d."supply" = NEW."supply" AND d."status" = 'open') THEN
    RAISE EXCEPTION 'MedicationSupply % has an open count discrepancy: only an emergency dose may be administered', NEW."supply" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."emergency" AND (NEW."kind" <> 'administer' OR length(btrim(NEW."emergencyReason")) < 10) THEN
    RAISE EXCEPTION 'An emergency movement must be an administer with a reason' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "MedicationSupplyMovement_frozen_supply" BEFORE INSERT ON "MedicationSupplyMovement" FOR EACH ROW EXECUTE FUNCTION sc_frozen_supply();

-- SCHEMA §14.9: the inference log is evidence. Rows are inserted once (allowed, refused or failed) and never changed.
CREATE TRIGGER "InferenceCall_append_only" BEFORE UPDATE OR DELETE ON "InferenceCall" FOR EACH ROW EXECUTE FUNCTION sc_forbid_change();
CREATE TRIGGER "InferenceCall_no_truncate" BEFORE TRUNCATE ON "InferenceCall" FOR EACH STATEMENT EXECUTE FUNCTION sc_forbid_change();
