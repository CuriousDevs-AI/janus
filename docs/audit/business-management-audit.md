# Janus Business Management — End-to-End UI/UX and Product Audit

**Audit date:** 2026-10-22  
**Scope:** Business Management, Janus Intelligence, People & Access, Workspaces, Business Reports, AI Agents, Workflows, Business Settings, workspace switching, and the connected CRM surfaces.  
**Method:** source review, API route review, fresh authenticated browser session, desktop route walk, 390px viewport route walk, console log check, TypeScript, lint, build, and diff validation.  
**Evidence labels:** **Verified** means observed in the running app or directly in code. **Inferred** means a product or security conclusion drawn from the verified behavior and should be confirmed against backend policy before release.

## 1. Executive summary

Janus has a coherent workspace-aware shell and a useful owner-level information architecture, but it is not ready for an SMB owner to operate without help: **3.5/10**.  
The largest problems are fake/demo business and AI output in the development path, incomplete persistence for settings and access management, placeholder department workspaces, missing workflow execution endpoints, and workspace authorization gaps.  
The core navigation, explicit unavailable states, CRM preservation, approval language, and the single business-to-workspace context are good foundations and should stay.  
The first release should make one verified business loop real: business setup → member/workspace access → connected CRM data → owner report/AI answer → approved action → audited result.  
Desktop and 390px smoke checks completed with no runtime console errors or route-level application errors. The mobile DOM had no document-level horizontal overflow on the audited routes, but dense tables and touch behavior still need manual device testing.  
Production readiness is blocked until all demo paths are clearly gated or removed and authorization is enforced at the service layer.

**Top five problems:**

1. Business Intelligence and Knowledge use sample records and hard-coded responses instead of connected records.
2. People, company profile, regional settings, reports, and several controls only change local UI state.
3. Department workspaces are navigation shells with “Awaiting data” cards rather than working modules.
4. Workflow/agent execution, publishing, versions, and runs call endpoints that do not exist in the backend.
5. Agent, automation, and intelligence reads do not consistently enforce workspace membership and permissions.

**Top three strengths:**

1. Workspace-aware navigation keeps CRM and Business Management separate and preserves existing CRM routes.
2. The UI labels connected, demo, unavailable, approval, and empty states instead of silently pretending everything is live.
3. The Business Management IA maps to owner jobs: health, access, workspaces, reports, AI, automation, and settings.

## 2. Journey walkthroughs

### 2.1 Owner: first login → health → approval → Janus → report → plan

**Verified in the fresh authenticated session; desktop and 390px route checks.**

1. **Sign in** — ✅ Login succeeds and redirects to `/setup`. One form submission; under one minute.
2. **Understand setup** — ⚠️ `/setup` shows four steps (business details, workspaces, People & access, Connect data), but only business details have an actual save control. Workspaces only links away; People and data have no completion action. `Continue later` lets the Owner bypass the setup. Evidence: `app/(app)/setup/page.tsx:15-20,37-64`.
3. **Open business health** — ✅ One click to Business Overview. ⚠️ In development the page explicitly shows “Demo data” and 312 leads, 161 deals, and ₹84L pipeline; production summary only covers CRM counts and reports expenses/cash flow/department metrics unavailable. Evidence: `components/settings/workspace-section.tsx:194-260`, `/settings?tab=workspace&view=overview&workspace=business`.
4. **Find attention items** — ⚠️ Owner attention is easy to scan, but the approval cards are demo records and their “Review” buttons have no action handler. Evidence: `components/settings/workspace-section.tsx:291-306`.
5. **Approve a spend or message** — ❌ No complete owner path from the Overview snapshot. The backend has an execution approval route, but the overview controls do not connect to it. Evidence: `backend/janus_api/business/router.py:331`, `components/settings/workspace-section.tsx:291-306`.
6. **Ask Janus** — ❌ Chat renders a hard-coded sample answer and local conversation history. It does not use the Business Intelligence endpoint for this view. Evidence: `app/(app)/ai/page.tsx:206-237`.
7. **Check this month’s report** — ⚠️ Sales Summary and Pipeline can use the connected CRM summary; other reports are visibly “Connect workspace to unlock.” Custom and scheduled report actions are local UI state, and export says it does not create a file. Evidence: `app/(app)/analytics/page.tsx`, `lib/report-catalogue.ts:19-37`.
8. **Renew the plan** — ⚠️ Billing is a navigation destination, but no verified subscription/renewal journey was exposed in the audited Business Management route set. Treat billing as incomplete until a real plan API and payment flow are connected.

