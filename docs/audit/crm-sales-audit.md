# Janus CRM & Sales audit

**Audit date:** 22 October 2026  
**Repository:** `CuriousDevs-AI/janus`  
**Scope:** Next.js CRM & Sales workspace, shared CRM models/stores/services, mock data and connected UI routes.  
**Method:** code inspection plus a route-level UI walkthrough against the traditional CRM baseline and the AI-native checklist in [`ai-native-crm-research.md`](./ai-native-crm-research.md).  
**Baseline:** this report records the repository state before the implementation pass. The current branch includes the fixes listed in the implementation update below.

## Executive summary

Janus has a credible visual prototype for lead capture, a pipeline, WhatsApp follow-up, approvals, knowledge, memory and AI operations. It is not yet a sellable CRM because the main customer-facing routes do not share one data source: leads and deals call the backend, while customers, tickets, approvals, memory, agents, knowledge, evaluations and audit logs still read mock data or local Zustand state. The lead-to-deal path is the strongest slice, but the customer record does not yet carry the promised cross-channel timeline or memory. The AI surfaces mostly provide canned answers and demo records; they do not yet extract, write, explain, or reverse changes in the CRM. Outbound WhatsApp has real API guardrails, but the approval boundary is not yet tied to AI-generated actions. Permissions are checked for several writes, yet record visibility and workspace-scoped retrieval are incomplete in the UI. Janus is therefore **prototype-ready for design-partner testing**, **not ready for a first paying customer without a production data contract and customer timeline**, and **farther from a real AI-native CRM than the UI suggests**.

## Implementation update

The first audit pass has now been implemented on this branch:

- The live lead response includes the contact projection (name, phone, email, company), source enum and owner name. Lead list pagination, search, filters and editing no longer issue one contact request per row.
- Customers are derived from the same live lead/deal responses. The customer detail page shows linked CRM activity, linked deals, partial-data warnings and a permission-protected contact edit flow.
- Lead detail uses the enriched lead contract, renders deal event history when available, and labels email, call and SMS links as external handoffs that Janus does not track yet.
- Deal and lead records expose owner names when the assigned user is available instead of presenting an opaque member ID.

The remaining findings below are still the work queue; the implementation update does not claim that mock AI, approvals, memory, tickets, reports or channel adapters are production-backed.

## Scorecard: AI-native CRM checklist

