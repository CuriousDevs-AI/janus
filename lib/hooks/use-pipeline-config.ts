"use client";

import { useState, useCallback, useMemo } from "react";
import { useApi } from "@/lib/api/use-api";
import { api, message } from "@/lib/api/client";
import { toast } from "sonner";

export interface PipelineStage {
  key: string;
  label: string;
  color: string;
  probability: number;
}

export interface PipelineConfig {
  stages: PipelineStage[];
}

const STAGE_COLORS = [
  "bg-slate-500", "bg-blue-500", "bg-cyan-500", "bg-indigo-500",
  "bg-amber-500", "bg-orange-500", "bg-purple-500", "bg-pink-500",
  "bg-teal-500", "bg-lime-500", "bg-fuchsia-500", "bg-sky-500",
];

const BAR_COLORS: Record<string, string> = {
  "bg-slate-500": "bg-slate-400", "bg-blue-500": "bg-blue-400",
  "bg-cyan-500": "bg-cyan-400", "bg-indigo-500": "bg-indigo-400",
  "bg-amber-500": "bg-amber-400", "bg-orange-500": "bg-orange-400",
  "bg-purple-500": "bg-purple-400", "bg-pink-500": "bg-pink-400",
  "bg-teal-500": "bg-teal-400", "bg-lime-500": "bg-lime-400",
  "bg-fuchsia-500": "bg-fuchsia-400", "bg-sky-500": "bg-sky-400",
  "bg-emerald-500": "bg-emerald-400", "bg-red-500": "bg-red-400",
};

export const DEFAULT_STAGES: PipelineStage[] = [
  { key: "new",         label: "New",         color: "bg-slate-500",   probability: 10 },
  { key: "qualified",   label: "Qualified",   color: "bg-cyan-500",    probability: 20 },
  { key: "demo",        label: "Demo",        color: "bg-indigo-500",  probability: 40 },
  { key: "proposal",    label: "Proposal",    color: "bg-amber-500",   probability: 60 },
  { key: "negotiation", label: "Negotiation", color: "bg-orange-500",  probability: 75 },
  { key: "approval",    label: "Approval",    color: "bg-purple-500",  probability: 90 },
  { key: "won",         label: "Won",         color: "bg-emerald-500", probability: 100 },
  { key: "lost",        label: "Lost",        color: "bg-red-500",     probability: 0 },
];

export function barColor(stageColor: string) {
  return BAR_COLORS[stageColor] ?? stageColor.replace("-500", "-400");
}

export const AVAILABLE_COLORS = STAGE_COLORS;

interface StoreData {
  store_key: string;
  version: number;
  data: PipelineConfig | null;
}

export function usePipelineConfig() {
  const store = useApi<StoreData>("/workspace-state/janus.pipeline.v1");
  const [saving, setSaving] = useState(false);

  const config: PipelineConfig = useMemo(() => {
    if (store.data?.data?.stages?.length) return store.data.data;
    return { stages: DEFAULT_STAGES };
  }, [store.data]);

  const version = store.data?.version ?? 0;

  const stages = config.stages;
  const openStages = stages.filter((s) => s.key !== "won" && s.key !== "lost");
  const stageMap = useMemo(() => new Map(stages.map((s) => [s.key, s])), [stages]);

  const save = useCallback(async (newStages: PipelineStage[]) => {
    setSaving(true);
    try {
      await api("/workspace-state/janus.pipeline.v1", {
        method: "PUT",
        body: JSON.stringify({ data: { stages: newStages }, expected_version: version }),
      });
      toast.success("Pipeline stages saved");
      store.reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setSaving(false);
    }
  }, [version, store]);

  return { stages, openStages, stageMap, config, save, saving, loading: !store.data && !store.error, reload: store.reload };
}

export function toSlug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "stage";
}
