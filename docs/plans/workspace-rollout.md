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

---

## 8. End-to-end operations catalogue

This section lists every normal operation a company runs through these workspaces, from request to record. Each entry says who acts, what is approved, which records are created, what it links to, and whether it belongs in version 1 (V1) or later (V2). Research sources are at the end.

Conventions: "Approver" means a decision recorded in the approvals queue with the person's name and time. Every money or stock change writes an audit entry (section 4.5). Amounts are in INR. Thresholds below are examples; each company sets its own values in its settings.

### 8.1 Finance and money

**A. Fund request and budget allocation (V1)**
1. A person (or project lead) raises a fund request: purpose, amount, cost centre or project, needed-by date, supporting document.
2. Approval by the budget owner, then finance. Thresholds decide how many levels apply (e.g., under a set amount: owner only; above it: owner plus finance).
3. On approval, money is allocated to a budget line (department, project or cost centre). The allocation reduces the remaining budget.
4. Spending against the allocation is tracked: each expense, bill or PO draws from it. Remaining balance is always visible.
5. Over-spend blocks the request or raises an approval; it never silently continues.
6. Unused allocation is released or carried over at period end.

Records: fund request, approval decisions, allocation, budget line balance, draws against it.
Links: projects (project budget), purchase orders (V2), expenses and reimbursements (HR), approvals, audit.

**B. Budgets (V1 basic, V2 full)**
- Annual or quarterly budget per department, project and cost centre. Budget versus actual by month.
- V2: revisions with a reason, forecast versus budget, variance explanations.

**C. Expenses and reimbursements (V1, reuse HR)**
- Employee claims with category, amount, date, purpose and receipt (receipt required above a set amount).
- Reporting manager approval, then finance marks paid. Already built in HR; Finance should show paid totals and the bank or UPI reference.

**D. Sales invoicing, order to cash (V1)**
1. A won deal (or a manual order) becomes a sales order.
2. Invoice is created: number, date, customer, items with HSN/SAC, quantities, rates, discounts, GST split (CGST+SGST within the state, IGST across states, based on company and customer state), totals.
3. Invoice is sent (email or WhatsApp, with the PDF) and marked sent.
4. Payment is recorded against the invoice (cash, UPI, bank transfer, cheque) with reference; partial payments allowed.
5. Overdue invoices move to the collections list by aging bucket (0–30, 31–60, 61–90, 90+). Reminders follow the policy (WhatsApp templates require opt-in, already built in CRM).
6. Write-off requires an approval.

Records: sales order, invoice, invoice lines, payment, collection note, write-off.
Links: deal (won), customer, dispatch (section 8.2), tickets (credit note), GST returns (V2), audit.

**E. Credit notes and debit notes (V1)**
- Credit note: for returned goods, post-supply discount or over-charge. Must reference the original invoice. Created from a support ticket or a dispute; needs approval.
- Debit note: for under-charge. Same reference rule.
- Credit notes reduce receivables; they never delete the invoice.
- Note: the timing rules for issuing credit notes vary between sources. Confirm the current rule with the company's accountant before relying on it.

**F. Purchase bills and payables (V2, read-only in V1)**
- Vendor bill received, matched to a PO and goods receipt (three-way match), approved, scheduled for payment, paid.
- V1 can show bills entered by hand with due dates, without matching.

**G. Cash, bank and reconciliation (V2)**
- Bank statement import and matching to payments. Needs a bank feed or file upload.
- Petty cash: opening balance, expenses, replenishment with approval.

**H. Month-end close (V2)**
- Checklist: all invoices entered, all payments matched, expenses approved, accruals and prepayments posted, bank reconciled, reports locked for the period. Each step has an owner and a done date.

**I. Tax (V2)**
- GST: output tax from invoices, input tax from bills, net liability per period, return summaries. The company's accountant files the return; Janus shows the figures.
- Tax invoice rules to implement in V1: supplier and buyer GSTIN, invoice number and date, description, HSN/SAC, taxable value, tax split, total. Mandatory e-invoicing applies above a turnover threshold; check the current notification before enabling.

