# Portfolio: research, gap analysis and redesign

*Janus · multi-company Portfolio · research report · 2 Nov 2026*

## 1. Summary

The Portfolio is for one kind of person: an owner, founder or management team running **3–10 separate companies** that share an owner but keep their own books, people, customers and legal obligations. That person does not want another CRM. Every week they need answers to five questions:

1. **Are we making money?** Revenue, profit and cash for each company and for the group, without counting inter-company deals twice.
2. **Where is it going wrong?** Which company, which measure and why, backed by evidence.
3. **What is waiting on me?** Approvals, decisions, overdue money, and deadlines that carry penalties.
4. **Are we legally safe?** Filings, registrations and expiries for every entity in every jurisdiction.
5. **Who can see what?** Accountants, a CFO, a co-founder or a company MD should each see only their part.

Today's Portfolio answers part of question 1 (pipeline and payroll) and part of question 3 (a short attention list). It does not answer 2, 4 or 5. It has three correctness problems: synthetic lead history, a finance page that says "not connected" when Acme has books, and Work Inbox and Activity links that open single-company pages. The backend also has no entity above the company, so cross-company access cannot be enforced on the server.

The recommendation keeps the user's navigation almost exactly as proposed. Work Inbox and Activity become true cross-company views, Compliance is new, and the Portfolio is backed by a metric catalogue in which every number has a definition, a source and a basis label (*verified* or *estimate*). Janus Intelligence becomes a rules-and-evidence layer over those metrics, not a chatbot.

---

## 2. Who this is for, and how they work

| Person | Companies | What they open the Portfolio for | Rhythm |
|---|---|---|---|
| Founder-owner of a small group (the main persona, for example Pankaj with Acme, Nimbus and GreenLeaf) | 3–6 | "Is anything on fire? What needs my signature? Is cash okay?" | Daily (5 min), weekly review (30 min) |
| Group CFO / finance manager | All | Consolidated P&L, cash, receivables, budgets, compliance calendar | Weekly, month-end close, quarter-end |
| Company MD / company admin | 1–2 | Their company's standing against targets and against the other companies | Weekly |
| Co-founder / investor-director | All, read-only | Monthly performance pack, risks | Monthly, quarterly board |
| External CA / auditor | 1–N, finance only | Filings, registrations, statements | Monthly filings, year-end |

**What they actually do, in order of frequency:**

- **Daily triage:** approve or decide what is blocked, chase money that is overdue, and catch anything about to breach a deadline.
- **Weekly review:** compare companies on the same measures, find the one slipping, and ask why.
- **Month-end:** confirm each company has closed its books, review the consolidated P&L and cash, and check GST/TDS/PF/ESI were filed.
- **Quarter-end:** review targets against actuals, budget against actual, and advance tax. Set next quarter's targets.
- **Year-end:** audit, ITR, AGM, AOC-4, MGT-7, and renewals.

Design implication: the **Overview is a triage screen**, not a report. Analytics and Finance are where the review happens. The Work Inbox is where things get done.

---

## 3. Competitor research

