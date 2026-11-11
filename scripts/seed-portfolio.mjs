#!/usr/bin/env node
// Fills a test account's Portfolio with realistic records, through the same API the app uses, so
// every number on the Portfolio comes from records like real ones and passes the same checks.
//
//   SEED_EMAIL=you@example.com SEED_PASSWORD='...' node scripts/seed-portfolio.mjs
//   SEED_URL=http://localhost:3011 ...        (default http://localhost:3000, as dev-up starts it)
//
// Sign up and verify the account first (dev-up prints the verification link). The account's own
// company becomes the first of four, a manufacturer; three more are added: "<first word> Retail" (a
// store), "<first word> Exports" (import and export, with one export unpaid past nine months) and
// "<first word> Holdings" (a holding company with cash and no sales). It adds about 13 months of
// invoices, payments, supplier bills with GST,
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

// Each company sells to its own customers; the last `lost` of them bought only before Janus. The
// company being seeded sets these, so its invoices, leads, bank lines and history name its own.
let CUSTOMERS = [];
let ACTIVE = [];
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
        customer: "Accounts", customer_company: pick(ACTIVE), invoice_date: iso(date), due_date: iso(due), same_state: rand() > 0.3,
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
      // A job-work supplier's bill has 2% TDS deducted under section 194C; the supplier is paid the rest.
      const tds = n === 0 ? Math.round(taxable * 0.02) : 0;
      const bill = await call("POST", "/finance/bills", { vendor: pick(SUPPLIERS), vendor_bill_no: `SUP-${back}${n}-${RUN}`.slice(0, 40), bill_date: iso(date), due_date: iso(due), amount_paise: taxable + gst, gst_paise: gst, tds_paise: tds, ...(tds ? { tds_section: "194C" } : {}) }, keyed(`${company}-bill-${back}-${n}`));
      // Paid when due, except this month's (not due yet) and one left late where planned.
      if (due < today && !(back === 1 && n === 0 && plan.lateBills)) {
        await call("POST", `/finance/bills/${bill.id}/payments`, { amount_paise: taxable + gst - tds, method: "Bank transfer", reference: `PAY${RUN}${company}${back}${n}`.slice(0, 40), paid_on: iso(due < today ? due : today) }, keyed(`${company}-billpay-${back}-${n}`));
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
  // The first person is a senior manager, paid enough for income tax (TDS) to apply; one joined
  // this financial year, so their TDS is spread over fewer months. Branches set professional tax.
  const employee = (n) => ({ id: `${prefix}-${n}`, name: `${pick(FIRST)} ${pick(LAST)}`, email: `${prefix}${n}.${RUN}@example.com`, title: n === 1 ? "General manager" : pick(["Sales executive", "Accountant", "Store manager", "Weaver", "Designer"]), department: n === 1 ? "Operations" : pick(["Sales", "Finance", "Operations"]), managerId: null, status: "active", branch: pick(["Pune", "Mumbai", "Surat", "Bengaluru"]), joiningDate: n === 2 ? iso(monthDay(5, 10)) : "2021-04-01", salaryMonthly: n === 1 ? 150000 : 18000 + Math.round(rand() * 40) * 1000 });
  await call("POST", "/hr/records/seed", { records: { employee: Array.from({ length: count }, (_, n) => employee(n + 1)) } });
}

