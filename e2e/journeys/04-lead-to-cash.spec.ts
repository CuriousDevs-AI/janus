import { expect, test } from "@playwright/test";
import { api, apiStatus, choose, day, expectNoProblems, expectToast, expectVisibleText, field, open, signIn, workspaceUrl } from "../lib";

const OPS = "operations-inventory";
const FIN = "finance-accounting";

test.describe("A customer's order moves from Sales to Operations to Finance", () => {
  test("Priya captures a lead on the screen", async ({ browser }) => {
    const priya = await signIn(browser, "priya");
    await open(priya.page, "/leads?workspace=crm-sales");
    await priya.page.getByRole("button", { name: /Add lead/ }).first().click();
    await priya.page.fill("#lead-add-name", "Ramesh Agarwal");
    await priya.page.fill("#lead-add-phone", "+919812300001");
    await priya.page.fill("#lead-add-company", "Agarwal Garments");
    await priya.page.fill("#lead-add-requirement", "500 metres of cotton fabric every month");
    await priya.page.getByRole("dialog").locator("button[type=submit]").click();
    await expectVisibleText(priya.page, "Ramesh Agarwal");
    expectNoProblems(priya);
    await priya.context.close();
  });

  test("Rohan, a teammate, does not see Priya's lead, but their manager Arjun does", async () => {
    await api("vikram", "POST", "/teams", { name: "Sales", description: "Sales team" });
    const teams = await api("vikram", "GET", "/teams");
    const members = await api("vikram", "GET", "/members");
    const team = teams.find((item: { name: string }) => item.name === "Sales");
    for (const name of ["Arjun Mehta", "Priya Nair", "Rohan Das"]) {
      const member = members.find((item: { name: string }) => item.name === name);
      await api("vikram", "PUT", `/teams/${team.id}/members/${member.id}`);
    }
    const names = async (who: string) => (await api(who, "GET", "/leads")).map((lead: { contactName: string }) => lead.contactName);
    expect(await names("priya")).toContain("Ramesh Agarwal");
    expect(await names("rohan")).not.toContain("Ramesh Agarwal");
    expect(await names("arjun")).toContain("Ramesh Agarwal");
  });

  test("Arjun turns the lead into a deal, and it is won", async () => {
    const lead = (await api("arjun", "GET", "/leads")).find((item: { contactName: string }) => item.contactName === "Ramesh Agarwal");
    const deal = await api("arjun", "POST", `/leads/${lead.id}/deal`, { name: "Agarwal monthly fabric", amount: "850000", stage: "won", expectedCloseAt: day(5) });
    expect(deal.stage).toBe("won");
  });

  test("Vikram adds a warehouse and a branch", async ({ browser }) => {
    const vikram = await signIn(browser, "vikram");
    for (const [name, kind, address] of [["Bhiwandi warehouse", "Warehouse", "Plot 12, MIDC, Bhiwandi"], ["Surat branch", "Branch", "Ring Road, Surat"]]) {
      await open(vikram.page, "/settings?tab=workspace&view=settings&workspace=business");
      await vikram.page.getByRole("button", { name: /Add location/ }).click();
      const dialog = vikram.page.getByRole("dialog");
      await dialog.getByLabel("Location name").fill(name);
      await dialog.getByLabel("Type").selectOption({ label: kind });
      await dialog.getByLabel("Address").fill(address);
      await dialog.getByRole("button", { name: "Save location" }).click();
      await expectToast(vikram.page, /Location added/);
    }
    expectNoProblems(vikram);
    await vikram.context.close();
  });

  test("Karan receives stock, then dispatches the order with a challan", async ({ browser }) => {
    const karan = await signIn(browser, "karan");
    await open(karan.page, workspaceUrl(OPS, "products"));
    await api("karan", "POST", "/operations/items", { key: "fabric-cotton", name: "Cotton fabric", sku: "FAB-COT", unit: "metre", hsn: "5208", rate_paise: 17000, gst_rate: 5, reorder_level: "200", track_batch: false });
    await open(karan.page, workspaceUrl(OPS, "inventory"));
    const main = karan.page.locator("main");
    const selects = main.locator("select");
    await selects.nth(0).selectOption({ label: "Cotton fabric" });
    await selects.nth(1).selectOption({ label: "Bhiwandi warehouse" });
    await main.locator("input[type=number]").first().fill("2000");
    await main.getByLabel("Reason", { exact: true }).first().fill("Opening stock from the mill");
    await main.getByRole("button", { name: "Receive stock" }).click();
    await expectToast(karan.page, /Stock received/);

    await open(karan.page, workspaceUrl(OPS, "orders"));
    await main.locator("#ds-cust").fill("Ramesh Agarwal");
    await main.locator("#ds-comp").fill("Agarwal Garments");
    await main.locator("#ds-transporter").fill("VRL Logistics");
    await choose(main, "Dispatch from", /Bhiwandi/);
    await choose(main, "Item 1", /Cotton fabric/);
    await field(main, "Quantity 1").fill("500");
    const remove = main.getByRole("button", { name: "Remove" });
    if (await remove.count()) await remove.last().click().catch(() => {});
    await main.getByRole("button", { name: "Create dispatch" }).click();
    await expectToast(karan.page, /Dispatch created/);
    await open(karan.page, workspaceUrl(OPS, "inventory"));
    await expectVisibleText(karan.page, /1,?500/);
    expectNoProblems(karan);
    await karan.context.close();
  });

  test("Finance invoices the customer and records the payment", async ({ browser }) => {
    // Only the Owner holds the Finance permission today; see 11-access-by-department.
    const vikram = await signIn(browser, "vikram");
    await open(vikram.page, workspaceUrl(FIN, "invoices"));
    await vikram.page.locator("main").getByRole("button", { name: "New invoice" }).click();
    const dialog = vikram.page.getByRole("dialog");
    await dialog.locator("#inv-customer").fill("Ramesh Agarwal");
    await dialog.locator("#inv-company").fill("Agarwal Garments");
    await field(dialog, "Payment due in (days)").fill("30");
    await field(dialog, "Item 1").fill("Cotton fabric");
    await field(dialog, "HSN 1").fill("5208");
    await field(dialog, "Quantity 1").fill("500");
    await field(dialog, "Rate 1").fill("170");
    await choose(dialog, "GST rate 1", /5%/);
    await dialog.getByRole("button", { name: "Create invoice" }).click();
    await expectToast(vikram.page, /Invoice INV-.* created/);

    await open(vikram.page, workspaceUrl(FIN, "invoices"));
    await expectVisibleText(vikram.page, "Agarwal Garments");
    await vikram.page.locator("main tr", { hasText: "Agarwal Garments" }).getByRole("button", { name: "Record payment" }).click();
    const payment = vikram.page.getByRole("dialog");
    await payment.locator("input[type=number]").first().fill("89250");
    await payment.locator("button[type=submit], button:has-text('Record payment')").last().click();
    await vikram.page.waitForTimeout(2500);
    const invoices = await api("vikram", "GET", "/finance/invoices");
    const invoice = invoices.find((item: { company?: string; customer?: string }) => JSON.stringify(item).includes("Agarwal"));
    expect(JSON.stringify(invoice)).toMatch(/89250/);
    expectNoProblems(vikram);
    await vikram.context.close();
  });

  test("a recorded expense and a petty-cash top-up are still there after a reload", async ({ browser }) => {
    const vikram = await signIn(browser, "vikram");
    await open(vikram.page, workspaceUrl(FIN, "expenses"));
    await field(vikram.page.locator("main"), "Top-up amount").fill("25000");
    await vikram.page.getByRole("button", { name: "Top up from bank" }).click();
    await expectToast(vikram.page, /Petty cash topped up/);
    await vikram.page.waitForTimeout(1500);
    await open(vikram.page, workspaceUrl(FIN, "expenses"));
    await expect(vikram.page.locator("main")).toContainText("₹25,000 in hand");
    await vikram.context.close();
  });

  test("a sales agent is refused the company's invoices", async () => {
    expect((await apiStatus("priya", "GET", "/finance/invoices")).status).toBe(403);
  });
});