| # | Standard | Status | Evidence in this repository | What would make it Done |
|---:|---|---|---|---|
| 1 | Passive capture across web, WhatsApp, phone, webhook, API and CSV | **Partial** | Lead source types and connection cards cover website, WhatsApp, phone/webhook, API, CSV and coming-soon sources in `lib/types/index.ts:115-125,690-717` and `lib/mock-data/lead-sources.ts`. The backend has real ingestion paths, but the frontend lead list only reads `/leads` and the inbox only reads `/whatsapp/conversations`. | One ingestion contract should emit a normalized event, identity decision, consent state and timeline event that every CRM screen consumes. Add source health, retries and failure replay to the UI. |
| 2 | Identity resolution and visible deduplication | **Partial** | The backend lead model exposes `customerId`; the lead list fetches one contact per lead in `app/(app)/leads/page.tsx:177-201`. There is no merge/duplicate review route or visible identity decision. | Add a deduplication queue, merge preview, conflict resolution and immutable merge history. |
| 3 | Complete contextual customer record | **Missing** | `app/(app)/customers/[id]/page.tsx:1-49` fetches only `Contact` fields and explicitly says conversations and activity timeline will follow when connected. The richer customer object exists only in `lib/types/index.ts:92-113` and mock store state. | Make the customer record the canonical read model: profile, consent, all conversations, activities, leads, deals, tickets, memory, source provenance and next action. |
| 4 | Structured extraction from conversations | **Missing** | `lib/services/ai-responder.ts:1-52` selects hard-coded reply strings. No service extracts intent, budget, urgency, decision maker or requirements into API fields. | Persist extraction proposals with source message, confidence and approval/correction state before writing CRM fields. |
| 5 | Grounded generation with citations and uncertainty | **Partial** | `lib/services/business-ai.ts` returns canned answers from mock statistics and `lib/services/customer-ai.ts:1-105` returns deterministic text with source labels. `Message.aiMeta` can carry `knowledgeUsed`, but no real generation or citation object is wired to the CRM. | Every draft should show source records/knowledge, confidence, missing evidence and prompt/model version; reject unsupported claims. |
| 6 | Next-best action with owner, due time and reason | **Partial** | `Deal.nextAction` exists in `lib/types/index.ts:182-199`; the lead detail page only points to the inbox and shows a synthetic “last activity” entry (`app/(app)/leads/[id]/page.tsx:262-283`). | Calculate and store an actionable recommendation from current context, show why it was selected, assign it, set an SLA and let a human accept/edit/dismiss it. |
| 7 | Guardrailed execution | **Partial** | Approval types and UI exist in `lib/types/index.ts:557-585` and `app/(app)/approvals/page.tsx`; WhatsApp sending enforces a reply window/template and opt-in in `app/(app)/inbox/page.tsx:340-574`. There is no link from an AI action to an approval request or policy decision. | Route every consequential AI write/send/discount/refund/stage change through a policy engine with preview, approval, execution result and rollback. |
| 8 | Explainable output | **Partial** | Lead scoring has `scoreReasons` in `lib/types/index.ts:138-161`; mock AI answers include `dataUsed` and `calculation`. The live lead API shape in `lib/api/types.ts:36-56` omits score and explanation. | Return score signals and recommendation evidence in the API and display them on lead/deal/customer records. |
| 9 | Correction and feedback loop | **Partial** | Memory can be approved/edited/deleted locally in `app/(app)/memory/page.tsx:76-119`; Freshsales-style feedback is not connected to a model or API. | Persist accept/edit/reject feedback with actor, reason and model version; use it to evaluate future suggestions. |
| 10 | Reversible, audited AI writes | **Partial** | Mock audit records are displayed in `app/(app)/audit/page.tsx:1-129`; backend audit support exists separately. Store actions in `lib/stores/app-store.ts` create local activity entries, but live CRM writes do not share the same audit UI. | Use one server audit stream for every field/stage/message/approval change and expose undo or compensating actions where safe. |
| 11 | Permission-aware retrieval and tools | **Partial** | `useSession()` gates several write controls (`app/(app)/leads/page.tsx:144-159`, `app/(app)/inbox/page.tsx:340-370`); business workspace navigation is role-aware. Mock AI, memory and customer data are not filtered by the logged-in user's record visibility. | Enforce object, record, field, memory and tool permissions before retrieval; include the applied scope in the UI and in AI traces. |
| 12 | Persistent scoped memory | **Partial** | `MemoryItem` has customer, source, confidence and status (`lib/types/index.ts:387-403`) and mock memory UI supports filters. It is not linked to live contacts or conversation ingestion. | Store approved memories server-side with scope, source span, expiry/review date and permission inheritance. |
| 13 | Conversation-to-workflow bridge | **Partial** | Workflow node types include triggers, AI decisions, actions and approvals (`lib/types/index.ts:443-535`); the workflow editor can configure a connected module. No live inbound message currently creates a workflow run or updates a deal. | Emit events from ingestion and conversation actions, show run IDs on the record timeline, and require approval for sensitive steps. |
| 14 | Operational measurement of AI quality and cost | **Partial** | `UsageRecord` and `EvaluationRun` exist (`lib/types/index.ts:629-660`), but evaluations and usage pages read mock data. | Store generation, acceptance/edit rate, resolution, time saved, token/channel cost, policy violations and outcome per tenant/agent/version. |
| 15 | Safety, consent, opt-out and prompt-injection controls | **Partial** | Consent is modelled on `Customer` (`lib/types/index.ts:59-90`); the WhatsApp composer requires opt-in for templates. No global do-not-contact view, inbound content isolation, prompt-injection detection or channel cost budget is visible in CRM. | Apply consent and suppression before every channel/tool call, isolate untrusted message text from instructions, show blocked reasons, and expose per-channel cost/limits. |

## Inventory

### Routes in CRM & Sales scope

