"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  IndianRupee,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Eye,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/settings/section-ui";
import { demoMode } from "@/lib/demo-mode";
import { HrPerformanceView } from "@/components/hr-people/performance";
import { HrReportsView } from "@/components/hr-people/reports";
import { HrExpensesView } from "@/components/hr-people/expenses";
import { HrApprovalsView } from "@/components/hr-people/approvals";
import { HrEmployeeImport } from "@/components/hr-people/employee-import";
import { HrHomeView } from "@/components/hr-people/home";
import { HrEngageView } from "@/components/hr-people/engage";
import { HrLeaveApplyView, HrLeaveBalancesView, HrHolidayCalendarView } from "@/components/hr-people/leave-pages";
import { HrAttendanceInfoView, HrRegularizationView } from "@/components/hr-people/attendance-pages";
import { HrDocumentCenterView } from "@/components/hr-people/document-center";
import { HrSalaryView } from "@/components/hr-people/salary";
import { HrPolicyQaView } from "@/components/hr-people/policy-qa";
import { HrPolicyPanel } from "@/components/hr-people/policy-settings";
import { HrAttendanceView } from "@/components/hr-people/attendance";
import { HrLeaveCalendarView } from "@/components/hr-people/leave-calendar";
import { HrLeaveView } from "@/components/hr-people/leave";
import { HrOnboardingView } from "@/components/hr-people/onboarding";
import { HrPayrollView } from "@/components/hr-people/payroll";
import { HrRecruitmentView } from "@/components/hr-people/recruitment";
import { HrOffboardingView } from "@/components/hr-people/offboarding";
import { HrDocumentsView, HrSignaturesView } from "@/components/hr-people/documents";
import { canOpenHrView, canManageHr, canSeeBusinessSummary, demoActorId, hrRoleLabels, salaryVisible, visibleEmployees } from "@/lib/hr-people-access";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import type { HrDemoRole, HrEmployee } from "@/lib/types";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

const roleOptions: HrDemoRole[] = ["owner", "business_manager", "hr_manager", "reporting_manager", "payroll_admin", "employee"];

function statusVariant(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["active", "present", "approved", "signed", "done", "delivered", "accepted", "current", "locked"].includes(status)) return "success";
  if (["onboarding", "late", "pending", "review", "sent", "viewed", "in_progress", "offer", "expiring", "notice"].includes(status)) return "warning";
  if (["absent", "rejected", "missing", "open", "expired"].includes(status)) return "danger";
  if (["interview", "screening", "partially_signed"].includes(status)) return "info";
  return "neutral";
}

const selfServiceViews = new Set(["my-home", "engage", "leave-apply", "leave-balances", "holiday-calendar", "attendance-info", "my-regularization", "document-center", "my-documents", "my-payslips", "my-requests", "my-onboarding", "my-profile", "policy-qa"]);

