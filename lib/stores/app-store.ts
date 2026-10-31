"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { workspaceStorage } from "@/lib/stores/workspace-storage";
import { demoMode } from "@/lib/demo-mode";
import { scoped } from "@/lib/company";
import type {
  Lead,
  LeadStage,
  LeadSource,
  Deal,
  DealStage,
  Ticket,
  TicketStatus,
  TicketPriority,
  Approval,
  Automation,
  AutomationTriggerKind,
  AppNotification,
  Conversation,
  Message,
  Activity,
  ActivityType,
  ActivityActor,
  Agent,
  KnowledgeDocument,
  Customer,
  Company,
} from "@/lib/types";
import {
  leads as initialLeads,
  deals as initialDeals,
  tickets as initialTickets,
  approvals as initialApprovals,
  automations as initialAutomations,
  notifications as initialNotifications,
  conversations as initialConversations,
  messages as initialMessages,
  activities as initialActivities,
  agents as initialAgents,
  knowledgeDocuments as initialKnowledge,
  demoKnowledgeDocuments,
  demoTickets,
  demoApprovals,
  demoNotifications,
  demoConversations,
  demoMessages,
  demoActivities,
  customers as initialCustomers,
  companies as initialCompanies,
  currentUser,
} from "@/lib/mock-data";

let idCounter = 1000;
/**
 * A record id. These records are shared by everyone in the company, and a counter restarts in every
 * browser, so two people would make the same id; a real account gets a random one. The preview keeps
 * short readable ids, since its data never leaves the browser.
 */
