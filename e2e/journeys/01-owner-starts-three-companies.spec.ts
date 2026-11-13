import { expect, test } from "@playwright/test";
import { api, emailOf, emailToken, expectVisibleText, open, remember, run, signIn, BASE } from "../lib";
import { COMPANIES, OWNER } from "../personas";

const WORKSPACES = ["hr_people", "finance_accounting", "projects_delivery", "customer_support", "operations_inventory", "it_infrastructure"];

test.describe("Vikram starts his three companies on Janus", () => {
  test("he signs up from the website and verifies his email", async ({ page }) => {
    await page.goto(`${BASE}/signup`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.fill("#name", OWNER.name);
    await page.fill("#username", `vikram.${run().stamp}`.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 30));
    await page.fill("#email", emailOf("vikram"));
    await page.fill("#password", run().password);
    await page.fill("#confirm", run().password);
    await page.locator("button[type=submit]").click();
    const token = await emailToken(emailOf("vikram"), "verify-email");
    await page.goto(`${BASE}/verify-email?token=${encodeURIComponent(token)}`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Verify email" }).click();
    await page.waitForTimeout(2500);
    expect((await api("vikram", "GET", "/me")).user.email_verified_at, "his email is verified").toBeTruthy();
  });

  test("he signs in and finishes setup for his first company", async ({ browser }) => {
    const me = await api("vikram", "GET", "/me");
    remember((state) => { state.companies.textiles = String(me.tenant.id); });
    await api("vikram", "PATCH", "/business/setup", { businessName: COMPANIES[0].name, industry: COMPANIES[0].industry, companySize: "51–200 employees", timezone: "Asia/Kolkata", completedSteps: ["business_details", "workspaces", "members", "data_connections"] });
    for (const type of WORKSPACES) await api("vikram", "POST", "/workspaces", { type });
    // Three companies and about twenty people need more than the Free plan holds.
    await api("vikram", "PUT", "/billing/plan", { plan: "growth" });
    const vikram = await signIn(browser, "vikram");
    await open(vikram.page, "/settings?tab=workspace&view=overview&workspace=business");
    await expect(vikram.page).not.toHaveURL(/\/setup/);
    await vikram.context.close();
  });

  test("he adds his other two companies from the Portfolio", async ({ browser }) => {
    const vikram = await signIn(browser, "vikram");
    await open(vikram.page, "/portfolio?view=companies");
    for (const [index, company] of COMPANIES.slice(1).entries()) {
      await vikram.page.getByRole("button", { name: /Add company|Add a company/ }).first().click();
      const dialog = vikram.page.getByRole("dialog");
      await dialog.getByLabel("Name").fill(company.name);
      await dialog.getByLabel("Industry (optional)").fill(company.industry);
      await dialog.locator("button[type=submit]").click();
      await expect(dialog).toContainText(`${company.name} is added`, { timeout: 15000 });
      if (index === 0) {
        // The first he sets up at once: it opens into its own setup.
        await dialog.getByRole("button", { name: "Set it up now" }).click();
        await vikram.page.waitForURL(/\/setup/, { timeout: 20000 });
        await expect(vikram.page.locator("body")).toContainText(company.name, { timeout: 15000 });
        await open(vikram.page, "/portfolio?view=companies");
      } else {
        // The second he leaves for later, and stays in the Portfolio.
        await dialog.getByRole("button", { name: "Stay in the Portfolio" }).click();
        await vikram.page.waitForURL(/\/portfolio\?view=companies/, { timeout: 20000 });
      }
      await expectVisibleText(vikram.page, company.name);
    }
    const summary = await api("vikram", "GET", "/portfolio/summary");
    expect(summary.companies.map((item: { name: string }) => item.name).sort()).toEqual(COMPANIES.map((item) => item.name).sort());
    remember((state) => {
      for (const company of COMPANIES) state.companies[company.key] = String(summary.companies.find((item: { name: string }) => item.name === company.name).id);
    });
    await vikram.context.close();
  });

  test("each new company is set up with its own workspaces", async () => {
    for (const company of COMPANIES.slice(1)) {
      await api("vikram", "PATCH", "/business/setup", { industry: company.industry, companySize: "11–50 employees", completedSteps: ["business_details", "workspaces", "members", "data_connections"] }, company.key);
      for (const type of WORKSPACES) await api("vikram", "POST", "/workspaces", { type }, company.key);
      const workspaces = await api("vikram", "GET", "/workspaces", undefined, company.key);
      expect(workspaces.length).toBe(7);
    }
  });

  test("he switches between companies and sees the right one each time", async ({ browser }) => {
    for (const company of COMPANIES) {
      const vikram = await signIn(browser, "vikram", company.key);
      await open(vikram.page, "/settings?tab=workspace&view=overview&workspace=business");
      await expect(vikram.page.locator("body")).toContainText(company.name);
      await vikram.context.close();
    }
  });
});
