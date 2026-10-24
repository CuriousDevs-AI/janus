# Janus Multi-Company Prototype — End-to-End UI/UX Audit

**Build audited:** `step-6-portfolio-home` (includes step 7), merged onto `main`, run with `NEXT_PUBLIC_JANUS_DEMO_MODE=true` and no backend.
**Method:** scripted browser walk (Playwright, 1440px and 390px) as a real owner running three companies, plus the six other test roles. About 90 routes visited, every company, the Add-company wizard, notification deep links, company switching, restricted views, and a brand-new empty company. Console errors, redirects and cross-company data were checked on every route.
**Persona:** Pankaj, an Indian SMB owner running Acme Traders (distribution), Nimbus Digital Studio (agency) and GreenLeaf Organics (retail, setup unfinished). Their jobs: see all companies at a glance, jump into one, run sales, run people, and set up a new company.

## 1. Verdict

The shape is right and the best parts are genuinely good: Portfolio home, per-company isolation of CRM and HR data, role-based sign-in, deep links from "Needs your attention" that switch company and land on the right screen, and the Add-company wizard. A real owner can understand the product in a minute.

It is **not yet a believable end-to-end prototype** because of five things, in this order:

1. **Janus Intelligence / AI Assistant crashes for every company** (P0).
2. **Business Management is unreachable from the workspace menu**, although the wizard promises it is "always on" and you land in it after creating a company (P0).
3. **Acme's data leaks into the other companies** in places (owner email, address, an AI insight, automations, agents) (P1).
4. **A brand-new company looks pre-populated and "connected"** when it is empty (P1).
5. **Several numbers and dates disagree between screens** (P1/P2).

## 2. What works (keep)

- Portfolio Overview, Analytics, Finance, Companies and Notifications are coherent and cross-check with each company's own screens (pipeline ₹44.4L = ₹26.9L + ₹17.5L, payroll ₹15.9L).
- Honest unavailable states: Portfolio Finance says "Not connected" instead of inventing ledgers, and Janus does not guess.
- Attention items are specific and actionable. Opening one switches company and lands on the exact screen (GreenLeaf setup, Acme leave approvals, Acme stalled leads, Acme and Nimbus deals).
- Company isolation for CRM and HR records held on every CRM/HR route checked (see P1-1 for the exceptions).
- Role gating is solid. Sales reps, support, HR, finance and employees land in sensible homes and cannot open Portfolio, Business or CRM by URL. Restricted HR views show a clear "This view is restricted" card.
- Add-company wizard: five clear steps, validation, sample or empty start, review, and it lands in the new company.
- Empty states in a new company are mostly helpful ("No leads yet. Connect a source…").
- No document-level horizontal overflow at 390px on any audited route. No runtime errors apart from the `/ai` crash and the 401s below.

## 3. Findings

### P0 — blocks the demo

**P0-1. `/ai` crashes for every company and every role that can open it.**
`/ai`, `/ai?workspace=business`, `/ai?workspace=crm-sales` and the HR AI Chat link all render "This page couldn't load" (`Cannot read properties of undefined (reading 'subject')`).
Cause: `lib/services/business-ai.ts:97,265` builds a canned answer at module load using `urgentTickets[0]` and `urgentTickets[1]`. The unified Acme data has fewer than two urgent tickets, and Nimbus and GreenLeaf have none, so importing the module throws.
Impact: Janus Intelligence, AI Assistant and "Ask Janus →" on Business Overview are dead. This is the product's headline feature.
Fix direction: build those answers lazily and tolerate missing tickets. Also have the page answer from the active company's records, not Acme's.

**P0-2. Business Management cannot be reached from the workspace menu.**
The menu in a company lists only "Created workspaces" (CRM & Sales, HR & People). `components/layout/sidebar.tsx` (`accessibleWorkspaces`, around lines 107–132) never includes `business` in demo/owner view. Yet the wizard says "Business Management is always on for the Owner", Companies → Open lands in it, and you land in it after creating a company. After that you can never get back except by typing the URL or using "Open" from the Portfolio.
Impact: People & Access, Workspaces, Business Reports, Billing, Settings and Business Overview are effectively orphaned. The owner journey "company → business overview → team → settings" has no door.
Fix direction: list Business Management first in the owner's workspace menu, and make it the default landing for a company opened from the Portfolio.