| Platform | How it handles many companies | What works | What fails the 3–10-company owner | Lesson for Janus |
|---|---|---|---|---|
| **Oracle NetSuite OneWorld** | One account, a tree of subsidiaries. Ledgers roll up with currency translation, and eliminations post to a dedicated *elimination subsidiary*. Automated Intercompany Management is available. | True consolidation. Inter-company eliminations are first-class. A per-subsidiary view and a group view of the same data. | Built for finance teams and priced and staffed for mid-market. OneWorld must be licensed separately, and the owner sees GL reports, not "what needs me". | Model eliminations explicitly and show them as a separate line. Never hide them inside a total. |
| **Microsoft Dynamics 365 Business Central** | One environment, many *companies*, with a consolidation company that imports their figures. The Intercompany module creates the matching entry in the partner company. Since 2023 wave 2, partnerships can span environments. | A clean split between legal entities (companies) and divisions (dimensions/business units). Inter-company documents mirror automatically. | Consolidation is a periodic batch job, not live. No operational or CRM roll-up for the owner. | A company is a legal entity. A division inside one is a dimension, not another company. Inter-company sales should create a matching bill in the partner. |
| **Zoho (Books + Analytics)** | Each company is a separate Books *organisation*. Group numbers mean importing every org into one Analytics workspace and building the joins and FX yourself. Third-party vendors exist because native consolidation, consolidated statements and eliminations are missing. | Cheap, strong per-company GST/India compliance, and multi-org sign-in. | No native group view. Every group report is hand-built. | This is the gap Janus can fill for Indian SME groups: a ready-made, India-aware group view over per-company books. |
| **HubSpot (Brands, formerly Business Units)** | Several brands in one portal, as an Enterprise add-on. Mainly marketing separation; sales and service separation is limited, and some settings are per portal (for example one GDPR setting). | One CRM with a per-brand filter. | It is brands, not legal entities: no books, no compliance, no entity-level access. | Do not copy brand-style separation. Janus companies are separate tenants, which is stronger, and the Portfolio aggregates over them. |
| **Salesforce (multi-org)** | Conglomerates often run one org per business. Practitioners report no native cross-org reporting, duplicate customers and inconsistent data, usually fixed with a separate "reporting org" or integration. | Strong isolation. | Group reporting is an integration project. | Janus has this isolation already (one tenant per company). The Portfolio is the built-in "reporting org", so it must read each company through the same definitions. |
| **Fathom / Spotlight Reporting** (on top of Xero/QuickBooks) | Consolidation across many entities (Fathom quotes up to 300 single-currency). Group dashboards, KPIs and entity drill-down. | The closest to what an owner wants financially: KPIs, trends, targets and a commentary layer. | Finance only, read-only and monthly. Nothing about pipeline, people, approvals or compliance. | Executive KPI and drill-down patterns. Targets and budget vs actual belong next to the numbers. |
| **Compliance tools for Indian SMEs** (CA practice software and compliance-calendar apps) | A calendar of GST, TDS, PF/ESI, ROC and ITR due dates per entity. | The owner knows what is due. | Disconnected from the company's operating data (headcount, GSTIN, payroll), so applicability is manual. | Derive applicability from the company's own records: payroll means TDS, 20+ staff means EPF, a Pvt Ltd means MCA forms. |

**What no one does well, and where Janus can win:** one screen that joins **money (books), momentum (pipeline), people, obligations and decisions** across legally separate companies, with **every number explained**. Enterprise suites do consolidation but not triage; CRMs do pipeline but not entities; reporting tools do finance but not action.

Sources are listed at the end. Most competitor detail comes from vendor and partner material, so verify specifics before quoting them externally.

---

## 4. The current Portfolio: audit and gaps

What exists (`components/portfolio/portfolio-page.tsx`, 263 lines, plus `lib/group-summary.ts` and `lib/portfolio-insights.ts`):

| Section | Today | Problems found |
|---|---|---|
| Overview | 5 KPIs (companies, people, open pipeline, won, payroll), an attention list, 6 "insights", company cards, and "What Janus remembers" | No revenue, profit or cash. "Won so far" is all-time and mixes periods. The memory panel shows **Acme mock memory** (`lib/mock-data/memory`) as if it were portfolio data. No period selector. |
| Analytics | Pipeline and won bars, a leads-by-month line, stage and source tables, headcount | **Lead history is synthetic.** `monthly()` in `group-summary.ts` scales a fixed curve (11, 14, 15, 13, 17) by company size; only October is real. That breaks the "no mock data" principle. No growth %, targets, conversion trends or filters. |
| Finance | Payroll, won, pipeline, claims, plus a "Ledgers: not connected" card | **Wrong:** it says Finance & Accounting is "Not connected" for every company, but Acme has it on, with invoices, bills, budgets and cash. No receivables, payables, cash, P&L, budgets or inter-company handling. Treats won deals as finance figures. |
| Work inbox | Nav link points to `/work` | **Opens the single active company's inbox**, not a cross-company one. |
| Activity | Nav link points to `/activity` | **Single company** only. |
| Companies | Cards with workspace toggles, edit name/industry/city, remove | No profile (legal entity, registrations, leadership, business model, status), no search, filter, sort or compare, no targets, no documents. |
| Janus Intelligence | Keyword matcher over 5 topics | No anomaly or risk detection, no "why", no evidence or basis labels, no benchmarking. Honest about limits, which is good and worth keeping. |
| Notifications | The same attention list with read marks | Not categorised, no severity or category filters, and it duplicates the Overview. |
| Portfolio access | Name, email, one of 3 roles, companies (localStorage) | **Not enforced:** the scope is never applied, so an "invited" person changes nothing. The roles don't match the six required. |
| Compliance | — | Missing entirely. |
| Global | "Add company" in the header on every view | It should be only in Companies (as requested). |

**Architecture gaps (backend):** `backend/janus_api/org/models.py` has `Tenant`, `Role`, `Membership` and `Invitation`, all per tenant. There is no `Portfolio` or group entity, no portfolio membership with company scope, and no aggregate endpoint. The Portfolio works only in demo mode (`if (!demoMode)` shows "not available"). Real tenant isolation exists, but cross-company access is not modelled.

---

