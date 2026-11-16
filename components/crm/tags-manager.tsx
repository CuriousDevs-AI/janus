"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { api, message } from "@/lib/api/client";
import type { CrmTag } from "@/lib/api/types";
import { useApi } from "@/lib/api/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const TAG_COLORS = ["#6b7280", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];

export function TagsManager({
  entityType,
  entityId,
  tags,
  onChanged,
}: {
  entityType: "leads" | "contacts";
  entityId: string;
  tags: CrmTag[];
  onChanged?: () => void;
}) {
  const allTags = useApi<CrmTag[]>("/tags");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");
  const [busy, setBusy] = useState(false);

  const tagIds = new Set(tags.map((t) => t.id));
  const available = (allTags.data ?? []).filter((t) => !tagIds.has(t.id));

  async function addTag(tagId: string) {
    setBusy(true);
    try {
      await api(`/${entityType}/${entityId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tagId }),
      });
      onChanged?.();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeTag(tagId: string) {
    try {
      await api(`/${entityType}/${entityId}/tags/${tagId}`, { method: "DELETE" });
      onChanged?.();
    } catch (e) {
      toast.error(message(e));
    }
  }

  async function createTag() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const tag = await api<CrmTag>("/tags", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      allTags.reload();
      await addTag(tag.id);
      setNewName("");
      setCreating(false);
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className="gap-1 pl-2 pr-1"
          style={{ borderColor: tag.color, color: tag.color }}
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
          {tag.name}
          <button onClick={() => removeTag(tag.id)} className="ml-0.5 rounded hover:bg-surface-2 p-0.5">
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs">
            <Plus className="size-3" /> Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          {available.length > 0 && (
            <div className="space-y-1 mb-2">
              {available.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => addTag(tag.id)}
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-2"
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              ))}
            </div>
          )}
          {creating ? (
            <div className="space-y-2 border-t border-border pt-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tag name"
                className="h-7 text-xs"
              />
              <div className="flex gap-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className="size-5 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: c === newColor ? "white" : "transparent" }}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-xs flex-1" onClick={createTag} disabled={busy}>
                  Create
                </Button>
                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded border-t border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-surface-2"
            >
              <Plus className="size-3" /> Create new tag
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
