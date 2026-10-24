"use client";

import { useCan } from "@/lib/hr-org-hooks";
import * as React from "react";
import { ArrowLeft, CheckCheck, Download, FileSignature, FileText, Folder, History, LockKeyhole, Search, ShieldCheck, Upload } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrEngageStore } from "@/lib/stores/hr-engage-store";
import { demoHrSignatureProvider, saveHrFile, useHrDocumentStore, type CompanyPolicy, type DocumentExtras, type DocumentSigner } from "@/lib/stores/hr-document-store";
import { PolicyEditor } from "@/components/hr-people/policy-editor";
import { DocumentReader, FullReadDialog, ReadFullButton, useDocumentSource } from "@/components/hr-people/document-reader";
import { DeclineDialog, SignDialog, SignatureSummary } from "@/components/hr-people/sign-dialog";
import { certificateText, deviceLabel, firstSentence, plainText, readingMinutes, sampleMarkup, type SignatureRecord } from "@/lib/hr-document-content";
import { downloadHrFile } from "@/lib/hr-payroll";
import type { DocumentVisibility, HrDemoRole, HrDocument, HrEmployee, HrSignatureAudit, SignatureStatus } from "@/lib/types";

export interface HrDocumentsProps { role: HrDemoRole; actorId: string; personal?: boolean }
const inputClass = "h-9 w-full border border-border bg-surface px-3 text-sm rounded-none";
const panelClass = "border border-border bg-surface";
const protectedCategory = /salary|compensation|tax|bank|pan|uan|esi|payroll|settlement|disciplinary|warning/i;
const categories = ["Identity & verification", "Offer letter", "Employment agreement", "NDA & confidentiality", "Policy acknowledgement", "Salary & compensation", "Tax & statutory", "Bank / PAN / UAN / ESI", "Performance review", "Warning / disciplinary", "Exit clearance", "Full & final settlement", "Experience letter", "Relieving letter"];
const visibilityLabels: Record<DocumentVisibility, string> = { employee: "Employee only", employee_manager: "Employee & reporting manager", hr: "HR only", payroll: "Payroll authorised users", business_management: "Business Management authorised users", selected_roles: "Selected HR roles" };
const signatureLabels: Record<SignatureStatus, string> = { draft: "Draft", sent: "Sent for signature", viewed: "Viewed", partially_signed: "Partially signed", signed: "Signed", rejected: "Rejected", expired: "Expired", cancelled: "Cancelled" };
const templates = ["NDA & confidentiality", "Offer letter", "Employment agreement", "Policy acknowledgement", "Salary revision letter", "Warning / notice letter", "Exit clearance", "Full & final acknowledgement", "Experience letter", "Relieving letter"];
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Not set";
const nowDate = () => new Date().toISOString().slice(0, 10);
const canManage = (role: HrDemoRole) => role === "owner" || role === "hr_manager";
const isPayroll = (item: HrDocument) => /salary|compensation|tax|bank|pan|uan|esi|payroll|settlement/i.test(item.category);
function signatureState(document: HrDocument): SignatureStatus {
  return document.expiresAt && document.expiresAt < nowDate() && ["sent", "viewed", "partially_signed"].includes(document.signatureStatus) ? "expired" : document.signatureStatus;
}
function canRead(document: HrDocument, role: HrDemoRole, actorId: string, employees: HrEmployee[], extra?: DocumentExtras, personal = false) {
  const own = document.employeeId === actorId;
  if (personal) return own && ["employee", "employee_manager"].includes(document.visibility);
  if (canManage(role)) return true;
  if (role === "business_manager") return false;
  if (role === "payroll_admin") return isPayroll(document) && document.visibility !== "hr";
  if (own && ["employee", "employee_manager"].includes(document.visibility)) return true;
  if (role === "reporting_manager") return !protectedCategory.test(document.category) && document.visibility === "employee_manager" && employees.some((item) => item.id === document.employeeId && item.managerId === actorId);
  return document.visibility === "selected_roles" && (extra?.selectedRoles ?? []).includes(role);
}
function Status({ document }: { document: HrDocument }) {
  const state = signatureState(document);
  const value = document.status === "missing" ? "Missing" : document.status === "archived" ? "Archived" : state === "draft" ? "Available" : signatureLabels[state];
  return <Badge variant={["Signed", "Available"].includes(value) ? "success" : ["Missing", "Rejected", "Expired"].includes(value) ? "danger" : "neutral"}>{value}</Badge>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{label}{children}</label>; }
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function HrDocumentsView(props: HrDocumentsProps) { return <DocumentCentre {...props} />; }
export function HrSignaturesView(props: HrDocumentsProps) { return <div className="space-y-5"><DocumentCentre {...props} signaturesOnly /><SignatureAuditTimeline role={props.role} actorId={props.actorId} /></div>; }