| Route | Current responsibility | Data path today |
|---|---|---|
| `/dashboard` | CRM overview: lead/deal/source KPIs, recent leads and pipeline snapshot | Live API via `useApi` in `app/(app)/dashboard/page.tsx:17-42`; shows loading/error rather than demo fallback |
| `/inbox` | WhatsApp conversation list, thread, text/template composer and delivery state | Live WhatsApp API in `app/(app)/inbox/page.tsx:31-183,340-574`; not an all-channel inbox |
| `/lead-sources`, `/lead-sources/[id]`, `/lead-sources/new`, `/lead-sources/whatsapp` | Lead-source catalogue, setup, ingestion and WhatsApp setup | Lead-source mock catalogue plus backend source endpoints in `components/lead-sources/*` and `app/(app)/lead-sources/*` |
| `/leads` | Search, stage/source filters, selectable rows, configurable columns, edit/delete, bulk stage/delete, pagination | Live `/leads` and `/contacts/:id` calls in `app/(app)/leads/page.tsx:147-201` |
| `/leads/[id]` | Lead header, pipeline stage strip, follow-up channel menu, synthetic activity timeline, contact and call recording | Live lead/contact API; only timestamps/recording are rendered as activity in `app/(app)/leads/[id]/page.tsx:123-360` |
| `/deals` | Searchable draggable pipeline, stage move, lost reason, page cursor | Live `/deals` and PUT in `app/(app)/deals/page.tsx:24-76` |
| `/deals/[id]` | Deal fields, WhatsApp action, stage/history pagination | Live deal and event endpoints in `app/(app)/deals/[id]/page.tsx:20-188` |
| `/customers` | Customer list, health filters, company/deal/ticket/activity rollups | Mock Zustand store in `app/(app)/customers/page.tsx:28-39` |
| `/customers/[id]` | Contact profile fields | Live `/contacts/:id`; no customer timeline or edit/merge in `app/(app)/customers/[id]/page.tsx:6-49` |
| `/tickets`, `/tickets/[id]` | Support list/create/status/assignment/handoff | Mock Zustand store in `app/(app)/tickets/page.tsx:48-50` and customer context; not a live CRM support relation |
| `/analytics` | Reports library, custom report builder, schedules and department coverage | Demo catalogue/local state; `app/(app)/analytics/page.tsx:71-96` |
| `/approvals`, `/approvals/[id]` | Pending/approved/rejected review and decision | Mock Zustand store in `app/(app)/approvals/page.tsx:31-39` |
| `/knowledge`, `/knowledge/[id]` | Knowledge sources, versions, publish/update and agent relationships | Mock Zustand store/local state in `app/(app)/knowledge/[id]/page.tsx:20-24` |
| `/agents`, `/agents/[id]` | Agent catalogue, versions, tools, test/edit | Mock agents in `lib/mock-data/agents.ts` and `app/(app)/agents/*` |
| `/automations`, `/automations/[id]` | Business workflows, node editor, run history, versions and settings | Business workflow API when available; local fallback/editor normalization in `app/(app)/automations/[id]/page.tsx` |
| `/memory` | Memory table, filters, approve/edit/delete | Mock array/local state in `app/(app)/memory/page.tsx:49-119` |
| `/evaluations` | Agent evaluation runs and regression summary | Mock arrays in `app/(app)/evaluations/page.tsx:11-28` |
| `/integrations`, `/integrations/[id]` | Integration catalogue, connect/test/disconnect/API key UI | Mock integration seed and local overrides in `app/(app)/integrations/[id]/page.tsx:42-50` |
| `/audit` | Searchable audit table | Mock `auditEvents` in `app/(app)/audit/page.tsx:44-58` |
| `/usage` | LLM/WhatsApp/email/voice usage and costs | Mock usage data in `lib/mock-data/usage.ts` and route |
| `/notifications` | Notification list/read state | Mock/local state |

### Shared code in scope

