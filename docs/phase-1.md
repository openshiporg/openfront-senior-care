# Phase 1: places, census, residents, representatives, front of house

This phase builds the platform spine and the system of record for who lives where. The public storefront and the family portal ship as APIs here; their screens come later.

## Census

- **One write path.** Every admission, room change, leave, return, discharge and death is a server command (`features/keystone/lib/census.ts`). The command records a hash-chained `CensusEvent`, updates the stay projection and reconciles the bed or apartment in the same transaction, along with the audit event and outbox messages. Status fields can't be edited directly.
- **Bed and apartment status are projections.** A released bed goes to `cleaning` and an emptied apartment to `turnover`. A person marks it ready (`markPlaceReady`).
- **Midnight census.** A resident counts for a day if present at 23:59 local time. `snapshotCensusDay` records a day and `signOffCensusDay` closes it and every earlier day (by a person, never an agent). Changes to a closed day need a census correction approved by a second person.
- **Back-dating.** A back-dated event needs `late: true` and is marked on the events screen. Events more than five minutes in the future are refused.
- **Notices and clocks.** Bed-hold, transfer/discharge (with the Ombudsman copy), privacy-practices and admission-agreement deadlines come from the jurisdiction packs (`seed/packs.ts`, each rule with its citation and a `verifyNote`). Recording the notice closes its clock; the sweep marks missed ones overdue.
- **Concurrency.** Census and money commands run at Serializable isolation with bounded retries. Places are locked with sorted advisory locks. Every command takes an idempotency key, and a replay returns the first answer.

## Sales and the storefront

- Inquiry → lead → tour → waitlist → offer → reservation → admission. The lead moves to `moved_in`, the waitlist entry to `converted` and a referral to `admitted` only through admission.
- Public calls (`submitInquiry`, `requestTour`, `joinWaitlist`, `storefrontCommunity`, `cancelTourByToken`) are rate-limited per hashed address and carry a honeypot field. Tokens are HMAC-signed and expiring, and only their SHA-256 is stored.
- Publishing the site, moving a price and making a waitlist offer are human-only commands. MCP sessions are refused, even a person's own.

## Family portal (APIs)

- A representative is invited by email (`invitePortalRepresentative`) and sets a password with the link. The link's token exists only in the mail message.
- `updates` is granted at once. Other scopes are proposed by one person and granted by a second, within the authority of the representative's role (POA, guardian, responsible party). Clinical and financial scopes need two-step sign-in.
- `portalMe`, `portalUpdates`, `portalCalendar` and `portalDocuments` return only granted data, never room numbers or other residents. Each read writes a `PhiReadAudit` row with purpose `family_access`. A missing grant reads as not found.

## Dashboard

| Screen | Route |
| --- | --- |
| Today (census strip, deadlines, recent changes) | `/dashboard` |
| Bed board | `/dashboard/platform/census` |
| Residents and face sheet | `/dashboard/platform/census/residents` |
| Census events | `/dashboard/platform/census/events` |
| Midnight census | `/dashboard/platform/census/midnight` |
| Pipeline (referrals, tours, leads) | `/dashboard/platform/sales` |
| Waitlist | `/dashboard/platform/sales/waitlist` |
| Storefront editor | `/dashboard/platform/sales/storefront` |
| Compliance clocks | `/dashboard/platform/compliance` |
| Approvals | `/dashboard/platform/approvals` |
| Break-glass | `/dashboard/platform/privacy/break-glass` |
| Audit log | `/dashboard/platform/audit` |

## Loading a community

The onboarding dialog loads the operator, then the Maple Ridge community (`synthetic = true`) and its census history. The history replays real commands in time order: admissions, room changes, hospital leaves with bed holds, discharges, deaths, sales, the waitlist, portal invitations and sign-offs. That way every projection, clock and audit row is the same as in live use. The load is resumable: each request runs as many steps as fit in nine seconds, and a repeat request picks up where the last one stopped. No email is sent to the seeded families.

## Tests

- `npm run verify`: typecheck, lint, unit tests and node tests.
- Database suites (set `SC_TEST_DATABASE_URL` to a scratch Postgres schema):
  - `mutations/census.db.test.ts`: admit → room change → hospital leave with bed hold → return → discharge, the midnight census and a closed-period correction.
  - `mutations/frontOfHouse.db.test.ts`: storefront → tour → waitlist → offer → admission, and portal scopes.
  - `seed/census.db.test.ts`: the community load reconciles and a second run is a no-op.
  - `lib/platform.db.test.ts`
