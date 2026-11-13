#!/usr/bin/env node
// Puts a test account on a plan and adds sample invoices, through the same API the app uses, so the
// Portfolio's Plan and billing page has something to show. Works only where the API is not in
// production: payments are not connected, so plans change at once and invoices are marked Sample.
//
//   SEED_EMAIL=you@example.com SEED_PASSWORD='...' node scripts/seed-billing.mjs
//   SEED_PLAN=growth SEED_MONTHS=12 ...    (default startup and 6 months)
//   SEED_URL=http://localhost:3011 ...     (default http://localhost:3000, as dev-up starts it)
//
// The account must own a company, and the plan must hold the companies it already has. Running it
// again changes the plan and adds only months not invoiced yet; it never deletes anything.

const BASE = (process.env.SEED_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
const PLAN = process.env.SEED_PLAN ?? "startup";
const MONTHS = Number(process.env.SEED_MONTHS ?? 6);
if (!EMAIL || !PASSWORD) {
  console.error("Set SEED_EMAIL and SEED_PASSWORD to a verified test account.");
  process.exit(1);
}

let cookie = "";
async function call(method, path, body) {
  const response = await fetch(`${BASE}/api/backend${path}`, {
    method,
    headers: { Origin: BASE, "Content-Type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const set of response.headers.getSetCookie?.() ?? []) {
    const [pair] = set.split(";");
    const name = pair.split("=")[0];
    cookie = [...cookie.split("; ").filter((item) => item && !item.startsWith(`${name}=`)), pair].join("; ");
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

(async () => {
  await call("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  await call("PUT", "/billing/plan", { plan: PLAN });
  const billing = await call("POST", "/billing/sample-invoices", { months: MONTHS });
  console.log(`${EMAIL} is on the ${PLAN} plan, renewing ${billing.renewsOn}, with ${billing.invoices.length} sample invoices.`);
})().catch((error) => { console.error(error.message); process.exit(1); });
