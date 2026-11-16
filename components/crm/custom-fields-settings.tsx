"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import type { CustomFieldDef } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const ENTITY_TYPES = ["lead", "contact", "deal"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "multiselect", label: "Multi-select" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
];

export function CustomFieldsSettings() {
  const [entityType, setEntityType] = useState<EntityType>("lead");
  const fields = useApi<CustomFieldDef[]>(`/custom-fields/${entityType}`);
  const [editing, setEditing] = useState<Partial<CustomFieldDef> | null>(null);
  const [options, setOptions] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = fields.data ?? [];

  function startNew() {
    setEditing({ fieldName: "", fieldType: "text", required: false, sortOrder: rows.length });
    setOptions("");
  }

  function startEdit(f: CustomFieldDef) {
    setEditing(f);
    const opts = f.fieldOptions;
    setOptions(Array.isArray(opts) ? opts.join(", ") : "");
  }

  async function save() {
    if (!editing) return;
    if (!editing.fieldName?.trim()) { toast.error("Enter a field name"); return; }
    setBusy(true);
    try {
      const body = {
        entityType,
        fieldName: editing.fieldName.trim(),
        fieldType: editing.fieldType ?? "text",
        fieldOptions: ["select", "multiselect"].includes(editing.fieldType ?? "")
          ? options.split(",").map((o) => o.trim()).filter(Boolean)
          : null,
        required: editing.required ?? false,
        sortOrder: editing.sortOrder ?? 0,
      };
      if (editing.id) {
        await api(`/custom-fields/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast.success("Field updated");
      } else {
        await api("/custom-fields", { method: "POST", body: JSON.stringify(body) });
        toast.success("Field created");
      }
      setEditing(null);
      fields.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/custom-fields/${id}`, { method: "DELETE" });
      toast.success("Field deleted");
      fields.reload();
    } catch (e) {
      toast.error(message(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {ENTITY_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setEntityType(t)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                entityType === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-muted-foreground hover:bg-surface-3",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => fields.reload()}><RefreshCw className="size-3.5" /></Button>
          <Button size="sm" onClick={startNew}><Plus className="size-3.5" /> Add Field</Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No custom fields for {entityType}s yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.fieldName}</TableCell>
                <TableCell><Badge variant="neutral" className="capitalize">{f.fieldType}</Badge></TableCell>
                <TableCell>{f.required ? <Badge variant="accent">Yes</Badge> : "—"}</TableCell>
                <TableCell className="text-xs">{f.sortOrder}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => startEdit(f)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => remove(f.id)}>
                      <Trash2 className="size-3.5 text-danger" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={editing !== null} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Field" : "New Custom Field"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Field Name *</Label><Input value={editing.fieldName ?? ""} onChange={(e) => setEditing({ ...editing, fieldName: e.target.value })} /></div>
              <div>
                <Label>Field Type</Label>
                <Select value={editing.fieldType ?? "text"} onValueChange={(v) => setEditing({ ...editing, fieldType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {["select", "multiselect"].includes(editing.fieldType ?? "") && (
                <div><Label>Options (comma separated)</Label><Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Option 1, Option 2, Option 3" /></div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.required ?? false} onChange={(e) => setEditing({ ...editing, required: e.target.checked })} className="rounded" />
                Required field
              </label>
              <div><Label>Sort Order</Label><Input type="number" value={editing.sortOrder ?? 0} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