## 5. Metric catalogue: what can be calculated today

Rule: a metric is shown only if it has a definition, a source record and a basis label. A company that cannot supply it shows **"—" with the reason**, never zero.

**Available now** = computable from records that already exist. **Needs data** = requires a new record or integration.

### 5.1 Financial

| Metric | Definition | Source | Basis | Status |
|---|---|---|---|---|
| Net sales | Taxable invoice value in period (ex-GST) − approved credit notes; cancelled invoices excluded | Finance: invoices, credit notes | Verified | Available (companies with F&A) |
| Booked costs | Bills + expenses (ex-GST) + approved write-offs in period | Finance | Verified | Available |
| Profit before payroll / margin | Net sales − booked costs | Finance | Verified | Available |
| Payroll run-rate | Σ monthly salary of active staff × period length | HR salaries | **Estimate** (not booked) | Available |
| Profit after payroll | Profit before payroll − payroll run-rate | Finance + HR | **Estimate** | Available; **verified** once payroll posts to the ledger |
| Cash position | Opening cash + receipts − payments ± bank entries − petty-cash top-ups | Finance cash flow | Verified* | Available. *Only as accurate as the opening cash and bank reconciliation |
| Cash collected / paid | Payments received / made in period | Finance | Verified | Available |
| Receivables, overdue, ageing (0/30/60/90+) | Unpaid invoice balance incl. GST after credits | Finance | Verified | Available |
| Payables, overdue, due in 30 days | Unpaid bill balance | Finance | Verified | Available |
| Cash runway | Cash ÷ average monthly net outflow over 3 months, shown only if cash is falling | Finance | **Estimate** | Available |
| Customer concentration | Top customer share of sales | Invoices | Verified | Available |
| Budget vs actual | Budget lines: allocated vs drawn; quarterly plans | Finance budgets | Verified | Available |
| Inter-company sales/purchases | Invoices/bills whose counterparty is another Portfolio company | Finance (name match) | Verified (match by name) | Available. **Needs** an explicit counterparty link for reliability |
| Balance sheet (assets, liabilities, equity) | — | — | — | **Needs data:** fixed assets, loans, GST payable/ITC, share capital (partly present) |
| Gross margin (COGS) | — | — | — | **Needs data:** inventory valuation and COGS posting from Operations |
| Revenue YoY | — | — | — | **Needs data:** history before Sep 2026 (opening balances or ledger import) |
| GST liability / ITC | Output GST − input GST | Finance GST summary | Verified | Available per company (exists in Finance); not yet rolled up |

### 5.2 Sales and customers

| Metric | Definition | Status |
|---|---|---|
| New leads (by month/channel) | Leads created in period, **counted from `createdAt`** (replaces the synthetic curve) | Available (CRM companies) |
| Open pipeline, open deals | Deals in open stages today | Available |
| Deals won (value/count) | Won deals updated in period. **A sales figure, not revenue** | Available |
| Win rate | Won ÷ (won + lost) in period; all-time fallback below 3 closures | Available |
| Lead conversion | Period's leads now won ÷ period's leads | Available |
| Average deal size | Won value ÷ won count | Available |
| Slipped deals | Open deals past expected close date | Available |
| Quiet leads | Open leads with no activity for 4+ days | Available |
| New customers | Customers with their first win in period | Available |
| Retention / repeat rate | Customers invoiced in 2+ periods | Available only where books exist; **weak** until there are 12 months of history |
| CAC | Marketing spend ÷ new customers | **Needs data:** spend tagged to acquisition |
| Sales cycle | Won date − lead created | Available (not yet built) |

### 5.3 People and operations

| Metric | Status |
|---|---|
| Headcount, departments, joiners | Available |
| Leave waiting, on leave today, expense claims waiting | Available |
| Revenue per employee | Available (net sales ÷ headcount) where books exist |
| Attrition | **Needs data:** exit records over time |
| Ticket SLA, stock-outs, project margin, IT renewals | Exist per company (Support, Operations, Projects, IT); **not yet rolled up** |

### 5.4 Targets

There is **no target record today**. Recommended: quarterly targets per company for net sales, cash collected, deals won and new leads. Achievement is actual ÷ target, judged against the share of the quarter that has passed. *Needs data (user-entered); the model is built.*

---

## 6. Reports and statements an owner needs