| Path | What it owns | Audit note |
|---|---|---|
| `lib/types/index.ts` | Domain types for leads, customers, deals, conversations, messages, activities, tickets, knowledge, memory, agents, workflows, approvals, audit, usage and sources | Strong UI vocabulary, but it is not the live API contract; several entities lack timestamps, soft-delete/version fields and custom-field shapes. |
| `lib/api/types.ts` | Live backend response types | Duplicates concepts from `lib/types/index.ts` with incompatible shapes (`Lead`, `Deal`, `FieldMapping`, source kinds). |
| `lib/stores/app-store.ts` | Mock domain state and local mutations for deals, leads, tickets, approvals, inbox, notifications, automations, knowledge, agents and creation flows | Makes demo interactions look real but cannot be used as production persistence. |
| `lib/services/ai-responder.ts` | Hard-coded sales/support replies and draft variants | Explicitly deterministic canned output; not an AI provider or grounded retrieval path. |
| `lib/services/business-ai.ts` | Keyword-matched canned business answers from mock statistics | Useful demo scaffolding; not natural-language retrieval or permission-aware execution. |
| `lib/services/customer-ai.ts` | Keyword-matched customer answers from passed context | Grounded to the passed mock context but has no live API integration or audit. |
| `components/shared/activity-timeline.tsx` | Shared mock activity rendering and links | Uses `getCustomerById` from mock data, so it cannot render a live customer safely. |
| `components/inbox/*` | WhatsApp thread, composer, customer context and channel action | Composer has meaningful WhatsApp guardrails; the inbox contract is still WhatsApp-specific. |
| `components/deals/deal-form.tsx` | Live deal create/update form | Needs validation and permission/approval rules aligned with the API. |
| `components/lead-sources/*` | Source metadata, setup and ingestion UI | Good foundation for a transactional inbox, but not yet a visible source-to-record audit trail. |
| `components/automations/*` | Workflow cards, node canvas, node metadata and create dialog | Editor supports business modules and approval nodes; CRM events are not yet proven end to end. |

## Findings by area

### F1. Lead capture, leads and sources

| ID | Finding | Benchmark | Impact | Fix | Priority |
|---|---|---|---|---|---|
| L-01 | The lead list uses live `/leads`, then performs one `/contacts/:id` request per distinct customer (`app/(app)/leads/page.tsx:177-201`). | A CRM list should have a paginated read model with stable filters and one request. | 50 leads produce up to 51 requests; slow pages and partial rows are likely for larger tenants. | Add a paginated lead view endpoint returning lead plus contact projection, total/next cursor and filter metadata. | P0 |
| L-02 | The list filters only the current page and has no saved views, export or server-side count (`app/(app)/leads/page.tsx:209-231`). | Mature CRMs support saved views, scalable filters and export/report access. | Sellers cannot reliably work a large queue or share a “needs follow-up” view. | Persist views and move filtering/counts/export to the API; keep column preferences per user. | P1 |
| L-03 | Assignment is displayed as `Member #id` when the owner is not the current user (`app/(app)/leads/page.tsx:501-516`, `app/(app)/leads/[id]/page.tsx:185-194`). | Ownership should resolve to a name/team and be editable under permission. | Users cannot trust or act on an assignment. | Return owner projection/team and add assignment action with audit. | P1 |
| L-04 | `LeadSource` is a clean UI union in `lib/types/index.ts:115-125`, but live `lib/api/types.ts:36-56` exposes `source: string`; source metadata differs between type systems. | A shared API contract should reject unsupported source values and preserve source provenance. | Invalid source strings can silently reach filters, reports and AI prompts. | Generate or share types from the API schema; use one source enum and source event record. | P0 |
| L-05 | Lead detail's activity timeline is synthetic: it renders capture, a last-activity timestamp and optional recording, not actual messages/calls/stage/owner history (`app/(app)/leads/[id]/page.tsx:262-303`). | Record pages need a complete, filterable activity history. | A salesperson cannot understand what happened or safely hand over a lead. | Add `/leads/:id/timeline` or a unified customer timeline and render actor, channel, source, content summary and audit links. | P0 |
| L-06 | `FollowUpActions` opens WhatsApp, `mailto:`, `tel:` and `sms:` links (`app/(app)/leads/[id]/page.tsx:67-119`) without showing channel consent, configured provider status, cost or delivery audit. | Channel actions must respect consent, opt-out and provider state. | A seller may believe a browser handoff is a tracked Janus action when it is not. | Show configured channels and consent; label browser handoffs; route tracked sends through a channel service and audit result. | P0 |
| L-07 | Lead score/reasons exist only in the UI type (`lib/types/index.ts:138-161`); the live API `Lead` omits score, intent, budget, decision-maker and score reasons (`lib/api/types.ts:36-56`). | AI scoring must be explainable and based on persisted signals. | The prototype implies AI qualification without a usable API contract. | Persist score versions, signals, confidence, model and feedback; expose them on list/detail. | P1 |
| L-08 | There is no duplicate review, merge, consent history, opt-out center or delete/export workflow in lead UI. | Identity, privacy and data quality are core CRM behavior. | Duplicate contacts and DPDP requests become manual operations; WhatsApp risk is high. | Add duplicate queue, reversible merge, consent ledger, suppression checks and data export/delete actions. | P0 |

