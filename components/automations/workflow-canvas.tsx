"use client";

import * as React from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type NodeTypes,
  type DefaultEdgeOptions,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkflowNodeData } from "@/lib/types";
import { WorkflowNode, nodeKindMeta, type WorkflowFlowNode, type WorkflowFlowNodeData } from "./workflow-node";

const nodeTypes: NodeTypes = { workflowNode: WorkflowNode };

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: "smoothstep",
  style: { stroke: "rgba(10,20,36,0.25)", strokeWidth: 1.5 },
  labelStyle: { fill: "#647085", fontSize: 10, fontWeight: 500 },
  labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
  labelBgPadding: [4, 2],
  labelBgBorderRadius: 4,
  markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(10,20,36,0.35)", width: 14, height: 14 },
};

function toFlowNode(n: WorkflowNodeData): WorkflowFlowNode {
  return {
    id: n.id,
    type: "workflowNode",
    position: { x: n.x, y: n.y },
    data: { kind: n.kind, label: n.label, detail: n.detail },
  };
}

/**
 * Turns the automation's flat, ordered `nodes` array into React Flow nodes + edges.
 * Nodes connect in array order (node[i] -> node[i+1]) UNLESS a node carries
 * `branchLabels`, in which case it fans out to the NEXT TWO array entries
 * (its two branch children) instead of a single successor. Each branch child
 * becomes the new "tail" of its own x-column so any later node sharing that
 * x-coordinate continues the correct branch.
 */
function buildWorkflowGraph(nodes: WorkflowNodeData[]): { nodes: WorkflowFlowNode[]; edges: Edge[] } {
  const edges: Edge[] = [];
  const columnTail = new Map<number, string>();
  const consumedAsBranchChild = new Set<number>();

  function connect(sourceId: string, targetId: string, label?: string) {
    edges.push({ id: `e-${sourceId}-${targetId}`, source: sourceId, target: targetId, label });
  }

  nodes.forEach((node, i) => {
    if (i === 0) {
      columnTail.set(node.x, node.id);
      return;
    }
    if (!consumedAsBranchChild.has(i)) {
      const parentId = columnTail.get(node.x) ?? nodes[i - 1].id;
      connect(parentId, node.id);
    }
    columnTail.set(node.x, node.id);

    if (node.branchLabels && node.branchLabels.length >= 2 && i + 2 < nodes.length) {
      const [firstLabel, secondLabel] = node.branchLabels;
      const firstChild = nodes[i + 1];
      const secondChild = nodes[i + 2];
      connect(node.id, firstChild.id, firstLabel);
      connect(node.id, secondChild.id, secondLabel);
      columnTail.set(firstChild.x, firstChild.id);
      columnTail.set(secondChild.x, secondChild.id);
      consumedAsBranchChild.add(i + 1);
      consumedAsBranchChild.add(i + 2);
    }
  });

  return { nodes: nodes.map(toFlowNode), edges };
}

function minimapNodeColor(node: { data: unknown }): string {
  const data = node.data as WorkflowFlowNodeData;
  return nodeKindMeta[data.kind]?.dot ?? "#647085";
}

export function WorkflowCanvas({ automationId, workflowNodes }: { automationId: string; workflowNodes: WorkflowNodeData[] }) {
  const initialGraph = React.useMemo(() => buildWorkflowGraph(workflowNodes), [workflowNodes]);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialGraph.edges);
  const addedCountRef = React.useRef(0);
  const rfInstanceRef = React.useRef<ReactFlowInstance<WorkflowFlowNode, Edge> | null>(null);

  React.useEffect(() => {
    const graph = buildWorkflowGraph(workflowNodes);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    addedCountRef.current = 0;
    // Reset the canvas whenever the underlying automation changes (navigating between detail pages).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automationId]);

  const onConnect = React.useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  function handleAddNode() {
    addedCountRef.current += 1;
    const lastNode = nodes[nodes.length - 1];
    const newNode: WorkflowFlowNode = {
      id: `cosmetic-${automationId}-${addedCountRef.current}`,
      type: "workflowNode",
      position: { x: lastNode?.position.x ?? 260, y: (lastNode?.position.y ?? 40) + 140 },
      data: { kind: "action", label: "New Action", detail: "Configure this step" },
    };
    setNodes((nds) => [...nds, newNode]);
    toast.success("Node added — connect it to complete the flow.");
    requestAnimationFrame(() => {
      rfInstanceRef.current?.fitView({ padding: 0.25, duration: 300 });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Workflow</p>
        <Button variant="outline" size="sm" className="text-muted-foreground hover:text-foreground" onClick={handleAddNode}>
          <Plus className="size-3.5" />
          Add node
        </Button>
      </div>
      <div className="h-[520px] w-full overflow-hidden rounded-lg border border-border bg-surface-2">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(instance) => {
            rfInstanceRef.current = instance;
          }}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          colorMode="light"
          nodesDraggable
          edgesFocusable={false}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="rgba(10,20,36,0.12)" />
          <Controls
            showInteractive={false}
            className="!border !border-border !bg-surface !shadow-lg [&_button]:!border-border [&_button]:!bg-surface [&_button]:!fill-foreground [&_button:hover]:!bg-surface-3"
          />
          <MiniMap
            nodeColor={minimapNodeColor}
            maskColor="rgba(255,255,255,0.75)"
            className="!border !border-border !bg-surface"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
