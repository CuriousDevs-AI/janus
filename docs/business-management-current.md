# Janus Business Management — Current UI Reference

This document describes the Business Management area currently available in the Janus frontend. It is a UI and integration reference for the present build. In development, the Business Overview intentionally uses clearly labelled demo data so the complete visual flow can be reviewed. Production keeps the API-backed behavior.

## Open Business Management

The Business workspace is selected from the workspace switcher. Its sidebar contains seven owner/admin areas:

| Sidebar area | Route | Current access gate |
| --- | --- | --- |
| Business Overview | /settings?tab=workspace&view=overview&workspace=business | settings:manage in the UI |
| Janus Intelligence | /ai?workspace=business | ai:manage in the UI |
| People & Access | /settings?tab=team&workspace=business | members:manage in the UI |
| Workspaces | /settings?tab=workspace&view=workspaces&workspace=business | settings:manage in the UI |
| Business Reports | /analytics?workspace=business | settings:manage in the UI |
| AI Agents & Automation | /agents?workspace=business | agents:manage in the UI |
| Business Settings | /settings?tab=workspace&view=settings&workspace=business | settings:manage in the UI |

The backend applies its own permission checks. Business data is requested through authenticated /v1 endpoints and should remain scoped to the active tenant and workspace membership.

## 1. Business Overview

Business Overview is the company-level dashboard for the Owner or an authorized administrator. It is intentionally a single overview screen; Financial Performance and Workspace Performance are not separate tabs on this page.

### Overview screen

- Shows the current reporting-period banner and a Refresh action.
- Header follows the uploaded overview reference: owner-view context, refresh action, and a compact cream/white card layout.
- Shows a Janus brief grounded in the CRM summary.
- Shows only three connected CRM KPI cards: Leads, Open Deals, and Pipeline.
- Shows an interactive chart control for Growth and Revenue.
- Growth displays a current CRM snapshot for captured leads, open deals, and won deals. It does not invent historical growth percentages.
- Revenue shows an unavailable state until verified Finance & Accounting records exist. CRM pipeline value is not presented as revenue.
- Shows Owner Attention for verified alerts and approvals, plus a data-coverage card.
- Uses /business/reports/summary and shows loading or unavailable states instead of inventing numbers.

## 2. Janus Intelligence

Janus Intelligence is the permission-aware company AI surface. It is separate from the CRM AI pages and is intended to reason over authorized business data. In development, every Intelligence view is populated with clearly labelled sample data so the complete UX can be reviewed end to end. These demo states are development-only; production continues to use verified API records.

### Business AI Chat

- Natural-language input with example questions and conversation turns.
- Sends questions to POST /business/intelligence/ask with the active workspace context.
- Responses include an answer, data sources, and grounded-record calculation context.
- The UI identifies unavailable data rather than generating a sample answer.
- For a department workspace, the same surface becomes that department’s scoped AI Chat.
- The development UI supports multiple conversations, date separators, a ChatGPT-style New chat control, and a Store chat action. Stored state is local to the current browser session until chat storage is connected.

### Knowledge

- Shows source health cards: Sources, Ready for Janus, Needs review, and Unanswered questions.
- Provides Add knowledge actions for Upload files, Write a page, Add a website, Connect an app, and Add a Q&A.
- Shows collections with source counts and the people allowed to use each collection.
- Includes Test what Janus knows, with a question input, grounded demo answer, and source chips.
- Includes an All sources table with search and filters for All, Ready, Processing, Needs review, and Outdated.
- Includes Questions Janus couldn’t answer with Add answer actions.
- Includes Suggested facts with explicit Approve and Reject actions.
- Add knowledge is a complete browser-only flow: a chooser opens Upload files, Write a page, Add a website, Connect an app, or Add a Q&A; forms validate input, show a saving state, and insert the resulting source/collection into the demo view.
- Add-answer actions open the Q&A form and remove the question from the unanswered list after saving. New sources show Processing or Ready status, and the source counters update in the current session.
- Development uses sample source records and displays a Sample data badge. Production should replace these interactions with the knowledge backend.

### Insights

- Shows sample finding cards for sales momentum, stalled proposals, and collections.
- Includes a “What changed” summary with period-over-period metrics and an action list.
- Production replaces the sample findings with permission-filtered connected records.

### Performance Analysis

- Shows Revenue, Net profit, Cash in bank, and Receivables cards in the demo state.
- Includes department performance comparisons and a revenue-versus-target chart.
- Production replaces sample metrics with verified CRM, Finance, and workspace reporting records.

### Risk & Alerts

- Shows high, medium, and low risk summaries with sample risk records.
- Provides action controls such as Review, Assign, and Monitor for the UI flow.
- Production creates risks only from verified, permission-filtered business records.

### Forecasts & Planning

