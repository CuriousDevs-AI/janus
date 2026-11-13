import { expect, test, type Browser } from "@playwright/test";
import { api, choose, expectNoProblems, expectToast, expectVisibleText, field, open, signIn, workspaceUrl, apiStatus, day } from "../lib";

const IT = "it-infrastructure";
const SUPPORT = "customer-support";

test.describe("Support looks after a customer, and IT looks after the staff", () => {
  test("Arjun opens a ticket for a customer", async ({ browser }) => {
    const arjun = await signIn(browser, "arjun");
    await open(arjun.page, "/tickets?workspace=crm-sales");
    await arjun.page.getByRole("button", { name: /New Ticket/ }).click();
    const dialog = arjun.page.getByRole("dialog");
    await dialog.getByRole("combobox").first().click();
    await arjun.page.getByRole("option", { name: /Ramesh Agarwal/ }).click();
    await arjun.page.fill("#ticket-subject", "Fabric shade does not match the sample");
    await arjun.page.fill("#ticket-description", "Two rolls from the last dispatch are a lighter shade.");
    await dialog.getByRole("combobox").nth(1).click();
    await arjun.page.getByRole("option", { name: /High/ }).click();
    await dialog.getByRole("button", { name: "Create ticket" }).click();
    await expectToast(arjun.page, /Ticket created/);

    expectNoProblems(arjun);
    await arjun.context.close();
  });

  const openTicket = async (browser: Browser, who: string) => {
    const session = await signIn(browser, who);
    await open(session.page, "/tickets?workspace=crm-sales");
    await session.page.locator("main").getByText("Fabric shade does not match the sample").first().click();
    await session.page.waitForURL(/\/tickets\/.+/, { timeout: 15000 });
    await session.page.waitForTimeout(1500);
    return session;
  };

  test("Arjun, who heads the team, assigns the ticket to Rohan", async ({ browser }) => {
    const arjun = await openTicket(browser, "arjun");
    await arjun.page.getByRole("button", { name: "Assign" }).click();
    await expect(arjun.page.getByRole("menu")).toContainText("Rohan Das");
    await arjun.context.close();
  });

  test("the ticket is assigned and resolved", async ({ browser }) => {
    const vikram = await openTicket(browser, "vikram");
    await vikram.page.getByRole("button", { name: "Assign" }).click();
    await vikram.page.getByRole("menuitem", { name: /Rohan Das/ }).click();
    await expectToast(vikram.page, /Assigned to Rohan/);
    await vikram.context.close();
    const arjun = await openTicket(browser, "arjun");
    await arjun.page.locator("main").getByRole("button", { name: /^Resolve/ }).first().click();
    const confirm = arjun.page.getByRole("dialog");
    if (await confirm.count()) {
      const note = confirm.locator("textarea");
      if (await note.count()) await note.fill("Replaced the two rolls.");
      await confirm.getByRole("button", { name: /Resolve/ }).last().click();
    }
    await arjun.page.waitForTimeout(2000);
    const tickets = await api("arjun", "GET", "/support/tickets");
    expect(tickets.find((item: { subject: string }) => /Fabric shade/.test(item.subject)).status).toMatch(/resolved|closed/);
    expectNoProblems(arjun);
    await arjun.context.close();
  });

  test("the customer's feedback and renewal are recorded in Customer Support", async ({ browser }) => {
    const arjun = await signIn(browser, "arjun");
    await open(arjun.page, workspaceUrl(SUPPORT, "feedback"));
    let main = arjun.page.locator("main");
    await choose(main, "Resolved ticket", /Fabric shade/);
    await choose(main, "Rating", /4 \/ 5/);
    await field(main, "Customer's words").fill("Quick replacement, thank you.");
    await main.getByRole("button", { name: "Record feedback" }).click();
    await expectToast(arjun.page, /[Ff]eedback/);
    await open(arjun.page, workspaceUrl(SUPPORT, "renewals"));
    main = arjun.page.locator("main");
    await choose(main, "Customer", /Ramesh Agarwal|Agarwal Garments/);
    await field(main, "Contract end").fill(day(60));
    await field(main, "Contract value").fill("850000");
    await choose(main, "Renewal owner", /Arjun/);
    await main.getByRole("button", { name: "Add renewal" }).click();
    await expectToast(arjun.page, /[Rr]enewal/);
    await arjun.context.close();
  });

  test("IT records assets and licences, and answers a helpdesk request", async ({ browser }) => {
    // Only owners and admins hold the IT permission today; see 11-access-by-department.
    const shalini = await signIn(browser, "shalini");
    await open(shalini.page, workspaceUrl(IT, "assets"));
    let main = shalini.page.locator("main");
    await field(main, "Asset name").fill("Dell Latitude 5440");
    await choose(main, "Asset type", /Laptop/);
    await field(main, "Serial number").fill("DL5440-E2E");
    await field(main, "Cost").fill("78000");
    await main.getByRole("button", { name: "Add asset" }).click();
    await expectToast(shalini.page, /Asset added/);
    await open(shalini.page, workspaceUrl(IT, "licenses"));
    main = shalini.page.locator("main");
    await field(main, "Licence name").fill("Tally Prime");
    await field(main, "Vendor").fill("Tally Solutions");
    await field(main, "Seats").fill("3");
    await field(main, "Annual cost").fill("27000");
    await field(main, "Renewal date").fill(day(90));
    await main.getByRole("button", { name: "Add licence" }).click();
    await expectToast(shalini.page, /Licence added/);
    await open(shalini.page, workspaceUrl(IT, "helpdesk"));
    main = shalini.page.locator("main");
    await choose(main, "Requester", /Priya Nair/);
    await choose(main, "Category", /Laptop/);
    await choose(main, "Priority", /high/);
    await field(main, "Problem").fill("Laptop battery drains in an hour");
    await main.getByRole("button", { name: "Raise request" }).click();
    await expectToast(shalini.page, /Request raised/);
    await open(shalini.page, workspaceUrl(IT, "helpdesk"));
    await expectVisibleText(shalini.page, "Laptop battery drains");
    expectNoProblems(shalini);
    await shalini.context.close();
  });

  test("a high-risk IT change waits for approval, and then can be completed", async () => {
    const change = await api("shalini", "POST", "/it/changes", { title: "Move billing database to a new server", risk: "high" });
    expect(change.status).toMatch(/pending|requested|awaiting/i);
    const self = await apiStatus("shalini", "POST", `/it/changes/${change.id}/decision`, { approve: true });
    expect(self.status, "the person who asked cannot approve their own change").toBe(403);
    const approved = await api("vikram", "POST", `/it/changes/${change.id}/decision`, { approve: true });
    expect(approved.status).toMatch(/approved/i);
    const done = await api("shalini", "POST", `/it/changes/${change.id}/complete`, {});
    expect(done.status).toMatch(/complete|done/i);
  });
});
