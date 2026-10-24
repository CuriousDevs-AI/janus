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
  campaign: string | null;
  recordingUrl: string | null;
  recordingReference: string | null;
  createdAt: string;
  lastActivityAt: string;
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
  whatsappOptIn: boolean;
  doNotContact: boolean;
  consentSource: string | null;
  consentUpdatedAt: string | null;
  lastMessageAt: string;
  lastInboundAt: string | null;
  replyWindowEndsAt: string | null;
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

export interface Deal {
  id: string;
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
  lostReason: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface DealEvent {
  id: string;
  action: string;
  userId: string | null;
  details: Record<string, string | number | boolean>;
  createdAt: string;
}
