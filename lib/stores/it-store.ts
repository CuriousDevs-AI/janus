"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { workspaceStorage } from "@/lib/stores/workspace-storage";
import { isFirstCompany } from "@/lib/companies";
import { scoped } from "@/lib/company";
import { addDays } from "@/lib/stores/projects-store";
import { demoMode } from "@/lib/demo-mode";
import { withoutDemoRecords } from "@/lib/stores/server-owned";
import { todayIso } from "@/lib/today";

/**
 * IT & Infrastructure: asset register, helpdesk, access management, software licences,
 * monitoring, incidents, change management, knowledge base, vendor contracts, network
 * inventory, onboarding checklists and IT policies. Each company keeps its own records.
 */

export const TODAY = todayIso();
export const ASSET_KINDS = ["Laptop", "Desktop", "Phone", "Monitor", "Printer", "Other"] as const;
export const ACCESS_LEVELS = ["view", "edit", "admin"] as const;
export const HELPDESK_CATEGORIES = ["Laptop or phone", "Access", "Software", "Network or printer", "Other"] as const;
export const HELPDESK_PRIORITIES = ["low", "medium", "high"] as const;
export const KB_CATEGORIES = ["Getting Started", "Hardware", "Software", "Network", "Security", "Other"] as const;
export const ONBOARDING_ITEMS = ["Laptop ready", "Email account created", "Access to core systems", "Software installed", "Welcome orientation", "ID card issued", "Biometric enrolled"] as const;
export const ASSET_LOCATIONS = ["Head office", "Warehouse", "Branch office", "Remote / WFH", "Other"] as const;
export const CUSTOM_FIELD_TYPES = ["text", "dropdown", "checkbox", "date", "number"] as const;

export interface CustomField { id: string; label: string; type: (typeof CUSTOM_FIELD_TYPES)[number]; required: boolean; options: string[]; categories: (typeof HELPDESK_CATEGORIES)[number][]; visibleToRequester: boolean }

export interface Asset { id: string; name: string; kind: (typeof ASSET_KINDS)[number]; serial: string; purchaseDate: string; cost: number; status: "in stock" | "assigned" | "retired"; assignedTo: string | null; warrantyExpiry: string | null; amcVendor: string | null; amcExpiry: string | null; maintenanceLog: { date: string; note: string; by: string }[]; location: string }
export interface AccessGrant { id: string; system: string; person: string; level: (typeof ACCESS_LEVELS)[number]; status: "active" | "removed"; grantedBy: string; removedBy?: string }
export interface Licence { id: string; name: string; vendor: string; seats: number; assigned: string[]; annualCost: number; renewal: string }
/** An IT request from a person in the company. Raised by the requester, worked by the IT assignee. */
export interface HelpdeskTicket {
  id: string; number: string; requester: string; category: (typeof HELPDESK_CATEGORIES)[number]; priority: (typeof HELPDESK_PRIORITIES)[number];
  subject: string; status: "open" | "in progress" | "resolved"; assignee: string | null; raisedOn: string;
  /** Service time: the day the request should be resolved by, set from its priority. */
  dueOn: string;
  /** For an Access request: the system and the level wanted. Resolving it grants the access. */
  system?: string; level?: AccessGrant["level"];
  comments: { id: string; text: string; by: string; at: string; internal: boolean }[];
  description: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  satisfaction: number | null;
  escalatedTo: string | null;
  customValues: Record<string, string | boolean>;
}
/** Days to resolve a request, by priority. */
export const HELPDESK_DUE_DAYS: Record<HelpdeskTicket["priority"], number> = { high: 0, medium: 1, low: 3 };
/** An IT incident: something that is down or wrong, with severity, a timeline of updates, and the asset it touches if any. */
export interface Incident { id: string; number: string; title: string; severity: "minor" | "major" | "critical"; status: "open" | "investigating" | "resolved"; reportedBy: string; assetId: string | null; raisedOn: string; updates: string[] }
/** A planned change to IT: approved by someone other than the person who asked for it, then carried out. */
export interface ITChange { id: string; number: string; title: string; risk: "low" | "medium" | "high"; requestedBy: string; status: "pending" | "approved" | "rejected" | "done"; decidedBy: string | null; raisedOn: string }
/** A system IT keeps an eye on. Each check records its status; a system marked down opens a critical incident. */
export interface Monitor { id: string; name: string; kind: "Server" | "Network" | "Application" | "Website" | "Other"; status: "up" | "degraded" | "down"; lastChecked: string; note: string }
export interface AuditEntry { id: string; at: string; ts?: string; by: string; text: string }

export interface KbArticle { id: string; title: string; category: (typeof KB_CATEGORIES)[number]; body: string; createdBy: string; createdAt: string; views: number }

export interface SoftwareRequest { id: string; number: string; requester: string; software: string; reason: string; status: "pending" | "manager_approved" | "it_approved" | "provisioned" | "rejected"; requestedAt: string; decidedBy: string | null }

export interface ITVendorContract { id: string; vendor: string; type: "AMC" | "SaaS" | "ISP" | "Hardware" | "Other"; contactPerson: string; phone: string; email: string; contractStart: string; contractEnd: string; annualCost: number; notes: string }

export interface NetworkItem { id: string; name: string; type: "Domain" | "SSL" | "IP Range" | "Wi-Fi" | "DNS" | "Other"; value: string; expiry: string | null; notes: string }

export interface OnboardingChecklist { id: string; employeeName: string; joiningDate: string; items: { label: string; done: boolean; doneBy: string | null; doneAt: string | null }[]; createdBy: string }

export interface ITPolicy { id: string; name: string; version: string; effectiveDate: string; body: string; acknowledgedBy: string[] }

export interface Problem { id: string; number: string; title: string; description: string; status: "open" | "root-cause-identified" | "resolved"; incidentIds: string[]; rootCause: string; workaround: string; createdBy: string; createdAt: string }

