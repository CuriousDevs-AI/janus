"use client";

import { useSession } from "@/components/auth/session-provider";
import * as React from "react";
import Link from "next/link";
import { Megaphone, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrDocumentStore } from "@/lib/stores/hr-document-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { useHrEngageStore } from "@/lib/stores/hr-engage-store";
import { derivedCelebrations, timeAgo } from "@/lib/hr-engage";
import { useHolidays } from "@/lib/hr-holidays";
import { canDecide } from "@/lib/hr-leave";
import { useLeaveTypes } from "@/lib/hr-leave-hooks";
import { buildPayslip } from "@/lib/hr-payroll";
import { canDecideExpense } from "@/components/hr-people/expenses";
import { HrEmpty, HrPanel, hrDate, hrMoney, hrToday } from "@/components/hr-people/operations-ui";
import type { HrDemoRole } from "@/lib/types";

const quotes = ["Small steps taken every day add up to big things.", "Good work is built from clear goals and kind teammates.", "Do the next right thing, and do it well.", "Progress matters more than perfection.", "A tidy habit today saves a scramble tomorrow.", "Ask early. Help often. Say thank you.", "Your best work starts with a calm first hour.", "Teams win when everyone knows what matters most."];
const celebrationEmoji = { birthday: "🎂", anniversary: "🏅", newcomer: "👋" } as const;
const href = (view: string, extra = "") => `/workspace/hr-people?view=${view}&workspace=hr-people${extra}`;
const greeting = () => { const hour = Number(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).slice(0, 2)); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; };

