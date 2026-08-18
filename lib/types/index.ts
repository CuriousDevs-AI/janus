// Core domain types for the Janus (CuriousDevs) customer operations platform.
// This is the shared contract between mock-data, stores, and every UI module.

export type ID = string;

// ---------------------------------------------------------------------------
// Tenant / Auth / RBAC
// ---------------------------------------------------------------------------

export type Role =
  | "owner"
  | "admin"
  | "sales_manager"
  | "sales_agent"
  | "support_agent"
  | "finance"
  | "analyst"
  | "read_only";

export interface Tenant {
  id: ID;
  name: string;
  industry: string;
  companySize: string;
  timezone: string;
  businessHours: { start: string; end: string };
  defaultChannel: ChannelType;
  plan: "starter" | "growth" | "enterprise";
  environment: "live" | "demo";
}

export interface User {
  id: ID;
  name: string;
  email: string;
  role: Role;
  title?: string;
  avatarColor: string;
  online?: boolean;
}

// ---------------------------------------------------------------------------
// Identity / Company / Customer
// ---------------------------------------------------------------------------

export interface Company {
  id: ID;
  name: string;
  domain: string;
  industry: string;
  size: string;
  location: string;
  logoLetter: string;
}

export type ConsentChannel = "email" | "whatsapp" | "sms" | "call";

export interface Consent {
  preferredChannel: ChannelType;
  marketing: boolean;
  transactional: boolean;
  optedOut: ConsentChannel[];
}

export type HealthCategory =
  | "healthy"
  | "at_risk"
  | "high_risk"
  | "inactive"
  | "expansion";

export interface CustomerHealth {
  score: number; // 0-100
  category: HealthCategory;
  engagement: number;
  supportLoad: number;
  usage: number;
  paymentHealth: number;
  sentiment: "positive" | "stable" | "negative";
  trend: "up" | "down" | "flat";
  churnRisk: number; // 0-100
  upsellSignal: boolean;
}

/**
 * The unified Person/Customer identity — the thread that connects
 * lead -> deal -> communication -> support -> retention across the app.
 */
