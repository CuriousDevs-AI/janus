# Janus — by CuriousDevs

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
