# Janus HR & People workspace research

**Research cut-off:** 23 October 2026 (IST)  
**Audience:** Janus product, engineering, GTM and design teams  
**Target:** Indian SMBs and lower mid-market companies with 10–200 employees; trading, manufacturing, services, retail chains and agencies  
**Method:** public government material, vendor documentation/pricing, public review pages and practitioner discussions. Prices and feature claims are time-sensitive. Every source below was accessed on 23 October 2026 unless another date is stated.

**Deep-research pass:** this revision adds primary EPFO/ESIC contribution references, the Code on Wages FAQ, additional Labour Code interpretation, and review-page evidence. It preserves “unknown” where a public source does not support a confident claim.

> **How to read this report**  
> **Fact** means a source-backed statement. **[Vendor claim]** means the vendor is making the claim; it is not independent validation. **[Judgement]** is a Janus product recommendation. “Unknown” means that a public source did not make the claim verifiable; it should not be presented as a capability in sales material.

## 1. Executive summary

Janus should enter HR through **attendance, leave and payroll confidence**, delivered to a mobile/WhatsApp workforce and connected to the same employee record used by CRM, Finance and Projects. SMBs do not need another isolated employee directory; they need fewer Excel sheets, fewer WhatsApp approvals and fewer payroll surprises.

The day-one product must cover: (1) employee master and onboarding, (2) attendance, shifts, overtime and leave, (3) India payroll with PF/ESI/PT/TDS configuration and explainable payslips, (4) employee/manager self-service on low-end Android and WhatsApp, and (5) an approval/audit layer with field-level salary privacy. Recruitment, performance, learning, expenses and assets matter, but can follow a reliable payroll loop.

The three strongest Janus differentiators are:

1. **One permissioned company graph:** the employee, team, cost centre and manager are shared with CRM, Finance, Projects and Business Intelligence instead of copied into each module.
2. **Human-controlled AI operations:** payroll pre-checks, attendance anomaly detection, policy answers and onboarding agents are grounded in records and policies; money, payroll, bulk messages and deletion always require approval.
3. **India-first frontline experience:** WhatsApp/Hinglish requests, offline-tolerant mobile attendance and simple owner views, with web depth for HR/admin.

**Recommended wedge [Judgement]:** start with a 10-minute import from Excel/Tally/another HRMS, attendance + leave on mobile/WhatsApp, and a “payroll rehearsal” that compares this month with last month before anyone approves payment. It solves a painful recurring job and creates the data foundation for the rest of Janus.

Do not lead with a generic AI chatbot, an enterprise talent suite or a promise of autonomous payroll. Trust, statutory accuracy and support are the product.

## 2. Personas and real day-to-day pains

### Owner / founder

**Jobs:** know headcount and payroll liability, approve sensitive changes, see attendance/attrition risk, understand whether hiring is paying back, and get statutory work done without becoming a payroll specialist.

