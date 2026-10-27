# Pending work plan: Finance, Operations, Projects, Support, IT

Status: plan for review. No code is changed by this document.
Companion to [workspace-rollout.md](workspace-rollout.md). This file lists what is still open after the V1 and V2 builds and the Phase 3 and Phase 4 steps.

Size: S = under half a session, M = about one session, L = two or more sessions.

## 0. Before anything else

| # | Item | Size | Why |
|---|---|---|---|
| 0.1 | Commit the operations gate change in `app/(app)/workspace/[workspaceId]/page.tsx` (operations now needs `stock:adjust`, not `settings:manage`) | S | It is uncommitted. It lets reporting managers into Operations, which was owner-only. |
| 0.2 | Decide the role names in plan §8.6 (`budget:approve`, `invoice:create`, `stock:adjust`, `project:accept`) | S | Defaults are applied but not confirmed by the owner. Permission names are the basis of every gate below. |
| 0.3 | Review the stacked PR chain (#53 to #88) and merge in order | S | Nothing here is on `main` until merged. The owner merges. |

## 1. Verify what is built but not browser-tested

Each check runs as the role that owns the action. Record PASS or FAIL with the screen and the message.

| # | Workspace | Check | Role needed | Size |
|---|---|---|---|---|
| 1.1 | Finance | Multi-line vendor bill matched to a purchase order and goods received | Owner | S |
| 1.2 | Operations | RMA: return authorised, then inspected as damaged; damaged stock must not return to stock | Owner or `stock:adjust` | S |
| 1.3 | Operations | Pick, pack and ship: shipping before packing is refused | Owner or `stock:adjust` | S |
| 1.4 | Projects | Milestone acceptance creates an invoice; a dispute stops billing for that milestone | Projects role (`projects:manage`) | M |
| 1.5 | Projects | Change request approved as a new plan version; the old version is kept | Projects role | S |
| 1.6 | IT | Monitor check opens a critical incident; recovering the monitor closes it | Owner | S |
| 1.7 | IT | Access request resolved grants access; access is listed under the person | Owner | S |
| 1.8 | Support | Ticket escalated appears in the Work inbox as urgent | Owner | S |

Output: a short results file `docs/plans/verification-results.md` with one line per check.

## 2. Close the remaining V1 and V2 gaps

Ordered by value. Each item names what it depends on.

### 2.1 Finance

| # | Item | Size | Depends on | Notes |
|---|---|---|---|---|
| 2.1.1 | Balance sheet (assets, liabilities, equity) from invoices, bills, bank and petty cash | L | Nothing new | Needs a decision on opening balances per company. |
| 2.1.2 | Write-off of an invoice, with approval and an audit entry | M | Approvals queue (exists) | Plan §8.1D step 6. |
| 2.1.3 | Profit and loss by period (not only to date) | S | Nothing new | Add a period picker. |
| 2.1.4 | Payment reminders to customers | M | Notifications (parked, see 4.1) | Do not build before 4.1 is decided. |

### 2.2 Operations

| # | Item | Size | Depends on | Notes |
|---|---|---|---|---|
| 2.2.1 | Reorder level creates a requisition (not an automatic purchase order) | S | Requisitions (exists) | Plan §8.2T. Keeps the approval step. |
| 2.2.2 | Logistics: delivery status and proof of delivery on dispatch | M | Dispatch (exists) | Plan §8.2P step 3 and §8.2U. Some companies need it early; confirm with the owner. |
| 2.2.3 | Supplier bank details: a change needs a second approval | S | Vendor master (exists) | Plan §8.2S. |

### 2.3 Projects

| # | Item | Size | Depends on | Notes |
|---|---|---|---|---|
| 2.3.1 | Project budget draws from a fund allocation (one budget source) | M | Fund allocation (exists) | Plan §9 decision 2. Today the link is partial. |
| 2.3.2 | Project closure releases unused budget back to the fund allocation | S | 2.3.1 | Plan §8.3AE. |

### 2.4 Support

| # | Item | Size | Depends on | Notes |
|---|---|---|---|---|
| 2.4.1 | Health score per customer from tickets, invoices and renewals (simple, rule-based) | M | Renewals, tickets, invoices (exist) | Plan §8.4AH says keep it simple. Define the rules first (see 4.4). |

### 2.5 IT

| # | Item | Size | Depends on | Notes |
|---|---|---|---|---|
| 2.5.1 | Offboarding: an employee leaving has assets returned and access removed | M | HR employee status (exists) | Plan §8.5AI and AK. |
| 2.5.2 | External monitoring (ping or HTTP checks run by a service) | L | A monitoring service and its keys | Out of scope for the preview. Keep the manual register until a backend exists (see 3.1). |

## 3. Backend and persistence (after the screens are accepted)

Per plan §5 step 6, the backend follows the accepted screens. Nothing in this list is started until the owner says so.

| # | Item | Size | Notes |
|---|---|---|---|
| 3.1 | Persist the built stores (Finance, Operations, Projects, Support, IT) to a backend | L | All are in-browser today and reset per browser. |
| 3.2 | Persist CRM and support activity (today in memory, so it resets on reload) | M | Needed before the activity feed means anything to a real company. |
| 3.3 | Per-company isolation checks on the backend (the leak check in plan §6) | M | Required before any real company uses it. |

## 4. Decisions needed from the owner

| # | Decision | Affects | Default if no answer |
|---|---|---|---|
| 4.1 | Notifications: WhatsApp and email now, or later | 2.1.4, 3.x | Parked |
| 4.2 | Confirm role names (0.2) | Every permission gate | Defaults in code |
| 4.3 | Phase 4 scope beyond the work inbox, activity feed and audit timestamps | Phase 4 | Nothing further built |
| 4.4 | Health score rules for 2.4.1 | 2.4.1 | Not built |
| 4.5 | Logistics timing (2.2.2) | 2.2.2 | After the V1 gaps |
| 4.6 | Opening balances per company for the balance sheet (2.1.1) | 2.1.1 | Start at zero |

## 5. Suggested order

1. **Now:** 0.1, 0.2, 0.3.
2. **Next:** the verification checks in section 1 (one session).
3. **Then:** the small gaps, all S: 2.1.3, 2.2.1, 2.2.3, 2.3.2, 2.5.1 (after its decision).
4. **Then:** the medium gaps: 2.1.2, 2.2.2, 2.3.1, 2.4.1.
5. **Then:** 2.1.1 balance sheet, once 4.6 is answered.
6. **Later:** 2.1.4 and any notifications, once 4.1 is answered.
7. **Last:** section 3, backend, after the owner accepts the screens.

## 6. Done means

- Each item has a browser check per relevant role, recorded as PASS or FAIL.
- No record from one company is visible in another.
- `npx tsc --noEmit` and `npx eslint` are clean.
- One PR per group, stacked on the previous one, as before.
