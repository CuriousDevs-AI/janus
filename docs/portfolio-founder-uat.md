# Portfolio user test: a founder with three companies

A real-world acceptance test for the Portfolio. One founder, three real-looking companies, one
working week. Each scenario says what he needs, where he would look for it, what he should see,
and how to judge it. Mark every check **Pass**, **Wrong place**, **Wrong / missing** or **Bug**,
and write what you saw. At the end, the summary table gives the verdict per section.

Test account: seed one with `scripts/seed-portfolio.mjs` (see "Setting up" at the end).

---

## 1. The persona

**Vikram Malhotra**, 46, Mumbai. Second-generation textile businessman. Took over his father's
fabric business in 2012 and grew it into three companies, plus a holding company his CA set up.

| | |
|---|---|
| Role | Founder and Owner of all three companies; signs every cheque over ₹2 lakh |
| Day | 6:30 am WhatsApp, 9 am factory or office, evenings with his CA twice a month |
| Devices | iPhone all day, MacBook in the evening, never a desktop at the office |
| Comfort with software | Uses Tally reports his accountant prints, Excel, WhatsApp, net banking. Not a "dashboard person" |
| Language | Thinks in Hindi and English; numbers in lakhs and crores, never millions |
| Time for the Portfolio | 10 minutes on a Monday morning, 2 minutes when something pings him |

**His companies**

