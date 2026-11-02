import { expect, test } from "@playwright/test";
import { api, expectNoProblems, expectToast, expectVisibleText, open, run, signIn, workday, workspaceUrl } from "../lib";

const HR = "hr-people";

test.describe("Employees, their managers and HR work together", () => {
  test("Priya asks for leave, Arjun approves, then Shalini approves", async ({ browser }) => {
    const priya = await signIn(browser, "priya");
    await open(priya.page, workspaceUrl(HR, "leave-apply"));
    const main = priya.page.locator("main");
    await main.locator("select").first().selectOption({ label: "Earned leave" });
    await main.locator("input[type=date]").nth(0).fill(workday(14));
    await main.locator("input[type=date]").nth(1).fill(workday(15));
    await main.locator("textarea").fill("Sister's wedding in Kochi.");
    await expectVisibleText(priya.page, /Goes to Arjun Mehta/);
    await main.getByRole("button", { name: "Submit request" }).click();
    await expectToast(priya.page, /Arjun Mehta will review/);

    const arjun = await signIn(browser, "arjun");
    await open(arjun.page, workspaceUrl(HR, "leave"));
    await expectVisibleText(arjun.page, "Priya Nair");
    await arjun.page.locator("main").getByRole("button", { name: "Approve" }).first().click();
    await arjun.page.getByRole("dialog").getByRole("button", { name: /Approve|Confirm/ }).last().click();
    await arjun.page.waitForTimeout(2000);

    const shalini = await signIn(browser, "shalini");
    await open(shalini.page, workspaceUrl(HR, "leave"));
    await expectVisibleText(shalini.page, "Priya Nair");
    await shalini.page.locator("main").getByRole("button", { name: "Approve" }).first().click();
    await shalini.page.getByRole("dialog").getByRole("button", { name: /Approve|Confirm/ }).last().click();
    await shalini.page.waitForTimeout(2000);

    const leave = (await api("priya", "GET", "/hr/records")).records.leave as { data: { status: string } }[];
    expect(leave.at(-1)?.data.status).toBe("approved");
    expectNoProblems(priya, arjun, shalini);
    for (const session of [priya, arjun, shalini]) await session.context.close();
  });

  test("a colleague cannot approve leave outside their team", async ({ browser }) => {
    const karan = await signIn(browser, "karan");
    await open(karan.page, workspaceUrl(HR, "leave"));
    await expect(karan.page.locator("main")).not.toContainText("Sister's wedding");
    await karan.context.close();
  });

  test("Deepak resigns: HR opens his exit, and clearance tasks appear", async ({ browser }) => {
    const shalini = await signIn(browser, "shalini");
    await open(shalini.page, workspaceUrl(HR, "offboarding"));
    await shalini.page.locator("main").getByRole("button", { name: "Start exit" }).first().click();
    const dialog = shalini.page.getByRole("dialog");
    const employee = dialog.locator('label:has-text("Employee") select');
    await employee.selectOption({ label: (await employee.locator("option").allInnerTexts()).find((text) => /Deepak/.test(text)) as string });
    await dialog.locator("input[type=date]").fill(workday(21));
    await dialog.locator("textarea").fill("Moving back to his hometown.");
    await dialog.getByRole("button", { name: "Start exit" }).click();
    await expectToast(shalini.page, /Exit started/);
    await open(shalini.page, workspaceUrl(HR, "offboarding"));
    await expectVisibleText(shalini.page, "Deepak Kumar", /tasks/);
    expectNoProblems(shalini);
    await shalini.context.close();
  });

  test("Shalini posts an official announcement, and every employee sees it", async () => {
    const channel = (await api("shalini", "GET", "/team/channels")).find((item: { name: string }) => item.name === "announcements");
    expect(channel, "the company has an announcements channel").toBeTruthy();
    await api("shalini", "POST", `/team/spaces/${channel.id}/posts`, { kind: "announcement", title: "Diwali holidays", body: `The office is closed for Diwali. Run ${run().stamp}.` });
    const seen = await api("priya", "GET", "/team/announcements?after=0");
    expect(JSON.stringify(seen)).toContain("Diwali holidays");
  });

  test("an agent cannot post in the announcements channel", async () => {
    const channel = (await api("priya", "GET", "/team/channels")).find((item: { name: string }) => item.name === "announcements");
    const { apiStatus } = await import("../lib");
    const refused = await apiStatus("priya", "POST", `/team/spaces/${channel.id}/messages`, { body: "Hello everyone" });
    expect(refused.status).toBe(403);
  });
});
