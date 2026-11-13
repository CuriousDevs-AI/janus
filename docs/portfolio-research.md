# Portfolio — what it is, what it should be, and what to build next

Research date: 2 November 2026. Branch read: `step-77-crm-activity-in-feed`. No code was changed for this report.

## 0. What "Portfolio" means in Janus

In this repo, **Portfolio is the Owner's view across every company they run** (a group of companies under one login). It is *not* project portfolio management (PPM). Projects & Delivery has its own project list, milestones, hours and changes; that is a separate topic and is not covered here.

Evidence:

- Route `/portfolio` → [app/(app)/portfolio/page.tsx](../app/(app)/portfolio/page.tsx) → [components/portfolio/portfolio-page.tsx](../components/portfolio/portfolio-page.tsx).
- Menu in [lib/nav-config.ts:134](../lib/nav-config.ts:134): "The Owner's view across every company."
- Workspace entry in [lib/workspace-config.ts:29](../lib/workspace-config.ts:29): "Every company you run, in one place."
- Only the Owner may open it ([lib/demo-persona.ts:91](../lib/demo-persona.ts:91)), and the Owner lands on it after sign-in (`portfolioHome`, [lib/company.ts:112](../lib/company.ts:112)).

The market Janus is aiming at here is the Indian SMB owner who runs more than one business: a promoter family with a distribution company, a shop and a newly formed LLP; a founder with an agency and a side venture; an operator with several outlets, each its own legal entity.

---

## 1. What exists today

### 1.1 Screens (seven views on one page, chosen by `?view=`)

| View | What it shows | Where the numbers come from |
| --- | --- | --- |
| **Overview** | 5 KPI tiles (companies, people, open pipeline, won so far, monthly payroll); "Needs your attention" (top 6); "Janus insights"; a card per company; "What Janus remembers" | `summarise()` per company, `insightsFor()`, mock `memoryItems` (Acme only) |
| **Analytics** | Pipeline and won bars by company; leads-per-month lines; pipeline by stage table; leads by channel table; headcount bars | `summarise()` (CRM + HR only) |
| **Finance** | Payroll, won, pipeline, reimbursements waiting; a per-company table; "Ledgers: Finance & Accounting is not connected for any company yet" | HR and CRM numbers only |
| **Companies** | One card per company: workspaces on/off checkboxes, Open, Finish setup, Edit details (name, industry, city, logo), Remove (type the name to confirm) | `janus.companies` in localStorage |
| **Janus Intelligence** | A chat box with 4 suggested questions | `answerFor()`: a keyword (regex) matcher over the same summaries, no AI and no server |
| **Notifications** | The attention items from every company, filter by company, mark read / mark all read | Attention items computed in the browser; read state in localStorage `janus.portfolio-read` |
| **Portfolio access** | Owner row plus people you add, with a role (Co-owner, Group finance, Group analyst) and companies | localStorage `janus.portfolio-access` |

There is also the company switcher at the foot of the sidebar ([components/layout/company-switcher.tsx](../components/layout/company-switcher.tsx)), the ⌘K palette entries for each company, and the Add-company wizard at `/setup?new=1` (demo only).

### 1.2 Data model

- `CompanyRecord` ([lib/company.ts:6](../lib/company.ts:6)): `id, name, industry, city, template (acme|nimbus|greenleaf|blank), workspaces[], setupDone, size, timezone, logo, team[], createdAt`. Held in localStorage `janus.companies`; three seed companies (Acme Traders, Nimbus Digital Studio, GreenLeaf Organics).
- `CompanySummary` ([lib/group-summary.ts](../lib/group-summary.ts)): `crm { leads, openDeals, pipeline, wonValue, winRate, quiet, byStage, bySource, monthly }`, `hr { people, departments, onLeaveToday, pendingLeave, monthlyPay, claimsPending, claimsValue }`, `attention[]`.
- `summarise()` reads each company's **browser stores** (`janus.demo-crm.v2.<id>`, `janus.hr-people-demo.<id>`) or, if the company was never opened, builds the starting demo rows. Company data is kept apart by a storage-key suffix (`scoped()`).

