# Portfolio user test report: Vikram Malhotra, founder of three companies and a holding company

Run on 12 Nov 2026 against the app on this machine (web http://localhost:3000, API http://127.0.0.1:8000), branch `step-77-crm-activity-in-feed-xffhq1`, in the built-in browser, following `docs/portfolio-founder-uat.md`. Every verdict below rests on what was seen on screen (or read from the page or the downloaded CSV). Screenshots are in [`qa-evidence/uat-2026-11/`](../qa-evidence/uat-2026-11/).

## Executive summary

**Verdict: Not yet.** The Portfolio is fast, calm and mostly in the right places. Plans, archive and refund, roles, compliance and the Janus rules answers mostly work the way Vikram would expect. But some figures disagree from one screen to the next, and one is plainly wrong. The weekly email gives a third version of the same number. Those are exactly the things that would make him phone Anita instead.

**Would Vikram open it every Monday instead of calling Anita?** Not yet. He would trust the Overview's headline figures; they add up and the note on sales between his own companies explains the gap. But the first time he opens Textiles' own Finance and sees ₹9,89,525 overdue where the Portfolio said ₹10.5L, or the Monday email says ₹8.2L, he stops trusting all three.

**Top 5 problems**

1. **Wrong biggest customer.** For Exports, Finance, Janus Intelligence and the "biggest financial risks" answer all say *Osaka Fabrics, 45% of sales*. This month Al Noor Trading bought ₹6L against Osaka's ₹4.9L, so Al Noor is the biggest customer at 55%. The list is sorted by the larger of this month and last month, and the screens take the first row ([6.3](../qa-evidence/uat-2026-11/6.3-biggest-customer-wrong.jpg), [4.1](../qa-evidence/uat-2026-11/4.1-exports-biggest-customer-order.jpg)).
2. **Textiles' past-due figure has three values.**
   - Portfolio: ₹10.5L on 5 invoices, ₹5.5L over 60 days.
   - Textiles' own Finance: ₹9,89,525.04 overdue; 61–90 days ₹4,84,495; 90+ days ₹0.08.
   - Monday email: ₹8.2L on 4 invoices.

   The first gap is exactly the ₹64,000 opening balance (Royal Retail, due 25 Oct 2025). The Portfolio counts it; the company's Finance overview does not ([2.1](../qa-evidence/uat-2026-11/2.1-textiles-own-finance-overdue-9.9L.jpg), [1.7](../qa-evidence/uat-2026-11/1.7-weekly-email-preview.jpg)).
3. **Exports' TDS is short, but Compliance says up to date.** Finance, the Work inbox and Needs you first all say "Deposit ₹2,386 of TDS for Oct 2026" for Exports. Compliance, the Companies table and Exports' page say "Up to date" or "No filing past due", because a challan was recorded, even though it was for less than was deducted.
4. **The FEMA risk is under-told.** Exports' ₹4.6L unpaid for 10 months appears on Exports' page and in Notifications. It is missing from the Overview's one-line reason ("overdue over 60 days"), from Intelligence's "biggest financial risks" list, and from the Read-only view entirely (Exports shows "Watch").
5. **Problems do not open as a popup, and sign-in drops him into a setup page.**
   - "Open" on Needs you first jumps straight to a page: the Portfolio Compliance list (not filtered to Retail) or Textiles' Finance. It does not open the popup with the figures and what to do.
   - Every sign-in as the owner lands on Textiles' "Set up your business in Janus — 0%" page, not the Portfolio, despite 13 months of records ([8.4](../qa-evidence/uat-2026-11/8.4-signin-lands-on-company-setup.jpg)).

**Counts (49 check rows in the test doc; the brief said 46):** Pass 38 · Wrong place 0 · Wrong / missing 6 · Bug 3 · Not run 2.

## How the test was set up

- **Main account:** `vikram.uat2.1794503647@example.com`, signed up through `POST /v1/auth/signup` (business "Malhotra Textiles"), verified from the dev log, then seeded with `scripts/seed-portfolio.mjs`. The seed added Retail, Exports and Holdings, with Growth and sample invoices.
- **Day 0 account:** `vikram.day0.1794503647@example.com`, signed up and verified the same way and never seeded. Everything after verification was done in the browser.
- **Invitees:** Anita (`anita.uat2.…`, Finance manager on Textiles, Retail and Exports) and Mehta & Co. (`mehtaco.uat2.…`, Read-only on all four). Both accepted from the dev-log links in separate sign-ins.
- **AI model:** no AI key was available, so 6.6 and 6.7 were not run. The Set up model popup and the AI models & keys page were checked.
- **Data left behind on the main account:**
  - Retail GSTR-1 for Oct recorded as filed.
  - The Textiles → Retail bill recorded.
  - Seven Retail staff invitations (six sent, one refused).
  - Plan moved Growth → Startup → Growth.
- **Seed artefact, not counted against the product:** every lead is created on the day the seed runs. So "Leads in 32, none the same days before" and the weekly email's "Leads in: 0" are artefacts of the seed.

## Results, check by check

Result: **Pass**, **Wrong place**, **Wrong / missing**, **Bug**, **Not run**.

### Day 0 — First sign-in (unseeded account)

| # | Result | What I saw | Evidence |
|---|---|---|---|
| 0.1 | Pass | First sign-in went straight to a full-screen "Choose your plan" (`/choose-plan?next=/setup`). It shows Free ₹0, Startup ₹1,999, Growth ₹5,999 (all "/ month + GST") and Enterprise "Custom", each with what it includes. | [0.1](../qa-evidence/uat-2026-11/0.1-choose-plan.jpg) |
| 0.2 | Pass | "Start on Startup?" popup: "₹1,999 a month plus GST" and "A month of Startup (test mode: not charged) ₹2,358.82", then on to `/setup`. The popup gives the total with GST but does not show the GST line on its own. | [0.2](../qa-evidence/uat-2026-11/0.2-start-on-startup.jpg) |
| 0.3 | Pass | "Add a company" (from the switcher and Portfolio → Companies) asks Name, Kind of business (8 kinds) and Industry. Note: after each add, he is taken into the new company's `/setup` and out of the Portfolio, so adding two companies means coming back twice. Signup never asks the first company's kind ("Kind of business not set"). | [0.3](../qa-evidence/uat-2026-11/0.3-add-company-dialog.jpg), [after](../qa-evidence/uat-2026-11/0.3-after-add-dropped-into-setup.jpg) |
| 0.4 | Pass | Refused: "The Startup plan includes 3 companies, and all are in use. Upgrade to Growth in Portfolio, Plan and billing. An Owner chooses the plan." It is a toast, bottom right, that comes only after he has filled in the whole form, and it has no link. | [0.4](../qa-evidence/uat-2026-11/0.4-fourth-company-refused.jpg) |
| 0.5 | Pass | Growth popup: refund for 29 of 30 unused days ₹2,280.19 and a month of Growth ₹7,078.82. Holdings was then added as "Holding or investment". On the unseeded account the Holdings tile says "No sales · Holding or investment", with no ₹0 chart and also no cash line. On the seeded account it shows "₹85.3L Cash in the bank". The upgrade popup also says "what does not fit is archived", which does not apply to an upgrade. | [0.5 popup](../qa-evidence/uat-2026-11/0.5-move-to-growth-popup.jpg), [0.5 tile](../qa-evidence/uat-2026-11/0.5-holdings-tile-no-cash.jpg) |

### Day 1 — The weekly look (seeded account, Nov 2026 = 1–12 Nov)

| # | Result | What I saw | Evidence |
|---|---|---|---|
| 1.1 | Pass | Overview cards: Companies needing you 3 of 4; Sales ₹18.4L, −8%; Profit after salaries ₹5.3L ("Estimate · ₹10.5L before ₹5.2L of salaries"); Past due from customers ₹15.1L; To do 26 (9 urgent). The figures add up: 10.5 − 5.2 = 5.3, and past due 10.5 + 4.6 = 15.1. | [1.1](../qa-evidence/uat-2026-11/1.1-overview.jpg) |
| 1.2 | Pass | Tiles: Textiles ₹7.2L +15%, Retail ₹2.5L +8%, Exports ₹10.9L −5%, Holdings "₹85.3L Cash in the bank". Note: the companies' own sales are up 3% in total, but the group is down 8%. The reason is that ₹2.2L of Textiles' +15% is a bill to his own Retail, which the tile does not say. | [1.1](../qa-evidence/uat-2026-11/1.1-overview.jpg) |
| 1.3 | Pass | Company by company: "sales and profit here add up to more than the group figures above: ₹2.2L of sales between your companies take ₹2.2L off group profit. Finance shows the working." | — |
| 1.4 | Wrong / missing | Textiles, Retail and Exports are all red. The data justifies Textiles too, with ₹5.5L over 60 days. But each one-line reason picks the lesser problem: Retail "₹3.6L of supplier bills already late (+4)" rather than its loss of ₹55,180 after salaries or cash for 0.8 months; Exports "₹4.6L overdue … over 60 days (+1)" rather than "unpaid 10 months, past FEMA's 9-month limit". | [1.1](../qa-evidence/uat-2026-11/1.1-overview.jpg) |
| 1.5 | Wrong / missing | No popup. "Open" on "Malhotra Retail · 3 filings past due" went straight to Portfolio → Compliance, which shows all companies and is not filtered to Retail. "Open" on "Collect ₹10.5L past due" switched straight into Textiles' Finance. Neither showed the issue, figures, what to do and "Go to …" first. Notifications does have that popup (see 4.4). | [1.5](../qa-evidence/uat-2026-11/1.5-open-goes-to-compliance-no-popup.jpg) |
| 1.6 | Pass | Nothing blanked or jumped. This quarter: ₹60L +6%, profit ₹16.3L. Back to this month: ₹18.4L. Small fault: the period button lags about 1–2 seconds. Month figures were on screen while "This quarter" was still highlighted, and the figures did not visibly dim on click. | [1.6](../qa-evidence/uat-2026-11/1.6-month-figures-quarter-highlighted.jpg) |
| 1.7 | Wrong / missing | The email preview for 5–11 Nov has different figures from the Overview. Textiles "₹8.2L is overdue on 4 invoices" (Overview: ₹10.5L on 5). Retail "Bills due in the next 7 days: ₹3.6L" (Finance: ₹0 due, ₹3.6L already late). It has no profit, cash, filings or FEMA, and Holdings gets lead and pipeline lines instead of cash. Money is correctly hidden in Mehta & Co.'s (Read-only) preview. The Preview button did not open on the first two clicks; the third worked. | [1.7](../qa-evidence/uat-2026-11/1.7-weekly-email-preview.jpg) |

### Day 1, later — Money

| # | Result | What I saw | Evidence |
|---|---|---|---|
| 2.1 | Bug | Portfolio → Finance → Company by company shows, per company, Customers owe, Past due, and Late over 60 days. There is no 1–30 / 31–60 split. The figures disagree with Textiles' own Finance: the Portfolio says ₹26.3L owed, ₹10.5L past due and ₹5.5L over 60 days; Textiles' Finance says ₹25,68,193.87 outstanding, ₹9,89,525.04 overdue, 61–90 days ₹4,84,495.03 and 90+ days ₹0.08. The gap in each is ₹64,000, the Royal Retail opening balance due 25 Oct 2025. Exports matches: ₹27,44,969.52 and ₹4,60,000.18. | [2.1 Portfolio](../qa-evidence/uat-2026-11/2.1-finance-company-by-company.jpg), [2.1 Textiles](../qa-evidence/uat-2026-11/2.1-textiles-own-finance-overdue-9.9L.jpg) |
| 2.2 | Pass | Cash in the bank: "Malhotra Retail ₹1.1L as of 7 Nov 2026 · lasts about 0.8 months at ₹1.3L a month" in red, with the import source explained. Total ₹1.5Cr = 18.1 + 1.1 + 45.1 + 85.3. Note: the table just above says "Bank balances are not connected, so this shows money in and out, not cash in the bank", which contradicts this section. | [8.1](../qa-evidence/uat-2026-11/8.1-finance-blank-while-scrolling.jpg) |
| 2.3 | Pass | Waterfall: Sales ₹18.4L, Costs −₹7.9L, Salaries (est.) −₹5.2L, Profit ₹5.3L. "Salaries (est.)" says it is an estimate. | — |
| 2.4 | Pass | "Bill missing · Malhotra Textiles → Malhotra Retail · INV-2026-0155 · 11 Nov 2026 · ₹2.3L with ₹11,000 GST · Record the bill in Malhotra Retail". One click gave "Bill BILL-2026-0127 recorded" and the row became Matched. The group table still said "₹2.2L sold against ₹0 billed" until a reload; after the reload it showed costs ₹10.1L, less ₹2.2L between companies, group ₹7.9L. | [2.4](../qa-evidence/uat-2026-11/2.4-bill-recorded-one-click.jpg) |
| 2.5 | Pass | GST per GSTIN for Oct and Nov so far, e.g. Textiles "₹14,729 (₹81,618 charged − ₹55,738 credit − ₹11,151 carried in)". TDS deducted against deposited per company. Notes: Retail's "₹2,693 to deposit by 7 Nov 2026" and Exports' ₹2,386 are shown on 12 Nov without the word late or the interest (Compliance does give the interest). Textiles deposited ₹25,131 against ₹17,803 deducted and the page shows only "Deposited". | — |
| 2.6 | Wrong / missing | The board pack CSV (`portfolio-month-2026-11-12.csv`) has sales with "same days before", but costs, profit, money in and money out have no earlier period. Group money in and out are blank. Money columns are blank for Read-only, which is right. | [2.6 CSV](../qa-evidence/uat-2026-11/2.6-board-pack-month.csv) |

### Day 2 — Compliance and documents

| # | Result | What I saw | Evidence |
|---|---|---|---|
| 3.1 | Pass | "Due in the next 7 days: 6", each listed per company with its date (PF and ESI for Oct, 15 Nov ×3). The Overview's "Coming up" lists 30 days. | [3.2](../qa-evidence/uat-2026-11/3.2-retail-past-due-with-fees.jpg) |
| 3.2 | Pass | Retail's three past-due filings, each with an estimate and a "Record filing" button: ITR FY 2025-26 "about ₹5,000"; TDS Oct "about ₹40 on ₹2,693"; GSTR-1 Oct "about ₹50". Separate bug: Retail is an **LLP**, but its list shows "MGT-7 (annual return) · Company · due 29 Nov 2026" and a "Company"-labelled ITR. "Limited company filings" is ticked for it and nothing warns that this is wrong for an LLP. | [3.2](../qa-evidence/uat-2026-11/3.2-retail-past-due-with-fees.jpg) |
| 3.3 | Pass | Recorded GSTR-1 (date 12/11/2026 and ARN). It left "Still to file". The Overview now says "Malhotra Retail · 2 filings past due" and Notifications says "2 filings past due". | [3.3](../qa-evidence/uat-2026-11/3.3-filing-recorded.jpg) |
| 3.4 | Wrong / missing | The trade licence is red, "Expired 4 days ago · PMC/TL/44120 · expires 8 Nov 2026", with "Attach the scan". There is no Renew button, only a pencil and a bin. The Work inbox says "Renew it, then record the new expiry date", so he has to guess that the pencil is how to renew. | [3.4](../qa-evidence/uat-2026-11/3.4-trade-licence-expired-no-renew.jpg) |
| 3.5 | Pass | Unseeded account: "Not set up. No filings are tracked for Malhotra Textiles, so nothing here can be called up to date." The Overview and Companies tables say "Not set up", never "Up to date". | [3.5](../qa-evidence/uat-2026-11/3.5-not-set-up.jpg) |

### Day 3 — Exports: the 10-month-old payment

| # | Result | What I saw | Evidence |
|---|---|---|---|
| 4.1 | Pass | Companies → Malhotra Exports: "What matters for import and export" shows Sales ₹10.9L, Customers owe ₹27.4L (₹4.6L past due), Unpaid over 9 months ₹4.6L, Margin 64%, Profit after salaries ₹4.9L and Pipeline ₹3.6L. "Biggest customers" lists Osaka ₹4.9L above Al Noor ₹6L (see P0-1). | [4.1](../qa-evidence/uat-2026-11/4.1-exports-page.jpg) |
| 4.2 | Pass | Needs attention: "₹4.6L on 1 invoice unpaid for over 9 months: export money must come in within 9 months under FEMA". It is a plain black bullet, not a red line. It is High in Notifications. | [4.1](../qa-evidence/uat-2026-11/4.1-exports-page.jpg) |
| 4.3 | Pass | "Invoices carry no currency, port or shipping bill, so export and local sales are not told apart, and amounts in foreign currency are not shown." | [4.1](../qa-evidence/uat-2026-11/4.1-exports-page.jpg) |
| 4.4 | Pass | The popup has High · Money · Malhotra Exports, the figures, What to do, and "Opens Finance › Payments & Receivables. Janus moves you into Malhotra Exports first." Then came "Opening Malhotra Exports…" and Exports' Finance. Notes: the popup shows "Late over 60 days", not the 9-month figure. Its advice is generic ("pay or reschedule late supplier bills"). The page it lands on has only totals and aging, no list of invoices or customers to chase. Aging shows ₹0.01, ₹0.01 and ₹0.04 left over in empty buckets. | [popup](../qa-evidence/uat-2026-11/4.4-fema-notification-popup.jpg), [opening](../qa-evidence/uat-2026-11/4.4-opening-exports.jpg), [landing](../qa-evidence/uat-2026-11/4.4-exports-receivables-no-list.jpg) |

### Day 4 — People and access

| # | Result | What I saw | Evidence |
|---|---|---|---|
| 5.1 | Pass | Add person: email, role (7 roles), companies. Toast: "Invitation sent for Malhotra Textiles, Malhotra Retail, Malhotra Exports." Signed in as Anita (one link accepted all three): Overview with money (₹18.4L, ₹5.3L, ₹15.1L), no Add company. Billing says "The plan belongs to the Owner's account". Access says "Only an Owner or a Portfolio administrator shares the Portfolio." Notes: three separate emails, all titled "Join your team on Janus", whose body names no company, role or inviter (the invite page does). | [5.1](../qa-evidence/uat-2026-11/5.1-anita-overview.jpg) |
| 5.2 | Wrong / missing | Signed in as Mehta & Co.: leads, deals won, pipeline, people and compliance, no money. Finance says "Money is not shared with you. Your role covers sales and people, not money." But **sales are hidden too**, which contradicts the role card ("Read-only. Sees sales, people, support and compliance, not money") and the test's expectation. The Overview does not say why money is missing; only Finance does. Exports shows "Watch" and the FEMA risk is invisible to the CA. | [5.2 real](../qa-evidence/uat-2026-11/5.2-readonly-real-overview.jpg), [5.2 why](../qa-evidence/uat-2026-11/5.2-preview-finance-hidden-why.jpg) |
| 5.3 | Bug | The banner shows on every page until Exit, and Exit returns to Portfolio access. But the preview does not match the real role. In preview, Notifications showed "Malhotra Retail · Cash in the bank lasts about 0.8 months … · Money" (8 items) and the full Plan and billing page with "Move to …" buttons. The real Read-only account sees 7 items and "The plan belongs to the Owner's account". The sidebar also highlights two items at once in preview. | [5.3 overview](../qa-evidence/uat-2026-11/5.3-preview-readonly-overview.jpg), [5.3 billing](../qa-evidence/uat-2026-11/5.3-preview-readonly-billing-visible.jpg) |
| 5.4 | Pass | On Startup (15 people), inside Retail → People & Access: six invitations went through (15 of 15). The seventh was refused (HTTP 409) with "The Startup plan includes 15 people, and all are in use. Upgrade to Growth in Portfolio, Plan and billing. An Owner chooses the plan." The message is at the bottom of a long form, below 12 permission tiles, so he must scroll to see why nothing happened. | [5.4](../qa-evidence/uat-2026-11/5.4-people-limit-refused.jpg) |
| 5.5 | Pass | Plan and billing → People by company shows Can sign in, Invited and Seats counted per company. After the invites: Textiles 3, Retail 3, Exports 3, Holdings 2, total 11 of 75. Note: Vikram alone takes 4 seats (one per company) and Mehta & Co. 4. On Startup that is 8 of 15 seats for one owner and one CA. | [5.3 billing](../qa-evidence/uat-2026-11/5.3-preview-readonly-billing-visible.jpg) |

### Day 5 — Janus Intelligence (Janus rules, no AI)

| # | Result | What I saw | Evidence |
|---|---|---|---|
| 6.1 | Pass | "Malhotra Retail is performing worst in Nov 2026, ranked on profit after salaries: sales ₹2.5L (+8%…); 28% margin…; about −₹55,180 after ₹1.2L of salaries (estimate); its biggest fall is Rekha Sarees, −₹1.1L … Left out, as they do not sell: Malhotra Holdings." The figures match the Overview. | [6.1](../qa-evidence/uat-2026-11/6.1-worst-company.jpg) |
| 6.2 | Pass | Ranked Retail, Textiles, Exports, then Holdings "On track", each with reasons (Exports includes FEMA). | — |
| 6.3 | Bug | "As of today … largest amount first", 10 risks. It includes "Malhotra Exports — 45% of sales come from one customer, Osaka Fabrics", which is wrong (Al Noor ₹6L, 55%). It does not include the FEMA 9-month unpaid export money. Customer-share items are mixed into the "largest amount first" order. TDS and GST are present. | [6.3](../qa-evidence/uat-2026-11/6.3-biggest-customer-wrong.jpg) |
| 6.4 | Pass | Profit per company, before and after salaries; Holdings left out "as they do not sell". | — |
| 6.5 | Pass | "Set up a model": Free models and Paid models tabs, 9 free providers (OpenRouter, Gemini, Groq, Cerebras…), a model list, "Get a key", the API key field ("Kept encrypted…"), and Save and test. | [6.5](../qa-evidence/uat-2026-11/6.5-set-up-model-popup.jpg) |
| 6.6 | Not run: no key | No AI key was available; none was invented. | — |
| 6.7 | Not run: no key | Copying into companies needs a saved key. The AI models & keys page empty state reads correctly ("No Portfolio keys yet… Add a key"). AI spend caps are shown in US dollars ("$0.00 of $5.00"), including for Holdings. | [6.7](../qa-evidence/uat-2026-11/6.7-ai-keys-empty-usd-caps.jpg) |

### Day 6 — Plan and billing

| # | Result | What I saw | Evidence |
|---|---|---|---|
| 7.1 | Pass | Billing is only in Portfolio → Plan and billing. Inside a company, Business Settings has only the company's own "Billing address" for its invoices; Usage has no plan. | — |
| 7.2 | Pass | Invoices "Monthly, from Janus to your account, with 18% GST": ₹5,999 + ₹1,079.82 GST = ₹7,078.82, Paid or Due, View (popup) and Print. Notes: the invoice is billed to a person and has no Janus GSTIN, customer GSTIN, SAC or place of supply, so his CA cannot claim input credit. Two sample invoices overlap November (0001 Paid for 12 Nov–11 Dec and 0007 Due for 1–30 Nov), most likely from the seed. | [7.2](../qa-evidence/uat-2026-11/7.2-invoice-view-no-gstin.jpg) |
| 7.3 | Pass | "Move from Growth to Startup?": "Startup holds 3 companies. Choose which to keep", Textiles "(open now, always kept)", Archived: Malhotra Holdings, refund for 29 unused of 30 days ₹6,842.85, Startup ₹2,358.82. Notes: it does not say Mehta & Co. will lose access to Holdings (the upgrade popup later says "People coming back: Mehta & Co. · Malhotra Holdings"). For about a second the popup body was an empty grey box. | [7.3](../qa-evidence/uat-2026-11/7.3-downgrade-popup.jpg), [empty](../qa-evidence/uat-2026-11/7.3-downgrade-popup-empty-while-loading.jpg) |
| 7.4 | Pass | Startup active, 3 of 3 companies, "Archived by your plan: Malhotra Holdings", "Refunds: ₹6,842.85 for 29 unused of 30 days of Growth · Test: recorded only". Nothing was deleted (Holdings came back in 7.5). Notes: while archived, Holdings disappears from the Companies page with no "archived" row, and the sidebar still says "Portfolio · 4 companies". | [7.4](../qa-evidence/uat-2026-11/7.4-on-startup.jpg) |
| 7.5 | Pass | "Coming back: Malhotra Holdings. People coming back: Mehta & Co. · Malhotra Holdings", refund ₹2,280.19. Growth 4 of 10, and Holdings is back in Companies. | — |

### Any day — Moving around

| # | Result | What I saw | Evidence |
|---|---|---|---|
| 8.1 | Pass | All 12 menu items clicked twice, timing until the content was on screen. First visit 51–869 ms, second 51–327 ms (Analytics slowest). No blank main area and no loading text. Exceptions seen elsewhere: on Finance, the area below "Cash in the bank" was white for about a second while scrolling; the header said "Overview" on the Companies page during Day 0; the Companies "Open" button is clipped at 1024 px. | [8.1](../qa-evidence/uat-2026-11/8.1-finance-blank-while-scrolling.jpg), [header](../qa-evidence/uat-2026-11/8.x-companies-header-says-overview.jpg) |
| 8.2 | Pass | The Portfolio header has only Go to… and sign out; Chat and Team appear only inside a company. | [1.1](../qa-evidence/uat-2026-11/1.1-overview.jpg) |
| 8.3 | Pass | "Opening Malhotra Retail…" and "Opening Malhotra Exports…" overlays. Back via the switcher → Portfolio; that way shows no overlay and the old page stays for about 2 seconds. | [4.4](../qa-evidence/uat-2026-11/4.4-opening-exports.jpg) |
| 8.4 | Pass | Account menu: email, Plan and billing, Company settings (opens Portfolio → Companies, not a company), Portfolio access, Sign out. Separately, **signing in** always lands on Textiles' `/setup` page (P1-1). | [8.4](../qa-evidence/uat-2026-11/8.4-account-menu.jpg) |
| 8.5 | Pass | At 390 px: page width stays 390 on Overview, Finance, Companies, Billing and Compliance. Tables scroll inside their card. On Companies, the Open button needs a sideways scroll within the card. | [overview](../qa-evidence/uat-2026-11/8.5-phone-overview.jpg), [companies](../qa-evidence/uat-2026-11/8.5-phone-companies.jpg) |

## Summary sheet

| Section | Pass | Wrong place | Wrong / missing | Bug | Notes |
|---|---|---|---|---|---|
| First sign-in and plans (0.1–0.5) | 5 | 0 | 0 | 0 | Each added company drops him into its setup page; the 4th-company refusal is a toast after the form |
| Overview (1.1–1.7) | 4 | 0 | 3 | 0 | No popup on Needs you first; reasons pick lesser issues; the weekly email's figures differ |
| Finance (2.1–2.6) | 4 | 0 | 1 | 1 | ₹64,000 opening-balance gap against the company; no 1–30 / 31–60 ageing; board pack lacks earlier periods |
| Compliance and documents (3.1–3.5) | 4 | 0 | 1 | 0 | No Renew; an LLP gets company filings (MGT-7); Exports' short TDS not shown |
| Companies and kinds of business (4.1, 4.3) | 2 | 0 | 0 | 0 | Biggest-customer order wrong on Exports' page (counted under 6.3) |
| Notifications and Work inbox (4.2, 4.4) | 2 | 0 | 0 | 0 | FEMA line not red; the landing page has no invoice list |
| Access and roles (5.1–5.5) | 3 | 0 | 1 | 1 | Read-only "sees sales" but doesn't; Preview differs from the real role |
| Janus Intelligence and AI keys (6.1–6.7) | 4 | 0 | 0 | 1 | Wrong biggest customer; FEMA missing from risks; 6.6 and 6.7 not run (no key) |
| Plan and billing (7.1–7.5) | 5 | 0 | 0 | 0 | No GSTIN on Janus invoices; archived company vanishes from Companies |
| Moving around (8.1–8.5) | 5 | 0 | 0 | 0 | Fast; sign-in lands on a company setup page |
| **Total (49)** | **38** | **0** | **6** | **3** | plus 2 Not run |

**Verdict:** Would Vikram open this every Monday instead of calling Anita? **Not yet**, because the past-due figure for his biggest debtor company differs between the Portfolio, the company and the Monday email. Exports' "biggest customer" is wrong, and Compliance calls Exports up to date while its TDS is short. Fix P0-1 to P0-4 and he probably would. The layout, speed, plans, roles and the plain-words answers are already at the level he needs.

## Fix list

### P0 — wrong or unsafe

1. **Biggest customer is the wrong customer.**
   - Where: Portfolio → Finance (Company by company, "Biggest customer"), Janus Intelligence ("Who is my biggest customer?", "biggest financial risks"), Companies → Exports → "Biggest customers" order.
   - Cause: customers are sorted by the larger of this period and the period before, and the UI takes `customers[0]` as this period's biggest.
   - Files: `backend/janus_api/portfolio/summary.py:330` (sort key); `features/portfolio/lib/answer.ts:36` and `:107`; `features/portfolio/components/finance.tsx:92`.
2. **Past due differs between the Portfolio and the company.**
   - Portfolio ₹10.5L against Textiles' Finance ₹9,89,525.04; over 60 days ₹5.5L against ₹4,84,495 + ₹0.08.
   - The ₹64,000 opening balance ("recorded in Finance as opening invoices … owed, aged and paid like any other") is left out of the company's Finance overview and its aging. Make both use the same source.
   - Files: `components/finance/finance-workspace.tsx` (Finance overview and Receivables aging); the Portfolio side in `backend/janus_api/portfolio/summary.py`.
3. **The weekly email contradicts the Overview.**
   - "₹8.2L overdue on 4 invoices" (Overview ₹10.5L on 5).
   - "Bills due in the next 7 days: ₹3.6L" where all ₹3.6L are already late. The schema notes say `payableDueThisWeek` includes late bills, but the email labels it as due.
   - File: `backend/janus_api/portfolio/digest.py:119-124` (and the overdue "as of" date it uses).
4. **Compliance says "Up to date" while Exports' TDS is short by ₹2,386.**
   - Finance, the Work inbox and Needs you first all flag it. Compliance, the Companies "Filings past due 0" and Exports' "No filing past due" do not.
   - A recorded challan should count only up to the amount deducted.
   - Files: `backend/janus_api/portfolio/compliance/` (status of the TDS payment) and `backend/janus_api/portfolio/attention.py`.

### P1 — misleading or misplaced

1. **Sign-in lands on a company's setup page.** Owner sign-in always goes to Textiles' "Set up your business in Janus — 0%" (`/setup`), not the Portfolio, for an owner of 4 companies with 13 months of records. File: `app/(auth)/login/page.tsx:63-64`.
2. **Needs you first has no popup.** "Open" jumps straight to a page, and the compliance item goes to the Portfolio Compliance page for all companies, unfiltered. Reuse the Notifications popup. File: `features/portfolio/components/overview.tsx` (with `notification-detail.tsx`).
3. **The FEMA risk is under-told.**
   - The Overview's red reason for Exports should lead with "unpaid 10 months, past FEMA's 9-month limit". Retail's should lead with the loss and cash for 0.8 months, not late supplier bills.
   - Add FEMA to "biggest financial risks", and make the Exports bullet red.
   - Files: `backend/janus_api/portfolio/attention.py` (reason order), `features/portfolio/lib/answer.ts` (risks).
4. **Read-only words don't match what it sees.** The role card says it "Sees sales"; the role sees no sales (only CRM deal values). Fix the words or the rule, and say on the Overview why money is missing. File: `features/portfolio/components/access.tsx`; the role rules in `backend/janus_api/portfolio/access.py`.
5. **Preview as Read-only is not faithful.** It shows a money notification (cash runway) and the full Plan and billing page that the real Read-only cannot see. File: `features/portfolio/components/access.tsx` (preview) and the Notifications and billing views' preview handling.
6. **No ageing buckets.** Portfolio Finance shows past due and over 60 days only; add 1–30 and 31–60 per company. File: `features/portfolio/components/finance.tsx`; buckets in `backend/janus_api/portfolio/summary.py`.
7. **Board pack lacks the earlier period.** Add "same days before" for costs, profit, money in and money out, and fill the group money in and out. File: `features/portfolio/lib/board-pack.ts`.
8. **An LLP is given company filings.**
   - Retail (LLP) lists MGT-7 and a "Company" ITR because "Limited company filings" is ticked.
   - Warn about, or block, that box for an LLP, and make sure Forms 8 and 11 show.
   - Files: `backend/janus_api/portfolio/compliance/due_dates.py:150-183`, `plan.py`.
9. **No Renew on an expired document.** Add a Renew action (new expiry plus scan). File: `features/portfolio/components/documents.tsx`.
10. **TDS past its date isn't called late on Finance.** "₹2,693 to deposit by 7 Nov 2026" on 12 Nov should say "5 days late, interest about ₹40", as Compliance does. File: `features/portfolio/components/finance.tsx` (TDS to deposit).
11. **"Go to Payments & Receivables" lands on totals only.** There is no list of the overdue invoices or customers to chase, and empty buckets show paise residue (₹0.01, ₹0.04, ₹0.08). File: `components/finance/finance-workspace.tsx`.
12. **Downgrade popup doesn't name who loses access**, e.g. Mehta & Co. on Holdings. While archived, Holdings vanishes from Companies with no "archived" row. Files: `features/portfolio/components/plan.tsx`, `companies.tsx`.
13. **Janus invoice is not a usable GST tax invoice.** It has no GSTIN (Janus or customer), SAC or place of supply, and is billed to a person. File: `features/portfolio/components/plan.tsx` (invoice view), `backend/janus_api/billing/`.
14. **Contradictory note on Finance.** "Bank balances are not connected, so this shows money in and out, not cash in the bank" sits right above the "Cash in the bank ₹1.5Cr" section. File: `features/portfolio/components/finance.tsx`.
15. **Own-company sales inflate growth.** Textiles shows "+15%" and "Growing fastest" while ₹2.2L of it is a bill to his own Retail. Say so on the tile and in Analytics. Files: `features/portfolio/components/overview.tsx`, `analytics.tsx`.
16. **Invitation emails are bare.** One per company, titled "Join your team on Janus", naming no company, role or inviter. Send one email per person listing the companies. File: `backend/janus_api/org/router.py` (invitations) and its email template.

### P2 — polish

- The period buttons lag their figures by 1–2 seconds and the figures don't dim on click (`features/portfolio/components/period-bar.tsx`).
- Blank white area while scrolling Finance for about a second. The downgrade popup body is an empty grey box for about a second.
- Header says "Overview" on Companies (Day 0). The sidebar highlights two items in preview and inside a company.
- The refusal for a 4th company is a toast after the whole form is filled. The people-limit refusal is at the bottom of a long form. Put both at the top, with a "Go to Plan and billing" link.
- After adding a company he is moved into its setup; offer "Stay in the Portfolio".
- The weekly email Preview did not open on the first two clicks (seen once; the digest request was being aborted and repeated) (`features/portfolio/components/weekly-email.tsx`).
- The group table on Finance needs a reload after "Record the bill".
- AI spend caps in US dollars ("$0.00 of $5.00"); show rupees.
- The upgrade popup says "what does not fit is archived" on an upgrade.
- The account menu email is upper-case and cut off.
- The Companies "Open" button is clipped at 1024 px.
- Owner and CA count a seat in every company (Vikram alone uses 4 of 15 on Startup); consider one seat per person per account (`backend/janus_api/billing/`).
- Overlapping sample invoices (0001 and 0007 both cover November); check whether this comes from the seed or the product (`scripts/seed-portfolio.mjs`).