type SeedKeys = "assets" | "access" | "licences" | "log" | "helpdesk" | "incidents" | "changes" | "monitors" | "offboarded" | "kbArticles" | "softwareRequests" | "vendorContracts" | "networkItems" | "onboardingChecklists" | "itPolicies" | "problems" | "customFields";

interface ITState {
  assets: Asset[];
  access: AccessGrant[];
  licences: Licence[];
  log: AuditEntry[];
  helpdesk: HelpdeskTicket[];
  incidents: Incident[];
  monitors: Monitor[];
  changes: ITChange[];
  offboarded: string[];
  kbArticles: KbArticle[];
  softwareRequests: SoftwareRequest[];
  vendorContracts: ITVendorContract[];
  networkItems: NetworkItem[];
  onboardingChecklists: OnboardingChecklist[];
  itPolicies: ITPolicy[];
  problems: Problem[];
  customFields: CustomField[];
  addCustomField: (input: Omit<CustomField, "id">, by: string) => string | null;
  removeCustomField: (id: string, by: string) => string | null;
  updateCustomField: (id: string, fields: Partial<Omit<CustomField, "id">>, by: string) => string | null;
  addMonitor: (input: { name: string; kind: Monitor["kind"] }, by: string) => string | null;
  recordCheck: (id: string, status: Monitor["status"], note: string, by: string) => string | null;
  raiseIncident: (input: { title: string; severity: Incident["severity"]; assetId: string | null }, by: string) => string | null;
  updateIncident: (id: string, status: Incident["status"], note: string, by: string) => string | null;
  requestChange: (input: { title: string; risk: ITChange["risk"] }, by: string) => string | null;
  decideChange: (id: string, approve: boolean, by: string) => string | null;
  completeChange: (id: string, by: string) => string | null;
  raiseTicket: (input: { requester: string; category: HelpdeskTicket["category"]; priority: HelpdeskTicket["priority"]; subject: string; description?: string; system?: string; level?: AccessGrant["level"]; customValues?: Record<string, string | boolean> }, by: string) => string | null;
  resolveTicket: (id: string, by: string) => string | null;
  setTicketStatus: (id: string, status: HelpdeskTicket["status"], by: string) => string | null;
  assignTicket: (id: string, assignee: string, by: string) => string | null;
  addAsset: (input: Omit<Asset, "id" | "status" | "assignedTo" | "maintenanceLog">, by: string) => string | null;
  assignAsset: (id: string, person: string, by: string) => string | null;
  returnAsset: (id: string, by: string) => string | null;
  retireAsset: (id: string, by: string) => string | null;
  grantAccess: (input: { system: string; person: string; level: AccessGrant["level"] }, by: string) => string | null;
  removeAccess: (id: string, by: string) => string | null;
  offboard: (person: string, by: string) => string | null;
  addLicence: (input: Omit<Licence, "id" | "assigned">, by: string) => string | null;
  assignSeat: (licenceId: string, person: string, by: string) => string | null;
  freeSeat: (licenceId: string, person: string, by: string) => string | null;
  addTicketComment: (ticketId: string, text: string, internal: boolean, by: string) => string | null;
  logMaintenance: (assetId: string, note: string, by: string) => string | null;
  addKbArticle: (input: Omit<KbArticle, "id" | "views" | "createdAt">, by: string) => string | null;
  addSoftwareRequest: (input: { requester: string; software: string; reason: string }, by: string) => string | null;
  decideSoftwareRequest: (id: string, approve: boolean, by: string) => string | null;
  provisionSoftwareRequest: (id: string, by: string) => string | null;
  addVendorContract: (input: Omit<ITVendorContract, "id">, by: string) => string | null;
  addNetworkItem: (input: Omit<NetworkItem, "id">, by: string) => string | null;
  removeNetworkItem: (id: string, by: string) => string | null;
  addOnboarding: (input: { employeeName: string; joiningDate: string }, by: string) => string | null;
  toggleOnboardingItem: (checklistId: string, index: number, by: string) => string | null;
  addITPolicy: (input: Omit<ITPolicy, "id" | "acknowledgedBy">, by: string) => string | null;
  acknowledgePolicy: (id: string, person: string) => string | null;
  rateSatisfaction: (ticketId: string, rating: number) => string | null;
  escalateTicket: (ticketId: string, person: string, by: string) => string | null;
  reopenTicket: (ticketId: string, by: string) => string | null;
  addProblem: (input: { title: string; description: string }, by: string) => string | null;
  updateProblem: (id: string, fields: Partial<Pick<Problem, "rootCause" | "workaround" | "status">>, by: string) => string | null;
  linkIncidentToProblem: (problemId: string, incidentId: string, by: string) => string | null;
}

