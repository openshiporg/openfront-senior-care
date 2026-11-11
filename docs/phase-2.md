# Phase 2: clinical core, eMAR, incidents, IPAC basics, first workflows

Builds on Phase 1 (commit `280c5d4`: time-based states advance on read, plus the Refresh button). No timer, job, cron, outbox or sent message exists. Escalations and notifications are tasks in the staff inbox.

## What shipped
- **Clinical record** (`lib/clinical/record.ts`): progress notes (sign, amend, entered-in-error), vitals, intake, ADL (completes the point-of-care slot), wounds, behaviour, physician visits.
- **Assessments** (`assessments.ts`): Zod-defined templates with a scorer registry. Seeded: Braden, Morse, BIMS, PHQ-9 (item 9 opens a same-day task), PAINAD, elopement, Ohio AL (generic). Completing one projects fall/elopement risk onto the resident.
- **Orders and care plans** (`plans.ts`): verbal orders need read-back and a different person's countersignature (24 h task); allergy match needs a stated override; signing a baseline plan satisfies the 48 h clock and generates point-of-care slots.
- **eMAR and controlled substances** (`medications.ts`): slots for a 72 h horizon (unique `slotKey`), hold parameters, window timing, PRN interval and follow-up, an append-only supply ledger with one balance writer (`postMovement`), blind shift count, discrepancy resolved by the DON (not a counter) and a suspected loss opens an incident. `reconstructMedPass` rebuilds a pass dose by dose.
- **Incidents** (`incidents.ts`): F609 2 h / 24 h / 5-day clocks from the allegation, investigations, report drafts, submission satisfies the clock, downgrade is a two-person approval.
- **IPAC** (`ipac.ts`): cases with a cluster check, precautions, antibiotic 72 h time-out, outbreaks, immunisations.
- **Workflows** (`lib/workflows`): four blocks (low fluid intake, weight loss, wound assessment overdue, missed doses). Activation is a two-person approval. The engine runs only on request (findings page load, "Run now", or the mutation that changed source data) and is idempotent per `windowKey`. Findings carry evidence and a task.
- **Screens**: Clinical chart (+ per-resident tabs), eMAR (opening it creates slots and settles missed doses), Controlled counts, Incidents (+ detail), Infection control, Tasks, Findings. Unknown ids are 404.
- **Database guards** (`20261111203000_phase_2_guards`): append-only triggers on administrations, ledger movements and count entries; ledger unique index (mirrored in `COMPOUND_UNIQUES`); CHECK constraints.

## Open items (verify, built generically)
- Ohio self-report rules and the Ohio AL assessment form: generic, flagged in the template and clock `verifyNote`.
- Prescriber countersign tasks use owner role `Prescriber`, which has no seeded role, so they are unassigned.
- Medication references and pharmacy are `manual` adapters only.

## Tests
- `mutations/clinical.db.test.ts` (9 tests, ~5 min on the remote scratch DB; run `timeout 300 npx vitest run <file> --no-file-parallelism` with a longer `--testTimeout`): scoring, care-plan clock, allergy and verbal orders, med pass reconstruction, PRN, controlled ledger and blind count, F609 clocks and downgrade, workflow window idempotency, audit chain.
- Fleet crawl (`fastcrawl.py --nope`): 6 roles, 90 checks, 0 failures.
