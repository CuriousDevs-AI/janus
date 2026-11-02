import { expect, test } from "@playwright/test";
import { api, choose, day, expectNoProblems, expectToast, expectVisibleText, field, open, signIn, workspaceUrl } from "../lib";

const PROJECTS = "projects-delivery";

test.describe("Neha runs a client project, drawn from a Finance budget", () => {
  test("Neha creates the project from a budget line", async ({ browser }) => {
    const neha = await signIn(browser, "neha");
    await open(neha.page, workspaceUrl(PROJECTS, "projects"));
    await neha.page.fill("#pj-name", "Agarwal Garments factory rollout");
    await neha.page.fill("#pj-client", "Agarwal Garments");
    await neha.page.fill("#pj-start", day(0));
    await neha.page.fill("#pj-end", day(60));
    await neha.page.fill("#pj-budget", "500000");
    const line = neha.page.locator("#pj-line");
    await line.selectOption({ label: (await line.locator("option").allInnerTexts()).find((text) => /Client projects/.test(text)) as string });
    const owner = neha.page.locator("#pj-owner");
    await owner.selectOption({ label: "Neha Gupta" });
    await neha.page.getByRole("button", { name: "Create project" }).click();
    await expectToast(neha.page, /Project created/);
    expectNoProblems(neha);
    await neha.context.close();
  });

  test("if she could not, Vikram creates it for her, so the project work can go on", async ({ browser }) => {
    const existing = await api("vikram", "GET", "/project-records");
    test.skip(JSON.stringify(existing).includes("Agarwal Garments factory rollout"), "Neha created it herself");
    const vikram = await signIn(browser, "vikram");
    await open(vikram.page, workspaceUrl(PROJECTS, "projects"));
    await vikram.page.fill("#pj-name", "Agarwal Garments factory rollout");
    await vikram.page.fill("#pj-client", "Agarwal Garments");
    await vikram.page.fill("#pj-start", day(0));
    await vikram.page.fill("#pj-end", day(60));
    await vikram.page.fill("#pj-budget", "500000");
    const line = vikram.page.locator("#pj-line");
    await line.selectOption({ label: (await line.locator("option").allInnerTexts()).find((text) => /Client projects/.test(text)) as string });
    await vikram.page.locator("#pj-owner").selectOption({ label: "Neha Gupta" });
    await vikram.page.getByRole("button", { name: "Create project" }).click();
    await expectToast(vikram.page, /Project created/);
    await vikram.context.close();
  });

  test("Neha plans tasks and a billable milestone, and they stay after a reload", async ({ browser }) => {
    const neha = await signIn(browser, "neha");
    for (const [title, who, due] of [["Survey the factory floor", "Fatima Shaikh", 5], ["Agree the rollout plan", "Aditya Mehra", 10]] as const) {
      await open(neha.page, workspaceUrl(PROJECTS, "tasks"));
      const main = neha.page.locator("main");
      await choose(main, "Project", /Agarwal Garments factory/);
      await field(main, "Task title").fill(title);
      await field(main, "Assignee").fill(who);
      await field(main, "Due date").fill(day(due));
      await main.getByRole("button", { name: "Add task" }).click();
      await expectToast(neha.page, /Task added/);
    }
    await open(neha.page, workspaceUrl(PROJECTS, "milestones"));
    const main = neha.page.locator("main");
    await choose(main, "Project", /Agarwal Garments factory/);
    await field(main, "Milestone name").fill("Factory live");
    await field(main, "Due date").fill(day(45));
    await field(main, "Billing amount").fill("250000");
    await main.getByRole("button", { name: "Add milestone" }).click();
    await expectToast(neha.page, /Milestone added/);
    await open(neha.page, workspaceUrl(PROJECTS, "tasks"));
    await expectVisibleText(neha.page, "Survey the factory floor", "Agree the rollout plan");
    await open(neha.page, workspaceUrl(PROJECTS, "milestones"));
    await expectVisibleText(neha.page, "Factory live");
    expectNoProblems(neha);
    await neha.context.close();
  });

  test("Neha logs hours on the project", async ({ browser }) => {
    const neha = await signIn(browser, "neha");
    await open(neha.page, workspaceUrl(PROJECTS, "timesheets"));
    const main = neha.page.locator("main");
    await choose(main, "Project", /Agarwal Garments factory/);
    await field(main, "Date").fill(day(-1));
    await field(main, "Hours").fill("6");
    await field(main, "Note").fill("Kick-off with the client");
    await main.getByRole("button", { name: "Log hours" }).click();
    await expectToast(neha.page, /Hours logged/);
    await open(neha.page, workspaceUrl(PROJECTS, "timesheets"));
    await expectVisibleText(neha.page, "Kick-off with the client");
    expectNoProblems(neha);
    await neha.context.close();
    const records = await api("neha", "GET", "/project-records");
    expect(JSON.stringify(records)).toContain("Agarwal Garments factory rollout");
  });
});