- Shows sample next-month revenue, expected cash, and confidence metrics.
- Includes Conservative, Base, and Upside scenarios plus planning notes.
- Production requires verified financial and operational history before calculating forecasts.

### Recommendations

- Shows sample recommended actions with owners, impact, urgency, and Review controls.
- Includes an approval-boundary panel for sensitive actions.
- Production grounds recommendations in authorized records and requires approval before consequential execution.

Activity and previous conversation context stays inside Business AI Chat through the conversation list and Store chat action. There is no separate Activity & History tab in the current Intelligence navigation.

## 3. People & Access

People & Access is the company-level member and permission area. It currently has seven internal sections.

### Members

- Shows company members, role, department, last active state and workspace count.
- Add person opens a complete UI-only form for name, email/username, temporary password, role, department, workspace access and granular permissions.
- Edit and remove actions update the local demo state and show a status message.
- The current member and invitation lists are local UI state; they are not yet wired to the backend invitation endpoint.

### Invitations

Shows pending invitations with name, email, role, workspace count and status. Resend and cancel actions are available in the demo flow.

### Teams & Departments

Shows departments and supports adding a department through a working UI form. Manager assignment is represented as the next management action.

### Roles & Permissions

- Shows built-in roles and permission counts.
- Supports creating custom roles, editing permission checkboxes and deleting custom roles.
- Permission groups cover records, communications, reports, people management and approvals.

### Workspace Access

Provides a member-by-workspace access matrix with checkboxes, plus the same detailed editor used from Members.

### Access Requests

Shows sample workspace access requests with Approve and Decline actions.

### Audit Logs

Shows sample member, role, invitation and workspace access events for the owner review flow.

## 4. Workspaces

Workspaces is the Owner-controlled workspace catalogue and activation surface. It intentionally keeps one simple flow: active workspaces first, then workspaces available to activate.

### All Workspaces

- Shows created workspaces returned by GET /workspaces.
- CRM & Sales is shown as the active workspace and links to the existing CRM dashboard.
- Newly created department workspaces are shown as active records when returned by the API.
- Shows an API error state if additional workspace records cannot be loaded.

### Create Workspace

- Opens the workspace creation dialog.
- Requires a workspace name and workspace type.
- Posts to POST /workspaces.
- Creates a tenant-scoped workspace and keeps its records and access separate from CRM & Sales.

### Available workspaces

The available department workspaces are shown as simple activation cards. Selecting Activate opens one guided flow for the workspace name and type, then creates the workspace through POST /workspaces.

## 5. Business Reports

Business Reports now has exactly three internal tabs: Library, My reports, and Scheduled.

### Library

- Uses the catalogue in `lib/report-catalogue.ts` as the single report source of truth.
- Supports report search, department chips, pinned/most-used reports and a reusable report viewer.
- Sales is the only connected department. Sales Summary and Pipeline use GET /business/reports/summary.
- Conversion funnel, Rep performance and Lead sources are listed but show an unavailable endpoint state until their exact backend reports exist.
- Finance, HR, Support, Operations and Projects each show one compact Connect row instead of empty report cards.
- Report views include period/compare controls in the URL, unavailable states, export/schedule/share/Ask Janus actions, summary cards, chart and sortable detail table.

### My reports

- Provides a four-step custom report builder: source, metrics, group by, and chart.
- Only connected CRM & Sales is selectable. Other sources are disabled as Not connected.
- Saved reports are local UI state until a reports persistence endpoint is connected.

### Scheduled

Provides a schedule dialog with report, recipients, channel and frequency. Email is always available; WhatsApp is shown only when the tenant has a connected WhatsApp source. Schedules are local UI state until a delivery scheduler endpoint is connected.

## 6. AI Agents & Automation

AI agents remain available from /agents?workspace=business. Business workflows now live only at /automations?workspace=business and are never scoped to a department workspace. The workflow UI uses a business scope contract so a workflow can trigger on and act across connected CRM, Finance, HR, Support, Operations, Projects, IT and Communication modules.

### Workflow list

- Shows only records returned by GET /business/automations; no client-side demo workflows are inserted.
- Header actions are Create workflow and Templates.
- Left folders are loaded from GET /business/automation-folders; if that endpoint is unavailable the UI says so instead of creating fake folders.
- Search, status, connected-module and sort controls are available.
- The table shows on/off, name/description, trigger, modules used, runs and errors for the last seven days, last run, owner and updated time. Missing fields are shown as — or Not returned.
- Row click opens the workflow in view mode. The row menu supports archive through the existing workflow endpoint; turn on/off first tries the dedicated endpoint and falls back to the existing status PATCH for backwards compatibility.
- Bulk selection supports turn on, turn off and archive. Turning on a workflow that sends WhatsApp, email or bulk messages requires confirmation.
- Templates are loaded from GET /business/automation-templates. No template records are fabricated when that endpoint is unavailable.

### Workflow page