### P1 — breaks trust in the demo

**P1-1. Acme data shows up in other companies.**
- Business Settings → Company Profile (`components/settings/company-profile-section.tsx:25–32`) is hardcoded: `hello@acmetraders.in`, Gurugram, Udyog Vihar address, "Head office… 18 people" for every company, including Nimbus (Bengaluru), GreenLeaf (Pune) and a new company.
- People & Access lists the owner as `pankaj@acmetraders.in` in Nimbus and GreenLeaf.
- Nimbus CRM Overview "AI operating insights": "Follow up with Riya Kapoor, ₹4.8L" (an Acme employee and an Acme deal).
- Nimbus and GreenLeaf Automations show Acme's 8 automations and 64 runs, and Agents show the same 2 agents, while Tickets and Knowledge are empty.
- Business Overview "Needs your attention" and Reports use fixed figures (₹3.1L overdue invoices, GSTR-3B on 20 Nov, ₹42.8L revenue vs ₹50L target) for every company.

**P1-2. Business Overview invents finance while the Portfolio says Finance is "Not connected".**
`components/settings/workspace-section.tsx:356` shows "4 invoices overdue by 30+ days ₹3.1L", "GSTR-3B deadline" and a revenue chart. Two screens contradict each other on whether Finance data exists.

**P1-3. A brand-new company claims to be connected.**
After the wizard with "Start empty":
- CRM Overview shows **Connected sources: 3** and Lead Sources shows **Enabled sources (3)** with zero activity.
- HR My Home shows "4 policies to acknowledge" and "Welcome to Sharma on Janus… 3 days ago" (a company-short-name truncation, and a post dated before the company existed).
- Business Overview shows "₹0L".
Nothing tells the owner what to do first. There is no checklist for a company with `setupDone` false except the Portfolio alert for GreenLeaf.

**P1-4. Lead Sources tells the owner to ask the owner.**
`app/(app)/lead-sources/page.tsx:53` shows "Ask an owner or admin to configure lead sources." while signed in as the Owner.

**P1-5. No way to add a lead or customer by hand.**
Leads, Customers and Deals have no "Add lead / Add customer" action (only "Create deal" from an existing lead). A new company therefore has no path to its first record in a no-backend prototype. The README already lists manual entry as not wired. For a prototype built on demo data it is the biggest CRM gap.

**P1-6. The Business "Workspaces" page lists HR & People twice** (one card from the catalogue, one from `components/settings/workspace-section.tsx:461` with the fallback text "Ready for manager and access configuration."). It reports "Active workspaces: 3" for a company with two.

### P2 — confusing or inconsistent

**P2-1. Two different "today"s.** The CRM uses a fixed `DEMO_TODAY = 2026-10-24` (`lib/demo-universe.ts:11`). HR uses the live clock ("Sunday, 25 October", "My day 25 Oct · weekly off") while its attendance and leave seeds are dated 23 Oct. In a live demo the days drift apart, and on a weekend HR shows "weekly off" with 0 on leave.

**P2-2. Counts that should match don't.** Acme HR Overview "Pending approvals 2" vs Pending Approvals page "Waiting for you 3" vs Leave Management "Waiting for you 1" vs Portfolio "2 leave requests waiting". Each may be correct for its scope, but none says what its scope is. Usage & Cost shows "Total this month ₹1.9K" next to "₹9.9K total, last 7 days".

**P2-3. Two company switchers in the same sidebar.** The top block (company name plus workspace chevron) and the bottom block ("Switch company") look alike but do different things. The top one swaps workspace, the bottom one swaps company. Users will click the wrong one.

**P2-4. Mobile top bar hides the page title and the company.** The demo "View as" dropdown takes the width, so titles truncate ("Overvi…", "CRM Ov…") and the active company is only visible after opening the drawer. For multi-company owners that is the one thing the header must show.

**P2-5. "View as" is a demo tool that looks like product.** Real login already picks the role, and the dropdown sits beside it in every header. Hide it behind a clearly labelled preview toggle, or move it to the account menu.

