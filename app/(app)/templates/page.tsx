"use client";

import { useState } from "react";
import { FileText, Plus, Pencil, Trash2, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/components/auth/session-provider";
import { can } from "@/lib/permissions";
import type { EmailTemplate } from "@/lib/api/types";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CATEGORIES = ["Follow-up", "Introduction", "Proposal", "Thank You", "Reminder", "General"];
const VARIABLES = ["{{name}}", "{{company}}", "{{phone}}", "{{email}}", "{{deal_name}}", "{{deal_amount}}"];

export default function TemplatesPage() {
  const session = useSession();
  const canWrite = can(session, "settings:manage");
  const templates = useApi<EmailTemplate[]>("/email-templates");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<EmailTemplate> | null>(null);
  const [preview, setPreview] = useState<EmailTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = (templates.data ?? []).filter((t) =>
    `${t.name} ${t.subject} ${t.category ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );

  async function save() {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error("Enter a template name"); return; }
    if (!editing.subject?.trim()) { toast.error("Enter a subject"); return; }
    setBusy(true);
    try {
      const body = {
        name: editing.name.trim(),
        subject: editing.subject.trim(),
        bodyHtml: editing.bodyHtml ?? "",
        variables: VARIABLES.filter((v) => (editing.bodyHtml ?? "").includes(v)).map((v) => v.replace(/[{}]/g, "")),
        category: editing.category || null,
      };
      if (editing.id) {
        await api(`/email-templates/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast.success("Template updated");
      } else {
        await api("/email-templates", { method: "POST", body: JSON.stringify(body) });
        toast.success("Template created");
      }
      setEditing(null);
      templates.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/email-templates/${id}`, { method: "DELETE" });
      toast.success("Template deleted");
      templates.reload();
    } catch (e) {
      toast.error(message(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Email Templates"
        description={`${filtered.length} template${filtered.length === 1 ? "" : "s"}`}
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setEditing({ name: "", subject: "", bodyHtml: "", category: "General" })}>
              <Plus className="size-3.5" /> New Template
            </Button>
          ) : undefined
        }
      />
      <div className="flex items-center gap-3 px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search templates..." className="max-w-xs" />
        <Button variant="ghost" size="sm" onClick={() => templates.reload()}><RefreshCw className="size-3.5" /></Button>
      </div>
      <div className="flex-1 overflow-auto px-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No templates yet"
            description="Create email templates with variables like {{name}} for quick follow-ups"
            action={canWrite ? <Button size="sm" onClick={() => setEditing({ name: "", subject: "", bodyHtml: "", category: "General" })}><Plus className="size-3.5 mr-1" /> Create</Button> : undefined}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Modified</TableHead>
                {canWrite && <TableHead className="w-28">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{t.subject}</TableCell>
                  <TableCell><Badge variant="neutral">{t.category ?? "General"}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatRelativeTime(t.updatedAt)}</TableCell>
                  {canWrite && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setPreview(t)}>
                          <Eye className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setEditing(t)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => remove(t.id)}>
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Template" : "New Template"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name *</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div>
                  <Label>Category</Label>
                  <Select value={editing.category ?? "General"} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Subject *</Label><Input value={editing.subject ?? ""} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="e.g. Following up on {{deal_name}}" /></div>
              <div>
                <Label>Body</Label>
                <Textarea value={editing.bodyHtml ?? ""} onChange={(e) => setEditing({ ...editing, bodyHtml: e.target.value })} rows={8} placeholder="Hi {{name}},&#10;&#10;Thanks for your interest in..." />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] text-muted-foreground mr-1">Insert variable:</span>
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-accent hover:bg-surface-3"
                    onClick={() => setEditing({ ...editing, bodyHtml: (editing.bodyHtml ?? "") + v })}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={preview !== null} onOpenChange={(v) => { if (!v) setPreview(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview: {preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="rounded border border-border bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Subject</p>
                <p className="mt-1 text-sm font-medium">{preview.subject}</p>
              </div>
              <div className="rounded border border-border bg-surface-2 p-3 whitespace-pre-wrap text-sm">
                {preview.bodyHtml}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