function nextId(prefix: string) {
  if (!demoMode) return `${prefix}-${crypto.randomUUID()}`;
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * Each record once, with an id of its own. An earlier per-browser counter could give two records the
 * same id: an exact copy is dropped, and a different record that shares an id gets a new one, so no
 * record is lost.
 */
function unique<T extends { id: string }>(items: T[] | undefined): { items: T[]; changed: boolean } {
  const seen = new Map<string, string>();
  const out: T[] = [];
  let changed = false;
  for (const item of items ?? []) {
    const json = JSON.stringify(item);
    const earlier = seen.get(item.id);
    if (earlier === undefined) {
      seen.set(item.id, json);
      out.push(item);
    } else if (earlier === json) {
      changed = true;
    } else {
      const renamed = { ...item, id: `${item.id.replace(/-\d+$/, "")}-${crypto.randomUUID()}` };
      seen.set(renamed.id, JSON.stringify(renamed));
      out.push(renamed);
      changed = true;
    }
  }
  return { items: out, changed };
}

const HUMAN_ACTOR: ActivityActor = { type: "human", userId: currentUser.id, userName: currentUser.name };
const SYSTEM_ACTOR: ActivityActor = { type: "system" };

interface AppState {
  // domain data
  leads: Lead[];
  deals: Deal[];
  tickets: Ticket[];
  approvals: Approval[];
  automations: Automation[];
  notifications: AppNotification[];
  conversations: Conversation[];
  messages: Message[];
  activities: Activity[];
  agents: Agent[];
  knowledgeDocuments: KnowledgeDocument[];
  customers: Customer[];
  companies: Company[];

  // ui state
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  mobileNavOpen: boolean;
  demoBannerDismissed: boolean;

  // ui actions
  setSidebarCollapsed: (v: boolean) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setMobileNavOpen: (v: boolean) => void;

  // helpers
  addActivity: (customerId: string, type: ActivityType, actor: ActivityActor, title: string, extra?: Partial<Activity>) => void;
  adjustCustomerHealth: (customerId: string, delta: number, reason: string) => void;

  // crm actions
  moveDealStage: (dealId: string, stage: DealStage) => void;
  moveLeadStage: (leadId: string, stage: LeadStage) => void;

  // approvals
  decideApproval: (id: string, decision: "approved" | "rejected") => void;

  // tickets
  updateTicketStatus: (ticketId: string, status: TicketStatus) => void;
  assignTicket: (ticketId: string, userId: string, by?: string) => void;
  takeOverConversation: (ticketId: string) => void;
  resolveTicket: (ticketId: string, reason?: string) => void;

  // inbox
  sendMessage: (conversationId: string, content: string) => void;
  simulateAIReply: (conversationId: string, content: string, meta?: Message["aiMeta"]) => void;
  markConversationRead: (conversationId: string) => void;

  // notifications
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // automations
  toggleAutomation: (id: string) => void;
  runAutomationOnce: (id: string) => void;

  // knowledge
  addKnowledgeDocument: (doc: Partial<KnowledgeDocument> & { title: string }) => void;

  // agents
  switchAgentVersion: (agentId: string, version: string) => void;

  // creation
  createLead: (input: { name: string; email: string; companyName: string; source: LeadSource; requirement: string; ownerId: string }) => string;
  createDeal: (input: { name: string; customerId: string; amount: number; stage: DealStage; expectedCloseAt: string }) => string;
  createTicket: (input: { customerId: string; subject: string; description: string; priority: TicketPriority }) => string;
  createAutomation: (input: { name: string; description: string; trigger: AutomationTriggerKind }) => string;

  // demo
  resetDemoData: () => void;
}

/** Demo records are seeded only in demo mode. A real company starts with none and creates its own. */
const demoOnly = <T,>(items: T[]): T[] => (demoMode ? items : []);

/** The demo records each collection starts with, so a saved copy of them can be told apart from real records. */
const demoSeeds = {
  leads: initialLeads,
  deals: initialDeals,
  tickets: demoTickets,
  approvals: demoApprovals,
  automations: initialAutomations,
  notifications: demoNotifications,
  conversations: demoConversations,
  messages: demoMessages,
  activities: demoActivities,
  agents: initialAgents,
  knowledgeDocuments: demoKnowledgeDocuments,
  customers: initialCustomers,
  companies: initialCompanies,
} as const;

export const useAppStore = create<AppState>()(persist((set, get) => ({
  leads: demoOnly(initialLeads),
  deals: demoOnly(initialDeals),
  tickets: demoOnly(initialTickets),
  approvals: demoOnly(initialApprovals),
  automations: demoOnly(initialAutomations),
  notifications: demoOnly(initialNotifications),
  conversations: demoOnly(initialConversations),
  messages: demoOnly(initialMessages),
  activities: demoOnly(initialActivities),
  agents: demoOnly(initialAgents),
  knowledgeDocuments: demoOnly(initialKnowledge),
  customers: demoOnly(initialCustomers),
  companies: demoOnly(initialCompanies),

  sidebarCollapsed: false,
  commandPaletteOpen: false,
  mobileNavOpen: false,
  demoBannerDismissed: false,

  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),

  addActivity: (customerId, type, actor, title, extra) => {
    const activity: Activity = {
      id: nextId("act"),
      customerId,
      type,
      actor,
      title,
      createdAt: new Date().toISOString(),
      ...extra,
    };
    set((s) => ({ activities: [activity, ...s.activities] }));
  },

  adjustCustomerHealth: (customerId, delta, reason) => {
    const customer = get().customers.find((c) => c.id === customerId);
    if (!customer || delta === 0) return;
    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    const newScore = clamp(customer.health.score + delta);
    let category = customer.health.category;
    if (newScore < 40) category = "high_risk";
    else if (newScore < 60 && (category === "high_risk" || category === "at_risk")) category = "at_risk";
    else if (newScore >= 60 && (category === "high_risk" || category === "at_risk")) category = "healthy";
    set((s) => ({
      customers: s.customers.map((c) =>
        c.id === customerId
          ? {
              ...c,
              health: {
                ...c.health,
                score: newScore,
                category,
                churnRisk: clamp(c.health.churnRisk - delta),
                supportLoad: clamp(c.health.supportLoad - delta),
                trend: delta > 0 ? "up" : "down",
                sentiment: newScore >= 60 ? "positive" : newScore >= 40 ? "stable" : "negative",
              },
            }
          : c
      ),
    }));
    get().addActivity(customerId, "health_changed", SYSTEM_ACTOR, reason, {
      meta: { score: newScore, delta },
    });
  },

  moveDealStage: (dealId, stage) => {
    const deal = get().deals.find((d) => d.id === dealId);
    if (!deal) return;
    const prevStage = deal.stage;
    set((s) => ({
      deals: s.deals.map((d) =>
        d.id === dealId
          ? {
              ...d,
              stage,
              probability: stage === "won" ? 100 : stage === "lost" ? 0 : d.probability,
              lastActivityAt: new Date().toISOString(),
            }
          : d
      ),
    }));
    get().addActivity(deal.customerId, "stage_changed", HUMAN_ACTOR, `Deal moved from ${prevStage} to ${stage}`, {
      relatedId: dealId,
      relatedKind: "deal",
    });
    if (stage === "won" && prevStage !== "won") {
      const customer = get().customers.find((c) => c.id === deal.customerId);
      get().addActivity(deal.customerId, "deal_won", HUMAN_ACTOR, `Deal won — ${deal.name}`, {
        relatedId: dealId,
        relatedKind: "deal",
      });
      if (customer && customer.stage !== "customer") {
        set((s) => ({
          customers: s.customers.map((c) => (c.id === customer.id ? { ...c, stage: "customer" } : c)),
        }));
        get().addActivity(deal.customerId, "customer_created", SYSTEM_ACTOR, `${customer.name} became a customer`);
      }
      get().adjustCustomerHealth(deal.customerId, 6, `Health improved — ${deal.name} won`);
    }
    if (stage === "lost" && prevStage !== "lost") {
      get().addActivity(deal.customerId, "deal_lost", HUMAN_ACTOR, `Deal marked Lost — ${deal.name}`, {
        relatedId: dealId,
        relatedKind: "deal",
      });
    }
  },

  moveLeadStage: (leadId, stage) => {
    const lead = get().leads.find((l) => l.id === leadId);
    if (!lead) return;
    set((s) => ({
      leads: s.leads.map((l) => (l.id === leadId ? { ...l, stage, lastActivityAt: new Date().toISOString() } : l)),
    }));
    get().addActivity(lead.customerId, "stage_changed", HUMAN_ACTOR, `Lead moved to ${stage}`, {
      relatedId: leadId,
      relatedKind: "lead",
    });
  },

  decideApproval: (id, decision) => {
    const approval = get().approvals.find((a) => a.id === id);
    if (!approval) return;
    set((s) => ({
      approvals: s.approvals.map((a) =>
        a.id === id ? { ...a, status: decision, decidedById: currentUser.id, decidedAt: new Date().toISOString() } : a
      ),
    }));
    get().addActivity(
      approval.customerId,
      "approval_decided",
      HUMAN_ACTOR,
      `${decision === "approved" ? "Approved" : "Rejected"} — ${approval.actionLabel}`,
      { relatedId: id, relatedKind: "approval" }
    );
    if (decision === "approved" && approval.actionKind === "discount" && approval.relatedDealId) {
      set((s) => ({
        deals: s.deals.map((d) =>
          d.id === approval.relatedDealId ? { ...d, probability: Math.min(95, d.probability + 15) } : d
        ),
      }));
    }
    if (decision === "approved" && approval.actionKind === "refund") {
      get().adjustCustomerHealth(approval.customerId, 3, `Health improved — refund approved`);
    }
    if (decision === "rejected" && (approval.actionKind === "refund" || approval.actionKind === "contract_action")) {
      get().adjustCustomerHealth(approval.customerId, -2, `Health dipped — ${approval.actionLabel} rejected`);
    }
  },

  updateTicketStatus: (ticketId, status) => {
    const ticket = get().tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              status,
              updatedAt: new Date().toISOString(),
              resolvedAt: status === "resolved" || status === "closed" ? new Date().toISOString() : t.resolvedAt,
            }
          : t
      ),
    }));
    if (status === "resolved") {
      get().addActivity(ticket.customerId, "ticket_resolved", HUMAN_ACTOR, `Ticket ${ticket.number} resolved`, {
        relatedId: ticketId,
        relatedKind: "ticket",
      });
      get().adjustCustomerHealth(ticket.customerId, 4, `Health improved — ${ticket.number} resolved`);
    } else if (status === "escalated") {
      get().addActivity(ticket.customerId, "ticket_escalated", HUMAN_ACTOR, `Ticket ${ticket.number} escalated`, {
        relatedId: ticketId,
        relatedKind: "ticket",
      });
      get().adjustCustomerHealth(ticket.customerId, -3, `Health dipped — ${ticket.number} escalated`);
    }
  },

  assignTicket: (ticketId, userId, by) => {
    const ticket = get().tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    set((s) => ({
      tickets: s.tickets.map((t) => (t.id === ticketId ? { ...t, assigneeId: userId, updatedAt: new Date().toISOString() } : t)),
    }));
    // The person who made the change is recorded, not the fixed demo user.
    const actor: ActivityActor = by ? { ...HUMAN_ACTOR, userName: by } : HUMAN_ACTOR;
    get().addActivity(ticket.customerId, "human_action", actor, `Ticket ${ticket.number} assigned`, {
      relatedId: ticketId,
      relatedKind: "ticket",
    });
  },

  takeOverConversation: (ticketId) => {
    const ticket = get().tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              status: "in_progress",
              assigneeId: currentUser.id,
              handoff: t.handoff ? { ...t.handoff, takenOverBy: currentUser.id, takenOverAt: new Date().toISOString() } : t.handoff,
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
      conversations: s.conversations.map((c) => (c.id === ticket.conversationId ? { ...c, aiActive: false, status: "active" } : c)),
    }));
    get().addActivity(ticket.customerId, "human_action", HUMAN_ACTOR, `${currentUser.name} took over the conversation`, {
      relatedId: ticketId,
      relatedKind: "ticket",
    });
  },

  resolveTicket: (ticketId, reason) => {
    const ticket = get().tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === ticketId
          ? { ...t, status: "resolved", resolvedAt: new Date().toISOString(), closedReason: reason, updatedAt: new Date().toISOString() }
          : t
      ),
      // The chat behind a resolved ticket is finished, so the assistant stops answering it.
      conversations: s.conversations.map((c) => (c.id === ticket.conversationId ? { ...c, aiActive: false, status: "resolved" } : c)),
    }));
    get().addActivity(ticket.customerId, "ticket_resolved", HUMAN_ACTOR, `Ticket ${ticket.number} resolved${reason ? ` — ${reason}` : ""}`, {
      relatedId: ticketId,
      relatedKind: "ticket",
    });
    get().adjustCustomerHealth(ticket.customerId, 4, `Health improved — ${ticket.number} resolved`);
  },

  sendMessage: (conversationId, content) => {
    const conversation = get().conversations.find((c) => c.id === conversationId);
    if (!conversation) return;
    const message: Message = {
      id: nextId("msg"),
      conversationId,
      channel: conversation.channel,
      sender: { type: "human", userId: currentUser.id },
      direction: "outbound",
      content,
      createdAt: new Date().toISOString(),
      externalMessageId: nextId("ext"),
    };
    set((s) => ({
      messages: [...s.messages, message],
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, lastMessageAt: message.createdAt, lastMessagePreview: content, unreadCount: 0 } : c
      ),
    }));
    get().addActivity(conversation.customerId, "message", HUMAN_ACTOR, "Message sent", {
      relatedId: conversationId,
      relatedKind: "conversation",
    });
  },

  simulateAIReply: (conversationId, content, meta) => {
    const conversation = get().conversations.find((c) => c.id === conversationId);
    if (!conversation) return;
    const message: Message = {
      id: nextId("msg"),
      conversationId,
      channel: conversation.channel,
      sender: { type: "ai", agentId: "agent-sales" },
      direction: "outbound",
      content,
      createdAt: new Date().toISOString(),
      aiMeta: meta,
      externalMessageId: nextId("ext"),
    };
    set((s) => ({
      messages: [...s.messages, message],
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, lastMessageAt: message.createdAt, lastMessagePreview: content } : c
      ),
    }));
    get().addActivity(conversation.customerId, "ai_action", { type: "ai", agentId: "agent-sales", agentName: "Sales Agent" }, "AI responded", {
      relatedId: conversationId,
      relatedKind: "conversation",
    });
  },

  markConversationRead: (conversationId) => {
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
    }));
  },

  markNotificationRead: (id) => {
    set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
  },

  markAllNotificationsRead: () => {
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
  },

  toggleAutomation: (id) => {
    set((s) => ({
      automations: s.automations.map((a) =>
        a.id === id ? { ...a, status: a.status === "active" ? "disabled" : "active" } : a
      ),
    }));
  },

  runAutomationOnce: (id) => {
    set((s) => ({
      automations: s.automations.map((a) =>
        a.id === id ? { ...a, runs30d: a.runs30d + 1, lastRunAt: new Date().toISOString() } : a
      ),
    }));
  },

  addKnowledgeDocument: (doc) => {
    const newDoc: KnowledgeDocument = {
      id: nextId("kb"),
      title: doc.title,
      type: doc.type ?? "pdf",
      category: doc.category ?? "product",
      status: "processing",
      version: 1,
      chunkCount: 0,
      usedByAgentIds: [],
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      sizeLabel: doc.sizeLabel ?? "—",
      retrievalCount30d: 0,
      excerpt: doc.excerpt ?? "Processing document — content will appear once indexing completes.",
      versions: [{ version: 1, updatedAt: new Date().toISOString(), updatedBy: currentUser.name, changeSummary: "Initial upload" }],
    };
    set((s) => ({ knowledgeDocuments: [newDoc, ...s.knowledgeDocuments] }));
  },

  switchAgentVersion: (agentId, version) => {
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              version,
              versions: a.versions.map((v) => ({ ...v, status: v.version === version ? "current" : v.status === "current" ? "previous" : v.status })),
            }
          : a
      ),
    }));
  },

  createLead: ({ name, email, companyName, source, requirement, ownerId }) => {
    const companyId = nextId("co");
    const customerId = nextId("cus");
    const leadId = nextId("lead");
    const company: Company = {
      id: companyId,
      name: companyName,
      domain: companyName.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com",
      industry: "—",
      size: "—",
      location: "—",
      logoLetter: companyName[0]?.toUpperCase() ?? "?",
    };
    const palette = ["#0284C7", "#7C3AED", "#D97706", "#16A34A", "#DC2626", "#DB2777"];
    const customer: Customer = {
      id: customerId,
      name,
      email,
      phone: "—",
      companyId,
      avatarColor: palette[Math.abs(hashString(customerId)) % palette.length],
      ownerId,
      stage: "lead",
      source,
      firstTouchAt: new Date().toISOString(),
      consent: { preferredChannel: "email", marketing: true, transactional: true, optedOut: [] },
      health: { score: 50, category: "healthy", engagement: 50, supportLoad: 0, usage: 50, paymentHealth: 100, sentiment: "stable", trend: "flat", churnRisk: 50, upsellSignal: false },
      tags: [],
    };
    const lead: Lead = {
      id: leadId,
      customerId,
      source,
      stage: "new",
      score: 50,
      scoreReasons: [{ label: "Newly created — not yet qualified by AI", signal: "neutral" }],
      ownerId,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      intent: "medium",
      budgetSignal: "unknown",
      requirement,
    };
    set((s) => ({
      companies: [company, ...s.companies],
      customers: [customer, ...s.customers],
      leads: [lead, ...s.leads],
    }));
    get().addActivity(customerId, "lead_created", HUMAN_ACTOR, "Lead created manually", { relatedId: leadId, relatedKind: "lead" });
    return leadId;
  },

  createDeal: ({ name, customerId, amount, stage, expectedCloseAt }) => {
    const dealId = nextId("deal");
    const deal: Deal = {
      id: dealId,
      name,
      customerId,
      ownerId: currentUser.id,
      stage,
      amount,
      probability: stage === "won" ? 100 : stage === "negotiation" ? 60 : stage === "proposal" ? 45 : 20,
      expectedCloseAt,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      tasks: [],
    };
    set((s) => ({ deals: [deal, ...s.deals] }));
    get().addActivity(customerId, "deal_created", HUMAN_ACTOR, `Deal created — ${name}`, { relatedId: dealId, relatedKind: "deal" });
    return dealId;
  },

  createTicket: ({ customerId, subject, description, priority }) => {
    // The id is the server's key for the ticket, so it must be unique per company, not just on this screen.
    const ticketId = demoMode ? nextId("tck") : `tck-${crypto.randomUUID()}`;
    const conversationId = nextId("conv");
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: conversationId,
      customerId,
      channel: "email",
      category: "support",
      subject,
      unreadCount: 0,
      priority: priority === "urgent" ? "urgent" : priority === "high" ? "high" : "normal",
      lastMessageAt: now,
      lastMessagePreview: description,
      aiActive: true,
      status: "active",
      externalThreadId: nextId("ext"),
    };
    const ticket: Ticket = {
      id: ticketId,
      number: `#${1000 + Math.abs(hashString(ticketId)) % 9000}`,
      customerId,
      subject,
      description,
      priority,
      status: "open",
      knowledgeUsed: [],
      actions: [],
      slaMinutesRemaining: priority === "urgent" ? 60 : priority === "high" ? 240 : 480,
      createdAt: now,
      updatedAt: now,
      conversationId,
    };
    set((s) => ({ tickets: [ticket, ...s.tickets], conversations: [conversation, ...s.conversations] }));
    get().addActivity(customerId, "ticket_created", HUMAN_ACTOR, `Ticket ${ticket.number} opened — ${subject}`, { relatedId: ticketId, relatedKind: "ticket" });
    return ticketId;
  },

  createAutomation: ({ name, description, trigger }) => {
    const id = nextId("auto");
    const automation: Automation = {
      id,
      name,
      description,
      trigger,
      status: "draft",
      runs30d: 0,
      successRate: 0,
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "n1", kind: "trigger", label: "Trigger", x: 260, y: 40 },
        { id: "n2", kind: "action", label: "Add an action", x: 260, y: 180 },
      ],
    };
    set((s) => ({ automations: [automation, ...s.automations] }));
    return id;
  },

  resetDemoData: () => {
    set({
      leads: initialLeads,
      deals: initialDeals,
      tickets: initialTickets,
      approvals: initialApprovals,
      automations: initialAutomations,
      notifications: initialNotifications,
      conversations: initialConversations,
      messages: initialMessages,
      activities: initialActivities,
      agents: initialAgents,
      knowledgeDocuments: initialKnowledge,
      customers: initialCustomers,
      companies: initialCompanies,
    });
  },
}), {
  // Tickets, approvals, notifications and the rest survive a reload, like leads and HR records do.
  name: scoped("janus.crm-records.v1"), version: 1, storage: createJSONStorage(() => workspaceStorage),
  // A saved copy from an earlier demo drops its demo records outside demo mode; records the company made stay.
  merge: (persisted, current) => {
    const saved = { ...current, ...(persisted as Partial<AppState>) } as AppState;
    if (demoMode) return saved;
    const next = { ...saved } as Record<string, unknown>;
    let repaired = false;
    for (const [key, value] of Object.entries(next)) {
      if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string")) {
        const result = unique(value as { id: string }[]);
        next[key] = result.items;
        repaired ||= result.changed;
      }
    }
    // Save the repaired copy once, so the server's copy is cleaned too (only by people who may save it).
    if (repaired) setTimeout(() => useAppStore.setState({}), 0);
    for (const key of Object.keys(demoSeeds) as (keyof typeof demoSeeds)[]) {
      const seeded = new Set((demoSeeds[key] as { id: string }[]).map((item) => item.id));
      const kept = ((next[key] as { id: string }[] | undefined) ?? []).filter((item) => !seeded.has(item.id));
      next[key] = kept;
    }
    return next as unknown as AppState;
  },
  partialize: (state) => ({ leads: state.leads, deals: state.deals, tickets: state.tickets, approvals: state.approvals, automations: state.automations, notifications: state.notifications, conversations: state.conversations, messages: state.messages, activities: state.activities, agents: state.agents, knowledgeDocuments: state.knowledgeDocuments, customers: state.customers, companies: state.companies }),
}));

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export function useCustomer(customerId: string | undefined) {
  return useAppStore((s) => (customerId ? s.customers.find((c) => c.id === customerId) : undefined));
}

export function useCompany(companyId: string | undefined) {
  return useAppStore((s) => (companyId ? s.companies.find((c) => c.id === companyId) : undefined));
}
