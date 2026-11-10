# Portfolio: everything pending

**Status, 10 November 2026:** all 42 fixed (✅). Each fix has a line in `docs/decisions.md`. The list below is kept as it was written, with the marks added.

What is still missing, wrong or worth improving in the Portfolio, from three sources: the independent founder audit of 7 November 2026 (score 59/100), the owner's own review, and the research report's gap list. Grouped by priority. Effort: S (hours), M (a day or two), L (several days).

## P0: wrong or unsafe today (fix before anyone relies on it)

| # | Gap | What to change | Effort |
|---|---|---|---|
| 1 ✅ | The same sales figure shows two growth rates: ₹1.2L is "−84%" on Overview and "−73%" on Finance; Analytics shows ₹2L for the same period. | Compute every growth % on the same basis as the figure shown. Label every sales card "Group, sales between your companies taken out" or "As each company recorded". Analytics uses the group basis by default. | S |
| 2 ✅ | The headline profit ignores salaries: Malhotra shows "Profit ₹55,000" on Overview while it is a ₹3L loss after ₹3.5L salaries (₹18.6L for the quarter). | Make "Profit after salaries (estimate)" the headline, with before-salaries underneath. When a company has no HR records, show "Salaries unknown" instead of ₹0. | S |
| 3 ✅ | A company with no filings set up shows "Filings: Up to date", "Nothing due" and "On track", even with 18 staff and ₹15.3L monthly payroll. | A "Compliance not set up" state (amber), counted in health; the company's suggestions (TDS on salaries, ESI from 10, EPF from 20) offered as one-click switches; "No registration details" on a company with payroll ranked high, not low. | S–M |
| 4 ✅ | "Preview as Group analyst" is lost when moving through the sidebar, so the Owner sees their own view without knowing; the analyst preview still shows deal values under a "Money is hidden" banner. | Keep the preview on every Portfolio link until "Exit preview". Decide whether deal values are money for a group analyst (server and preview the same either way), and make the banner say exactly what is hidden. | S |

## P1: misleading or weak

| # | Gap | What to change | Effort |
|---|---|---|---|
| 5 ✅ | "Growing fastest" shows a company at −55%. | Say "Falling least" when every company fell; show nothing below a minimum. | S |
| 6 ✅ | "Best win rate 100%" comes from one deal; win rate (all time) and lead-to-win (this period) sit side by side without definitions. | Rank only from 5 closed deals up; a one-line definition under each; keep one of the two on the Overview. | S |
| 7 ✅ | The board pack CSV has no sales, costs or profit. | Add sales (group and as recorded), costs, profit before and after salaries, money in and out, each with the period before. Add a PDF board pack. Done: the CSV has the P&L; the PDF is Finance's Print button (save as PDF). | M |
| 8 ✅ | Janus Intelligence answers a different question with confidence: monthly salaries for "last quarter"; "pipeline ₹0" for "sales next month"; the group total for one customer's overdue invoices; it refuses "biggest customer" though Finance shows it. | Say what it understood before answering ("I can show monthly salaries, not last quarter's"); add questions for customer concentration and one customer's receivables; refuse forecasts plainly. Superseded in part by the AI work below. | M |
| 9 ✅ | "Bills due in 7 days" includes bills already late, and reads as "due next week". | Split into "Late" and "Due in 7 days" in Finance, as the Work inbox already does. | S |
| 10 ✅ | Margins use supplier bills that may include GST, while sales are before GST. | Record bills' taxable value and GST separately in Finance; use the taxable value for costs. Needs a Finance change. | M |

## Charts: see the Portfolio move, like a trading screen

The owner wants to see each company going up or down at a glance, the way a trading app shows a holding.

| # | What | Detail | Effort |
|---|---|---|---|
| 11 ✅ | A ticker row on the Overview | One tile per company: today's and the period's sales, with a green ▲ or red ▼ and the % against the same days before, and a 30-day sparkline. | M |
| 12 ✅ | Daily figures from the server | `trends` gives months only. Add days (and weeks) for sales, collections, leads and won value, so lines move day by day. | M |
| 13 ✅ | A group "value line" | One line for group sales (and one for collections) over 30, 90 and 365 days, with the range picker (1M, 3M, 6M, 1Y, FY) above it, green when above the same point last period, red when below. | M |
| 14 ✅ | Up/down everywhere a figure has a "before" | ▲▼ arrows with colour and the absolute change on every KPI tile and table cell that has a comparison, not only words. | S |
| 15 ✅ | Profit waterfall | Sales → minus costs → minus salaries → profit, per company and for the group. | S |
| 16 ✅ | Daily sales heatmap | A calendar of the month with each day shaded by sales, to spot quiet days. | S |
| 17 ✅ | Click through | Clicking a point opens that company, period and view. | M |
| 18 ✅ | Chart fixes from the audit | No ₹0–₹4 axis on empty data (show "Nothing collected yet"); straight lines, not curves that dip below zero; "−₹3L", not "₹-3L"; correct days in the month for "behind pace" (₹161 should be ₹1,667). | S |

## Janus Intelligence with real AI, RAG, knowledge and memory

Today Portfolio Intelligence is rules over the figures on the page. Janus already stores AI keys per company (OpenAI, Anthropic, Gemini and any OpenAI-compatible server such as Ollama, Groq or OpenRouter), calls them through one gateway and records usage and cost. None of that reaches the Portfolio yet.

