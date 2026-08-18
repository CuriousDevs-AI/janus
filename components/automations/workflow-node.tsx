"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Zap, GitBranch, Sparkles, CheckCircle, Clock, Share2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowNodeKind } from "@/lib/types";

export type WorkflowFlowNodeData = {
  kind: WorkflowNodeKind;
  label: string;
  detail?: string;
};

export type WorkflowFlowNode = Node<WorkflowFlowNodeData, "workflowNode">;

export const nodeKindMeta: Record<
  WorkflowNodeKind,
  { icon: LucideIcon; label: string; text: string; border: string; dot: string }
> = {
  trigger: { icon: Zap, label: "Trigger", text: "text-accent", border: "border-l-accent", dot: "#2563EB" },
  condition: { icon: GitBranch, label: "Condition", text: "text-info", border: "border-l-info", dot: "#7C3AED" },
  ai_decision: { icon: Sparkles, label: "AI Decision", text: "text-accent", border: "border-l-accent", dot: "#2563EB" },
  action: { icon: CheckCircle, label: "Action", text: "text-success", border: "border-l-success", dot: "#16A34A" },
  wait: { icon: Clock, label: "Wait", text: "text-warning", border: "border-l-warning", dot: "#D97706" },
  branch: { icon: Share2, label: "Branch", text: "text-muted-foreground", border: "border-l-border-strong", dot: "#647085" },
};

export function WorkflowNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const meta = nodeKindMeta[data.kind];
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        "w-[168px] rounded-md border border-border border-l-2 bg-surface-2 px-2.5 py-2 shadow-sm transition-colors",
        meta.border,
        selected && "border-accent-border ring-2 ring-ring"
      )}
    >
      <Handle type="target" position={Position.Top} className="!size-2 !border-none !bg-border-strong" />
      <div className={cn("flex items-center gap-1.5", meta.text)}>
        <Icon className="size-3 shrink-0" />
        <span className="text-[9.5px] font-semibold uppercase tracking-wide">{meta.label}</span>
      </div>
      <p className="mt-1 text-[11.5px] font-medium leading-snug text-foreground">{data.label}</p>
      {data.detail && <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{data.detail}</p>}
      <Handle type="source" position={Position.Bottom} className="!size-2 !border-none !bg-border-strong" />
    </div>
  );
}
