"use client";

import * as React from "react";
import { scoped } from "@/lib/company";
import { ArrowRightLeft, Check, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/settings/section-ui";
import { roleMeta, roleOrder } from "@/components/settings/role-meta";
import { users } from "@/lib/mock-data";
import type { Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { workspaceDefinitions } from "@/lib/workspace-config";
import { useApi } from "@/lib/api/use-api";

const sections = [
  ["members", "Members"],
  ["invitations", "Invitations"],
  ["access", "Workspace Access"],
  ["roles", "Roles & Permissions"],
  ["departments", "Teams & Departments"],
  ["requests", "Access Requests"],
  ["audit", "Audit Logs"],
] as const;

const workspaceOptions = [
  ["crm-sales", "CRM & Sales"],
  ["hr-people", "HR & People"],
  ["finance-accounting", "Finance & Accounting"],
  ["projects-delivery", "Projects & Delivery"],
  ["customer-support", "Customer Support & Success"],
  ["operations-inventory", "Operations & Inventory"],
  ["it-infrastructure", "IT & Infrastructure"],
] as const;

const permissionOptions = [
  ["business:manage", "Manage business", "Manage company-level settings, workspaces and operating controls"],
  ["business:reports", "View business reports", "Read cross-workspace performance, risks and recommendations"],
  ["people:manage", "Manage management members", "Invite and manage company-level managers and their roles"],
  ["workspace:manage", "Manage workspaces", "Create, activate and assign access to workspaces"],
  ["ai:manage", "Manage Janus Intelligence", "Use business AI, agents and approved recommendations"],
  ["automation:manage", "Manage automations", "Create, approve and monitor business workflows"],
  ["records:view", "View workspace records", "Read leads, people, reports and activity"],
  ["records:edit", "Edit records", "Create and update records in assigned workspaces"],
  ["communications:send", "Send communications", "Send approved email, WhatsApp and phone actions"],
  ["reports:view", "View reports", "Read workspace and business reports"],
  ["members:manage", "Manage people", "Invite, edit and remove workspace members"],
  ["approvals:manage", "Approve sensitive actions", "Approve discounts, refunds, payments and automations"],
] as const;

type WorkspaceKey = (typeof workspaceOptions)[number][0];
type PermissionKey = (typeof permissionOptions)[number][0];
type MemberStatus = "Active" | "Invited" | "Suspended";
type AccessMember = { id: string; name: string; email: string; role: Role; department: string; status: MemberStatus; businessAccess: boolean; workspaces: WorkspaceKey[]; permissions: PermissionKey[]; lastActive: string };
type PendingInvite = { id: string; name: string; email: string; role: Role; businessAccess: boolean; workspaces: WorkspaceKey[]; invitedAt: string; status: "Pending" | "Expired" };
type RoleRecord = { id: string; label: string; summary: string; tone: "accent" | "info" | "warning" | "success" | "neutral"; permissions: PermissionKey[]; builtIn: boolean };
type MemberForm = { name: string; email: string; password: string; role: Role; businessAccess: boolean; department: string; workspaces: WorkspaceKey[]; permissions: PermissionKey[] };

const rolePermissions: Record<Role, PermissionKey[]> = {
  owner: permissionOptions.map(([key]) => key),
  admin: ["business:manage", "business:reports", "people:manage", "workspace:manage", "ai:manage", "automation:manage", "records:view", "records:edit", "communications:send", "reports:view", "members:manage", "approvals:manage"],
  ceo: ["business:manage", "business:reports", "people:manage", "workspace:manage", "ai:manage", "automation:manage", "approvals:manage"],
  business_manager: ["business:manage", "business:reports", "people:manage", "workspace:manage", "ai:manage", "automation:manage", "approvals:manage"],
  product_manager: ["business:reports", "ai:manage", "automation:manage", "workspace:manage"],
  sales_manager: ["records:view", "records:edit", "communications:send", "reports:view", "approvals:manage"],
  sales_agent: ["records:view", "records:edit", "communications:send"],
  support_agent: ["records:view", "records:edit", "communications:send"],
  finance: ["records:view", "records:edit", "reports:view", "approvals:manage"],
  analyst: ["records:view", "reports:view"],
  read_only: ["records:view"],
};

const initialMembers: AccessMember[] = [...users.map((user, index) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.role === "finance" ? "Finance" : user.role === "support_agent" ? "Support" : user.role === "admin" ? "People" : user.role === "owner" ? "Management" : "Sales",
  status: "Active" as const,
  businessAccess: user.role === "owner" || (isManagementRole(user.role) && user.role !== "admin"),
  workspaces: (index === 0 ? workspaceOptions.map(([key]) => key as WorkspaceKey) : user.role === "support_agent" ? ["crm-sales", "customer-support"] : user.role === "admin" || user.role === "finance" ? ["hr-people"] : ["crm-sales"]) as WorkspaceKey[],
  permissions: rolePermissions[user.role],
  lastActive: user.online ? "Online now" : "Yesterday",
})),
];

