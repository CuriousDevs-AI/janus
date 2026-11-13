import { expect, test } from "@playwright/test";
import { api, expectNoProblems, open, run, signIn } from "../lib";

test.describe("People talk to each other in Team Chat", () => {
  test("Arjun and Priya message each other live, each in their own browser", async ({ browser }) => {
    const members = await api("arjun", "GET", "/team/people");
    const priyaId = members.find((item: { name: string }) => item.name === "Priya Nair").id;
    const direct = await api("arjun", "POST", "/team/conversations", { kind: "dm", member_ids: [Number(priyaId)] }).catch(async () => api("arjun", "POST", "/team/conversations", { user_ids: [Number(priyaId)] }));

    const arjun = await signIn(browser, "arjun");
    const priya = await signIn(browser, "priya");
    await open(arjun.page, "/team?workspace=team-chat");
    await open(priya.page, "/team?workspace=team-chat");
    await arjun.page.getByRole("button", { name: /Priya Nair/ }).first().click();
    await priya.page.getByRole("button", { name: /Arjun Mehta/ }).first().click();

    const hello = `Can you call Agarwal Garments today? ${run().stamp}`;
    const box = arjun.page.getByRole("textbox", { name: /message/i }).last();
    await box.fill(hello);
    await box.press("Enter");
    await expect(priya.page.locator("body"), "Priya sees it without reloading").toContainText(hello, { timeout: 20000 });

    const reply = `Yes, calling them at 3. ${run().stamp}`;
    const replyBox = priya.page.getByRole("textbox", { name: /message/i }).last();
    await replyBox.fill(reply);
    await replyBox.press("Enter");
    await expect(arjun.page.locator("body"), "Arjun sees the reply").toContainText(reply, { timeout: 20000 });
    expect(direct).toBeTruthy();
    expectNoProblems(arjun, priya);
    await arjun.context.close();
    await priya.context.close();
  });

  test("a department channel, a threaded reply and a reaction", async () => {
    const channel = await api("arjun", "POST", "/team/channels", { name: "agarwal-account", topic: "Everything on the Agarwal account" });
    for (const who of ["priya", "karan", "meera"]) await api(who, "POST", `/team/channels/${channel.id}/join`);
    const first = await api("karan", "POST", `/team/spaces/${channel.id}/messages`, { body: "Dispatch left Bhiwandi this morning." });
    await api("meera", "POST", `/team/spaces/${channel.id}/messages`, { body: "Invoice raised, thanks.", parent_id: Number(first.id) });
    await api("priya", "POST", `/team/messages/${first.id}/reactions`, { emoji: "🎉" });
    const replies = await api("arjun", "GET", `/team/messages/${first.id}/replies`);
    expect(JSON.stringify(replies)).toContain("Invoice raised");
    const rows = await api("arjun", "GET", `/team/spaces/${channel.id}/messages`);
    expect(JSON.stringify(rows)).toContain("🎉");
  });

  test("kudos, a poll people vote in, and an event", async () => {
    const channel = (await api("shalini", "GET", "/team/channels")).find((item: { name: string }) => item.name === "announcements");
    const people = await api("shalini", "GET", "/team/people");
    const priya = people.find((item: { name: string }) => item.name === "Priya Nair").id;
    await api("shalini", "POST", `/team/spaces/${channel.id}/posts`, { kind: "kudos", body: "Closed the Agarwal account in a week.", kudos_to: Number(priya), kudos_value: "Customer first" });
    const poll = await api("shalini", "POST", `/team/spaces/${channel.id}/posts`, { kind: "poll", title: "Annual day", body: "Where should we hold annual day?", options: ["Lonavala", "Alibaug"] });
    const option = poll.poll.options[0].id;
    await api("rohan", "POST", `/team/messages/${poll.id}/respond`, { value: String(option) });
    const voted = (await api("shalini", "GET", `/team/spaces/${channel.id}/messages`)).find((item: { id: string }) => item.id === poll.id);
    expect(JSON.stringify(voted.poll)).toMatch(/"votes":\s*1|"count":\s*1/);
    await api("shalini", "POST", `/team/spaces/${channel.id}/posts`, { kind: "event", title: "Town hall", body: "Quarterly town hall.", starts_at: new Date(Date.now() + 3 * 864e5).toISOString(), place: "Head office terrace" });
  });
});
