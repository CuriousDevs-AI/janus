import { useState } from "react";
import { ChevronUp, ChevronDown as ChevronDownIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Deal } from "@/lib/api/types";
import { usePipelineConfig, AVAILABLE_COLORS, toSlug, DEFAULT_STAGES, type PipelineStage } from "@/lib/hooks/use-pipeline-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function StageSettingsDialog({ open, onOpenChange, pipeline, allDeals }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  pipeline: ReturnType<typeof usePipelineConfig>; allDeals: Deal[];
}) {
  const [draft, setDraft] = useState<PipelineStage[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(AVAILABLE_COLORS[0]);
  const [newProb, setNewProb] = useState(50);

  const stages = draft.length ? draft : pipeline.stages;

  function openDialog() {
    setDraft([...pipeline.stages]);
  }

  function moveStage(idx: number, dir: -1 | 1) {
    const list = [...stages];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    if (list[idx].key === "won" || list[idx].key === "lost") return;
    if (list[target].key === "won" || list[target].key === "lost") return;
    [list[idx], list[target]] = [list[target], list[idx]];
    setDraft(list);
  }

  function removeStage(key: string) {
    if (key === "won" || key === "lost" || key === "new") { toast.error("Cannot remove this stage"); return; }
    const count = allDeals.filter((d) => d.stage === key).length;
    if (count > 0) { toast.error(`${count} deal${count !== 1 ? "s" : ""} still in this stage — move them first`); return; }
    setDraft(stages.filter((s) => s.key !== key));
  }

  function addStage() {
    if (!newLabel.trim()) { toast.error("Enter a stage name"); return; }
    const key = toSlug(newLabel);
    if (stages.some((s) => s.key === key)) { toast.error("Stage already exists"); return; }
    const wonIdx = stages.findIndex((s) => s.key === "won");
    const list = [...stages];
    list.splice(wonIdx >= 0 ? wonIdx : list.length, 0, { key, label: newLabel.trim(), color: newColor, probability: newProb });
    setDraft(list);
    setNewLabel("");
    setNewProb(50);
    setAddOpen(false);
  }

  function updateStage(key: string, patch: Partial<PipelineStage>) {
    setDraft(stages.map((s) => s.key === key ? { ...s, ...patch } : s));
  }

  async function save() {
    await pipeline.save(stages);
    onOpenChange(false);
    setDraft([]);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) openDialog(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pipeline Stages</DialogTitle>
          <DialogDescription>Add, remove, rename, reorder and color your deal stages. Changes apply to everyone.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {stages.map((stage, idx) => {
            const count = allDeals.filter((d) => d.stage === stage.key).length;
            const isFixed = stage.key === "won" || stage.key === "lost";
            return (
              <div key={stage.key} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <button type="button" disabled={idx === 0 || isFixed} onClick={() => moveStage(idx, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-20"><ChevronUp className="size-3" /></button>
                  <button type="button" disabled={idx === stages.length - 1 || isFixed} onClick={() => moveStage(idx, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-20"><ChevronDownIcon className="size-3" /></button>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={cn("size-5 rounded-full shrink-0 ring-2 ring-transparent hover:ring-accent transition-all", stage.color)} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="grid grid-cols-6 gap-1 p-2">
                    {AVAILABLE_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => updateStage(stage.key, { color: c })} className={cn("size-6 rounded-full transition-all", c, c === stage.color && "ring-2 ring-accent ring-offset-1")} />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex-1 min-w-0">
                  {isFixed ? (
                    <span className="text-sm font-medium">{stage.label}</span>
                  ) : (
                    <Input value={stage.label} onChange={(e) => updateStage(stage.key, { label: e.target.value })} className="h-7 text-sm font-medium border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0" />
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{stage.key}</span>
                    <span className="text-[10px] text-muted-foreground">· {count} deal{count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                {!isFixed && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Input type="number" min={0} max={100} value={stage.probability} onChange={(e) => updateStage(stage.key, { probability: Number(e.target.value) })} className="h-7 w-14 text-xs text-center" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                )}
                {!isFixed && stage.key !== "new" && (
                  <Button variant="ghost" size="sm" className="size-7 p-0 shrink-0" onClick={() => removeStage(stage.key)}><Trash2 className="size-3.5 text-danger" /></Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Add stage */}
        {addOpen ? (
          <div className="rounded-lg border border-accent/30 bg-accent-muted/20 p-3 space-y-3">
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <div>
                <Label className="text-xs">Stage Name</Label>
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Discovery" className="h-8" autoFocus />
              </div>
              <div>
                <Label className="text-xs">Probability</Label>
                <div className="flex items-center gap-1">
                  <Input type="number" min={0} max={100} value={newProb} onChange={(e) => setNewProb(Number(e.target.value))} className="h-8 text-xs" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Color</Label>
              <div className="flex gap-1.5 mt-1">
                {AVAILABLE_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setNewColor(c)} className={cn("size-6 rounded-full transition-all", c, c === newColor && "ring-2 ring-accent ring-offset-1")} />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={addStage}>Add Stage</Button>
              <Button size="sm" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} className="w-full"><Plus className="size-3.5" /> Add Stage</Button>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { setDraft(DEFAULT_STAGES); }}>Reset to Default</Button>
          <Button variant="outline" onClick={() => { onOpenChange(false); setDraft([]); }}>Cancel</Button>
          <Button onClick={save} disabled={pipeline.saving}>{pipeline.saving ? "Saving…" : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