| Report | Frequency | Consolidated? | Status in Janus |
|---|---|---|---|
| Profit & loss (by company + consolidated, inter-company eliminated) | Monthly | Yes | Per company exists; consolidated **to build** (logic done) |
| Cash flow (receipts, payments, closing cash) | Monthly | Yes | Per company exists; roll-up to build |
| Receivables ageing + top debtors | Weekly | Yes | Per company exists |
| Payables ageing + upcoming payments | Weekly | Yes | Per company exists |
| Budget vs actual | Monthly/quarterly | Per company | Exists per company |
| Target vs actual | Quarterly | Yes | **New** |
| Sales pipeline and forecast | Weekly | Yes (pipeline only) | Partly |
| GST summary (output, ITC, payable) | Monthly | Per GSTIN (never consolidated) | Exists per company |
| Payroll and statutory deductions (PF/ESI/PT/TDS) | Monthly | Per company | Exists in HR |
| Compliance calendar and filing register | Monthly | Per company | **New** |
| Balance sheet | Monthly/yearly | Yes | **Needs data** |
| Monthly management pack (all of the above, with commentary) | Monthly | Yes | **Recommended**: export from Portfolio |

Note: GST, TDS and statutory returns are **per legal entity / GSTIN**, so the Portfolio must never show a "consolidated GST" figure as if it were payable.

---

## 7. Legal, compliance and document register (India first, jurisdiction-aware)

### 7.1 Registration facts each company needs

Legal name, entity type (Pvt Ltd, Public Ltd, OPC, LLP, Partnership, Proprietorship), CIN/LLPIN, PAN, TAN, GSTIN(s) per state, EPF establishment code, ESIC code, Shops & Establishment registration, Professional Tax registration (state), Udyam/MSME number, registered address, date of incorporation, directors/partners with DIN, auditor, and company secretary.

Today the records hold only GSTIN (all three companies) and, for Acme, a CIN and address. **Everything else is missing and should show as missing.**

### 7.2 Obligation rules (derived from the company's own data)

| Obligation | Applies when | Standard due date |
|---|---|---|
| GSTR-1 | Has GSTIN (monthly filer) | 11th of next month (QRMP: 13th after quarter) |
| GSTR-3B + GST payment | Has GSTIN | 20th of next month (QRMP: 22nd/24th by state) |
| GSTR-9 annual | Has GSTIN (optional below ₹2 Cr) | 31 Dec |
| TDS deposit | Pays salaries / TDS-able payments | 7th of next month (March: 30 Apr) |
| Form 24Q (salary TDS return) | Pays salaries | 31 Jul, 31 Oct, 31 Jan, 31 May |
| EPF ECR + payment | 20+ employees or registered | 15th of next month |
| ESI | 10+ employees (most states) or registered | 15th of next month |
| Professional tax | Employees in a PT state (KA, MH, …) | KA: 20th of next month; MH: month end (if liability > ₹50k/yr) |
| Advance tax | Expected tax > ₹10,000 | 15 Jun / 15 Sep / 15 Dec / 15 Mar |
| Tax audit report (3CA/3CD) | Turnover above audit limit | 30 Sep |
| ITR | All | 31 Oct (audit cases); 31 Jul (non-audit) |
| AGM | Pvt/Public Ltd (not OPC) | 30 Sep |
| AOC-4 | Companies | 30 days after AGM (OPC: 180 days from FY end) |
| MGT-7 / MGT-7A | Companies | 60 days after AGM |
| DIR-3 KYC | Each director | 30 Sep |
| DPT-3 | Companies with loans/deposits | 30 Jun |
| LLP Form 11 / Form 8 | LLP | 30 May / 30 Oct |

**Honesty rules:**
- Janus has no link to the GSTN, TRACES, EPFO, ESIC or MCA portals. A filing is **"Filed" only when a person records it** (date and acknowledgement number). A past date with no record is **"Past due · not confirmed"**, never assumed late or filed.
- Government extensions are not tracked, so every page states "standard calendar, confirm with your CA".
- Rules are data (a table per jurisdiction). Adding UAE VAT, US EIN/1120 or Singapore ACRA later means adding rules, not changing screens.

### 7.3 Document vault per company

Certificate of incorporation, MoA/AoA (or LLP agreement or partnership deed), PAN and TAN letters, GST registration certificate(s), EPF/ESI registrations, Shops & Establishment, PT, Udyam, trade licences, bank account proofs, board resolutions, statutory registers, audited financials, ITR acknowledgements, key contracts, leases, insurance policies, and IP (trademarks) with **expiry dates and renewal reminders**. A `vault` module exists in the backend and should be extended with *document type*, *expiry date* and *verified by*.

---

## 8. Risk indicators the owner should be warned about

