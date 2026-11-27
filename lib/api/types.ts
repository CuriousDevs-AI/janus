import type { LeadSource } from "@/lib/types";

export interface Me {
  user: {
    id: string;
    name: string;
    email: string;
    email_verified_at: string | null;
    phone: string | null;
    timezone: string;
    language: string;
    avatar_url: string | null;
    bio?: string;
    title?: string;
  };
  tenant: {
    id: string;
    name: string;
    role: string;
    status: string;
    timezone: string;
  };
  role: string;
  permissions: string[];
  tenants: Me["tenant"][];
  crms?: CrmBrief[];
}
export type SourceKind = "embed" | "webhook" | "api_key" | "csv" | "oauth";
export type MappingTarget =
  | "name"
  | "phone"
  | "email"
  | "company"
  | "requirement"
  | "campaign"
  | "recording_url"
  | "recording_reference";
export interface FieldMapping {
  rawField: string;
  mapsTo: MappingTarget;
}
export interface Source {
  id: string;
  name: string;
  description: string;
  connectionKind: SourceKind;
  source:
    "website" | "webhook" | "phone_call" | "api" | "csv_import" | "whatsapp";
  status: "connected" | "available";
  preset: string;
  fieldMapping: FieldMapping[];
  ingestUrl: string;
  webhookUrl: string | null;
  allowedOrigins: string[];
  eventIdField: string | null;
  lastEventAt: string | null;
  capturedLeads: number;
  signingSecret?: string | null;
  callbackUrl?: string | null;
  crmId?: string | null;
  crmName?: string | null;
  healthStatus?: "healthy" | "warning" | "error" | "paused" | "needs_setup" | null;
  lastErrorAt?: string | null;
  errorCount?: number;
}
export interface SourceMetrics {
  activeSources: number;
  pausedSources: number;
  totalLeadsCaptured: number;
  leadsToday: number;
  failedEvents: number;
  sourcesNeedingAttention: number;
}
export interface Preset {
  value: string;
  label: string;
  group: string;
  fieldMapping: FieldMapping[];
  eventIdField: string | null;
  instructions: string;
  documentationUrl: string | null;
}
export interface Lead {
  dealId: string | null;
  id: string;
  crmId?: string;
  customerId: string;
  contactName: string;
  phone: string | null;
  email: string | null;
  company: string;
  whatsappOptIn: boolean;
  doNotContact: boolean;
  consentSource: string | null;
  consentUpdatedAt: string | null;
  source: LeadSource;
  stage: string;
  ownerId: string | null;
  ownerName: string | null;
  requirement: string;
  requirementStatus: "received" | "evaluating" | "available" | "customizing" | "fulfilled";
  campaign: string | null;
  recordingUrl: string | null;
  recordingReference: string | null;
  createdAt: string;
  lastActivityAt: string;
  /** When someone agreed to follow up next, if a date was set. */
  nextFollowUpOn?: string | null;
  lostCategory?: import("@/lib/lost-reasons").LostCategory | null;
  lostReason?: string;
  lostAt?: string | null;
}
export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string;
  whatsappOptIn: boolean;
  doNotContact: boolean;
  consentSource: string | null;
  consentUpdatedAt: string | null;
  paymentTerms: string | null;
  creditLimit: number | null;
  gstin: string | null;
  placeOfSupply: string | null;
  archivedAt: string | null;
}
export interface IngestEvent {
  id: string;
  sourceId: string;
  receivedAt: string;
  status: "pending" | "processed" | "failed";
  result: string | null;
  customerId: string | null;
  leadId: string | null;
  reason: string | null;
  importId: string | null;
  rowNumber: number | null;
}
export interface Import {
  id: string;
  sourceId: string;
  fileName: string;
  totalRows: number;
  pendingRows: number;
  processedRows: number;
  failedRows: number;
  status: string;
  createdAt: string;
  duplicate?: boolean;
}
export interface APIKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  key?: string;
}

