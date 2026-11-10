#!/usr/bin/env node
// Fills a test account's Portfolio with realistic records, through the same API the app uses, so
// every number on the Portfolio comes from records like real ones and passes the same checks.
//
//   SEED_EMAIL=you@example.com SEED_PASSWORD='...' node scripts/seed-portfolio.mjs
//   SEED_URL=http://localhost:3011 ...        (default http://localhost:3000, as dev-up starts it)
//
// Sign up and verify the account first (dev-up prints the verification link). The account's own
// company becomes the first of three; two more are added: "<first word> Retail" and
// "<first word> Exports". It adds about 13 months of invoices, payments, supplier bills with GST,
// leads and deals, employees with salaries, the filing plan with most filings recorded, registration
// details, documents (one expiring, one expired), a bank statement, months from before Janus as if
// imported from Tally, an invoice between the companies, and monthly targets.
//
// For testing only: the people, customers and numbers are made up. It refuses to run twice on the
// same account (it stops if the Retail company exists), and it never deletes anything.

const BASE = (process.env.SEED_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Set SEED_EMAIL and SEED_PASSWORD to a verified test account.");
  process.exit(1);
}

let cookie = "";
const RUN = Date.now().toString(36);
async function call(method, path, body, headers = {}) {
  const response = await fetch(`${BASE}/api/backend${path}`, {
    method,
    headers: { Origin: BASE, "Content-Type": "application/json", cookie, ...headers },
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
const keyed = (key) => ({ "Idempotency-Key": `${RUN}-${key}`.slice(0, 80) });

// Dates in India, relative to today.
const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const daysAgo = (days) => { const date = new Date(today); date.setDate(date.getDate() - days); return iso(date); };
const monthDay = (back, day) => { const date = new Date(today.getFullYear(), today.getMonth() - back, 1); date.setDate(Math.min(day, 28)); return date; };
const monthKey = (back) => { const date = monthDay(back, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; };
// The same "random" numbers every run, so the seeded Portfolio looks the same each time.
let state = 7;
const rand = () => { state = (state * 48271) % 2147483647; return state / 2147483647; };
const pick = (items) => items[Math.floor(rand() * items.length)];

const CUSTOMERS = ["Kavita Stores", "Sharma Garments", "Metro Mart", "Sai Fashions", "Gupta Traders", "Lakshmi Silks", "Royal Retail", "Annapurna Textiles"];
const SUPPLIERS = ["Surat Yarn Co", "Bhiwandi Dyeing Works", "Ludhiana Packaging", "Tiruppur Knits", "Ahmedabad Cotton Mills"];
const FIRST = ["Ravi", "Meena", "Arjun", "Pooja", "Imran", "Sneha", "Vikram", "Asha", "Karan", "Divya", "Rahul", "Nisha"];
const LAST = ["Patel", "Sharma", "Iyer", "Khan", "Reddy", "Joshi", "Nair", "Gupta"];

async function enter(companyId) { await call("POST", "/me/switch-tenant", { tenant_id: Number(companyId) }); }

async function sales(company, plan) {
  // Each month: a few invoices to customers with GST, most paid in time; the oldest unpaid ones age.
  for (let back = 12; back >= 0; back--) {
    const invoices = back === 0 ? 2 : 3 + Math.floor(rand() * 3);
    for (let n = 0; n < invoices; n++) {
      const day = back === 0 ? Math.max(1, today.getDate() - 1 - n) : 3 + n * 6;
      const date = monthDay(back, day);
      if (date > today) continue;
      const due = new Date(date); due.setDate(due.getDate() + 30);
      const rate = Math.round(plan.monthly * (0.18 + rand() * 0.2) * (1 + (12 - back) * plan.growth) * 100);
      const invoice = await call("POST", "/finance/invoices", {
        customer: "Accounts", customer_company: pick(CUSTOMERS), invoice_date: iso(date), due_date: iso(due), same_state: rand() > 0.3,
        lines: [{ item: pick(plan.items), hsn: plan.hsn, qty: 1, rate_paise: rate, gst_rate: plan.gst }],
      }, keyed(`${company}-inv-${back}-${n}`));
      // Paid unless recent, or one of the few left unpaid on purpose (overdue for the money views).
      const unpaid = back === 0 || (back === 1 && n >= 2) || (back >= 2 && back <= 3 && n === 0 && plan.lateCustomers);
      if (!unpaid) {
        const paidOn = new Date(Math.min(due.getTime() - 86400000 * Math.floor(rand() * 10), today.getTime()));
        await call("POST", `/finance/invoices/${invoice.id}/payments`, { amount_paise: invoice.total_paise ?? Math.round(rate * (1 + plan.gst / 100)), method: pick(["UPI", "Bank transfer"]), reference: `NEFT${RUN}${company}${back}${n}`.slice(0, 40), paid_on: iso(paidOn) }, keyed(`${company}-pay-${back}-${n}`));
      }
    }
    // Supplier bills with their GST; recent ones unpaid, one left late on purpose.
    for (let n = 0; n < 2; n++) {
      const date = monthDay(back, 5 + n * 10);
      if (date > today) continue;
      const due = new Date(date); due.setDate(due.getDate() + 21);
      const taxable = Math.round(plan.monthly * plan.costShare * (0.4 + rand() * 0.2) * 100);
      const gst = Math.round(taxable * 0.12);
      const bill = await call("POST", "/finance/bills", { vendor: pick(SUPPLIERS), vendor_bill_no: `SUP-${back}${n}-${RUN}`.slice(0, 40), bill_date: iso(date), due_date: iso(due), amount_paise: taxable + gst, gst_paise: gst }, keyed(`${company}-bill-${back}-${n}`));
      // Paid when due, except this month's (not due yet) and one left late where planned.
      if (due < today && !(back === 1 && n === 0 && plan.lateBills)) {
        await call("POST", `/finance/bills/${bill.id}/payments`, { amount_paise: taxable + gst, method: "Bank transfer", reference: `PAY${RUN}${company}${back}${n}`.slice(0, 40), paid_on: iso(due < today ? due : today) }, keyed(`${company}-billpay-${back}-${n}`));
      }
    }
  }
}

async function crm(company, count) {
  const stages = ["new", "qualified", "proposal", "negotiation", "won", "won", "lost"];
  for (let n = 0; n < count; n++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const lead = await call("POST", "/leads", { name, phone: `9${String(800000000 + Math.floor(rand() * 199999999)).slice(0, 9)}`, company: pick(CUSTOMERS), requirement: "Bulk order enquiry" }, keyed(`${company}-lead-${n}`));
    const stage = pick(stages);
    await call("POST", `/leads/${lead.id}/deal`, { name: `Order from ${name}`, amount: String(Math.round(20000 + rand() * 280000)), stage, expectedCloseAt: daysAgo(-30 - n), ...(stage === "lost" ? { lostReason: "Price" } : {}) });
  }
}

async function people(company, count, prefix) {
  const employee = (n) => ({ id: `${prefix}-${n}`, name: `${pick(FIRST)} ${pick(LAST)}`, email: `${prefix}${n}.${RUN}@example.com`, title: pick(["Sales executive", "Accountant", "Store manager", "Weaver", "Designer"]), department: pick(["Sales", "Finance", "Operations"]), managerId: null, status: "active", salaryMonthly: 18000 + Math.round(rand() * 40) * 1000 });
  await call("POST", "/hr/records/seed", { records: { employee: Array.from({ length: count }, (_, n) => employee(n + 1)) } });
}

async function compliance(company, details) {
  await call("PUT", `/portfolio/companies/${company}/compliance`, { gstin: details.gstin, gstFiling: "monthly", tds: true, pfEsi: true, company: true });
  await call("PUT", `/portfolio/companies/${company}/registration`, details.registration);
  // Every filing since last April is recorded as filed with an acknowledgement, except the newest
  // few left open on purpose.
  const register = await call("GET", "/portfolio/compliance/register");
  const open = register.filter((due) => due.companyId === String(company) && due.status === "overdue").sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  for (const due of open.slice(0, Math.max(0, open.length - details.leaveUnfiled))) {
    const filed = new Date(due.dueOn); filed.setDate(filed.getDate() - 2);
    await call("PUT", `/portfolio/companies/${company}/filings/${encodeURIComponent(due.key)}`, { filedOn: iso(filed < today ? filed : today), acknowledgement: `AA${String(Math.floor(rand() * 1e12)).padStart(12, "0")}` });
  }
}

async function documents(company, list) {
  for (const doc of list) await call("POST", `/portfolio/companies/${company}/documents`, doc);
}

async function bank(company, opening, monthlyIn, monthlyOut) {
  // A current account over 120 days: money in from customers, out to suppliers, rent and salaries.
  let balance = opening;
  const rows = [{ date: daysAgo(120), description: "Opening balance brought forward", amount: String(opening), balance: String(opening) }];
  for (let day = 115; day >= 2; day -= 5) {
    const into = Math.round(monthlyIn / 6 * (0.6 + rand() * 0.8));
    const out = Math.round(monthlyOut / 6 * (0.6 + rand() * 0.8));
    balance += into; rows.push({ date: daysAgo(day), description: `NEFT CR ${pick(CUSTOMERS).toUpperCase()}`, amount: String(into), balance: String(balance) });
    balance -= out; rows.push({ date: daysAgo(day), description: `NEFT DR ${pick(SUPPLIERS).toUpperCase()}`, amount: String(-out), balance: String(balance) });
  }
  await call("POST", `/portfolio/companies/${company}/bank-statement`, { account: "Current account", rows });
}

async function history(company, monthly) {
  // The year before the books moved to Janus, as a monthly summary from Tally would give it.
  const months = [];
  for (let back = 24; back >= 13; back--) months.push({ month: monthKey(back), sales: String(Math.round(monthly * (0.75 + rand() * 0.3))), costs: String(Math.round(monthly * 0.55 * (0.8 + rand() * 0.3))) });
  await call("POST", `/portfolio/companies/${company}/history`, { source: "tally", months });
}

(async () => {
  await call("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  const me = await call("GET", "/me");
  const first = { id: String(me.tenant.id), name: me.tenant.name };
  const word = first.name.split(" ")[0];
  const existing = await call("GET", "/portfolio/summary?period=month");
  if (existing.companies.some((item) => item.name === `${word} Retail`)) {
    console.error(`${word} Retail already exists: this account was seeded before. Use a fresh account.`);
    process.exit(1);
  }
  console.log(`Seeding the Portfolio of ${EMAIL} at ${BASE}, starting from ${first.name}.`);
  const retail = await call("POST", "/portfolio/companies", { name: `${word} Retail`, industry: "Retail" });
  const exports = await call("POST", "/portfolio/companies", { name: `${word} Exports`, industry: "Textiles" });
  const companies = [
    { ...first, plan: { monthly: 900000, growth: 0.02, gst: 5, hsn: "5208", items: ["Cotton fabric", "Printed cotton", "Linen blend"], costShare: 0.55, lateCustomers: true, lateBills: false }, staff: 9, leads: 14,
      bank: [1800000, 950000, 1000000], gstin: "27AABCN1234F1Z5", leave: 1,
      registration: { entityType: "pvt_ltd", legalName: `${first.name} Private Limited`, cin: "U17110MH2015PTC123456", pan: "AABCN1234F", tan: "MUMN12345B", ptState: "MH", city: "Mumbai", state: "Maharashtra", incorporatedOn: "2015-06-12", directors: [{ name: "Owner", roles: ["founder", "director"] }] },
      docs: [{ kind: "licence", name: "Shop and establishment licence", number: "MH-SE-2021-55821", expiresOn: daysAgo(-20) }, { kind: "insurance", name: "Fire and stock insurance", number: "POL/FIRE/88213", expiresOn: daysAgo(-210) }] },
    { id: retail.id, name: retail.name, plan: { monthly: 450000, growth: -0.01, gst: 12, hsn: "6204", items: ["Kurtas", "Sarees", "Dress material"], costShare: 0.7, lateCustomers: false, lateBills: true }, staff: 6, leads: 10,
      bank: [600000, 420000, 520000], gstin: "27AABCN5678G1Z2", leave: 3,
      registration: { entityType: "llp", legalName: `${retail.name} LLP`, pan: "AABFN5678G", city: "Pune", state: "Maharashtra", incorporatedOn: "2019-01-20" },
      docs: [{ kind: "licence", name: "Trade licence", number: "PMC/TL/44120", expiresOn: daysAgo(4) }] },
    { id: exports.id, name: exports.name, plan: { monthly: 1300000, growth: 0.04, gst: 5, hsn: "5209", items: ["Export denim", "Twill fabric"], costShare: 0.62, lateCustomers: false, lateBills: false }, staff: 12, leads: 8,
      bank: [3500000, 1400000, 1250000], gstin: "24AABCN9012H1Z8", leave: 0,
      registration: { entityType: "pvt_ltd", legalName: `${exports.name} Private Limited`, cin: "U17120GJ2018PTC098765", pan: "AABCN9012H", tan: "AHMN54321C", city: "Ahmedabad", state: "Gujarat", incorporatedOn: "2018-09-03" },
      docs: [{ kind: "registration", name: "Import Export Code (IEC)", number: "0318012345", expiresOn: null }, { kind: "trademark", name: "Brand trademark, class 24", number: "TM-4412890", expiresOn: daysAgo(-400) }] },
  ];
  for (const company of companies) {
    console.log(`· ${company.name}`);
    await enter(company.id);
    for (const type of ["finance_accounting", "hr_people", "operations_inventory"]) { try { await call("POST", "/workspaces", { type }); } catch { /* already on */ } }
    await crm(company.id, company.leads);
    await sales(company.id, company.plan);
    await people(company.id, company.staff, `seed${company.id}`);
    await compliance(company.id, { gstin: company.gstin, registration: company.registration, leaveUnfiled: company.leave });
    await documents(company.id, company.docs);
    await bank(company.id, ...company.bank);
    await history(company.id, company.plan.monthly);
    await call("PUT", `/portfolio/companies/${company.id}/targets`, { leads: String(company.leads + 4), wonValue: String(company.plan.monthly), collected: String(Math.round(company.plan.monthly * 0.9)) });
    // Last month's salaries, posted to the books for all but the Retail company.
    if (company.id !== retail.id) await call("POST", `/portfolio/companies/${company.id}/payroll`, { month: monthKey(1) });
  }
  // Sales between the companies: the first sells cloth to Retail; one bill is recorded, one is not.
  await enter(first.id);
  for (const [n, back] of [[1, 2], [2, 0]]) {
    const date = monthDay(back, back ? 12 : Math.max(1, today.getDate() - 1));
    await call("POST", "/finance/invoices", { customer: "Purchase", customer_company: retail.name, invoice_date: iso(date), due_date: iso(date), same_state: true, lines: [{ item: "Cotton fabric", hsn: "5208", qty: 1, rate_paise: 18000000 + n * 2000000, gst_rate: 5 }] }, keyed(`ic-${n}`));
  }
  const links = await call("GET", "/portfolio/intercompany");
  const older = links.filter((link) => !link.bill).sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))[0];
  if (older) await call("POST", "/portfolio/intercompany/bills", { sellerId: older.sellerId, invoice: older.invoice });
  await call("POST", "/portfolio/knowledge", { companyId: first.id, kind: "fact", title: "Payments", body: "Kavita Stores pays on the 20th of each month; GST returns are filed by our CA, Mehta and Co." });
  console.log("Done. Open the Portfolio to see it.");
})().catch((error) => { console.error(error.message); process.exit(1); });
