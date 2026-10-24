# AI-native CRM research

**Research date:** 22 October 2026  
**Product lens:** Janus is intended for Indian SMBs that work across WhatsApp, phone, email, web forms and spreadsheets. The question is not whether Janus can add a chat box to a CRM. The question is whether routine revenue operations happen in the record, with clear human control over consequential actions.

## What mature CRM products establish as the baseline

The baseline is a connected operating model rather than a contact table:

| Capability | What the market treats as table stakes | Evidence |
|---|---|---|
| Lead capture and conversion | Capture leads from forms/imports/connected channels, configure fields and assignment, and map fields into contact/account/opportunity records when a lead converts. | [Salesforce lead management](https://help.salesforce.com/s/articleView?id=customize_leadmgmt.htm&language=en_US&type=5) describes lead fields, assignment rules, lead capture and mapping fields through conversion. [Salesforce Trailhead](https://trailhead.salesforce.com/content/learn/modules/leads-opportunities_lightning_experience/create-and-convert-leads-lightning) places interactions, campaign history and activities on the lead workspace. |
| Distinct lead, contact and opportunity lifecycle | An unverified lead is worked until it is qualified; a verified opportunity enters a pipeline; won/lost status, conversion and history remain visible. Pipedrive explicitly separates unverified leads from deals in the pipeline. | [Pipedrive: when should a lead become a deal?](https://support.pipedrive.com/en/article/when-should-a-lead-become-a-deal) |
| Record timeline | A record page contains a chronological, filterable history of messages, calls, meetings, notes, form submissions and stage changes. | [HubSpot record page](https://knowledge.hubspot.com/records/work-with-records?tab=content) documents the activity timeline, date/owner/property filters, search, editing, pinning, history and deletion. |
| Access and visibility | Permissions answer both “what may this person do?” and “which records may this person see?” Visibility can be owner, team or all; pipelines and stages can also be restricted. | [HubSpot record access](https://knowledge.hubspot.com/records/assign-access-to-records?hubs-post-cta=fr-blog-plain&swcfpc=1), [Pipedrive permission and visibility model](https://support.pipedrive.com/en/article/visibility-and-permissions-overview?category=account-settings), and [Pipedrive pipeline visibility](https://support.pipedrive.com/en/article/pipeline-visibility?category=account-settings). |
| Activities and follow-up | Tasks, meetings, calls, reminders, due dates, owner assignment and overdue handling are part of daily selling. | [HubSpot record activities](https://knowledge.hubspot.com/records/work-with-records?tab=content) and [Pipedrive plan capabilities](https://support.pipedrive.com/en/article/what-features-does-pipedrive-have) list activity management, reminders, calendar and automatic call logging. |
| Reporting | Pipeline, history, lead source, rep, activity and forecast views must be filterable by people with reporting permission and exportable. | [Salesforce lead reports](https://help.salesforce.com/s/articleView?id=reports_lead.htm&language=en_US&type=5) covers lead history, ownership filters and export; [Salesforce activity reports](https://help.salesforce.com/s/articleView?id=sf.reports_activity.htm&language=en_US&type=5) covers activity reporting and permissions. |
| Automation | Rules can assign records, create tasks, enroll records, notify people and pause on missing permissions or blocked consent. | [Pipedrive automated campaigns](https://support.pipedrive.com/en/article/automated-campaigns?category=recursos) documents permission, consent, visibility and automation requirements. |

These are benchmarks for Janus even when a particular feature is deliberately deferred. A small-business product can have fewer controls, but it should make the boundary explicit rather than imply that a demo control is live.

## What current AI layers actually do

### Incumbents adding AI to an existing CRM

| Product | Verified behavior | Automatic vs human-controlled | Pricing signal |
|---|---|---|---|
| Salesforce Einstein / Agentforce | Einstein Lead Scoring learns from historical conversion patterns, scores current leads and exposes the fields that influenced a score. Salesforce also lists summaries, sales emails, activity capture, opportunity insights, forecasting and Agentforce agents in its AI platform. | Scoring and capture can run automatically; sending, field writes and agent actions remain governed by Salesforce permissions, flows and approval configuration. The lead-score documentation is explicit about explanation through influencing fields. | Lead scoring is edition/add-on gated. Agentforce is offered through action/credit-based products; [Salesforce Agentforce compliance/product catalogue](https://compliance.salesforce.com/en/services/agentforce-einstein-platform) lists the relevant features. |
| HubSpot Breeze | Breeze can summarize records, generate prospect profiles, research records and run agentic workflow steps. HubSpot record pages show AI summaries, signals and data-quality findings alongside the record timeline. | The assistant can draft or summarize, while agent and workflow access is permissioned. HubSpot recommends limiting agents to the teams that need them; actions that modify records or contact people should be treated as an execution step, not an invisible side effect. | Agent builder, prospecting agent and other projects can require HubSpot Credits and higher plan tiers. See [HubSpot AI setup and permissions](https://knowledge.hubspot.com/ai/set-up-a-hubspot-account-to-adopt-ai-features) and [AI workflow actions](https://knowledge.hubspot.com/workflows/choose-your-workflow-actions-in-agent-hub?curator=MediaREDEF). |
| Zoho Zia | Zia provides predictions, recommendations, anomaly detection, field prediction, conversational answers and data enrichment. Zoho describes prediction and recommendation builders as configurable tools rather than a generic chatbot. | Predictions and alerts can be automatic; configuration and high-impact workflow actions are administrator-controlled. | Availability varies by CRM edition and add-ons. See [Zia overview](https://help.zoho.com/portal/en/kb/crm/zia/artificial-intelligence/zia/articles/zia-overview) and [Zoho CRM AI](https://www.zoho.com/crm/zia/?src=zia-voice). |
| Freshsales Freddy | Freddy generates contact/account summaries from fields, recent email sentiment, notes and associated deals; activity-based scoring uses sales activity, marketing engagement, attributes and opt-out signals; deal insights classify deals such as likely to close, trending, at risk and gone cold, show a score trend, top signal and next best action. | Summaries can be saved as notes and corrected with feedback. Scores are suggestions; a seller still takes the action. Freddy excludes out-of-office messages from scoring and workflow triggers. | Features are plan/add-on dependent. See [Freddy summaries](https://crmsupport.freshworks.com/support/solutions/articles/50000010085-how-to-use-freddy-powered-summaries-in-freshsales-), [contact scoring](https://crmsupport.freshworks.com/support/solutions/articles/50000002580-what-is-predictive-contact-scoring-how-does-it-work-), [deal insights](https://crmsupport.freshworks.com/support/solutions/articles/50000002393-what-are-freddy-deal-insights-and-how-to-use-them-) and [Freddy AI Trust](https://crmsupport.freshworks.com/support/solutions/articles/50000010359-overview-of-freddy-ai-for-ticketing). |

### AI-first products

| Product | What is structurally different | Pricing / implication |
|---|---|---|
| Attio | Contact sync, automatic enrichment, communication intelligence, auto-labeling, auto-summaries, workflows, sequences, call intelligence, AI agents and reporting are presented as one data model. Its pricing page exposes permission controls, historical attributes, funnel reports and time comparisons as product primitives. | Attio uses seat and workspace credits. [Attio pricing](https://attio.com/pricing?pass=1) is useful evidence that AI and enrichment have a metered cost that should be visible to customers. |
| Clarify | Clarify says AI is used throughout the product to surface context, draft content and keep the CRM current without replacing judgment. Its help centre distinguishes automatic behavior from user actions and describes credit costs for AI features. | Unlimited seats with credits for meeting prep, summaries, deal updates and follow-ups. See [Clarify AI behavior](https://docs.clarify.ai/en/articles/12405071-ai-in-clarify) and [Clarify pricing](https://www.clarify.ai/pricing). |
| Day.ai | Day.ai ingests Gmail, calendar and meetings into shared customer memory; agents can catch action items, draft follow-ups, manage pipeline, create reports and run skills on schedules/events. | Pricing is based on agent capability and automated skill slots rather than only human seats. See [Day.ai pricing](https://day.ai/pricing). |
| Folk | Folk combines pipeline, contact enrichment, AI assistants, AI fields, email/calendar/WhatsApp sync and interaction history; higher tiers add roles, dashboards, API and custom limits. | Seat pricing is combined with credits for enrichment, messages, sync and AI fields. See [Folk pricing](https://www.folk.app/pricing?obref=obinsite). |

The common pattern is not “AI chat.” It is ingestion, context, suggestion, controlled execution and feedback embedded in the object a seller is already using.

## AI-native checklist for Janus

This checklist is derived from the behaviors above and is the standard used in the audit.

1. **Passive capture:** messages, calls, forms, imports and connected activity create or update records without re-keying.
2. **Identity resolution:** the same person and company are deduplicated across channels, with a visible merge history.
3. **Contextual record:** every record can show the complete timeline, current deal, support status, consent and relevant memory.
4. **Structured extraction:** AI extracts intent, requirements, budget, decision-maker, urgency and next date into typed fields with provenance.
5. **Grounded generation:** drafts cite the records/knowledge used, show confidence or uncertainty and never invent missing values.
6. **Next-best action:** the system recommends a concrete next action, reason, owner, due time and expected outcome.
7. **Guardrailed execution:** low-risk housekeeping can run automatically; outbound messages, discounts, refunds, deletion and financial actions pause for policy/approval.
8. **Explainable output:** each score, recommendation and draft shows contributing signals, source records, model/prompt version and timestamp.
9. **Correction loop:** a user can accept, edit, reject or correct AI output; that feedback is durable and attributable.
10. **Reversible writes:** AI changes are previewable, versioned and undoable, with an audit trail.
11. **Permission-aware context:** retrieval, memory, tools and cross-workspace answers are restricted before the model sees data.
12. **Persistent scoped memory:** approved facts and derived insights persist per person/company, with source, confidence, owner and expiry/review state.
13. **Conversation-to-workflow bridge:** inbound intent can create tasks, move stages, request approval or start a workflow without losing the originating message.
14. **Operational measurement:** the product measures acceptance, edit rate, resolution, time saved, cost and outcome—not just generations.
15. **Safety and cost controls:** opt-out/consent, prompt-injection boundaries, rate limits, per-channel cost, model fallback and data retention are visible.

## Sources and limitations

The links above are product documentation or official pricing pages where available and were checked on 22 October 2026. Vendor documentation describes the capability and plan boundary; it does not prove the quality of a vendor's model. Claims about products not supported by an official page are marked as unverified in the audit rather than inferred from marketing copy.