export interface Customer {
  id: ID;
  name: string;
  email: string;
  phone: string;
  title?: string;
  companyId: ID;
  avatarColor: string;
  ownerId: ID;
  stage: "lead" | "qualified" | "opportunity" | "customer" | "lost";
  source: LeadSource;
  campaign?: string;
  firstTouchAt: string;
  consent: Consent;
  health: CustomerHealth;
  tags: string[];
  externalIds?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Lead
// ---------------------------------------------------------------------------

export type LeadSource =
  | "website"
  | "email"
  | "whatsapp"
  | "facebook"
  | "instagram"
  | "meta_ads"
  | "google_ads"
  | "linkedin"
  | "referral"
  | "webhook"
  | "api"
  | "csv_import";

export type LeadStage =
  | "new"
  | "contacted"
  | "qualified"
  | "demo"
  | "proposal"
  | "negotiation"
  | "approval"
  | "won"
  | "lost";

export interface ScoreReason {
  label: string;
  signal: "positive" | "negative" | "neutral";
}

export interface Lead {
  id: ID;
  customerId: ID;
  source: LeadSource;
  campaign?: string;
  stage: LeadStage;
  score: number;
  scoreReasons: ScoreReason[];
  ownerId: ID;
  createdAt: string;
  lastActivityAt: string;
  intent: "high" | "medium" | "low";
  budgetSignal: "known" | "unknown" | "constrained";
  decisionMaker?: string;
  requirement: string;
  dealId?: ID;
}

// ---------------------------------------------------------------------------
// Deal / Pipeline
// ---------------------------------------------------------------------------

export type DealStage =
  | "new"
  | "qualified"
  | "demo"
  | "proposal"
  | "negotiation"
  | "approval"
  | "won"
  | "lost";

export interface DealTask {
  id: ID;
  title: string;
  done: boolean;
  dueAt?: string;
}

export interface Deal {
  id: ID;
  name: string;
  customerId: ID;
  ownerId: ID;
  stage: DealStage;
  amount: number;
  probability: number;
  expectedCloseAt: string;
  createdAt: string;
  lastActivityAt: string;
  lostReason?: string;
  tasks: DealTask[];
  nextAction?: string;
}

// ---------------------------------------------------------------------------
// Communication: Conversations / Messages
// ---------------------------------------------------------------------------

export type ChannelType =
  | "website_chat"
  | "email"
  | "whatsapp"
  | "call"
  | "meeting"
  | "internal_note";

export type ConversationCategory = "sales" | "support" | "general";

export interface Conversation {
  id: ID;
  customerId: ID;
  channel: ChannelType;
  category: ConversationCategory;
  subject?: string;
  unreadCount: number;
  priority: "low" | "normal" | "high" | "urgent";
  lastMessageAt: string;
  lastMessagePreview: string;
  assignedToId?: ID;
  aiActive: boolean;
  status: "active" | "waiting" | "resolved";
  externalThreadId: string;
}

export type MessageSender =
  | { type: "customer"; customerId: ID }
  | { type: "ai"; agentId: ID }
  | { type: "human"; userId: ID }
  | { type: "system" };

export interface Message {
  id: ID;
  conversationId: ID;
  channel: ChannelType;
  sender: MessageSender;
  direction: "inbound" | "outbound";
  content: string;
  createdAt: string;
  attachments?: { name: string; size: string }[];
  aiMeta?: {
    confidence?: number;
    toolCalls?: string[];
    knowledgeUsed?: string[];
  };
  systemMeta?: {
    kind: "meeting_scheduled" | "deal_updated" | "ticket_created" | "note";
    label: string;
  };
  externalMessageId: string;
}

// ---------------------------------------------------------------------------
// Activity Timeline
// ---------------------------------------------------------------------------

export type ActivityType =
  | "lead_created"
  | "identity_resolved"
  | "ai_qualified"
  | "message"
  | "stage_changed"
  | "deal_created"
  | "proposal_sent"
  | "approval_requested"
  | "approval_decided"
  | "meeting_scheduled"
  | "deal_won"
  | "deal_lost"
  | "customer_created"
  | "onboarding_started"
  | "ticket_created"
  | "ticket_escalated"
  | "ticket_resolved"
  | "ai_action"
  | "human_action"
  | "automation_run"
  | "note_added"
  | "health_changed";

export type ActivityActor =
  | { type: "ai"; agentId: ID; agentName: string }
  | { type: "human"; userId: ID; userName: string }
  | { type: "system" }
  | { type: "customer" };

export interface Activity {
  id: ID;
  customerId: ID;
  type: ActivityType;
  actor: ActivityActor;
  title: string;
  description?: string;
  createdAt: string;
  relatedId?: ID;
  relatedKind?: "lead" | "deal" | "ticket" | "conversation" | "approval";
  meta?: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Support / Tickets
// ---------------------------------------------------------------------------

export type TicketStatus =
  | "open"
  | "ai_handling"
  | "waiting_customer"
  | "escalated"
  | "in_progress"
  | "resolved"
  | "closed";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface TicketAction {
  id: ID;
  actor: ActivityActor;
  label: string;
  createdAt: string;
}

export interface Ticket {
  id: ID;
  number: string;
  customerId: ID;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  assigneeId?: ID;
  aiConfidence?: number;
  knowledgeUsed: string[];
  actions: TicketAction[];
  slaMinutesRemaining: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedReason?: string;
  conversationId: ID;
  handoff?: {
    requestedAt: string;
    reason: string;
    summary: string;
    previousActions: string[];
    suggestedNextAction: string;
    takenOverBy?: ID;
    takenOverAt?: string;
  };
}

// ---------------------------------------------------------------------------
// Knowledge / RAG
// ---------------------------------------------------------------------------

export type KnowledgeSourceType = "pdf" | "docx" | "faq" | "url" | "policy";

export interface KnowledgeVersion {
  version: number;
  updatedAt: string;
  updatedBy: string;
  changeSummary: string;
}

export interface KnowledgeDocument {
  id: ID;
  title: string;
  type: KnowledgeSourceType;
  category: "product" | "pricing" | "policy" | "faq" | "support";
  status: "published" | "draft" | "processing" | "archived";
  version: number;
  chunkCount: number;
  usedByAgentIds: ID[];
  updatedAt: string;
  createdAt: string;
  sizeLabel: string;
  retrievalCount30d: number;
  versions: KnowledgeVersion[];
  excerpt: string;
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export type MemoryKind = "stable_fact" | "derived_insight" | "conversation" | "support";

export interface MemoryItem {
  id: ID;
  customerId: ID;
  kind: MemoryKind;
  label: string;
  value: string;
  confidence?: number;
  source: string;
  createdAt: string;
  status: "approved" | "pending" | "rejected";
}

// ---------------------------------------------------------------------------
// AI Agents / Tools
// ---------------------------------------------------------------------------

export type AgentType = "sales" | "support" | "qualification" | "analyst";

export interface AgentToolPermission {
  name: string;
  allowed: boolean;
  requiresApproval: boolean;
}

export interface AgentVersion {
  version: string;
  deployedAt: string;
  changeSummary: string;
  status: "current" | "previous" | "archived";
}

export interface Agent {
  id: ID;
  name: string;
  type: AgentType;
  status: "active" | "paused" | "training";
  model: string;
  version: string;
  purpose: string;
  instructions: string;
  knowledgeDocIds: ID[];
  tools: AgentToolPermission[];
  channels: ChannelType[];
  successRate: number;
  conversationsHandled: number;
  escalationRate: number;
  temperature: number;
  versions: AgentVersion[];
}

// ---------------------------------------------------------------------------
// Automation / Workflows
// ---------------------------------------------------------------------------

export type AutomationTriggerKind =
  | "new_lead"
  | "proposal_sent"
  | "deal_won"
  | "ticket_sla_breach"
  | "customer_at_risk"
  | "human_request"
  | "ticket_created";

export interface AutomationRun {
  id: ID;
  automationId: ID;
  customerId: ID;
  startedAt: string;
  status: "success" | "failed" | "running" | "waiting";
  currentStep: string;
  log: { step: string; at: string; result: "ok" | "failed" | "waiting" }[];
}

export interface Automation {
  id: ID;
  name: string;
  description: string;
  trigger: AutomationTriggerKind;
  status: "active" | "disabled" | "draft";
  runs30d: number;
  successRate: number;
  lastRunAt?: string;
  createdAt: string;
  nodes: WorkflowNodeData[];
}

export type WorkflowNodeKind =
  | "trigger"
  | "condition"
  | "ai_decision"
  | "action"
  | "wait"
  | "branch";

export interface WorkflowNodeData {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  detail?: string;
  x: number;
  y: number;
  branchLabels?: string[];
}

export interface WorkflowEdgeData {
  id: string;
  source: string;
  target: string;
  label?: string;
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export type ApprovalRisk = "low" | "medium" | "high";

export interface Approval {
  id: ID;
  customerId: ID;
  actionLabel: string;
  actionKind:
    | "discount"
    | "refund"
    | "contract_action"
    | "sensitive_message"
    | "deal_stage"
    | "deletion";
  risk: ApprovalRisk;
  requestedById: ID;
  requestedByType: "ai" | "human";
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  decidedById?: ID;
  decidedAt?: string;
  reasoning: string;
  policy: string;
  relatedDealId?: ID;
  relatedConversationId?: ID;
  amount?: number;
  expectedImpact: string;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationCategory =
  | "sales"
  | "support"
  | "ai"
  | "automation"
  | "system";

export interface AppNotification {
  id: ID;
  category: NotificationCategory;
  title: string;
  description: string;
  createdAt: string;
  read: boolean;
  href?: string;
  priority: "normal" | "high";
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditEvent {
  id: ID;
  at: string;
  actor: ActivityActor;
  action: string; // e.g. "send_email", "approve_discount"
  customerId?: ID;
  objectLabel: string;
  objectKind: "lead" | "deal" | "ticket" | "conversation" | "approval" | "knowledge" | "agent";
  result: "success" | "failed" | "denied";
  reason?: string;
  policy?: string;
  approvalRequired: boolean;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface EvaluationRun {
  id: ID;
  agentId: ID;
  runAt: string;
  datasetName: string;
  accuracy: number;
  groundedness: number;
  toolSuccess: number;
  escalationQuality: number;
  policyCompliance: number;
  verdict: "pass" | "regression" | "warning";
  comparedToVersion?: string;
}

// ---------------------------------------------------------------------------
// Usage / Cost
// ---------------------------------------------------------------------------

export interface UsageRecord {
  id: ID;
  date: string;
  tenantId: ID;
  agentId?: ID;
  model: string;
  category: "llm" | "embedding" | "voice" | "whatsapp" | "email";
  cost: number;
  units: number;
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export interface Integration {
  id: ID;
  name: string;
  category: "communication" | "crm" | "calendar" | "commerce" | "productivity" | "helpdesk" | "developer";
  description: string;
  status: "connected" | "available" | "error";
  connectedAccount?: string;
  lastSyncAt?: string;
  eventsSynced?: number;
  errorMessage?: string;
  /** For helpdesk/CRM sync tools: which way tickets/records flow. */
  syncDirection?: "import" | "two_way";
  fieldMapping?: FieldMapping[];
  /** For the platform REST API: masked scoped key shown with copy/regenerate. */
  apiKeyMasked?: string;
}

// ---------------------------------------------------------------------------
// Lead Sources & Ingestion
//
// SOURCE -> CONNECTOR/WEBHOOK -> RAW EVENT -> NORMALIZE -> IDENTITY/DEDUP -> PROFILE -> TIMELINE
//
// This is distinct from `Integration` (generic third-party app connections
// like Slack/Stripe/HubSpot): a LeadSourceConnection is specifically the
// *entry point* a business configures so that leads/contacts from that
// channel flow into Janus in the first place.
// ---------------------------------------------------------------------------

export type LeadSourceConnectionKind = "embed" | "webhook" | "oauth" | "api_key" | "manual" | "csv";

export interface FieldMapping {
  rawField: string;
  mapsTo: string;
}

export interface LeadSourceConnection {
  id: ID;
  source: LeadSource;
  name: string;
  description: string;
  connectionKind: LeadSourceConnectionKind;
  status: "connected" | "available" | "error";
  connectedAccount?: string;
  webhookUrl?: string;
  signingSecret?: string;
  apiKeyMasked?: string;
  embedSnippet?: string;
  fieldMapping?: FieldMapping[];
  leadsCaptured30d: number;
  lastEventAt?: string;
  errorMessage?: string;
}

export type IngestionResult = "new_profile" | "merged" | "duplicate_ignored" | "failed";

export interface IngestionEvent {
  id: ID;
  sourceId: ID;
  source: LeadSource;
  receivedAt: string;
  rawPreview: string;
  result: IngestionResult;
  customerId?: ID;
  leadId?: ID;
  reason: string;
}

// ---------------------------------------------------------------------------
// Analytics helper shapes
// ---------------------------------------------------------------------------

export interface FunnelStage {
  stage: string;
  count: number;
  value?: number;
  conversion?: number;
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
  label?: string;
}