| # | What | Detail | Effort |
|---|---|---|---|
| 19 ✅ | A model picker in Intelligence | A dropdown above the question box listing the models set up for the group ("Janus rules, no AI" always first), showing which one answered each reply and its cost. | S |
| 20 ✅ | Whose key pays for group questions | Keys are per company today. Add a Portfolio-level AI setting for the Owner, or let them pick which company's key the Portfolio uses. Decision needed. | S |
| 21 ✅ | Free and open-source models | Ready-made presets for a local Ollama server (Llama 3.1, Qwen 2.5, Mistral) and free tiers (Gemini Flash, Groq, OpenRouter free models). Each needs the server operator to allow its address (`JANUS_AI_ALLOWED_BASE_URLS`). "Janus rules" stays free and works with no model. | S–M |
| 22 ✅ | Grounded answers from the figures | The model never invents numbers. It calls Portfolio tools (summary, trends, activity, compliance, work inbox) as functions, receives the figures the person may see, and only phrases them, citing each one. Money stays hidden from a role without money, because the tools run under that person's permissions. | M |
| 23 ✅ | RAG over documents and records | Store chunks of each company's documents (policies, contracts, registration certificates, notes, filing acknowledgements) with embeddings in Postgres (pgvector), per company under row-level security. Retrieve the passages that answer the question and cite them. A free local embedding model (bge-small, nomic-embed via Ollama) keeps it free. | L |
| 24 ✅ | Knowledge | A server-side knowledge base per company and for the group: facts the owner approves ("Kavita Stores pays on the 20th", "GST is filed by our CA, Mehta & Co"). Replaces the demo's sample "What Janus remembers". | M |
| 25 ✅ | Memory | Conversation history per person, so follow-ups work ("and last quarter?"). Facts Janus suggests remembering go to the owner to approve, never saved silently, and can be seen and deleted. | M |
| 26 ✅ | Safety | Every answer lists its sources; a "not enough data" path; cost limits per month; no data sent to a provider the owner has not chosen; prompts and answers kept in the audit trail. | M |

## P2: depth an owner and their CA expect

| # | Gap | Effort |
|---|---|---|
| 27 ✅ | GST payable (output GST less input credit) per GSTIN, and TDS deducted against deposited, from invoices, bills and payroll. Done: GST payable per GSTIN from invoices and bills; TDS deducted on bills (by section) and salaries against the challans deposited. | M |
| 28 ✅ | Challan amounts and late-fee or interest estimates on past-due filings; a count of every unfiled item, not only the last 90 days; export of the filing register. | M |
| 29 ✅ | Activity with numbers: the document number, customer and amount for roles with money; bursts grouped ("raised 6 invoices, ₹4.2L"); edits and deletions highlighted. | M |
| 30 ✅ | Six Portfolio roles with a company scope (Portfolio owner, Portfolio administrator, Company administrator, Finance manager, Operations manager, Read-only). Today: Owner, Group finance, Group analyst. | L |
| 31 ✅ | Sales between your own companies linked by record, not name, and a bill created automatically in the other company when one sells to the other. | M |
| 32 ✅ | Document vault per company with expiry dates and renewal reminders (registrations, licences, insurance, trademarks). | M |
| 33 ✅ | Opening balances or a history import (Tally, Zoho Books), so growth against last year and retention can be shown. Done: monthly and customer-wise history from Tally or Zoho Books, growth against last year, customers kept and lost, and opening balances. | L |
| 34 ✅ | Cash: a bank feed or bank statement import, so the Portfolio can show cash and runway instead of only money in and out. | L |
| 35 ✅ | Salaries posted to the books from HR payroll, so profit after salaries is recorded, not estimated. | M |
| 36 ✅ | Alerts that reach the owner: an email or push message when something turns red, not only the Monday email. | M |
| 37 ✅ | Notifications read state kept on the server, not per browser. | S |
| 38 ✅ | Risk thresholds the owner can change (what counts as late, how much overdue is red). | S |

## P3: finish and checks

| # | Gap | Effort |
|---|---|---|
| 39 ✅ | Phone width (390px) and keyboard check of every Portfolio view; the audit could not run them. Wide tables need a mobile layout. | M |
| 40 ✅ | Each company has two buttons both labelled "Open Neema Finance"; give each its own label. | S |
| 41 ✅ | The floating "N" dev-tools circle covers the user's name in the corner (development only; confirm it is absent in a production build). | S |
| 42 ✅ | Long empty space under short pages; the Notifications view largely repeats the Work inbox. | S |

## Outside the Portfolio, still open

- The ten failing end-to-end tests are all product problems: Finance discards saved expenses and petty cash on load; budget lines need `billing:manage`; a manager's Assign menu is empty; Customer Support has no customers on real accounts; four department-role gaps. See `e2e/README.md`.
- Other modules still to move into the module structure (`docs/modules.md`): Org/Accounts next, then CRM, Finance, Operations, HR and the rest.
- Deploying to the remora server waits for SSH access.
- GitHub reports the repository has moved to `CuriousDevs-AI/janus` and lists 109 dependency vulnerabilities (14 critical) on the default branch.
- About 215 existing mypy errors and some files `ruff format` would change, outside the Portfolio.
- WhatsApp and ingestion tests fail about once in ten runs; the cause is not found.

## Suggested order

1. P0 items 1–4 and the quick P1 fixes (5, 6, 9, 18): a day; the audit's biggest doubts go away.
2. Trading-style charts (11–17), starting with daily figures (12) and the ticker row (11).
3. Intelligence with a model picker and free models (19–22), then knowledge and memory (24–25), then RAG over documents (23).
4. Board pack with P&L (7), GST payable and TDS (27), Activity with numbers (29).
5. The rest by what customers ask for.
