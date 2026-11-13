# Phase 4b: claims, PBJ and NHSN

Every resident, employee and identifier in the seed and the tests is invented. Nothing here transmits: each file is an Export button, and each response is a file a person uploads back.

## What it does
- **Claims** (`claims/`): a Part A claim is derived from the month's live `per_diem_claim` and `coinsurance` charges, grouped into one line per HIPPS run (revenue code 0022). The type of bill frequency comes from the stay's position (first, interim, last). The scrubber checks NPIs (Luhn), MBI shape, CCN, ZIP+4, occurrence span 70, value code 80 against covered days from the census projection, revenue codes, HIPPS, diagnoses, the attending provider and the previous month's claim. `draft → validated → released` is maker-checker (`canManageClaims` validates, `canReleaseClaims` releases, never the same person).
- **837I** (`edi837.ts`): 5010 X223A2, exported as a file. `released → submitted` is a person's statement that they uploaded the file with the exact hash they downloaded. Nothing becomes `accepted` or `paid` without a 277CA or an 835.
- **Responses** (`parsers.ts`): 999, 277CA and 835 are parsed from a staff upload. A 277CA names each claim it accepts or rejects.
- **835 posting**: idempotent on payer + trace number (a repeat returns the first import; the same trace with a different file is refused). CAS groups CO/PR/OA/PI are split into contractual, patient responsibility and other. Posting is all-or-nothing: any blocking exception (total mismatch, unknown claim, billed amount differs, claim not payable, over-credit) leaves the whole remittance at `matched`. `RemittancePosting` is append-only, and a trigger refuses a posting that would pay more than the claim or the remittance holds.
- **Denials**: a denied or zero-paid claim enters a work queue (working, appealed, resolved, written off), each step with a note.
- **Ancillary invoices**: received, matched (to the Part A claim covering the service date when consolidated billing applies), approved by someone other than the receiver, paid.
- **PBJ** (`pbj/`): job codes mapped to CMS job titles, staff, punch import (idempotent per punch), punch corrections (requester is not approver), weekly timecards with overnight shifts split at local midnight, and the federal fiscal quarter. Build and validate lists unmapped job codes, unapproved timecards, agency hours without an employee id and census days with no hours. The XML is validated against the CMS `nhpbj_4_10_0.xsd` before it can be exported.
- **NHSN** (`nhsn/`): the weekly LTC respiratory pathogens and vaccination CSV (March 2026 layout), counted from `Immunisation` and `InfectionCase`, with the rules of the layout file enforced before a file exists. The template note says to confirm the current layout before each season.
- **Screens** (dashboard only): Claims, Staffing and PBJ, NHSN weekly report, in `navigation.ts`. PHI goes through `phi()` tiers, filter and order are gated like read, claim downloads write `PhiReadAudit`, and raw file text is never exposed through GraphQL.

## Migrations
- `20261113200950_phase_4b_claims_workforce`: 12 CREATE TABLE (Claim, ClaimLine, Remittance, RemittancePosting, AncillaryInvoice, JobCode, StaffMember, TimePunch, TimeCorrection, Timecard, PbjQuarter, NhsnExport). No change to existing tables.
- `20261113210000_phase_4b_guards`: Remittance (payer, trace) unique, append-only triggers on RemittancePosting and TimePunch, guards for posting, remittance, claim, claim line, ancillary invoice and timecard, requester/approver CHECKs.
- Nothing is dropped, deleted or updated in existing data.

## Tests
- Unit: `claims/claims.test.ts`, `pbj/pbj.test.ts` (including xmllint against the CMS XSD), `nhsn/rpv.test.ts`.
- `mutations/phase4b.db.test.ts` (6 tests): claim from live Part A lines, scrub failure then pass, maker-checker, 837I validated by pyx12 when `PYX12_PYTHON` points at a pyx12 venv, hash-checked submission, 277CA acceptance, 835 reconcile and repeat, over-credit refusal, append-only posting, timecards and PBJ, NHSN, per-role reads, filter/order probes and audited download.

## Open items (verify)
- The Medicare contractor's electronic payer ID, taxonomy, EIN and ZIP+4 are entered on the Claims screen; the seed values are invented.
- Prior-stay and condition codes beyond the ones built are not derived.
- NHSN therapeutics and hospitalisation columns are written as the layout's "none reported" values until a source for them exists.
- The NHSN layout changes by season: check the template before uploading.