### 1.3 Server vs browser

| Piece | Where it lives today |
| --- | --- |
| List of companies, logos, workspaces switched on | Browser only (`janus.companies`) |
| Every Portfolio number | Browser only (demo stores) |
| Notification read state | Browser only |
| Portfolio access list and roles | Browser only; nothing is enforced |
| Add company / Remove company | Browser only |

What the **backend already has** but the Portfolio does not use:

- A user can belong to many tenants: `memberships` table ([backend/janus_api/org/models.py:43](../backend/janus_api/org/models.py:43)).
- `GET /v1/me` returns `tenants[]` with the user's role in each ([backend/janus_api/auth/schemas.py:108](../backend/janus_api/auth/schemas.py:108), `org.list_workspaces`).
- `POST /v1/me/switch-tenant` issues a new session for another tenant ([backend/janus_api/auth/router.py:105](../backend/janus_api/auth/router.py:105)).
- `GET /v1/business/reports/summary` gives leads, open deals, won deals, pipeline value for **one** tenant.
- Per-tenant records that a group view could read: invoices and payments, bills and bill payments, budget lines and fund requests (`/v1/finance/*`), project records, support tickets, the operations ledger, IT changes, HR records.

What the backend **does not** have: an endpoint to create a second company for a signed-in user (a tenant is only created at sign-up, `org.create_workspace`), any cross-tenant read, a portfolio/group concept, GSTIN/PAN/CIN per tenant, a general ledger, or inter-company records.

### 1.4 Disabled, unconnected or fake

1. **Live accounts get nothing.** `if (!demoMode) return "The Portfolio … is not available yet for live accounts."` ([portfolio-page.tsx:54](../components/portfolio/portfolio-page.tsx:54)). The company switcher only renders in demo mode ([sidebar.tsx:277](../components/layout/sidebar.tsx:277)), and no frontend code calls `/me/switch-tenant`.
2. **Invented history.** Leads May–Sep are fixed numbers scaled by company size; only October is real ([group-summary.ts `monthly()`](../lib/group-summary.ts)). The chart caption says so, but it is still a made-up trend.
3. **Finance view is out of date.** It says Finance & Accounting is "not connected for any company", although Acme has that workspace on and invoices, bills, budgets and payments are now on the server (see `docs/decisions.md`).
4. **Only CRM and HR feed the Portfolio.** Finance, Operations/Inventory, Projects, Support and IT data are ignored, even where a company has those workspaces switched on.
5. **"Send invitation" sends nothing.** Portfolio access shows a success toast, saves to localStorage, sends no email, and the roles are not enforced anywhere.
6. **Owner name is hard-coded** as "Pankaj Neema" in Portfolio access ([portfolio-page.tsx:251](../components/portfolio/portfolio-page.tsx:251)).
7. **"What Janus remembers"** shows mock `memoryItems` from Acme only.
8. **Janus Intelligence is a regex matcher**, not the server's `/business/intelligence/ask`. Known gap from the earlier audit (P2-7): "Which company has the heaviest payroll?" lists all companies instead of naming one.
9. **Remove company** only hides it from the list; the records stay in the browser.
10. No date range anywhere: every number is "so far" or "today".

---

## 2. What this kind of module looks like in the industry

There is no single "Portfolio" product category. Owners of several companies piece it together from four kinds of tools:

| Tool type | Examples | What they do well | Where they stop |
| --- | --- | --- | --- |
| **Accounting with multi-company** (India's default) | TallyPrime Group Company, Zoho Books multi-organisation, Busy, Marg | One login, separate books, GST per GSTIN. Tally's Group Company is a read-only virtual layer that combines member companies' ledgers, trial balance, P&L and balance sheet live. | Zoho Books has no native consolidated report across organisations; groups export trial balances to Excel and a CA consolidates once a year. Tally matches ledgers by name, so "HDFC Bank" vs "HDFC Bank Ltd" become two lines. Nothing beyond accounting: no sales, people, ops. |
| **ERP multi-company** | Odoo multi-company, NetSuite OneWorld, Dynamics 365 Business Central, Sage Intacct | Inter-company sales, loans and transfers recorded once and mirrored; eliminations; consolidated statements; shared masters. | Heavy setup, needs a consistent chart of accounts and inter-company accounts in every entity; priced and staffed for mid-market. Odoo's consolidation is an Enterprise feature or a partner add-on depending on version. |
| **Consolidation / reporting add-ons** | Fathom, Spotlight Reporting, ScaleXP (for Zoho), Syft, Reach | Group dashboards with drill-down per entity, KPI targets, multi-currency, scheduled board packs. Fathom claims up to 300 entities single-currency; Spotlight lets one organisation sit in several groups; Fathom Portfolio targets accountants watching many clients. | Finance only, read from the books; no action. Monthly cadence, not daily. |
| **Owner dashboards / BI** | Zoho Analytics, Power BI, Looker Studio, Google Sheets | Any metric, any layout. | Someone has to build and maintain it; numbers are as fresh as the last sync; no "do something" button. |

What none of them does well, and where Janus fits: a **daily, operational** owner view that spans sales, money, people, stock, delivery and compliance, for several companies, and lets the owner act from it (approve, open, assign). Janus already has the per-company modules; the Portfolio is the layer that rolls them up.

### 2.1 What a good group/portfolio view should do

Mapped to Janus terms. "Have" means it exists in the demo today.

| Capability | Why an Indian SMB owner cares | Today |
| --- | --- | --- |
| **Company list with health (RAG)** per company, and why | "Which business needs me today?" in one glance | Cards, no health status |
| **Money: cash, receivables, payables** per company and total; overdue ageing (0–30, 31–60, 60+) | Cash is the owner's #1 worry; receivables are often 60–90 days in Indian B2B | Missing; "not connected" |
| **Sales**: pipeline, won, win rate, quiet leads | Growth | Have (demo) |
| **People**: headcount, payroll, leave and claims waiting | Biggest fixed cost | Have (demo) |
| **Stock and dispatches** (for distribution and retail) | Working capital locked in stock; dead stock | Missing |
| **Delivery** (for agencies and contractors): projects late or over budget, unbilled hours | Margin leaks | Missing |
| **Support**: tickets open / breaching | Customer risk | Missing |
| **Approvals waiting on the owner**, across companies, with approve-in-place | Owners are the bottleneck in SMBs | Partial (attention items link out) |
| **Compliance calendar** per GSTIN / PAN / CIN: GSTR-1, GSTR-3B, TDS, PF/ESI, advance tax, ROC filings (AOC-4, MGT-7), DIR-3 KYC | Late fees and notices; each entity has its own dates | Missing |
| **Period selector** (this month, quarter, Indian FY Apr–Mar) and comparison with last period | Every review is "vs last month / last year" | Missing |
| **Targets** per company and variance | Owners set monthly targets per business | Missing |
| **Inter-company**: loans, sales and transfers between group companies; related-party list | Very common in family groups; auditors ask for it (Companies Act s.188 related-party disclosures) | Missing |
| **Consolidated P&L / balance sheet** with eliminations | Lenders and investors ask for group numbers | Missing; needs a ledger first |
| **Delegated access**: co-owner, group CFO/accountant, CA firm, read-only analyst, per company | Owners share with a CA and a family member | UI only, not enforced |
| **Digest**: weekly email/WhatsApp summary; alerts on thresholds | Owners live on WhatsApp, not in dashboards | Missing |
| **Ask across companies** with figures and sources | Fast answers | Regex demo |
| **Export / board pack** (PDF, Excel) | Bank, investors, CA | Missing |
| **Add a company / switch company** on a real account | The basic promise | Demo only |

---

## 3. Real use cases

| # | Who | What they need from the Portfolio | Can Janus do it today? |
| --- | --- | --- | --- |
| 1 | **Promoter family group** in Gurugram: FMCG distributor (Acme), a retail shop, and a new LLP. Father and son both owners; the family CA files for all three. | Each morning: cash and overdue receivables per company, stock value, approvals waiting; monthly: GST due dates per GSTIN; the CA sees all three read-only. Loans from the distributor to the LLP tracked. | **No.** Demo only; no receivables, stock, compliance or inter-company; CA access not enforced. |
| 2 | **Founder with an agency plus a side venture** (Nimbus + a small SaaS). Some staff work for both. | Pipeline and won per company, payroll vs revenue, unbilled project hours, which company is paying for shared staff. | **Partly, in demo**: pipeline, won, payroll vs won. **No** unbilled hours, no shared-staff cost split. |
| 3 | **Multi-outlet operator**: 4 cafés or clinics in Pune, each a separate proprietorship or LLP for GST reasons. | The same KPIs side by side, ranked, with the outlier flagged ("Outlet 3 sales down 22% vs last month"); one weekly WhatsApp summary. | **No.** No sales/stock per outlet beyond CRM, no period comparison, no digest. |
| 4 | **Interiors / construction promoter** with one SPV company per project or site. | Budget vs actual per SPV, fund transfers from the parent, contractor bills due, milestones late. | **No.** Budget lines and bills exist per company on the server, but the Portfolio does not read them, and there is no inter-company funding. |
| 5 | **CA / bookkeeping firm** looking after 30 client companies (the "Fathom Portfolio" use case). | Compliance status per client, books not reconciled, invoices overdue; open a client in one click. | **No.** Portfolio is tied to an Owner, and there is no read-only accountant role across tenants. A future market, not the first build. |
| 6 | **Group finance manager** hired by an owner of three companies. | Month-end pack: revenue, collections, payables, payroll by company, exported to Excel/PDF for the bank. | **No.** Portfolio access is browser-only, and there is no export. |

Summary: the demo shows the *shape* well (use case 2 mostly works on demo data), but none of the six works for a real customer, mainly because the Portfolio has no live data path.

---

## 4. Gap analysis

| Gap | Severity | Notes |
| --- | --- | --- |
| G1. Portfolio does not work on live accounts at all | **Blocker** | Backend has memberships and switch-tenant; the frontend never uses them; no "add another company" endpoint; no cross-tenant read. |
| G2. Numbers come only from browser stores and demo seeds | High | Even in demo, Finance/Ops/Projects/Support data that the server holds is ignored. |
| G3. Money view missing (receivables, payables, cash) | High | The server has invoices, payments, bills, bill payments; enough for receivables and payables ageing. Cash needs bank balances, which Janus does not hold yet. |
| G4. Access sharing is fake | High | Invite sends nothing; roles not enforced. A security expectation, not just a feature. |
| G5. No period selector or comparison | Medium | Every review is month-on-month. |
| G6. No health status per company | Medium | Cheap once the numbers are there. |
| G7. No compliance calendar per entity | Medium | Strong India-specific differentiator; needs GSTIN/PAN/CIN on the tenant (today only in the demo profile, [lib/company-profile.ts](../lib/company-profile.ts)). |
| G8. No digest / alerts outside the app | Medium | WhatsApp and email both already exist in Janus. |
| G9. Fake history and stale copy | Low | Invented May–Sep leads; "Finance not connected"; hard-coded owner name; Acme memory notes. |
| G10. Intelligence is a regex matcher | Low | Fine for a demo; for live, use the server's ask endpoint per company. |
| G11. Inter-company and consolidation | Later | Needs a general ledger, which Janus does not have. |

---

## 5. Improvement plan

Sizes: **XS** < half a day, **S** ≈ 1 day, **M** 2–4 days, **L** 1–2 weeks.

### 5.1 Quick wins (demo and copy; no backend)

| # | Item | Files | Size |
| --- | --- | --- | --- |
| Q1 | Drop the invented May–Sep lead history; show real months from lead `createdAt`, or only "this month" | [lib/group-summary.ts](../lib/group-summary.ts), Analytics in [portfolio-page.tsx](../components/portfolio/portfolio-page.tsx) | XS |
| Q2 | Show the signed-in owner's name and email in Portfolio access instead of "Pankaj Neema"; label the access list "not sent yet" until G4 is built (or hide "Send invitation") | [portfolio-page.tsx](../components/portfolio/portfolio-page.tsx) `People` | XS |
| Q3 | Fix the Finance copy: say which companies have Finance switched on, and read their demo invoices/bills for receivables and payables due | [lib/group-summary.ts](../lib/group-summary.ts), `Finance` in [portfolio-page.tsx](../components/portfolio/portfolio-page.tsx) | S |
| Q4 | Health badge per company (Red/Amber/Green) from its attention items, with the reason on hover | [lib/group-summary.ts](../lib/group-summary.ts), `CompanyCards` | S |
| Q5 | Intelligence answers the specific question (heaviest payroll → one company and amount; "leads at Nimbus this month") — audit P2-7 | [lib/portfolio-insights.ts](../lib/portfolio-insights.ts) | S |
| Q6 | Hide "What Janus remembers" or make it per company | [portfolio-page.tsx](../components/portfolio/portfolio-page.tsx) `Overview` | XS |

### 5.2 Core features (live accounts)

| # | Item | Files | Size |
| --- | --- | --- | --- |
| C1 | **Live Portfolio, read-only overview.** New `GET /v1/portfolio/summary`: for each tenant where the user's active membership has the Owner role (or a new `portfolio:read` permission), set the RLS context for that tenant and collect its headline numbers (leads, open/won deals, pipeline, headcount, invoices overdue, bills due, open tickets), then reset the context — the same loop `org.list_workspaces` already does. Never bypass RLS; audit-log each read. Frontend: `usePortfolio()` reads this endpoint when not in demo mode; remove the "not available for live accounts" gate. | New `backend/janus_api/portfolio/{router,service,schemas}.py`, `backend/janus_api/main.py`, reuse `business/service.report_summary`, finance/support queries; tests in `backend/tests/`; [components/portfolio/portfolio-page.tsx](../components/portfolio/portfolio-page.tsx), new `lib/api/portfolio.ts` | L |
| C2 | **Add and switch companies on a live account.** `POST /v1/portfolio/companies` creates a tenant for the signed-in user (reuse `org.create_workspace`, Owner membership); company switcher and ⌘K use `/me` `tenants[]` and call `/me/switch-tenant`, then reload. Setup wizard live path for a second company. | `backend/janus_api/org/service.py`, the new portfolio router, [components/layout/company-switcher.tsx](../components/layout/company-switcher.tsx), [components/layout/sidebar.tsx](../components/layout/sidebar.tsx), [components/layout/command-palette.tsx](../components/layout/command-palette.tsx), [lib/company.ts](../lib/company.ts), [app/(app)/setup/page.tsx](../app/(app)/setup/page.tsx), [lib/demo-persona.ts](../lib/demo-persona.ts) gating | M |
| C3 | **Money view**: receivables ageing (0–30/31–60/60+), payables due this week, collected this month vs last, per company and total, each row opening the company's Finance screen | portfolio service, `Finance` view, [lib/group-summary.ts](../lib/group-summary.ts) for demo parity | M |
| C4 | **Real Portfolio access.** Inviting a person = an invitation into each chosen company with a read-only group role (Group finance / Group analyst), using the existing invitation flow; the summary endpoint honours it. No new cross-tenant grant table needed. | `backend/janus_api/org/service.py` (roles, invitations), migration for the new system roles, `People` view | M |
| C5 | **Period selector** (this month / quarter / FY Apr–Mar) with change vs previous period | portfolio service (date filters), page header in [portfolio-page.tsx](../components/portfolio/portfolio-page.tsx) | M |
| C6 | **Weekly owner digest** by email (and WhatsApp template where connected): top 5 attention items per company, money and sales lines | `backend/janus_api/worker/`, portfolio service, notification settings | M |

### 5.3 Later

| # | Item | Notes | Size |
| --- | --- | --- | --- |
| L1 | Compliance calendar per company: GSTIN/PAN/CIN on the tenant, due dates for GSTR-1, GSTR-3B, TDS, PF/ESI, advance tax, ROC; mark filed | New tenant fields + `compliance_items` table; strong India differentiator | L |
| L2 | Targets per company and variance | New table per tenant | M |
| L3 | Approve from the Portfolio (leave, claims, fund requests, credit notes) without switching company | Needs per-tenant action endpoints called under the right session | L |
| L4 | Inter-company records (loans, sales, transfers) and a related-party list | Prerequisite for consolidation | L |
| L5 | Consolidated P&L and balance sheet with eliminations | Needs a general ledger in Finance first | L+ |
| L6 | Export / board pack (PDF, Excel) | After C3/C5 | M |
| L7 | Accountant mode: a CA firm sees many client companies | New market; after C4 | L |
| L8 | Ask across companies with the server's intelligence endpoint, citing each company's figures | After C1 | M |

---

## 6. Recommendation: what to build first

**Build C1 + C2 together: "the Portfolio works on a real account".** Everything else in this report is demo-only until a real owner can add a second company, switch to it, and see both on one page from server data. The backend is already halfway there (memberships, `tenants[]` in `/me`, `switch-tenant`, per-tenant summaries), so this is mostly one new read endpoint with careful RLS handling, one create endpoint, and wiring the existing screens to them.

Do Q1 and Q2 first as a same-day clean-up, because they remove invented history and a hard-coded name that would otherwise carry over to live accounts. After C1/C2, build C3 (money view): receivables and payables are the numbers a group owner asks for first, and the server already holds them.

---

## Sources

- [TallyPrime — multi-company financial consolidation](https://tallysolutions.com/tally/multi-company-financial-consolidation-tallyprime/)
- [TallyPrime — inter-company transactions and group consolidation](https://tallysolutions.com/business-guides/inter-company-transactions-group-consolidation-tallyprime/)
- [ScaleXP — Zoho Books consolidation across multiple accounting systems](https://www.scalexp.com/blog/zoho-books-consolidation-across-multiple-accounting-systems/)
- [Ecosire — Zoho multi-currency consolidation reporting](https://ecosire.com/apps/zoho-one/zoho-multi-currency-consolidation-reporting)
- [Ecosire — Odoo multi-company setup, inter-company and consolidation](https://ecosire.com/blog/odoo-multi-company-setup-guide)
- [Cash Flow Frog — multi-company cash flow consolidation in Odoo](https://cashflowfrog.com/blog/odoo-multi-company-cash-flow-consolidation/)
- [Fathom vs Spotlight Reporting](https://www.fathomhq.com/blog/fathom-vs-spotlight-reporting)
- [Fathom — consolidated financial reporting](https://www.fathomhq.com/lp/fast-consolidations)
- [Spotlight Reporting — consolidation](https://help.spotlightreporting.com/help-articles/consolidation-in-spotlight-reporting)
- [ERP Research — Fathom profile](https://erpresearch.com/erp-add-ons/reporting-tools/fathom)

Most of these are vendor or partner pages, so treat feature limits (entity counts, which edition includes consolidation) as claims to confirm before quoting to customers.