| Area | Indicator | Trigger (suggested) | Basis |
|---|---|---|---|
| Cash | Runway | < 6 months watch, < 3 months high | Estimate |
| Cash | Bills due in 30 days > cash | Any | Verified |
| Receivables | Overdue share of receivables | ≥ 30% watch, ≥ 50% high | Verified |
| Receivables | Customer concentration | Top customer ≥ 40% of sales | Verified |
| Profit | Loss before payroll in quarter | Any | Verified |
| Profit | Payroll ÷ net sales | > 60% | Estimate |
| Budget | Budget line used | ≥ 90% | Verified |
| Sales | Net sales or leads move vs same days last period | ±25% (sales), ±30% (leads, min volume 4) | Verified |
| Sales | Slipped deals | Any; high if ≥ 3 or ≥ ₹5L | Verified |
| Sales | Quiet leads | ≥ 5; high ≥ 10 | Verified |
| Sales | Win rate vs portfolio median | ≤ median − 15 pts | Verified |
| Group | Pipeline concentration in one company | ≥ 60% | Verified |
| Compliance | Past-due filing not confirmed | Any = high | Verified |
| Compliance | Missing registration (PAN, TAN with payroll, EPF at 20+, GSTIN with GST invoices) | Any | Verified |
| Targets | Achievement vs time elapsed | < 80% of pace = behind; < 50% = high | Verified |
| Data | Company with no books / no CRM | Always shown as a blind spot | Verified |

Thresholds should be editable per portfolio later. These defaults are sensible for Indian SMEs.

---

## 9. Recommended information architecture

The proposed navigation is sound. Changes are kept to the minimum:

```
PORTFOLIO
  Overview            triage: what's on fire, what needs me, group money & momentum
  Analytics           comparison & trends; Targets lives here
  Finance             consolidated vs by-company; eliminations visible
  Work Inbox          ← now cross-company (was the active company's /work)
  Activity            ← now cross-company (was the active company's /activity)
MANAGE
  Companies           the only place to Add company; each company has a profile page
  Janus Intelligence  findings + ask
  Compliance          ← new
  Notifications       alerts only (what changed); actions live in Work Inbox
ACCESS
  Portfolio Access    6 roles × company scope; preview as a member
```

Principles:

- **Notifications vs Work Inbox:** a notification says *something happened* (an anomaly, a deadline approaching, a new risk) and can be read and dismissed. A work item needs *someone to act* and has an owner, deadline and status. The same event can create both; one does not replace the other.
- **Drill-down path:** Portfolio metric → company row → company profile (`?view=companies&company=id`) → the record in that company (switches company, opens the exact view). Every number follows this path.
- **Global filters:** period (this month, last month, this quarter, last quarter, FY to date, all) and company multi-select, kept in the URL so a view can be shared.
- **Consolidated vs individual** figures are always labelled, and a "coverage" line says how many companies a total includes ("Net sales · 1 of 3 companies keep books in Janus").

---

## 10. Section-by-section design

### 10.1 Overview (triage)
1. **Header strip:** period picker and company filter.
2. **Group KPIs** (consolidated, each with a definition popover and coverage): net sales, profit before payroll (with an after-payroll estimate), cash position, receivables (overdue), open pipeline, deals won, people.
3. **Company scoreboard:** one row per company with health (Needs attention / Watch / On track / Limited data), net sales and Δ%, margin, cash, overdue receivables, pipeline, win rate, target pace, and compliance state. Click a row to open the profile.
4. **Needs your attention:** the top 6 high-priority items, mixing Janus findings and work items, each with company, why, and an Open button.
5. **Upcoming 30 days:** filings, bills due, deals closing, leave starting. One dated list.
6. **Pending decisions:** a count by type, linking to the Work Inbox.
7. Remove "What Janus remembers" (mock, single-company).

### 10.2 Analytics
- **Revenue and profitability by company** (bars + table), **revenue contribution** (share of group net sales).
- **Growth:** MoM, QoQ and FY-to-date versus the same days of the prior period (not a full prior period). YoY is shown as "not enough history" until data exists.
- **Targets** (anchor `#targets`): set per company and quarter; actual vs target vs expected pace.
- **Sales funnel per company:** leads → won, conversion, win rate, average deal, slipped deals; leads by channel with win rate.
- **Customer acquisition:** new customers per month; repeat customers where books exist.
- **Expense distribution and margins:** costs by type (bills vs expenses), margin trend.
- **Cash flow:** receipts, payments and closing cash by month per company.
- **Team productivity:** revenue per employee, won value per salesperson, leads per salesperson.
- An **insight strip** at the top: Janus findings relevant to the filters.
- Every chart has a "what this shows" line and its source. No chart without a decision behind it.