### F2. Contacts, customers and memory

| ID | Finding | Benchmark | Impact | Fix | Priority |
|---|---|---|---|---|---|
| C-01 | `/customers` reads a rich mock `Customer` store while `/customers/[id]` reads a minimal live `Contact` (`app/(app)/customers/page.tsx:28-39`, `app/(app)/customers/[id]/page.tsx:6-49`). | A list and record page should be two views of one canonical entity. | A customer can appear healthy with deals/tickets in the list, then lose that context when opened. | Replace mock list/detail with a live customer read model and explicit demo mode only when no backend is configured. | P0 |
| C-02 | Customer detail has no edit, merge, timeline, deal panel, tickets, consent, health, memory or next-best-action UI (`app/(app)/customers/[id]/page.tsx:14-46`). | Mature record pages expose relationship context and activities. | The promised “one customer record, one timeline, one memory” is not usable. | Build tabs/sections for overview, timeline, deals, support, memory, consent and data quality. | P0 |
| C-03 | `ActivityTimeline` resolves customer names from mock data (`components/shared/activity-timeline.tsx:4,34-36`), so it cannot safely render live activity. | Activity links must resolve from server projections and permissions. | Links and names can be wrong or leak a mock customer. | Pass server-enriched customer summaries or remove mock lookup from production paths. | P0 |
| C-04 | Memory editing and approval are local state only (`app/(app)/memory/page.tsx:76-119`). | AI-native memory needs provenance, approval, scope and persistence. | Refresh loses corrections; the AI cannot learn which facts were accepted. | Add memory API with source span, scope, confidence, review/expiry and audit. | P1 |
| C-05 | Memory is customer-scoped in the type but not permission-filtered in the page; no record-level ACL is applied before rendering. | Permission-aware AI must filter retrieval before generation. | A team member could see another workspace's customer memory in the prototype. | Apply tenant/workspace/record ACLs in API and UI; show “why you can see this” where useful. | P0 |

### F3. Deals and pipeline

| ID | Finding | Benchmark | Impact | Fix | Priority |
|---|---|---|---|---|---|
| D-01 | The pipeline board is live and supports drag-to-stage, but search and totals operate on the current page (`app/(app)/deals/page.tsx:24-39`). | Pipeline forecasts and stage counts should be tenant-wide and filterable. | Counts and open value are wrong when more than one page exists. | Add server-side filters, aggregate totals and a pipeline snapshot endpoint. | P0 |
| D-02 | The board shows `deal.ownerId` as `Member #id` unless it is the current user (`app/(app)/deals/page.tsx:201-220`). | Ownership and team visibility are first-class. | Managers cannot identify who owns a deal. | Return owner/team projections and assignment history. | P1 |
| D-03 | Deal stage changes are writable based on `leads:write`; there is no visible stage rule, required-field validation or approval policy for sensitive moves (`app/(app)/deals/page.tsx:40-76`). | Mature pipelines can restrict stage editing and enforce required fields. | Users can move deals into approval/won without a guardrail. | Return stage rules, validate transitions and show approval status/policy in the move dialog. | P1 |
| D-04 | Deal detail has event history, but the history API is separate and the page does not show activities, approvals, score signals, forecast confidence or next-best action (`app/(app)/deals/[id]/page.tsx:20-188`). | Deal pages combine history, activities, forecast and associated records. | Sellers lack the context needed to decide the next action. | Add a unified deal timeline, forecast explanation, tasks and linked approvals. | P1 |
| D-05 | Won/lost lifecycle updates are not visibly tied to customer conversion, duplicate checks or re-opening rules in the live route. | Lead → contact → opportunity → won/lost should have explicit lifecycle behavior and audit. | Reporting and customer stage can drift. | Define server transition commands and lifecycle events; support reopen with reason. | P1 |

### F4. Activities, inbox and communication

