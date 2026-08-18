"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUpFromLine, CheckCircle2, RotateCcw, Bot, Layers, Sparkles } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { agents } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatDate, formatRelativeTime, formatNumber, cn } from "@/lib/utils";
import { knowledgeStatusMeta, knowledgeCategoryMeta, knowledgeTypeMeta } from "@/components/knowledge/knowledge-meta";
import type { KnowledgeDocument } from "@/lib/types";

export default function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const doc = useAppStore((s) => s.knowledgeDocuments.find((d) => d.id === id));

  const [versionOverride, setVersionOverride] = React.useState<number | null>(null);
  const [statusOverride, setStatusOverride] = React.useState<KnowledgeDocument["status"] | null>(null);
  const [rollbackOpen, setRollbackOpen] = React.useState(false);

  if (!doc) {
    return (
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-foreground">Document not found</p>
        <Button size="sm" variant="secondary" asChild>
          <Link href="/knowledge">Back to knowledge</Link>
        </Button>
      </div>
    );
  }

  const version = versionOverride ?? doc.version;
  const status = statusOverride ?? doc.status;
  const statusMeta = knowledgeStatusMeta[status];
  const TypeIcon = knowledgeTypeMeta[doc.type].icon;
  const sortedVersions = [...doc.versions].sort((a, b) => b.version - a.version);
  const usedByAgents = doc.usedByAgentIds
    .map((agentId) => agents.find((a) => a.id === agentId))
    .filter((a): a is (typeof agents)[number] => Boolean(a));
  const chunkPreviews = buildChunkPreviews(doc.excerpt);
  const canPublish = status === "draft" || status === "processing";

  function handleUpdate() {
    setVersionOverride((v) => (v ?? doc!.version) + 1);
    toast.success("New version uploaded — reprocessing");
  }

  function handlePublish() {
    setStatusOverride("published");
    toast.success("Document published");
  }

  function handleRollback(targetVersion: number) {
    setVersionOverride(targetVersion);
    toast.success(`Rolled back to v${targetVersion}`);
    setRollbackOpen(false);
  }

  return (
    <div className="mx-auto flex max-w-[1300px] flex-col gap-5 px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
            <TypeIcon className="size-4.5 text-muted-foreground" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[20px] font-semibold tracking-tight text-foreground">{doc.title}</h1>
              <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
              <Badge variant="outline" className="text-mono">
                v{version}
              </Badge>
            </div>
            <p className="text-[13px] text-muted-foreground">
              {knowledgeTypeMeta[doc.type].label} · {knowledgeCategoryMeta[doc.category]} · {doc.sizeLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleUpdate}>
            <ArrowUpFromLine className="size-3.5" />
            Update
          </Button>
          {canPublish && (
            <Button size="sm" onClick={handlePublish}>
              <CheckCircle2 className="size-3.5" />
              Publish
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setRollbackOpen(true)}>
            <RotateCcw className="size-3.5" />
            Rollback
          </Button>
        </div>
      </div>

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="chunks">Chunks</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
        </TabsList>

        {/* Content */}
        <TabsContent value="content" className="pt-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Content preview
            </p>
            <blockquote className="rounded-md border border-border bg-surface-2 px-4 py-3">
              <p className="text-mono whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted-foreground">
                {doc.excerpt}
              </p>
            </blockquote>
          </div>
        </TabsContent>

        {/* Chunks */}
        <TabsContent value="chunks" className="flex flex-col gap-4 pt-4">
          <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-4 py-3.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Chunks indexed
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-mono text-[22px] font-semibold leading-none text-foreground">
                {formatNumber(doc.chunkCount)}
              </span>
              <span className="text-[11px] text-muted-foreground">used for retrieval-augmented answers</span>
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Layers className="size-3.5" />
              Illustrative preview — {chunkPreviews.length} of {formatNumber(doc.chunkCount)}
            </p>
            <div className="flex flex-col gap-2">
              {chunkPreviews.map((text, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Chunk {i + 1}
                  </p>
                  <p className="text-mono text-[12px] leading-relaxed text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Analytics */}
        <TabsContent value="analytics" className="flex flex-col gap-4 pt-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-4 py-3.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Retrievals (30d)
              </span>
              <span className="text-mono text-[22px] font-semibold leading-none text-foreground">
                {formatNumber(doc.retrievalCount30d)}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-4 py-3.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Used by agents
              </span>
              <span className="text-mono text-[22px] font-semibold leading-none text-foreground">
                {usedByAgents.length}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-4 py-3.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Last updated
              </span>
              <span className="text-mono text-[15px] font-semibold leading-none text-foreground">
                {formatRelativeTime(doc.updatedAt)}
              </span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Agents grounding on this document
            </p>
            <div className="flex flex-col gap-2">
              {usedByAgents.length === 0 && (
                <p className="text-[12px] text-muted-foreground">No agents currently reference this document.</p>
              )}
              {usedByAgents.map((a) => (
                <Link
                  key={a.id}
                  href={`/agents/${a.id}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:border-border-strong hover:bg-surface-2/40"
                >
                  <div className="flex items-center gap-2">
                    <Bot className="size-3.5 text-accent" />
                    <span className="text-[13px] text-foreground">{a.name}</span>
                  </div>
                  <span className="text-[11px] capitalize text-muted-foreground">{a.type}</span>
                </Link>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Versions */}
        <TabsContent value="versions" className="pt-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-col">
              {sortedVersions.map((v, i) => {
                const isCurrent = v.version === version;
                return (
                  <div key={v.version} className="relative flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "z-10 mt-1 size-2.5 shrink-0 rounded-full border",
                          isCurrent ? "border-accent bg-accent" : "border-border-strong bg-surface-3"
                        )}
                      />
                      {i < sortedVersions.length - 1 && <span className="w-px flex-1 bg-border" />}
                    </div>
                    <div className={cn("flex-1 pb-5", i === sortedVersions.length - 1 && "pb-0")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-mono text-[12.5px] font-medium text-foreground">v{v.version}</span>
                        {isCurrent && (
                          <Badge variant="accent" className="gap-1">
                            <Sparkles className="size-3" />
                            Current
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">{formatDate(v.updatedAt)}</span>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-foreground">{v.changeSummary}</p>
                      <p className="text-[11px] text-muted-foreground">by {v.updatedBy}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Rollback dialog */}
      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback version</DialogTitle>
            <DialogDescription>Choose a previous version to restore as current.</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {sortedVersions.map((v) => (
              <button
                key={v.version}
                type="button"
                disabled={v.version === version}
                onClick={() => handleRollback(v.version)}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-accent-border hover:bg-accent-muted/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="min-w-0">
                  <span className="text-mono font-medium text-foreground">v{v.version}</span>
                  <span className="ml-2 truncate text-[12.5px] text-muted-foreground">{v.changeSummary}</span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(v.updatedAt)}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setRollbackOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Splits the document excerpt into a handful of short, illustrative "chunk"
 * previews. This is a mock illustration of RAG chunking, not literal storage
 * detail — real chunk count is doc.chunkCount.
 */
function buildChunkPreviews(excerpt: string, count = 4): string[] {
  const sentences = excerpt
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return [excerpt];
  if (sentences.length <= count) return sentences;

  const perChunk = Math.ceil(sentences.length / count);
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += perChunk) {
    chunks.push(sentences.slice(i, i + perChunk).join(" "));
  }
  return chunks.slice(0, count);
}
