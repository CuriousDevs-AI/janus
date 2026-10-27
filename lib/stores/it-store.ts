"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isFirstCompany } from "@/lib/companies";
import { scoped } from "@/lib/company";
import { addDays } from "@/lib/stores/projects-store";

/**
 * IT & Infrastructure (phase 1): asset register with assignment and return, access grants per person
 * and system, software licences with seats, and an audit log of every change. Helpdesk, monitoring and
 * incidents come later. Each company keeps its own records.
 */

export const TODAY = "2026-10-23";
export const ASSET_KINDS = ["Laptop", "Desktop", "Phone", "Monitor", "Printer", "Other"] as const;
export const ACCESS_LEVELS = ["view", "edit", "admin"] as const;
export const HELPDESK_CATEGORIES = ["Laptop or phone", "Access", "Software", "Network or printer", "Other"] as const;
export const HELPDESK_PRIORITIES = ["low", "medium", "high"] as const;

export interface Asset { id: string; name: string; kind: (typeof ASSET_KINDS)[number]; serial: string; purchaseDate: string; cost: number; status: "in stock" | "assigned" | "retired"; assignedTo: string | null }
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

interface ITState {
  assets: Asset[];
  access: AccessGrant[];
  licences: Licence[];
  log: AuditEntry[];
  helpdesk: HelpdeskTicket[];
  incidents: Incident[];
  monitors: Monitor[];
  changes: ITChange[];
  addMonitor: (input: { name: string; kind: Monitor["kind"] }, by: string) => string | null;
  recordCheck: (id: string, status: Monitor["status"], note: string, by: string) => string | null;
  raiseIncident: (input: { title: string; severity: Incident["severity"]; assetId: string | null }, by: string) => string | null;
  updateIncident: (id: string, status: Incident["status"], note: string, by: string) => string | null;
  requestChange: (input: { title: string; risk: ITChange["risk"] }, by: string) => string | null;
  decideChange: (id: string, approve: boolean, by: string) => string | null;
  completeChange: (id: string, by: string) => string | null;
  raiseTicket: (input: { requester: string; category: HelpdeskTicket["category"]; priority: HelpdeskTicket["priority"]; subject: string; system?: string; level?: AccessGrant["level"] }, by: string) => string | null;
  resolveTicket: (id: string, by: string) => string | null;
  setTicketStatus: (id: string, status: HelpdeskTicket["status"], by: string) => string | null;
  assignTicket: (id: string, assignee: string, by: string) => string | null;
  addAsset: (input: Omit<Asset, "id" | "status" | "assignedTo">, by: string) => string | null;
  assignAsset: (id: string, person: string, by: string) => string | null;
  returnAsset: (id: string, by: string) => string | null;
  retireAsset: (id: string, by: string) => string | null;
  grantAccess: (input: { system: string; person: string; level: AccessGrant["level"] }, by: string) => string | null;
  removeAccess: (id: string, by: string) => string | null;
  offboard: (person: string, by: string) => string | null;
  addLicence: (input: Omit<Licence, "id" | "assigned">, by: string) => string | null;
  assignSeat: (licenceId: string, person: string, by: string) => string | null;
  freeSeat: (licenceId: string, person: string, by: string) => string | null;
}

const seed = (): Pick<ITState, "assets" | "access" | "licences" | "log" | "helpdesk" | "incidents" | "changes" | "monitors"> => {
  if (!isFirstCompany) return { assets: [], access: [], licences: [], log: [], helpdesk: [], incidents: [], changes: [], monitors: [] };
  return {
    assets: [
      { id: "ast-1", name: "Dell Latitude 5440", kind: "Laptop", serial: "DL-5440-2231", purchaseDate: "2025-08-14", cost: 78000, status: "assigned", assignedTo: "Arjun Mehta" },
      { id: "ast-2", name: "Lenovo ThinkPad E14", kind: "Laptop", serial: "TP-E14-7781", purchaseDate: "2025-11-02", cost: 62000, status: "in stock", assignedTo: null },
      { id: "ast-3", name: "HP LaserJet M111w", kind: "Printer", serial: "HP-M111-0093", purchaseDate: "2024-06-20", cost: 14500, status: "assigned", assignedTo: "Karan Bhatt" },
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
      { id: "hd-1", number: "IT-1001", requester: "Vikas Jain", category: "Network or printer", priority: "medium", subject: "Warehouse printer shows offline", status: "open", assignee: null, raisedOn: "2026-10-22", dueOn: "2026-10-23" },
    ],
  };
};

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
            helpdesk: state.helpdesk.map((t) => t.id === id ? { ...t, status: "resolved" } : t),
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
          const number = `INC-${1002 + get().incidents.length}`;
          set((state) => ({
            monitors: state.monitors.map((m) => m.id === id ? { ...m, status, lastChecked: TODAY, note: note.trim() } : m),
            incidents: opens ? [{ id: `inc-${Date.now()}`, number, title: `${monitor.name} is down`, severity: "critical", status: "open", reportedBy: by, assetId: null, raisedOn: TODAY, updates: note.trim() ? [note.trim()] : [] }, ...state.incidents] : state.incidents,
            log: [record(by, `${monitor.name} checked: ${status}${opens ? `; opened ${number}` : ""}`), ...state.log],
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
          if (input.title.trim().length < 5) return "Describe the change.";
          const number = `CHG-${1002 + get().changes.length}`;
          const change: ITChange = { id: `chg-${Date.now()}`, number, title: input.title.trim(), risk: input.risk, requestedBy: by, status: "pending", decidedBy: null, raisedOn: TODAY };
          set((state) => ({ changes: [change, ...state.changes], log: [record(by, `Requested ${number}: ${change.title}`), ...state.log] }));
          return null;
        },
        decideChange: (id, approve, by) => {
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
          const dueOn = new Date(Date.parse(TODAY) + HELPDESK_DUE_DAYS[input.priority] * 86400000).toISOString().slice(0, 10);
          const ticket: HelpdeskTicket = { id: `hd-${Date.now()}`, number, requester: input.requester, category: input.category, priority: input.priority, subject: input.subject.trim(), status: "open", assignee: null, raisedOn: TODAY, dueOn, system: input.category === "Access" ? input.system?.trim() : undefined, level: input.category === "Access" ? input.level : undefined };
          set((state) => ({ helpdesk: [ticket, ...state.helpdesk], log: [record(by, `Raised ${number} for ${input.requester}: ${ticket.subject}`), ...state.log] }));
          return null;
        },
        setTicketStatus: (id, status, by) => {
          const ticket = get().helpdesk.find((t) => t.id === id);
          if (!ticket) return "Request not found.";
          if (ticket.status === "resolved") return "This request is already resolved.";
          if (status === "resolved") return "Use Resolve, so an access request is granted as well.";
          if (status === "in progress" && !ticket.assignee) return "Assign the request to someone before starting or resolving it.";
          set((state) => ({
            helpdesk: state.helpdesk.map((t) => t.id === id ? { ...t, status } : t),
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
          const asset: Asset = { ...input, id: `ast-${Date.now()}`, name: input.name.trim(), serial: input.serial.trim(), status: "in stock", assignedTo: null };
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
      };
    },
    { name: scoped("janus.it.v1"), storage: createJSONStorage(() => localStorage) },
  ),
);