| ID | Finding | Benchmark | Impact | Fix | Priority |
|---|---|---|---|---|---|
| A-01 | The inbox is a WhatsApp-only implementation: endpoints and types are `/whatsapp/conversations` and `WhatsAppMessage` (`app/(app)/inbox/page.tsx:16-34`). | Janus's CRM brief requires WhatsApp, calls and email in one context. | Phone/email interactions disappear from the daily workflow. | Use a unified conversation interface with channel, delivery, consent and linked record fields; keep WhatsApp as the first adapter. | P0 |
| A-02 | AI reply generation is hard-coded (`lib/services/ai-responder.ts:1-52`) and the composer does not show a grounded draft, sources, confidence, edit history or approval state. | AI-native reply generation must be grounded, editable, explainable and controlled. | Users cannot tell whether a message is a draft, a provider template or an autonomous action. | Add draft objects with source citations, approval policy, edited text, actor and send result. | P0 |
| A-03 | Message records have optional `aiMeta` but no model/prompt version, cost, policy decision, retrieval trace or feedback (`lib/types/index.ts:228-256`). | AI operations need an audit and cost trail. | Debugging and compliance are impossible after a bad message. | Extend message/action trace and link it to audit and usage. | P1 |
| A-04 | Lead detail only links to the inbox; it does not show message excerpts or the specific conversation that produced `lastActivityAt` (`app/(app)/leads/[id]/page.tsx:275-283`). | Activity history should deep-link from the record to the underlying interaction. | Handoffs require searching the inbox manually. | Include conversation ID/source event in timeline and open the exact thread. | P1 |
| A-05 | There is no task/meeting calendar or SLA queue for leads; `DealTask` exists in the mock type but live deal responses omit tasks (`lib/types/index.ts:175-199`, `lib/api/types.ts:82-101`). | Follow-up is a core CRM object, not a note on a deal. | “Who should I call today?” cannot be answered reliably. | Add activities/tasks endpoints, reminders, overdue states and daily next-action queue. | P0 |

### F5. Approvals, automation and AI agents

| ID | Finding | Benchmark | Impact | Fix | Priority |
|---|---|---|---|---|---|
| AI-01 | Approvals are entirely local mock state (`app/(app)/approvals/page.tsx:31-39`, `lib/stores/app-store.ts`), while live WhatsApp sending is a separate path. | Consequential actions need a single approval/execution boundary. | An approval shown in UI does not necessarily block or authorize a real action. | Make approval requests server records linked to action intents; execute only after policy approval. | P0 |
| AI-02 | `business-ai.ts` uses keyword matching and fixed data from mock statistics, and `customer-ai.ts` uses passed mock context. | Natural-language AI needs retrieval, citations, permission filtering and uncertainty. | The UI can be mistaken for a live business copilot. | Label demo mode, then replace with retrieval/tool calls over permission-filtered records and trace every answer. | P0 |
| AI-03 | Agents and evaluations read mock arrays; the agent page can show versions/tools/success rates without a live execution trace (`app/(app)/agents/page.tsx`, `app/(app)/evaluations/page.tsx:11-28`). | AI agents need run history, inputs, tools, approvals, outcomes and evaluation datasets. | Teams cannot verify safety or improve the agent. | Persist agent versions/runs, tool calls, handoffs, policy decisions and evaluation results. | P1 |
| AI-04 | Workflow editor supports business modules, actions and approval nodes, but the CRM emits no proven event-to-run path; run retry/cancel/restore controls are disabled when endpoints are absent (`app/(app)/automations/[id]/page.tsx:372-397`). | Automation must be observable, retryable, permission-aware and idempotent. | The editor looks more complete than the execution system. | Add event contracts, idempotency keys, dry-run output, retries, cancellation and record-linked run history. | P1 |
| AI-05 | Prompt-injection boundaries for inbound WhatsApp/call text are not represented in the UI or service contracts. | Untrusted customer text must never become system instructions or tool authorization. | A malicious message could influence a draft or action. | Separate untrusted content from instructions, redact secrets, require tool policy checks and show blocked tool calls. | P0 |

### F6. Reporting, permissions and data quality