**J. Reports (V1 basic)**
- Revenue (from invoices, not the pipeline), outstanding and aging, collections this month, budget versus actual, expenses by category. V2: profit and loss, cash flow, balance sheet.

### 8.2 Operations, inventory and procurement

**K. Item master (V1)**
- Item: name, SKU, unit, HSN, default rate, tax slab, reorder level, track batch (yes/no), track expiry (yes/no), active flag.
- Changing a rate keeps history; old invoices keep the rate they used.

**L. Warehouses and stock points (V1, reuse locations)**
- Each company location that holds stock is a warehouse. Add a bin or zone only if needed.

**M. Stock movements (V1)**
- Opening stock (one-time), goods receipt (from a PO in V2, or manual in V1), dispatch (from a sales order), transfer between warehouses (V1 simple, V2 with transit), adjustment (count difference, damage, expiry).
- Adjustments above a set value or quantity need approval. Every movement has a reason and a user.
- Stock can never go negative unless the item allows it, and then only with an approval.

**N. Batch and expiry (V1 for items that track it)**
- Receipts carry batch number and expiry date. Dispatch picks stock first-expiry-first-out. Expired stock is blocked from dispatch and listed for disposal approval.

**O. Physical stock count (V2)**
- Cycle count or full count: count sheet, variance, approval of adjustments, audit.

**P. Dispatch and delivery (V1)**
1. From a confirmed sales order, create a dispatch: items, batches, quantities, vehicle or courier, date.
2. Delivery challan issued (GST requirement for movement of goods without an invoice; the invoice follows).
3. Stock reduces on dispatch. Proof of delivery (signed challan or photo) closes the dispatch.
4. Short or damaged delivery raises a ticket and a stock adjustment or credit note request.

**Q. Returns (V1)**
- Customer return: receipt into the warehouse (good or damaged), credit note against the invoice, stock updated, approval for damaged goods.

**R. Procurement, procure to pay (V2)**
1. Purchase requisition from a department or from a low-stock alert, with budget check (section 8.1A).
2. Approval against budget.
3. Purchase order to a vendor, with agreed rate and delivery date.
4. Goods receipt against the PO (quantity received, damaged, batch and expiry).
5. Vendor bill matched to PO and receipt (three-way match); mismatch goes to a dispute list.
6. Payment approved and recorded.

**S. Vendors (V2)**
- Vendor master: name, GSTIN, bank details (masked), payment terms, category, rating. Changing bank details needs a second approval.

**T. Reorder and low stock (V1 list, V2 auto-PO)**
- Items below reorder level listed per warehouse; each can create a requisition.

**U. Logistics and fulfilment (V2)**
- Route or delivery slot planning, driver and vehicle, delivery status, cut-off times. Some distributors need this early; confirm with the company.

### 8.3 Projects and delivery

**V. Project initiation (V1)**
- Project: name, client (customer), linked deal (optional), owner, start and end date, type (fixed price, time and material, internal), budget (uses fund allocation, section 8.1A), status.
- Approval of the project and budget by the owner before work starts.

**W. Planning (V1)**
- Milestones or phases with due date, deliverable, acceptance criteria and billing amount (for milestone billing).
- Tasks: title, owner (from the HR directory), dependency, due date, estimate.
- Team: who is on the project and how much of their time it uses.

**X. Execution and tracking (V1)**
- Task status updates, progress, risks and issues, delivery health (on track, at risk, late), computed from dates and open tasks.
- Meetings and notes per project (V2 with calendar).

**Y. Change requests (V1 basic)**
1. Change requested (scope, date, budget or resource).
2. Impact assessment: effect on budget, milestone dates, resources.
3. Approval: project owner for small changes; client and internal sponsor for larger ones (threshold set per company).
4. Approved change updates the plan and budget as a new version. The old version is kept.
5. A change order is only an approval record; billing happens later, from accepted milestones or approved hours (see Z).

**Z. Milestone acceptance and billing (V1)**
1. Milestone marked complete by the team.
2. Acceptance: client or internal approver confirms, with the date and who accepted. Acceptance is the trigger for billing.
3. An invoice for the milestone amount is created (section 8.1D).
4. Disputes stop billing for that milestone until resolved.

