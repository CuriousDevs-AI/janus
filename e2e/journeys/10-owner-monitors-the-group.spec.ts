import { expect, test } from "@playwright/test";
import { api, apiStatus, acceptEveryInvite, emailOf, expectNoProblems, expectVisibleText, hire, open, run, signIn } from "../lib";
import { COMPANIES, GROUP_CFO } from "../personas";

test.describe("Vikram monitors all three companies from the Portfolio", () => {
  test("each other company gets a little activity of its own", async () => {
    await hire("foodsmgr", "manager", "foods");
  });

  test("the Portfolio shows all three companies, each with its own figures", async ({ browser }) => {
    await api("vikram", "POST", "/leads", { name: "Foods Distributor", phone: "+919812300003", requirement: "Rice supply" }, "foods");
    const summary = await api("vikram", "GET", "/portfolio/summary");
    expect(summary.companies.length).toBe(3);
    const byName = Object.fromEntries(summary.companies.map((item: { name: string }) => [item.name, item]));
    expect(JSON.stringify(byName["Malhotra Textiles"])).not.toEqual(JSON.stringify(byName["Malhotra Tech Services"]));
    const vikram = await signIn(browser, "vikram");
    for (const view of ["overview", "analytics", "finance", "companies"]) {
      await open(vikram.page, `/portfolio?view=${view}`);
      await expect(vikram.page.locator("main"), `${view} has no broken numbers`).not.toContainText(/NaN|undefined|\[object Object\]/);
    }
    await open(vikram.page, "/portfolio?view=overview");
    await expectVisibleText(vikram.page, ...COMPANIES.map((company) => company.name));
    expectNoProblems(vikram);
    await vikram.context.close();
  });

  test("he shares the Portfolio with his Group CFO, who can read but not manage", async () => {
    const grant = await api("vikram", "POST", "/portfolio/access", { email: emailOf("anita"), role: GROUP_CFO.role, companies: [] });
    expect(grant).toBeTruthy();
    expect(await acceptEveryInvite("anita", GROUP_CFO.name), "one invitation per company").toBe(3);
    const seen = await api("anita", "GET", "/portfolio/summary");
    expect(seen.companies.length).toBe(3);
    expect((await apiStatus("anita", "POST", "/portfolio/companies", { name: "Not allowed" })).status).toBe(403);
    expect((await apiStatus("anita", "POST", "/invitations", { email: "x@example.com", role: "agent" })).status).toBe(403);
  });

  test("previewing as Read-only shows what a Read-only person sees, and nothing more", async ({ browser }) => {
    const vikram = await signIn(browser, "vikram");
    await open(vikram.page, "/portfolio?view=overview&preview=group_analyst");
    await expectVisibleText(vikram.page, "Read-only", "your role does not see");
    await expect(vikram.page.locator("nav a[aria-current=page]"), "one page is highlighted").toHaveCount(1);
    await expect(vikram.page.locator("nav a[aria-current=page]")).toHaveText(/Overview/);
    await open(vikram.page, "/portfolio?view=notifications");
    await expect(vikram.page.locator("main"), "no money in a Read-only preview").not.toContainText(/Cash in the bank lasts|overdue from customers|supplier bills already late/);
    await open(vikram.page, "/portfolio?view=billing");
    await expectVisibleText(vikram.page, "The plan belongs to the Owner's account");
    await expect(vikram.page.getByRole("button", { name: /Move to/ })).toHaveCount(0);
    await expect(vikram.page.locator("nav a[aria-current=page]")).toHaveText(/Plan and billing/);
    expectNoProblems(vikram);
    await vikram.context.close();
  });

  test("an employee cannot see the Portfolio, or another company's records", async () => {
    expect((await apiStatus("priya", "POST", "/portfolio/companies", { name: "Not allowed" })).status).toBe(403);
    const summary = await apiStatus("priya", "GET", "/portfolio/summary");
    if (summary.status === 200) expect(summary.json().companies.length).toBe(0);
    else expect(summary.status).toBe(403);
    expect(JSON.stringify(await api("priya", "GET", "/leads"))).not.toContain("Foods Distributor");
    const foodsStaff = await apiStatus("foodsmgr", "GET", "/leads");
    expect(JSON.stringify(foodsStaff.json())).not.toContain("Agarwal");
    const hopping = await apiStatus("priya", "POST", "/me/switch-tenant", { tenant_id: Number(run().companies.foods) });
    expect(hopping.status, "Priya cannot switch into Foods").toBeGreaterThanOrEqual(400);
  });
});
