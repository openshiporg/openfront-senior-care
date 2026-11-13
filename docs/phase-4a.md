# Phase 4a: MDS, PDPM and Medicare Part A

Every resident in the seed and the tests is invented. Rates and tables are FY2026 and carry a `verifyNote` wherever a figure was not confirmed against the published source.

## What it does
- **MDS 3.0** item sets V1.19.1 and V1.20.1 are `AssessmentTemplate` versions (scorer `mds`), chosen by the ARD. OBRA, PPS, IPA, entry, discharge and death windows are computed on read (`mds/schedule.ts`), with no job. Section signatures, CAA triggers, the local spec edits and the iQIES export file (`manual_export`, deterministic stored ZIP) are in `mds/`. Staff download the file, upload it to iQIES themselves and paste the FVR text back; `parseFvr` marks each record accepted or rejected.
- **PDPM** (`pdpm/`): PT, OT, SLP, Nursing and NTA groups, HIPPS (letters pinned to the CMS order), the AIDS NTA split, VPD and the interrupted-stay rule (3 days). Rates are `decimal.js` strings; money is BigInt minor units. Each component is rounded half-even to the cent, then summed. Tables live in `PdpmMappingVersion` and `ReferenceRate`; classifications are immutable and one is current per assessment.
- **Medicare A depth** (`coverage/`, `billing/medicare.ts`): qualifying-stay evidence, skilled certification, prior SNF days from HETS/CWF, days 1-20 full, 21-100 coinsurance, 101 not covered. The benefit-day count and the NOMNC/SNFABN 2-day clock are computed on read; `BenefitPeriodCounter` is only a hash-keyed cache. Ending Part A needs the notice on file two days ahead, or a reason from a closed list. Hospice election is a `CoveragePeriod` with a room-and-board pass-through in basis points. MA authorisations and concurrent review have reference numbers and a due date.
- **Billing** takes covered days into the Phase 3 derivation as an opt-in input, so Phase 3 hashes are unchanged. A back-dated correction creates a new MDS record (correction number + 1) that supersedes the old record and its classification; `billing.adjust_closed` supersedes the affected charge lines and links the replacements. A billed amount is never edited (the database refuses it).
- **Screens** (dashboard only, no storefront or portal): MDS calendar, MDS assessment, PDPM and Coverage under `/dashboard/platform/mds`, in `navigation.ts`. Reads go through GraphQL; PHI goes through `phiGatedFields`, which also gates filter and order; the iQIES download route writes a `PhiReadAudit` row.
- **Data**: onboarding op `loadMdsSetup` (item sets, FY2026 tables, CBSA, and 12 invented Part A residents whose assessments are the golden PDPM cases written as MDS items). The onboarding dialog has an "MDS, PDPM and Medicare Part A" section that calls it.

## Migrations
- `20261113152147_phase_4a_mds_pdpm_medicare`: 9 CREATE TABLE, and an **ALTER of the existing `CoveragePeriod`** (ADD COLUMN `endOverrideReason`, `hospiceAgency`, hospice and last-covered-day fields, plus foreign keys). The spurious `DROP INDEX "PaymentAllocation_payment_statement_unique"` that Prisma generated was removed by hand before the migration was committed.
- `20261113153000_phase_4a_guards`: partial unique index (one current classification per assessment), immutability triggers on `PdpmClassification`, `MdsAssessment` (items, once completed), `MdsSubmission` and `ReferenceRate`, append-only `PriorSnfDaysObservation`, CHECKs.
- Nothing is dropped, deleted or updated in existing data.

## Tests
- Unit: `pdpm/golden.test.ts` (12+ golden cases, plus each written as MDS items), `mds/mds.test.ts`, `billing/medicare.test.ts` (January 2026 day 1 = $728.29, coinsurance from day 21; day 100 = 2026-04-14; interrupted-stay 3-day gap vs 4-day gap; hospice 9500 bps), `coverage/*.test.ts`.
- `mutations/phase4a.db.test.ts` (6 tests, ~9 min on the remote scratch DB): golden cases as completed MDS records; per-role denials; export passes the edits, FVR accepted, download audited and refused to others; PHI filter/order probes; NOMNC guard and clock; back-dated correction in a closed month supersedes and adjusts without editing a billed charge.
- `npm run verify`: 137 passed, 60 skipped (database suites need `SC_TEST_DATABASE_URL`).
- Fleet crawl (`fastcrawl.py`, `next build --webpack` + `next start`, 4 roles, `--workers 1`): 39 checks, 0 failures. With 8 workers the scratch database's connection limit gave two 500s on pre-existing census and compliance pages; they passed on a re-run. The `nope123` 404 probe is not met by the existing census and compliance routes (307), and the 4a routes behave the same.

## Open items (verify)
- Labor share 70.2%, the 3-day interrupted-stay window, the starter ICD-10 map, function-score rounding, CAA triggers, schedule windows, the XML layout and FVR parsing are built from the training material and carry `verifyNote`s. Replace with the published figures before a real submission.
- FY2027 rates are not loaded: a month after 2026-09-30 reports `missing_rate` until a version is loaded.
- Claims (837I/835), PBJ and NHSN are Phase 4b.
- No live deployment was made for this brief (see the report).
