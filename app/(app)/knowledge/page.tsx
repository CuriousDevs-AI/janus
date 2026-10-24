"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Link2, MessageSquarePlus, Upload, Database, Sparkles } from "lucide-react";
import { useAppStore } from "@/lib/stores/app-store";
import { agents } from "@/lib/mock-data";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatRelativeTime } from "@/lib/utils";
import { knowledgeStatusMeta, knowledgeCategoryMeta, knowledgeTypeMeta } from "@/components/knowledge/knowledge-meta";
import type { KnowledgeDocument } from "@/lib/types";

const categoryOptions: { value: "all" | KnowledgeDocument["category"]; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "product", label: knowledgeCategoryMeta.product },
  { value: "pricing", label: knowledgeCategoryMeta.pricing },
  { value: "policy", label: knowledgeCategoryMeta.policy },
  { value: "faq", label: knowledgeCategoryMeta.faq },
  { value: "support", label: knowledgeCategoryMeta.support },
];

export default function KnowledgePage() {
  const knowledgeDocuments = useAppStore((s) => s.knowledgeDocuments);
  const addKnowledgeDocument = useAppStore((s) => s.addKnowledgeDocument);

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [urlOpen, setUrlOpen] = React.useState(false);
  const [faqOpen, setFaqOpen] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);

  const rows = knowledgeDocuments
    .filter((d) => category === "all" || d.category === category)
    .filter((d) => !query || d.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const hasAnyDocuments = knowledgeDocuments.length > 0;

  function agentNames(ids: string[]) {
    return ids.map((agentId) => agents.find((a) => a.id === agentId)?.name).filter((n): n is string => Boolean(n));
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <PageHeader
        title="Knowledge"
        description={`${rows.length} of ${knowledgeDocuments.length} documents`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setUrlOpen(true)}>
              <Link2 className="size-3.5" />
              Add URL
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setFaqOpen(true)}>
              <MessageSquarePlus className="size-3.5" />
              Create FAQ
            </Button>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="size-3.5" />
              Upload
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 pb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search documents…" className="w-64" />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState
            icon={Database}
            title={hasAnyDocuments ? "No documents match your filters" : "Your AI needs knowledge"}
            description={
              hasAnyDocuments
                ? "Try a different search term or category."
                : "Upload your first document so agents can ground their answers."
            }
            action={
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="size-3.5" />
                Upload
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 px-6 py-6 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((doc) => {
            const TypeIcon = knowledgeTypeMeta[doc.type].icon;
            const statusMeta = knowledgeStatusMeta[doc.status];
            const usedBy = agentNames(doc.usedByAgentIds);
            return (
              <Link
                key={doc.id}
                href={`/knowledge/${doc.id}`}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
                      <TypeIcon className="size-3.5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">{doc.title}</p>
                      <p className="text-[11px] text-muted-foreground">{knowledgeCategoryMeta[doc.category]}</p>
                    </div>
                  </div>
                  <Badge variant={statusMeta.tone} className="shrink-0">
                    {statusMeta.label}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="text-mono">v{doc.version}</span>
                  <span>{doc.chunkCount} chunks</span>
                  <span>{formatRelativeTime(doc.updatedAt)}</span>
                </div>

                <p className="line-clamp-2 text-[12px] text-muted-foreground">{doc.excerpt}</p>

                <div className="mt-auto flex items-center gap-1.5 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
                  <Sparkles className="size-3 shrink-0 text-accent" />
                  {usedBy.length > 0 ? (
                    <span className="truncate">Used by: {usedBy.join(", ")}</span>
                  ) : (
                    <span>Not used by any agent</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <AddUrlDialog
        open={urlOpen}
        onOpenChange={setUrlOpen}
        onSubmit={(url) => {
          addKnowledgeDocument({ title: url, type: "url", category: "product" });
          toast.success("URL queued for indexing");
          setUrlOpen(false);
        }}
      />

      <CreateFaqDialog
        open={faqOpen}
        onOpenChange={setFaqOpen}
        onSubmit={(question, answer) => {
          addKnowledgeDocument({
            title: question,
            type: "faq",
            category: "faq",
            excerpt: `Q: ${question} A: ${answer}`,
          });
          toast.success("FAQ added to knowledge base");
          setFaqOpen(false);
        }}
      />

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSubmit={(title, docCategory) => {
          addKnowledgeDocument({ title, category: docCategory });
          toast.success("Processing — chunks will be available shortly");
          setUploadOpen(false);
        }}
      />
    </div>
  );
}

function AddUrlDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = React.useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setUrl("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add URL source</DialogTitle>
          <DialogDescription>Janus will crawl and index this page for retrieval.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!url.trim()) return;
            onSubmit(url.trim());
            setUrl("");
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kb-url">URL</Label>
            <Input
              id="kb-url"
              placeholder="https://docs.example.com/guide"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!url.trim()}>
              <Plus className="size-3.5" />
              Add URL
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateFaqDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (question: string, answer: string) => void;
}) {
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const valid = question.trim().length > 0 && answer.trim().length > 0;

  function reset() {
    setQuestion("");
    setAnswer("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create FAQ</DialogTitle>
          <DialogDescription>Add a question and answer pair to the knowledge base.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSubmit(question.trim(), answer.trim());
            reset();
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kb-faq-question">Question</Label>
            <Textarea
              id="kb-faq-question"
              placeholder="e.g. Do you support multi-region data residency?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="min-h-12"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kb-faq-answer">Answer</Label>
            <Textarea
              id="kb-faq-answer"
              placeholder="e.g. Yes — US, EU and IN regions are available on Enterprise."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              <Plus className="size-3.5" />
              Create FAQ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (title: string, category: KnowledgeDocument["category"]) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [docCategory, setDocCategory] = React.useState<KnowledgeDocument["category"]>("product");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setTitle("");
    setDocCategory("product");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setTitle(file.name);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>PDF, DOCX or text files are chunked and embedded automatically.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            onSubmit(title.trim(), docCategory);
            reset();
          }}
          className="flex flex-col gap-3"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-surface-2 px-4 py-6 text-center transition-colors hover:border-accent-border hover:bg-accent-muted/40"
          >
            <Upload className="size-4 text-muted-foreground" />
            <span className="text-[12px] text-muted-foreground">
              {title ? title : "Click to choose a file, or drag it here"}
            </span>
            <span className="text-[11px] text-muted-foreground/70">PDF, DOCX, TXT up to 25MB</span>
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kb-filename">File name</Label>
            <Input
              id="kb-filename"
              placeholder="e.g. Onboarding Playbook.pdf"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select value={docCategory} onValueChange={(v) => setDocCategory(v as KnowledgeDocument["category"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(knowledgeCategoryMeta).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              <Upload className="size-3.5" />
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