**Break point:** the owner can understand the intended product, but the first trustworthy business action—approve, ask, or report—does not complete against real records.

### 2.2 Admin / office manager: profile → invite → team → CRM-only access → guest expiry → 2FA

**Verified where the UI was reachable; missing behavior is inferred from local state and endpoint review.**

1. **Open People & Access** — ✅ One click from Business Management. Tabs are clear: Members, Invitations, Workspace Access, Roles & Permissions, Teams & Departments, Access Requests, Audit Logs.
2. **Set company profile/GSTIN** — ⚠️ Business Settings exposes Company Profile and masked GSTIN/PAN/CIN sample data. Save is local state; no verified company-profile API call or GSTIN/PAN/PIN validation. Evidence: `components/settings/company-profile-section.tsx:30-50`.
3. **Invite ten people** — ⚠️ Add person captures identity, role, workspace, and permissions, but the current member/invite collections are local component state. The temporary password notice says it is demo-only and is not sent. Evidence: `components/business/people-access.tsx:75-112`.
4. **Create teams** — ⚠️ Team/department controls are present but local; no verified persistence or membership audit event from the UI.
5. **Give Sales access only to CRM** — ⚠️ The screen can edit access visually. Service-level enforcement for all Business Management reads is not demonstrated; permissions must be checked on every workspace-scoped request.
6. **Add a guest CA with expiry** — ❌ No expiry control was found in the audited People & Access flow.
7. **Turn on 2FA for everyone** — ❌ No enforce-2FA organization control was found in the Business Settings route set.

**Break point:** the admin can model access in the UI, but cannot trust that an invitation, expiry, or organization security policy has been persisted and enforced.

### 2.3 Department head: authorized view → request access → approve agent message

**Partly verified; backend authorization conclusions are code-verified.**

1. **Select a department workspace** — ✅ Workspace routing and context-aware sidebar work for the configured workspace IDs. `components/layout/workspace-context.tsx`, `lib/nav-config.ts:223-226`.
2. **See only allowed records** — ❌ The department route is a generic preview with “Awaiting data” cards; it is not a real record view. Evidence: `app/(app)/workspace/[workspaceId]/page.tsx:47-112`.
3. **Request more access** — ⚠️ Access Requests is a visible tab, but no verified end-to-end request/approval persistence was observed.
4. **Approve an agent’s proposed message** — ⚠️ Approval endpoints exist for automation executions, but no complete agent-message approval surface was verified. Workspace membership checks are incomplete on several Business reads.

**Break point:** the department head cannot complete a meaningful department job because the module data and approval path are previews or unavailable.

### 2.4 Brand-new customer, day 1: zero data → first aha

**Verified in the fresh session.**

1. **Sign in with zero data** — ✅ Setup explains the intended four-step setup.
2. **Create business and connect first source** — ⚠️ Business details save through `/business/setup`; no first-source action is embedded in the setup. CRM & Sales is shown as Connected even when the CRM overview has zero leads and zero sources.
3. **Invite the team** — ❌ Setup step is a static card; the owner must discover People & Access separately.
4. **Get first insight** — ⚠️ Business Overview shows demo data in development, while CRM shows empty records. The product does not provide one clear verified first-capture or first-reply aha.

**Break point:** the customer sees a polished operating model but cannot complete the real first business loop without navigating several separate areas.

### 2.5 Power user: workflow template → test → publish → failure → retry; agent dry run → activate → version restore

