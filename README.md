# Janus — by CuriousDevs

Janus is an AI-native operations workspace for Indian small and mid-sized businesses. One login runs several companies. Each company has its own people, customers, records and settings. The Owner sees all of them from a Portfolio, and everyone else sees only their own company, role and workspace.

## The idea in one paragraph

A business spends its day in WhatsApp, phone calls, email, spreadsheets and HR tools. Janus brings those into one place. Enquiries arrive from every channel, become leads, move through a pipeline, and turn into deals and orders. Support tickets, approvals, leave, payroll and documents sit beside them. Janus AI answers from the company's own knowledge, drafts replies, and asks a person before any consequential action: money, discounts, refunds, bulk messages or deletions.

## Who uses it

| Role | What they see |
| --- | --- |
| Owner | Everything: Portfolio across companies, Business Management, CRM, HR and every setting |
| Sales manager | The whole sales team's leads and deals, approvals, and their own team's leave |
| Sales executive / account executive | Only their own leads, deals and customers |
| Support lead / agent | Tickets and chats assigned to them, plus unassigned ones |
| HR manager | All of HR & People, no CRM and no business finance |
| Finance executive | Payroll, reimbursements and compliance; no leave or employee records |
| Reporting manager (employee with a team) | Own HR records plus approvals for their team |
| Employee | Own leave, pay, documents and requests only |

Visibility is enforced in the backend for each request, not only hidden in the UI.

## Modules

**1. Portfolio (Owner).** Every company at a glance: people, open pipeline, win rate, monthly payroll, what needs attention, and what Janus remembers. Companies are added through a wizard (details, starting point, workspaces, team, review) and switched from the company menu.

**2. CRM & Sales.**
- Lead sources: website forms, webhooks, a REST API with scoped keys, CSV import with header mapping, WhatsApp Cloud API, and call-provider presets.
- Leads and customers, with search, stages, owners and an add-lead form for people with the right permission.
- Deals: created from a lead, moved through stages, with value, expected close date and history.
- Tickets: opened from chats or by hand, assigned, escalated, replied to and resolved. Resolving a ticket ends its chat, so the assistant stops answering it.
- Chats: a shared inbox with WhatsApp follow-ups using approved templates.
- Analytics and an overview dashboard with computed insights.

**3. HR & People.**
- Employee directory shared with Business Management. Employees can be added with branch, manager, pay and onboarding checklist.
- Leave: apply, balances, calendar, holidays, and a two-step approval chain (reporting manager, then HR).
- Attendance, regularization, expenses and reimbursements.
- Payroll: monthly run with submit, exception handling (blocking items must be resolved or deferred with a reason), dual approval (a different person approves), lock, and publish. Payslips show provident fund, ESI, professional tax and new-regime TDS calculated from the current India rules.
- Documents, document center, policies, onboarding, recruitment pipeline (candidates to offers to employee records), performance reviews, and engage (announcements, polls, events, kudos).

**4. Business Management (Owner and admins).**
- Business overview: leads, open deals, pipeline, follow-up SLA, owner workload, and a data-coverage card that says which workspaces are connected.
- People & Access: members, roles and permissions, workspace access, departments and invitations.
- Janus Intelligence: business AI chat, a knowledge base (files, pages, websites, connected apps and approved Q&As), memory, insights, risk alerts and planning.
- Agents and workflows: AI agents with approval modes, workflows with a When, If, Then structure, dry runs and an approval queue. Activation stays blocked until a dry run passes.
- Business reports, billing and company settings.

**5. AI, with guardrails.** Janus answers only from sources a person can use. It shows which sources an answer came from, and it lists questions it could not answer. It suggests facts from chats, but nothing is added until a person approves. Sensitive actions always need approval.

## Current status (honest)

| Area | Status |
| --- | --- |
| Backend API (auth, org, leads, deals, WhatsApp, ingestion, worker, AI settings, business) | Built and tested in `backend/` |
| Frontend across all modules above | Built. Most screens run on a browser preview backend with demo data, switched on with `NEXT_PUBLIC_JANUS_DEMO_MODE=true` |
| Tickets, leave, payroll, HR records and approvals as real API | Not yet on the backend. They work in the preview only |
| Multi-company isolation | Built for the preview (per-company storage). Real tenant separation lives in the backend |
| Statutory payroll | PF, ESI, professional tax and new-regime TDS are calculated. Special cases (old regime, other states, exemptions) need an accountant to confirm |
| Live AI answers and agent execution | Not connected. The screens show what would happen and mark unavailable parts |
| Real-time notifications, e-signature, banking, GST filing | Not started |