**P2-6. Inconsistent handling of "no access".** CRM, Portfolio and Business silently redirect to your home. HR shows a "restricted" card. A person who followed a link gets no explanation in the first case. GreenLeaf's CRM routes also redirect silently to the Portfolio, while its Knowledge, Automations, Analytics, Agents, Memory, Approvals, Audit and Usage pages (CRM sidebar items) still open.

**P2-7. Portfolio Janus Intelligence answers are generic.** "Which company has the heaviest payroll?" lists every company instead of answering "Acme, ₹6.9L". "How many leads did Nimbus get this month?" is refused although Nimbus has 12 leads on record. The command palette (⌘K) in Portfolio finds only pages, so "Nimbus" returns "No pages match".

**P2-8. Add-company wizard details.** The "at least 2 characters" error shows before the user has typed. Resuming "Finish setup" for GreenLeaf opens at step 3 with Back disabled, so the company name, industry and starting point cannot be reviewed. The new company's owner is named "Pankaj Neema" with a generated `@sharmatextiles.in` email, and there is no field to say who the owner is.

**P2-9. Demo labelling is still uneven.** "Demo data" badges remain on Company Profile and AI chat, while most other screens show none. The README says labels were removed on purpose, so decide once whether demo mode is labelled.

### P3 — polish

- On a brand-new company, `₹0L` should read `₹0`.
- Lead detail copy: "This lead has a newer activity timestamp. Open the unified inbox…" reads like a system message. Say "Last reply 24 Oct, 10:10 am. Open the chat."
- Mobile Portfolio: the "Recent leads" card is wider than its neighbours (362px vs 356px).
- The first lead-source row on Acme and Nimbus shows "website" in lowercase beneath "Website Form & Chat Widget".
- Companies cards say "Set up" for finished companies, which reads like an action. "Ready" or "Active" would read better.

### Backend noise (expected without an API, but visible in the console)
`/api/backend/me`, `/auth/refresh`, `/business/reports/summary`, `/business/agents`, `/business/automations`, `/whatsapp/conversations` return 401 in demo mode. They do not break screens, but they add a flash of loading states and console errors. Route them to the demo handler in `lib/demo-backend` so the prototype is clean end to end.

## 4. Journeys tested

| Journey | Result |
| --- | --- |
| Sign in as Owner and land on Portfolio | Pass |
| Read the Portfolio and open an attention item in another company | Pass |
| Jump into a company from Portfolio → Companies → Open | Pass, but it lands in Business Management with no way back from the menu (P0-2) |
| Switch company from the sidebar and return to Portfolio, browser Back | Pass |
| Run sales in Acme: leads, deal board, customers, tickets, approvals | Pass |
| Ask Janus (business, CRM, HR) | **Fail**: crash (P0-1) |
| Run people in Acme: approvals, leave, attendance, expenses, recruitment, onboarding, policy Q&A | Pass, with the date and count issues (P2-1, P2-2) |
| Same screens in Nimbus | Pass for CRM and HR, with Acme leakage (P1-1) |
| Finish GreenLeaf setup | Opens, resumes at step 3 (P2-8) |
| Add a fourth company with "Start empty" | Pass to creation, then P1-3 and P1-5 |
| Sales rep, support, HR, finance, employee, manager sign-in | Pass |
| Phone width (390px) | Pass on overflow, P2-4 on header |

## 5. Suggested fix order

1. P0-1 `/ai` crash, then make it answer from the active company.
2. P0-2 add Business Management to the owner's workspace menu and land there by default.
3. P1-1, P1-2 make Business Settings, People & Access, Business Overview attention items, Automations and Agents read from the active company's spec (and say "No finance connected" instead of inventing invoices).
4. P1-3, P1-4, P1-6 true "connected" counts, a first-steps checklist for a new company, the Lead Sources message, and the duplicate HR card.
5. P1-5 a simple "Add lead" and "Add customer" form backed by the demo CRM store.
6. P2 items in the order above. P2-1 (one fixed "today" everywhere) and P2-4 (company name in the mobile header) have the best return.

Once the P0 and P1 items are done, the Portfolio → company → Business / CRM / HR flow can be shown to a real owner without caveats.