**AA. Timesheets (V2)**
- Hours per task per day, billable or not, submitted weekly, approved by the project owner. Approved billable hours can drive time-and-material invoices.

**AB. Resource allocation (V2)**
- Planned versus actual allocation per person across projects; over-allocation warning.

**AC. Project costs and profitability (V2)**
- Costs: people time (from timesheets), expenses, vendor bills, fund draws. Revenue: invoices. Margin per project.

**AD. Client delivery (V1)**
- Per client: active projects, due milestones, deliverables handed over, acceptance pending.
- Handover record with the client's acceptance.

**AE. Closure (V1 basic)**
- Final acceptance, final invoice, lessons learned, release of unused budget (back to the fund allocation), archive. Project stays readable after closure.

### 8.4 Customer support and success

**AF. Ticket lifecycle (exists in CRM, reuse)**
- Open, assign, reply, escalate, waiting customer, resolve, close. SLA timer per priority.
- V1 addition: queues and assignment rules; SLA dashboard; reopen rule.

**AG. Credit or replacement from a ticket (V1)**
- A ticket can request a credit note (finance approval) or a replacement dispatch (stock approval).

**AH. Renewals and success (V2)**
- Renewal date per customer or contract, reminders, health score built from tickets, invoices and usage. Keep it simple at first.

### 8.5 IT and infrastructure (V2)

**AI. Assets** — register, assign to a person, return on exit (link with offboarding in HR).
**AJ. Helpdesk** — reuse tickets with an IT category.
**AK. Access** — list of systems and who has access; access removal on exit.
**AL. Licences** — count, renewal dates, cost.

### 8.6 Company-wide controls (apply everywhere)

- **Approvals:** one queue for all modules; each item shows amount, requester, reason, decision and time.
- **Audit:** who did what, when, with before and after values, for money, stock and access changes.
- **Period locks:** closed periods cannot be changed without the owner.
- **Documents:** invoices, challans, receipts and contracts attached to the record.
- **Notifications:** WhatsApp and email only with opt-in, as already built for customers.
- **Roles:** each process above maps to a permission (e.g., `budget:approve`, `invoice:create`, `stock:adjust`, `project:accept`). Names are proposed; to be confirmed.

### 8.7 V1 scope summary

| Area | V1 (first build) | V2 (later) |
|---|---|---|
| Money | Fund request and allocation, budget lines, expenses, sales invoices with GST, credit and debit notes, payments, receivables aging, basic reports | Payables and three-way match, bank reconciliation, petty cash, month-end close, GST return summary, P&L, cash flow |
| Operations | Item master, warehouses from locations, stock movements, batch and expiry, dispatch and challan, returns, low-stock list | Procurement and purchase orders, vendors, goods receipt, physical count, transit transfers, logistics |
| Projects | Project initiation with budget, milestones, tasks, delivery health, change requests, milestone acceptance and billing, client delivery view, closure | Timesheets, resource allocation, project profitability |
| Support | Queues, SLA view, credit or replacement from a ticket | Renewals and health score |
| IT | Nothing in V1 | Assets, helpdesk, access, licences |

### 8.8 Research sources