Known gaps tracked for later: a single People & Access screen (Portfolio, Business and HR still have separate entry points for people), a full click-through of every dialog on every role, and a final check against the product scope document.

## Try the preview

```sh
npm install
cp .env.example .env.local
# set NEXT_PUBLIC_JANUS_DEMO_MODE=true in .env.local for the preview
npm run dev
```

Preview test sign-ins (preview only; never used in a live build):

| Role | Email | Password |
| --- | --- | --- |
| Owner | pankaj@acmetraders.in | Owner@123 |
| Sales manager | arjun@acmetraders.in | Manager@123 |
| Sales executive | meera@acmetraders.in | Sales@123 |
| Support lead | karan@acmetraders.in | Support@123 |
| HR manager | shaista@acmetraders.in | HR@12345 |
| Finance executive | aman@acmetraders.in | Finance@123 |
| Reporting manager | neha@acmetraders.in | Lead@12345 |
| Employee | vikas@acmetraders.in | Employee@123 |

The login page's "Reset the test data" button restores the preview to its starting state.

## Where to read more

- `docs/business-management-current.md`: the Business Management screens and their current behaviour.
- `docs/audit/`: the audits that shaped the current build (CRM & Sales, Business Management, multi-company).
- `backend/README.md`: the API, database and worker.
- `deploy/README.md`: the single-VPS pilot deployment.

---

## Working slice (backend pilot)

Janus connects lead capture, CRM, communication and business operations for Indian SMBs. The current working slice is **sign up → verify → capture a lead → send a WhatsApp follow-up → receive the reply in the inbox → move the deal through the pipeline**.

## Run locally