| Company | What it does | Kind of business | People | Monthly sales | His worry |
|---|---|---|---|---|---|
| Malhotra Textiles Pvt Ltd | Makes cotton and printed fabric in Bhiwandi | Manufacturing | 9 | ~₹9 lakh | Customers pay late; ₹3–4 lakh stuck over 60 days |
| Malhotra Retail LLP | Two kurta and saree stores in Pune | Retail store | 6 | ~₹4.5 lakh | Losing money after salaries; cash for under a month |
| Malhotra Exports Pvt Ltd | Ships denim to Dubai and Lagos from Ahmedabad | Import and export | 12 | ~₹13 lakh | One buyer has not paid in 10 months (FEMA's 9-month rule) |
| Malhotra Holdings Pvt Ltd | Holds the family's shares and lends to the others | Holding | 0 | none | Only cash and filings matter |

**People around him**

- **Anita Rao**, group CFO (Finance manager role): runs month-end, GST and TDS, talks to the bank.
- **Mehta & Co.**, CA firm: files returns; should see figures but change nothing (Read-only).
- **Store managers** in Pune: run their store, must never see Textiles' or Exports' money.

**What he wants from the Portfolio, in his words**

1. "Tell me in one look which company needs me today, and why."
2. "How much money is coming in, how much is stuck, and how long can each company last?"
3. "Never let me miss a GST, TDS or PF date again; the late fees are killing me."
4. "Let Anita and my CA see what they need without seeing everything."
5. "When a company has a problem, take me straight to it, in that company."
6. "One bill for Janus, for all my companies, and I decide which plan."
7. "Let me ask in plain words, like I ask Anita, and get the number, not a lecture."

**What would make him stop using it**

- Numbers that do not match what Anita tells him.
- Having to click through five screens to find one figure.
- Being dropped into the wrong company, or a settings page he did not ask for.
- Anything in US-style figures (₹1,053,525) or jargon he has to decode.

---

## 2. How to judge "correctly placed"

For every screen, ask the persona's questions:

| Check | Pass when |
|---|---|
| **Findable** | Vikram finds it in the menu where he would first look, in under 10 seconds |
| **Right level** | Group-wide things are in the Portfolio; one company's things are inside that company |
| **Right figure** | Matches the company's own records (Finance, HR, Compliance) and the other Portfolio screens |
| **Right words** | Plain English, Indian number format (₹10.5L, ₹2.3Cr), no internal terms |
| **Right next step** | Every problem shown has one obvious button that goes to where it is fixed |
| **Right people** | A role sees only what it should, and is told why when something is hidden |
| **Calm** | No jumping, no blank screens, no loading text flashing between pages |

---

## 3. The week: test scenarios

### Day 0 — First sign-in

| # | He does | Expected | Where it should be | Result |
|---|---|---|---|---|
| 0.1 | Signs up, verifies email, signs in for the first time | Sees "Choose your plan" before anything else: Free, Startup, Growth, Enterprise, each with price and what it includes | Full screen, before setup | |
| 0.2 | Picks Startup | Popup: "Start on Startup?", price with GST, then goes on to setup | Popup on the plan screen | |
| 0.3 | Adds his second and third company | "Add company" asks name, kind of business and industry | Portfolio → Companies only (not in a company's settings) | |
| 0.4 | Tries to add a fourth company on Startup | Refused, with the plan that would fit (Growth) and where to change it | Message on Add company | |
| 0.5 | Moves to Growth and adds Malhotra Holdings as a holding company | Allowed; Holdings shows cash, not a ₹0 sales chart | Portfolio → Plan and billing, then Companies | |

### Day 1 (Monday, 8:45 am) — The weekly look

| # | He does | Expected | Where it should be | Result |
|---|---|---|---|---|
| 1.1 | Opens the Portfolio | Overview: companies needing him, group sales with change, profit after salaries, money past due, to-dos | Portfolio → Overview | |
| 1.2 | Reads the company tiles | One tile per company with this month's sales and up/down; Holdings shows cash instead | Overview | |
| 1.3 | Checks the group profit against the company rows | A note says why the rows add to more than the group (sales between his own companies taken out) | Overview → Company by company | |
| 1.4 | "Which one needs me?" | Retail and Exports marked red, with the reason in one line | Overview → Needs you first and the company table | |
| 1.5 | Opens the first item in Needs you first | Popup: the issue, the figures, what to do, and "Go to …" | Popup on the Overview | |
| 1.6 | Switches to This quarter, then back | Figures stay on screen, dim, then update; nothing blanks or jumps | Period bar | |
| 1.7 | Looks at the Monday email preview | The same week in an email, money hidden for roles without it | Overview → Weekly email | |

### Day 1, later — Money

| # | He does | Expected | Where it should be | Result |
|---|---|---|---|---|
| 2.1 | "How much is stuck with customers?" | Customers owe, past due, by age (1–30, 31–60, 60+ days), per company | Portfolio → Finance | |
| 2.2 | "How long can Retail last?" | Cash in the bank from the imported statement, and months it lasts at the last 90 days' spending | Finance → Cash in the bank | |
| 2.3 | Compares profit before and after salaries | Waterfall: sales, costs, salaries, profit; says when salaries are an estimate | Finance | |
| 2.4 | Looks for the bill Textiles raised to Retail | Shown under Between your companies, with "bill missing" and a one-click record | Finance → Between your companies | |
| 2.5 | GST and TDS to pay this month | Per GSTIN: GST payable or credit; TDS deducted against deposited | Finance | |
| 2.6 | Downloads the board pack for the bank | CSV with sales, costs, profit, money in and out, each with the period before | Board pack (CSV) button | |

### Day 2 — Compliance and documents

| # | He does | Expected | Where it should be | Result |
|---|---|---|---|---|
| 3.1 | "What is due this week?" | Filings due in 7 days, per company, with the date | Portfolio → Compliance (also Overview → Coming up) | |
| 3.2 | Sees Retail's 3 filings past due | Each with interest or late fee estimate; "Record filing" | Compliance | |
| 3.3 | Records one as filed | It moves to filed and the reminder stops | Compliance | |
| 3.4 | Retail's trade licence has expired | Shown red with the expiry date; Renew; attach the scan | Compliance → Documents and renewals | |
| 3.5 | A company with no filings set up | Says "Not set up", never "Up to date" | Compliance and Companies table | |

### Day 3 — Exports: the 10-month-old payment

| # | He does | Expected | Where it should be | Result |
|---|---|---|---|---|
| 4.1 | Opens Exports' page | "What matters for import and export": sales, customers owe, unpaid over 9 months, margin | Companies → Malhotra Exports | |
| 4.2 | Sees the FEMA warning | Red line: amount unpaid over 9 months, that export money must come in within 9 months | Exports' Needs attention and Notifications | |
| 4.3 | Reads what Janus does not know | Says invoices carry no currency or shipping bill, so export and local sales are not told apart | Exports' page | |
| 4.4 | Opens the notification | Popup with the figures; "Go to Payments & Receivables" opens Exports' Finance, after moving into Exports | Notifications | |

### Day 4 — People and access

| # | He does | Expected | Where it should be | Result |
|---|---|---|---|---|
| 5.1 | Gives Anita the Finance manager role on all three | Invitations go out; she sees money, cannot add companies | Portfolio → Portfolio access | |
| 5.2 | Gives Mehta & Co. Read-only | They see sales, people and compliance, not money; told why money is hidden | Portfolio access, then Preview as | |
| 5.3 | Uses "Preview as Read-only" | Banner on every page until Exit; money hidden everywhere | Any Portfolio page | |
| 5.4 | Invites a fourth Pune staff member past the plan's people limit | Refused, with the plan that fits | Inviting in a company | |
| 5.5 | Checks who uses Janus per company | People by company: can sign in, invited, seats counted | Plan and billing | |

### Day 5 — Janus Intelligence

| # | He asks | Expected | Where it should be | Result |
|---|---|---|---|---|
| 6.1 | "Which company is performing worst this month, and why?" | Retail, on profit after salaries, with sales change, margin and the customer who fell most; Holdings named as left out | Janus Intelligence | |
| 6.2 | "Which company needs immediate attention?" | Ranked by what is wrong today, with reasons | Janus Intelligence | |
| 6.3 | "What are the biggest financial risks this quarter?" | Risks as of today, largest first: late customers, late bills, cash, loss, TDS, GST, one big customer | Janus Intelligence | |
| 6.4 | "Compare profit across companies" | Each company's profit; Holdings left out as it does not sell | Janus Intelligence | |
| 6.5 | Sets up a free AI model | "Set up model" popup: free and paid, model list, key, Save and test | Intelligence → Set up model | |
| 6.6 | Asks the same with the AI model | Answer from his figures, with sources and cost; never an invented number | Janus Intelligence | |
| 6.7 | Gives the AI key to Textiles and Exports only | Copies appear in those two; the model is listed once | Manage → AI models & keys | |

### Day 6 — Plan and billing

| # | He does | Expected | Where it should be | Result |
|---|---|---|---|---|
| 7.1 | Looks for billing | Only in the Portfolio; no billing inside any company | Portfolio → Plan and billing | |
| 7.2 | Reads invoices | Monthly, with GST, paid or due; View and Print | Plan and billing | |
| 7.3 | Moves Growth → Startup with 4 companies | Popup: keep which companies (the open one always kept), what is archived, refund for unused days | Plan and billing | |
| 7.4 | Confirms | Holdings archived, refund recorded, nothing deleted | Plan and billing | |
| 7.5 | Moves back to Growth | Holdings comes back | Plan and billing | |

### Any day — Moving around

| # | He does | Expected | Result |
|---|---|---|---|
| 8.1 | Clicks through every Portfolio menu item twice | Second visit shows at once; no blank page, no jump, no white space below | |
| 8.2 | Looks for Chat or Team in the Portfolio | Not there (they belong to a company) | |
| 8.3 | Opens a company from the Portfolio, then comes back | "Opening …" while switching; back in the Portfolio from the switcher | |
| 8.4 | Opens the account menu in the Portfolio | Plan and billing, Company settings, Portfolio access, Sign out; nothing that drops him into a random company | |
| 8.5 | Uses it on his iPhone (390 px) | Nothing scrolls sideways; tables scroll inside their card | |

---

## 4. Summary sheet

| Section | Pass | Wrong place | Wrong / missing | Bug | Notes |
|---|---|---|---|---|---|
| First sign-in and plans | | | | | |
| Overview | | | | | |
| Finance | | | | | |
| Compliance and documents | | | | | |
| Companies and kinds of business | | | | | |
| Notifications and Work inbox | | | | | |
| Access and roles | | | | | |
| Janus Intelligence and AI keys | | | | | |
| Plan and billing | | | | | |
| Moving around (speed, layout, phone) | | | | | |

**Verdict:** Would Vikram open this every Monday instead of calling Anita? Yes / Not yet, because …

---

## 5. Known limits to keep in mind while testing

These are not bugs; the screens say so where they show:

- Bank balances come from imported statements, not a live bank feed.
- Payments are in test mode until Razorpay keys are set; renewal is not automatic yet.
- Export and local sales are not told apart (invoices have no currency or shipping bill).
- Filings are not linked to government portals; a filing counts once someone records it.
- Plan limits count people with a login, not HR employees without one.

## Setting up

1. Start everything: `scripts/dev-up.sh`.
2. Sign up at http://localhost:3000/signup as Vikram Malhotra, company "Malhotra Textiles", and
   open the verification link printed in the terminal.
3. Seed his companies (takes about a minute; for a test account only):

   ```bash
   SEED_EMAIL=you@example.com SEED_PASSWORD='…' node scripts/seed-portfolio.mjs
   ```

   It adds Retail, Exports and Holdings, 13 months of records, a late export payment, documents,
   bank statements and the Growth plan with sample invoices.
4. For Day 0, use a second, unseeded account, so the plan screen shows first.