export function HrPeopleWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const view = params.get("view") ?? "overview";
  const role = useHrPeopleStore((state) => state.demoRole);
  const setDemoRole = useHrPeopleStore((state) => state.setDemoRole);
  const employees = useHrPeopleStore((state) => state.employees);
  const employeeRows = visibleEmployees(role, employees);
  // An employee lands on Home, not the HR dashboard.
  const shown = role === "employee" && view === "overview" ? "my-home" : view;
  React.useEffect(() => { if (role === "employee" && view === "overview") router.replace("/workspace/hr-people?view=my-home&workspace=hr-people"); }, [role, view, router]);
  const title = viewTitle(shown);

  function changeRole(nextRole: HrDemoRole) {
    setDemoRole(nextRole);
    window.localStorage.setItem("janus.hr-demo-role", nextRole);
    window.dispatchEvent(new Event("janus:hr-demo-role"));
    toast.success(`Previewing ${hrRoleLabels[nextRole]} access`);
  }

  React.useEffect(() => {
    const stored = window.localStorage.getItem("janus.hr-demo-role") as HrDemoRole | null;
    if (stored && roleOptions.includes(stored) && stored !== role) setDemoRole(stored);
  }, [role, setDemoRole]);

  const blocked = !canOpenHrView(role, view);

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col">
      <PageHeader
        title={title}
        description={selfServiceViews.has(shown) ? "Your work, time off, pay and documents in one place." : "Employee records, approvals and people operations in one permission-aware workspace."}
        actions={<div className="flex flex-wrap items-center gap-2"><Badge variant={demoMode ? "info" : "neutral"}>{demoMode ? "Sample data" : "Live records"}</Badge>{demoMode && <label className="flex items-center gap-2 text-xs text-muted-foreground"><span>Preview as</span><select value={role} onChange={(event) => changeRole(event.target.value as HrDemoRole)} className="h-8 border border-border bg-surface px-2 text-xs text-foreground">{roleOptions.map((item) => <option key={item} value={item}>{hrRoleLabels[item]}</option>)}</select></label>}</div>}
      />
      <div className="px-6 pb-10">
        {demoMode && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-info/30 bg-info-muted px-3 py-2 text-xs text-info"><ShieldCheck className="size-3.5" />Access preview: {hrRoleLabels[role]}. Business Management access and HR workspace access are separate.</div>}
        {blocked ? <AccessNotice role={role} /> : (
          <>
            {shown === "my-home" && <HrHomeView role={role} actorId={demoActorId(role)} />}
            {shown === "engage" && <HrEngageView role={role} actorId={demoActorId(role)} />}
            {shown === "leave-apply" && <HrLeaveApplyView actorId={demoActorId(role)} />}
            {shown === "leave-balances" && <HrLeaveBalancesView actorId={demoActorId(role)} />}
            {shown === "holiday-calendar" && <HrHolidayCalendarView role={role} actorId={demoActorId(role)} />}
            {shown === "attendance-info" && <HrAttendanceInfoView actorId={demoActorId(role)} />}
            {shown === "my-regularization" && <HrRegularizationView actorId={demoActorId(role)} />}
            {shown === "document-center" && <HrDocumentCenterView role={role} actorId={demoActorId(role)} />}
            {shown === "overview" && <Overview role={role} employees={employeeRows} onNavigate={(next) => router.push(`/workspace/hr-people?view=${next}&workspace=hr-people`)} />}
            {view === "employees" && <EmployeesView role={role} employees={employeeRows} />}
            {view === "attendance" && <HrAttendanceView role={role} actorId={demoActorId(role)} />}
            {view === "leave" && <HrLeaveView role={role} actorId={demoActorId(role)} />}
            {view === "my-requests" && <HrLeaveView role={role} actorId={demoActorId(role)} personal />}
            {view === "leave-calendar" && <HrLeaveCalendarView role={role} actorId={demoActorId(role)} />}
            {view === "documents" && <HrDocumentsView role={role} actorId={demoActorId(role)} />}
            {view === "my-documents" && <HrDocumentsView key={params.get("tab") ?? "mine"} role={role} actorId={demoActorId(role)} personal />}
            {view === "onboarding" && <HrOnboardingView role={role} actorId={demoActorId(role)} />}
            {view === "my-onboarding" && <HrOnboardingView role={role} actorId={demoActorId(role)} personal />}
            {view === "offboarding" && <HrOffboardingView role={role} actorId={demoActorId(role)} />}
            {view === "recruitment" && <HrRecruitmentView role={role} actorId={demoActorId(role)} />}
            {view === "payroll" && <HrPayrollView role={role} actorId={demoActorId(role)} />}
            {view === "my-payslips" && <HrSalaryView key={params.get("tab") ?? "payslips"} role={role} actorId={demoActorId(role)} />}
            {view === "team" && <TeamView role={role} />}
            {view === "approvals" && <HrApprovalsView role={role} actorId={demoActorId(role)} />}
            {view === "my-profile" && <MyProfileView role={role} />}
            {view === "performance" && <HrPerformanceView role={role} actorId={demoActorId(role)} />}
            {view === "reports" && <HrReportsView role={role} />}
            {view === "expenses" && <HrExpensesView role={role} actorId={demoActorId(role)} />}
            {view === "compliance" && <ComplianceView role={role} />}
            {view === "signatures" && <HrSignaturesView role={role} actorId={demoActorId(role)} />}
            {view === "policy-qa" && <HrPolicyQaView role={role} actorId={demoActorId(role)} />}
            {view === "settings" && <div className="flex flex-col gap-4"><HrPolicyPanel role={role} actorId={demoActorId(role)} /><HrSettingsView role={role} /></div>}
          </>
        )}
      </div>
    </div>
  );
}