function Card({ title, link, children }: { title: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return <HrPanel title={title} actions={link ? <Link href={link.href} className="text-xs text-accent underline-offset-2 hover:underline">{link.label}</Link> : undefined}>{children}</HrPanel>;
}

export function HrHomeView({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { employees, leaveRequests, expenseClaims, documents, onboardingTasks, payrollRuns, attendance } = useHrPeopleStore();
  const { policies, acknowledgements, extras } = useHrDocumentStore();
  const { settings, audit, regularisations, letterRequests, policyQuestions } = useHrOperationsStore();
  const { items, meta, react } = useHrEngageStore();
  const holidays = useHolidays();
  const types = useLeaveTypes();
  const today = hrToday();
  const actor = employees.find((item) => item.id === actorId);
  const nameOf = (id: string) => employees.find((item) => item.id === id)?.name ?? "Someone";
  const session = useSession();
  const first = (actor?.name ?? session.user.name ?? session.user.email ?? "there").split(" ")[0];
  const quote = quotes[Math.floor(new Date(`${today}T12:00:00`).getTime() / 86400000) % quotes.length];

  // What needs this person
  const managesAny = employees.some((item) => item.managerId === actorId);
  const toSign = documents.filter((item) => item.status !== "archived" && ["sent", "viewed", "partially_signed"].includes(item.signatureStatus) && (extras[item.id]?.signers?.length ? extras[item.id].signers!.some((signer) => signer.employeeId === actorId && ["pending", "viewed"].includes(signer.status)) : item.employeeId === actorId)).length;
  const toAck = policies.filter((item) => item.status !== "archived" && !acknowledgements[`${item.id}:${item.version}:${actorId}`]).length;
  const myTasks = onboardingTasks.filter((item) => item.employeeId === actorId && item.ownerRole === "employee" && item.status !== "done").length;
  const clarify = leaveRequests.filter((item) => item.employeeId === actorId && item.status === "needs_clarification").length;
  const approvals = leaveRequests.filter((item) => canDecide(item, actorId, role, settings, today).allowed).length + expenseClaims.filter((item) => canDecideExpense(item, employees.find((person) => person.id === item.employeeId), actorId, role, managesAny).allowed).length + regularisations.filter((item) => item.status === "pending" && item.employeeId !== actorId && (role === "owner" || role === "hr_manager" || employees.find((person) => person.id === item.employeeId)?.managerId === actorId)).length;
  const openPolls = items.filter((item) => item.poll && item.poll.closesAt >= today && !item.poll.votes[actorId]).length;
  const review = [
    toSign > 0 && { text: `${toSign} ${toSign === 1 ? "document" : "documents"} to sign`, to: href("my-documents") },
    toAck > 0 && { text: `${toAck} ${toAck === 1 ? "policy" : "policies"} to acknowledge`, to: href("my-documents", "&tab=company") },
    myTasks > 0 && { text: `${myTasks} onboarding ${myTasks === 1 ? "task" : "tasks"} for you`, to: href("my-onboarding") },
    clarify > 0 && { text: `${clarify} leave ${clarify === 1 ? "request needs" : "requests need"} your reply`, to: href("my-requests") },
    approvals > 0 && { text: `${approvals} ${approvals === 1 ? "request is" : "requests are"} waiting for your approval`, to: href("approvals") },
    openPolls > 0 && { text: `${openPolls} open ${openPolls === 1 ? "poll" : "polls"} to vote in`, to: href("engage") },
  ].filter(Boolean) as { text: string; to: string }[];

  // News
  const announcements = items.filter((item) => item.kind === "announcement").sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const since = new Date(`${today}T12:00:00`); since.setDate(since.getDate() - 30);
  const newPolicies = policies.filter((item) => item.status !== "archived" && item.issuedAt && item.issuedAt >= since.toLocaleDateString("en-CA") && item.issuedAt <= today);
  const celebrations = derivedCelebrations(employees, today).slice(0, 5);
  const holidaysNext = holidays.filter((item) => item.date >= today).slice(0, 4);
  const weekday = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "long" });

  // Payslip
  const lockedKeys = payrollRuns.filter((item) => item.status === "locked").map((item) => item.id.replace(/^pay-/, "")).sort().reverse();
  const slip = actor && lockedKeys[0] ? buildPayslip(actor, lockedKeys[0]) : null;

  // Who is out
  const out = leaveRequests.filter((item) => item.status === "approved" && item.from <= today && today <= item.to);
  const absentNames = [...new Set([...out.map((item) => item.employeeId), ...attendance.filter((item) => item.date === today && item.status === "on_leave").map((item) => item.employeeId)])];

  // Track
  const track = [
    { label: "Leave", n: leaveRequests.filter((item) => item.employeeId === actorId && (item.status === "pending" || item.status === "needs_clarification")).length, to: href("my-requests") },
    { label: "Expenses", n: expenseClaims.filter((item) => item.employeeId === actorId && ["submitted", "manager_review", "hr_review", "approved"].includes(item.status)).length, to: href("my-payslips") },
    { label: "Corrections", n: regularisations.filter((item) => item.employeeId === actorId && item.status === "pending").length, to: href("my-regularization") },
    { label: "Letters", n: letterRequests.filter((item) => item.employeeId === actorId && item.status === "pending").length, to: href("document-center") },
    { label: "Questions to HR", n: policyQuestions.filter((item) => item.employeeId === actorId && item.status === "open").length, to: href("policy-qa") },
  ];

  // Updates about my own requests
  const mine = new Map<string, string>();
  leaveRequests.filter((item) => item.employeeId === actorId).forEach((item) => mine.set(item.id, `${types.name(item.type)} leave on ${hrDate(item.from)}`));
  expenseClaims.filter((item) => item.employeeId === actorId).forEach((item) => mine.set(item.id, `${hrMoney(item.amount)} expense claim`));
  regularisations.filter((item) => item.employeeId === actorId).forEach((item) => mine.set(item.id, `${item.kind === "permission" ? "permission" : "attendance correction"} for ${hrDate(item.date)}`));
  letterRequests.filter((item) => item.employeeId === actorId).forEach((item) => mine.set(item.id, item.type.toLowerCase()));
  const verbs: Record<string, string> = { approved: "approved", approved_by_manager: "approved by your manager and sent to HR", rejected: "rejected", cancelled_by_hr: "cancelled by HR", clarification_requested: "sent back with a question", marked_paid: "marked as paid", regularisation_approved: "approved", regularisation_rejected: "rejected", letter_issued: "issued. Open it in My documents", letter_declined: "declined" };
  const updates = [
    ...audit.filter((item) => mine.has(item.recordId) && item.actorId !== actorId && verbs[item.action]).map((item) => ({ id: item.id, at: item.at, text: `Your ${mine.get(item.recordId)} was ${verbs[item.action]}.`, by: nameOf(item.actorId) })),
    ...policyQuestions.filter((item) => item.employeeId === actorId && item.status === "answered" && item.repliedAt).map((item) => ({ id: item.id, at: item.repliedAt!, text: `HR replied to your question: “${item.question}”`, by: nameOf(item.repliedBy ?? "") })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);

  return <div className="space-y-5">
    <section className="flex flex-wrap items-end justify-between gap-4 border border-border bg-surface p-5"><div><h2 className="text-2xl font-semibold tracking-tight">{greeting()}, {first}</h2><p className="mt-1 text-sm text-muted-foreground">{quote}</p></div><p className="text-sm text-muted-foreground">{new Date(`${today}T12:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></section>
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <Card title="Needs you">{review.length ? <ul className="divide-y divide-border text-sm">{review.map((item) => <li key={item.text}><Link href={item.to} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2"><span>{item.text}</span><span aria-hidden className="text-muted-foreground">›</span></Link></li>)}</ul> : <HrEmpty>Hurrah! You&apos;ve nothing to review.</HrEmpty>}</Card>
      <Card title="What's new" link={{ href: href("engage"), label: "Open Engage" }}>{announcements.length || newPolicies.length ? <ul className="divide-y divide-border text-sm">
        {announcements.map((item) => <li key={item.id} className="space-y-1 px-5 py-3"><p className="flex items-center gap-2 font-medium"><Megaphone aria-hidden className="size-3.5 text-accent" />{item.title ?? "Announcement"}{item.pinned && <Pin aria-label="Pinned" className="size-3 text-warning" />}</p><p className="text-xs text-muted-foreground">{item.text}</p><p className="text-[11px] text-muted-foreground">{nameOf(item.authorId)} · {timeAgo(item.createdAt)}</p></li>)}
        {newPolicies.map((item) => <li key={item.id} className="px-5 py-3"><Link href={href("my-documents", "&tab=company")} className="block"><p className="text-sm font-medium">New policy: {item.name}</p><p className="text-xs text-muted-foreground">Issued {item.issuedAt ? hrDate(item.issuedAt) : "recently"}. Read and acknowledge it.</p></Link></li>)}
      </ul> : <HrEmpty>No news yet. Announcements from HR appear here.</HrEmpty>}</Card>
      <Card title="Celebrations & newcomers" link={{ href: href("engage"), label: "See all" }}>{celebrations.length ? <ul className="divide-y divide-border text-sm">{celebrations.map((item) => { const wished = (meta[item.id]?.reactions["🎉"] ?? []).includes(actorId); return <li key={item.id} className="flex items-center gap-3 px-5 py-3"><span aria-hidden className="text-xl">{celebrationEmoji[item.kind]}</span><p className="min-w-0 flex-1">{item.text}</p>{item.employee.id !== actorId && <Button size="sm" variant={wished ? "default" : "outline"} aria-pressed={wished} onClick={() => react(item.id, "🎉", actorId)}>{wished ? "Wished" : item.kind === "newcomer" ? "Welcome" : "Wish"}</Button>}</li>; })}</ul> : <HrEmpty>No birthdays or anniversaries this week.</HrEmpty>}</Card>
      <Card title="Upcoming holidays" link={{ href: href("holiday-calendar"), label: "Holiday calendar" }}>{holidaysNext.length ? <ul className="divide-y divide-border text-sm">{holidaysNext.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{hrDate(item.date).replace(/ \d{4}$/, "")} · {weekday(item.date)}{item.kind === "optional" ? " · optional" : ""}</p></div>{item.kind === "optional" && ![0, 6].includes(new Date(`${item.date}T12:00:00`).getDay()) && <Button size="sm" variant="outline" asChild><Link href={href("leave-apply", `&from=${item.date}`)} aria-label={`Apply for leave on ${item.name}`}>Apply</Link></Button>}</li>)}</ul> : <HrEmpty>No holidays coming up.</HrEmpty>}</Card>
      <Card title="Payslip" link={{ href: href("my-payslips"), label: "All payslips" }}>{slip ? <div className="space-y-2 px-5 py-4"><p className="text-xs text-muted-foreground">{slip.label}</p><p className="text-3xl font-semibold">{hrMoney(slip.net)}</p><p className="text-xs text-muted-foreground">Net pay · {slip.paidDays}/{slip.totalDays} days paid</p><Button size="sm" variant="outline" asChild><Link href={href("my-payslips")}>View payslip</Link></Button></div> : <HrEmpty>Uh oh! Your payslip will show up here after payroll is released.</HrEmpty>}</Card>
      <Card title="Out today">{absentNames.length ? <ul className="divide-y divide-border text-sm">{absentNames.map((id) => { const leave = out.find((item) => item.employeeId === id); return <li key={id} className="flex items-center justify-between gap-3 px-5 py-2.5"><span>{nameOf(id)}</span><span className="text-xs text-muted-foreground">{leave ? `Back ${hrDate(leave.to).replace(/ \d{4}$/, "")}` : "On leave"}</span></li>; })}</ul> : <HrEmpty>Everyone is in today.</HrEmpty>}</Card>
      <Card title="Track my requests"><ul className="grid grid-cols-2 gap-px bg-border">{track.map((item) => <li key={item.label} className="bg-surface"><Link href={item.to} className="block px-5 py-3 hover:bg-surface-2"><span className="text-2xl font-semibold">{item.n}</span><span className="block text-xs text-muted-foreground">{item.label} in progress</span></Link></li>)}</ul></Card>
      <Card title="Updates for you">{updates.length ? <ul className="divide-y divide-border text-sm">{updates.map((item) => <li key={item.id} className="px-5 py-3"><p>{item.text}</p><p className="text-[11px] text-muted-foreground">{item.by} · {timeAgo(item.at)}</p></li>)}</ul> : <HrEmpty>No updates yet. Decisions on your requests show up here.</HrEmpty>}</Card>
      <Card title="Quick access"><ul className="grid grid-cols-2 gap-2 p-4 text-sm">{[["Apply for leave", href("leave-apply")], ["Leave balances", href("leave-balances")], ["Attendance", href("attendance-info")], ["Regularization", href("my-regularization")], ["Payslips", href("my-payslips")], ["Document Center", href("document-center")], ["Ask about policy", href("policy-qa")], ["Engage", href("engage")]].map(([label, to]) => <li key={label}><Link href={to} className="block border border-border px-3 py-2 hover:border-accent hover:text-accent">{label}</Link></li>)}</ul></Card>
    </div>
  </div>;
}