const demoSeed = (): Pick<ITState, SeedKeys> => {
  return {
    assets: [
      { id: "ast-1", name: "Dell Latitude 5440", kind: "Laptop", serial: "DL-5440-2231", purchaseDate: "2025-08-14", cost: 78000, status: "assigned", assignedTo: "Arjun Mehta", warrantyExpiry: "2028-08-14", amcVendor: null, amcExpiry: null, maintenanceLog: [], location: "Head office" },
      { id: "ast-2", name: "Lenovo ThinkPad E14", kind: "Laptop", serial: "TP-E14-7781", purchaseDate: "2025-11-02", cost: 62000, status: "in stock", assignedTo: null, warrantyExpiry: "2028-11-02", amcVendor: null, amcExpiry: null, maintenanceLog: [], location: "Head office" },
      { id: "ast-3", name: "HP LaserJet M111w", kind: "Printer", serial: "HP-M111-0093", purchaseDate: "2024-06-20", cost: 14500, status: "assigned", assignedTo: "Karan Bhatt", warrantyExpiry: "2025-06-20", amcVendor: "HP India Care", amcExpiry: "2027-06-20", maintenanceLog: [{ date: "2026-09-10", note: "Toner replaced", by: "Karan Bhatt" }], location: "Warehouse" },
    ],
    access: [
      { id: "acc-1", system: "Tally Prime", person: "Aman Verma", level: "admin", status: "active", grantedBy: "Pankaj Neema" },
      { id: "acc-2", system: "Zoho CRM", person: "Meera Singh", level: "edit", status: "active", grantedBy: "Pankaj Neema" },
      { id: "acc-3", system: "Biometric attendance", person: "Karan Bhatt", level: "view", status: "active", grantedBy: "Shaista Khan" },
    ],
    licences: [
      { id: "lic-1", name: "Microsoft 365 Business", vendor: "Microsoft", seats: 25, assigned: ["Pankaj Neema", "Arjun Mehta", "Meera Singh", "Riya Kapoor", "Karan Bhatt", "Aman Verma"], annualCost: 150000, renewal: "2026-11-20" },
      { id: "lic-2", name: "Tally Prime", vendor: "Tally Solutions", seats: 2, assigned: ["Aman Verma"], annualCost: 22500, renewal: "2027-03-31" },
    ],
    log: [],
    monitors: [
      { id: "mon-1", name: "Head office network", kind: "Network", status: "up", lastChecked: "2026-10-23", note: "" },
      { id: "mon-2", name: "Payroll server", kind: "Server", status: "up", lastChecked: "2026-10-23", note: "" },
    ],
    incidents: [
      { id: "inc-1", number: "INC-1001", title: "Warehouse printer offline", severity: "minor", status: "investigating", reportedBy: "Vikas Jain", assetId: "ast-3", raisedOn: "2026-10-22", updates: ["Printer reported offline; checking the network cable."] },
    ],
    changes: [
      { id: "chg-1", number: "CHG-1001", title: "Move the payroll server to the new backup schedule", risk: "medium", requestedBy: "Aman Verma", status: "pending", decidedBy: null, raisedOn: "2026-10-23" },
    ],
    helpdesk: [
      { id: "hd-1", number: "IT-1001", requester: "Vikas Jain", category: "Network or printer", priority: "medium", subject: "Warehouse printer shows offline", status: "open", assignee: null, raisedOn: "2026-10-22", dueOn: "2026-10-23", comments: [], description: "The HP printer on the warehouse floor is not reachable from any PC. The power light is on but the network light is off. Tried restarting it twice.", firstResponseAt: null, resolvedAt: null, satisfaction: null, escalatedTo: null, customValues: { "cf-1": "Warehouse", "cf-2": "HP LaserJet M111w" } },
    ],
    offboarded: [],
    kbArticles: [
      { id: "kb-1", title: "How to reset your password", category: "Getting Started", body: "Go to Settings → Security → Change Password. Enter your current password, then your new password twice. If locked out, ask IT to send a reset link to your email.", createdBy: "Pankaj Neema", createdAt: "2026-08-01", views: 24 },
      { id: "kb-2", title: "Connect to office VPN", category: "Network", body: "Install the FortiClient VPN app. Server: vpn.curiousdevs.in, port 443. Use your office email and password. Enable 2FA in the authenticator app. Contact IT if you see certificate errors.", createdBy: "Arjun Mehta", createdAt: "2026-08-15", views: 18 },
      { id: "kb-3", title: "Set up the network printer", category: "Hardware", body: "Open Settings → Printers → Add. The office printer is at IP 192.168.1.50 (HP LaserJet). Select the HP Universal driver. Print a test page to confirm.", createdBy: "Karan Bhatt", createdAt: "2026-09-01", views: 11 },
    ],
    softwareRequests: [
      { id: "sw-1", number: "SW-1001", requester: "Riya Kapoor", software: "Figma Professional", reason: "Need full prototyping features for the new product designs", status: "pending", requestedAt: "2026-11-10", decidedBy: null },
    ],
    vendorContracts: [
      { id: "vc-1", vendor: "Airtel Business", type: "ISP", contactPerson: "Suresh Nair", phone: "9876543210", email: "suresh.nair@example.com", contractStart: "2026-04-01", contractEnd: "2027-03-31", annualCost: 180000, notes: "100 Mbps leased line, head office. SLA: 99.5% uptime, 4-hour restore." },
      { id: "vc-2", vendor: "Dell India Support", type: "AMC", contactPerson: "Pradeep Kulkarni", phone: "9123456789", email: "pradeep.k@example.com", contractStart: "2025-08-14", contractEnd: "2028-08-14", annualCost: 24000, notes: "On-site next-business-day for all Dell laptops. Covers hardware only." },
      { id: "vc-3", vendor: "SecureEye Systems", type: "AMC", contactPerson: "Ajay Thakur", phone: "9988776655", email: "ajay.t@example.com", contractStart: "2026-01-01", contractEnd: "2026-12-31", annualCost: 36000, notes: "CCTV maintenance, 16 cameras across 2 floors. Quarterly inspection." },
    ],
    networkItems: [
      { id: "net-1", name: "Company domain", type: "Domain", value: "curiousdevs.in", expiry: "2027-09-15", notes: "Registered with GoDaddy India" },
      { id: "net-2", name: "SSL certificate", type: "SSL", value: "*.curiousdevs.in (wildcard)", expiry: "2027-03-01", notes: "Let's Encrypt auto-renewal via Certbot" },
      { id: "net-3", name: "Office Wi-Fi", type: "Wi-Fi", value: "CuriousDevs-5G / CuriousDevs-Guest", expiry: null, notes: "WPA3, guest network isolated. Router: TP-Link Archer AX73" },
      { id: "net-4", name: "Office LAN", type: "IP Range", value: "192.168.1.0/24", expiry: null, notes: "DHCP .100–.200, static .1–.50 for servers and printers" },
    ],
    onboardingChecklists: [
      { id: "onb-1", employeeName: "Vikram Singh", joiningDate: "2026-11-18", items: ONBOARDING_ITEMS.map((label) => ({ label, done: false, doneBy: null, doneAt: null })), createdBy: "Pankaj Neema" },
    ],
    itPolicies: [
      { id: "pol-1", name: "Acceptable Use Policy", version: "1.2", effectiveDate: "2026-04-01", body: "Company devices and accounts are for business use. Personal use is allowed within reason but must not interfere with work, violate any law, or put company data at risk. All data on company devices belongs to the company. IT may audit device usage. Violations may lead to disciplinary action.", acknowledgedBy: ["Arjun Mehta", "Meera Singh", "Karan Bhatt"] },
      { id: "pol-2", name: "Password Policy", version: "1.0", effectiveDate: "2026-04-01", body: "Minimum 12 characters, at least one uppercase, one number and one special character. Change every 90 days. Never reuse the last 5 passwords. Enable 2FA on all systems that support it. Never share your password with anyone, including IT (we will never ask for it).", acknowledgedBy: ["Arjun Mehta", "Meera Singh"] },
    ],
    problems: [
      { id: "prb-1", number: "PRB-1001", title: "Recurring warehouse network drops", description: "The warehouse network has gone down three times this month. Each time it recovers after a switch restart but the root cause is unknown.", status: "open", incidentIds: ["inc-1"], rootCause: "", workaround: "Restart the network switch in the warehouse server rack.", createdBy: "Pankaj Neema", createdAt: "2026-10-25" },
    ],
    customFields: [
      { id: "cf-1", label: "Affected area", type: "dropdown", required: false, options: ["Head office", "Warehouse", "Branch office", "Remote / WFH"], categories: ["Network or printer", "Other"], visibleToRequester: true },
      { id: "cf-2", label: "Device / asset name", type: "text", required: false, options: [], categories: ["Laptop or phone", "Network or printer"], visibleToRequester: true },
      { id: "cf-3", label: "Business justification", type: "text", required: true, options: [], categories: ["Software"], visibleToRequester: true },
      { id: "cf-4", label: "Manager approved", type: "checkbox", required: false, options: [], categories: ["Access", "Software"], visibleToRequester: false },
      { id: "cf-5", label: "Urgency reason", type: "text", required: false, options: [], categories: ["Laptop or phone"], visibleToRequester: true },
    ],
  };
};

