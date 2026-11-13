import { expect, test } from "@playwright/test";
import { api, open, signIn, workspaceUrl } from "../lib";
import { DEPARTMENTS, EMPLOYEES } from "../personas";

/**
 * What each department needs to do its own work. These state what an enterprise expects: a department's
 * head and staff can open their own workspace, without getting everything else in the company.
 */
test.describe("Each department can work in its own workspace", () => {
  for (const department of DEPARTMENTS) {
    const people = EMPLOYEES.filter((item) => item.department === department.name);
    test(`${department.name}: all three people hold what their workspace needs`, async () => {
      const blocked: string[] = [];
      for (const employee of people) {
        const me = await api(employee.key, "GET", "/me");
        const permissions: string[] = me.permissions ?? [];
        if (!permissions.includes("*") && !permissions.includes(department.permission)) blocked.push(`${employee.name} (${employee.role})`);
      }
      expect(blocked, `blocked from ${department.workspace}, which needs ${department.permission}`).toEqual([]);
    });
  }

  test("the head of Sales cannot open Finance or IT", async ({ browser }) => {
    const arjun = await signIn(browser, "arjun");
    for (const workspace of ["finance-accounting", "it-infrastructure"]) {
      await open(arjun.page, workspaceUrl(workspace));
      await expect(arjun.page.locator("main")).not.toContainText(/New invoice|Add asset/);
    }
    await arjun.context.close();
  });

  test("an agent sees nothing beyond their own work and Team Chat", async () => {
    const me = await api("rohan", "GET", "/me");
    expect((me.permissions as string[]).sort()).toEqual(["hr:self", "leads:read_own", "leads:write"]);
  });
});
