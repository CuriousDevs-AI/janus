"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Plus, Pencil, Trash2, Copy, Code, RefreshCw, Eye, ToggleLeft, ToggleRight, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import { can } from "@/lib/permissions";
import type { WebForm } from "@/lib/api/types";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const FORM_FIELDS = [
  { key: "name", label: "Name", type: "text" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "email", label: "Email", type: "email" },
  { key: "company", label: "Company", type: "text" },
  { key: "requirement", label: "Message / Requirement", type: "textarea" },
];

function EmbedCode({ form }: { form: WebForm }) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const fields = FORM_FIELDS.filter((f) => form.fieldsConfig[f.key]);
  const html = `<form action="${baseUrl}/api/v1/web-forms/${form.slug}/submit" method="POST">
${fields.map((f) => `  <label>${f.label}<input name="${f.key}" ${f.key === "email" ? 'type="email"' : f.key === "phone" ? 'type="tel"' : 'type="text"'} ${["name", "phone"].includes(f.key) ? "required" : ""} /></label>`).join("\n")}
  <button type="submit">Submit</button>
</form>`;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Copy this HTML to embed on your website:</p>
      <pre className="rounded border border-border bg-surface-2 p-3 text-xs font-mono overflow-auto max-h-40 whitespace-pre-wrap">{html}</pre>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => { navigator.clipboard.writeText(html); toast.success("Embed code copied"); }}
      >
        <Copy className="size-3.5" /> Copy
      </Button>
    </div>
  );
}

function FormPreview({ form }: { form: WebForm }) {
  const fields = FORM_FIELDS.filter((f) => form.fieldsConfig[f.key]);
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4 space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Form Preview</h4>
      <div className="space-y-2.5">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-xs font-medium mb-1">{f.label} {["name", "phone"].includes(f.key) && <span className="text-danger">*</span>}</label>
            {f.type === "textarea" ? (
              <div className="h-16 rounded border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">Placeholder text...</div>
            ) : (
              <div className="h-8 rounded border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                {f.type === "email" ? "user@example.com" : f.type === "tel" ? "+91 98765 43210" : `Enter ${f.label.toLowerCase()}...`}
              </div>
            )}
          </div>
        ))}
        <div className="pt-1">
          <div className="inline-flex h-8 items-center rounded bg-accent/20 px-4 text-xs font-medium text-accent">Submit</div>
        </div>
      </div>
    </div>
  );
}