**Verified in code and the running UI.**

1. **Create a workflow** — ✅ The list has Create workflow; the backend `POST /business/automations` exists.
2. **Use a template/folder** — ❌ The UI calls folder/template endpoints that are not in `backend/janus_api/business/router.py`; it displays an unavailable message.
3. **Edit nodes** — ⚠️ The editor exists, but loading runs, versions, and draft save first call missing endpoints and only draft save has a legacy PATCH fallback. Evidence: `app/(app)/automations/[id]/page.tsx:64-193`.
4. **Test and publish** — ❌ Test, publish, run history, versions, and on/off endpoint variants are absent from the backend router. The list can only use the legacy status PATCH where applicable.
5. **Retry a failed run** — ❌ No verified run detail/retry UI because the runs endpoint is missing.
6. **Create/edit an AI agent** — ✅ Agent create/edit uses the agent API when not in demo mode; the list can archive and configure approval policy.
7. **Dry run/activate/restore** — ❌ Agent detail still shows unavailable Test run/Pause and unavailable Activity, Approvals, and Versions sections. Evidence: `app/(app)/agents/[id]/page.tsx`.

**Break point:** power users can draft configuration, but cannot safely operate, publish, inspect, or roll back automation/agent behavior.

## 3. Findings

| ID | Area / screen | Finding | Evidence | Severity | Type | Recommendation | Effort |
|---|---|---|---|---|---|---|---|
| P0-01 | Janus Intelligence → Business AI Chat | Chat answer is hard-coded and chat storage is local to the browser. | `/ai?workspace=business&view=chat`; `app/(app)/ai/page.tsx:206-237` | P0 | Fix | Call the permission-aware intelligence API, persist threads/messages, show source records and answer timestamp. | M |
| P0-02 | Intelligence, Agents, Automations | Workspace scope is not consistently enforced in service reads; intelligence calls tenant-wide reporting and several routers use only `CurrentActor`. | `backend/janus_api/business/service.py:324-340`; `backend/janus_api/business/router.py:92-331` | P0 | Fix | Resolve workspace membership and permission for every read/write; filter source, agent, workflow, execution, and AI context at the service layer. | L |
| P0-03 | Agent/workflow details | Test run, pause/activate, publish, runs, versions, draft, and retry paths are incomplete or call missing endpoints. | `app/(app)/agents/[id]/page.tsx`; `app/(app)/automations/[id]/page.tsx:64-193`; `backend/janus_api/business/router.py` | P0 | Add | Implement one end-to-end dry-run → approval → execute → audit flow before exposing advanced controls. | L |
| P1-04 | People & Access | Members, invitations, roles, departments, access requests, and audit views are largely local UI state. | `/settings?tab=team&workspace=business`; `components/business/people-access.tsx:75-112` | P1 | Fix | Wire each action to invitation, membership, role, workspace-access, request, and audit APIs; show persisted status. | L |
| P1-05 | Business Settings | Company profile and regional settings look editable but save locally or only show a toast. | `components/settings/company-profile-section.tsx:30-50`; `components/settings/workspace-section.tsx:45-58` | P1 | Fix | Add PATCH APIs, validation, unsaved-change guard, server reload, and last-saved state for profile, GST, timezone, hours, and currency. | M |
| P1-06 | Department workspaces | Every non-CRM workspace is a generic preview with “Awaiting data” instead of records/actions/reports. | `/workspace/:workspaceId`; `app/(app)/workspace/[workspaceId]/page.tsx:47-112` | P1 | Add | Ship one working department module or keep it unavailable behind activation; do not present placeholder navigation as functional software. | L |
| P1-07 | Business Reports | Custom reports, schedules, export, and most catalogue reports are local or unavailable. | `/analytics?workspace=business`; `app/(app)/analytics/page.tsx`; `lib/report-catalogue.ts:19-37` | P1 | Add | Persist report definitions, filters, schedules, exports, delivery status, and verified source/period metadata. | L |
| P1-08 | Business Overview | Approval cards are sample data and Review buttons do not open a review flow. | `/settings?tab=workspace&view=overview&workspace=business`; `components/settings/workspace-section.tsx:291-306` | P1 | Fix | Link each approval to the central approval record, show impact/source, enforce approver permission, and audit the decision. | M |
| P1-09 | Workspace switcher | The switcher hard-codes Business and CRM & Sales, so newly activated workspaces do not appear there. | `components/layout/sidebar.tsx:78-151` | P1 | Fix | Load accessible workspaces from `/workspaces`, preserve active state, and hide disabled workspaces. | S |
| P1-10 | Mobile tables/tabs | DOM width passed at 390px, but dense tables, tabs, and action rows still need touch-level validation; desktop workflow/knowledge/report tables use large minimum widths. | 390px smoke pass; `app/(app)/automations/page.tsx`, `app/(app)/ai/page.tsx`, `app/(app)/analytics/page.tsx` | P1 | Fix | Put tables in labeled horizontal scroll regions, keep primary action sticky, and run real-device keyboard/gesture checks. | M |
| P1-11 | First-run setup | Setup has four labels but only details are actionable; Continue later permits bypass and “Connected” can describe an empty CRM. | `app/(app)/setup/page.tsx:15-20,37-64`; `/setup` | P1 | Fix | Make each step actionable, show real connection state, define a first-source CTA, and complete setup only after verifiable prerequisites. | M |
| P2-12 | IA / navigation | Roles, access, settings, profile, approvals, reports, and automations have overlapping homes. | `lib/nav-config.ts:83-125`; People & Access tabs; CRM nav | P2 | Cut | Make People & Access the single access home; Business Settings the company home; centralize approvals and make CRM approvals a filtered view. | S |
| P2-13 | State/copy | Demo, Sample data, Preview, Connected, Ready, Review, and Unavailable are used inconsistently. | Verified across `/settings`, `/ai`, `/analytics`, `/agents`, `/automations` | P2 | Fix | Define a single state vocabulary and reserve “Connected/Ready” for server-confirmed state. | S |
| P2-14 | Period/currency metadata | Demo metrics often lack period/source; dates use static labels or browser locale; lakh/crore formatting is not standardized. | `app/(app)/ai/page.tsx`; `components/settings/workspace-section.tsx`; `app/(app)/analytics/page.tsx` | P2 | Fix | Always show period, comparison, source, IST date, and INR formatting rules. | S |
| P2-15 | Accessibility | Most icon buttons have labels and tabs are keyboard reachable, but tab controls lack consistent `aria-controls`; charts and color-only states need stronger descriptions. | `app/(app)/ai/page.tsx`; `app/(app)/analytics/page.tsx`; settings components | P2 | Fix | Standardize tab semantics, chart summaries, focus styling, and non-color status labels. | M |
| P2-16 | Performance/resilience | Tables have no visible pagination strategy beyond basic lead paging; `useApi` has no retry/backoff or consistent error boundary. | `lib/api/use-api.ts`; member/workflow/source/report views | P2 | Fix | Add server pagination/filtering, abort stale requests, retry safe GETs, and provide plain-language partial-data errors. | M |
| P3-17 | Shell/navigation | Context-aware sidebar and query-driven workspace switching are clear and preserve CRM routes. | `components/layout/sidebar.tsx:45-77`; `components/layout/workspace-context.tsx`; `lib/nav-config.ts:223-226` | P3 | Keep | Keep the single workspace context and permission-filtered nav; make workspace discovery dynamic. | S |
| P3-18 | Honest unavailable states | Agents, workflows, reports, and unconnected departments visibly explain unavailable data instead of silently inventing records. | `/analytics`, `/agents`, `/automations`; `lib/report-catalogue.ts` | P3 | Keep | Keep the pattern, but remove demo data from production paths and provide a concrete connect action. | S |
| P3-19 | API bridge and CRM continuity | API bridge origin checks, tenant-aware CRM routes, and existing CRM screens remain available. | `app/api/backend/[...path]/route.ts`; `/dashboard?workspace=crm-sales`; `/leads`; `/inbox` | P3 | Keep | Keep backward-compatible CRM routes and add regression coverage before changing the shell. | S |

