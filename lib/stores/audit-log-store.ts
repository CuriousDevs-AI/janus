"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { userScoped } from "@/lib/stores/user-scoped";

export type AuditAction =
  | "company.created"
  | "company.edited"
  | "company.archived"
  | "company.restored"
  | "team.created"
  | "department.created"
  | "member.added"
  | "member.removed"
  | "role.changed"
  | "workspace.enabled"
  | "workspace.disabled"
  | "key.added"
  | "key.revoked"
  | "lead.created"
  | "deal.won"
  | "deal.lost"
  | "leave.approved"
  | "leave.rejected"
  | "expense.approved"
  | "expense.rejected"
  | "plan.changed"
  | "session.signed_in"
  | "session.signed_out"
  | "session.revoked"
  | "password.changed"
  | "profile.updated"
  | "access.granted"
  | "access.revoked"
  | "setup.completed";

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actor: { name: string; email: string; role: string };
  companyId: string | null;
  companyName: string | null;
  target: string;
  detail: string | null;
  before: Record<string, string> | null;
  after: Record<string, string> | null;
  device: string;
  ip: string;
  at: string;
}

interface AuditLogState {
  entries: AuditEntry[];
  append: (entry: Omit<AuditEntry, "id" | "at" | "device" | "ip">) => void;
  clear: () => void;
}

let counter = 0;
function uid(): string {
  return `al-${Date.now()}-${++counter}-${Math.random().toString(36).slice(2, 6)}`;
}

function clientIp(): string {
  return "127.0.0.1";
}

export const useAuditLog = create<AuditLogState>()(
  persist(
    (set) => ({
      entries: [],
      append: (entry) =>
        set((state) => ({
          entries: [
            {
              ...entry,
              id: uid(),
              at: new Date().toISOString(),
              device: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
              ip: clientIp(),
            },
            ...state.entries,
          ].slice(0, 500),
        })),
      clear: () => set({ entries: [] }),
    }),
    {
      name: userScoped("janus.audit-log.v1"),
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

const ACTION_LABELS: Record<AuditAction, string> = {
  "company.created": "created company",
  "company.edited": "edited company",
  "company.archived": "archived company",
  "company.restored": "restored company",
  "team.created": "created team",
  "department.created": "created department",
  "member.added": "added member",
  "member.removed": "removed member",
  "role.changed": "changed role",
  "workspace.enabled": "enabled workspace",
  "workspace.disabled": "disabled workspace",
  "key.added": "added API key",
  "key.revoked": "revoked API key",
  "lead.created": "created lead",
  "deal.won": "won deal",
  "deal.lost": "lost deal",
  "leave.approved": "approved leave",
  "leave.rejected": "rejected leave",
  "expense.approved": "approved expense",
  "expense.rejected": "rejected expense",
  "plan.changed": "changed plan",
  "session.signed_in": "signed in",
  "session.signed_out": "signed out",
  "session.revoked": "revoked session",
  "password.changed": "changed password",
  "profile.updated": "updated profile",
  "access.granted": "granted access",
  "access.revoked": "revoked access",
  "setup.completed": "completed setup",
};

export function actionLabel(action: AuditAction): string {
  return ACTION_LABELS[action] ?? action;
}

const ACTION_CATEGORIES: Record<string, AuditAction[]> = {
  Company: ["company.created", "company.edited", "company.archived", "company.restored", "setup.completed"],
  Team: ["team.created", "department.created", "member.added", "member.removed", "role.changed"],
  Workspace: ["workspace.enabled", "workspace.disabled"],
  "AI Keys": ["key.added", "key.revoked"],
  CRM: ["lead.created", "deal.won", "deal.lost"],
  HR: ["leave.approved", "leave.rejected", "expense.approved", "expense.rejected"],
  Account: ["plan.changed", "password.changed", "profile.updated"],
  Sessions: ["session.signed_in", "session.signed_out", "session.revoked"],
  Access: ["access.granted", "access.revoked"],
};

export function actionCategories(): { label: string; actions: AuditAction[] }[] {
  return Object.entries(ACTION_CATEGORIES).map(([label, actions]) => ({ label, actions }));
}
