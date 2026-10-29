# Decision log

One line per decision. Newest items go at the bottom.

- Item 0 (task status): no code change. The status select in `TasksView` already calls `mirrorTaskStatus`; verified in the browser that a change to `doing` sends `POST /api/backend/project-records/{project}/tasks/{task}/status` (200), the server returns `doing`, and the value survives reload.
- Item 0 (test data): verification used a test owner and test person in the local demo tenant; the browser test data was not committed.
- Item 1 (scope): this commit moves budget draws and releases to the server only. Invoices, payments, bills, credit notes and fund-request allocation are not moved yet and still change the browser store.
- Item 1 (money): budget amounts are whole paise in BIGINT columns with CHECK constraints (no negative balance, drawn never above allocated). The API takes integer paise; the screen converts rupees to paise once, at the request.
- Item 1 (concurrency): a draw or release locks its budget line with `SELECT ... FOR UPDATE`, checks what is left, writes the movement and updates the balance in one transaction.
- Item 1 (idempotency): draws and releases require an `Idempotency-Key` header, unique per tenant. A replay with the same line and amount returns the first result with 200; the same key with a different amount or line returns 409 `idempotency_conflict`. The browser sends a new key per click, so two separate clicks are two requests; a double click is blocked while the first is in flight.
- Item 1 (audit): each movement writes an audit row (`finance.budget_draw`, `finance.budget_release`, `finance.budget_allocation`, `finance.budget_line_created`). No timeline event is written, because budget lines belong to no project.
- Item 1 (demo mode): demo mode keeps the local path. In real mode the store's `drawBudget` and `releaseBudget` refuse, so budget money can only move through the server helper in `lib/finance-records.ts`.
- Item 1 (project flows): creating a project and closing a project now await the server draw and release. Creating a project checks its fields before the draw, so a refused project never moves money.
- Item 1 (test cleanup): the test cleanup truncates the two finance tables, because they reference tenants without a user foreign key that the existing cleanup relies on.
- Item 1 (known gaps): the draws list is a local copy; lines are created on the server when the screen first loads.
- Item 1 (fund allocation): approving a fund request calls `POST .../allocations` before its approval is recorded. The request id is the idempotency key (`fund-<id>`), so a retry or a double click allocates once. A failed allocation leaves the request as it was.
- Item 1 (movement kinds): migration 0021 adds `kind` (`draw`, `release`, `allocation`) with checks that tie each kind to its sign. Existing rows are backfilled from the sign of their amount, which is additive and drops no data.
- Item 1 (still local): invoices, payments, bills, credit notes, and the fund request workflow itself (who approved, status) are still stored in the browser store. Only the money moves are on the server. The draws list on screen is a local copy.
- Item 3 (transport): timeline entries arrive over server-sent events at `GET /v1/project-timelines/{key}/stream`. The browser opens it through the bridge with `EventSource`. The bridge streams the body without buffering and without the 45-second request timeout, and forwards `Last-Event-ID`.
- Item 3 (server loop): the stream reads new entries once a second in its own transaction under the member's tenant context. A non-member or removed member gets a `closed` event and the stream ends. This is a short database poll on the server, not on the browser; LISTEN/NOTIFY would remove even that and is a follow-up.
- Item 3 (resume): each entry is sent with its id. A reconnect sends `Last-Event-ID`, so entries are neither missed nor repeated. The stream ends after 5 minutes and the browser reconnects.
- Item 3 (fallback): polling every 8 seconds runs only while the stream is down, and stops when the stream opens again. Entries are added once by id, so the stream and a catch-up read cannot duplicate one.
- Item 3 (verified): a message posted by the API appeared on screen without a reload; the browser made no entry polls over 17 seconds while the stream was open. The fallback path was not exercised in the browser (it needs the stream to fail), so it is covered by code reading only.
- Item 2 (IT changes): IT change requests are a table on the server (`it_changes`), numbered per company as CHG-1002 onward. Request, decision and completion each need `settings:manage`, the permission the IT screen checks. A requester cannot decide their own change, a change is decided once, and only an approved change can be completed.
- Item 2 (timeline events): the timeline is for projects, and IT changes belong to no project. Each step therefore writes an audit row in its own transaction, not a timeline event. Modules without a project use the audit log as their history.
- Item 2 (names): the server returns the requester's and decider's names, because the screens show names and the users are looked up on the server.
- Item 2 (still local): the IT change log on screen and the other IT records (assets, access, licences, helpdesk, incidents, monitors) are still in the browser store. Operations, HR and Support are not started.
- Item 4 (scope): tickets only. The server holds each ticket's number, subject, priority, status, assignee and resolution. Conversations, handoffs, SLA timers and the customer link stay on the screen.
- Item 4 (permission): `agents:manage`, so owners and admins can change tickets and agents are refused. No support permission exists, and adding one needs role changes; switch to `leads:write` if agents should work tickets.
- Item 4 (order): each change goes to the server first, and the screen changes only after the server accepts it.
- Item 4 (keys): the screen's ticket id is the server's external key. Creating the same key again returns the existing ticket with 200, so a retry books it once.
- Item 4 (sync): on load the screen sends any ticket the server does not have yet, and copies the server's status, assignee and resolution onto its tickets. A refused create stays on screen and the next sync sends it.
- Item 4 (assignee): stored as the screen's user id text, not a foreign key, because the screen's user ids are not server user ids.
- Item 4 (audit): each step writes one audit row (`support.ticket_created`, `support.ticket_status_changed`, `support.ticket_assigned`, `support.ticket_resolved`) in the same transaction.
- Item 4 (cross-browser): a ticket opened in another browser appears here only after it exists on this screen.
- Item 4 (pre-existing gap, not changed): CRM records, including tickets, are shown only for a demo persona in the browser (`janus.demo-login`), so a real account sees no tickets on the Tickets screens. Browser checks used the bridge for the status steps.