## 4. Cut list

1. **Hide planned department cards from the operating view** until each workspace has at least one real record, action, permission check, and report. Keep an activation catalogue with a clear “not connected” state.
2. **Hide Agents Templates, Workflow Folders, and New folder** until their APIs exist. An unavailable catalogue is less useful than a short “Coming soon” explanation.
3. **Remove or gate demo owner attention, approval, activity, target, and pipeline values** behind an explicit development/demo mode. Never show them as business health in a production path.
4. **Remove duplicate access homes** from settings and keep Roles, Invitations, Workspace Access, Teams, Requests, and Audit under People & Access.
5. **Keep CRM AI, CRM Analytics, and Business Intelligence separate by scope:** CRM-only operational assistance in CRM; cross-workspace analysis in Business Management.
6. **Remove unused preview dashboard components** in `components/settings/workspace-section.tsx` once confirmed dead; one owner overview should have one data source.

## 5. Add list

1. **Real setup checklist and first-source CTA** — an owner needs a clear first capture and first reply, not four static labels.
2. **Persisted company settings** — GSTIN/PAN/PIN validation, April–March financial year, multi-branch GSTINs, currency, timezone, and business hours must survive reload.
3. **Invitation and access lifecycle** — invite resend/revoke, guest expiry, role templates, workspace-level grants, access requests, and audit events.
4. **Organization security policy** — 2FA enforcement, session controls, security events, and clear recovery behavior.
5. **Permission-aware knowledge** — upload/crawl/index status, source ownership, collection access, conflict resolution, and citations in AI answers.
6. **Business AI persistence** — conversation threads, message history, source references, feedback, and an audit record for every recommended or approved action.
7. **Safe agent lifecycle** — dry run, impact preview, approval queue, kill switch, activation, pause, execution history, version diff, restore, and error retry.
8. **Safe workflow lifecycle** — templates, folders, node catalog, draft save, publish, test run, real run, failure detail, retry, version history, and rollback.
9. **Verified reports** — saved filters, period/comparison, source freshness, CSV/XLSX/PDF export, schedule delivery, and delivery history.
10. **Resilient data states** — loading skeletons, retry, partial results, pagination, large-member/runs handling, and errors written in owner language.
11. **India-specific controls** — GST/TDS fields, UPI billing, branch-level GST, INR lakh/crore formatting, IST dates, WhatsApp cost/ROI, and optional Hinglish copy.