| ID | Finding | Benchmark | Impact | Fix | Priority |
|---|---|---|---|---|---|
| R-01 | `/analytics` is a demo report catalogue/local state (`app/(app)/analytics/page.tsx:71-96`) while `/dashboard` reads live CRM data. | Reports must be derived from the same verified records as the pipeline. | Owners may see conflicting numbers. | Define report queries against canonical API projections and label unavailable departments/data coverage. | P0 |
| R-02 | Audit, usage and evaluations are mock pages, so the UI cannot prove who changed a record, what an AI action cost or whether an answer passed evaluation (`app/(app)/audit/page.tsx:44-58`, `app/(app)/evaluations/page.tsx:11-28`). | Reporting and audit must be append-only, permission-aware and tenant-scoped. | Compliance and customer support investigations stop at the prototype. | Replace mock feeds with server cursors, filters, exports and retention policies. | P1 |
| R-03 | Permission checks are action-level (`leads:write`, `sources:manage`) but the frontend does not apply record/team visibility to mock customers, memory, tickets or AI retrieval. | CRM permissions separate access rights from record visibility. | A user may see data they can’t act on, or AI may retrieve data outside their workspace. | Add object/record/field scope to API reads and pass the same scope to AI tools. | P0 |
| R-04 | Phone formatting is partly handled in the leads table (`phoneParts` in `app/(app)/leads/page.tsx:78-107`) but contacts/type contracts do not enforce E.164 or consent state. | Communications need normalized numbers and explicit opt-out. | Indian numbers with malformed country codes can be misrouted. | Normalize/validate at ingestion, display country code separately, store raw plus canonical value and block opted-out sends. | P0 |
| R-05 | Empty/loading/error states exist on several live routes, but there is no consistent skeleton, retry state or “demo vs connected” status across routes. | Reliable SaaS UX distinguishes unavailable data from empty data. | A disconnected backend looks like a blank CRM or fake zero. | Create shared data-state components with retry, source status and demo labels. | P1 |

## Missing features by priority

### P0 — blocks the first paying customer

- One canonical live customer record with timeline, linked leads/deals/tickets/conversations and memory.
- Server-side lead read model with owner projection, filters, counts and source provenance.
- Real lead timeline and conversation deep links; no synthetic “last activity” placeholder.
- Unified communication object across WhatsApp, phone and email, with consent/opt-out enforcement.
- AI action intent + approval + execution contract for outbound messages and consequential CRM writes.
- Duplicate detection, merge preview, merge audit and customer export/delete flow.
- Workspace/record permission filtering before CRM and AI retrieval.
- Live report queries that agree with dashboard/pipeline numbers.
- Normalized E.164 contact data and source event/audit links.
- Prompt-injection isolation and tool authorization for inbound content.

### P1 — needed in the first three months of paying customers

- Activities/tasks, due dates, SLA timers, overdue queue and daily next-action view.
- Assignment/team projections and reassignment history.
- Explainable lead/deal scoring with model/version and feedback.
- Deal transition rules, lost reasons, reopen and approval requirements.
- Persisted memory with source span, confidence, review/expiry and approval.
- Live agents, workflow run history, retries, cancellation and idempotency.
- Live audit, usage and evaluation feeds with export.
- Saved views, server-side filters, bulk update and export for leads/deals.
- Shared loading/error/demo-state components.

### P2 — required for mid-sized/enterprise customers

- Custom fields and layouts with field-level permissions.
- Multiple pipelines, stage-specific visibility and required fields.
- SSO/SCIM, team hierarchy and delegated administration.
- Data retention, legal holds, regional residency and DPDP request tooling.
- Forecast categories, quota/target history and historical snapshots.
- Model/provider routing, per-tenant budgets and red-team/prompt-injection reports.

### P3 — useful after core reliability

- Mobile-first activity capture, meeting recording and call transcription.
- Advanced territory/round-robin routing, sequences and campaign attribution.
- Custom object builder and marketplace integrations.
- More autonomous agents after approval and evaluation metrics are proven.

## Remove or simplify