function viewTitle(view: string) {
  const titles: Record<string, string> = { overview: "HR Overview", employees: "Employees", attendance: "Attendance", leave: "Leave Management", "leave-calendar": "Leave Calendar", "my-requests": "My requests", documents: "Documents", "my-documents": "My documents", onboarding: "Onboarding", "my-onboarding": "My onboarding", offboarding: "Offboarding", recruitment: "Recruitment", payroll: "Payroll", "my-payslips": "Payslips", team: "My Team", approvals: "Pending Approvals", "my-profile": "My profile", performance: "Performance & Reviews", reports: "HR Reports", expenses: "Expenses & Reimbursements", compliance: "HR Compliance", signatures: "Signature & Audit", settings: "HR Settings", "policy-qa": "Ask about policy", "my-home": "Home", engage: "Engage", "leave-apply": "Leave Apply", "leave-balances": "Leave Balances", "holiday-calendar": "Holiday Calendar", "attendance-info": "Attendance Info", "my-regularization": "Regularization & Permission", "document-center": "Document Center" };
  return titles[view] ?? "HR & People";
}

function AccessNotice({ role }: { role: HrDemoRole }) {
  return <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center"><LockKeyhole className="size-8 text-muted-foreground" /><div><p className="text-sm font-semibold">This view is restricted</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{hrRoleLabels[role]} access only includes records and actions assigned to this role. Ask HR or the business owner for access.</p></div><Badge variant="neutral">Permission-aware preview</Badge></CardContent></Card>;
}