export interface WhatsAppConnection {
  id: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhone: string;
  verifiedName: string;
  status: string;
  callbackUrl: string;
  webhookVerifiedAt: string | null;
  verifyToken?: string | null;
}
export interface WhatsAppTemplate {
  name: string;
  language: string;
  body: string;
  header: string;
  footer: string;
  parameterCount: number;
}
export interface WhatsAppConversation {
  id: string;
  contactId: string;
  name: string;
  phone: string | null;
  company: string;
  ownerId: string | null;
  ownerName: string | null;
  status: "open" | "pending" | "resolved" | "closed";
  assignedUserId: string | null;
  assignedUserName: string | null;
  unreadCount: number;
  priority: "normal" | "high" | "urgent";
  lastMessageBody: string | null;
  whatsappOptIn: boolean;
  doNotContact: boolean;
  consentSource: string | null;
  consentUpdatedAt: string | null;
  lastMessageAt: string;
  lastInboundAt: string | null;
  replyWindowEndsAt: string | null;
  tags: ConversationTag[];
}
export interface WhatsAppMessage {
  id: string;
  direction: "inbound" | "outbound";
  kind: string;
  body: string;
  status: string;
  errorCode: string | null;
  createdAt: string;
}
export interface ConversationNote {
  id: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
}
export interface ConversationTag {
  id: string;
  name: string;
  color: string;
}
export interface QuickReply {
  id: string;
  title: string;
  body: string;
  shared: boolean;
  createdAt: string;
}

