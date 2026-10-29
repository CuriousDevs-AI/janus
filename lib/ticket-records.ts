"use client";

import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { useAppStore } from "@/lib/stores/app-store";
import type { Ticket, TicketPriority, TicketStatus } from "@/lib/types";

/**
 * Support ticket number, status, assignee and resolution are recorded on the server, which checks who
 * may change them and writes the audit row. Conversations, handoffs and SLA timers stay on the screen.
 * Each change goes to the server first and reaches the screen only when the server accepts it.
 * Demo mode keeps the local path.
 */

interface ServerTicket {
  id: string;
  external_key: string;
  number: string;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignee: string | null;
  resolution: string | null;
  raised_on: string;
}

type NewTicket = { customerId: string; subject: string; description: string; priority: TicketPriority };

const pathFor = (id: string, step?: string) =>
  step ? `/support/tickets/${encodeURIComponent(id)}/${step}` : "/support/tickets";

/** Copies the server's status, assignee and resolution onto the screen's ticket with the same key. */
function applyServerState(row: ServerTicket) {
  useAppStore.setState((state) => ({
    tickets: state.tickets.map((ticket) =>
      ticket.id === row.external_key
        ? { ...ticket, status: row.status, assigneeId: row.assignee ?? undefined, closedReason: row.resolution ?? undefined }
        : ticket,
    ),
  }));
}

function bookTicket(ticket: Ticket): Promise<ServerTicket> {
  return api<ServerTicket>(pathFor(ticket.id), {
    method: "POST",
    body: JSON.stringify({
      external_key: ticket.id,
      number: ticket.number,
      subject: ticket.subject,
      priority: ticket.priority,
      status: ticket.status,
    }),
  });
}

/**
 * Loads the company's tickets and books any screen ticket the server does not have yet, so a ticket is
 * never kept only in this browser. Tickets opened in another browser appear once they exist on screen here.
 */
export function syncSupportTickets(): Promise<void> {
  if (demoMode) return Promise.resolve();
  // A second caller while a sync runs waits for it, so the same tickets are not sent twice.
  if (!syncing) {
    syncing = loadSupportTickets().finally(() => {
      syncing = null;
    });
  }
  return syncing;
}

let syncing: Promise<void> | null = null;

async function loadSupportTickets(): Promise<void> {
  const rows = await api<ServerTicket[]>(pathFor(""));
  const known = new Set(rows.map((row) => row.external_key));
  const missing = useAppStore.getState().tickets.filter((ticket) => !known.has(ticket.id));
  const booked: ServerTicket[] = [];
  for (const ticket of missing) booked.push(await bookTicket(ticket));
  [...rows, ...booked].forEach(applyServerState);
}

/**
 * Opens a ticket on the screen and books it on the server. If the server refuses, the ticket stays on
 * screen and the next sync books it, and the returned message says so.
 */
export async function createSupportTicket(input: NewTicket): Promise<{ id: string; error: string | null }> {
  const id = useAppStore.getState().createTicket(input);
  if (demoMode) return { id, error: null };
  const ticket = useAppStore.getState().tickets.find((item) => item.id === id);
  if (!ticket) return { id, error: null };
  try {
    applyServerState(await bookTicket(ticket));
    return { id, error: null };
  } catch (error: unknown) {
    return { id, error: `${message(error)} It is kept here and sent with the next sync.` };
  }
}

/** Sends one change to the server, then applies it on the screen. Returns the refusal message, or null. */
async function record(id: string, step: string, data: unknown, apply: () => void): Promise<string | null> {
  if (!demoMode) {
    try {
      await api<ServerTicket>(pathFor(id, step), { method: "POST", body: JSON.stringify(data) });
    } catch (error: unknown) {
      return message(error);
    }
  }
  apply();
  return null;
}

export const setSupportTicketStatus = (id: string, status: Exclude<TicketStatus, "resolved">) =>
  record(id, "status", { status }, () => useAppStore.getState().updateTicketStatus(id, status));

export const assignSupportTicket = (id: string, assignee: string, by?: string) =>
  record(id, "assign", { assignee }, () => useAppStore.getState().assignTicket(id, assignee, by));

export const resolveSupportTicket = (id: string, reason?: string) =>
  record(id, "resolve", { reason: reason ?? null }, () => useAppStore.getState().resolveTicket(id, reason));

/** Moves the ticket to in progress and assigns it to the person taking over the conversation. */
export async function takeOverSupportTicket(id: string, userId: string): Promise<string | null> {
  const moved = await record(id, "status", { status: "in_progress" }, () => undefined);
  if (moved) return moved;
  return record(id, "assign", { assignee: userId }, () => useAppStore.getState().takeOverConversation(id));
}