function Overview({ role, employees, onNavigate }: { role: HrDemoRole; employees: HrEmployee[]; onNavigate: (view: string) => void }) {
  const allLeaveRequests = useHrPeopleStore((state) => state.leaveRequests);
  const allAttendance = useHrPeopleStore((state) => state.attendance);
  const allIssues = useHrPeopleStore((state) => state.payrollIssues);
  const allOnboarding = useHrPeopleStore((state) => state.onboardingTasks);
  const visibleIds = new Set(employees.map((employee) => employee.id));
  const scoped = role === "owner" || role === "hr_manager" ? (() => ({ leaveRequests: allLeaveRequests, attendance: allAttendance, issues: allIssues, onboarding: allOnboarding }))() : {
    leaveRequests: allLeaveRequests.filter((request) => visibleIds.has(request.employeeId)),
    attendance: allAttendance.filter((record) => visibleIds.has(record.employeeId)),
    issues: allIssues.filter((issue) => visibleIds.has(issue.employeeId)),
    onboarding: allOnboarding.filter((task) => visibleIds.has(task.employeeId)),
  };
  const leaveRequests = scoped.leaveRequests;
  const attendance = scoped.attendance;
  const issues = scoped.issues;
  const onboarding = scoped.onboarding;
  const canShowIndividualAttention = role === "owner" || role === "hr_manager" || role === "reporting_manager" || role === "payroll_admin";
  const pendingLeave = leaveRequests.filter((request) => request.status === "pending" || request.status === "needs_clarification").length;
  const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dayList = [...new Set(attendance.map((record) => record.date))].filter((day) => day <= todayIst).sort();
  const latestDay = dayList[dayList.length - 1];
  const latestRecords = attendance.filter((record) => record.date === latestDay);
  const present = latestRecords.filter((record) => record.status === "present" || record.status === "late").length;
  const trend = dayList.slice(-6).map((day) => { const records = attendance.filter((record) => record.date === day); return { day, label: new Date(`${day}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }), present: records.filter((record) => record.status === "present" || record.status === "late").length, absent: records.filter((record) => record.status === "absent" || Boolean(record.anomaly)).length }; });
  const trendMax = Math.max(1, ...trend.map((point) => point.present + point.absent));
  const departmentCounts = [...employees.reduce((map, employee) => map.set(employee.department, (map.get(employee.department) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const openIssues = issues.filter((issue) => issue.status === "open").length;
  const onboarded = onboarding.filter((task) => task.status !== "done").length;
  return <div className="flex flex-col gap-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Headcount" value={String(employees.length)} detail="Active people in scope" icon={<Users className="size-4" />} />
      <MetricCard label="Present" value={latestRecords.length ? `${present}/${latestRecords.length}` : "—"} detail={latestDay ? `On ${dateLabel(latestDay)}` : "No attendance recorded yet"} icon={<CheckCircle2 className="size-4" />} tone="success" />
      <MetricCard label="Pending approvals" value={String(pendingLeave)} detail="Leave and regularisation" icon={<Clock3 className="size-4" />} tone="warning" />
      <MetricCard label="Payroll attention" value={String(openIssues)} detail={`${onboarded} onboarding tasks open`} icon={<CircleAlert className="size-4" />} tone="danger" />
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      <SectionCard title="Attendance trend" description="Recent days with attendance records"><div role="img" aria-label={trend.length ? `Attendance for the last ${trend.length} days: ${trend.map((point) => `${point.label} ${point.present} present, ${point.absent} absent or flagged`).join("; ")}` : "No attendance data yet"}>{trend.length > 1 ? <div className="flex h-48 items-end gap-3 px-2 pt-5">{trend.map((point) => <div key={point.day} className="flex min-w-0 flex-1 flex-col items-center gap-2"><div className="flex h-32 w-full max-w-10 items-end gap-1"><div className="w-1/2 rounded-t bg-accent" style={{ height: `${(point.present / trendMax) * 100}%` }} /><div className="w-1/2 rounded-t bg-warning/60" style={{ height: `${(Math.max(point.absent, 0) / trendMax) * 100}%` }} /></div><span className="text-center text-[10px] text-muted-foreground">{point.label}</span></div>)}</div> : <p className="py-12 text-center text-xs text-muted-foreground">The trend appears once attendance exists for two or more days.</p>}</div><div className="mt-3 flex gap-4 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-accent" />Present</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-warning/60" />Absent / flagged</span></div></SectionCard>
      <SectionCard title="Department snapshot" description="Headcount across active teams">{departmentCounts.length ? <div className="flex flex-col gap-3">{departmentCounts.map(([label, value]) => <div key={label} className="flex items-center gap-3"><span className="w-24 truncate text-xs text-muted-foreground">{label}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: `${(value / departmentCounts[0][1]) * 100}%` }} /></div><span className="w-5 text-right text-xs font-medium">{value}</span></div>)}</div> : <p className="py-8 text-center text-xs text-muted-foreground">No people in your view yet.</p>}</SectionCard>
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <SectionCard title="Owner attention" description={canShowIndividualAttention ? "The work that needs a human decision now" : "Your assigned work and status updates"}><div className="divide-y divide-border">{canShowIndividualAttention ? <>{issues.filter((issue) => issue.status === "open").map((issue) => <button type="button" key={issue.id} onClick={() => onNavigate("payroll")} className="flex w-full items-center gap-3 py-3 text-left hover:bg-surface-2"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-danger/10 text-danger"><CircleAlert className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{issue.title}</span><span className="block truncate text-xs text-muted-foreground">{issue.employeeName} · {issue.detail}</span></span><ChevronRight className="size-4 text-muted-foreground" /></button>)}{pendingLeave > 0 && <button type="button" onClick={() => onNavigate("leave")} className="flex w-full items-center gap-3 py-3 text-left hover:bg-surface-2"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning"><Clock3 className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{pendingLeave} leave request{pendingLeave > 1 ? "s" : ""} need approval</span><span className="block text-xs text-muted-foreground">Requests route to the reporting manager first.</span></span><ChevronRight className="size-4 text-muted-foreground" /></button>}</> : <div className="flex items-center gap-3 py-4 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-success" />Sensitive HR details are hidden for this role. Open My requests for your own status.</div>}</div></SectionCard>
      <SectionCard title="Quick actions" description="Common people operations"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1"><QuickAction label="Add employee" icon={<UserPlus className="size-4" />} onClick={() => onNavigate("employees")} /><QuickAction label="Review attendance" icon={<Clock3 className="size-4" />} onClick={() => onNavigate("attendance")} /><QuickAction label="Approve leave" icon={<CheckCircle2 className="size-4" />} onClick={() => onNavigate("leave")} /><QuickAction label="Start payroll review" icon={<IndianRupee className="size-4" />} onClick={() => onNavigate("payroll")} /></div></SectionCard>
    </div>
    <SectionCard title="Permission boundary" description="What this role can see"><div className="flex flex-wrap items-center gap-2"><Badge variant="success">{hrRoleLabels[role]}</Badge><span className="text-xs text-muted-foreground">{role === "employee" ? "Self-service only" : role === "reporting_manager" ? "Direct reports only" : role === "business_manager" ? "Authorised company summaries" : "HR operations in assigned scope"}</span></div></SectionCard>
  </div>;
}

function MetricCard({ label, value, detail, icon, tone = "accent" }: { label: string; value: string; detail: string; icon: React.ReactNode; tone?: "accent" | "success" | "warning" | "danger" }) {
  const toneClass = tone === "success" ? "bg-success-muted text-success" : tone === "warning" ? "bg-warning-muted text-warning" : tone === "danger" ? "bg-danger-muted text-danger" : "bg-accent-muted text-accent";
  return <Card><CardContent className="p-4"><div className="flex items-start justify-between gap-2"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span><span className={`flex size-8 items-center justify-center rounded-md ${toneClass}`}>{icon}</span></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

function QuickAction({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return <Button variant="secondary" className="justify-start" onClick={onClick}>{icon}{label}<ArrowRight className="ml-auto size-3.5 text-muted-foreground" /></Button>;
}

function EmployeesView({ role, employees }: { role: HrDemoRole; employees: HrEmployee[] }) {
  const canManage = canManageHr(role);
  const [query, setQuery] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [selectedEmployee, setSelectedEmployee] = React.useState<HrEmployee | null>(null);
  const addEmployee = useHrPeopleStore((state) => state.addEmployee);
  const updateEmployee = useHrPeopleStore((state) => state.updateEmployee);
  const archiveEmployee = useHrPeopleStore((state) => state.archiveEmployee);
  const filtered = employees.filter((employee) => `${employee.name} ${employee.department} ${employee.title}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="flex flex-col gap-4"><SectionCard title="Employee directory" description="One employee record shared across HR, Business Management and permitted workspaces." action={canManage ? <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>Import</Button><Button size="sm" onClick={() => setAddOpen(true)}><Plus className="size-3.5" />Add employee</Button></div> : undefined}><div className="mb-4 flex flex-wrap items-center gap-2"><Input aria-label="Search people, teams or roles" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, teams or roles" className="max-w-sm" /><Badge variant="neutral">{filtered.length} visible</Badge></div><div className="overflow-x-auto"><div className="min-w-[880px]"><div className="grid grid-cols-[1.4fr_1.2fr_1fr_1fr_0.9fr_0.8fr_80px] gap-3 border-b border-border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Employee</span><span>Role</span><span>Department</span><span>Manager</span><span>Status</span><span>{salaryVisible(role) ? "Monthly pay" : "Onboarding"}</span><span /></div>{filtered.map((employee) => <div key={employee.id} className="grid grid-cols-[1.4fr_1.2fr_1fr_1fr_0.9fr_0.8fr_80px] items-center gap-3 border-b border-border px-2 py-3 text-xs last:border-0"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full bg-accent-muted text-[10px] font-semibold text-accent">{employee.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span className="min-w-0"><span className="block truncate font-medium">{employee.name}</span><span className="block truncate text-[11px] text-muted-foreground">{employee.email}</span></span></div><span className="truncate">{employee.title}</span><span>{employee.department}</span><span className="truncate text-muted-foreground">{employee.managerName ?? "—"}</span><Badge variant={statusVariant(employee.status)}>{employee.status}</Badge><span>{salaryVisible(role) ? inr.format(employee.salaryMonthly) : `${employee.onboardingPercent}% complete`}</span><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Open ${employee.name}`} onClick={() => setSelectedEmployee(employee)}><Eye className="size-3.5" /></Button>{canManage && <Button size="icon" variant="ghost" aria-label={`Edit ${employee.name}`} onClick={() => { updateEmployee(employee.id, { onboardingPercent: Math.min(100, employee.onboardingPercent + 5) }); toast.success("Employee record updated"); }}><Pencil className="size-3.5" /></Button>}{canManage && employee.status !== "archived" && <Button size="icon" variant="ghost" aria-label={`Archive ${employee.name}`} onClick={() => { archiveEmployee(employee.id); toast.success("Employee archived"); }}><MoreHorizontal className="size-3.5" /></Button>}</div></div>)}</div>{!filtered.length && <p className="px-2 py-8 text-center text-sm text-muted-foreground">{query ? "No one matches your search." : "No employees in your view yet."}</p>}</div></SectionCard>{importOpen && <HrEmployeeImport actorId={demoActorId(role)} onClose={() => setImportOpen(false)} />}<AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} onAdd={(employee) => { addEmployee(employee); toast.success("Employee added to the directory"); }} /><EmployeeRecordDialog employee={selectedEmployee} onOpenChange={(open) => { if (!open) setSelectedEmployee(null); }} /></div>;
}

function EmployeeRecordDialog({ employee, onOpenChange }: { employee: HrEmployee | null; onOpenChange: (open: boolean) => void }) {
  const documents = useHrPeopleStore((state) => state.documents).filter((document) => document.employeeId === employee?.id);
  const tasks = useHrPeopleStore((state) => state.onboardingTasks).filter((task) => task.employeeId === employee?.id);
  const leave = useHrPeopleStore((state) => state.leaveRequests).filter((request) => request.employeeId === employee?.id);
  if (!employee) return null;
  return <Dialog open={Boolean(employee)} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{employee.name} · {employee.id.toUpperCase()}</DialogTitle><DialogDescription>{employee.title} · {employee.department} · {employee.branch} · reporting to {employee.managerName ?? "Business Owner"}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><SectionCard title="Employment" description="One connected employee record"><div className="grid gap-2"><Detail label="Status" value={employee.status} /><Detail label="Joined" value={dateLabel(employee.joiningDate)} /><Detail label="Work email" value={employee.email} /><Detail label="Phone" value={employee.phone} /></div></SectionCard><SectionCard title="Lifecycle status" description="Onboarding to offboarding"><div className="grid gap-2"><Detail label="Onboarding" value={`${employee.onboardingPercent}% complete`} /><Detail label="Documents due" value={String(employee.documentsDue)} /><Detail label="Leave requests" value={String(leave.length)} /><Detail label="Manager" value={employee.managerName ?? "—"} /></div></SectionCard></div><SectionCard title="Linked records" description="The employee ID connects every HR record."><div className="flex flex-wrap gap-2"><Badge variant="info">{documents.length} documents</Badge><Badge variant="warning">{tasks.filter((task) => task.status !== "done").length} onboarding tasks open</Badge><Badge variant="neutral">{leave.length} leave requests</Badge><Button size="sm" variant="secondary" onClick={() => toast.success("Employee timeline opened")}>Open timeline</Button></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</p>{documents.slice(0, 4).map((document) => <p key={document.id} className="truncate text-xs">{document.name} · <span className="text-muted-foreground">{document.signatureStatus}</span></p>)}</div><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Onboarding</p>{tasks.slice(0, 4).map((task) => <p key={task.id} className="truncate text-xs">{task.title} · <span className="text-muted-foreground">{task.status.replace("_", " ")}</span></p>)}</div><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Requests</p>{leave.slice(0, 4).map((request) => <p key={request.id} className="truncate text-xs">{request.type} leave · <span className="text-muted-foreground">{request.status}</span></p>)}</div></div></SectionCard><DialogFooter><Button onClick={() => onOpenChange(false)}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

function AddEmployeeDialog({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (open: boolean) => void; onAdd: (employee: HrEmployee) => void }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [department, setDepartment] = React.useState("People");
  function submit(event: React.FormEvent) { event.preventDefault(); if (!name.trim() || !email.trim()) return; onAdd({ id: `emp-${Date.now()}`, name: name.trim(), email: email.trim(), phone: "+91 90000 00000", title: title.trim() || "Team member", department, branch: "Gurugram", managerId: "emp-002", managerName: "Shaista Khan", status: "onboarding", employmentType: "full_time", joiningDate: new Date().toISOString().slice(0, 10), location: "Gurugram", avatarColor: "#2563eb", salaryMonthly: 0, onboardingPercent: 20, documentsDue: 3 }); setName(""); setEmail(""); setTitle(""); onOpenChange(false); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Add employee</DialogTitle><DialogDescription>Create a record first; onboarding, documents and access can be completed next.</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-3"><Field label="Full name"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field><Field label="Work email"><Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></Field><Field label="Role"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Account Executive" /></Field><Field label="Department"><select value={department} onChange={(event) => setDepartment(event.target.value)} className="h-9 border border-input bg-surface-2 px-2 text-sm"><option>People</option><option>Sales</option><option>Operations</option><option>Finance</option><option>Support</option></select></Field><DialogFooter><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit"><UserPlus className="size-3.5" />Add employee</Button></DialogFooter></form></DialogContent></Dialog>;
}

function TeamView({ role }: { role: HrDemoRole }) {
  const employees = useHrPeopleStore((state) => state.employees).filter((employee) => role === "reporting_manager" ? employee.managerId === demoActorId(role) : employee.managerId !== null);
  return <SectionCard title="My Team" description="The reporting hierarchy controls which people and approvals are visible."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{employees.map((employee) => <div key={employee.id} className="rounded-lg border border-border bg-surface-2 p-3"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent">{employee.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{employee.name}</span><span className="block truncate text-xs text-muted-foreground">{employee.title}</span></span><Badge variant={statusVariant(employee.status)}>{employee.status}</Badge></div><div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{employee.department}</span><span>{employee.onboardingPercent}% onboarded</span></div></div>)}</div></SectionCard>;
}

function RuleRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0"><span className="text-xs text-muted-foreground">{label}</span><span className="text-xs font-medium">{value}</span></div>; }

function MyProfileView({ role }: { role: HrDemoRole }) {
  const employee = useHrPeopleStore((state) => state.employees).find((item) => item.id === demoActorId(role));
  const documents = useHrPeopleStore((state) => state.documents).filter((document) => document.employeeId === employee?.id);
  const tasks = useHrPeopleStore((state) => state.onboardingTasks).filter((task) => task.employeeId === employee?.id);
  if (!employee) return <EmptyCard text="Profile not available." />;
  return <div className="flex flex-col gap-4"><SectionCard title={`${employee.name} · ${employee.id.toUpperCase()}`} description="Your single employee record connects personal details, documents, requests, payroll and lifecycle status. To change these details, ask HR."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Detail label="Work email" value={employee.email} /><Detail label="Phone" value={employee.phone} /><Detail label="Role" value={employee.title} /><Detail label="Department" value={employee.department} /><Detail label="Branch" value={employee.branch} /><Detail label="Joining date" value={dateLabel(employee.joiningDate)} /><Detail label="Reporting manager" value={employee.managerName ?? "Business Owner"} /><Detail label="Employment status" value={employee.status} /></div></SectionCard><div className="grid gap-4 lg:grid-cols-3"><SectionCard title="My documents" description="Only documents assigned to this employee."><div className="flex flex-col gap-2">{documents.length ? documents.map((document) => <div key={document.id} className="flex items-center gap-2 rounded-md border border-border p-2"><FileText className="size-4 text-accent" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{document.name}</span><span className="block text-[11px] text-muted-foreground">{document.signatureStatus.replace("_", " ")}</span></span><Badge variant={statusVariant(document.signatureStatus)}>{document.signatureStatus}</Badge></div>) : <EmptyCard text="No documents assigned." />}</div></SectionCard><SectionCard title="Onboarding progress" description="Tasks owned by you or your manager."><div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: `${employee.onboardingPercent}%` }} /></div><span className="text-sm font-semibold">{employee.onboardingPercent}%</span></div><div className="mt-3 flex flex-col gap-2">{tasks.map((task) => <div key={task.id} className="flex items-center gap-2 text-xs"><span className={task.status === "done" ? "text-success" : "text-warning"}>{task.status === "done" ? "✓" : "•"}</span><span className="flex-1">{task.title}</span><span className="text-muted-foreground">{task.status.replace("_", " ")}</span></div>)}</div></SectionCard><SectionCard title="My access" description="Workspace access is assigned independently."><div className="flex flex-wrap gap-2"><Badge variant="success">HR & People</Badge>{canSeeBusinessSummary(role) && <Badge variant="info">Business Management</Badge>}<Badge variant="neutral">CRM by assignment</Badge></div><p className="mt-3 text-[11px] text-muted-foreground">Salary and restricted documents remain hidden unless explicitly authorised.</p></SectionCard></div></div>;
}

function ComplianceView({ role }: { role: HrDemoRole }) {
  const items = useHrPeopleStore((state) => state.complianceItems);
  const updateCompliance = useHrPeopleStore((state) => state.updateCompliance);
  const canAct = ["owner", "hr_manager", "payroll_admin"].includes(role as string);
  return <div className="flex flex-col gap-4"><SectionCard title="HR compliance calendar" description="Sample statutory checklist for PF, ESI, Professional Tax and TDS. Dates are review prompts until connected to a filing provider." action={<Badge variant="info">FY 2026–27 · India</Badge>}><div className="grid gap-3 sm:grid-cols-2">{items.map((item) => <div key={item.id} className="rounded-lg border border-border bg-surface-2 p-4"><div className="flex items-start gap-3"><span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${item.status === "attention" ? "bg-danger/10 text-danger" : item.status === "due" ? "bg-warning-muted text-warning" : "bg-success-muted text-success"}`}><ShieldCheck className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{item.title}</p><Badge variant={statusVariant(item.status)}>{item.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{item.jurisdiction} · due {dateLabel(item.dueAt)}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p><div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-muted-foreground">Owner: {item.ownerName}</span>{canAct && item.status !== "filed" && <Button size="sm" variant="secondary" onClick={() => { updateCompliance(item.id, "filed"); toast.success(`${item.title} marked filed for demo`); }}>Mark filed</Button>}</div></div></div></div>)}</div></SectionCard><SectionCard title="Compliance controls" description="Permissions and evidence are kept with each filing record."><div className="grid gap-2 sm:grid-cols-3"><Detail label="Financial year" value="1 Apr – 31 Mar" /><Detail label="Payroll review" value="Human approval required" /><Detail label="Data retention" value="7 years · configurable" /></div></SectionCard></div>;
}

function HrSettingsView({ role }: { role: HrDemoRole }) {
  const settings = useHrOperationsStore((state) => state.settings);
  const chain = settings.approvalChain === "manager_hr" ? "Reporting manager → HR" : "Reporting manager";
  return <div className="grid gap-4 lg:grid-cols-2"><SectionCard title="Approval chains" description="Leave and expenses follow the chain in Time & leave policy above."><div className="flex flex-col gap-2"><RuleRow label="Leave" value={chain} /><RuleRow label="Attendance corrections" value="Reporting manager" /><RuleRow label="Expenses" value={`${chain} → Finance pays`} /><RuleRow label="Exit clearance" value="Manager, HR, Finance, IT, Operations" /></div></SectionCard><SectionCard title="Payroll & statutory defaults" description="Read-only defaults. Real PF, ESI, professional tax and TDS rules are not calculated yet."><div className="grid gap-2 sm:grid-cols-2"><Detail label="Currency" value="INR (₹)" /><Detail label="Financial year" value="April – March" /><Detail label="Payroll day" value={`${settings.payrollDay}th of the month`} /><Detail label="Statutory filing" value="Not connected" /></div></SectionCard><SectionCard title="Employee privacy" description="Who can see sensitive information."><div className="flex flex-col gap-3"><RuleRow label="Salary & tax documents" value="Payroll admin, HR and owner" /><RuleRow label="Performance ratings" value="Employee (once completed), manager, HR" /><RuleRow label="Policy Q&A" value="Policy documents only. No personal records" /></div></SectionCard><SectionCard title="Notifications" description="How people hear about requests and decisions."><p className="text-sm text-muted-foreground">Updates appear inside Janus. WhatsApp and email notifications for HR aren&apos;t connected yet, so no messages are sent.</p><p className="mt-3 text-[11px] text-muted-foreground">Viewing as {hrRoleLabels[role]}. Change the rules above in Time &amp; leave policy.</p></SectionCard></div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-border bg-surface-2 p-3"><span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span><p className="mt-1 text-sm font-medium">{value}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}{children}</label>; }
function EmptyCard({ text }: { text: string }) { return <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">{text}</CardContent></Card>; }
