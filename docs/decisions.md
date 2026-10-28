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