## 6. Duplication map

| Concept | Current locations | Single proposed home |
|---|---|---|
| Members, roles, invitations, workspace access | People & Access; settings links; workspace member views | People & Access |
| Teams / organization structure | People & Access Teams & Departments; Business Settings Organization Structure | People & Access for assignments; Business Settings for org model |
| Approvals | Business Overview snapshot; Agents Approvals; CRM Approvals | One Approval Center with Business/CRM filters |
| Business reports vs CRM analytics | Business Reports; CRM Analytics | Business Reports for owner/cross-workspace; CRM Analytics for sales operations |
| Business AI vs CRM AI Assistant/Memory/Evaluations | Janus Intelligence; CRM AI section | Business AI for cross-workspace; CRM AI for CRM-only context |
| Automations | CRM Automations; Business Workflows | CRM automations remain CRM scoped; Business Workflows cross-workspace |
| Integrations | Business Settings; CRM Management; lead-source screens | Business Settings for company connections; CRM Lead Sources for capture setup |
| Profile / administration | Business Management Profile; generic Settings/Profile | Account Profile under Settings; company identity under Business Settings |
| Billing | Settings/Billing; Finance workspace future | Settings Billing & Subscription; Finance only for financial records |

## 7. Consistency checklist

| Pattern | Current variation | Standard to adopt |
|---|---|---|
| Page header | `PageHeader`, inline headings, sticky business headers | One header component: title, purpose, state, last updated, primary action |
| Tabs | Raw rounded buttons, Radix Tabs, horizontal overflow | One accessible `SectionTabs` with `aria-controls`, active state, and mobile scroll |
| Status | Demo, Sample data, Connected, Ready, Review, Unavailable | `Live`, `Demo`, `Not connected`, `Processing`, `Needs review`, `Error` |
| Data freshness | Today, Yesterday, static “2h ago”, no source | Period + timezone + source + freshness on every metric |
| INR | ₹ lakh strings, raw backend decimals, mixed spacing | One INR formatter with lakh/crore thresholds and exact-value tooltip |
| Dates | Browser `toLocaleDateString()`, static labels, no IST guarantee | Shared IST formatter and explicit reporting period |
| Empty states | “No records”, “Awaiting data”, unavailable endpoint, demo preview | Explain what it is, why empty, one next action, and ownership |
| Errors | Endpoint names are exposed in unavailable cards | Plain-language message plus technical detail behind disclosure |
| Confirmations | Some `window.confirm`, some no confirmation | Shared destructive/sensitive confirmation with impact and audit note |
| Buttons | Review, Open, Ask Janus, Store chat, Connect, Activate | Verb + object; primary action consistent per screen |
| Access signals | Permission-filtered nav but incomplete service checks | Enforce on API and show why an action is unavailable |
| AI trust | Approval copy exists but citations and execution history are missing | Show source, proposed change, approval owner, result, and stop control |