### 10.3 Finance
- A **Consolidated / By company** switch at the top.
- **Consolidated statement:** combined → minus inter-company → consolidated, for net sales, costs, profit, receivables and payables. The elimination detail table lists each inter-company invoice or bill, and *unmatched* inter-company items (one side recorded only) are flagged for reconciliation.
- **By company:** income, costs, profit, margin, cash, runway (estimate), receivables ageing, payables ageing, budget vs actual.
- **Upcoming obligations (90 days):** bills, statutory payments (GST, TDS, PF/ESI) and advance tax.
- **Financial risks:** Janus finance findings.
- Companies without books: a clear "No ledger, switch on Finance & Accounting" row. Won deals are **never** presented as revenue.

### 10.4 Companies
- A **list/table** with search, filters (status, industry, workspace, health, state) and sort (name, net sales, pipeline, people, health). Tick 2–4 companies to **compare** them side by side.
- **Company profile page:** identity (logo, legal name, industry, business model, status, founded), leadership, registration (entity type, CIN, PAN, TAN, GSTIN, EPF/ESI codes, address, with missing fields flagged), financial summary, performance summary, targets, team (headcount by department, Portfolio members with access), workspaces, documents (vault, with expiries), and quick links into the company.
- **Add company** appears only here. Edit details covers the profile and legal fields. Remove requires typing the name.

### 10.5 Janus Intelligence
See section 11.

### 10.6 Work Inbox
Unified items from: fund requests, credit notes and write-offs (approval), expense claims, leave, overdue invoices (collect), bills due or overdue (pay), deals closing or slipped, compliance due or unconfirmed, and Janus recommendations. Each item shows **company, type, priority, owner, deadline, status** and an Open link to the exact record. Filters: company, type, priority, owner, overdue only. Group by company or type. Snooze is per person. The record's own status stays authoritative.

### 10.7 Activity
One timeline: leads, deals won and lost, invoices, payments, bills, credit notes, fund requests, leave and claims, joiners, the finance audit trail, and Portfolio changes (company edits, workspace toggles, access changes, filings recorded, targets set). Filters: company, type, user and date range, grouped by day.

### 10.8 Compliance
- A **company status board:** confirmed vs past-due-unconfirmed, missing registration fields, and the next deadline.
- A **calendar/list** of obligations (−45 to +120 days), filterable by company, category (GST, TDS, payroll statutory, income tax, company law) and status.
- Actions: **Record filing** (date and acknowledgement number), **assign responsible person**, set reminder days.
- A **missing information** list with a direct "add details" link to the company profile.
- A **document expiry** list from the vault.

### 10.9 Notifications
Built from the same signals plus deadline reminders. Each one shows severity, category (financial risk, anomaly, compliance, approvals, operations, Janus), company, read or unread state, and the time it was raised. Filters by company, severity, category and read status, with "mark all read". Notifications are capped and deduplicated by signal id, so the same finding does not repeat daily.

### 10.10 Portfolio Access
Six roles, each with a company scope:

| Role | Sections | Money figures | Manage companies | Add/remove company | Compliance actions | Manage access | Company scope |
|---|---|---|---|---|---|---|---|
| Portfolio owner | All | ✓ | ✓ | ✓ | ✓ | ✓ | All |
| Portfolio administrator | All | ✓ | ✓ | ✓ | ✓ | ✓ | All or chosen |
| Company administrator | All except Access | ✓ | ✓ (own) | — | ✓ | — | **Must** choose |
| Finance manager | Overview, Analytics, Finance, Inbox, Activity, Intelligence, Compliance, Notifications | ✓ | — | — | ✓ | — | All or chosen |
| Operations manager | Overview, Analytics, Inbox, Activity, Companies, Intelligence, Notifications | **✗** | — | — | — | — | All or chosen |
| Read-only | Overview, Analytics, Companies, Activity | ✓ | — | — | — | — | All or chosen |

Enforcement order: **filter companies first, then sections, then money fields.** A person outside a company never receives its numbers, not even inside a total. The owner can **preview as** any member. Company-level roles inside each company are unchanged and separate.

---

## 11. Janus Intelligence: design

**What it is:** a findings engine over the metric catalogue, plus question answering that uses only those findings and figures.

**Every finding carries:**
- a type (risk, anomaly, opportunity, benchmark, data gap)
- a category (finance, sales, people, compliance, setup, data)
- a severity
- a title and a one-line *why*
- **evidence rows** (label, value, source record)
- a **basis** (*Verified*: recorded facts; *Estimate*: a calculation with an assumption, which is stated)
- the amount at stake (used for ranking)
- a **suggested action** linking to the record

**"Why" explanations are computed, not written by a model:**
- Revenue change is decomposed **by customer** (largest movers between the two periods).
- Lead change is decomposed **by channel**.
- Win-rate gaps are shown against the portfolio median with every company's figure.

