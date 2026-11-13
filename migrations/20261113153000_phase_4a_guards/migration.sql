-- ── Phase 4a guards (hand-written; the same style as phase_3b_money_guards) ─────────────────────────────

-- One current PDPM classification per assessment.
CREATE UNIQUE INDEX "PdpmClassification_one_current_per_assessment" ON "PdpmClassification" ("assessment") WHERE "status" = 'current';

-- A PDPM classification is immutable. The only change allowed is current -> superseded (with the row that replaces it).
CREATE FUNCTION "senior_care_pdpm_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A PDPM classification is never deleted; a correction supersedes it.'); END IF;
  IF NEW."hipps" IS DISTINCT FROM OLD."hipps" OR NEW."cmi" IS DISTINCT FROM OLD."cmi" OR NEW."groups" IS DISTINCT FROM OLD."groups"
     OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom" OR NEW."assessment" IS DISTINCT FROM OLD."assessment"
     OR NEW."inputHash" IS DISTINCT FROM OLD."inputHash" OR NEW."mappingVersion" IS DISTINCT FROM OLD."mappingVersion" THEN
    PERFORM "senior_care_raise"('A PDPM classification is fixed; a correction writes a new one.');
  END IF;
  IF OLD."status" = 'superseded' AND NEW."status" <> 'superseded' THEN PERFORM "senior_care_raise"('A superseded classification stays superseded.'); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PdpmClassification_guard" BEFORE UPDATE OR DELETE ON "PdpmClassification" FOR EACH ROW EXECUTE FUNCTION "senior_care_pdpm_guard"();

-- An MDS record is never deleted. Once completed its items, ARD and kind are fixed: a correction is a new record.
CREATE FUNCTION "senior_care_mds_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('An MDS record is never deleted; correct it or mark it entered in error.'); END IF;
  IF OLD."status" <> 'in_progress' AND (NEW."items" IS DISTINCT FROM OLD."items" OR NEW."ardDate" IS DISTINCT FROM OLD."ardDate"
     OR NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."resident" IS DISTINCT FROM OLD."resident" OR NEW."hipps" IS DISTINCT FROM OLD."hipps") THEN
    PERFORM "senior_care_raise"('A completed MDS record is fixed; make a correction.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MdsAssessment_guard" BEFORE UPDATE OR DELETE ON "MdsAssessment" FOR EACH ROW EXECUTE FUNCTION "senior_care_mds_guard"();

-- A submission file is what was uploaded: its hash and payload never change, and it is never deleted.
CREATE FUNCTION "senior_care_mds_submission_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('An MDS submission is never deleted.'); END IF;
  IF NEW."fileHash" IS DISTINCT FROM OLD."fileHash" OR NEW."payload" IS DISTINCT FROM OLD."payload" THEN
    PERFORM "senior_care_raise"('An MDS submission file is fixed once made.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MdsSubmission_guard" BEFORE UPDATE OR DELETE ON "MdsSubmission" FOR EACH ROW EXECUTE FUNCTION "senior_care_mds_submission_guard"();

-- A published reference rate never changes or disappears; a new release is a new row with its own dates.
CREATE FUNCTION "senior_care_reference_rate_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM "senior_care_raise"('A reference rate is never deleted; publish a new one.'); END IF;
  IF NEW."rate" IS DISTINCT FROM OLD."rate" OR NEW."component" IS DISTINCT FROM OLD."component" OR NEW."geography" IS DISTINCT FROM OLD."geography"
     OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom" OR NEW."laborShare" IS DISTINCT FROM OLD."laborShare" THEN
    PERFORM "senior_care_raise"('A reference rate is fixed; publish a new one.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ReferenceRate_guard" BEFORE UPDATE OR DELETE ON "ReferenceRate" FOR EACH ROW EXECUTE FUNCTION "senior_care_reference_rate_guard"();

-- Prior-days evidence is append-only.
CREATE FUNCTION "senior_care_prior_days_guard"() RETURNS trigger AS $$
BEGIN
  PERFORM "senior_care_raise"('Prior SNF days evidence is append-only; record a new observation.');
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PriorSnfDaysObservation_guard" BEFORE UPDATE OR DELETE ON "PriorSnfDaysObservation" FOR EACH ROW EXECUTE FUNCTION "senior_care_prior_days_guard"();

ALTER TABLE "PriorSnfDaysObservation" ADD CONSTRAINT "PriorSnfDaysObservation_days_range" CHECK ("daysUsed" BETWEEN 0 AND 100);
ALTER TABLE "CoveragePeriod" ADD CONSTRAINT "CoveragePeriod_hospice_bps_range" CHECK ("hospiceRoomBoardBps" IS NULL OR "hospiceRoomBoardBps" BETWEEN 0 AND 10000);
ALTER TABLE "MdsAssessment" ADD CONSTRAINT "MdsAssessment_correction_number" CHECK ("correctionNumber" >= 0);