## 8. Mobile and accessibility results

### Mobile (390px verified pass/fail)

| Screen | Result | Evidence / issue |
|---|---|---|
| Business Overview | **Pass for document overflow; functional follow-up needed** | 390px DOM width remained 390; dense cards and owner attention need real touch validation. |
| Janus Intelligence Chat | **Pass for document overflow; functional follow-up needed** | Tabs and conversation list fit in the audited DOM; chat composer and long answers need one-handed testing. |
| People & Access | **Pass for document overflow; functional follow-up needed** | Member table is visually dense; edit actions and tabs need touch target checks. |
| Workspaces | **Pass for document overflow** | Cards stack; activation dialog needs keyboard/focus review. |
| Business Reports | **Pass for document overflow; functional follow-up needed** | Report tables use large minimum widths in code; verify the inner scroll region on a real phone. |
| AI Agents | **Pass for document overflow; functional follow-up needed** | Filters/actions are dense; empty state is readable. |
| Workflows | **Pass for document overflow; functional follow-up needed** | Wide table/editor behavior must be checked with a real horizontal scroll gesture. |
| Business Settings | **Pass for document overflow; functional follow-up needed** | Long profile forms need field order, save bar, and input zoom validation. |
| CRM Overview / Leads / Inbox | **Pass for document overflow** | Empty states are clear; lead table/edit affordances need touch testing with data. |

The 390px pass used an explicit browser viewport and found no document-level horizontal overflow or route-level application error. It did not replace a real iOS/Android device pass; table scroll, keyboard, safe-area, and touch-target claims remain open.

### Accessibility

- **Verified OK:** most icon-only controls expose accessible labels; navigation is keyboard reachable; status text is not exclusively color-coded.
- **Needs fix:** standardize tab `aria-controls`/`aria-selected`, chart summaries and roles, focus visibility after dialogs, and long-table headers.
- **Needs testing:** complete keyboard-only journey, screen-reader announcement of dynamic toasts/loading, contrast audit at all status colors, and 44px touch targets on real devices.

## 9. Proposed final sidebar and information architecture