**The example questions, and how each is answered:**

| Question | How it is answered | What it says it cannot do |
|---|---|---|
| Which company is performing worst this month, and why? | Ranks companies by the weight of open findings; lists the worst one's findings with evidence | Names companies missing books or CRM, where a like-for-like ranking is impossible |
| Why has revenue declined across two companies? | Net sales vs same days last month per company, with customer movers; CRM-only companies are shown as "deals won (not revenue)" | Companies without books can't have revenue explained |
| Which company needs immediate attention? | High-severity findings grouped by company | — |
| Compare profitability across all companies | Table of net sales, costs, profit before payroll, margin, payroll estimate and after-payroll estimate; consolidated line with eliminations | States that payroll is an estimate until posted to books |
| Biggest financial risks this quarter? | Finance risks sorted by amount at stake | — |
| Anything else | Matched to cash, pipeline, people, compliance, targets, opportunities or a named company | Otherwise: "I could not match this to your records, and I will not guess." |

When a live LLM is connected later, it should **only phrase** these computed answers. It receives the evidence rows as context and must cite them. It never produces numbers itself.

---

## 12. The ideal experience for 3–10 companies

- **Monday, 10 minutes:** Overview → the scoreboard shows GreenLeaf "Limited data" and Acme "Needs attention" (₹1.7L overdue, GSTR-3B for September not confirmed) → Work Inbox filtered to "Overdue" → record the filing, and nudge the invoice owner from the link.
- **Weekly review, 30 minutes:** Analytics, this month vs same days last month → Nimbus leads −35% (website −5) → Intelligence: "Why?" → channel breakdown → action to open Nimbus lead sources.
- **Month-end:** Finance, consolidated, last month → eliminations line (₹0, no inter-company this month) → budget vs actual → Compliance shows the next month's calendar with owners assigned.
- **Quarter start:** set targets per company. Through the quarter, pace warnings appear automatically.
- **Delegation:** add the CA as Finance manager limited to Acme and Nimbus; add the GreenLeaf MD as Company administrator for GreenLeaf only; preview each to confirm.

At 10 companies, the scoreboard table (not cards) and filters matter most, so cards become an optional view.

---

## 13. Data and platform gaps, by priority

| # | Gap | Why it matters | Effort |
|---|---|---|---|
| 1 | **Backend portfolio entity**: `portfolios`, `portfolio_companies` (tenant ids), `portfolio_members` (role + company scope), and aggregate endpoints that check scope per tenant | Without it, nothing in the Portfolio is enforceable or live (demo only today) | L |
| 2 | **Finance & Accounting for every company** (or a Tally/Zoho Books import) | Revenue, profit and cash cover only Acme today (1 of 3) | M per company |
| 3 | **Post payroll to the ledger** | Turns profit-after-payroll from an estimate into verified | M |
| 4 | **Registration profile** fields on the tenant (entity type, CIN, PAN, TAN, EPF, ESI, PT, Udyam, directors) | Compliance applicability and missing-info checks | S |
| 5 | **Filing register** table (key, filed on, acknowledgement, by) + reminders | Compliance status, audit trail | S |
| 6 | **Targets** table (company, quarter, measure, value) | Target vs actual | S |
| 7 | **Explicit inter-company counterparty** on invoices/bills, plus auto-mirroring (as Business Central does) | Reliable eliminations instead of name matching | M |
| 8 | **Document vault**: type, expiry, verified-by | Registration documents and renewals | S |
| 9 | Opening balances or historical import | Growth YoY, retention, balance sheet | M |
| 10 | Roll-ups from Support, Operations, Projects and IT (SLA, stock-outs, project margin, licence renewals) | Operational performance section | M |
| 11 | Configurable risk thresholds per portfolio | Different groups have different tolerances | S |

---

## 14. Implementation status

**Built and committed (calculation layer, not yet on screen):** `lib/portfolio/`

| File | What it does |
|---|---|
| `books.ts` | Reads each company's records (CRM, HR, **Finance**, registration profile) without mixing companies. A switched-off workspace contributes nothing. |
| `period.ts` | FY-aware periods (India Apr–Mar quarters); running periods are compared with the same days of the prior period. |
| `metrics.ts` | The metric catalogue (definition, source, basis) and per-company figures; consolidation with **inter-company elimination**; monthly trends from dated records (replaces the synthetic curve). |
| `compliance.ts` | Indian statutory calendar derived from entity type, state, GSTIN, payroll and headcount; missing-information checks; filed / not-confirmed / due-soon status. |
| `intelligence.ts` | Signals with evidence and basis; company health; question answering for the five example questions and more. |
| `work.ts` | The unified cross-company work inbox. |
| `activity.ts` | The unified cross-company timeline. |
| `access.ts` | The six roles, section and money permissions, and company scope. |
| `state.ts` | Portfolio-level records: targets, filings, access, change log. |
| `components/portfolio/model.ts` | One hook that assembles all of it for the companies the viewer may see. |

