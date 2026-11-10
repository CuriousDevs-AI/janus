import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { person, type CompanyKey } from "./personas";

export const BASE = process.env.JANUS_E2E_WEB ?? "http://localhost:3011";
export const API = process.env.JANUS_E2E_API ?? "http://127.0.0.1:8000";
const STATE_FILE = path.join(__dirname, ".state", "run.json");

export interface RunState {
  stamp: string;
  password: string;
  companies: Partial<Record<CompanyKey, string>>;
  channels: Record<string, string>;
  notes: Record<string, string>;
}
export const run = (): RunState => JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
export function remember(change: (state: RunState) => void) {
  const state = run();
  change(state);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
}
export const emailOf = (key: string) => `${key}.${run().stamp}@example.com`;
export const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
/** The next working day on or after the offset, avoiding weekends. Company holidays are the caller's to avoid. */
export function workday(offset: number) {
  const date = new Date(Date.now() + offset * 864e5);
  while ([0, 6].includes(date.getDay())) date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** The running API's output, where the console email backend prints each email. */
function apiLog() {
  if (process.env.JANUS_E2E_API_LOG) return process.env.JANUS_E2E_API_LOG;
  const pid = execSync(`pgrep -f "uvicorn janus_api.main:app" | tail -1`).toString().trim();
  const line = execSync(`lsof -p ${pid} | awk '$4=="1w"{print $9}'`).toString().trim();
  if (!line) throw new Error("Set JANUS_E2E_API_LOG to the API's output file: the suite reads dev emails from it.");
  return line;
}

/** The token in the last email of this kind to this address. Needs JANUS_EMAIL_BACKEND=console. */
export async function emailToken(address: string, kind: "verify-email" | "invite" | "reset-password") {
  const file = apiLog();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const lines = fs.readFileSync(file, "utf8").split("\n").filter((line) => line.includes("dev_email") && line.includes(address));
    for (const line of lines.reverse()) {
      const start = line.indexOf("{");
      const body = (JSON.parse(line.slice(start)) as { body: string }).body;
      const match = body.match(new RegExp(`/${kind}\\?token=([A-Za-z0-9_%.-]+)`));
      if (match) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No ${kind} email for ${address}`);
}

type Tokens = Record<string, string>;
const tokens: Tokens = {};

export class ApiFailure extends Error {
  constructor(public status: number, public path: string, public body: string) {
    super(`${status} on ${path}: ${body.slice(0, 300)}`);
  }
}

async function raw(method: string, route: string, body: unknown, token?: string) {
  const response = await fetch(`${API}/v1${route}`, {
    method,
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text, json: () => (text ? JSON.parse(text) : null) };
}

/** Calls the API directly as a person, in one of their companies. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- journeys read many shapes of response
export async function api<T = any>(who: string, method: string, route: string, body?: unknown, company?: CompanyKey): Promise<T> {
  const result = await apiStatus(who, method, route, body, company);
  if (result.status >= 300) throw new ApiFailure(result.status, route, result.text);
  return result.json() as T;
}

export async function apiStatus(who: string, method: string, route: string, body?: unknown, company?: CompanyKey) {
  const key = `${who}:${company ?? ""}`;
  if (!tokens[key]) {
    const login = await raw("POST", "/auth/login", { email: emailOf(who), password: run().password });
    if (login.status !== 200) throw new ApiFailure(login.status, "/auth/login", login.text);
    tokens[key] = login.json().access_token;
    if (company) {
      const switched = await raw("POST", "/me/switch-tenant", { tenant_id: Number(run().companies[company]) }, tokens[key]);
      if (switched.status !== 200) throw new ApiFailure(switched.status, "/me/switch-tenant", switched.text);
      tokens[key] = switched.json().access_token;
    }
  }
  return raw(method, route, body, tokens[key]);
}

export async function acceptInvite(address: string, name: string) {
  const token = await emailToken(address, "invite");
  const accepted = await raw("POST", `/invitations/${token}/accept`, { name, password: run().password });
  if (accepted.status >= 300) throw new ApiFailure(accepted.status, "accept invite", accepted.text);
}

/** A shared Portfolio sends one invitation per company: the first creates the login, the rest join with it. */
export async function acceptEveryInvite(who: string, name: string) {
  const address = emailOf(who);
  const links = fs.readFileSync(apiLog(), "utf8").split("\n").filter((line) => line.includes("dev_email") && line.includes(address));
  const found = [...new Set(links.map((line) => (JSON.parse(line.slice(line.indexOf("{"))) as { body: string }).body.match(/\/invite\?token=([A-Za-z0-9_%.-]+)/)?.[1]).filter(Boolean))] as string[];
  let token: string | undefined;
  for (const link of found) {
    const accepted = await raw("POST", `/invitations/${decodeURIComponent(link)}/accept`, token ? {} : { name, password: run().password }, token);
    // One link accepts the others sent with it, so a later link says it was already accepted.
    if (accepted.status === 409 && accepted.text.includes("invitation_used")) continue;
    if (accepted.status >= 300) throw new ApiFailure(accepted.status, "accept invite", accepted.text);
    token = accepted.json().access_token;
  }
  return found.length;
}

/** Sends the invite as the owner and accepts it as the person. */
export async function hire(key: string, role: string, company?: CompanyKey, by = "vikram") {
  const address = emailOf(key);
  await api(by, "POST", "/invitations", { email: address, role }, company);
  await acceptInvite(address, person(key).name);
}

export interface Session {
  page: Page;
  context: BrowserContext;
  /** Server errors and crashes seen so far. A journey checks this is empty at its end. */
  problems: string[];
}

/** One person's browser, signed in. Several can be open at once, so people can work with each other. */
export async function signIn(browser: Browser, who: string, company?: CompanyKey): Promise<Session> {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 1000 } });
  const headers = { Origin: BASE };
  const login = await context.request.post("/api/backend/auth/login", { headers, data: { email: emailOf(who), password: run().password } });
  expect(login.status(), `${who} signs in`).toBe(200);
  if (company) {
    const switched = await context.request.post("/api/backend/me/switch-tenant", { headers, data: { tenant_id: Number(run().companies[company]) } });
    expect(switched.status(), `${who} switches to ${company}`).toBe(200);
  }
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`crash: ${error.message.slice(0, 200)}`));
  page.on("response", (response) => {
    if (response.status() >= 500 && response.url().includes("/api/")) problems.push(`${response.status()} ${response.url().replace(BASE, "")}`);
  });
  return { page, context, problems };
}

export const workspaceUrl = (workspace: string, view?: string) => `/workspace/${workspace}?${view ? `view=${view}&` : ""}workspace=${workspace}`;

/** Opens a page and waits until it has finished loading its data. */
export async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "load" });
  await page.locator("main").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1800);
}

export const field = (scope: Locator | Page, label: string) => scope.getByLabel(label, { exact: true }).first();

export async function choose(scope: Locator | Page, label: string, pattern: RegExp) {
  const select = field(scope, label);
  const options = await select.locator("option").allInnerTexts();
  const option = options.find((text) => pattern.test(text));
  if (!option) throw new Error(`${label}: nothing matching ${pattern} in [${options.join(" / ")}]`);
  await select.selectOption({ label: option });
}

/** Waits for the app's confirmation message, and fails with what it said instead if it differs. */
export async function expectToast(page: Page, pattern: RegExp) {
  await expect.poll(async () => (await page.locator("[data-sonner-toast]").allInnerTexts()).join(" | "), { timeout: 12000 }).toMatch(pattern);
  // Saves are sent a moment after a change; let them leave before the page moves on.
  await page.waitForTimeout(900);
}

export async function expectVisibleText(page: Page, ...words: (string | RegExp)[]) {
  for (const word of words) await expect(page.locator("main").first(), `shows ${word}`).toContainText(word, { timeout: 15000 });
}

export function expectNoProblems(...sessions: Session[]) {
  expect(sessions.flatMap((session) => session.problems)).toEqual([]);
}