1. Start the API, Postgres and worker using [backend/README.md](backend/README.md). Configure the backend encryption key and database/JWT secrets first.
2. In this directory:

   ```sh
   npm install
   cp .env.example .env.local
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000), create a workspace, and verify your email. The development email sender prints the verification link in the API console. Sign in and open Lead Sources.
4. Create a website, webhook, REST API or CSV connection. The worker must be running for accepted events to become contacts and leads. For CSV, map the headers before uploading, then inspect row results and open the saved lead.

Use the same browser origin consistently: `localhost` and `127.0.0.1` are different origins. If you change the hostname or port, update `JANUS_APP_ORIGIN` in the frontend and `JANUS_FRONTEND_URL` in the backend. Set `JANUS_API_URL` to the API address reachable from the Next.js server. Set `JANUS_PUBLIC_API_URL` in both applications to the address reachable by external forms and providers.

## Connected screens

- Signup, login, logout, email verification, password recovery/reset, and invitation acceptance use the backend.
- Lead Sources creates and edits real connections, displays the website embed snippet, rotates webhook secrets, creates/revokes scoped API keys, uploads CSV files, and displays real ingestion results.
- Phone Calls is a shortcut to the same webhook setup, filtered to call-provider presets. There is no second call-integration endpoint.
- WhatsApp setup checks real Meta credentials, then requires callback verification. Lead details open a real conversation; the inbox sends approved templates or text replies and shows delivery results.
- Deals are created from saved leads. The board and detail page save stage/value/date changes, keep history and share the lead’s ownership.
- Leads and individual lead/customer pages display database records. Lists use 50-row pages; search filters the currently loaded lead page.
- The sidebar shows the authenticated user and workspace. Unverified users can sign in but cannot configure sources.

There are six source discovery cards and two coming-soon cards (Meta Lead Ads and IndiaMART). WhatsApp uses direct Cloud API credentials for the first pilot; embedded OAuth signup is not implemented yet. The website embed captures enquiries; chat messaging is not implemented yet.

Manual lead entry, organisation/profile settings UI, and the other CRM/ERP modules are not wired yet. Their prototype files remain in the repository, but the authenticated shell shows an unavailable-screen message instead of rendering mock customer data or canned AI output. AI provider settings already exist in the backend; the frontend settings screen is still pending.

## WhatsApp pilot setup

Follow the [WhatsApp setup instructions](backend/README.md#whatsapp-follow-up-and-inbox) for the Meta app, system user token, approved text template, Graph API version and public HTTPS callback. Secrets stay server-side and encrypted at rest. Open a saved lead, choose **WhatsApp follow-up**, review an approved template and confirm the customer's opt-in before sending. Customer replies reopen the text reply window.

The worker sends queued messages. The inbox refreshes every five seconds and distinguishes accepted, sent, delivered, read, failed and uncertain results. An uncertain send is never retried automatically. This first version sends only after a user presses Send; it does not automatically contact every imported lead.

## Deal pipeline

Apply backend migration `0009`, then open a saved lead and choose **Create deal**. Each lead has one deal in this pilot. The deal uses the same customer and owner; stage changes update the lead too. Drag a card between columns, or use **Edit / move stage**. Lost deals require a reason and can be reopened. Deal details show saved history and link back to the lead and WhatsApp conversation.

Values are stored as exact INR decimals. The board shows up to 100 deals per page; search, counts and value totals apply to that page. Updates reject stale versions instead of overwriting a teammate’s changes: refresh before editing again. The Approval column tracks a pending decision; it does not approve discounts, refunds or payments. Quotes, invoices, forecasts and automatic stage changes are not implemented.

## Pilot deployment

Use [deploy/README.md](deploy/README.md) for the single-VPS production Compose setup: Next.js, API, worker, Postgres and HTTPS proxy. It includes a private configuration generator, preflight checks, migrations, backup/recovery steps and the first real WhatsApp enquiry checklist. A VPS, controlled DNS domains, SMTP and Meta credentials are still required; these files do not deploy to a server by themselves.

## Sessions and deployment

The browser calls the same-origin `/api/backend/...` bridge. Next.js keeps access and refresh tokens in HttpOnly, SameSite=Lax cookies; token responses never reach browser JavaScript or local storage. Mutations check the exact configured origin. Refresh rotates the cookie, with concurrent browser refreshes serialized where Web Locks are available. Authorization and membership checks remain in FastAPI on every request.

Production requires HTTPS for the secure cookies, an explicit `JANUS_APP_ORIGIN`, and the backend production SMTP/HTTPS configuration. Keep all frontend API-origin variables server-only. The bridge forwards only selected headers and limits uploads to 5 MB. Public ingestion goes directly to FastAPI, using the backend's source-specific authentication and origin checks.

FastAPI currently records the Next.js server's IP for bridged requests; login lockout is therefore scoped to email plus that observed IP. It does not trust caller-supplied forwarding headers. Configure a trusted proxy chain deliberately before relying on device IP attribution in deployment.

## Checks

```sh
npx tsc --noEmit
npm run lint
npm run build
```

One optional integration check covers cookie sessions, CSRF rejection, refresh, CSV idempotency, worker results, saved leads/contacts, deal creation/stage/history and logout:

```sh
# Use a disposable LOCAL database/workspace and a verified test account.
# This creates a CSV source and sample lead in that workspace.
JANUS_WEB_ORIGIN=http://localhost:3000 \
JANUS_TEST_EMAIL=test@example.com \
JANUS_TEST_PASSWORD='<test-account-password>' \
node scripts/check-web-api.mjs
```

The API and worker must be running. Existing prototype fixture checks remain in `scripts/check-lead-sources.mjs`; they do not validate the live connection state.

## Structure

- `app/api/backend/`: allowlisted server-side bridge and session cookies.
- `lib/api/`: typed backend client, refresh handling and loading hooks.
- `components/auth/`: session boundary and email-token actions.
- `components/lead-sources/`: real source configuration and ingestion tools.
- `lib/mock-data/`, `lib/services/`, `lib/stores/app-store.ts`: retained prototype data/behaviour, excluded from the connected workflow.
- `backend/`: FastAPI, Postgres migrations, transactional inbox and worker.

Frontend: Next.js 16, TypeScript, Tailwind v4, Radix UI and Zustand. Backend: Python 3.12, FastAPI/Pydantic v2, SQLAlchemy 2, Alembic and Postgres 16.
