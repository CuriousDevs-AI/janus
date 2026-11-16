"use client";

import { useState } from "react";
import { ClipboardList, Plus, Pencil, Trash2, Copy, Code, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import { can } from "@/lib/permissions";
import type { WebForm } from "@/lib/api/types";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const FORM_FIELDS = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "requirement", label: "Message / Requirement" },
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

export default function WebFormsPage() {
  const session = useSession();
  const canWrite = can(session, "sources:manage");
  const forms = useApi<WebForm[]>("/web-forms");
  const [editing, setEditing] = useState<Partial<WebForm> | null>(null);
  const [embedForm, setEmbedForm] = useState<WebForm | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = forms.data ?? [];

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
    try {
      await api(`/web-forms/${id}`, { method: "DELETE" });
      toast.success("Form deleted");
      forms.reload();
    } catch (e) {
      toast.error(message(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Web Forms"
        description="Embeddable lead capture forms for your website"
        actions={canWrite ? <Button size="sm" onClick={newForm}><Plus className="size-3.5" /> New Form</Button> : undefined}
      />

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
                <TableHead className="text-right">Submissions</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead className="w-28">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">/{f.slug}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="neutral">{f.submissionCount}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.active ? "success" : "neutral"}>{f.active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  {canWrite && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setEmbedForm(f)} title="Embed code">
                          <Code className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setEditing(f)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => remove(f.id)}>
                          <Trash2 className="size-3.5 text-danger" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
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
    </div>
  );
}