1. **Do not present mock operational modules as connected CRM records.** Keep the demo data behind an explicit “Demo data” badge and make connected-state empty screens honest.
2. **Collapse duplicate AI entry points.** “AI Assistant,” “Ask Your Business,” “Agents,” “Memory,” “Knowledge” and “Evaluations” should be contextual surfaces around a lead/customer/deal plus a small administration area, until live execution exists.
3. **Remove untracked browser sends from the primary follow-up path.** Keep `mailto`, `tel` and `sms` as clearly labelled external handoffs; Janus actions must be tracked channel actions.
4. **Avoid two domain contracts.** `lib/types/index.ts` and `lib/api/types.ts` should not independently define Lead, Deal, FieldMapping and source kinds.
5. **Avoid an all-purpose local store in production paths.** `useAppStore` is appropriate for a demo reset, not for live approvals, tickets, memory or AI actions.
6. **Simplify workflow UI until run APIs are complete.** Disabled retry/restore/cancel controls imply functionality that does not exist; show “available after connect” with the exact missing capability instead.

## Top 10 fixes in order

1. **Canonical CRM read model and contract** — `lib/api/types.ts`, `lib/types/index.ts`, backend response schemas, `app/(app)/dashboard/page.tsx`, `app/(app)/leads/page.tsx`.
2. **Live customer record and timeline** — `app/(app)/customers/[id]/page.tsx`, `components/shared/activity-timeline.tsx`, customer/timeline API.
3. **Lead ingestion → identity → timeline event** — `components/lead-sources/*`, ingestion API, `app/(app)/leads/[id]/page.tsx`.
4. **Communication and consent boundary** — `app/(app)/inbox/page.tsx`, `app/(app)/leads/[id]/page.tsx`, WhatsApp/email/call adapters, consent API.
5. **AI draft/action/approval trace** — `lib/services/ai-responder.ts`, `lib/services/customer-ai.ts`, `lib/services/business-ai.ts`, `lib/types/index.ts`, approvals API/UI.
6. **Assignment, tasks and next-action queue** — `lib/types/index.ts`, deal/lead API, `app/(app)/deals/*`, lead detail and a daily-work route.
7. **Deal transition and forecast rules** — `app/(app)/deals/page.tsx`, `app/(app)/deals/[id]/page.tsx`, pipeline API and permissions.
8. **Permission-filtered AI retrieval and record visibility** — `components/auth/session-provider`, API dependencies, customer/memory/knowledge/agent routes.
9. **Verified reports, audit, usage and evaluation feeds** — `app/(app)/analytics/page.tsx`, `app/(app)/audit/page.tsx`, `app/(app)/usage/page.tsx`, `app/(app)/evaluations/page.tsx`.
10. **Data quality and scale UX** — `app/(app)/leads/page.tsx`, customers/deals tables, shared loading/error/empty components, export/merge/DPDP actions.

## Where Janus can beat normal and AI-layered CRMs

1. **WhatsApp-first, India-specific capture with a real consent and cost loop.** Website, WhatsApp, missed calls, Indian call providers, webhooks, REST and CSV can enter one normalized event path. The winning experience is not another omnichannel inbox; it is “which channel should we use next, what will it cost, and did it convert?”
2. **AI work inside the customer record.** A lead can arrive, be qualified from the message/call, have a grounded draft prepared, request approval, schedule a follow-up and update the pipeline while preserving the original evidence.
3. **Owner-friendly business context.** Indian SMBs often operate from WhatsApp, Excel and Tally. Janus can explain pipeline, collections and operational risk in plain language, but only if the answer cites the exact records and clearly says when a workspace is not connected.
4. **Human approval as a product advantage.** Make approvals fast and specific: show the proposed message, policy, source evidence, WhatsApp cost, recipient consent and reversible outcome in one review card.
5. **Outcome-priced, measurable AI.** Clarify and Day.ai demonstrate that customers understand paying for useful work/credits. Janus can report cost per qualified lead, accepted draft, recovered follow-up and won deal in INR, rather than selling an opaque AI seat.

## Validation notes

- The baseline UI audit covered the routes and source files listed above. The implementation pass was checked with `npx tsc --noEmit --incremental false`, `npm run lint`, `git diff --check`, and Python AST parsing of the changed CRM modules.
- The repository already has a real backend foundation for accounts, lead ingestion, WhatsApp and deals, but the frontend CRM surface is only partially migrated to it.
- Any claim that a route is “live” means it calls `useApi`/`api`; it does not mean the complete business workflow is production-certified.
- Any claim marked mock/local is based on the route importing `lib/mock-data` or `useAppStore` and is not a judgment about the visual quality of that screen.

