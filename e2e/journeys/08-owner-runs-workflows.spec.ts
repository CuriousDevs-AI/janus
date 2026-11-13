import { expect, test } from "@playwright/test";
import { api, expectNoProblems, expectVisibleText, open, signIn } from "../lib";

async function poll<T>(read: () => Promise<T>, done: (value: T) => boolean, seconds = 60) {
  for (let attempt = 0; attempt < seconds; attempt += 1) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return read();
}

const notify = (channel: string, message: string) => ({ id: "notify", module: "communication", action: "send_notification", config: { channel, message } });

test.describe("Vikram runs several workflows across his companies", () => {
  test("he files workflows in folders, in two companies", async () => {
    for (const company of ["textiles", "foods"] as const) {
      await api("vikram", "POST", "/team/channels", { name: "sales-floor" }, company);
      const folder = await api("vikram", "POST", "/business/automation-folders", { name: "Sales" }, company);
      const lead = await api("vikram", "POST", "/business/automations", { name: "New lead alert", trigger: { type: "lead_created" }, actions: [notify("sales-floor", "New lead: {{lead.name}} wants {{lead.requirement}}")], requiresApproval: false, folderId: Number(folder.id) }, company);
      await api("vikram", "POST", `/business/automations/${lead.id}/publish`, {}, company);
    }
    const ticket = await api("vikram", "POST", "/business/automations", { name: "Ticket alert", trigger: { type: "ticket_created" }, actions: [notify("sales-floor", "Ticket {{ticket.number}}: {{ticket.subject}}")], requiresApproval: true }, "textiles");
    await api("vikram", "POST", `/business/automations/${ticket.id}/publish`, {}, "textiles");
    const folders = await api("vikram", "GET", "/business/automation-folders", undefined, "textiles");
    expect(folders[0]).toMatchObject({ name: "Sales", count: 1 });
  });

  test("a lead in Textiles starts its workflow, and the post appears only in Textiles", async () => {
    await api("priya", "POST", "/leads", { name: "Workflow Test Lead", phone: "+919812300002", requirement: "A trial order" });
    const channels = await api("vikram", "GET", "/team/channels", undefined, "textiles");
    const space = channels.find((item: { name: string }) => item.name === "sales-floor");
    const messages = await poll(() => api("vikram", "GET", `/team/spaces/${space.id}/messages`, undefined, "textiles"), (rows: { body: string }[]) => rows.some((row) => row.body.includes("Workflow Test Lead")));
    expect(JSON.stringify(messages)).toContain("Workflow Test Lead");
    const foods = (await api("vikram", "GET", "/team/channels", undefined, "foods")).find((item: { name: string }) => item.name === "sales-floor");
    const foodsMessages = await api("vikram", "GET", `/team/spaces/${foods.id}/messages`, undefined, "foods");
    expect(JSON.stringify(foodsMessages)).not.toContain("Workflow Test Lead");
  });

  test("a workflow that needs approval waits, and runs once Vikram approves", async () => {
    await api("vikram", "POST", "/support/tickets", { external_key: `tck-e2e-${Date.now()}`, number: "#9001", subject: "Approval needed test", priority: "high" }, "textiles");
    const workflows = await api("vikram", "GET", "/business/automations", undefined, "textiles");
    const flow = workflows.find((item: { name: string }) => item.name === "Ticket alert");
    const runs = await poll(() => api("vikram", "GET", `/business/automations/${flow.id}/runs`, undefined, "textiles"), (rows: { id: string }[]) => rows.length > 0, 30);
    expect(runs.length).toBeGreaterThan(0);
    const channels = await api("vikram", "GET", "/team/channels", undefined, "textiles");
    const space = channels.find((item: { name: string }) => item.name === "sales-floor");
    const before = await api("vikram", "GET", `/team/spaces/${space.id}/messages`, undefined, "textiles");
    expect(JSON.stringify(before)).not.toContain("Approval needed test");
    await api("vikram", "POST", `/business/automations/executions/${runs[0].id}/approve`, undefined, "textiles");
    const after = await poll(() => api("vikram", "GET", `/team/spaces/${space.id}/messages`, undefined, "textiles"), (rows: { body: string }[]) => rows.some((row) => row.body.includes("Approval needed test")));
    expect(JSON.stringify(after)).toContain("Approval needed test");
  });

  test("the Workflows page lists them, and the Runs tab shows what happened", async ({ browser }) => {
    const vikram = await signIn(browser, "vikram", "textiles");
    await open(vikram.page, "/automations?workspace=business");
    await expectVisibleText(vikram.page, "New lead alert", "Ticket alert");
    const flows = await api("vikram", "GET", "/business/automations", undefined, "textiles");
    await open(vikram.page, `/automations/${flows.find((item: { name: string }) => item.name === "New lead alert").id}?workspace=business`);
    await vikram.page.getByRole("tab", { name: /Runs/ }).click();
    await vikram.page.waitForTimeout(1500);
    await expect(vikram.page.locator("main")).toContainText(/Completed|Done|Succeeded|Ran/i);
    expectNoProblems(vikram);
    await vikram.context.close();
  });
});