export default function WebFormsPage() {
  const session = useSession();
  const canWrite = can(session, "sources:manage");
  const forms = useApi<WebForm[]>("/web-forms?_=1");
  const [editing, setEditing] = useState<Partial<WebForm> | null>(null);
  const [embedForm, setEmbedForm] = useState<WebForm | null>(null);
  const [previewForm, setPreviewForm] = useState<WebForm | null>(null);
  const [deleting, setDeleting] = useState<WebForm | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = forms.data ?? [];

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((f) => f.active).length;
    const totalSubmissions = rows.reduce((s, f) => s + f.submissionCount, 0);
    const topForm = [...rows].sort((a, b) => b.submissionCount - a.submissionCount)[0];
    return { total, active, totalSubmissions, topForm };
  }, [rows]);

  function newForm() {
    setEditing({
      name: "",
      slug: "",
      fieldsConfig: { name: true, phone: true, email: true, company: false, requirement: true },
      redirectUrl: "",
      notifyEmail: "",
      active: true,
    });
  }

  async function save() {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error("Enter a form name"); return; }
    if (!editing.slug?.trim()) { toast.error("Enter a URL slug"); return; }
    setBusy(true);
    try {
      const body = {
        name: editing.name.trim(),
        slug: editing.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        fieldsConfig: editing.fieldsConfig ?? {},
        redirectUrl: editing.redirectUrl?.trim() || null,
        notifyEmail: editing.notifyEmail?.trim() || null,
        active: editing.active ?? true,
      };
      if (editing.id) {
        await api(`/web-forms/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast.success("Form updated");
      } else {
        await api("/web-forms", { method: "POST", body: JSON.stringify(body) });
        toast.success("Form created");
      }
      setEditing(null);
      forms.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api(`/web-forms/${id}`, { method: "DELETE" });
      toast.success("Form deleted");
      setDeleting(null);
      forms.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(form: WebForm) {
    try {
      await api(`/web-forms/${form.id}`, { method: "PATCH", body: JSON.stringify({ active: !form.active }) });
      toast.success(form.active ? "Form deactivated" : "Form activated");
      forms.reload();
    } catch (e) {
      toast.error(message(e));
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col">
      <PageHeader
        title="Web Forms"
        description="Embeddable lead capture forms for your website"
        actions={canWrite ? <Button size="sm" onClick={newForm}><Plus className="size-3.5" /> New Form</Button> : undefined}
      />

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 px-6 pb-4 sm:grid-cols-4">
          <MetricCard label="Total forms" value={String(stats.total)} />
          <MetricCard label="Active forms" value={String(stats.active)} />
          <MetricCard label="Total submissions" value={String(stats.totalSubmissions)} />
          <MetricCard label="Top form" value={stats.topForm?.name ?? "—"} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="mx-6 mb-3 flex items-center gap-2 rounded-lg bg-accent-muted px-4 py-2.5">
          <ClipboardList className="size-3.5 shrink-0 text-accent" />
          <p className="text-[12px] text-accent">Forms with 3-4 fields convert 2x better than forms with 6+ fields.</p>
        </div>
      )}

      <div className="flex items-center gap-3 px-6 pb-4">
        <Button variant="ghost" size="sm" onClick={() => forms.reload()}><RefreshCw className="size-3.5" /></Button>
      </div>

      <div className="flex-1 overflow-auto px-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No web forms yet"
            description="Create a form to capture leads from your website"
            action={canWrite ? <Button size="sm" onClick={newForm}><Plus className="size-3.5 mr-1" /> Create Form</Button> : undefined}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Fields</TableHead>
                <TableHead className="text-right">Submissions</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead className="w-36">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((f) => {
                const fieldCount = FORM_FIELDS.filter((ff) => f.fieldsConfig[ff.key]).length;
                return (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">/{f.slug}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{fieldCount} field{fieldCount !== 1 ? "s" : ""}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={f.submissionCount > 0 ? "accent" : "neutral"}>{f.submissionCount}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={f.active ? "success" : "neutral"}>{f.active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setPreviewForm(f)} title="Preview">
                            <Eye className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setEmbedForm(f)} title="Embed code">
                            <Code className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => toggleActive(f)} title={f.active ? "Deactivate" : "Activate"}>
                            {f.active ? <ToggleRight className="size-3.5 text-success" /> : <ToggleLeft className="size-3.5" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setEditing(f)} title="Edit">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setDeleting(f)} title="Delete">
                            <Trash2 className="size-3.5 text-danger" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Form" : "New Web Form"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Form Name *</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>URL Slug *</Label><Input value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="e.g. contact-us" /></div>
              <div>
                <Label className="mb-2 block">Form Fields</Label>
                <div className="space-y-1.5">
                  {FORM_FIELDS.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editing.fieldsConfig?.[f.key] ?? false}
                        onChange={(e) => setEditing({ ...editing, fieldsConfig: { ...editing.fieldsConfig, [f.key]: e.target.checked } })}
                        className="rounded"
                      />
                      {f.label}
                      <span className="text-[10px] text-muted-foreground">({f.type})</span>
                    </label>
                  ))}
                </div>
              </div>
              <div><Label>Redirect URL (after submit)</Label><Input value={editing.redirectUrl ?? ""} onChange={(e) => setEditing({ ...editing, redirectUrl: e.target.value })} placeholder="https://yoursite.com/thank-you" /></div>
              <div><Label>Notification Email</Label><Input type="email" value={editing.notifyEmail ?? ""} onChange={(e) => setEditing({ ...editing, notifyEmail: e.target.value })} placeholder="sales@yourcompany.com" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={embedForm !== null} onOpenChange={(v) => { if (!v) setEmbedForm(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Embed Code: {embedForm?.name}</DialogTitle>
          </DialogHeader>
          {embedForm && <EmbedCode form={embedForm} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmbedForm(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewForm !== null} onOpenChange={(v) => { if (!v) setPreviewForm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Preview: {previewForm?.name}</DialogTitle>
          </DialogHeader>
          {previewForm && <FormPreview form={previewForm} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewForm(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-danger">Delete form</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>&quot;{deleting?.name}&quot;</strong>? This will remove the form and all its submission data permanently.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={() => deleting && remove(deleting.id)}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