Supporting changes: `CompanyRecord` gained optional `status`, `businessModel`, `legal` and `leadership` fields, and the finance store exports the sample company's starting books.

**Testing:** TypeScript compiles cleanly for all new files, and ESLint passes. The one remaining `tsc` error (`LayoutProps` in `app/layout.tsx`) was already there. **The calculations have not yet been run against the sample data or shown on screen.**

**Next (in order):**
1. Screens for each section on top of the model.
2. Navigation changes (Work Inbox, Activity and Compliance as Portfolio views; Add company only in Companies).
3. Remove the synthetic lead history and mock memory panel.
4. Browser test of every filter and drill-down as owner and as each role.
5. Backend portfolio entity (gap 1).

---

## Sources

- NetSuite OneWorld: [Cleverence overview](https://www.cleverence.com/articles/oracle-documentation/oneworld-overview-netsuite-7481/), [Tim Dietrich on inter-company eliminations](https://timdietrich.me/blog/netsuite-intercompany-transactions-eliminations/), [KORE1 on multi-subsidiary consolidation](https://www.kore1.com/netsuite-multi-subsidiary-consolidation/), [HouseBlend on subsidiaries and eliminations](https://www.houseblend.io/articles/en/configuration-filiales-netsuite-nexus-eliminations), [Anchor Group](https://www.anchorgroup.tech/blog/netsuite-multi-entity-accounting)
- Dynamics 365 Business Central: [Microsoft Learn, consolidating data from multiple companies](https://learn.microsoft.com/lt-lt/dynamics365/business-central/finance-consolidated-company-reporting), [Microsoft release plan, consolidation across environments](https://learn.microsoft.com/zh-tw/dynamics365/release-plan/2023wave2/smb/dynamics365-business-central/do-financial-consolidations-across-environments-multi-company-setups), [ArcherPoint](https://archerpoint.com/managing-multiple-companies-and-currencies-in-business-central/), [Creative Computing](https://www.creative-computing.co.uk/resources/multi-company-reporting-in-business-central-a-plain-english-guide-for-finance-directors)
- Zoho: [Zoho help, multiple Books organisations in Analytics](https://help.zoho.com/portal/en/kb/partner-support-solutions-tbs/solutions/zoho-analytics-partner-support-solutions/articles/multi-currency-financial-reports-from-multiple-zoho-books-organizations-in-zoho-analytics), [Zoho community, consolidated balance sheet](https://help.zoho.com/portal/ja/community/topic/solution-of-the-week-consolidated-balance-sheet-for-multiple-orgs-multiple-countries-with-different-base-currencies?page=1), [ScaleXP on consolidating Zoho Books orgs](https://www.scalexp.com/blog/how-to-consolidate-multiple-zoho-books-organisations-without-spreadsheets/)
- HubSpot: [Huble on HubSpot Brands](https://huble.com/blog/hubspot-brands), [Lynton, Business Units vs multiple portals](https://lyntonweb.com/inbound-marketing-blog/hubspot-business-units-syncsmart-portals), [HubSpot community on per-unit GDPR](https://community.hubspot.com/t/different-gdpr-options-for-each-business-unit/50385)
- Salesforce: [Salesforce Developers, multi-org strategy](https://developer.salesforce.com/blogs/2014/10/enterprise-architecture-multi-org-strategy), [Quinnox, org consolidation](https://www.quinnox.com/salesforce-org-consolidation-strategy/), [K2 University, the multi-org dilemma](https://k2university.com/news/salesforce-multi-org-dilemma/), [Redress Compliance](https://redresscompliance.com/salesforce-org-strategy-consolidation-vs-multi-org)
- Fathom / Spotlight: [Fathom vs Spotlight](https://www.fathomhq.com/blog/fathom-vs-spotlight-reporting), [Spotlight, product for consolidation](https://help.spotlightreporting.com/multi/product-for-consolidation), [Porte Brown, multi-entity reporting with Fathom](https://www.portebrown.com/newsblog-archive/multi-entity-financial-reporting-with-fathom)
- Indian statutory due dates are the standard calendar under the CGST Act and rules, Income-tax Act, EPF and ESI Acts, state PT Acts, Companies Act 2013 and LLP Act. Government extensions are not reflected, so confirm with a CA.
