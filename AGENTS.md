# AGENTS.md

NEVER build outbox/texting/email notification machinery, cron, worker services, or setInterval/setTimeout loops (including in `instrumentation.ts`). External events = Openfront Commerce webhooks (features/webhooks) only.

Time-based state (overdue compliance clocks, expired reservations, waitlist offers, tour holds, break-glass grants, the midnight census) is advanced idempotently on the request that touches it (`advanceTimedStates` in `features/keystone/lib/maintenance.ts`, called from the dashboard read helper, every domain command and the public storefront read) or by the staff "Refresh" button on Today. Reports are Export buttons; invites are copyable links.