const auditLabels: Record<HrSignatureAudit["event"], string> = { sent: "Sent for signature", viewed: "Viewed", signed: "Signed", rejected: "Rejected", cancelled: "Request cancelled" };
function SignatureAuditTimeline({ role, actorId }: { role: HrDemoRole; actorId: string }) {
  const { documents, signatureAudits, employees } = useHrPeopleStore();
  const { extras } = useHrDocumentStore();
  const visibleIds = new Set(documents.filter((item) => canRead(item, role, actorId, employees, extras[item.id])).map((item) => item.id));
  const entries = signatureAudits.filter((item) => visibleIds.has(item.documentId)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return <section aria-label="Signature audit timeline" className={panelClass}>
    <div className="border-b border-border p-4"><h2 className="text-sm font-semibold">Signature audit timeline</h2><p className="mt-1 text-xs text-muted-foreground">Newest first. Records are append-only demo events, not legal evidence.</p></div>
    {entries.length ? <ol className="divide-y divide-border">{entries.map((item) => <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm"><div><p className="font-medium">{auditLabels[item.event]} · {item.documentName}</p><p className="mt-1 text-xs text-muted-foreground">{item.employeeName} · by {item.actorName} · {item.device}</p></div><time dateTime={item.occurredAt} className="text-xs text-muted-foreground">{new Date(item.occurredAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</time></li>)}</ol> : <p className="p-6 text-center text-sm text-muted-foreground">No signature activity yet.</p>}
  </section>;
}

function DocumentCentre({ role, actorId, personal = false, signaturesOnly = false }: HrDocumentsProps & { signaturesOnly?: boolean }) {
  const { employees, documents } = useHrPeopleStore();
  const { extras, policies, acknowledgements } = useHrDocumentStore();
  const params = useSearchParams();
  const [scope, setScope] = React.useState<"employees" | "company">(params.get("tab") === "company" ? "company" : "employees");
  const [folderId, setFolderId] = React.useState<string | null>(personal ? actorId : null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedAction, setSelectedAction] = React.useState<"sign" | "acknowledge" | undefined>(undefined);
  const [upload, setUpload] = React.useState<{ document?: HrDocument; company?: boolean } | null>(null);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [editingPolicy, setEditingPolicy] = React.useState<CompanyPolicy | "new" | null>(null);
  const manager = canManage(role);
  const policyManager = useCan(role, "policies.manage");
  const actor = employees.find((item) => item.id === actorId);
  const visible = documents.filter((item) => canRead(item, role, actorId, employees, extras[item.id], personal));
  const currentFolderId = personal ? actorId : folderId;
  const folder = employees.find((item) => item.id === currentFolderId);
  const folderEmployees = employees.filter((item) => (personal ? item.id === actorId : manager || role === "payroll_admin" || (role === "reporting_manager" && (item.managerId === actorId || item.id === actorId)) || item.id === actorId));
  const data = scope === "company" ? policies : visible.filter((item) => !currentFolderId || item.employeeId === currentFolderId);
  const rows = data.filter((item) => `${item.name} ${item.employeeName} ${item.employeeId} ${item.category}`.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || (filter === "missing" ? item.status === "missing" : filter === "archived" ? item.status === "archived" : filter === "action" ? ["sent", "viewed", "partially_signed"].includes(signatureState(item)) : signatureState(item) === filter)) && (!signaturesOnly || item.signatureStatus !== "draft") && (filter === "archived" || item.status !== "archived"));
  const selected = [...visible, ...policies].find((item) => item.id === selectedId);
  const expected = visible.filter((item) => item.status !== "archived");
  const missing = expected.filter((item) => item.status === "missing").length;
  const awaiting = expected.filter((item) => ["sent", "viewed", "partially_signed"].includes(signatureState(item))).length;
  const openDoc = (id: string, action?: "sign" | "acknowledge") => { setSelectedAction(action); setSelectedId(id); };
  const mineToSign = (item: HrDocument) => { const list = extras[item.id]?.signers; return ["sent", "viewed", "partially_signed"].includes(signatureState(item)) && (list?.length ? list.some((signer) => signer.employeeId === actorId && ["pending", "viewed"].includes(signer.status)) : item.employeeId === actorId); };
  const toSignMine = personal ? expected.filter(mineToSign) : [];
  const policiesPending = personal && actor ? policies.filter((item) => item.status !== "archived" && !acknowledgements[`${item.id}:${item.version}:${actorId}`]) : [];
  if (role === "business_manager" && !personal) return <div className={`${panelClass} p-8 text-center`}><LockKeyhole className="mx-auto mb-3 size-7 text-muted-foreground" /><h3 className="font-semibold">HR documents are restricted</h3><p className="mt-2 text-sm text-muted-foreground">Business Management access does not grant access to employee files. Ask an HR administrator for the appropriate workspace role.</p></div>;
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">{[{ title: personal ? "My available documents" : "Available documents", value: expected.length - missing, text: "Organised by employee and lifecycle" }, { title: "Missing documents", value: missing, text: "Upload required documents below" }, { title: "Awaiting signatures", value: awaiting, text: "Review and sign from your own account" }].map((item) => <div key={item.title} className={`${panelClass} p-4`}><p className="text-xs font-medium text-muted-foreground">{item.title}</p><p className="mt-2 text-2xl font-semibold">{item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.text}</p></div>)}</div>
    {(toSignMine.length > 0 || policiesPending.length > 0) && <div role="status" className="flex flex-wrap items-center justify-between gap-3 border border-accent bg-accent-muted px-4 py-3 text-sm"><p><strong>Action needed.</strong> {toSignMine.length > 0 && `${toSignMine.length} ${toSignMine.length === 1 ? "document" : "documents"} to sign`}{toSignMine.length > 0 && policiesPending.length > 0 && " · "}{policiesPending.length > 0 && `${policiesPending.length} ${policiesPending.length === 1 ? "policy" : "policies"} to acknowledge`}</p><div className="flex gap-2">{toSignMine.length > 0 && <Button size="sm" onClick={() => openDoc(toSignMine[0].id, "sign")}>Review &amp; sign</Button>}{policiesPending.length > 0 && <Button size="sm" variant="outline" onClick={() => { setScope("company"); setFilter("all"); }}>See policies</Button>}</div></div>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      {!signaturesOnly ? <div className="flex flex-wrap gap-1 border border-border bg-surface-2 p-1" role="tablist" aria-label="Document library"><button id="doc-tab-employees" role="tab" aria-selected={scope === "employees"} aria-controls="doc-panel" onClick={() => { setScope("employees"); setFilter("all"); }} className={`px-4 py-2 text-sm ${scope === "employees" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"}`}>{personal ? "My documents" : "Employee folders"}</button><button id="doc-tab-company" role="tab" aria-selected={scope === "company"} aria-controls="doc-panel" onClick={() => { setScope("company"); setFilter("all"); }} className={`px-4 py-2 text-sm ${scope === "company" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"}`}>Company policies</button></div> : <p className="text-sm text-muted-foreground">Track document reviews and signatures. Demo only — no emails or legal signatures are sent.</p>}
      <div className="flex gap-2">{manager && !personal && scope !== "company" && <Button variant="outline" onClick={() => setTemplateOpen(true)}><FileSignature className="mr-2 size-4" />Use template</Button>}{scope === "company" ? (policyManager && <><Button onClick={() => setEditingPolicy("new")}><FileText className="mr-2 size-4" />Write a policy</Button><Button variant="outline" onClick={() => setUpload({ company: true })}><Upload className="mr-2 size-4" />Upload a file</Button></>) : (manager || personal) && <Button onClick={() => setUpload({ company: false })}><Upload className="mr-2 size-4" />Upload document</Button>}</div>
    </div>
    <div id="doc-panel" role={signaturesOnly ? undefined : "tabpanel"} aria-labelledby={signaturesOnly ? undefined : `doc-tab-${scope}`} className={`${panelClass} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Search documents or employees" placeholder="Search name, employee ID or document…" value={query} onChange={(event) => setQuery(event.target.value)} className="rounded-none pl-9" /></div>{scope !== "company" && <select aria-label="Filter document status" className={`${inputClass} max-w-48`} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option><option value="missing">Missing</option><option value="action">Awaiting signature</option><option value="signed">Signed</option><option value="rejected">Rejected</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option><option value="archived">Archived</option></select>}</div>
      {scope === "company" ? <PolicyLibrary policies={policies} query={query} actorId={actorId} manager={policyManager} onOpen={openDoc} onEdit={(policy) => policy.id && (extras[policy.id]?.fileKey ? setUpload({ document: policy, company: true }) : setEditingPolicy(policy))} /> : scope === "employees" && !personal && !signaturesOnly && !currentFolderId && !query && filter === "all" ? <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{folderEmployees.map((employee) => {
        const files = visible.filter((item) => item.employeeId === employee.id && item.status !== "archived"); const due = files.filter((item) => item.status === "missing").length;
        return <button key={employee.id} onClick={() => setFolderId(employee.id)} className="group border border-border p-4 text-left transition-colors hover:border-accent hover:bg-surface-2"><div className="mb-3 flex items-center justify-between"><Folder className="size-6 text-accent" /><span className="font-mono text-xs text-muted-foreground">{employee.id.toUpperCase()}</span></div><p className="font-medium">{employee.name}</p><p className="mt-1 text-xs text-muted-foreground">{employee.department} · {employee.title}</p><div className="mt-4 flex flex-wrap gap-2"><Badge variant="neutral">{files.length} documents</Badge>{due > 0 && <Badge variant="warning">{due} missing</Badge>}<span className="text-xs text-muted-foreground">{employee.status}</span></div></button>;
      })}{!folderEmployees.length && <p className="p-6 text-sm text-muted-foreground">No employee folders are assigned to your role.</p>}</div> : <>
      {scope === "employees" && folder && <div className="flex items-center gap-3 border-b border-border bg-surface-2 p-4">{!personal && <Button size="icon" variant="ghost" aria-label="Back to employee folders" onClick={() => setFolderId(null)}><ArrowLeft className="size-4" /></Button>}<div><h2 className="text-sm font-semibold">{folder.name} <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{folder.id.toUpperCase()}</span></h2><p className="mt-1 text-xs text-muted-foreground">{folder.title} · {folder.department} · Joined {date(folder.joiningDate)}</p></div></div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-border bg-surface-2 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Document</th>{!personal && <th className="px-4 py-3 font-medium">Owner</th>}<th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Issued / expires</th><th className="px-4 py-3 font-medium">Action</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-2/50"><td className="px-4 py-4"><button className="text-left font-medium hover:text-accent" onClick={() => openDoc(item.id)}>{item.name}</button><p className="mt-1 text-xs text-muted-foreground">{item.category} · v{item.version}{extras[item.id]?.fileName ? ` · ${extras[item.id].fileName}` : " · Sample"}</p></td>{!personal && <td className="px-4 py-4"><p>{item.employeeName}</p><p className="text-xs text-muted-foreground">{item.employeeId.toUpperCase()}</p></td>}<td className="px-4 py-4"><Status document={item} /></td><td className="px-4 py-4 text-xs text-muted-foreground"><p>{date(item.issuedAt)}</p><p>{item.expiresAt ? `Expires ${date(item.expiresAt)}` : "No expiry"}</p></td><td className="px-4 py-4">{(() => { const needsFile = item.status === "missing" && (manager || item.employeeId === actorId); const toSign = !needsFile && mineToSign(item); return <Button size="sm" variant={toSign ? "default" : "outline"} onClick={() => needsFile ? setUpload({ document: item }) : openDoc(item.id, toSign ? "sign" : undefined)}>{needsFile ? "Upload" : toSign ? "Review & sign" : "Review"}</Button>; })()}</td></tr>)}</tbody></table></div>
      {!rows.length && <div className="p-10 text-center"><FileText className="mx-auto mb-3 size-7 text-muted-foreground" /><h3 className="text-sm font-medium">No documents match this view</h3><p className="mt-1 text-xs text-muted-foreground">Try another status or search, or upload a document for this employee.</p></div>}
      </>}
    </div>
    <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" />Only documents permitted for your role appear here. Uploads can be up to 10 MB per file. Use sample files, not real identity or bank records.</p>
    {upload && <UploadDialog role={role} actorId={actorId} personal={personal} initialEmployeeId={currentFolderId ?? actorId} document={upload.document} company={upload.company} onClose={() => setUpload(null)} />}
    {editingPolicy && <PolicyEditor policy={editingPolicy === "new" ? undefined : editingPolicy} actorId={actorId} onClose={() => setEditingPolicy(null)} />}
    {templateOpen && <TemplateDialog actorId={actorId} initialEmployeeId={currentFolderId ?? ""} onClose={() => setTemplateOpen(false)} onCreated={(id) => { setTemplateOpen(false); openDoc(id); }} />}
    {selected && <DocumentDialog key={`${selected.id}:${actorId}:${role}:${selectedAction ?? ""}`} initialAction={selectedAction} document={selected} role={role} actorId={actorId} personal={personal} company={selected.employeeId === "company"} onClose={() => { setSelectedId(null); setSelectedAction(undefined); }} onUpload={() => { setSelectedId(null); setUpload({ document: selected, company: selected.employeeId === "company" }); }} />}
    {!actor && <p className="text-sm text-danger">This account is not linked to an employee record. Ask HR to link your account before signing.</p>}
  </div>;
}

function PolicyLibrary({ policies, query, actorId, manager, onOpen, onEdit }: { policies: CompanyPolicy[]; query: string; actorId: string; manager: boolean; onOpen: (id: string, action?: "acknowledge") => void; onEdit: (policy: CompanyPolicy) => void }) {
  const { employees } = useHrPeopleStore();
  const { extras, acknowledgements, savePolicy, removePolicy, record } = useHrDocumentStore();
  const [showArchived, setShowArchived] = React.useState(false);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const actor = employees.find((item) => item.id === actorId);
  const people = employees.filter((item) => item.status !== "archived");
  const archivedCount = policies.filter((item) => item.status === "archived").length;
  const list = policies.filter((item) => (showArchived || item.status !== "archived") && `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const actorName = actor?.name ?? "HR";
  const archivedToggle = manager && archivedCount > 0 ? <label className="flex items-center justify-end gap-2 px-4 pt-3 text-xs text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Show archived ({archivedCount})</label> : null;
  if (!list.length) return <>{archivedToggle}<div className="p-10 text-center"><FileText className="mx-auto mb-3 size-7 text-muted-foreground" /><h2 className="text-sm font-medium">{query ? "No policy matches your search" : "No company policies yet"}</h2><p className="mt-1 text-xs text-muted-foreground">{manager ? "Use Write a policy to publish one." : "HR publishes policies here."}</p></div></>;
  return <>{archivedToggle}<ul className="grid gap-3 p-4 md:grid-cols-2">{list.map((policy) => {
    const file = extras[policy.id];
    const archived = policy.status === "archived";
    const summary = file?.fileKey ? `Uploaded file: ${file.fileName ?? "document"}` : firstSentence(policy.body);
    const minutes = file?.fileKey ? null : readingMinutes(policy.body);
    const ackAt = acknowledgements[`${policy.id}:${policy.version}:${actorId}`];
    const count = people.filter((item) => acknowledgements[`${policy.id}:${policy.version}:${item.id}`]).length;
    return <li key={policy.id} className={`flex flex-col justify-between gap-4 border border-border p-4 ${archived ? "opacity-70" : ""}`}>
      <div className="space-y-2"><div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span className="border border-border px-1.5 py-0.5">{policy.category}</span><span>v{policy.version}</span><span>Issued {date(policy.issuedAt)}</span>{minutes !== null && <span>{minutes} min read</span>}{archived && <span className="border border-warning/40 bg-warning-muted px-1.5 py-0.5 text-warning">Archived</span>}</div>
        <h2 className="text-base font-semibold leading-snug">{policy.name}</h2>
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}</div>
      <div className="space-y-3">
        {actor && !archived && (ackAt ? <p className="flex items-center gap-1.5 text-xs text-success"><CheckCheck className="size-3.5" />You acknowledged this on {date(ackAt)}</p> : <p className="text-xs text-warning">Needs your acknowledgement</p>)}
        {manager && <div><div className="mb-1 flex justify-between text-[11px] text-muted-foreground"><span>Acknowledged</span><span>{count} of {people.length}</span></div><div className="h-1.5 bg-surface-2" role="progressbar" aria-label={`${policy.name} acknowledgements`} aria-valuemin={0} aria-valuemax={people.length} aria-valuenow={count}><div className="h-1.5 bg-accent" style={{ width: `${people.length ? (count / people.length) * 100 : 0}%` }} /></div></div>}
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onOpen(policy.id)}>Read</Button>{actor && !ackAt && !archived && <Button size="sm" onClick={() => onOpen(policy.id, "acknowledge")}>Read &amp; acknowledge</Button>}
          {manager && !archived && <Button size="sm" variant="outline" onClick={() => onEdit(policy)}>Edit</Button>}
          {manager && <Button size="sm" variant="ghost" onClick={() => { savePolicy({ ...policy, status: archived ? "current" : "archived" }); record(policy.id, { actor: actorName, event: archived ? "Policy restored" : "Policy archived", version: policy.version }); toast.success(archived ? "Policy restored" : "Policy archived. Employees no longer see it."); }}>{archived ? "Restore" : "Archive"}</Button>}
          {manager && (confirming === policy.id ? <span className="flex items-center gap-2 text-xs"><button type="button" className="text-danger underline" onClick={() => { removePolicy(policy.id); setConfirming(null); toast.success(`${policy.name} deleted`); }}>Delete for good</button><button type="button" className="text-muted-foreground underline" onClick={() => setConfirming(null)}>Keep</button></span> : <Button size="sm" variant="ghost" aria-label={`Delete ${policy.name}`} onClick={() => setConfirming(policy.id)}>Delete</Button>)}</div>
      </div>
    </li>;
  })}</ul></>;
}

function UploadDialog({ role, actorId, personal, initialEmployeeId, document, company = false, onClose }: HrDocumentsProps & { initialEmployeeId: string; document?: HrDocument; company?: boolean; onClose: () => void }) {
  const { employees, addDocument, updateDocument } = useHrPeopleStore();
  const { extras, patch, record, savePolicy } = useHrDocumentStore();
  const [employeeId, setEmployeeId] = React.useState(document?.employeeId ?? initialEmployeeId);
  const [name, setName] = React.useState(document?.name ?? "");
  const [category, setCategory] = React.useState(document?.category ?? (company ? "Policy acknowledgement" : "Identity & verification"));
  const [visibility, setVisibility] = React.useState<DocumentVisibility>(document?.visibility ?? "employee");
  const [issuedAt, setIssuedAt] = React.useState(document?.issuedAt ?? nowDate());
  const [expiresAt, setExpiresAt] = React.useState(document?.expiresAt ?? "");
  const [selectedRoles, setSelectedRoles] = React.useState<HrDemoRole[]>(document ? extras[document.id]?.selectedRoles ?? [] : []);
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const manager = canManage(role) && !personal;
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (!file) { setError("Choose the document file to upload."); return; }
    if (!name.trim()) { setError("Enter a document name."); return; }
    if (expiresAt && expiresAt < issuedAt) { setError("Expiry must be on or after the issue date."); return; }
    if (visibility === "selected_roles" && !selectedRoles.length) { setError("Select at least one authorised role."); return; }
    const employee = employees.find((item) => item.id === (personal ? actorId : employeeId));
    if (!company && !employee) { setError("Choose an employee."); return; }
    const id = document?.id ?? `doc-${crypto.randomUUID()}`; const version = document ? document.version + (document.status === "missing" ? 0 : 1) : 1;
    const key = `${id}:${version}:${crypto.randomUUID()}`;
    setBusy(true);
    try {
      await saveHrFile(key, file);
      const actor = employees.find((item) => item.id === actorId)?.name ?? "HR";
      const entry: HrDocument = { id, employeeId: company ? "company" : employee!.id, employeeName: company ? "Company library" : employee!.name, name: name.trim(), category, visibility: manager ? visibility : "employee", version, status: "current", signatureStatus: "draft", issuedAt: issuedAt || null, expiresAt: expiresAt || null, ownerName: actor, acknowledgedAt: null };
      const previous = document && document.status !== "missing" ? [{ version: document.version, fileName: extras[id]?.fileName, mime: extras[id]?.mime, size: extras[id]?.size, fileKey: extras[id]?.fileKey, body: extras[id]?.body ?? sampleMarkup(document, employees.find((item) => item.id === document.employeeId)), savedAt: new Date().toISOString(), savedBy: document.ownerName, signatureStatus: document.signatureStatus }, ...(extras[id]?.versions ?? [])] : extras[id]?.versions ?? [];
      patch(id, { fileName: file.name, mime: file.type, size: file.size, fileKey: key, body: undefined, versions: previous, selectedRoles: visibility === "selected_roles" ? selectedRoles : [], signers: [] });
      if (company) { savePolicy({ ...entry, body: "" }); if (!document) useHrEngageStore.getState().addItem({ id: `eng-${crypto.randomUUID()}`, kind: "announcement", authorId: actorId, createdAt: new Date().toISOString(), group: "all", title: `New policy: ${entry.name}`, text: "A new company policy has been published. Please read it and acknowledge it in Document Center." }); } else if (document) updateDocument(id, entry); else addDocument(entry);
      record(id, { actor, event: document ? "New file version uploaded" : "Document uploaded", version, detail: `${file.name} · ${visibilityLabels[entry.visibility]} · Local browser storage` });
      toast.success(`Document v${version} saved locally`); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The document could not be stored."); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto rounded-none"><DialogHeader><DialogTitle>{document ? document.status === "missing" ? "Upload missing document" : "Upload a new version" : company ? "Add company policy" : "Upload employee document"}</DialogTitle><DialogDescription>PDF, image or office file · up to 10 MB. Previous versions are retained. Files stay in this browser.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4">{!company && <Field label="Employee"><select className={inputClass} value={personal ? actorId : employeeId} disabled={personal || Boolean(document)} onChange={(event) => setEmployeeId(event.target.value)}>{employees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id.toUpperCase()}</option>)}</select></Field>}<Field label="Document name"><Input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Signed employment agreement" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Category"><select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>{[...new Set([category, ...categories])].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Visibility"><select className={inputClass} value={manager ? visibility : "employee"} disabled={!manager} onChange={(event) => setVisibility(event.target.value as DocumentVisibility)}>{Object.entries(visibilityLabels).filter(([key]) => !company || key === "employee" || key === "hr").map(([key, label]) => <option key={key} value={key}>{company && key === "employee" ? "All HR workspace members" : label}</option>)}</select></Field><Field label="Issue date"><Input type="date" required value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} /></Field><Field label="Expiry date · optional"><Input type="date" min={issuedAt} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></Field></div>{visibility === "selected_roles" && <div className="space-y-2 border border-border p-3"><p className="text-xs font-medium">Authorised roles</p>{(["hr_manager", "payroll_admin"] as HrDemoRole[]).map((item) => <label key={item} className="mr-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedRoles.includes(item)} onChange={(event) => setSelectedRoles(event.target.checked ? [...selectedRoles, item] : selectedRoles.filter((value) => value !== item))} />{item === "hr_manager" ? "HR Manager" : "Payroll Admin"}</label>)}</div>}<Field label="Choose file"><Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx" onChange={(event) => { const next = event.target.files?.[0] ?? null; setFile(next); if (!name && next) setName(next.name.replace(/\.[^.]+$/, "")); }} /></Field>{file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}{document?.signatureStatus === "signed" && <p className="border border-info/20 bg-info-muted p-3 text-xs text-info">The signed version remains in version history. This upload starts a new unsigned version.</p>}{error && <p role="alert" className="text-sm text-danger">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Storing file…" : "Save document"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function TemplateDialog({ actorId, initialEmployeeId, onClose, onCreated }: { actorId: string; initialEmployeeId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { employees, addDocument } = useHrPeopleStore(); const { patch, record } = useHrDocumentStore();
  const [employeeId, setEmployeeId] = React.useState(initialEmployeeId || employees[0]?.id || ""); const [template, setTemplate] = React.useState(templates[0]); const [body, setBody] = React.useState("");
  const employee = employees.find((item) => item.id === employeeId);
  const preview = body || sampleMarkup({ id: "template-preview", employeeId, employeeName: employee?.name ?? "", name: template, category: template, visibility: "employee", version: 1, status: "current", signatureStatus: "draft", issuedAt: nowDate(), expiresAt: null, ownerName: "HR", acknowledgedAt: null }, employee, { draft: true });
  function create(event: React.FormEvent) { event.preventDefault(); if (!employee) return; const actor = employees.find((item) => item.id === actorId)?.name ?? "HR"; const id = `doc-${crypto.randomUUID()}`; const document: HrDocument = { id, employeeId, employeeName: employee.name, name: `${template} — ${employee.name}`, category: template, visibility: /warning/i.test(template) ? "hr" : "employee", version: 1, status: "current", signatureStatus: "draft", issuedAt: nowDate(), expiresAt: null, ownerName: actor, acknowledgedAt: null }; addDocument(document); patch(id, { body: preview }); record(id, { actor, event: "Draft created from template", version: 1 }); onCreated(id); }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto rounded-none"><DialogHeader><DialogTitle>Prepare an employee document</DialogTitle><DialogDescription>Choose a template, check merged details and edit the draft before requesting signatures.</DialogDescription></DialogHeader><form onSubmit={create} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Employee"><select className={inputClass} value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setBody(""); }}>{employees.filter((item) => item.status !== "archived").map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></Field><Field label="Template"><select className={inputClass} value={template} onChange={(event) => { setTemplate(event.target.value); setBody(""); }}>{templates.map((item) => <option key={item}>{item}</option>)}</select></Field></div><Field label="Review and edit document text"><Textarea className="min-h-72 font-mono text-xs" value={preview} onChange={(event) => setBody(event.target.value)} /></Field><p className="text-xs text-muted-foreground">Formatting: <code># title</code>, <code>## heading</code>, <code>- bullet</code>, <code>1. numbered</code>, <code>**bold**</code>. The employee sees it as a formatted document.</p><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!employee || !preview.trim()}>Create draft</Button></DialogFooter></form></DialogContent></Dialog>;
}

type DocumentDialogProps = HrDocumentsProps & { document: HrDocument; company?: boolean; initialAction?: "sign" | "acknowledge"; onClose: () => void; onUpload: () => void };

function DocumentDialog({ document, role, actorId, personal, company = false, initialAction, onClose, onUpload }: DocumentDialogProps) {
  const { employees, updateDocument, addSignatureAudit } = useHrPeopleStore();
  const { extras, patch, record, savePolicy, policies, acknowledgements, acknowledgePolicy } = useHrDocumentStore();
  const live = company ? policies.find((item) => item.id === document.id) ?? document : document;
  const extra = extras[live.id];
  const manager = canManage(role) && !personal;
  const actor = employees.find((item) => item.id === actorId);
  const actorName = actor?.name ?? "HR";
  const state = signatureState(live);
  // Seed documents can be awaiting signature without recorded signers; the employee is then the pending signer.
  const signers: DocumentSigner[] = extra?.signers?.length ? extra.signers : ["sent", "viewed", "partially_signed"].includes(state) && live.employeeId !== "company" ? [{ employeeId: live.employeeId, name: live.employeeName, status: "pending" }] : [];
  const mySigner = signers.find((item) => item.employeeId === actorId && ["pending", "viewed"].includes(item.status));
  const [busy, setBusy] = React.useState(false);
  const [extraSigners, setExtraSigners] = React.useState<string[]>([]);
  const [flow, setFlow] = React.useState<"sign" | "acknowledge" | null>(initialAction ?? null);
  const [declining, setDeclining] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const [certificate, setCertificate] = React.useState<DocumentSigner | null>(null);
  const source = useDocumentSource(live, employees.find((item) => item.id === live.employeeId), extra, company ? (live as CompanyPolicy).body : undefined);
  const acknowledgedAt = acknowledgements[`${live.id}:${live.version}:${actorId}`];
  const acknowledgedBy = company ? employees.filter((item) => item.status !== "archived" && acknowledgements[`${live.id}:${live.version}:${item.id}`]) : [];

  function apply(change: Partial<HrDocument>) {
    if (company) savePolicy({ ...(live as CompanyPolicy), ...change });
    else updateDocument(live.id, change);
  }
  function audit(event: "sent" | "viewed" | "signed" | "rejected" | "cancelled") {
    addSignatureAudit({ id: `audit-${crypto.randomUUID()}`, documentId: live.id, documentName: live.name, employeeName: live.employeeName, event, actorName, occurredAt: new Date().toISOString(), device: deviceLabel() });
  }
  function rollup(next: DocumentSigner[]): SignatureStatus {
    if (next.some((item) => item.status === "rejected")) return "rejected";
    if (next.every((item) => item.status === "signed")) return "signed";
    if (next.some((item) => item.status === "signed")) return "partially_signed";
    return next.some((item) => item.status === "viewed") ? "viewed" : "sent";
  }
  function download() {
    if (source.kind === "file") downloadBlob(source.blob, source.name);
    else if (source.kind === "blocks") downloadBlob(new Blob([plainText(source.blocks)], { type: "text/plain" }), `${live.name}.txt`);
    else return;
    record(live.id, { actor: actorName, event: "Document downloaded", version: live.version });
  }
  async function sendForSignature() {
    const ids = [...new Set([live.employeeId, ...extraSigners])].filter((id) => employees.some((item) => item.id === id));
    const chosen: DocumentSigner[] = ids.map((id) => ({ employeeId: id, name: employees.find((item) => item.id === id)!.name, status: "pending" }));
    setBusy(true);
    try {
      const { reference } = await demoHrSignatureProvider.send(live, chosen);
      patch(live.id, { signers: chosen });
      apply({ signatureStatus: "sent" });
      record(live.id, { actor: actorName, event: "Sent for signature", version: live.version, detail: `${chosen.map((item) => item.name).join(", ")} · ${reference}` });
      audit("sent");
      toast.success("Marked as sent for signature");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not send for signature."); } finally { setBusy(false); }
  }
  function completeSigning(sig: SignatureRecord) {
    const method = sig.method === "typed" ? "typed name" : "drawn signature";
    if (flow === "acknowledge") {
      acknowledgePolicy(live.id, actorId, live.version);
      record(live.id, { actor: actorName, event: "Policy acknowledged", version: live.version, detail: `${sig.reference} · fingerprint ${sig.hash.slice(0, 12)}` });
      toast.success("Policy acknowledged");
      return;
    }
    if (!mySigner) return;
    const next = signers.map((item) => item.employeeId === actorId ? { ...item, status: "signed" as const, signedAt: sig.signedAt, signature: sig } : item);
    patch(live.id, { signers: next });
    apply({ signatureStatus: rollup(next), acknowledgedAt: sig.signedAt });
    record(live.id, { actor: actorName, event: `Signed (${method})`, version: live.version, detail: `${sig.reference} · fingerprint ${sig.hash.slice(0, 12)}` });
    audit("signed");
    toast.success("Document signed");
  }
  function decline(reason: string) {
    const next = signers.map((item) => item.employeeId === actorId ? { ...item, status: "rejected" as const, rejectedReason: reason } : item);
    patch(live.id, { signers: next });
    apply({ signatureStatus: "rejected" });
    record(live.id, { actor: actorName, event: "Declined to sign", version: live.version, detail: reason });
    audit("rejected");
    setDeclining(false);
    toast.success("Signature request declined. HR can see your reason.");
  }
  function cancelRequest() {
    patch(live.id, { signers: [] });
    apply({ signatureStatus: "cancelled" });
    record(live.id, { actor: actorName, event: "Signature request cancelled", version: live.version });
    audit("cancelled");
  }
  function archive() {
    apply({ status: "archived" });
    record(live.id, { actor: actorName, event: "Document archived", version: live.version });
    toast.success("Document archived");
    onClose();
  }

  const history = [...(extra?.versions ?? [])].sort((a, b) => b.version - a.version);
  const events = extra?.events ?? [];
  const canRequest = manager && !company && live.status !== "missing" && ["draft", "rejected", "cancelled", "expired"].includes(state);
  const canCancel = manager && !company && ["sent", "viewed", "partially_signed"].includes(state);

  return <><Dialog open onOpenChange={(open) => !open && !busy && !flow && !declining && onClose()}><DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto rounded-none">
    <DialogHeader><DialogTitle>{live.name}</DialogTitle><DialogDescription>{live.category} · v{live.version} · {live.employeeName}{live.employeeId !== "company" && ` (${live.employeeId.toUpperCase()})`}</DialogDescription></DialogHeader>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Status", <Status key="s" document={live} />], ["Visibility", visibilityLabels[live.visibility]], ["Issued", date(live.issuedAt)], ["Expires", live.expiresAt ? date(live.expiresAt) : "No expiry"]].map(([label, value]) => <div key={String(label)} className="border border-border p-3"><p className="text-[11px] text-muted-foreground">{label}</p><div className="mt-1 text-sm font-medium">{value}</div></div>)}</div>
    {live.status === "missing" ? <div className="border border-dashed border-border p-8 text-center"><FileText className="mx-auto mb-3 size-7 text-muted-foreground" /><p className="text-sm font-medium">This document has not been uploaded</p>{(manager || live.employeeId === actorId) && <Button className="mt-4" onClick={onUpload}><Upload className="mr-2 size-4" />Upload document</Button>}</div> : <>
      <section aria-label="Document" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{extra?.fileName ? `${extra.fileName}${extra.size ? ` · ${(extra.size / 1024).toFixed(0)} KB` : ""}` : "Document"}{source.kind === "blocks" ? ` · about ${readingMinutes(source.text)} min read` : ""}</p><div className="flex gap-2">{source.kind === "blocks" && <ReadFullButton onClick={() => setReading(true)} />}{source.kind !== "file" && <Button size="sm" variant="outline" onClick={download}><Download className="mr-1 size-3.5" />Download</Button>}</div></div>
        <DocumentReader source={source} height="max-h-[40vh]" />
      </section>
      {signers.length > 0 && <section aria-label="Signers"><h3 className="mb-2 text-sm font-semibold">Signature progress</h3><ul className="divide-y divide-border border border-border">{signers.map((item) => <li key={item.employeeId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"><span>{item.name}</span><span className="flex items-center gap-2 text-xs text-muted-foreground">{item.status === "signed" ? `Signed ${date(item.signedAt)}${item.signature ? ` · ${item.signature.method === "drawn" ? "drawn" : "typed"}` : ""}` : item.status === "rejected" ? `Declined${item.rejectedReason ? `: ${item.rejectedReason}` : ""}` : item.status === "viewed" ? "Viewed" : "Waiting"}{item.signature && <Button size="sm" variant="ghost" onClick={() => setCertificate(item)}>View signature</Button>}</span></li>)}</ul><p className="mt-2 text-xs text-muted-foreground">These signatures are recorded in Janus and are not Aadhaar or DSC e-signatures.</p></section>}
      {canRequest && <section aria-label="Request signature" className="space-y-2 border border-border p-4"><h3 className="text-sm font-semibold">Request signature</h3><p className="text-xs text-muted-foreground">The employee is always a signer. Add anyone else who must countersign.</p><Field label="Additional signers"><select multiple className={`${inputClass} h-24`} value={extraSigners} onChange={(event) => setExtraSigners(Array.from(event.target.selectedOptions, (option) => option.value))}>{employees.filter((item) => item.id !== live.employeeId && item.status !== "archived").map((item) => <option key={item.id} value={item.id}>{item.name} · {item.title}</option>)}</select></Field><Button onClick={sendForSignature} disabled={busy}><FileSignature className="mr-2 size-4" />Send for signature</Button></section>}
      {company && <section aria-label="Acknowledgement" className="space-y-3">
        {actor && (acknowledgedAt ? <div className="flex flex-wrap items-center justify-between gap-2 border border-success/30 bg-success-muted p-4 text-sm text-success"><span className="flex items-center gap-2"><CheckCheck className="size-4" />You acknowledged this version on {date(acknowledgedAt)}.</span></div> : <div className="flex flex-wrap items-center justify-between gap-3 border border-accent p-4"><p className="text-sm">Please read this policy to the end, then confirm you have understood it.</p><Button onClick={() => setFlow("acknowledge")}>Read &amp; acknowledge</Button></div>)}
        {manager && <div className="border border-border p-4"><p className="text-sm font-medium">{acknowledgedBy.length} of {employees.filter((item) => item.status !== "archived").length} people have acknowledged this version</p><ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">{employees.filter((item) => item.status !== "archived").map((item) => { const at = acknowledgements[`${live.id}:${live.version}:${item.id}`]; return <li key={item.id} className="flex justify-between gap-2"><span>{item.name}</span><span className={at ? "text-success" : ""}>{at ? date(at) : "Not yet"}</span></li>; })}</ul></div>}
      </section>}
      {mySigner && !company && <div className="flex flex-wrap items-center justify-between gap-3 border border-accent p-4"><p className="text-sm">Your signature is requested on this document.</p><div className="flex gap-2"><Button variant="outline" onClick={() => setDeclining(true)}>Decline</Button><Button onClick={() => setFlow("sign")}><FileSignature className="mr-2 size-4" />Review &amp; sign</Button></div></div>}
      <section aria-label="Version history"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><History className="size-4" />History</h3>
        <ul className="divide-y divide-border border border-border text-sm">{events.map((item) => <li key={item.id} className="px-4 py-2"><p>{item.event} <span className="text-xs text-muted-foreground">· v{item.version}</span></p><p className="text-xs text-muted-foreground">{item.actor} · {date(item.at)}{item.detail ? ` · ${item.detail}` : ""}</p></li>)}{history.map((item) => <li key={`v${item.version}`} className="px-4 py-2 text-muted-foreground"><p>Earlier version v{item.version}{item.fileName ? ` · ${item.fileName}` : ""}</p><p className="text-xs">Saved by {item.savedBy} · {date(item.savedAt)}</p></li>)}{!events.length && !history.length && <li className="px-4 py-3 text-xs text-muted-foreground">No activity recorded yet.</li>}</ul></section>
    </>}
    <DialogFooter className="gap-2">{manager && live.status !== "archived" && <Button variant="outline" onClick={archive}>Archive</Button>}{canCancel && <Button variant="outline" onClick={cancelRequest}>Cancel request</Button>}{live.status !== "missing" && (manager || (!company && live.employeeId === actorId)) && <Button variant="outline" onClick={onUpload}><Upload className="mr-2 size-4" />New version</Button>}<Button onClick={onClose}>Close</Button></DialogFooter>
  </DialogContent></Dialog>
  {flow && actor && <SignDialog mode={flow} document={live} source={source} signerName={actor.name} onComplete={completeSigning} onClose={() => setFlow(null)} />}
  {declining && <DeclineDialog title={live.name} onSubmit={decline} onClose={() => setDeclining(false)} />}
  {reading && <FullReadDialog title={live.name} subtitle={`${live.category} · v${live.version}`} source={source} onClose={() => setReading(false)} />}
  {certificate?.signature && <Dialog open onOpenChange={(open) => !open && setCertificate(null)}><DialogContent className="max-w-2xl rounded-none"><DialogHeader><DialogTitle>Signature certificate</DialogTitle><DialogDescription>{live.name} · v{live.version}</DialogDescription></DialogHeader><SignatureSummary document={live} signerName={certificate.name} record={certificate.signature} /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => downloadHrFile(`signature-certificate-${certificate.signature!.reference}.txt`, certificateText(live, certificate.name, certificate.signature!))}><Download className="mr-1 size-3.5" />Download certificate</Button><Button onClick={() => setCertificate(null)}>Close</Button></div></DialogContent></Dialog>}</>;
}
