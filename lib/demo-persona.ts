import * as React from "react";
import type { HrDemoRole } from "@/lib/types";
import { accountById, type DemoAccount } from "@/lib/demo-accounts";
import { activeCompany, portfolioHome, readCompanies } from "@/lib/company";

/** The HR role of whoever is signed in (or being viewed). */
export type Persona = HrDemoRole;

const LOGIN_KEY = "janus.demo-login";
const VIEW_KEY = "janus.demo-view";
const EVENT = "janus:demo-account";

function read(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* private mode: the session just won't persist */ }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); };
}

/** Who signed in. Null until someone does. */
export const readLogin = () => accountById(read(LOGIN_KEY));
/** Whose screens are on show. The Owner can view as anyone; everyone else sees only their own. */
export function readView(): DemoAccount | undefined {
  const login = readLogin();
  if (!login) return undefined;
  const viewed = accountById(read(VIEW_KEY));
  return login.hrRole === "owner" && viewed ? viewed : login;
}
export function signIn(accountId: string) { write(VIEW_KEY, null); write(LOGIN_KEY, accountId); }
export function signOut() { write(VIEW_KEY, null); write(LOGIN_KEY, null); }
export function viewAs(accountId: string) { write(VIEW_KEY, accountId); }

const idOf = (account: DemoAccount | undefined) => account?.id ?? "";
/** Hook returns the id so React compares strings, not fresh objects. */
function useId(read: () => DemoAccount | undefined) {
  return React.useSyncExternalStore(subscribe, () => idOf(read()), () => "");
}
export const useLoginAccount = () => accountById(useId(readLogin));
/** The account whose screens are on show, undefined while signed out. */
export const useDemoAccount = () => accountById(useId(readView));
export function usePersona(): Persona { return useDemoAccount()?.hrRole ?? "owner"; }

/** The employee the HR screens act as. Falls back to the Owner so server-side rendering has a value. */
export function actorEmployeeId(role: Persona): string | null {
  const account = readView();
  return account && account.hrRole === role ? account.employeeId : null;
}

/** What the session grants. Owner keeps the wildcard; everyone else gets only what the role needs. */
export function personaPermissions(account: DemoAccount | undefined): string[] {
  if (!account || account.hrRole === "owner") return ["*"];
  const out = ["hr:self"];
  if (account.hrRole === "hr_manager") out.push("hr:read", "hr:manage", "hr:approve", "hr:team", "hr:payroll:read");
  if (account.hrRole === "payroll_admin") out.push("hr:payroll:read", "hr:read");
  if (account.hrRole === "reporting_manager") out.push("hr:team", "hr:approve");
  // These are the backend's own permission names, so the preview behaves like a real role.
  if (account.crm === "team") out.push("leads:read_team", "leads:write", "leads:assign", "reports:read", "approvals:manage");
  if (account.crm === "own") out.push("leads:read_own", "leads:write");
  return out;
}

/** CRM pages that need more than plain CRM access. Everything else under CRM only needs a CRM scope. */
const routePermission: [string, string][] = [
  ["/lead-sources", "sources:manage"], ["/leads", "leads:write"], ["/deals", "leads:write"], ["/dashboard", "leads:write"], ["/analytics", "reports:read"], ["/integrations", "settings:manage"], ["/audit", "settings:manage"], ["/usage", "billing:manage"], ["/approvals", "approvals:manage"],
  ["/ai", "ai:manage"], ["/agents", "ai:manage"], ["/memory", "ai:manage"], ["/evaluations", "ai:manage"], ["/automations", "automations:manage"], ["/knowledge", "agents:manage"], ["/settings", "settings:manage"], ["/setup", "settings:manage"],
];
const supportRoutes = ["/tickets", "/inbox", "/customers", "/notifications"];

/** Where a person may go. HR pages are open to everyone signed in; the rest depends on their CRM scope and permissions. */
export function personaMayOpen(account: DemoAccount | undefined, pathname: string) {
  if (!account) return false;
  // The Portfolio spans companies, so it belongs to the Owner alone. With no company yet, the Owner can only set one up.
  if (pathname === "/portfolio" || pathname.startsWith("/portfolio/")) return account.hrRole === "owner";
  if (account.hrRole === "owner" && readCompanies().length === 0) return pathname === "/setup" || pathname.startsWith("/setup/");
  if (pathname.startsWith("/workspace/hr-people")) return true;
  const crmCore = ["/dashboard", "/leads", "/deals", "/customers", "/inbox", "/tickets", "/lead-sources"];
  // A company that has not switched on CRM has no CRM pages for anyone, including the Owner.
  if (crmCore.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) && !activeCompany().workspaces.includes("crm-sales")) return false;
  if (account.hrRole === "owner") return true;
  if (account.crm === "none") return false;
  const needed = routePermission.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1];
  if (needed) return personaPermissions(account).includes(needed);
  if (account.crm === "support") return supportRoutes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return true;
}

export const personaHome = "/workspace/hr-people?view=my-home&workspace=hr-people";
/** The first screen after signing in. */
export const homeFor = (account: DemoAccount) => account.hrRole === "owner" ? portfolioHome : account.crm === "support" ? "/tickets?workspace=crm-sales" : account.crm !== "none" ? "/dashboard?workspace=crm-sales" : personaHome;
