import * as React from "react";
import type { HrDemoRole } from "@/lib/types";

/**
 * Who the demo is being viewed as. The signed-in person is the Owner and sees everything.
 * HR, Finance and Employee are previews of what those people get after the Owner gives them access.
 * The values reuse the HR role names so the existing HR access rules keep working.
 */
export type Persona = Extract<HrDemoRole, "owner" | "hr_manager" | "payroll_admin" | "employee">;

export const personaOptions: { id: Persona; label: string; hint: string }[] = [
  { id: "owner", label: "Owner (you)", hint: "Everything across the business, HR and CRM." },
  { id: "hr_manager", label: "HR", hint: "People, leave, attendance, hiring and policies. No CRM, no business finance." },
  { id: "payroll_admin", label: "Finance", hint: "Payroll, reimbursements and statutory filings. No leave or employee records." },
  { id: "employee", label: "Employee", hint: "Own work, leave, pay and documents only." },
];

const KEY = "janus.hr-demo-role";
const EVENT = "janus:hr-demo-role";

/** Older previews stored roles that no longer exist (Business Manager, Reporting Manager). They fall back to Owner. */
export function normalizePersona(value: string | null | undefined): Persona {
  return value === "hr_manager" || value === "payroll_admin" || value === "employee" ? value : "owner";
}
export function readPersona(): Persona {
  try { return normalizePersona(window.localStorage.getItem(KEY)); } catch { return "owner"; }
}
export function writePersona(persona: Persona) {
  try { window.localStorage.setItem(KEY, persona); } catch { /* private mode: the preview just won't persist */ }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); };
}
export function usePersona(): Persona {
  return React.useSyncExternalStore(subscribe, readPersona, () => "owner");
}

/** What the session grants each preview. Owner keeps the wildcard. */
export function personaPermissions(persona: Persona): string[] {
  if (persona === "owner") return ["*"];
  if (persona === "hr_manager") return ["hr:self", "hr:read", "hr:manage", "hr:approve", "hr:team", "hr:payroll:read"];
  if (persona === "payroll_admin") return ["hr:self", "hr:payroll:read", "hr:read"];
  return ["hr:self"];
}

/** Everything outside the HR workspace is the Owner's. Others are sent back to their own home. */
export function personaMayOpen(persona: Persona, pathname: string) {
  return persona === "owner" || pathname.startsWith("/workspace/hr-people");
}
export const personaHome = "/workspace/hr-people?view=my-home&workspace=hr-people";
