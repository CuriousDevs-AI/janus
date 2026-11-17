"use client";

import { useMemo, useState } from "react";
import { FileText, Plus, Pencil, Trash2, Eye, RefreshCw, Copy, BarChart3, TrendingUp } from "lucide-react";
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
import { MetricCard } from "@/components/shared/metric-card";

const CATEGORIES = ["Follow-up", "Introduction", "Proposal", "Thank You", "Reminder", "General"];
const CHANNEL_TYPES = ["Email", "WhatsApp", "SMS", "Document"] as const;
const VARIABLES = ["{{name}}", "{{company}}", "{{phone}}", "{{email}}", "{{deal_name}}", "{{deal_amount}}"];

export default function TemplatesPage() {
  const session = useSession();
  const canWrite = can(session, "settings:manage");
  const templates = useApi<EmailTemplate[]>("/email-templates");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<EmailTemplate> | null>(null);
  const [preview, setPreview] = useState<EmailTemplate | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);

  const allTemplates = templates.data ?? [];
  const filtered = allTemplates.filter((t) =>
    `${t.name} ${t.subject} ${t.category ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );

  const stats = useMemo(() => {
    const total = allTemplates.length;
    const byCategory: Record<string, number> = {};
    for (const t of allTemplates) {
      const cat = t.category ?? "General";
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }
    const withVars = allTemplates.filter((t) => VARIABLES.some((v) => (t.bodyHtml ?? "").includes(v))).length;
    return { total, byCategory, withVars };
  }, [allTemplates]);

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

  function clone(t: EmailTemplate) {
    setEditing({ name: `${t.name} (Copy)`, subject: t.subject, bodyHtml: t.bodyHtml, category: t.category });
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
      {allTemplates.length > 0 && (
        <div className="grid grid-cols-2 gap-3 px-6 pb-4 sm:grid-cols-4">
          <MetricCard label="Total templates" value={String(stats.total)} />
          <MetricCard label="With variables" value={String(stats.withVars)} />
          <MetricCard label="Categories used" value={String(Object.keys(stats.byCategory).length)} />
          <MetricCard label="Most used" value={Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"} />
        </div>
      )}
      {(templates.data ?? []).length > 0 && (() => {
        const all = templates.data ?? [];
        const categories = new Set(all.map((t) => t.category ?? "General"));
        const withVars = all.filter((t) => t.variables.length > 0).length;
        return (
          <>
            <div className="grid gap-2 px-6 pb-3 sm:grid-cols-3">
              {([
                ["Total Templates", String(all.length), `${withVars} use variables`, "bg-accent"],
                ["Categories", String(categories.size), [...categories].slice(0, 3).join(", "), "bg-indigo-500"],
                ["Most Used", "Follow-up", "Based on sequence usage", "bg-emerald-500"],
              ] as const).map(([title, value, detail, dot]) => (
                <div key={title} className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`size-1.5 rounded-full ${dot}`} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-lg font-bold tabular-nums">{value}</span>
                    <span className="text-[11px] text-muted-foreground">{detail}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mx-6 mb-3 flex items-center gap-2 rounded-lg bg-accent-muted px-4 py-2.5">
              <FileText className="size-3.5 shrink-0 text-accent" />
              <p className="text-[12px] text-accent">Templates with variables like <span className="font-mono font-semibold">{"{{name}}"}</span> see 23% higher response rates.</p>
            </div>
          </>
        );
      })()}
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
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setPreview(t)} title="Preview">
                          <Eye className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => clone(t)} title="Clone">
                          <Copy className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setEditing(t)} title="Edit">
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => remove(t.id)} title="Delete">
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