```text
Business Management
├── Business Overview
├── Janus Intelligence
│   ├── Business AI Chat
│   ├── Knowledge
│   ├── Insights
│   ├── Performance Analysis
│   ├── Risk & Alerts
│   ├── Forecasts & Planning
│   └── Recommendations
├── People & Access
│   ├── Members
│   ├── Invitations
│   ├── Teams & Departments
│   ├── Roles & Permissions
│   ├── Workspace Access
│   ├── Access Requests
│   └── Audit Logs
├── Workspaces
│   ├── Active Workspaces
│   ├── Activate Workspace
│   └── Workspace Access (deep link to People & Access)
├── Business Reports
│   ├── Library
│   ├── My Reports
│   └── Scheduled Reports
├── AI Agents & Automation
│   ├── Agent Dashboard
│   ├── AI Agents
│   ├── Automation Workflows
│   ├── Approvals (link to central Approval Center)
│   └── Execution History
└── Settings
    ├── Account Profile
    ├── Notifications
    ├── Security & Sessions
    ├── Billing & Subscription
    └── Business Settings
        ├── Company Profile
        ├── Organization Structure
        ├── Currency & Timezone
        ├── Security & Privacy
        └── Data Management
```

Keep CRM & Sales as its own complete workspace. Its AI Assistant, Memory, Evaluations, CRM Automations, Approvals, and Analytics remain CRM-scoped and should not be duplicated into the Business sidebar.

## 10. Prioritised roadmap

### Now — P0 and quick P1 wins, target two weeks

1. Remove or hard-gate demo data in production paths; label dev fixtures in one consistent banner. **(P0-01, P1-08, P2-13, P3-18)**
2. Enforce workspace membership and permission checks in Business Intelligence, agents, automations, executions, and workspace members. **(P0-02)**
3. Make the setup checklist real: business save, workspace activation, invitation, first source, and completion state. **(P1-11)**
4. Make the workspace switcher load the accessible workspace list. **(P1-09)**
5. Wire Business Overview Review to the central approval record or remove the cards until it is available. **(P1-08)**
6. Persist Company Profile and regional settings with validation and unsaved-change handling. **(P1-05)**
7. Standardize state/copy, dates, currency, tabs, and empty states. **(P2-13, P2-14, P2-15)**

### Next — remaining P1

1. Build one real department workspace end to end; keep the others clearly unavailable. **(P1-06)**
2. Complete agent/workflow dry run, approval, activation, kill switch, execution history, retry, versions, and restore. **(P0-03)**
3. Persist People & Access lifecycle, guest expiry, access requests, audit records, and organization 2FA policy. **(P1-04)**
4. Implement verified report persistence, export, schedules, and source freshness. **(P1-07)**
5. Add server pagination/filtering and resilient API states. **(P2-16)**
6. Run real iOS/Android device and screen-reader journeys. **(P1-10, P2-15)**

### Later — P2/P3

1. Add the full India-specific finance, GST/TDS, UPI billing, branch, and Hinglish support. **(Add list, P2-14)**
2. Add advanced agent templates, cross-workspace scenarios, and custom reporting once the core records are real. **(P0-03, P1-07)**
3. Remove dead preview code and continue IA consolidation. **(P2-12, P3-17)**
4. Optimize large tables and execution history for 500+ members and 1,000+ runs. **(P2-16)**

## 11. Open questions for the product owner

1. Is development demo data allowed only behind an explicit demo mode, or should the local prototype always show an “Example workspace” banner?
2. Which single department workspace will be the first real module after CRM & Sales: Finance, Support, or HR?
3. Should approval records be globally visible to Owners only, or visible to department approvers with business-wide audit access?
4. What is the minimum billing scope for the first paid pilot: plan display only, UPI collection, invoices, or full subscription lifecycle?
5. Which WhatsApp and phone data can Business AI read by default, and which fields must be hidden even from Owners?

## Five-line summary

Janus has a strong workspace shell and a clear Business Management IA, with CRM continuity preserved.  
It is not production-ready because major Business and AI paths still use demo/local state and several backend endpoints are missing.  
The highest risk is trust: fake numbers, incomplete approvals, and inconsistent workspace authorization.  
Make setup, permissions, one department workspace, one real AI answer, and one audited approval loop real before expanding breadth.  
Desktop and 390px smoke checks passed without runtime errors; dense tables, accessibility, and real-device behavior still need follow-up validation.
