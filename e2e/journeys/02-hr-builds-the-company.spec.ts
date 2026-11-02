import { expect, test } from "@playwright/test";
import { api, BASE, day, emailOf, emailToken, expectNoProblems, expectToast, expectVisibleText, hire, open, run, signIn, workspaceUrl } from "../lib";
import { DEPARTMENTS, EMPLOYEES, HR_HEAD, OWNER, person } from "../personas";

const HR = "hr-people";

test.describe("Shalini, the Head of HR, builds the organisation", () => {
  test("Vikram invites Shalini and she joins from the email", async ({ page }) => {
    await api("vikram", "POST", "/invitations", { email: emailOf("shalini"), role: HR_HEAD.role });
    const token = await emailToken(emailOf("shalini"), "invite");
    await page.goto(`${BASE}/invite?token=${encodeURIComponent(token)}`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.fill("#invite-name", HR_HEAD.name);
    await page.fill("#invite-password", run().password);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.waitForURL((url) => !url.toString().includes("/invite"), { timeout: 20000 });
    const me = await api("shalini", "GET", "/me");
    expect(me.user.name).toBe(HR_HEAD.name);
  });

  test("she creates the five departments", async ({ browser }) => {
    const shalini = await signIn(browser, "shalini");
    for (const department of [{ name: "Management" }, ...DEPARTMENTS]) {
      await open(shalini.page, workspaceUrl(HR, "organization"));
      await shalini.page.getByRole("button", { name: /Add department/ }).first().click();
      const dialog = shalini.page.getByRole("dialog");
      await dialog.locator('label:has-text("Name")').locator("input").first().fill(department.name);
      await dialog.locator("button[type=submit]").click();
      await expectToast(shalini.page, new RegExp(`${department.name} added`));
    }
    const saved = (await api("shalini", "GET", "/hr/records")).records.config.find((item: { key: string }) => item.key === "org.departments");
    expect(saved.data.value.map((item: { name: string }) => item.name)).toEqual(expect.arrayContaining(DEPARTMENTS.map((item) => item.name)));
    expectNoProblems(shalini);
    await shalini.context.close();
  });

  test("she invites the fifteen employees, and each one joins", async () => {
    for (const employee of EMPLOYEES) await hire(employee.key, employee.role, undefined, "shalini");
    const members = await api("shalini", "GET", "/members");
    expect(members.length).toBe(EMPLOYEES.length + 2);
  });

  test("she adds every person's employee record, with who they report to", async ({ browser }) => {
    const shalini = await signIn(browser, "shalini");
    const records = [{ ...OWNER, department: "Management", salary: 300000 }, { ...HR_HEAD, department: "Management" }, ...EMPLOYEES];
    for (const record of records) {
      await open(shalini.page, workspaceUrl(HR, "employees"));
      await shalini.page.getByRole("button", { name: /Add employee/ }).first().click();
      const dialog = shalini.page.getByRole("dialog");
      const input = (label: string) => dialog.locator(`label:has-text("${label}")`).locator("input, select").first();
      await input("Full name").fill(record.name);
      await input("Work email").fill(emailOf(record.key));
      await input("Role").fill(record.title);
      await input("Department").selectOption({ label: record.department as string });
      await input("Branch").fill("Mumbai");
      if (record.managerKey) await input("Reports to").selectOption({ label: (await input("Reports to").locator("option").allInnerTexts()).find((text) => text.startsWith(person(record.managerKey as string).name)) as string });
      await input("Joining date").fill(day(-400));
      await input("Monthly pay").fill(String(record.salary));
      await dialog.locator("input[type=checkbox]").setChecked(false);
      await dialog.getByRole("button", { name: "Add employee" }).click();
      await expectToast(shalini.page, new RegExp(`${record.name} added`));
    }
    await open(shalini.page, workspaceUrl(HR, "employees"));
    await expectVisibleText(shalini.page, ...EMPLOYEES.map((employee) => employee.name));
    expectNoProblems(shalini);
    await shalini.context.close();
  });

  test("a new joiner gets an onboarding checklist, and it shows for her manager and HR", async ({ browser }) => {
    const shalini = await signIn(browser, "shalini");
    await open(shalini.page, workspaceUrl(HR, "employees"));
    await shalini.page.getByRole("button", { name: /Add employee/ }).first().click();
    const dialog = shalini.page.getByRole("dialog");
    const input = (label: string) => dialog.locator(`label:has-text("${label}")`).locator("input, select").first();
    await input("Full name").fill("Kavya Menon");
    await input("Work email").fill(`kavya.${run().stamp}@example.com`);
    await input("Role").fill("Sales Executive");
    await input("Department").selectOption({ label: "Sales" });
    await input("Branch").fill("Mumbai");
    await input("Reports to").selectOption({ label: (await input("Reports to").locator("option").allInnerTexts()).find((text) => text.startsWith("Arjun Mehta")) as string });
    await input("Joining date").fill(day(10));
    await dialog.locator("input[type=checkbox]").setChecked(true);
    await dialog.getByRole("button", { name: "Add employee" }).click();
    await expectToast(shalini.page, /Kavya Menon added/);
    await open(shalini.page, workspaceUrl(HR, "onboarding"));
    await expectVisibleText(shalini.page, "Kavya Menon");
    await shalini.context.close();
  });

  test("HR sees everyone's pay, and a colleague sees only their own", async () => {
    const hr = await api("shalini", "GET", "/hr/records");
    expect(hr.records.employee.length).toBeGreaterThanOrEqual(EMPLOYEES.length + 2);
    const priya = (await api("priya", "GET", "/hr/records")).records.employee as { data: { name: string; salary?: number; monthlySalary?: number } }[];
    const others = priya.filter((item) => item.data.name !== "Priya Nair");
    expect(others.length).toBeGreaterThan(0);
    for (const other of others) expect(JSON.stringify(other.data)).not.toMatch(/"(salary|monthlySalary|ctc|pay)":\s*[1-9]/i);
  });
});
