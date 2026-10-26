# Workspace rollout plan: Finance, Operations, Projects, Support, IT

Status: proposal for review. No code is changed by this document.

## 1. What exists today (verified in the repo)

- **Two workspaces are real:** CRM & Sales and HR & People. Business Management sits above them.
- **Five workspaces are placeholders.** Finance & Accounting, Projects & Delivery, Customer Support & Success, Operations & Inventory and IT & Infrastructure are defined in `lib/workspace-config.ts` with status `planned`.
- **Navigation is already written for all five** in `lib/nav-config.ts` (`moduleNavSections`). Every item links to a route under `/workspace/<id>?view=...`.
- **The workspace route shows a generic card for every view.** `app/(app)/workspace/[workspaceId]/page.tsx` renders the same "Records / Actions / Reports" placeholder for any view of a non-HR workspace. A user who clicks any Finance, Projects, Operations, Support or IT menu item lands on an empty screen. This is the most visible gap.
- **Activation is a Business setting.** `components/settings/workspace-section.tsx` lists available workspaces under "Available to activate", and planned ones show "Coming soon". In the preview, switched-on workspaces come from the company record (`lib/company.ts`, field `workspaces`).
- **Per-company data pattern:** stores use `scoped()` (`lib/company.ts`) so each company keeps its own records, and the company spec (`lib/companies/spec.ts`) supplies sample rows for demo companies. A blank company starts empty.
- **Reusable pieces that already exist:**
  - Company locations (head office, warehouses) with addresses and GSTIN fields in Company Profile.
  - Company GSTIN, state and billing details in Billing and Company Profile.
  - Customers, leads, deals and their history (CRM).
  - Support tickets with status, priority, assignee and SLA minutes (CRM, `/tickets`).
  - The HR directory (employees, managers, departments) used as "people" everywhere.
  - An approvals queue (`/approvals`) and an audit log (`/audit`).
  - Reimbursements and expenses (HR).
  - Store, persistence and per-company patterns from the HR stores (`lib/stores/hr-*.ts`).

## 2. Principles (apply to every workspace)

1. **Generic per company.** Nothing is hard-coded to Acme. Each company's data comes from its own records. A new company starts empty, and sample data appears only for the demo companies.
2. **Reuse before building.** Locations, customers, deals, tickets, people and approvals are shared. A new workspace links to them and does not copy them.
3. **No dead ends.** A menu item that has no real screen is hidden or marked "Coming soon". It must never open a generic placeholder card.
4. **Approvals for money and stock.** Refunds, credit notes, stock adjustments and payments follow the approvals queue and the audit log.
5. **Permissions per workspace.** Each workspace has its own permission (already named in `app/(app)/workspace/[workspaceId]/page.tsx`).
6. **Preview first, backend later.** Screens are built on the preview store first, as HR was. The backend is designed after the screens are accepted.
7. **Verification per phase.** Browser flow per role, a cross-company leak check, a mobile-width check, `tsc` and `eslint` clean, and one PR per phase.

## 3. Workspace by workspace

### 3.1 Finance & Accounting (priority 1)

**Why first:** revenue, cash and collections are "not connected" across Portfolio, Business overview and Finance pages. Credit notes and collections depend on it.

**Scope for phase 1 (MVP):**
- **Invoices:** create from a won deal or by hand. Each invoice has a number, date, customer, line items (item, quantity, rate, HSN code), GST split (CGST/SGST for same state, IGST otherwise, based on company and customer state), totals and status (draft, sent, paid, partly paid, overdue, cancelled).
- **Credit notes:** against an invoice, with a reason. Created from a support ticket or a dispute. Needs approval.
- **Receivables:** aging buckets (0-30, 31-60, 61-90, 90+). Payment recording (cash, UPI, bank, cheque) against an invoice.
- **Payables:** bills from vendors and their due dates (read-only in phase 1 if vendors are not built).
- **Expenses:** reuse HR reimbursements; finance marks them paid.
- **Finance overview:** revenue (from invoices, not pipeline), outstanding, overdue and collections this month. Numbers come from records only; nothing is estimated.

**Phase 2:** budgets, cash flow forecast, profit and loss by company, bank reconciliation (needs a bank feed), GST return summaries.

**Reuse:** company GSTIN and state (Company Profile), customers and deals (CRM), HR reimbursements, approvals, audit log.

**Permissions:** `billing:manage` already exists in the route map; finance roles see invoices and payments, not leave or employee records.

**Risks:** GST rules are detailed (rate slabs, place of supply, e-invoice thresholds). The screens should show the split and HSN; compliance checks are for the company's accountant to confirm before filing.

**Estimate:** large (about 3-4 working sessions for phase 1).

### 3.2 Operations & Inventory (priority 2)

**Why second:** distributors and retailers run on stock and dispatch. Tickets such as "short delivery" and "short shelf life" come from here, so the link is direct.