export interface Deal {
  id: string;
  crmId?: string;
  leadId: string;
  customerId: string;
  customerName: string;
  company: string;
  phone: string | null;
  ownerId: string | null;
  ownerName: string | null;
  name: string;
  amount: string;
  stage: import("@/lib/types").DealStage;
  expectedCloseAt: string | null;
  lostCategory?: import("@/lib/lost-reasons").LostCategory | null;
  lostReason: string;
  lostAt?: string | null;
  requirement: string;
  requirementStatus: RequirementStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface DealEvent {
  id: string;
  action: string;
  userId: string | null;
  userName: string | null;
  details: Record<string, string | number | boolean>;
  createdAt: string;
}

export interface LeadEvent {
  id: string;
  action: string;
  userId: string | null;
  userName: string | null;
  details: Record<string, string | number | boolean>;
  createdAt: string;
}

export type ActivityKind = "call" | "meeting" | "email" | "task" | "note";
export interface Activity {
  id: string;
  kind: ActivityKind;
  subject: string;
  description: string;
  leadId: string | null;
  leadName: string | null;
  dealId: string | null;
  contactId: string;
  contactName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  dueAt: string | null;
  completedAt: string | null;
  outcome: string | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface CrmTag {
  id: string;
  name: string;
  color: string;
}

export interface CrmProduct {
  id: string;
  name: string;
  sku: string | null;
  description: string;
  unitPrice: string;
  taxPct: string;
  unit: string;
  active: boolean;
  createdAt: string;
}

export interface DealItem {
  id: string;
  productId: string | null;
  productName: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  createdAt: string;
}

export interface CrmQuote {
  id: string;
  dealId: string;
  number: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  validUntil: string | null;
  notes: string;
  total: string;
  createdBy: string | null;
  createdAt: string;
  items: QuoteItem[];
}

export interface QuoteItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxPct: string;
  lineTotal: string;
}

export interface Ticket {
  id: string;
  number: string;
  subject: string;
  priority: import("@/lib/types").TicketPriority;
  status: import("@/lib/types").TicketStatus;
  assignee: string | null;
  resolution: string | null;
  openedBy: string | null;
  raisedOn: string;
  description: string;
  contactId: string | null;
  contactName: string | null;
  createdAt: string;
}

export interface LeadDetail {
  lead: Lead;
  deal: Deal | null;
  notes: LeadNote[];
  activities: Activity[];
  tags: CrmTag[];
}

export interface LeadNote {
  id: string;
  body: string;
  author: string | null;
  nextFollowUpOn: string | null;
  createdAt: string;
}

export interface CustomerNote {
  id: string;
  body: string;
  author: string | null;
  createdAt: string;
}

export type RequirementStatus = "received" | "evaluating" | "available" | "customizing" | "fulfilled";

export type FeedbackStatus = "received" | "reviewing" | "responded" | "closed";
export type IssueStatus = "reported" | "assigned" | "working" | "fixed" | "closed";

export interface ContactEntry {
  id: string;
  contactId: string;
  entryType: "feedback" | "issue";
  subject: string;
  body: string;
  status: string;
  priority: "low" | "normal" | "high" | "urgent";
  assignedTo: string | null;
  createdBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ContactLeadSummary {
  id: string;
  crmId?: string;
  stage: string;
  source: string;
  requirement: string;
  requirementStatus: RequirementStatus;
  createdAt: string;
  dealId: string | null;
  dealName: string | null;
  dealAmount: string | null;
  dealStage: string | null;
}

export interface LeadNoteWithLead {
  id: string;
  leadId: string;
  body: string;
  author: string | null;
  nextFollowUpOn: string | null;
  createdAt: string;
}

export interface ContactDetail {
  contact: Contact;
  leads: ContactLeadSummary[];
  notes: CustomerNote[];
  activities: Activity[];
  leadNotes: LeadNoteWithLead[];
  tags: CrmTag[];
  totalDealValue: string;
  openDealValue: string;
}

export interface CustomerAccount {
  full: boolean;
  invoices: number;
  overdueInvoices: number;
  oldestOverdueDays: number;
  invoiced: string | null;
  paid: string | null;
  credited: string | null;
  due: string | null;
  overdue: string | null;
  lastInvoiceOn: string | null;
}

export interface DashboardStats {
  totalLeads: number;
  newLeadsToday: number;
  newLeadsWeek: number;
  openDeals: number;
  pipelineValue: string;
  wonValue: string;
  wonDeals: number;
  lostDeals: number;
  conversionRate: string;
  avgCycleDays: string | null;
}

export interface FunnelData {
  stage: string;
  count: number;
  value: string;
}

export interface RepData {
  ownerId: string | null;
  name: string;
  leads: number;
  wonDeals: number;
  wonValue: string;
  openLeads: number;
  conversionRate: string;
}

export interface SourceBreakdown {
  source: string;
  leads: number;
  won: number;
  wonValue: string;
  conversionRate: string;
}

export interface DailyPoint {
  date: string;
  leads: number;
  wonDeals: number;
  wonValue: string;
}

export interface CustomerListRow {
  contactId: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string;
  leadCount: number;
  dealCount: number;
  dealValue: string;
  dealStage: string | null;
  stage: string;
  ownerId: string | null;
  ownerName: string | null;
  lastActivityAt: string | null;
  nextFollowUpOn: string | null;
  source: string | null;
  tags: CrmTag[];
}

export interface LeadScore {
  leadId: string;
  score: number;
  scoreFactors: Record<string, number>;
  calculatedAt: string;
}

export interface SalesTarget {
  id: string;
  ownerId: string | null;
  ownerName?: string;
  period: string;
  targetAmount: string;
}

export interface ForecastData {
  period: string;
  targetAmount: string;
  wonToDate: string;
  weightedPipeline: string;
  gap: string;
  stageBreakdown: Array<{
    stage: string;
    count: number;
    value: string;
    weight: number;
    weightedValue: string;
  }>;
}

export interface RepAttainment {
  ownerId: string;
  name: string;
  target: string;
  won: string;
  pipeline: string;
  attainmentPercent: string;
}

export interface CustomFieldDef {
  id: string;
  entityType: string;
  fieldName: string;
  fieldType: string;
  fieldOptions: unknown;
  required: boolean;
  sortOrder: number;
  active: boolean;
}

export interface CustomFieldValue {
  fieldDefId: string;
  fieldName: string;
  fieldType: string;
  valueText: string | null;
  valueNumber: string | null;
  valueDate: string | null;
}

export interface CrmAttachment {
  id: string;
  entityType: string;
  entityId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  variables: string[];
  category: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSequence {
  id: string;
  name: string;
  description: string | null;
  steps: Array<{ templateId: string; delayDays: number; delayHours: number }>;
  active: boolean;
}

export interface WebForm {
  id: string;
  name: string;
  slug: string;
  fieldsConfig: Record<string, boolean>;
  redirectUrl: string | null;
  notifyEmail: string | null;
  active: boolean;
  submissionCount: number;
}

export interface CrmBrief {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  role: string | null;
}

export interface CrmWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  pipelineStages: import("@/lib/hooks/use-pipeline-config").PipelineStage[];
  winStage: string;
  isDefault: boolean;
  active: boolean;
  memberCount?: number;
  leadCount?: number;
  dealCount?: number;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  user_id: string;
  name: string;
  role: string;
  status: string;
}

export interface CrmMember {
  id: string;
  crmId: string;
  membershipId: string;
  memberName: string | null;
  role: string;
  createdAt: string;
}

export interface DuplicateEntity {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  leadCount: number;
}

export interface JourneyEvent {
  id: string;
  action: string;
  title: string;
  detail: string;
  userId: string | null;
  userName: string | null;
  createdAt: string;
}

export interface DuplicateGroup {
  id: string;
  entityType: string;
  matchField: string;
  matchValue: string;
  entityIds: string[];
  entities: DuplicateEntity[];
  status: string;
}