- Procure-to-pay and order-to-cash concepts, functional areas, and inventory cycle counting: [SAP S/4HANA Cloud process flows](https://learning.sap.com/courses/implementing-sap-s-4hana-cloud-public-edition/summarizing-the-line-of-business-and-industry-process-flows_ae1fe8c2-4195-4a60-9bcb-385541839fb2), [ERP and digital transformation (University of Padua)](https://orientamentodtg.gest.unipd.it/wp-content/uploads/2025/04/ERP-and-digital-transformation_v2.pdf), [Oracle ERP features](https://www.oracle.com/erp/erp-features/).
- Budget allocation and project accounting modules: [SAP S/4HANA Cloud](https://learning.sap.com/courses/implementing-sap-s-4hana-cloud-public-edition/summarizing-the-line-of-business-and-industry-process-flows_ae1fe8c2-4195-4a60-9bcb-385541839fb2); [Oracle EBS project modules](https://www.udemy.com/course/functional-principles-of-oracle-erp-ebs-project-modules/).
- Change control with approvers and thresholds: [Montclair State PMO change control procedure](https://www.montclair.edu/program-management-office/wp-content/uploads/sites/42/2017/12/OM-PRC-005_Project_Change_Control_v1.0.docx).
- Milestone acceptance as billing trigger, and separating scope approval from price approval: [Upland PSA guide to BPM for project managers](https://uplandsoftware.com/psa/wp-content/uploads/sites/3/2017/03/GuideBPMforProjectManagers.pdf), [InvoiceRa on project change order billing](https://www.invoicera.com/blog/billing-operations/project-change-order-billing-handoff/).
- Timesheets and invoicing from billable hours: [SlideShare, project open timesheet and invoicing](https://www.slideshare.net/slideshow/projectopen-timesheet-project-invoicing/3205643).
- GST invoice fields, credit and debit notes, HSN: [Masters India GST invoice and notes guide](https://www.mastersindia.co/blog/gst-invoice-e-invoice-credit-note-debit-note-guide/), [Avalara on Indian GST invoices](https://www.avalara.com/vatlive/en/country-guides/asia/india/indian-gst-invoices.html), [Kanakkupillai on tax invoices and notes](https://www.kanakkupillai.com/learn/?p=903).
- E-invoice threshold: [Tungsten Network, India e-invoicing thresholds](https://es.tungsten-network.com/compliance-overview/country-updates/country/india/e-invoicing-threshold-reduced-to-%e2%82%b95-from-august-1st-2023).

**Caveat:** these are general guides, not official rules. GST credit note timing and e-invoice thresholds conflict between sources and must be checked against the CBIC or GST portal and the company's accountant before the product relies on them.

### 8.9 Open questions for you

1. **Fund request:** who approves at what amount? (Example: owner up to a set limit, owner plus finance above it.) Confirm the thresholds, or keep one approver for V1.
2. **Project budget:** should a project draw from a fund allocation (recommended), or keep its own budget?
3. **Change requests:** one approver for all changes in V1, or thresholds from the start?
4. **Stock:** may stock go negative with approval, or never?
5. **Invoices:** do you want GST split and HSN in V1 (recommended for India), or plain invoices first?
6. **Vendors and purchase orders:** V2 as planned, or needed earlier by any company?

---

## 9. Decisions taken (industry-standard defaults)

These defaults replace the open questions in sections 7 and 8.9. They follow common practice for Indian SMB ERP and PSA products. Each one can be changed per company later.

| # | Question | Default taken | Basis |
|---|---|---|---|
| 1 | Fund request approval | Owner approves up to a set limit; above it, owner plus finance. Limits are per company settings. Two levels maximum in V1. | Standard delegation-of-authority practice |
| 2 | Project budget source | Project draws from a fund allocation (one budget source, no duplicate budgets) | Standard project-accounting practice |
| 3 | Change request approval | Project owner for small changes; client and internal sponsor for larger ones, with a per-company threshold | PMO change-control practice |
| 4 | Negative stock | Not allowed by default; an item may allow it only with approval and a reason | Standard inventory control |
| 5 | Invoice format | GST tax invoice with HSN/SAC, tax split (CGST+SGST or IGST) and invoice number, from V1 | Indian GST requirement |
| 6 | Vendors and purchase orders | V2, as planned | Lower priority than sales and dispatch |
| 7 | Batch and expiry | Per item setting, on for items that need it (food, medicine) | Standard FEFO practice |
| 8 | Time tracking | V2; V1 has tasks and delivery health only | Scope control |
| 9 | Support | Tickets stay in CRM; V1 adds queues and SLA view only | Avoids duplicate ticket lists |
| 10 | Order of build | Step 0 (done), then Finance, Operations, Projects, Support, IT | Section 5 |

Compliance points to confirm with the company's accountant before go-live: GST credit note timing, e-invoice applicability by turnover, and HSN digit requirements.