const emptySeed: Pick<ITState, SeedKeys> = { assets: [], access: [], licences: [], log: [], helpdesk: [], incidents: [], changes: [], monitors: [], offboarded: [], kbArticles: [], softwareRequests: [], vendorContracts: [], networkItems: [], onboardingChecklists: [], itPolicies: [], problems: [], customFields: [] };

const seed = (): Pick<ITState, SeedKeys> => (isFirstCompany ? demoSeed() : emptySeed);

/** Renewal due inside the next 30 days. */
export function renewalSoon(licence: Licence) {
  return licence.renewal >= TODAY && licence.renewal <= addDays(TODAY, 30);
}

export const useITStore = create<ITState>()(
  persist(
    (set, get) => {
      const record = (by: string, text: string) => ({ id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: TODAY, ts: new Date().toISOString(), by, text });
      return {
        ...seed(),
        resolveTicket: (id, by) => {
          const ticket = get().helpdesk.find((t) => t.id === id);
          if (!ticket) return "Request not found.";
          if (ticket.status === "resolved") return "This request is already resolved.";
          if (!ticket.assignee) return "Assign the request to someone before resolving it.";
          let note = "";
          if (ticket.category === "Access" && ticket.system && ticket.level) {
            const alreadyHas = get().access.some((g) => g.status === "active" && g.person === ticket.requester && g.system === ticket.system);
            if (alreadyHas) note = " (access was already in place)";
            else {
              const grant: AccessGrant = { id: `acc-${Date.now()}`, system: ticket.system, person: ticket.requester, level: ticket.level, status: "active", grantedBy: by };
              set((state) => ({ access: [...state.access, grant], log: [record(by, `Granted ${ticket.requester} ${ticket.level} access to ${ticket.system} from ${ticket.number}`), ...state.log] }));
              note = " and access granted";
            }
          }
          set((state) => ({
            helpdesk: state.helpdesk.map((t) => t.id === id ? { ...t, status: "resolved", resolvedAt: TODAY } : t),
            log: [record(by, `${ticket.number} resolved${note}`), ...state.log],
          }));
          return null;
        },
        addMonitor: (input, by) => {
          if (input.name.trim().length < 3) return "Enter the system's name.";
          if (get().monitors.some((m) => m.name.toLowerCase() === input.name.trim().toLowerCase())) return `${input.name.trim()} is already being monitored.`;
          set((state) => ({ monitors: [...state.monitors, { id: `mon-${Date.now()}`, name: input.name.trim(), kind: input.kind, status: "up", lastChecked: TODAY, note: "" }], log: [record(by, `Added ${input.name.trim()} to monitoring`), ...state.log] }));
          return null;
        },
        recordCheck: (id, status, note, by) => {
          const monitor = get().monitors.find((m) => m.id === id);
          if (!monitor) return "System not found.";
          const openForIt = get().incidents.some((i) => i.status !== "resolved" && i.title === `${monitor.name} is down`);
          const opens = status === "down" && !openForIt;
          const closes = status === "up" && get().incidents.some((i) => i.status !== "resolved" && i.title === `${monitor.name} is down`);
          const number = `INC-${1002 + get().incidents.length}`;
          set((state) => ({
            monitors: state.monitors.map((m) => m.id === id ? { ...m, status, lastChecked: TODAY, note: note.trim() } : m),
            incidents: opens
              ? [{ id: `inc-${Date.now()}`, number, title: `${monitor.name} is down`, severity: "critical", status: "open", reportedBy: by, assetId: null, raisedOn: TODAY, updates: note.trim() ? [note.trim()] : [] }, ...state.incidents]
              : closes
                ? state.incidents.map((i) => i.status !== "resolved" && i.title === `${monitor.name} is down` ? { ...i, status: "resolved", updates: [...i.updates, "Back up at check; closed automatically"] } : i)
                : state.incidents,
            log: [record(by, `${monitor.name} checked: ${status}${opens ? `; opened ${number}` : ""}${closes ? "; incident closed automatically" : ""}`), ...state.log],
          }));
          return null;
        },
        raiseIncident: (input, by) => {
          if (input.title.trim().length < 5) return "Describe the incident in a few words.";
          const number = `INC-${1002 + get().incidents.length}`;
          const incident: Incident = { id: `inc-${Date.now()}`, number, title: input.title.trim(), severity: input.severity, status: "open", reportedBy: by, assetId: input.assetId, raisedOn: TODAY, updates: [] };
          set((state) => ({ incidents: [incident, ...state.incidents], log: [record(by, `Opened ${number} (${input.severity}): ${incident.title}`), ...state.log] }));
          return null;
        },
        updateIncident: (id, status, note, by) => {
          const incident = get().incidents.find((i) => i.id === id);
          if (!incident) return "Incident not found.";
          if (incident.status === "resolved") return "This incident is already resolved.";
          if (status === "resolved" && note.trim().length < 3) return "Say how it was resolved.";
          const updates = note.trim() ? [...incident.updates, note.trim()] : incident.updates;
          set((state) => ({
            incidents: state.incidents.map((i) => i.id === id ? { ...i, status, updates } : i),
            log: [record(by, `${incident.number} is ${status}`), ...state.log],
          }));
          return null;
        },
        requestChange: (input, by) => {
        if (!demoMode) return "IT changes are recorded on the server.";
          if (input.title.trim().length < 5) return "Describe the change.";
          const number = `CHG-${1002 + get().changes.length}`;
          const change: ITChange = { id: `chg-${Date.now()}`, number, title: input.title.trim(), risk: input.risk, requestedBy: by, status: "pending", decidedBy: null, raisedOn: TODAY };
          set((state) => ({ changes: [change, ...state.changes], log: [record(by, `Requested ${number}: ${change.title}`), ...state.log] }));
          return null;
        },
        decideChange: (id, approve, by) => {
        if (!demoMode) return "IT changes are recorded on the server.";
          const change = get().changes.find((c) => c.id === id);
          if (!change) return "Change not found.";
          if (change.status !== "pending") return "Only a pending change can be decided.";
          if (change.requestedBy === by) return "The person who asked for a change cannot approve it.";
          set((state) => ({
            changes: state.changes.map((c) => c.id === id ? { ...c, status: approve ? "approved" : "rejected", decidedBy: by } : c),
            log: [record(by, `${approve ? "Approved" : "Rejected"} ${change.number}`), ...state.log],
          }));
          return null;
        },
        completeChange: (id, by) => {
        if (!demoMode) return "IT changes are recorded on the server.";
          const change = get().changes.find((c) => c.id === id);
          if (!change) return "Change not found.";
          if (change.status !== "approved") return "Only an approved change can be carried out.";
          set((state) => ({
            changes: state.changes.map((c) => c.id === id ? { ...c, status: "done" } : c),
            log: [record(by, `${change.number} carried out`), ...state.log],
          }));
          return null;
        },
        raiseTicket: (input, by) => {
          if (!input.requester) return "Choose who the request is for.";
          if (input.subject.trim().length < 5) return "Describe the problem in a few words.";
          const number = `IT-${1001 + get().helpdesk.length}`;
          if (input.category === "Access") {
            if (!input.system || input.system.trim().length < 2) return "Name the system the access is for.";
            if (!input.level) return "Choose the access level.";
          }
          const fields = get().customFields.filter((f) => f.categories.includes(input.category));
          for (const f of fields) {
            if (f.required) {
              const val = input.customValues?.[f.id];
              if (val === undefined || val === "" || val === false) return `"${f.label}" is required.`;
            }
          }
          const dueOn = new Date(Date.parse(TODAY) + HELPDESK_DUE_DAYS[input.priority] * 86400000).toISOString().slice(0, 10);
          const ticket: HelpdeskTicket = { id: `hd-${Date.now()}`, number, requester: input.requester, category: input.category, priority: input.priority, subject: input.subject.trim(), status: "open", assignee: null, raisedOn: TODAY, dueOn, system: input.category === "Access" ? input.system?.trim() : undefined, level: input.category === "Access" ? input.level : undefined, comments: [], description: input.description?.trim() ?? "", firstResponseAt: null, resolvedAt: null, satisfaction: null, escalatedTo: null, customValues: input.customValues ?? {} };
          set((state) => ({ helpdesk: [ticket, ...state.helpdesk], log: [record(by, `Raised ${number} for ${input.requester}: ${ticket.subject}`), ...state.log] }));
          return null;
        },
        setTicketStatus: (id, status, by) => {
          const ticket = get().helpdesk.find((t) => t.id === id);
          if (!ticket) return "Request not found.";
          if (ticket.status === "resolved") return "This request is already resolved.";
          if (status === "resolved") return "Use Resolve, so an access request is granted as well.";
          if (status === "in progress" && !ticket.assignee) return "Assign the request to someone before starting or resolving it.";
          const firstResponse = status === "in progress" && !ticket.firstResponseAt ? TODAY : ticket.firstResponseAt;
          set((state) => ({
            helpdesk: state.helpdesk.map((t) => t.id === id ? { ...t, status, firstResponseAt: firstResponse } : t),
            log: [record(by, `${ticket.number} is ${status}`), ...state.log],
          }));
          return null;
        },
        assignTicket: (id, assignee, by) => {
          const ticket = get().helpdesk.find((t) => t.id === id);
          if (!ticket) return "Request not found.";
          if (ticket.status === "resolved") return "A resolved request cannot be reassigned.";
          set((state) => ({
            helpdesk: state.helpdesk.map((t) => t.id === id ? { ...t, assignee } : t),
            log: [record(by, `${ticket.number} assigned to ${assignee}`), ...state.log],
          }));
          return null;
        },
        addAsset: (input, by) => {
          if (input.name.trim().length < 3) return "Enter the asset name.";
          if (input.serial.trim().length < 3) return "Enter the serial number.";
          if (get().assets.some((a) => a.serial === input.serial.trim())) return "An asset with this serial number already exists.";
          if (!(input.cost >= 0)) return "The cost cannot be negative.";
          const asset: Asset = { ...input, id: `ast-${Date.now()}`, name: input.name.trim(), serial: input.serial.trim(), status: "in stock", assignedTo: null, maintenanceLog: [], location: input.location || "Head office" };
          set((state) => ({ assets: [...state.assets, asset], log: [record(by, `Added asset ${asset.name} (${asset.serial})`), ...state.log] }));
          return null;
        },
        assignAsset: (id, person, by) => {
          const asset = get().assets.find((a) => a.id === id);
          if (!asset) return "Asset not found.";
          if (asset.status === "retired") return "A retired asset cannot be assigned.";
          if (asset.assignedTo) return `${asset.name} is with ${asset.assignedTo}. Return it first.`;
          set((state) => ({
            assets: state.assets.map((a) => a.id === id ? { ...a, status: "assigned", assignedTo: person } : a),
            log: [record(by, `Assigned ${asset.name} to ${person}`), ...state.log],
          }));
          return null;
        },
        returnAsset: (id, by) => {
          const asset = get().assets.find((a) => a.id === id);
          if (!asset) return "Asset not found.";
          if (!asset.assignedTo) return "This asset is not with anyone.";
          const from = asset.assignedTo;
          set((state) => ({
            assets: state.assets.map((a) => a.id === id ? { ...a, status: "in stock", assignedTo: null } : a),
            log: [record(by, `${asset.name} returned by ${from}`), ...state.log],
          }));
          return null;
        },
        retireAsset: (id, by) => {
          const asset = get().assets.find((a) => a.id === id);
          if (!asset) return "Asset not found.";
          if (asset.assignedTo) return `Return ${asset.name} from ${asset.assignedTo} before retiring it.`;
          set((state) => ({
            assets: state.assets.map((a) => a.id === id ? { ...a, status: "retired" } : a),
            log: [record(by, `Retired ${asset.name}`), ...state.log],
          }));
          return null;
        },
        grantAccess: (input, by) => {
          const system = input.system.trim();
          if (system.length < 2) return "Enter the system name.";
          if (!input.person) return "Choose the person.";
          if (get().access.some((g) => g.status === "active" && g.system === system && g.person === input.person)) return `${input.person} already has active access to ${system}.`;
          const grant: AccessGrant = { id: `acc-${Date.now()}`, system, person: input.person, level: input.level, status: "active", grantedBy: by };
          set((state) => ({ access: [...state.access, grant], log: [record(by, `Granted ${input.person} ${input.level} access to ${system}`), ...state.log] }));
          return null;
        },
        removeAccess: (id, by) => {
          const grant = get().access.find((g) => g.id === id);
          if (!grant) return "Access record not found.";
          if (grant.status === "removed") return "This access is already removed.";
          set((state) => ({
            access: state.access.map((g) => g.id === id ? { ...g, status: "removed", removedBy: by } : g),
            log: [record(by, `Removed ${grant.person}'s access to ${grant.system}`), ...state.log],
          }));
          return null;
        },
        offboard: (person, by) => {
          const state = get();
          const grants = state.access.filter((g) => g.person === person && g.status === "active");
          const assets = state.assets.filter((a) => a.assignedTo === person);
          if (grants.length === 0 && assets.length === 0) return `${person} has no access or assets to return.`;
          const entries = [
            ...assets.map((a) => record(by, `Offboarding: ${a.name} returned by ${person}`)),
            ...grants.map((g) => record(by, `Offboarding: removed ${person}'s access to ${g.system}`)),
          ];
          set({
            access: state.access.map((g) => g.person === person && g.status === "active" ? { ...g, status: "removed", removedBy: by } : g),
            assets: state.assets.map((a) => a.assignedTo === person ? { ...a, status: "in stock", assignedTo: null } : a),
            log: [...entries, ...state.log],
            offboarded: state.offboarded.includes(person) ? state.offboarded : [...state.offboarded, person],
          });
          return null;
        },
        addLicence: (input, by) => {
          if (input.name.trim().length < 3) return "Enter the licence name.";
          if (!(input.seats >= 1)) return "Enter at least one seat.";
          if (!(input.annualCost >= 0)) return "The cost cannot be negative.";
          if (!input.renewal) return "Enter the renewal date.";
          const licence: Licence = { ...input, id: `lic-${Date.now()}`, name: input.name.trim(), assigned: [] };
          set((state) => ({ licences: [...state.licences, licence], log: [record(by, `Added licence ${licence.name} (${licence.seats} seats)`), ...state.log] }));
          return null;
        },
        assignSeat: (licenceId, person, by) => {
          const licence = get().licences.find((l) => l.id === licenceId);
          if (!licence) return "Licence not found.";
          if (licence.assigned.includes(person)) return `${person} already has a seat.`;
          if (licence.assigned.length >= licence.seats) return `No free seats left on ${licence.name}. Buy more seats or free one.`;
          set((state) => ({
            licences: state.licences.map((l) => l.id === licenceId ? { ...l, assigned: [...l.assigned, person] } : l),
            log: [record(by, `Gave ${person} a seat on ${licence.name}`), ...state.log],
          }));
          return null;
        },
        freeSeat: (licenceId, person, by) => {
          const licence = get().licences.find((l) => l.id === licenceId);
          if (!licence) return "Licence not found.";
          if (!licence.assigned.includes(person)) return `${person} has no seat on ${licence.name}.`;
          set((state) => ({
            licences: state.licences.map((l) => l.id === licenceId ? { ...l, assigned: l.assigned.filter((p) => p !== person) } : l),
            log: [record(by, `Freed ${person}'s seat on ${licence.name}`), ...state.log],
          }));
          return null;
        },

        // --- New enterprise actions ---

        addTicketComment: (ticketId, text, internal, by) => {
          const ticket = get().helpdesk.find((t) => t.id === ticketId);
          if (!ticket) return "Request not found.";
          if (text.trim().length < 2) return "Enter a comment.";
          const comment = { id: `cmt-${Date.now()}`, text: text.trim(), by, at: TODAY, internal };
          set((state) => ({
            helpdesk: state.helpdesk.map((t) => t.id === ticketId ? { ...t, comments: [...t.comments, comment] } : t),
            log: [record(by, `${internal ? "Internal note" : "Comment"} on ${ticket.number}`), ...state.log],
          }));
          return null;
        },
        logMaintenance: (assetId, note, by) => {
          const asset = get().assets.find((a) => a.id === assetId);
          if (!asset) return "Asset not found.";
          if (note.trim().length < 3) return "Describe the maintenance.";
          set((state) => ({
            assets: state.assets.map((a) => a.id === assetId ? { ...a, maintenanceLog: [...a.maintenanceLog, { date: TODAY, note: note.trim(), by }] } : a),
            log: [record(by, `Maintenance on ${asset.name}: ${note.trim()}`), ...state.log],
          }));
          return null;
        },
        addKbArticle: (input, by) => {
          if (input.title.trim().length < 5) return "Enter a title for the article.";
          if (input.body.trim().length < 10) return "Write at least a short article body.";
          const article: KbArticle = { id: `kb-${Date.now()}`, title: input.title.trim(), category: input.category, body: input.body.trim(), createdBy: input.createdBy || by, createdAt: TODAY, views: 0 };
          set((state) => ({ kbArticles: [article, ...state.kbArticles], log: [record(by, `Published KB article: ${article.title}`), ...state.log] }));
          return null;
        },
        addSoftwareRequest: (input, by) => {
          if (!input.requester) return "Choose who needs the software.";
          if (input.software.trim().length < 2) return "Name the software.";
          if (input.reason.trim().length < 5) return "Explain why the software is needed.";
          const number = `SW-${1001 + get().softwareRequests.length}`;
          const req: SoftwareRequest = { id: `sw-${Date.now()}`, number, requester: input.requester, software: input.software.trim(), reason: input.reason.trim(), status: "pending", requestedAt: TODAY, decidedBy: null };
          set((state) => ({ softwareRequests: [req, ...state.softwareRequests], log: [record(by, `${number}: ${input.requester} requested ${req.software}`), ...state.log] }));
          return null;
        },
        decideSoftwareRequest: (id, approve, by) => {
          const req = get().softwareRequests.find((r) => r.id === id);
          if (!req) return "Request not found.";
          if (req.status !== "pending" && req.status !== "manager_approved") return "This request has already been decided.";
          const nextStatus = approve ? (req.status === "pending" ? "manager_approved" : "it_approved") : "rejected";
          set((state) => ({
            softwareRequests: state.softwareRequests.map((r) => r.id === id ? { ...r, status: nextStatus, decidedBy: by } : r),
            log: [record(by, `${approve ? "Approved" : "Rejected"} ${req.number} (${req.software})`), ...state.log],
          }));
          return null;
        },
        provisionSoftwareRequest: (id, by) => {
          const req = get().softwareRequests.find((r) => r.id === id);
          if (!req) return "Request not found.";
          if (req.status !== "it_approved") return "Only IT-approved requests can be provisioned.";
          set((state) => ({
            softwareRequests: state.softwareRequests.map((r) => r.id === id ? { ...r, status: "provisioned" } : r),
            log: [record(by, `Provisioned ${req.software} for ${req.requester}`), ...state.log],
          }));
          return null;
        },
        addVendorContract: (input, by) => {
          if (input.vendor.trim().length < 2) return "Enter the vendor name.";
          if (!input.contractEnd) return "Enter the contract end date.";
          const contract: ITVendorContract = { ...input, id: `vc-${Date.now()}`, vendor: input.vendor.trim() };
          set((state) => ({ vendorContracts: [...state.vendorContracts, contract], log: [record(by, `Added IT vendor contract: ${contract.vendor}`), ...state.log] }));
          return null;
        },
        addNetworkItem: (input, by) => {
          if (input.name.trim().length < 2) return "Enter the item name.";
          if (input.value.trim().length < 2) return "Enter the value (IP, domain, SSID, etc.).";
          const item: NetworkItem = { ...input, id: `net-${Date.now()}`, name: input.name.trim(), value: input.value.trim() };
          set((state) => ({ networkItems: [...state.networkItems, item], log: [record(by, `Added network item: ${item.name}`), ...state.log] }));
          return null;
        },
        removeNetworkItem: (id, by) => {
          const item = get().networkItems.find((n) => n.id === id);
          if (!item) return "Item not found.";
          set((state) => ({
            networkItems: state.networkItems.filter((n) => n.id !== id),
            log: [record(by, `Removed network item: ${item.name}`), ...state.log],
          }));
          return null;
        },
        addOnboarding: (input, by) => {
          if (input.employeeName.trim().length < 2) return "Enter the employee name.";
          if (!input.joiningDate) return "Enter the joining date.";
          const checklist: OnboardingChecklist = { id: `onb-${Date.now()}`, employeeName: input.employeeName.trim(), joiningDate: input.joiningDate, items: ONBOARDING_ITEMS.map((label) => ({ label, done: false, doneBy: null, doneAt: null })), createdBy: by };
          set((state) => ({ onboardingChecklists: [checklist, ...state.onboardingChecklists], log: [record(by, `Created onboarding checklist for ${checklist.employeeName}`), ...state.log] }));
          return null;
        },
        toggleOnboardingItem: (checklistId, index, by) => {
          const cl = get().onboardingChecklists.find((c) => c.id === checklistId);
          if (!cl) return "Checklist not found.";
          if (index < 0 || index >= cl.items.length) return "Invalid item.";
          const item = cl.items[index];
          const updated = { ...item, done: !item.done, doneBy: !item.done ? by : null, doneAt: !item.done ? TODAY : null };
          set((state) => ({
            onboardingChecklists: state.onboardingChecklists.map((c) => c.id === checklistId ? { ...c, items: c.items.map((it, i) => i === index ? updated : it) } : c),
            log: [record(by, `${updated.done ? "Completed" : "Unchecked"} "${updated.label}" for ${cl.employeeName}`), ...state.log],
          }));
          return null;
        },
        addITPolicy: (input, by) => {
          if (input.name.trim().length < 3) return "Enter the policy name.";
          if (input.body.trim().length < 10) return "Write at least a short policy body.";
          const policy: ITPolicy = { ...input, id: `pol-${Date.now()}`, name: input.name.trim(), body: input.body.trim(), acknowledgedBy: [] };
          set((state) => ({ itPolicies: [...state.itPolicies, policy], log: [record(by, `Published IT policy: ${policy.name} v${policy.version}`), ...state.log] }));
          return null;
        },
        acknowledgePolicy: (id, person) => {
          const policy = get().itPolicies.find((p) => p.id === id);
          if (!policy) return "Policy not found.";
          if (policy.acknowledgedBy.includes(person)) return `${person} has already acknowledged this policy.`;
          set((state) => ({
            itPolicies: state.itPolicies.map((p) => p.id === id ? { ...p, acknowledgedBy: [...p.acknowledgedBy, person] } : p),
            log: [{ id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: TODAY, ts: new Date().toISOString(), by: person, text: `Acknowledged ${policy.name}` }, ...state.log],
          }));
          return null;
        },
        rateSatisfaction: (ticketId, rating) => {
          const ticket = get().helpdesk.find((t) => t.id === ticketId);
          if (!ticket) return "Request not found.";
          if (ticket.status !== "resolved") return "Only resolved requests can be rated.";
          if (rating < 1 || rating > 5) return "Rating must be 1 to 5.";
          set((state) => ({ helpdesk: state.helpdesk.map((t) => t.id === ticketId ? { ...t, satisfaction: rating } : t) }));
          return null;
        },
        escalateTicket: (ticketId, person, by) => {
          const ticket = get().helpdesk.find((t) => t.id === ticketId);
          if (!ticket) return "Request not found.";
          if (ticket.status === "resolved") return "A resolved request cannot be escalated.";
          set((state) => ({
            helpdesk: state.helpdesk.map((t) => t.id === ticketId ? { ...t, escalatedTo: person } : t),
            log: [record(by, `${ticket.number} escalated to ${person}`), ...state.log],
          }));
          return null;
        },
        reopenTicket: (ticketId, by) => {
          const ticket = get().helpdesk.find((t) => t.id === ticketId);
          if (!ticket) return "Request not found.";
          if (ticket.status !== "resolved") return "Only resolved requests can be reopened.";
          set((state) => ({
            helpdesk: state.helpdesk.map((t) => t.id === ticketId ? { ...t, status: "open", resolvedAt: null, satisfaction: null } : t),
            log: [record(by, `${ticket.number} reopened`), ...state.log],
          }));
          return null;
        },
        addProblem: (input, by) => {
          if (input.title.trim().length < 5) return "Describe the problem.";
          const number = `PRB-${1001 + get().problems.length}`;
          const problem: Problem = { id: `prb-${Date.now()}`, number, title: input.title.trim(), description: input.description?.trim() ?? "", status: "open", incidentIds: [], rootCause: "", workaround: "", createdBy: by, createdAt: TODAY };
          set((state) => ({ problems: [problem, ...state.problems], log: [record(by, `Opened ${number}: ${problem.title}`), ...state.log] }));
          return null;
        },
        updateProblem: (id, fields, by) => {
          const problem = get().problems.find((p) => p.id === id);
          if (!problem) return "Problem not found.";
          set((state) => ({
            problems: state.problems.map((p) => p.id === id ? { ...p, ...fields } : p),
            log: [record(by, `Updated ${problem.number}${fields.status ? `: ${fields.status}` : ""}`), ...state.log],
          }));
          return null;
        },
        linkIncidentToProblem: (problemId, incidentId, by) => {
          const problem = get().problems.find((p) => p.id === problemId);
          if (!problem) return "Problem not found.";
          const incident = get().incidents.find((i) => i.id === incidentId);
          if (!incident) return "Incident not found.";
          if (problem.incidentIds.includes(incidentId)) return `${incident.number} is already linked.`;
          set((state) => ({
            problems: state.problems.map((p) => p.id === problemId ? { ...p, incidentIds: [...p.incidentIds, incidentId] } : p),
            log: [record(by, `Linked ${incident.number} to ${problem.number}`), ...state.log],
          }));
          return null;
        },
        addCustomField: (input, by) => {
          if (input.label.trim().length < 2) return "Enter a field label.";
          if (input.type === "dropdown" && input.options.length < 2) return "A dropdown needs at least two options.";
          if (input.categories.length === 0) return "Choose at least one ticket category.";
          const field: CustomField = { ...input, id: `cf-${Date.now()}`, label: input.label.trim() };
          set((state) => ({ customFields: [...state.customFields, field], log: [record(by, `Added custom ticket field: ${field.label}`), ...state.log] }));
          return null;
        },
        removeCustomField: (id, by) => {
          const field = get().customFields.find((f) => f.id === id);
          if (!field) return "Field not found.";
          set((state) => ({ customFields: state.customFields.filter((f) => f.id !== id), log: [record(by, `Removed custom ticket field: ${field.label}`), ...state.log] }));
          return null;
        },
        updateCustomField: (id, fields, by) => {
          const field = get().customFields.find((f) => f.id === id);
          if (!field) return "Field not found.";
          set((state) => ({ customFields: state.customFields.map((f) => f.id === id ? { ...f, ...fields } : f), log: [record(by, `Updated custom ticket field: ${field.label}`), ...state.log] }));
          return null;
        },
      };
    },
    { name: scoped("janus.it.v1"), storage: createJSONStorage(() => workspaceStorage),
      merge: (persisted, current) => withoutDemoRecords({ ...current, ...(persisted as Partial<ITState>) } as ITState, demoSeed()) },
  ),
);