const initialRoles: RoleRecord[] = roleOrder.map((role) => ({ id: role, label: roleMeta[role].label, summary: roleMeta[role].summary, tone: roleMeta[role].tone as RoleRecord["tone"], permissions: rolePermissions[role], builtIn: true }));
const emptyMemberForm: MemberForm = { name: "", email: "", password: "", role: "business_manager", businessAccess: true, department: "Management", workspaces: [], permissions: rolePermissions.business_manager };

function isManagementRole(role: Role) {
  return role === "owner" || role === "admin" || role === "ceo" || role === "business_manager" || role === "product_manager";
}

export function BusinessPeopleAccess({ initialSection = "members" }: { initialSection?: string }) {
  const [section, setSection] = React.useState<string>(initialSection);
  const [members, setMembers] = React.useState<AccessMember[]>(initialMembers);
  const workspacesApi = useApi<Array<{ type: string; status: string }>>("/workspaces");
  const [storedWorkspace, setStoredWorkspace] = React.useState<string | null>(null);
  React.useEffect(() => {
    const readActivation = () => setStoredWorkspace(window.localStorage.getItem(scoped("janus.setup.active-workspace")));
    readActivation();
    window.addEventListener("storage", readActivation);
    window.addEventListener("janus:workspace-activation", readActivation);
    return () => { window.removeEventListener("storage", readActivation); window.removeEventListener("janus:workspace-activation", readActivation); };
  }, []);
  const activeWorkspaceOptions = React.useMemo(() => {
    const active = new Set<WorkspaceKey>(workspaceDefinitions.filter((workspace) => workspace.id !== "business" && workspace.status === "active").map((workspace) => workspace.id as WorkspaceKey));
    if (storedWorkspace && storedWorkspace !== "none") active.add(storedWorkspace.replaceAll("_", "-") as WorkspaceKey);
    workspacesApi.data?.filter((workspace) => workspace.status === "active").forEach((workspace) => active.add(workspace.type.replaceAll("_", "-") as WorkspaceKey));
    return workspaceOptions.filter(([key]) => active.has(key));
  }, [storedWorkspace, workspacesApi.data]);
  const activeWorkspaceKeys = React.useMemo(() => new Set(activeWorkspaceOptions.map(([key]) => key)), [activeWorkspaceOptions]);
  const [invites, setInvites] = React.useState<PendingInvite[]>([
    { id: "invite-1", name: "Arjun Mehta", email: "arjun@curiousdevs.ai", role: "sales_manager", businessAccess: false, workspaces: ["crm-sales"], invitedAt: "Today, 10:20", status: "Pending" },
    { id: "invite-2", name: "Priya Shah", email: "priya@curiousdevs.ai", role: "analyst", businessAccess: false, workspaces: ["crm-sales", "finance-accounting"], invitedAt: "Yesterday", status: "Pending" },
    { id: "invite-3", name: "Nikhil Verma", email: "nikhil@acmetrader.in", role: "business_manager", businessAccess: true, workspaces: [], invitedAt: "Today, 08:45", status: "Pending" },
  ]);
  const [roles, setRoles] = React.useState<RoleRecord[]>(initialRoles);
  const [departments, setDepartments] = React.useState(["Management", "Sales", "Finance", "Customer Support", "Operations"]);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [memberDialog, setMemberDialog] = React.useState<"invite" | "edit" | null>(null);
  const [editingMemberId, setEditingMemberId] = React.useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<AccessMember | null>(null);
  const [ownerSwitchOpen, setOwnerSwitchOpen] = React.useState(false);
  const [ownerCandidateId, setOwnerCandidateId] = React.useState("");
  const [memberForm, setMemberForm] = React.useState<MemberForm>(emptyMemberForm);
  const [memberError, setMemberError] = React.useState<string | null>(null);
  const [roleDialog, setRoleDialog] = React.useState<"new" | "edit" | null>(null);
  const [editingRoleId, setEditingRoleId] = React.useState<string | null>(null);
  const [roleForm, setRoleForm] = React.useState({ name: "", summary: "", permissions: [] as PermissionKey[] });
  const [departmentDialog, setDepartmentDialog] = React.useState(false);
  const [departmentName, setDepartmentName] = React.useState("");

  function setMemberField<K extends keyof MemberForm>(field: K, value: MemberForm[K]) { setMemberForm((current) => ({ ...current, [field]: value })); }
  function toggleWorkspace(workspace: WorkspaceKey) { setMemberField("workspaces", memberForm.workspaces.includes(workspace) ? memberForm.workspaces.filter((item) => item !== workspace) : [...memberForm.workspaces, workspace]); }
  function toggleBusinessAccess() { if (memberForm.role === "owner") return; setMemberField("businessAccess", !memberForm.businessAccess); }
  function togglePermission(permission: PermissionKey) { setMemberField("permissions", memberForm.permissions.includes(permission) ? memberForm.permissions.filter((item) => item !== permission) : [...memberForm.permissions, permission]); }
  function openInvite() { setMemberForm(emptyMemberForm); setMemberError(null); setMemberDialog("invite"); }
  function openEdit(member: AccessMember) { setEditingMemberId(member.id); setMemberForm({ name: member.name, email: member.email, password: "", role: member.role, businessAccess: member.businessAccess, department: member.department, workspaces: member.workspaces, permissions: member.permissions }); setMemberError(null); setMemberDialog("edit"); }
  function closeMemberDialog() { setMemberDialog(null); setEditingMemberId(null); setMemberError(null); }
  function changeMemberRole(role: Role) {
    setMemberField("role", role);
    setMemberField("permissions", rolePermissions[role]);
    if (isManagementRole(role)) {
      setMemberField("department", "Management");
      setMemberField("businessAccess", true);
    } else if (memberForm.workspaces.length === 0) {
      setMemberField("department", "Sales");
      setMemberField("workspaces", ["crm-sales"]);
      setMemberField("businessAccess", false);
    }
  }
  function saveMember(event: React.FormEvent) {
    event.preventDefault();
    if (!memberForm.name.trim() || !memberForm.email.trim() || !memberForm.email.includes("@")) { setMemberError("Add a valid name and email address."); return; }
    const assignedWorkspaces = memberForm.workspaces.filter((workspace) => activeWorkspaceKeys.has(workspace));
    if (assignedWorkspaces.length === 0 && !isManagementRole(memberForm.role)) { setMemberError("Select at least one workspace for a department member."); return; }
    if (memberDialog === "invite" && memberForm.password.length < 8) { setMemberError("Set a temporary password with at least 8 characters."); return; }
    if (memberDialog === "invite") {
      const id = `member-${Date.now()}`;
      setMembers((current) => [...current, { id, name: memberForm.name.trim(), email: memberForm.email.trim(), role: memberForm.role, department: memberForm.department, status: "Invited", businessAccess: memberForm.businessAccess, workspaces: assignedWorkspaces, permissions: memberForm.permissions, lastActive: "Pending invite" }]);
      setInvites((current) => [{ id: `invite-${Date.now()}`, name: memberForm.name.trim(), email: memberForm.email.trim(), role: memberForm.role, businessAccess: memberForm.businessAccess, workspaces: assignedWorkspaces, invitedAt: "Just now", status: "Pending" }, ...current]);
      setNotice(`${memberForm.name.trim()} was added with a pending invitation. Demo password is not sent anywhere.`);
    } else if (editingMemberId) {
      setMembers((current) => current.map((member) => member.id === editingMemberId ? { ...member, name: memberForm.name.trim(), email: memberForm.email.trim(), role: memberForm.role, department: memberForm.department, businessAccess: member.role === "owner" ? true : memberForm.businessAccess, workspaces: assignedWorkspaces, permissions: memberForm.permissions } : member));
      setNotice(`${memberForm.name.trim()} access and permissions were updated.`);
    }
    closeMemberDialog();
  }
  function removeMember(member: AccessMember) { if (member.role === "owner") return; setRemoveTarget(member); }
  function confirmRemoveMember() { if (!removeTarget || removeTarget.role === "owner") return; setMembers((current) => current.filter((item) => item.id !== removeTarget.id)); setNotice(`${removeTarget.name} was removed from this demo business.`); setRemoveTarget(null); }
  function openOwnerSwitch() { const candidate = members.find((member) => member.role !== "owner" && member.status === "Active"); setOwnerCandidateId(candidate?.id ?? ""); setOwnerSwitchOpen(true); }
  function confirmOwnerSwitch() { const candidate = members.find((member) => member.id === ownerCandidateId && member.role !== "owner" && member.status === "Active"); if (!candidate) return; setMembers((current) => current.map((member) => member.role === "owner" ? { ...member, role: "admin", department: "Management", businessAccess: true, permissions: rolePermissions.admin } : member.id === candidate.id ? { ...member, role: "owner", department: "Management", businessAccess: true, permissions: rolePermissions.owner } : member)); setNotice(`${candidate.name} is now the Owner. The previous Owner is now an Admin.`); setOwnerSwitchOpen(false); }
  function openRoleEdit(role: RoleRecord) { setEditingRoleId(role.id); setRoleForm({ name: role.label, summary: role.summary, permissions: role.permissions }); setRoleDialog("edit"); }
  function openRoleNew() { setEditingRoleId(null); setRoleForm({ name: "", summary: "", permissions: ["records:view"] }); setRoleDialog("new"); }
  function saveRole(event: React.FormEvent) { event.preventDefault(); if (!roleForm.name.trim() || roleForm.permissions.length === 0) return; if (roleDialog === "new") { setRoles((current) => [...current, { id: `custom-${Date.now()}`, label: roleForm.name.trim(), summary: roleForm.summary.trim() || "Custom business role", tone: "neutral", permissions: roleForm.permissions, builtIn: false }]); setNotice(`${roleForm.name.trim()} role created.`); } else if (editingRoleId) { setRoles((current) => current.map((role) => role.id === editingRoleId ? { ...role, label: roleForm.name.trim(), summary: roleForm.summary.trim(), permissions: roleForm.permissions } : role)); setNotice(`${roleForm.name.trim()} permissions were updated.`); } setRoleDialog(null); }
  function deleteRole() { if (!editingRoleId || roles.find((role) => role.id === editingRoleId)?.builtIn) return; setRoles((current) => current.filter((role) => role.id !== editingRoleId)); setRoleDialog(null); setNotice("Custom role removed."); }
  function toggleMemberWorkspace(memberId: string, workspace: WorkspaceKey) { setMembers((current) => current.map((member) => member.id === memberId ? { ...member, workspaces: member.workspaces.includes(workspace) ? member.workspaces.filter((item) => item !== workspace) : [...member.workspaces, workspace] } : member)); setNotice("Workspace access updated."); }
  function toggleMemberBusinessAccess(memberId: string) { setMembers((current) => current.map((member) => member.id === memberId && member.role !== "owner" ? { ...member, businessAccess: !member.businessAccess } : member)); setNotice("Business Management access updated."); }
  function saveDepartment(event: React.FormEvent) { event.preventDefault(); if (!departmentName.trim()) return; setDepartments((current) => [...current, departmentName.trim()]); setDepartmentName(""); setDepartmentDialog(false); setNotice("Department added."); }

  return <div className="flex flex-col gap-5">
    <div><p className="text-[11px] font-medium uppercase tracking-wide text-accent">Business Management</p><div className="mt-1 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight">People & Access</h2><p className="mt-1 text-sm text-muted-foreground">Manage company-level managers separately from CRM, HR and department members.</p></div><Button size="sm" onClick={openInvite}><UserPlus className="size-3.5" />Add person</Button></div></div>
    <div className="janus-tab-strip sticky top-0 z-20 flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1">{sections.map(([value, label]) => <button key={value} type="button" onClick={() => setSection(value)} className={`shrink-0 rounded-sm px-3 py-2 text-[12px] transition-colors ${section === value ? "bg-white font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-white/70 hover:text-foreground"}`}>{label}{value === "invitations" && invites.length > 0 ? <span className="ml-1.5 rounded-full bg-accent-muted px-1.5 py-0.5 text-[10px] text-accent">{invites.length}</span> : null}</button>)}</div>
    <div className="flex items-start gap-3 rounded-lg border border-accent-border bg-accent-muted/60 px-4 py-3 text-xs"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" /><p><strong>Access is independent.</strong> Select Business Management access and active department workspaces separately. People only see the areas that are checked for them.</p></div>
    {notice && <div role="status" className="rounded-lg border border-accent-border bg-accent-muted px-4 py-3 text-sm text-accent">{notice}</div>}
    {section === "members" && <MembersSection members={members} activeWorkspaceKeys={activeWorkspaceKeys} onInvite={openInvite} onEdit={openEdit} onRemove={removeMember} onSwitchOwner={openOwnerSwitch} />}
    {section === "invitations" && <InvitationsSection invites={invites} activeWorkspaceKeys={activeWorkspaceKeys} onResend={(invite) => setNotice(`Invitation resent to ${invite.email}.`)} onCancel={(invite) => { setInvites((current) => current.filter((item) => item.id !== invite.id)); setNotice(`Invitation for ${invite.email} cancelled.`); }} />}
    {section === "access" && <WorkspaceAccessSection members={members} workspaces={activeWorkspaceOptions} onToggle={toggleMemberWorkspace} onToggleBusiness={toggleMemberBusinessAccess} onEdit={openEdit} />}
    {section === "roles" && <RolesPermissionsSection roles={roles} onNew={openRoleNew} onEdit={openRoleEdit} onDelete={(role) => { if (!role.builtIn) { setRoles((current) => current.filter((item) => item.id !== role.id)); setNotice(`${role.label} role removed.`); } }} />}
    {section === "departments" && <DepartmentsSection departments={departments} onAdd={() => setDepartmentDialog(true)} />}
    {section === "requests" && <RequestsSection onNotice={setNotice} />}
    {section === "audit" && <AuditSection />}

    <Dialog open={memberDialog !== null} onOpenChange={(open) => !open && closeMemberDialog()}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><form onSubmit={saveMember}><DialogHeader><DialogTitle>{memberDialog === "invite" ? "Add person" : "Edit member access"}</DialogTitle><DialogDescription>{memberDialog === "invite" ? "Create the person’s profile, temporary login and initial access." : "Update this member’s role, Business Management access and workspace access."}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="member-name">Full name</Label><Input id="member-name" value={memberForm.name} onChange={(event) => setMemberField("name", event.target.value)} placeholder="e.g. Aditi Sharma" className="mt-1" autoFocus /></div><div><Label htmlFor="member-email">Email / username</Label><Input id="member-email" type="email" value={memberForm.email} onChange={(event) => setMemberField("email", event.target.value)} placeholder="name@company.com" className="mt-1" /></div><div><Label htmlFor="member-password">Temporary password {memberDialog === "edit" && <span className="normal-case tracking-normal">(optional)</span>}</Label><Input id="member-password" type="password" value={memberForm.password} onChange={(event) => setMemberField("password", event.target.value)} placeholder="At least 8 characters" className="mt-1" /></div><div><Label htmlFor="member-department">Department</Label><select id="member-department" value={memberForm.department} onChange={(event) => setMemberField("department", event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm">{departments.map((department) => <option key={department}>{department}</option>)}</select></div><div className="sm:col-span-2"><Label htmlFor="member-role">Role</Label><select id="member-role" value={memberForm.role} onChange={(event) => changeMemberRole(event.target.value as Role)} className="mt-1 h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm">{roleOrder.map((role) => <option key={role} value={role}>{roleMeta[role].label}</option>)}</select><p className="mt-1 text-[11px] text-muted-foreground">Management roles work in Business Management. Department roles need explicit workspace access.</p></div><div className="sm:col-span-2 rounded-md border border-border bg-surface-2 p-3"><label className="flex items-start gap-3"><Checkbox checked={memberForm.businessAccess} disabled={memberForm.role === "owner"} onCheckedChange={toggleBusinessAccess} /><span><span className="block text-sm font-medium">Business Management access</span><span className="mt-0.5 block text-[11px] text-muted-foreground">Allows access to company overview, people, reports, agents and business settings. Owner access is always enabled.</span></span></label></div><div className="sm:col-span-2"><div className="flex items-center justify-between gap-3"><Label>Active workspace access</Label>{memberForm.workspaces.length === 0 && <Badge variant="neutral">No department workspace</Badge>}</div><p className="mt-1 text-[11px] text-muted-foreground">Only active workspaces are shown. Select the department areas this person should use.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{activeWorkspaceOptions.map(([key, name]) => <label key={key} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"><Checkbox checked={memberForm.workspaces.includes(key)} onCheckedChange={() => toggleWorkspace(key)} /><span>{name}</span></label>)}</div></div><div className="sm:col-span-2"><Label>Permissions</Label><div className="mt-2 grid gap-2 sm:grid-cols-2">{permissionOptions.map(([key, label, detail]) => <label key={key} className="flex items-start gap-2 rounded-md border border-border px-3 py-2"><Checkbox checked={memberForm.permissions.includes(key)} onCheckedChange={() => togglePermission(key)} /><span><span className="block text-xs font-medium">{label}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{detail}</span></span></label>)}</div></div></div>{memberError && <p className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{memberError}</p>}<DialogFooter><Button type="button" variant="secondary" onClick={closeMemberDialog}>Cancel</Button><Button type="submit">{memberDialog === "invite" ? "Add and invite" : "Save access"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={ownerSwitchOpen} onOpenChange={(open) => !open && setOwnerSwitchOpen(false)}><DialogContent><DialogHeader><DialogTitle>Switch Owner</DialogTitle><DialogDescription>Choose an active member to become the new Owner. The current Owner will become an Admin, so the business always has exactly one Owner.</DialogDescription></DialogHeader><Label htmlFor="owner-candidate">New Owner</Label><select id="owner-candidate" value={ownerCandidateId} onChange={(event) => setOwnerCandidateId(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm"><option value="">Select a member</option>{members.filter((member) => member.role !== "owner" && member.status === "Active").map((member) => <option key={member.id} value={member.id}>{member.name} · {roleMeta[member.role].label}</option>)}</select><DialogFooter><Button type="button" variant="secondary" onClick={() => setOwnerSwitchOpen(false)}>Cancel</Button><Button type="button" onClick={confirmOwnerSwitch} disabled={!ownerCandidateId}>Switch Owner</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}><DialogContent><DialogHeader><DialogTitle>Remove {removeTarget?.name}?</DialogTitle><DialogDescription>This removes the person from the business and clears their Business Management and workspace access.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="secondary" onClick={() => setRemoveTarget(null)}>Cancel</Button><Button type="button" className="bg-danger text-white hover:bg-danger/90" onClick={confirmRemoveMember}>Remove person</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={roleDialog !== null} onOpenChange={(open) => !open && setRoleDialog(null)}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><form onSubmit={saveRole}><DialogHeader><DialogTitle>{roleDialog === "new" ? "Create role" : "Edit role and permissions"}</DialogTitle><DialogDescription>Define exactly what this role can view, edit, send and approve.</DialogDescription></DialogHeader><div className="flex flex-col gap-4"><div><Label htmlFor="role-name">Role name</Label><Input id="role-name" value={roleForm.name} onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Operations Manager" className="mt-1" autoFocus /></div><div><Label htmlFor="role-summary">Description</Label><Textarea id="role-summary" value={roleForm.summary} onChange={(event) => setRoleForm((current) => ({ ...current, summary: event.target.value }))} placeholder="What this role is responsible for" className="mt-1 min-h-16" /></div><div><Label>Permissions</Label><div className="mt-2 grid gap-2 sm:grid-cols-2">{permissionOptions.map(([key, label, detail]) => <label key={key} className="flex items-start gap-2 rounded-md border border-border px-3 py-2"><Checkbox checked={roleForm.permissions.includes(key)} onCheckedChange={() => setRoleForm((current) => ({ ...current, permissions: current.permissions.includes(key) ? current.permissions.filter((item) => item !== key) : [...current.permissions, key] }))} /><span><span className="block text-xs font-medium">{label}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{detail}</span></span></label>)}</div></div></div><DialogFooter>{roleDialog === "edit" && !roles.find((role) => role.id === editingRoleId)?.builtIn && <Button type="button" variant="secondary" onClick={deleteRole}><Trash2 className="size-3.5" />Delete role</Button>}<Button type="button" variant="secondary" onClick={() => setRoleDialog(null)}>Cancel</Button><Button type="submit">Save role</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={departmentDialog} onOpenChange={setDepartmentDialog}><DialogContent><form onSubmit={saveDepartment}><DialogHeader><DialogTitle>Add department</DialogTitle><DialogDescription>Create a department for workspace assignment and reporting.</DialogDescription></DialogHeader><Label htmlFor="department-name">Department name</Label><Input id="department-name" value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="e.g. Delivery" className="mt-1" autoFocus /><DialogFooter><Button type="button" variant="secondary" onClick={() => setDepartmentDialog(false)}>Cancel</Button><Button type="submit">Add department</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}

function MembersSection({ members, activeWorkspaceKeys, onInvite, onEdit, onRemove, onSwitchOwner }: { members: AccessMember[]; activeWorkspaceKeys: ReadonlySet<WorkspaceKey>; onInvite: () => void; onEdit: (member: AccessMember) => void; onRemove: (member: AccessMember) => void; onSwitchOwner: () => void }) {
  const managementMembers = members.filter((member) => member.businessAccess);
  const workspaceMembers = members.filter((member) => !member.businessAccess);

  return <div className="flex flex-col gap-4">
    <div className="grid gap-3 sm:grid-cols-3"><MiniMetric label="People" value={String(members.length)} detail="Company members" /><MiniMetric label="Management" value={String(managementMembers.length)} detail="Business-level access" tone="success" /><MiniMetric label="Workspace members" value={String(workspaceMembers.length)} detail="Department access" /></div>
    <MemberTable title="Business management members" description="People with Business Management access can work with company-level settings, reports and approvals." members={managementMembers} activeWorkspaceKeys={activeWorkspaceKeys} onInvite={onInvite} onEdit={onEdit} onRemove={onRemove} onSwitchOwner={onSwitchOwner} empty="No Business Management members yet." />
    <MemberTable title="Workspace members" description="Department users only see the active workspaces assigned to them." members={workspaceMembers} activeWorkspaceKeys={activeWorkspaceKeys} onEdit={onEdit} onRemove={onRemove} onSwitchOwner={onSwitchOwner} empty="No workspace members yet." />
  </div>;
}

function MemberTable({ title, description, members, activeWorkspaceKeys, onInvite, onEdit, onRemove, onSwitchOwner, empty }: { title: string; description: string; members: AccessMember[]; activeWorkspaceKeys: ReadonlySet<WorkspaceKey>; onInvite?: () => void; onEdit: (member: AccessMember) => void; onRemove: (member: AccessMember) => void; onSwitchOwner: () => void; empty: string }) {
  return <SectionCard title={title} description={description}><div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Owner and admins can manage access. Every change is recorded in the audit flow.</p>{onInvite && <Button size="sm" onClick={onInvite}><UserPlus className="size-3.5" />Add person</Button>}</div>{members.length === 0 ? <div className="rounded-md border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">{empty}</div> : <div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1.2fr_90px] gap-3 border-b border-border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Person</span><span>Email</span><span>Role</span><span>Department</span><span>Workspace access</span><span>Actions</span></div>{members.map((member) => { const workspaceCount = member.workspaces.filter((workspace) => activeWorkspaceKeys.has(workspace)).length; const accessSummary = [member.businessAccess ? "Business Management" : null, workspaceCount ? `${workspaceCount} workspace${workspaceCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "No active access"; return <div key={member.id} className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1.2fr_90px] items-center gap-3 border-b border-border px-2 py-3 text-xs last:border-0"><div><p className="font-medium">{member.name}</p><p className="mt-1 text-[11px] text-muted-foreground"><span className={`mr-1 inline-block size-1.5 rounded-full ${member.status === "Active" ? "bg-success" : "bg-warning"}`} />{member.lastActive}</p></div><span className="text-muted-foreground">{member.email}</span><Badge variant={roleMeta[member.role].tone}>{roleMeta[member.role].label}</Badge><span>{member.department}</span><span className="text-muted-foreground">{accessSummary}</span><div className="flex flex-wrap gap-1"><Button size="icon" variant="ghost" aria-label={`Edit ${member.name}`} onClick={() => onEdit(member)}><Pencil className="size-3.5" /></Button>{member.role === "owner" && <Button size="icon" variant="ghost" aria-label="Switch owner" title="Switch owner" onClick={onSwitchOwner}><ArrowRightLeft className="size-3.5 text-accent" /></Button>}{member.role !== "owner" && <Button size="icon" variant="ghost" aria-label={`Remove ${member.name}`} title="Remove member" onClick={() => onRemove(member)}><Trash2 className="size-3.5 text-danger" /></Button>}</div></div>; })}</div></div>}</SectionCard>;
}

function InvitationsSection({ invites, activeWorkspaceKeys, onResend, onCancel }: { invites: PendingInvite[]; activeWorkspaceKeys: ReadonlySet<WorkspaceKey>; onResend: (invite: PendingInvite) => void; onCancel: (invite: PendingInvite) => void }) {
  return <SectionCard title="Invitations" description="Track pending access, resend a link or cancel an invitation before it is accepted."><div className="overflow-x-auto"><div className="min-w-[700px]"><div className="grid grid-cols-[1.4fr_1.5fr_1fr_1.4fr_1fr_130px] gap-3 border-b border-border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Person</span><span>Email</span><span>Role</span><span>Workspace access</span><span>Status</span><span>Actions</span></div>{invites.map((invite) => { const workspaceCount = invite.workspaces.filter((workspace) => activeWorkspaceKeys.has(workspace)).length; const access = [invite.businessAccess ? "Business Management" : null, workspaceCount ? `${workspaceCount} workspace${workspaceCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "No active access"; return <div key={invite.id} className="grid grid-cols-[1.4fr_1.5fr_1fr_1.4fr_1fr_130px] items-center gap-3 border-b border-border px-2 py-3 text-xs last:border-0"><span className="font-medium">{invite.name}</span><span className="text-muted-foreground">{invite.email}</span><Badge variant="info">{roleMeta[invite.role].label}</Badge><span className="text-muted-foreground">{access}</span><Badge variant={invite.status === "Pending" ? "warning" : "neutral"}>{invite.status}</Badge><div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => onResend(invite)}>Resend</Button><Button size="icon" variant="ghost" aria-label={`Cancel invite for ${invite.name}`} onClick={() => onCancel(invite)}><X className="size-3.5" /></Button></div></div>; })}</div></div>{invites.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">No pending invitations.</div>}</SectionCard>;
}

function WorkspaceAccessSection({ members, workspaces, onToggle, onToggleBusiness, onEdit }: {
  members: AccessMember[];
  workspaces: readonly (readonly [WorkspaceKey, string])[];
  onToggle: (memberId: string, workspace: WorkspaceKey) => void;
  onToggleBusiness: (memberId: string) => void;
  onEdit: (member: AccessMember) => void;
}) {
  const gridTemplateColumns = `1.4fr 150px repeat(${workspaces.length}, minmax(110px, 1fr)) 70px`;
  return <SectionCard title="Workspace access" description="Assign Business Management and active department workspaces independently. The Owner always keeps Business Management access.">
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid items-center gap-2 border-b border-border px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ gridTemplateColumns }}>
          <span>Person</span><span>Business Management</span>{workspaces.map(([, name]) => <span key={name} className="truncate" title={name}>{name.replace(" & ", " / ")}</span>)}<span>Edit</span>
        </div>
        {members.map((member) => <div key={member.id} className="grid items-center gap-2 border-b border-border px-2 py-3 text-xs last:border-0" style={{ gridTemplateColumns }}>
          <div><p className="font-medium">{member.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{roleMeta[member.role].label}{member.businessAccess ? " · Business Management" : ""}</p></div>
          <div className="flex justify-center" title={member.role === "owner" ? "Owner access is always enabled" : `${member.businessAccess ? "Remove" : "Add"} Business Management access`}><Checkbox checked={member.businessAccess} disabled={member.role === "owner"} onCheckedChange={() => onToggleBusiness(member.id)} /></div>
          {workspaces.map(([key, name]) => <div key={key} className="flex justify-center" title={`${member.workspaces.includes(key) ? "Remove" : "Add"} ${name} access`}><Checkbox checked={member.workspaces.includes(key)} onCheckedChange={() => onToggle(member.id, key)} /></div>)}
          <Button size="icon" variant="ghost" aria-label={`Edit access for ${member.name}`} onClick={() => onEdit(member)}><Pencil className="size-3.5" /></Button>
        </div>)}
        {!workspaces.length && <div className="px-2 py-5 text-sm text-muted-foreground">No department workspaces are active yet.</div>}
      </div>
    </div>
    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Check className="size-3.5 text-success" />Checked cells grant access. Business Management access controls the company-level menu; workspace cells control department records.</div>
  </SectionCard>;
}
function RolesPermissionsSection({ roles, onNew, onEdit, onDelete }: { roles: RoleRecord[]; onNew: () => void; onEdit: (role: RoleRecord) => void; onDelete: (role: RoleRecord) => void }) {
  return <SectionCard title="Roles & permissions" description="Create roles and maintain the exact permissions each role can use."><div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Built-in roles can be edited; custom roles can also be removed.</p><Button size="sm" onClick={onNew}><Plus className="size-3.5" />Create role</Button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{roles.map((role) => <div key={role.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4"><div className="flex items-start justify-between gap-2"><span className="flex items-center gap-1.5 text-sm font-medium"><ShieldCheck className="size-3.5 text-accent" />{role.label}</span><Badge variant={role.tone}>{role.builtIn ? "Built-in" : "Custom"}</Badge></div><p className="text-xs text-muted-foreground">{role.summary}</p><p className="text-[11px] text-muted-foreground">{role.permissions.length} permissions enabled</p><div className="mt-auto flex gap-2"><Button size="sm" variant="secondary" onClick={() => onEdit(role)}><Pencil className="size-3.5" />Edit</Button>{!role.builtIn && <Button size="icon" variant="ghost" aria-label={`Delete ${role.label}`} onClick={() => onDelete(role)}><Trash2 className="size-3.5 text-danger" /></Button>}</div></div>)}</div></SectionCard>;
}

function DepartmentsSection({ departments, onAdd }: { departments: string[]; onAdd: () => void }) {
  return <SectionCard title="Teams & Departments" description="Create departments to organize people, assign workspace ownership and report performance."><div className="mb-3 flex justify-end"><Button size="sm" onClick={onAdd}><Plus className="size-3.5" />Add department</Button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{departments.map((department, index) => <div key={department} className="rounded-lg border border-border bg-surface-2 p-4"><Users className="size-4 text-accent" /><p className="mt-3 text-sm font-semibold">{department}</p><p className="mt-1 text-xs text-muted-foreground">{index + 2} members · manager assignment</p><Button size="sm" variant="ghost" className="mt-3 px-0">Manage team</Button></div>)}</div></SectionCard>;
}

function RequestsSection({ onNotice }: { onNotice: (message: string) => void }) {
  const requests = [["Aman Verma", "Finance & Accounting", "Needs read access to invoices", "Today"], ["Sana Iyer", "Customer Support & Success", "Needs report access", "Yesterday"]];
  return <SectionCard title="Access requests" description="Review requests before a member receives access to another workspace."><div className="flex flex-col divide-y divide-border">{requests.map(([name, workspace, reason, date]) => <div key={name} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{name} · {workspace}</p><p className="mt-1 text-xs text-muted-foreground">{reason} · {date}</p></div><Button size="sm" variant="secondary" onClick={() => onNotice(`${name} request approved in the demo.`)}>Approve</Button><Button size="sm" variant="ghost" onClick={() => onNotice(`${name} request declined in the demo.`)}>Decline</Button></div>)}</div></SectionCard>;
}

function AuditSection() {
  const logs = [["Pankaj updated Riya Kapoor’s workspace access", "Today, 09:32", "Access"], ["Karan Bhatt role changed to Sales Manager", "Yesterday, 16:10", "Role"], ["Invite sent to arjun@curiousdevs.ai", "Today, 10:20", "Invitation"], ["Finance workspace access removed from a demo member", "18 Oct, 14:42", "Access"]];
  return <SectionCard title="Audit logs" description="A clear record of people, role and workspace changes for owner review."><div className="flex flex-col divide-y divide-border">{logs.map(([event, date, type]) => <div key={event} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="flex size-7 items-center justify-center rounded-md bg-accent-muted text-accent"><ShieldCheck className="size-3.5" /></span><div className="min-w-0 flex-1"><p className="text-sm">{event}</p><p className="mt-1 text-[11px] text-muted-foreground">{date}</p></div><Badge variant="neutral">{type}</Badge></div>)}</div></SectionCard>;
}

function MiniMetric({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "success" }) {
  return <div className="rounded-lg border border-border bg-surface p-4"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-semibold ${tone === "success" ? "text-success" : "text-foreground"}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}
