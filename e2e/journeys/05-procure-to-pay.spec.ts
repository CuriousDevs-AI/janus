import { expect, test, type Browser } from "@playwright/test";
import { api, choose, day, expectNoProblems, expectToast, expectVisibleText, field, open, signIn, workspaceUrl } from "../lib";

const OPS = "operations-inventory";
const FIN = "finance-accounting";

test.describe("Operations buys stock, and Finance pays the vendor", () => {
  test("Vikram sets a budget for the warehouse", async () => {
    await api("vikram", "POST", "/finance/budget-lines", { external_key: "bl-e2e-warehouse", name: "Warehouse purchasing", owner_name: "Karan Singh", allocated_paise: 150000000 });
    await api("vikram", "POST", "/finance/budget-lines", { external_key: "bl-e2e-projects", name: "Client projects", owner_name: "Neha Gupta", allocated_paise: 200000000 });
  });

  test("Karan adds a vendor", async ({ browser }) => {
    const karan = await signIn(browser, "karan");
    await open(karan.page, workspaceUrl(OPS, "vendors"));
    const main = karan.page.locator("main");
    await field(main, "Vendor name").fill("Gujarat Yarn Mills");
    await field(main, "GSTIN").fill("24AABCG1234F1Z5");
    await field(main, "Payment terms in days").fill("30");
    await main.getByRole("button", { name: "Add vendor" }).click();
    await expectToast(karan.page, /Gujarat Yarn Mills added/);
    expectNoProblems(karan);
    await karan.context.close();
  });

  const raiseRequisition = async (browser: Browser, who: string) => {
    const session = await signIn(browser, who);
    await open(session.page, workspaceUrl(OPS, "procurement"));
    const main = session.page.locator("main");
    await choose(main, "Requisition item", /Cotton fabric/);
    await field(main, "Requisition quantity").fill("1000");
    await field(main, "Estimated rate").fill("150");
    await choose(main, "Requisition location", /Bhiwandi/);
    await choose(main, "Budget line", /Warehouse purchasing/);
    await field(main, "Reason").fill("Monthly order for Agarwal Garments");
    await main.getByRole("button", { name: "Raise requisition" }).click();
    await expectToast(session.page, /Requisition raised/);
    expectNoProblems(session);
    await session.context.close();
  };

  test("Karan, the Operations Manager, raises a requisition against the budget", async ({ browser }) => {
    await raiseRequisition(browser, "karan");
  });

  test("the requisition is approved, and the approval is recorded", async ({ browser }) => {
    const before = JSON.stringify(await api("vikram", "GET", "/operations/ledger"));
    // If Karan could not raise it (see the test above), Shalini raises it so Vikram can still decide on it.
    if (!before.includes("Monthly order for Agarwal Garments")) await raiseRequisition(browser, "shalini");
    const vikram = await signIn(browser, "vikram");
    await open(vikram.page, workspaceUrl(OPS, "procurement"));
    await expectVisibleText(vikram.page, "Cotton fabric");
    await vikram.page.locator("main").getByRole("button", { name: "Approve" }).first().click();
    await vikram.page.waitForTimeout(2500);
    const ledger = await api("vikram", "GET", "/operations/ledger");
    expect(JSON.stringify(ledger.requisitions ?? ledger)).toMatch(/approved/);
    expectNoProblems(vikram);
    await vikram.context.close();
  });

  test("Karan raises a purchase order, and Finance records and pays the bill", async ({ browser }) => {
    const karan = await signIn(browser, "karan");
    await open(karan.page, workspaceUrl(OPS, "purchase-orders"));
    const main = karan.page.locator("main");
    await choose(main, "Vendor", /Gujarat Yarn/);
    await choose(main, "Deliver to", /Bhiwandi/);
    await choose(main, "Item line 1", /Cotton fabric/);
    await field(main, "Quantity line 1").fill("200");
    await field(main, "Rate line 1").fill("150");
    const remove = main.getByRole("button", { name: "Remove" });
    if ((await remove.count()) > 1) await remove.last().click();
    await main.getByRole("button", { name: "Raise order" }).click();
    await expectToast(karan.page, /Purchase order raised/);
    expectNoProblems(karan);
    await karan.context.close();

    const vikram = await signIn(browser, "vikram");
    await open(vikram.page, workspaceUrl(FIN, "payables"));
    const finance = vikram.page.locator("main");
    await choose(finance, "Vendor", /Gujarat Yarn/);
    await field(finance, "Vendor's bill no.").fill("GYM/2026/441");
    await field(finance, "Amount with GST (₹)").fill("30000");
    await field(finance, "Due date").fill(day(30));
    await finance.getByRole("button", { name: "Record bill" }).click();
    await expectToast(vikram.page, /Bill recorded/);
    await open(vikram.page, workspaceUrl(FIN, "payables"));
    await expectVisibleText(vikram.page, "GYM/2026/441");
    expectNoProblems(vikram);
    await vikram.context.close();
  });
});