async function compliance(company, details) {
  await call("PUT", `/portfolio/companies/${company}/compliance`, details.plan ?? { gstin: details.gstin, gstFiling: "monthly", tds: true, pfEsi: true, company: true });
  await call("PUT", `/portfolio/companies/${company}/registration`, details.registration);
  // Every filing since last April is recorded as filed with an acknowledgement, except the newest
  // few left open on purpose.
  const register = await call("GET", "/portfolio/compliance/register");
  const open = register.filter((due) => due.companyId === String(company) && due.status === "overdue").sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  for (const due of open.slice(0, Math.max(0, open.length - details.leaveUnfiled))) {
    const filed = new Date(due.dueOn); filed.setDate(filed.getDate() - 2);
    await call("PUT", `/portfolio/companies/${company}/filings/${encodeURIComponent(due.key)}`, { filedOn: iso(filed < today ? filed : today), acknowledgement: `AA${String(Math.floor(rand() * 1e12)).padStart(12, "0")}`, ...(due.key.startsWith("tds_") ? { amount: String(Math.round(8000 + rand() * 20000)) } : {}) });
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
  // The same year customer by customer, as a party-wise sales register gives it. The last ones
  // bought then and stopped, so the Portfolio has someone to name as lost.
  // Old ledgers spell some customers their own way: the first matches on its own (case, M/s,
  // Pvt Ltd), the typo is offered to the owner to merge.
  const LEDGER = { [CUSTOMERS[0]]: `M/S ${CUSTOMERS[0].toUpperCase()} PVT LTD`, [CUSTOMERS[1]]: CUSTOMERS[1].replace(/s$/, "") };
  const rows = months.flatMap((item) => CUSTOMERS.map((customer, index) => ({ month: item.month, customer: LEDGER[customer] ?? customer, sales: String(Math.round(Number(item.sales) * (index < ACTIVE.length ? 0.1 : 0.2) * (0.7 + rand() * 0.6))) })));
  await call("POST", `/portfolio/companies/${company}/history/customers`, { source: "tally", rows });
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
  // Each company says what kind of business it is, so the Portfolio picks the measures that fit it.
  await call("PUT", `/portfolio/companies/${first.id}/details`, { name: first.name, industry: "Textiles", businessModel: "manufacturing" });
  const retail = await call("POST", "/portfolio/companies", { name: `${word} Retail`, industry: "Retail", businessModel: "retail" });
  const exports = await call("POST", "/portfolio/companies", { name: `${word} Exports`, industry: "Textiles", businessModel: "import_export" });
  const companies = [
    { ...first, plan: { monthly: 900000, growth: 0.02, gst: 5, hsn: "5208", items: ["Cotton fabric", "Printed cotton", "Linen blend"], costShare: 0.55, lateCustomers: true, lateBills: false }, staff: 9, leads: 14,
      customers: ["Kavita Stores", "Sharma Garments", "Metro Mart", "Sai Fashions", "Gupta Traders", "Lakshmi Silks", "Royal Retail", "Annapurna Textiles"], lost: 2,
      bank: [1800000, 950000, 1000000], gstin: "27AABCN1234F1Z5", leave: 1,
      registration: { entityType: "pvt_ltd", legalName: `${first.name} Private Limited`, cin: "U17110MH2015PTC123456", pan: "AABCN1234F", tan: "MUMN12345B", ptState: "MH", city: "Mumbai", state: "Maharashtra", incorporatedOn: "2015-06-12", directors: [{ name: "Owner", roles: ["founder", "director"] }] },
      docs: [{ kind: "licence", name: "Shop and establishment licence", number: "MH-SE-2021-55821", expiresOn: daysAgo(-20) }, { kind: "insurance", name: "Fire and stock insurance", number: "POL/FIRE/88213", expiresOn: daysAgo(-210) }] },
    { id: retail.id, name: retail.name, plan: { monthly: 450000, growth: -0.01, gst: 12, hsn: "6204", items: ["Kurtas", "Sarees", "Dress material"], costShare: 0.7, lateCustomers: false, lateBills: true }, staff: 6, leads: 10,
      customers: ["Bansal Boutique", "Rekha Sarees", "Pune Wedding House", "Anand Collections", "Shree Ganesh Emporium", "Kothari Stores", "Navya Ethnic"], lost: 1,
      bank: [600000, 420000, 520000], gstin: "27AABCN5678G1Z2", leave: 3,
      registration: { entityType: "llp", legalName: `${retail.name} LLP`, pan: "AABFN5678G", city: "Pune", state: "Maharashtra", incorporatedOn: "2019-01-20" },
      docs: [{ kind: "licence", name: "Trade licence", number: "PMC/TL/44120", expiresOn: daysAgo(4) }] },
    { id: exports.id, name: exports.name, plan: { monthly: 1300000, growth: 0.04, gst: 5, hsn: "5209", items: ["Export denim", "Twill fabric"], costShare: 0.62, lateCustomers: false, lateBills: false }, staff: 12, leads: 8,
      customers: ["Al Noor Trading LLC", "Denim Works", "Bristol Apparel Ltd", "Hamburg Textil GmbH", "Osaka Fabrics", "Lagos Wear", "Dubai Garment Hub", "Colombo Knit Mills", "Cape Town Clothing"], lost: 3,
      bank: [3500000, 1400000, 1250000], gstin: "24AABCN9012H1Z8", leave: 0,
      registration: { entityType: "pvt_ltd", legalName: `${exports.name} Private Limited`, cin: "U17120GJ2018PTC098765", pan: "AABCN9012H", tan: "AHMN54321C", city: "Ahmedabad", state: "Gujarat", incorporatedOn: "2018-09-03" },
      docs: [{ kind: "registration", name: "Import Export Code (IEC)", number: "0318012345", expiresOn: null }, { kind: "trademark", name: "Brand trademark, class 24", number: "TM-4412890", expiresOn: daysAgo(-400) }] },
  ];
  for (const company of companies) {
    console.log(`· ${company.name}`);
    await enter(company.id);
    CUSTOMERS = company.customers;
    ACTIVE = CUSTOMERS.slice(0, CUSTOMERS.length - company.lost);
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
    // TDS on salaries is about 5% of the month's salaries here; a real figure comes from each person's tax.
    if (company.id !== retail.id) await call("POST", `/portfolio/companies/${company.id}/payroll`, { month: monthKey(1) });
  }
  // What was owed when the first company moved to Janus, about 13 months ago: one customer has paid
  // it since, one still owes it.
  const movedOn = iso(monthDay(13, 1));
  await enter(first.id);
  await call("POST", `/portfolio/companies/${first.id}/opening-balances`, { asOf: movedOn, customers: [{ name: "Gupta Traders", amount: "185000", dueOn: iso(monthDay(13, 20)) }, { name: "Royal Retail", amount: "64000", dueOn: iso(monthDay(13, 25)) }], suppliers: [{ name: "Surat Yarn Co", amount: "92000", dueOn: iso(monthDay(13, 15)) }] });
  const openings = (await call("GET", "/finance/invoices")).filter((item) => item.opening && item.customer === "Gupta Traders");
  for (const item of openings) await call("POST", `/finance/invoices/${item.id}/payments`, { amount_paise: item.total_paise, method: "Bank transfer", reference: `OBPAY${RUN}`.slice(0, 40), paid_on: iso(monthDay(12, 10)) }, keyed("ob-pay"));
  const openBills = (await call("GET", "/finance/bills")).filter((item) => item.opening);
  for (const item of openBills) await call("POST", `/finance/bills/${item.id}/payments`, { amount_paise: item.amount_paise, method: "Bank transfer", reference: `OBBPAY${RUN}`.slice(0, 40), paid_on: iso(monthDay(13, 14)) }, keyed("obb-pay"));
  // Sales between the companies: the first sells cloth to Retail; one bill is recorded, one is not.
  await enter(first.id);
  for (const [n, back] of [[1, 2], [2, 0]]) {
    const date = monthDay(back, back ? 12 : Math.max(1, today.getDate() - 1));
    await call("POST", "/finance/invoices", { customer: "Purchase", customer_company: retail.name, invoice_date: iso(date), due_date: iso(date), same_state: true, lines: [{ item: "Cotton fabric", hsn: "5208", qty: 1, rate_paise: 18000000 + n * 2000000, gst_rate: 5 }] }, keyed(`ic-${n}`));
  }
  // An export shipped ten months ago and still unpaid: past the nine months FEMA allows.
  await enter(exports.id);
  const shipped = monthDay(10, 5);
  await call("POST", "/finance/invoices", { customer: "Accounts", customer_company: "Lagos Wear", invoice_date: iso(shipped), due_date: iso(monthDay(9, 5)), same_state: false, lines: [{ item: "Export denim", hsn: "5209", qty: 1, rate_paise: 46000000, gst_rate: 0 }] }, keyed("exports-late-shipment"));
  // A holding company: it owns the others' shares and sells nothing, so it is shown by its cash.
  const holding = await call("POST", "/portfolio/companies", { name: `${word} Holdings`, industry: "Investments", businessModel: "holding" });
  await enter(holding.id);
  try { await call("POST", "/workspaces", { type: "finance_accounting" }); } catch { /* already on */ }
  CUSTOMERS = [`${first.name} DIVIDEND`, `${exports.name} INTEREST`];
  await compliance(holding.id, { plan: { gstin: null, gstFiling: "none", tds: false, pfEsi: false, company: true }, registration: { entityType: "pvt_ltd", legalName: `${holding.name} Private Limited`, cin: "U65990MH2012PTC234567", pan: "AABCN3456K", city: "Mumbai", state: "Maharashtra", incorporatedOn: "2012-04-02", directors: [{ name: "Owner", roles: ["founder", "director"] }] }, leaveUnfiled: 0 });
  await documents(holding.id, [{ kind: "registration", name: "Certificate of incorporation", number: "U65990MH2012PTC234567", expiresOn: null }]);
  await bank(holding.id, 8500000, 60000, 45000);
  const links = await call("GET", "/portfolio/intercompany");
  const older = links.filter((link) => !link.bill).sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))[0];
  if (older) await call("POST", "/portfolio/intercompany/bills", { sellerId: older.sellerId, invoice: older.invoice });
  await call("POST", "/portfolio/knowledge", { companyId: first.id, kind: "fact", title: "Payments", body: "Kavita Stores pays on the 20th of each month; GST returns are filed by our CA, Mehta and Co." });
  console.log("Done. Open the Portfolio to see it.");
})().catch((error) => { console.error(error.message); process.exit(1); });