/automations/:id?workspace=business&tab=editor|runs|versions|settings is the shared view/edit page. Create workflow opens /automations/new in the same editor.

- View mode shows the read-only trigger, ordered steps, branches and a pinned goal/exit condition card. When the workflow is on, the page explains that editing creates a draft while the live version keeps running.
- Edit mode uses the same canvas and adds the trigger/step editor, plus buttons, keyboard Move up/Move down controls, step deletion confirmation, autosave status and a right panel.
- The right panel has Setup, Configure and Test sub-tabs. Configure supports JSON fields and data-picker tokens from the trigger and earlier steps. Test calls the dry-run endpoint and never changes records.
- Step choices come from GET /business/automation-catalog. Disconnected modules are visible as disabled choices with a Connect module first message. No workspace selector is shown.
- Sensitive actions show approval warnings and are treated as approval-gated. Suppression for do-not-contact, unsubscribed and blocked records is shown as permanently on.
- The header supports inline name editing, Test workflow, Edit, Publish, turn on/off, duplicate, export JSON and archive.
- Runs, Versions and Settings tabs show returned records or explicit endpoint-unavailable states. Run history supports returned step JSON and CSV export; retry/cancel controls remain disabled until their endpoints exist.

### Missing workflow endpoints

The current backend still needs the following endpoints for complete persistence and execution:

- PATCH /business/automations/:id/draft, DELETE /business/automations/:id/draft, POST /business/automations/:id/publish, POST /business/automations/:id/on, /off, /archive
- POST /business/automations/:id/test, GET /business/automations/:id/enrollment-preview
- GET /business/automations/:id/runs, GET /business/runs/:runId, POST /business/runs/:runId/retry, /cancel
- GET /business/automations/:id/versions, GET /business/automations/:id/versions/:v, POST /business/automations/:id/versions/:v/restore
- GET /business/automation-catalog, GET /business/automation-templates
- Folder CRUD under /business/automation-folders
- Approval reject/edit endpoints and workflow settings persistence

The existing workflow list, create, legacy PATCH, archive and manual run APIs remain supported while those endpoints are added.

## 7. Business Settings

Business Settings is the company administration area. It currently has nine internal sections.

### Company Profile

- Company name field.
- Industry selector with B2B SaaS, E-commerce, Fintech, Healthtech, Logistics, Manufacturing, and Other.
- Save calls PATCH /business/setup for the business name and industry.

### Organization Structure

Intended for company structure, departments, and reporting relationships. Current UI is an unavailable state.

### Currency & Timezone

- Timezone selector with India/IST, US Eastern, London, Singapore, Sydney, and UTC options.
- Default communication channel selector for Website Chat, Email, or WhatsApp.
- Business hours start and end fields.
- The controls are present in the UI; the current setup save request only persists business name and industry, so full locale persistence still needs backend wiring.

### Financial Configuration

Intended for financial settings, accounting configuration, and reporting rules. Current UI is an unavailable state.

### Business Policies

Intended for approval, communication, discount, refund, and operating policies. Current UI is an unavailable state.

### Integrations

Intended for company-level connected services. Current UI is an unavailable state. CRM lead-source integrations remain available in CRM & Sales.

### Security & Privacy

Intended for security controls, privacy controls, and company access safeguards. Current UI is an unavailable state.

### Data Management

Intended for imports, exports, retention, and data-management controls. Current UI is an unavailable state.

### Billing & Subscription

Intended for plan, subscription, and billing controls. Current UI is an unavailable state in the Business Settings view.

## Workspace catalogue

| Workspace | Status | Current shape |
| --- | --- | --- |
| Business Management | Active | The seven owner/admin areas in this document |
| CRM & Sales | Active | Existing CRM routes and CRM AI tabs are preserved |
| HR & People | Planned | HR records, reports, AI chat, and settings navigation |
| Finance & Accounting | Planned | Finance records, reports, AI chat, and settings navigation |
| Projects & Delivery | Planned | Project records, reports, AI chat, and settings navigation |
| Customer Support & Success | Planned | Support records, reports, AI chat, and settings navigation |
| Operations & Inventory | Planned | Operations records, reports, AI chat, and settings navigation |
| IT & Infrastructure | Planned | IT records, reports, AI chat, and settings navigation |

Planned workspace routes currently provide context-aware navigation and an explicit preview/awaiting-data surface. CRM & Sales is the existing connected product workspace.

## Current implementation boundary

The Business Management UI exposes the complete navigation shape and avoids fake business metrics. Connected records currently include CRM leads, deals, pipeline, existing team/role components, business setup, workspace API records, agent API records, and workflow/execution API records. Finance, HR, Projects, Support, Operations, and IT records are not populated in the current build, so their dashboards, reports, AI views, and settings show unavailable or awaiting-data states.

Update this reference whenever a Business section becomes backed by real records or receives a new management action.