**Observed pain:** owners often rely on an HR/admin person plus Excel, Tally and WhatsApp. They need a short, cash-aware view rather than another dashboard. Payroll products increasingly sell direct salary payment and compliance automation (for example, RazorpayX Payroll lists calculation, payslips, salary payment and compliance filings in its plan comparison) [RazorpayX Payroll pricing](https://razorpay.com/payroll/pricing/). The opportunity is to explain *why* the number changed and connect payroll cost to revenue and delivery.

**Janus implication [Judgement]:** the owner home screen should answer “what needs my decision today?” in ten seconds: payroll delta, unapproved attendance corrections, new joiners/exits, compliance deadlines and people risk. A metric without source records or a confidence label should not be shown.

### HR/admin (often also accounts)

**Jobs:** import and clean employee data, collect documents, configure salary structures, reconcile attendance, answer leave/payslip questions, run payroll, make statutory filings, manage exits and respond to auditors.

**Pain signals:** published plans repeatedly charge extra for attendance, expenses, performance, timesheets, recruiting and analytics. greytHR’s public price page lists a base plan and add-ons such as PMS, timesheets, expenses, GPS and recruitment [greytHR pricing](https://www.greythr.com/pricing). Pocket HRMS lists a 50-employee minimum and separate add-ons for travel/expenses, timesheets, helpdesk, recruiting, learning and WhatsApp [Pocket HRMS pricing](https://www.pockethrms.com/pricing/). This structure creates setup and reconciliation work.

**Janus implication [Judgement]:** invest in import mapping, validation, exception queues, reusable policy templates, a payroll diff and audit-ready evidence. Do not force an HR generalist to learn a workflow builder for common approvals.

### Manager

**Jobs:** approve leave/regularisation, see who is absent or late, plan shifts, confirm goals and reviews, onboard a direct report, and answer team questions without seeing confidential salary data.

**Pain:** managers need action lists, not HR configuration. A manager’s access must be scoped to their reporting line and assigned workspace. Salary, bank, tax and medical fields must be hidden by field, not merely removed from a menu.

**Janus implication [Judgement]:** give managers a small inbox of pending approvals and team exceptions, usable in mobile/WhatsApp, with deep links to the web when a decision needs context.

### Employee, including blue-collar and field staff

**Jobs:** punch in/out, request leave or correction, see roster and holiday, download payslip/Form 16, update bank/contact details, ask a policy question, submit an expense and receive notices.

**Pain signals:** SalaryBox’s public plans make GPS/selfie attendance, geofencing, liveness and fraud prevention prominent, while PagarBook prices app/web/face attendance and field tracking separately [SalaryBox pricing](https://salarybox.in/pricing/), [PagarBook pricing](https://pagarbook.com/pricing/). This confirms that frontline attendance and field visibility are core buying jobs, but it also shows the risk of surveillance and add-on complexity. A practitioner discussion on Indian attendance tools describes teams comparing apps for field and shift work rather than asking for a full talent suite [IndiaBusiness discussion](https://www.reddit.com/r/IndiaBusiness/comments/1wjonyh/staff_attendance_suggestions/).

**Janus implication [Judgement]:** use low-bandwidth Android, offline capture with a visible sync state, device/location policy controls, local-language/Hinglish prompts, and an optional WhatsApp channel. Never make WhatsApp the only way to prove identity or attendance; provide a transparent fallback and an appeal path.

### Finance / payroll partner

**Jobs:** reconcile payroll journal with accounting, fund salary, check statutory challans, manage reimbursements and explain variances to the owner.

**Janus implication [Judgement]:** make every payroll run exportable as a journal and evidence pack, with a clear boundary between HR calculation and bank/payment execution.

## 3. HRMS capability map for 10–200 employees

**Tags:** **Must (day 1)** = needed to switch a target customer; **Expected (within 12 months)** = buying expectation or retention driver after the core works; **Overkill (later/enterprise)** = defer unless a design partner proves a paid need.

| Lifecycle / module | Must (day 1) | Expected within a year | Overkill for the initial 10–200 segment |
|---|---|---|---|
| Recruit | Basic requisition, candidate record, interview notes, offer template and hand-off to onboarding | Job board integrations, resume parsing, structured scorecards, referral tracking | Full campus CRM, assessment marketplace, complex agency billing |
| Onboard | Offer/acceptance, joining checklist, document collection, bank/PAN/ID fields, policy acknowledgement, provisioning tasks | E-sign, background-check integration, equipment hand-off, automated nudges | Global mobility, multi-country work authorisation, complex preboarding journeys |
| Core HR | Employee master, employment history, manager/team/branch, emergency contact, documents, custom fields, audit log, import/export | Org chart, job/position history, employee self-edit with approval, document expiry alerts | Skills ontology, succession modelling, workforce planning simulations |
| Attendance & shifts | Mobile/web punch, optional device integration, location policy, rosters, late/absence, regularisation, overtime and holiday rules | Offline sync, facial/liveness option, multi-branch rules, field routes, biometric connectors | Predictive scheduling, labour-optimisation solver, union bid systems |
| Leave | Configurable leave types, accrual/carry-forward/encashment, holiday calendar by state/branch, request/approval/delegation | Comp-off, half-day/hourly leave, WhatsApp request, calendar integrations | Global leave harmonisation and complex collective bargaining rules |
| Payroll | Salary structures, variable/arrears/loan/deduction, attendance/leave inputs, PF/ESI/PT/LWF/TDS configuration, old/new tax regime, payslip, payroll diff, lock and approvals | Form 16/24Q workflow, bank files/API, gratuity/bonus/F&F, reimbursements, accounting journal/Tally export | Multi-country payroll, autonomous filing/payment, actuarial benefits, treasury/hedging |
| Expenses / reimbursements | Claim, receipt, policy limit, approval, payroll/accounting export | Travel desk, mileage/GPS, corporate card feed, UPI receipt ingestion | Global VAT reclaim, complex per-diem tax engines |
| Performance & goals | Simple goal cycle, check-in, manager feedback, review record | 360 reviews, calibration, competency library, promotion workflow | Nine-box succession, talent marketplace, psychometrics |
| Learning | Policy/course links and acknowledgement | Course catalogue, quizzes, certificates, skill tracking | LMS authoring, SCORM marketplace, skills inference at enterprise scale |
| Engagement | Announcements, pulse question, recognition-lite, grievance routing | Surveys, communities, rewards, eNPS trend | Full employee social network, gamification economy |
| Assets | Issue/return record, condition, serial/ownership, exit clearance | Barcode, procurement link, warranty reminders | ITAM discovery, software metering and endpoint management (belongs in IT workspace) |
| Exit & F&F | Resignation, notice, approvals, no-dues, final attendance/pay, documents, access checklist | Exit survey, gratuity estimate, automated letters, settlement payment export | Cross-border mobility, alumni marketplace, legal case management |
| Analytics | Headcount, attendance, payroll cost, leave, hiring funnel, attrition and exceptions; filters by branch/team | Cost-to-revenue, overtime, forecast, cohort and manager trends, scheduled reports | Workforce digital twin, opaque predictive attrition score, benchmark marketplace |

## 4. Indian compliance checklist (as of 23 October 2026)

### Labour Codes: current status and product impact

**Fact:** the Ministry of Labour and Employment announced that the four Labour Codes came into force on **21 November 2025**, consolidating 29 central labour laws [PIB implementation release](https://labour.gov.in/sites/default/files/pib2192463.pdf). The Ministry’s transition FAQs say existing rules continue during transition to the extent they align with the Codes, and the 2026 FAQ explains the new wage definition and exclusions [MoLE January 2026 FAQ](https://www.labour.gov.in/static/uploads/2026/01/de4758d5bfeffc456d7de97a801891b0.pdf).

**Fact:** MoLE’s March 2026 FAQ describes the 50% wage rule: allowances above one-half of remuneration are added back to wages; overtime is included for this test, while gratuity and ESI contributions are excluded from the wage calculation [MoLE additional FAQs](https://www.labour.gov.in/static/uploads/2026/03/a4ccf4c6d97c4f1f36a6d83f8c64213d.pdf).

**Fact:** state rules remain a material implementation variable. The Ministry’s rules-status release reported draft rules from 32 States/UTs in July 2025, with uneven coverage across Codes [MoLE rules-status release](https://www.labour.gov.in/static/uploads/2025/09/7d8bd630ae1a7a373ef3debd7c6191be.pdf). **[Judgement]** Janus must version statutory rules by effective date, state, establishment type and employee category; a single “India payroll” switch is unsafe.

**Fact:** the January 2026 Code on Wages FAQ says the Code removes the old “scheduled employment” limitation for minimum wages, requires wages above the applicable floor/minimum wage, and caps deductions at 50% of wages [Code on Wages FAQ](https://www.labour.gov.in/static/uploads/2026/01/75252c07c1fe3a2f5571ff1464e2375e.pdf). The March 2026 FAQ says annual performance incentives are not wages for the Code calculation, while overtime is included in the wage definition and excess allowances above 50% are added back [additional FAQ](https://www.labour.gov.in/static/uploads/2026/03/a4ccf4c6d97c4f1f36a6d83f8c64213d.pdf).

**Product consequence [Judgement]:** each salary component needs a statutory classification (wage, allowance, reimbursement, incentive, overtime, benefit), an effective date and an explanation. A free-form formula editor without those classifications is a compliance risk.

### Payroll and statutory controls

| Area | What Janus must calculate or retain | Product requirement / safe boundary |
|---|---|---|
| EPF / EPS / EDLI | Eligibility, employee/employer contributions, wage base, UAN and ECR/challan evidence | EPFO says establishments with 20 or more employees in covered classes must register; support ECR/challan exports and portal hand-off [EPFO employer page](https://www.epfindia.gov.in/site_en/For_Employers.php/Disablitity.php). EPFO’s published contribution table shows 12% employee EPF, employer allocation to EPF/EPS, 8.33% EPS and 0.5% EDLI, with a ₹15,000 wage ceiling and exceptions [EPFO contribution rates](https://www.epfindia.gov.in/site_docs/PDFs/MiscPDFs/ContributionRate.pdf). Treat rates, ceilings and exemptions as effective-dated configuration, not constants. |
| ESI | Coverage, contribution, IP number, monthly return/payment evidence | ESIC material lists a ₹21,000/month coverage ceiling and the current 3.25% employer / 0.75% employee contribution split [ESIC FAQ](https://www.esic.gov.in/attachments/files/faq.pdf), [ESIC annual report](https://www.labour.gov.in/static/uploads/2025/06/00d73e60340019d47d8a02c352166e14.pdf). Coverage thresholds and exemptions still need establishment-specific validation; model the rule and show the source/effective date. |
| Professional Tax | State-specific enrolment, slabs, deductions, returns and certificates | PT differs by state and sometimes municipality. Store establishment state/registration and effective-dated slabs; require HR/admin confirmation on changes. |
| Labour Welfare Fund | State-specific contribution and return calendar | Model as a statutory rule with state and periodicity; show “not configured” rather than silently assuming no liability. |
| Salary TDS | Tax regime declaration, projected income, exemptions/deductions as applicable, monthly TDS, quarterly return, Form 16 | The Income Tax Department lists Form 16 as the salary TDS certificate and Form 24Q as the quarterly salary deduction statement [salary forms](https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1?fromCampaign=true), [Form 24Q](https://www.incometax.gov.in/iec/foportal/node/309). Its transition FAQ says salary paid from 1 April 2026 follows the Income Tax Act 2025 and the TDS calculation must reset for the new tax year [TDS FAQ](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/%20tds-compliance-faq). Version tax logic and show the assumptions. |
| Gratuity | Eligibility, service period, wage basis, provision and settlement on exit | The Ministry’s gratuity material describes coverage of factories and shops/establishments with 10+ employees and the usual five-year continuous service rule, with death/disablement exceptions [MoLE gratuity material](https://www.labour.gov.in/static/uploads/2025/06/b0450aca5d58a12b10fdde29c1693dfd.pdf), [Act text](https://labour.gov.in/sites/default/files/the_payment_of_gratuity_act_1972_0_0.pdf). Keep a calculation explanation and legal-review flag. |
| Bonus | Eligibility, allocable surplus inputs, minimum/maximum bonus and payment records | The Payment of Bonus Act/Rules remain a source of obligations; retain eligibility and calculation evidence and make thresholds configurable [MoLE Bonus Rules](https://labour.gov.in/acts/payment-bonus-rules-1975), [Bonus Act notification](https://labour.gov.in/acts/payment-bonus-act-notification). |
| Minimum wages | State/sector/skill/category rate, effective date, VDA and overtime | Rates are notification-driven. Import signed rule tables and flag an expired or missing rate. Never infer a minimum wage from a generic salary template. |
| Overtime / working hours | Daily/weekly hours, consent, double-rate calculation, weekly rest and shift crossing midnight | The OSH Code provides twice-rate overtime and consent requirements [OSH Code Gazette](https://www.labour.gov.in/sites/default/files/osh_gazette_0.pdf). The Model Shops and Establishments bill uses nine hours/day and 48 hours/week as a reference and treats excess as overtime, but state enactments control [Model Shops & Establishments bill](https://labour.gov.in/sites/default/files/model_bill_englsih_.pdf). Treat the state rule as authoritative. |
| Records and wage slips | Attendance/muster, wage, overtime, fines/deductions, notices and payslips | The MoLE 2026 explanatory material says these registers can be electronic and should be retained for five years [MoLE 2026 FAQ/material](https://www.labour.gov.in/static/uploads/2026/02/83978455025732b99b0165def80ab171.pdf). Provide downloadable, signed evidence packs. |

### DPDP Act and Rules

**Fact:** the Digital Personal Data Protection Rules, 2025 were notified on 13 November 2025. The Gazette phases commencement: Rules 1, 2 and 17–21 immediately; Rule 4 after one year; Rules 3, 5–16, 22 and 23 after 18 months [DPDP Rules Gazette](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf), [MeitY notification page](https://www.meity.gov.in/dpdp-rules-notified-2025).

**HR implications [Judgement]:**

- Maintain purpose, lawful basis/notice, consent where required, data principal request handling, retention/deletion rules and processor records.
- Separate employee self-service access from HR/admin access; use field-level policies for salary, bank, tax, medical, identity and disciplinary data.
- Treat AI prompts, retrieval indexes, embeddings, chat history, exports and agent execution logs as personal-data surfaces. Do not use an employee’s data for model training by default.
- Give a human-readable explanation and approval step for AI decisions affecting pay, employment, attendance exceptions or disciplinary action.
- Keep breach triage, notification responsibility, data export and deletion evidence in the audit log. Use India-region storage where the customer’s policy requires it.

### Statutory and practical integrations

Day-one connectors should be **export/import first**, with optional direct integrations after a design partner confirms portal/API stability:

1. EPFO ECR/challan and ESIC/PT/LWF files or portal hand-offs.
2. Salary bank advice files and approved bank APIs; UPI/payout provider only after account and authorisation controls are proven.
3. Biometric/attendance devices and mobile GPS/selfie, with a device-independent fallback.
4. PAN, Aadhaar, bank-account and UAN validation through compliant providers; store only the minimum response and reference IDs.
5. DigiLocker/e-sign for documents where the customer has the relevant account and consent.
6. Tally/Zoho Books/QuickBooks journal export and an API for Finance workspace reconciliation.

## 5. Competitive landscape

### India: profiles and published pricing

Prices below are list prices observed on 23 October 2026. They exclude GST unless the source says otherwise. A price that requires a sales quote is deliberately shown as **quote**; do not turn a vendor’s marketing estimate into a Janus fact.

| Product | Target / position | Published entry price and scope | Mobile / WhatsApp / AI / compliance signal |
|---|---|---|---|---|
| **Keka** | Growing Indian SMB and mid-market HR/payroll suite | Quote on public pricing page; vendor markets SMB plans and no setup-fee/no-surprise positioning [Keka](https://www.keka.com/pricing), [small-company page](https://www.keka.com/small-companies) | Broad core HR, payroll, attendance, performance and engagement. WhatsApp and AI depth should be verified in a pilot; do not assume vendor claims equal autonomous action. |
| **Zoho People + Zoho Payroll** | Value-conscious SMBs already in Zoho ecosystem | Zoho Payroll: free up to 10; Standard ₹1,250 monthly/₹1,000 annual for 25 plus ₹50/₹40 extra; Professional ₹3,750/₹3,000 for 50 plus ₹75/₹60 extra [Zoho Payroll pricing](https://www.zoho.com/in/payroll/pricing-comparison/) | Strong ecosystem and payroll basics; Zoho Payroll lists statutory deductions, salary payment partners, payslips/TDS worksheets and bank advice. Zoho People pricing is rendered dynamically and should be captured in a quote. |
| **greytHR** | Established Indian HR/payroll for SMB and mid-market | Essential ₹2,495/month including 50, ₹45 extra; Growth ₹4,495 including 50, ₹85 extra; Premium quote. Add-ons include PMS, timesheets, expenses, GPS and Recruit [greytHR pricing](https://www.greythr.com/pricing) | Web/mobile, employee self-service and AI chatbot are vendor-listed; add-on structure can increase total cost. Compliance and payroll are core. |
| **Darwinbox** | Mid-market and enterprise HCM | Quote; public product site [Darwinbox](https://darwinbox.com/) | Deep suite, workflows and mobile; implementation and configuration are materially heavier than a 10-minute SMB setup. |
| **HROne** | Indian SMB-to-enterprise HRMS | Current launch page lists free up to 10; Starter ₹999/mo up to 25, Growth ₹1,999 up to 50, Professional ₹3,499 up to 100, Business ₹5,999 up to 250; Enterprise quote [HROne pricing](https://hrone.tech/pricing/). A legacy page has different numbers, so verify the signed quote [legacy page](https://hrone.cloud/pricing/). | Core/attendance/leave/documents in lower tiers; payroll, expenses, performance and compliance in higher tiers; WhatsApp bot/add-ons appear in vendor material. |
| **Zimyo** | HR suite for SMB/mid-market and global expansion | Basic ₹80/user/mo, Standard ₹160, Enterprise ₹240; minimum 50 [Zimyo pricing](https://www.zimyo.com/pricing/) | Core HR, attendance, payroll/compliance, mobile ESS; higher tiers add rosters, expense, performance and global payroll. Minimum 50 seats is a barrier for small teams. |
| **factoHR** | Indian payroll + workforce management | Free up to 20 (limited records/letters/payslips); Core ₹4,999/mo up to 50 + ₹99 extra; Premium ₹5,999 + ₹119; Ultimate ₹6,999 + ₹139 [factoHR plans](https://factohr.com/plans/) | Payroll, statutory PF/ESI/PT/TDS, attendance, AI face recognition and mobile; vendor says integrations include biometrics/Tally/QuickBooks [product page](https://factohr.com/hr-software/india/). Implementation may take weeks or longer for complex customers. |
| **Qandle** | Modular Indian HRMS, SMB through enterprise | Quote / third-party comparison only; verify with Qandle before using a number [Qandle](https://www.qandle.com/), [third-party overview](https://veritashrsolutions.com/software/qandle/) | Broad HR, recruitment, performance, payroll and workflows; public pricing and WhatsApp/AI depth are not sufficiently verifiable. |
| **sumHR** | Lightweight HR for startups/SMBs | Quote / unverified public rate [sumHR](https://www.sumhr.com/) | Core HR, leave, attendance and payroll positioning; validate statutory depth and mobile/WhatsApp in a pilot. |
| **Pocket HRMS** | Indian SME/enterprise, payroll-led | Standard ₹2,995/month annually for 50 + ₹60 extra; Professional ₹4,495 for 50 + ₹90; Premium quote, 100+ minimum [Pocket HRMS pricing](https://www.pockethrms.com/pricing/) | Payroll/statutory, geo attendance, ESS, AI chatbot, mobile; add-ons include expenses, timesheets, recruitment, learning, helpdesk and WhatsApp. |
| **Spine HRMS** | Traditional Indian payroll/HR deployments | Quote / no reliable public rate found [Spine HRMS](https://www.spinehr.com/) | Strong legacy payroll and attendance perception; mobile UX, onboarding speed and AI should be validated rather than assumed. |
| **RazorpayX Payroll** | Startup/SMB payroll with salary disbursal | Prime ₹3,499/mo up to 20; Elite ₹9,499 list/₹6,499 annual for 50; ₹150 per extra employee; 100+ enterprise quote [RazorpayX pricing](https://razorpay.com/payroll/pricing/) | Payroll, direct salary payments, TDS/PF/ESI/PT and time/attendance. Finance/payment trust is its wedge; it is not a complete HR experience by itself. |
| **PeopleStrong** | Mid-market/enterprise HCM | Quote; its public site does not expose a standard SMB rate card [PeopleStrong](https://www.peoplestrong.com/) | Broad HCM and payroll, suited to larger implementations; likely overkill for a 20-person owner-led business. |
| **SalaryBox** | Blue-collar, field and attendance-first SMB | Starter ₹1,500/mo + ₹30/user; Business ₹3,000 + ₹75/user; Enterprise quote; add-ons for live location, field CRM, verification, devices and payouts [SalaryBox pricing](https://salarybox.in/pricing/) | GPS/selfie/QR, fraud prevention, payroll/compliance, mobile ESS and field operations. Strong frontline reference; watch surveillance, battery and consent risks. |
| **PagarBook** | Very small/field businesses | Attendance/payroll ₹499 staff/year app, ₹699 app+web, ₹1,398 app+web+Lens; Geo ₹5,999/₹6,999 staff/year [PagarBook pricing](https://pagarbook.com/pricing/) | Simple attendance/payroll and field tracking; payroll depth and integrations should be checked against Janus target states. |

### Global reference points (patterns, not India compliance competitors)

| Product | Pattern worth learning | Public pricing / limitation |
|---|---|---|
| BambooHR | Clean employee record, workflow, reports, performance and employee experience; strong packaging discipline | Core starts at $10.25/employee/month, Pro $17.50, Elite $25; <=25 employees are flat $250/$425/$650 monthly [BambooHR pricing](https://www.bamboohr.com/pricing/). India statutory payroll is not the product’s native wedge. |
| Rippling | Unified employee identity across HR, payroll, IT and apps; powerful automation model | Core/product pricing is quote-based or region-specific; India statutory coverage should not be assumed [Rippling](https://www.rippling.com/). |
| Gusto | Transparent SMB payroll, tax filings, time and benefits with simple employee experience | Simple $49/month + $6/person; Plus $80 + $12; Premium $180 + $22 [Gusto pricing](https://gusto.com/product/pricing). US tax/benefits model is not transferable to India. |
| Deel | Global contractor/EOR/payroll and employee records | Public plan pages are region/product dependent; India payroll must be verified for local filings [Deel](https://www.deel.com/pricing/). |
| HiBob | Mid-market employee experience, people analytics and workflows | Quote; global HRIS pattern rather than Indian payroll [HiBob](https://www.hibob.com/). |
| Personio | European SMB/mid-market core HR, recruiting, payroll partners and integrations | Quote based on employees/modules; annual subscriptions and 200+ integrations are described publicly [Personio pricing](https://www.personio.com/pricing/). |
| Workday | Enterprise system of record, talent, finance and planning | Quote/implementation-heavy; use as a permissions/audit pattern, not as Janus’s SMB scope [Workday](https://www.workday.com/). |

### Competitor capability matrix

Legend: **✅** publicly evidenced/core; **◐** partial, add-on, tiered or needs verification; **❌** not the product’s core; **?** public evidence insufficient. This is a product-design comparison, not a claim that a vendor cannot do something through a custom contract.

#### Indian products

| Capability | Keka | Zoho | greytHR | Darwinbox | HROne | Zimyo | factoHR | Pocket | RazorpayX | SalaryBox/PagarBook |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Employee master / ESS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ |
| Attendance / shifts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ |
| India payroll + statutory | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ |
| Recruitment / onboarding | ✅ | ◐ | ◐ | ✅ | ◐ | ✅ | ✅ | ◐ | ❌ | ◐ |
| Performance / goals | ✅ | ◐ | ◐ add-on | ✅ | ◐ | ✅ | ◐ | ◐ | ❌ | ❌ |
| Expenses / reimbursements | ✅ | ◐ | ◐ add-on | ✅ | ◐ | ✅ | ◐ | add-on | ◐ | ◐ |
| Mobile frontline / field | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ |
| WhatsApp workflows | ◐ | ◐ | ? | ? | ◐ | ◐ | ? | add-on | ◐ | ◐ |
| Grounded AI agent with approval | ? | chatbot/◐ | chatbot/◐ | marketing/◐ | ◐ | ◐ | ◐ | chatbot/◐ | ? | ? |
| Cross-workspace graph | ◐ | ecosystem/◐ | ◐ | ✅ enterprise | ◐ | ◐ | ◐ | ◐ | finance-led | field-led |
| Payroll diff / explainability | ? | ◐ | ? | ? | ? | ? | ? | ? | ◐ | ? |
| Public rupee price | quote | ✅ | ✅ | quote | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

#### Global references

| Capability | BambooHR | Rippling | Gusto | Deel | HiBob / Personio | Workday |
|---|---:|---:|---:|---:|---:|---:|
| Core HR / employee file | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| US/Europe payroll or benefits | ◐ | ✅ | ✅ | ◐ | ◐ | ✅ |
| India statutory payroll | ❌/partner | ? | ❌ | country-dependent | country-dependent | partner/enterprise |
| Workflow automation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| IT/application provisioning | ❌ | ✅ | ❌ | ◐ | ❌ | ◐ |
| SMB transparent pricing | ◐ | ? | ✅ | ◐ | ? | ❌ |

### Review signals (qualitative, not a star-rating study)

Public review pages are useful for hypotheses, not proof of prevalence. The themes below are representative signals to test in interviews and pilots; they are not ranked statistically. Review pages: [Keka G2](https://www.g2.com/products/keka/reviews), [Zoho People G2](https://www.g2.com/products/zoho-people/reviews), [greytHR G2](https://www.g2.com/products/greythr/reviews), [Darwinbox G2](https://www.g2.com/products/darwinbox/reviews), [HROne G2](https://www.g2.com/products/hrone/reviews), [Zimyo G2](https://www.g2.com/products/zimyo/reviews), [factoHR G2](https://www.g2.com/products/factohr/reviews), [Pocket HRMS Capterra](https://www.capterra.in/software/140975/pocket-hrms), [RazorpayX Capterra](https://www.capterra.in/software/181807/razorpayx), [BambooHR G2](https://www.g2.com/products/bamboohr/reviews), [Gusto G2](https://www.g2.com/products/gusto/reviews), [Rippling G2](https://www.g2.com/products/rippling/reviews), [Deel G2](https://www.g2.com/products/deel/reviews), [Personio G2](https://www.g2.com/products/personio/reviews).

| Competitor / segment | Commonly praised themes to verify | Common complaints or friction themes to verify |
|---|---|---|
| Keka | Broad HR coverage; modern interface; payroll/attendance in one place; reporting; employee self-service | Setup/configuration effort; pricing at small headcounts; occasional payroll/attendance edge cases; support response variability; too many modules for a tiny team |
| Zoho People/Payroll | Zoho ecosystem; value; custom fields/workflows; mobile access; integrations | Configuration complexity; fragmented People vs Payroll product boundaries; support/documentation learning curve; add-on economics; India edge cases need testing |
| greytHR | Mature payroll; leave/attendance depth; large install base; reports; employee portal | Older-feeling UX in some flows; add-on pricing; attendance/device troubleshooting; support wait; admin-heavy configuration |
| Darwinbox | Broad suite; mobile UX; workflows; analytics; enterprise scale | Implementation length; quote-based cost; configuration/governance burden; overkill for small HR teams; support/escalation complexity |
| HROne | Feature breadth; payroll/compliance; mobile; attendance options; modular plans | Plan boundaries; implementation effort; UI consistency; support responsiveness; price differences between public pages |
| Zimyo | Module breadth; mobile/ESS; workflow and engagement; dashboard; multi-location support | 50-seat minimum; configuration; add-on cost; reporting depth; support/implementation experience varies |
| factoHR | Payroll/attendance; face recognition; mobile; statutory breadth; dashboards | Setup/migration time; device/GPS edge cases; reporting customisation; support; cost of advanced modules |
| Pocket HRMS | Transparent entry pricing; payroll and compliance; mobile; chatbot/AI branding; integration breadth | 50-seat minimum; implementation fee; add-ons; complex formula/configuration; support and mobile edge cases |
| RazorpayX Payroll | Direct salary payment; simple payroll; compliance automation; familiar finance brand; bank workflow | Payroll rather than full HR depth; dependence on payment ecosystem; attendance/HR features often partner-led; support for exceptions; pricing/plan transitions |
| SalaryBox/PagarBook | Fast field attendance; GPS/selfie; low-cost mobile; simple payroll; frontline focus | Surveillance/battery/privacy concerns; fraud false positives; limited HR/talent depth; field connectivity; add-on pricing |
| Global references | Clean UX, employee self-service, integrations, automation, reporting | Currency/localisation; India compliance gaps; expensive minimums; implementation; support time zones |

**Deeper review evidence (example):** G2’s October 2026 Keka category summary is unusually specific: it reports 2,422 reviews, with ease of use (805 mentions), customer support (410), user interface (362), payroll (343) and intuitive use (343) as recurring positives; recurring negatives include limited customisation (156), poor support (145), slow loading (143), limited features (143) and missing features (119) [G2 Keka pros and cons](https://www.g2.com/products/keka/reviews?page=8&qs=pros-and-cons). A separate verified review describes clean attendance/leave/payslip self-service but flags mobile lag, slow support, limited customisation, basic reporting and add-on cost [G2 Keka review](https://www.g2.com/products/keka/reviews?departments=marketing&page=2). These are **review-site summaries**, not a representative market sample; Janus should test the same hypotheses in Indian design-partner interviews.

G2’s Zoho People review page similarly contains both ecosystem value and configuration friction: reviewers praise having employee data and HR tasks in one place and integration with other Zoho apps, while one review asks for better work-week policy controls and another reports confusion between employee and admin login contexts [Zoho People pros and cons](https://www.g2.com/products/zoho-people/reviews?page=5&qs=pros-and-cons). This supports a Janus design rule: powerful configuration must not make the daily employee and manager paths feel like an admin console.

## 6. Market gaps and opportunity

1. **Payroll is a trust problem, not just a calculation problem.** Most products advertise automation; fewer make the variance from last month explainable. Janus should show a line-by-line diff, source attendance/leave/variable inputs, statutory rule version and approval history.
2. **The frontline experience is fragmented.** Attendance tools are mobile/field-first, while payroll and HR records live elsewhere. This creates duplicate employee IDs and manual exports. Janus can make mobile/WhatsApp a controlled interface to the shared record, not a second database.
3. **WhatsApp support is usually an add-on or a notification channel.** Public plans from Pocket HRMS and SalaryBox show WhatsApp as a tier/add-on or a communication feature. A policy-grounded request/approval flow with identity checks would be more useful than broadcast messages.
4. **Pricing and implementation are difficult to compare.** Some vendors price per employee, others by 50-seat bundles or add-ons. The buyer needs a plain bill and a migration checklist.
5. **AI is shallow when it is not grounded.** “AI chatbot” labels are common; public evidence rarely demonstrates a permission-aware agent that cites the actual payslip, attendance record or policy and asks for approval before acting. Treat this as an opportunity, not a proven competitor gap.
6. **Cross-functional insight is missing.** HR products can show headcount; CRM can show revenue; projects can show utilisation. The owner still calculates “sales rep cost versus revenue” in Excel. Janus’s shared graph can make this a real, permissioned analysis.
7. **Compliance is stateful.** Labour Code transition, state rules, PT/LWF/minimum wages and tax-year changes make hard-coded rules risky. A rule ledger with effective dates and review ownership is a defensible product capability.
8. **Data export and ownership are buying concerns.** A practitioner discussion describes Indian companies hesitating to put salary data in third-party clouds and asking about database ownership [Indian startup discussion](https://www.reddit.com/r/indianstartups/comments/1ssh42m/no_indian_hrms_lets_customers_own_their_own/). Janus needs clear export, retention, tenant isolation and deletion controls.

## 7. Janus differentiation analysis

| Idea | Customer pain solved | Competitor coverage | Effort | Risk | Verdict |
|---|---|---|---|---|---|
| One shared company graph | Duplicate employee/customer/project records and weak owner insight | Ecosystem suites do parts; most SMB products remain module-led | High | Wrong joins or over-broad access can expose salary data | **Build foundation in MVP:** stable employee ID, tenant/workspace permissions and event model; add cross-workspace metrics after data quality is proven |
| WhatsApp-first employee experience | Field staff lack laptop/app habit; approvals get lost in chats | Some vendors offer WhatsApp notifications/approvals; few show full, grounded workflow | Medium-high | Identity spoofing, message cost, DPDP, language ambiguity | **Build narrow:** leave/status/payslip/policy Q&A with verification and fallback; do not put the entire HRMS in WhatsApp |
| Payroll pre-check agent | Payroll errors and fear of automation | Payroll vendors automate calculation; explainable agent evidence is not clearly demonstrated publicly | Medium | False positives, legal liability, over-trust | **MVP:** read-only anomalies + diff; human approval required for run/payment |
| Attendance anomaly agent | Buddy punching, location/device manipulation and manual correction | SalaryBox/PagarBook advertise fraud prevention; rules vary | Medium | Surveillance, false accusations, battery/GPS failures | **MVP:** flag and ask manager, never auto-discipline; visible reason and appeal |
| Policy Q&A grounded in handbook | Repetitive HR questions and inconsistent answers | Chatbots are common; grounded citations/permissions unclear | Medium | Stale policy or hallucination | **MVP:** retrieval with source card, effective date and “ask HR” escalation |
| 10-minute setup/import | Migration cost and Excel dependence | Vendors offer data wizards/import; implementation often takes weeks | High | Bad mapping creates payroll errors | **MVP:** guided import, dry-run validation, sample payslip and rollback; support common CSV/Tally formats |
| Owner HR view | Owner cannot see workforce health without opening HR | Dashboards exist; cross-workspace and cash context are weaker | Medium | Misleading metrics or privacy leakage | **MVP:** aggregate metrics with freshness/source labels and permission checks |
| Payroll explainability | Employees ask “why did my pay change?” | Payslips are common; a calculation narrative is less visible | Medium | Explanation can reveal restricted fields | **MVP:** employee-safe explanation; HR audit view has full calculation trace |
| Field-level privacy | Salary/medical/bank data is overshared in small businesses | RBAC is common; fine-grained AI controls are less visible | High | Policy bugs are severe | **MVP non-negotiable:** policy engine, deny-by-default retrieval and audit tests |
| Compliance rule ledger | State and effective-date changes | Vendors claim compliance updates, but rule provenance is opaque | High + ongoing | Outdated rule creates liability | **MVP:** effective-dated tables, source URL, owner, review date, “not configured” state; automate filing only after validation |
| Approvals as a reusable control plane | Sensitive AI actions need human review | Workflow/approval modules are common, but often module-specific | Medium | Approval fatigue | **MVP:** one approval inbox, risk/amount/data classification, expiry and audit |

## 8. Recommended scope

### MVP: switch one 10–200 employee customer

**Setup and core record**

- Company/branch/state/FY setup; departments, teams, managers and cost centres.
- CSV/XLSX import with column mapper, duplicate detection, validation report and rollback.
- Employee master: identity, employment, manager, salary structure, bank/PAN/UAN/ESI references, documents, emergency contact and consent/notice metadata.
- Shared IDs and events so CRM, Finance and Projects can reference the same employee.

**Attendance, leave and frontline self-service**

- Mobile/web punch with configurable location/device policy, offline queue and clear sync status.
- Shifts, rosters, holidays, late/absence, overtime and regularisation.
- Leave policies, balances, calendar, approvals and delegation.
- Employee/manager mobile experience; WhatsApp for verified leave/status/payslip/policy actions, with web fallback.

**Payroll confidence**

- Salary structures, variable pay, arrears, deductions, loans/advances and reimbursements.
- PF/ESI/PT/LWF/TDS rule configuration by state/category; old/new tax regime support; effective dates and source links.
- Payroll rehearsal, previous-period diff, exception queue, calculation trace, lock, dual approval, payslip and journal/export.
- Form 16/24Q workflow and statutory evidence checklist; direct filing/payment only through an approved, auditable integration.

**AI and controls**

- Policy Q&A grounded in approved documents with citations and “ask HR” escalation.
- Payroll pre-check agent and attendance anomaly agent are read-only until a human approves.
- One approval inbox for payroll, attendance corrections, salary changes, bulk communications and deletion.
- Field-level permissions, tenant/workspace isolation, audit log, retention/deletion/export controls.

**Useful reports**

- Headcount and joiners/exits; attendance/leave exceptions; payroll cost and delta; statutory checklist; pending approvals; employee-safe payslip explanation.

### V2: 6–12 months

- Recruitment pipeline, structured interviews, offer and onboarding automation.
- E-sign, background-check, DigiLocker and bank/PAN verification where consented.
- Expense/reimbursement and travel; asset issue/return and exit no-dues.
- Goals, check-ins and simple review cycles; announcements, pulse and policy acknowledgement.
- Form 16 delivery, bank file/API options, accounting/Tally journal integration, biometric connectors, scheduled reports.
- Compliance calendar agent, onboarding agent, payroll cost-to-revenue and CRM commission/targets link.
- Branch/multi-state policy packs and a documented rule update process.

### Later

- Learning catalogue, skill paths, advanced performance calibration, succession, rewards and engagement community.
- Workforce planning, project utilisation, sales commission engine, benefits marketplace and global payroll.
- Custom agent builder, autonomous filing/payment, predictive attrition and enterprise workforce simulations.

### Do not build initially

- A generic social feed, an LMS authoring suite, a full ATS marketplace, a global benefits/insurance marketplace, IT endpoint management, autonomous payroll payments, opaque attrition scoring, or a 100-node workflow canvas for ordinary HR requests.
- Do not build a second employee database inside HR. Reuse Business Management People & Access and the shared identity/permission model.
- Do not promise “compliance complete” for every state until a named rule owner and review date exist.

## 9. Pricing and packaging recommendation [Judgement]

Competitors publish roughly ₹45–₹350 per employee/month depending on modules, minimums and payroll depth; bundle prices range from small flat bases to 50-seat minimums. Janus should be simple enough to quote on a call and profitable enough to support compliance.

| Package | Suggested list price (annual billing) | Included |
|---|---:|---|
| **Core People** | ₹49/employee/month; 20-employee minimum | Employee master, onboarding, attendance, leave, mobile/web ESS, policy library, approvals, basic reports, export |
| **Payroll & Trust** | ₹99/employee/month; 20-employee minimum | Core plus payroll rehearsal/diff, PF/ESI/PT/LWF/TDS configuration, payslips, statutory evidence, payroll journal, payroll pre-check agent |
| **Operations** | ₹149/employee/month; 20-employee minimum | Payroll & Trust plus reimbursements, assets, recruitment/onboarding, goals/check-ins, WhatsApp verified actions, advanced reports |
| **Implementation** | ₹10,000–₹40,000 one-time, scoped | Import mapping, policy review, parallel payroll run, training and first-month support |

Rules: no surprise module add-ons for the MVP; charge for verified WhatsApp message volume or pass-through provider fees; quote multi-state, biometric and custom integration work; offer a 30-day parallel payroll run before a customer switches. The price is a hypothesis and should be tested against five design partners.

## 10. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Compliance liability | Wrong PF/ESI/PT/TDS/minimum wage or Labour Code treatment can create penalties and trust loss | Versioned rule tables, source/provenance, named reviewer, effective dates, state-specific setup, “not configured” state, CA/payroll-partner review and export-first filing |
| Payroll accuracy | A one-rupee error affects every employee and can stop a sale | Parallel run, deterministic calculation tests, prior-month diff, immutable payroll lock, two-person approval, calculation trace and rollback/export |
| Data/security | Salary, bank, identity and medical data are sensitive; DPDP obligations are phased | Tenant isolation, field-level permissions, encryption, least-privilege AI retrieval, retention/deletion, audit log, incident playbook and India-region option |
| AI overreach | Hallucinated policy or autonomous pay action causes harm | Retrieval-only approved sources, citations, confidence/unknown state, action preview, human approval, no model training on customer data by default |
| Incumbent switching cost | Historic data, devices and payroll habits are sticky | Excel/Tally/import wizard, API/export, device adapters, parallel payroll and assisted migration |
| Support load | SMB HR teams need a fast answer at payroll cutoff | In-product evidence and diagnostics, payroll calendar, office-hour support during pilot, clear escalation and status page |
| WhatsApp cost and identity | Per-message fees, account takeover and language ambiguity | Use WhatsApp for high-value requests/notifications, show estimated cost, verify employee identity, rate-limit, provide app/web fallback |
| Surveillance backlash | GPS/face attendance can harm trust and create legal/privacy issues | Purpose limitation, consent/notice, configurable retention, no automatic discipline, appeal flow and non-biometric alternative |
| Scope creep | HRMS can become an enterprise suite before the core works | One wedge, paid design partners, usage evidence gates for V2, no custom agent builder in MVP |

## 11. Customer interview guide

### Open questions to resolve before committing payroll scope

- Which states, establishment types and worker categories dominate the first ten customers?
- Is payroll run in-house, by a CA, or split between both? What evidence is exchanged?
- How many employees are field/blue-collar, shared-device or offline for part of the day?
- Which incumbent data can be exported cleanly, and what cannot?
- Do customers prefer a ₹/employee price, a base plus seat price, or a payroll-run fee?
- Which statutory filings are actually done in the product versus a CA portal?
- What is the tolerance for WhatsApp message cost and what actions are too sensitive for WhatsApp?
- What must the owner see daily versus monthly?
- What payroll mistake or attendance dispute happened recently, and how was it resolved?
- Who must approve a salary change, payroll run, employee deletion or bulk message?

### Ten interviews questions

1. “Walk me through the last payroll run from attendance close to salary payment. Where did you copy data, and where did you wait?”
2. “Show me the spreadsheet, WhatsApp chat or portal you use for attendance corrections and leave. What is the most common exception?”
3. “When an employee asks ‘why did my salary change?’, what do you open to answer?”
4. “Which state, branch and worker-category rules make your payroll difficult?”
5. “What would make you trust an import from your current HRMS/Tally, and what would make you reject it?”
6. “Which employee actions should work on WhatsApp, which require an app, and which must remain web-only?”
7. “What should a manager see, and which fields must never be visible to a manager or AI?”
8. “Tell me about the last attendance or payroll dispute. What evidence was needed?”
9. “Would you run one parallel payroll with Janus before switching? Who must sign it off?”
10. “At 10, 50, 100 and 200 employees, what would you expect to pay, and which add-on would make you feel trapped?”

## 12. Sources and access notes

### Government and compliance

- [PIB/MoLE: four Labour Codes effective 21 Nov 2025](https://labour.gov.in/sites/default/files/pib2192463.pdf)
- [MoLE: Labour Code transition FAQ, January 2026](https://www.labour.gov.in/static/uploads/2026/01/de4758d5bfeffc456d7de97a801891b0.pdf)
- [MoLE: Additional Labour Code FAQs, March 2026](https://www.labour.gov.in/static/uploads/2026/03/a4ccf4c6d97c4f1f36a6d83f8c64213d.pdf)
- [MoLE: rules/States and UTs status release](https://www.labour.gov.in/static/uploads/2025/09/7d8bd630ae1a7a373ef3debd7c6191be.pdf)
- [MoLE Labour Codes page](https://www.labour.gov.in/new-labour-codes)
- [EPFO employer registration and compliance](https://www.epfindia.gov.in/site_en/For_Employers.php/Disablitity.php)
- [EPFO contribution rates](https://www.epfindia.gov.in/site_docs/PDFs/MiscPDFs/ContributionRate.pdf)
- [ESIC coverage and contribution FAQ](https://www.esic.gov.in/attachments/files/faq.pdf)
- [ESIC Annual Report contribution rates](https://www.labour.gov.in/static/uploads/2025/06/00d73e60340019d47d8a02c352166e14.pdf)
- [MoLE Code on Wages FAQ](https://www.labour.gov.in/static/uploads/2026/01/75252c07c1fe3a2f5571ff1464e2375e.pdf)
- [ESIC official portal](https://www.esic.gov.in/)
- [Income Tax Department: salary forms and Form 16](https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1?fromCampaign=true)
- [Income Tax Department: Form 24Q](https://www.incometax.gov.in/iec/foportal/node/309)
- [Income Tax Department: TDS transition FAQ](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/%20tds-compliance-faq)
- [Payment of Gratuity Act text](https://labour.gov.in/sites/default/files/the_payment_of_gratuity_act_1972_0_0.pdf)
- [MoLE gratuity coverage material](https://www.labour.gov.in/static/uploads/2025/06/b0450aca5d58a12b10fdde29c1693dfd.pdf)
- [Payment of Bonus Rules](https://labour.gov.in/acts/payment-bonus-rules-1975)
- [OSH Code Gazette](https://www.labour.gov.in/sites/default/files/osh_gazette_0.pdf)
- [Model Shops and Establishments bill](https://labour.gov.in/sites/default/files/model_bill_englsih_.pdf)
- [DPDP Rules 2025 Gazette](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)
- [MeitY DPDP Rules notification](https://www.meity.gov.in/dpdp-rules-notified-2025)

### Vendor pricing and product pages

- [greytHR pricing](https://www.greythr.com/pricing)
- [Zoho Payroll pricing comparison](https://www.zoho.com/in/payroll/pricing-comparison/)
- [Keka pricing](https://www.keka.com/pricing)
- [HROne pricing](https://hrone.tech/pricing/)
- [HROne legacy pricing page](https://hrone.cloud/pricing/)
- [Zimyo pricing](https://www.zimyo.com/pricing/)
- [factoHR plans](https://factohr.com/plans/)
- [factoHR India HR software](https://factohr.com/hr-software/india/)
- [Qandle](https://www.qandle.com/)
- [sumHR](https://www.sumhr.com/)
- [Spine HRMS](https://www.spinehr.com/)
- [Pocket HRMS pricing](https://www.pockethrms.com/pricing/)
- [RazorpayX Payroll pricing](https://razorpay.com/payroll/pricing/)
- [SalaryBox pricing](https://salarybox.in/pricing/)
- [PagarBook pricing](https://pagarbook.com/pricing/)
- [BambooHR pricing](https://www.bamboohr.com/pricing/)
- [Gusto pricing](https://gusto.com/product/pricing)
- [Personio pricing](https://www.personio.com/pricing/)

### Reviews and practitioner signals

- [Keka reviews, G2](https://www.g2.com/products/keka/reviews)
- [Zoho People reviews, G2](https://www.g2.com/products/zoho-people/reviews)
- [greytHR reviews, G2](https://www.g2.com/products/greythr/reviews)
- [Darwinbox reviews, G2](https://www.g2.com/products/darwinbox/reviews)
- [HROne reviews, G2](https://www.g2.com/products/hrone/reviews)
- [Zimyo reviews, G2](https://www.g2.com/products/zimyo/reviews)
- [factoHR reviews, G2](https://www.g2.com/products/factohr/reviews)
- [Pocket HRMS reviews, Capterra](https://www.capterra.in/software/140975/pocket-hrms)
- [RazorpayX reviews, Capterra](https://www.capterra.in/software/181807/razorpayx)
- [BambooHR reviews, G2](https://www.g2.com/products/bamboohr/reviews)
- [Gusto reviews, G2](https://www.g2.com/products/gusto/reviews)
- [Rippling reviews, G2](https://www.g2.com/products/rippling/reviews)
- [Deel reviews, G2](https://www.g2.com/products/deel/reviews)
- [Personio reviews, G2](https://www.g2.com/products/personio/reviews)
- [Indian SMB attendance discussion](https://www.reddit.com/r/IndiaBusiness/comments/1wjonyh/staff_attendance_suggestions/)
- [Indian startup discussion on HRMS data ownership](https://www.reddit.com/r/indianstartups/comments/1ssh42m/no_indian_hrms_lets_customers_own_their_own/)
- [Keka vs factoHR discussion](https://www.reddit.com/r/Payroll/comments/1vyw1eu/keka_vs_factohr/)

### Research limitations

- Competitor pricing can change by billing term, headcount, geography, GST and negotiated services; re-check before a sales comparison.
- Review sites over-represent motivated users and do not establish incidence. Themes above are hypotheses for interviews.
- State rules, statutory ceilings and tax interpretations require a qualified Indian payroll/CA review before production filing. This report is product research, not legal or tax advice.