**Scope for phase 1 (MVP):**
- **Items:** name, SKU, unit, HSN, default rate, reorder level, and whether the item has batch and expiry tracking.
- **Warehouses:** reuse company locations (each location is a stock point). No second list.
- **Stock:** current quantity per item per warehouse. Stock movements: receipt, dispatch, transfer, adjustment (with reason, approval for large adjustments).
- **Batches and expiry:** for items that track them, show expiry and block dispatch of expired stock.
- **Dispatch:** from a won deal, create a dispatch with items and quantities, and a delivery challan. Stock reduces when dispatched.
- **Low-stock list:** items below reorder level.
- **Link to tickets:** a "short delivery" ticket can raise a stock adjustment or a credit note request.

**Phase 2:** vendors, purchase orders, goods receipt against purchase orders, procurement approvals, multi-warehouse transfers with transit.

**Reuse:** locations (Company Profile), deals and customers (CRM), tickets (short delivery), approvals, audit log, Finance (invoice from dispatch).

**Permissions:** `settings:manage` is the current route gate; create a finer permission (e.g., `inventory:write`, `inventory:read`).

**Estimate:** large (about 3-4 working sessions for phase 1).

### 3.3 Projects & Delivery (priority 3, first for agencies)

**Why third:** Nimbus Digital Studio is an agency, so this is its first priority. For a distributor it is lower.

**Scope for phase 1 (MVP):**
- **Projects:** name, client (a customer), linked deal (optional), owner, start and end dates, status (planned, active, on hold, done).
- **Milestones and deliverables:** due dates and status per milestone.
- **Tasks:** title, assignee (from the HR directory), due date, status. Tasks belong to a project or milestone.
- **Delivery health (computed):** on track, at risk or late, from due dates and open tasks. Not typed in by hand.
- **Client view:** what is due, what is delivered, per customer.

**Phase 2:** timesheets, resource allocation across projects, billing from timesheets (hands to Finance), project calendar.

**Reuse:** customers and deals (CRM), HR directory (assignees), Portfolio (company-level delivery health).

**Permissions:** project owners edit their projects; team members update their tasks.

**Estimate:** medium (about 2-3 working sessions for phase 1).

### 3.4 Customer Support & Success (priority 4)

**Why fourth:** tickets already work inside CRM & Sales, so a separate workspace would duplicate them. Build only what tickets do not cover.

**Scope if built:**
- Queues and assignment rules (who gets which ticket).
- SLA dashboard (tickets near or over SLA), using the existing SLA minutes.
- Customer feedback and renewals (success side).
- Knowledge base (already exists; reuse it, do not copy).

**Decision:** keep tickets in CRM. Build the queues and SLA view as a support dashboard that reads tickets. Do not move the ticket list.

**Estimate:** small to medium.

### 3.5 IT & Infrastructure (priority 5)

**Why last:** not core for the SMB segment in the current pilot. Assets, helpdesk, licences and access are useful later, mainly for companies with many staff devices and software.

**Scope if built later:** assets (laptops, phones, licences), helpdesk requests (can reuse tickets), access list per person (can reuse HR directory), change log.

**Estimate:** medium.

## 4. Cross-cutting work (do before or with phase 1)

1. **Remove dead ends.** Hide menu items of unbuilt workspaces, or mark them "Coming soon" with no link. Replace the generic placeholder with a clear "not built yet" state. This is small and removes the most visible gap.
2. **Activation rules.** When a workspace is activated for a company, its menu appears. Deactivation must not delete records; it only hides the menu.
3. **Shared record links.** Invoice to deal, dispatch to deal, tickets to credit notes and stock adjustments, project to customer. Define these once, in the CRM and shared helpers.
4. **Per-company isolation.** Each new store uses `scoped()` and gets a leak check, the same way HR and CRM did.
5. **Audit log.** Every money or stock action writes an audit entry, using the existing audit module.

## 5. Recommended order

| Step | Work | Size | Why |
|---|---|---|---|
| 0 | Remove dead ends and placeholder screens (4.1) | S | Stops users landing on empty screens |
| 1 | Finance & Accounting phase 1 | L | Unlocks revenue and collections everywhere |
| 2 | Operations & Inventory phase 1 | L | Dispatch and stock for distributors and retailers |
| 3 | Projects & Delivery phase 1 | M | First priority for agencies such as Nimbus |
| 4 | Support queues and SLA view | S-M | Builds on tickets that already work |
| 5 | IT & Infrastructure | M | Later, when there is demand |
| 6 | Backend for the built workspaces | L | After the screens are accepted, as agreed |

## 6. Acceptance for each phase

- Browser flow per relevant role, with a PASS or FAIL result for each flow.
- No record from one company visible in another (leak check).
- Mobile-width crawl with no overflow or errors.
- `npx tsc --noEmit` and `npx eslint` clean.
- Documentation update in the README status table.
- One PR per phase, based on the previous merged step.

## 7. Decisions needed before building

1. **Finance:** do you want GST invoices in phase 1, or only plain invoices and receivables? (GST split is recommended for India.)
2. **Operations:** is batch and expiry needed for all companies, or only for food and medicine?
3. **Operations:** are vendors and purchase orders needed in phase 1, or in phase 2?
4. **Projects:** is time tracking needed, or only tasks and delivery health?
5. **Support:** keep tickets in CRM only, or add a separate workspace view?
6. **Order:** confirm the order in section 5, or choose a different company to lead with.
