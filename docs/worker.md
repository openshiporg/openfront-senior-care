# Background worker

Scheduled jobs and the outbox run in one worker loop (`features/keystone/lib/worker.ts`). Each tick runs every 30 seconds.

**1. Scheduled jobs.** These come from `runDueJobs`. Each runs under its own lease with a fencing token and writes a JobRun row:

| Job | What it does |
| --- | --- |
| `clock_sweep` | Marks compliance clocks overdue and escalates them. |
| `reservation_expiry` | Expires reservations whose hold has run out. |
| `waitlist_offer_expiry` | Moves offers from offered to expired and releases the apartment or bed. |
| `tour_hold_expiry` | Cancels web tour requests that nobody confirmed in time. |
| `break_glass_expiry` | Ends break-glass grants whose window has closed. |
| `midnight_census` | Takes the census for each community's previous local day. |

When one job fails, the error goes on its JobRun and the remaining jobs still run.

**2. Outbox drain.** The worker claims messages with `FOR UPDATE SKIP LOCKED` and a lease. It works for up to 20 seconds per tick, and anything left waits for the next tick. Handlers live in `features/keystone/lib/outboxHandlers.ts`, one per topic. A topic without a handler fails and is retried with backoff until it is marked dead, so it can't disappear silently.

- **Staff tasks** (`task.*`, `clock.overdue`, `notify.approval`, `housekeeping.turnover`, `privacy.*`, `portal.*`) become in-app Notifications. They go to active staff who hold the right permission and are assigned to the community, or who have operator-wide access. Each notification is created once per message and recipient. Payloads carry references and plain wording, never PHI.
- **`availability.changed`** recomputes the public availability counts for the storefront.
- **`portal.invite_representatives`**, sent on admission, asks Social Services to invite the family. The worker doesn't invite them itself, because inviting is a person's act: someone checks the authority documents first.
- **Mail** (`mail.tour_requested`, `mail.tour_confirmed`, `mail.portal_invitation`) goes through SMTP. Each attempt is recorded as a Notification plus a NotificationDelivery, and an email that was sent is never sent again.
  - Synthetic recipients are never mailed.
  - Without SMTP the attempt is recorded as failed and the queue keeps moving.
  - The portal invitation token is removed from the outbox row once it has been handled.

## Where it runs

- **In the web process.** By default, `instrumentation.ts` starts the loop in production. It uses its own pool of 3 connections and starts 10 seconds after boot. Set `WORKER_IN_PROCESS=0` to turn it off, or `WORKER_IN_PROCESS=1` to run it under `next dev`.
- **As its own service.** Run `npm run worker`, or `npm run worker -- --once` for a single tick. It stops after the current tick on SIGTERM.

Leases make any number of copies safe.

## Health

`GET /api/health` returns 200 while the database answers. The response looks like this:

```json
{ "status": "ok", "database": "ok", "ok": true,
  "worker": { "status": "running", "lastTickAt": "…", "failing": false,
              "outbox": { "pending": 0, "failed": 0, "dead": 0, "oldestPendingSeconds": null } } }
```

`worker.status` is one of three values:

- `running`: the last tick was within 90 seconds.
- `stalled`: the last tick was longer ago than that.
- `never_ran`: the worker has never ticked.

`ok` is false unless the worker is running and the last tick had no failed job. The response never includes error text, ids or PHI.

## Environment

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Outgoing mail. Without `SMTP_HOST` and `SMTP_FROM`, mail is recorded and not sent. |
| `PORTAL_ACCEPT_URL` | The family portal page that accepts `?token=`. Without it, invitations are recorded and not sent. |
| `WORKER_IN_PROCESS` | `0` turns off the in-process loop; `1` runs it in development. |
