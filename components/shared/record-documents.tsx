"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  FileText, Link2, Plus, ExternalLink, Paperclip, Trash2, Upload, Eye,
  FileSpreadsheet, FileCheck, ScrollText, Presentation, ChevronDown,
  File, Image, FileArchive,
} from "lucide-react";
import { api, message } from "@/lib/api/client";
import type { CrmAttachment } from "@/lib/api/types";
import { useApi } from "@/lib/api/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatRelativeTime } from "@/lib/utils";
import { DOCUMENT_KINDS, type DocumentKind, type RecordKind, documentsFor, useRecordDocumentsStore } from "@/lib/stores/record-documents-store";

const KIND_ICON: Record<string, typeof FileText> = {
  Proposal: Presentation,
  Contract: ScrollText,
  Agreement: FileCheck,
  "Invoice copy": FileSpreadsheet,
  Receipt: FileSpreadsheet,
  "PO / Work order": FileText,
  NDA: ScrollText,
  "Meeting notes": FileText,
  Specification: FileText,
  Report: FileText,
};

const KIND_COLOR: Record<string, string> = {
  Proposal: "bg-blue-50 dark:bg-blue-950 text-blue-500",
  Contract: "bg-violet-50 dark:bg-violet-950 text-violet-500",
  Agreement: "bg-emerald-50 dark:bg-emerald-950 text-emerald-500",
  "Invoice copy": "bg-amber-50 dark:bg-amber-950 text-amber-500",
  Receipt: "bg-amber-50 dark:bg-amber-950 text-amber-500",
  "PO / Work order": "bg-cyan-50 dark:bg-cyan-950 text-cyan-500",
  NDA: "bg-red-50 dark:bg-red-950 text-red-500",
  "Meeting notes": "bg-slate-50 dark:bg-slate-950 text-slate-500",
};

function fileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return Image;
  if (contentType.includes("pdf")) return FileText;
  if (contentType.includes("zip") || contentType.includes("archive")) return FileArchive;
  if (contentType.includes("sheet") || contentType.includes("csv") || contentType.includes("excel")) return FileSpreadsheet;
  return File;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilePreview({ file }: { file: CrmAttachment }) {
  const url = `/api/backend/attachments/${file.id}/file`;
  if (file.contentType.startsWith("image/")) {
    return <img src={url} alt={file.filename} className="max-h-80 rounded-md object-contain" />;
  }
  if (file.contentType === "application/pdf") {
    return <iframe src={url} title={file.filename} className="h-96 w-full rounded-md border border-border bg-white" />;
  }
  return <TextPreview url={url} />;
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = React.useState<string | null>(null);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);
  React.useEffect(() => {
    fetch(url, { credentials: "same-origin", cache: "no-store" }).then(async (r) => {
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`${r.status} ${r.statusText}: ${body.slice(0, 200)}`);
      }
      return r.text();
    }).then(setText).catch((e) => setErrMsg(e?.message || "Unknown error"));
  }, [url]);
  if (errMsg) return <p className="text-xs text-muted-foreground">Could not load preview: {errMsg}</p>;
  if (text === null) return <p className="text-xs text-muted-foreground">Loading…</p>;
  return <pre className="max-h-80 overflow-auto rounded-md bg-surface p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">{text}</pre>;
}

type AddMode = "link" | "upload";

export function RecordDocuments({ recordKind, recordId, addedBy, today }: { recordKind: RecordKind; recordId: string; addedBy: string; today: string }) {
  const documents = useRecordDocumentsStore((state) => state.documents);
  const addDocument = useRecordDocumentsStore((state) => state.addDocument);
  const removeDocument = useRecordDocumentsStore((state) => state.removeDocument);

  const entityType = recordKind === "customer" ? "contact" : recordKind;
  const uploads = useApi<CrmAttachment[]>(`/attachments/${entityType}/${recordId}`);

  const [adding, setAdding] = React.useState(false);
  const [mode, setMode] = React.useState<AddMode>("upload");
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<DocumentKind>("Proposal");
  const [link, setLink] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [viewingId, setViewingId] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const list = documentsFor(documents, recordKind, recordId);
  const uploadedFiles = uploads.data ?? [];

  function resetForm() {
    setName(""); setLink(""); setNotes(""); setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File must be under 5 MB");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setSelectedFile(file);
    if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
  }

  async function save() {
    if (name.trim().length < 3) return toast.error("Enter the document name (at least 3 characters).");

    if (mode === "upload") {
      if (!selectedFile) return toast.error("Choose a file to upload.");
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", selectedFile);
        await api<CrmAttachment>(`/attachments/${entityType}/${recordId}`, {
          method: "POST",
          body: form,
        });
        toast.success(`Uploaded ${selectedFile.name}`);
        uploads.reload();
        resetForm();
        setAdding(false);
      } catch (err) {
        toast.error(message(err));
      } finally {
        setUploading(false);
      }
    } else {
      if (!link.trim()) return toast.error("Enter a URL for the document.");
      const problem = addDocument({ recordKind, recordId, name, kind, link, notes, addedBy }, today);
      if (problem) return toast.error(problem);
      toast.success("Document added");
      resetForm();
      setAdding(false);
    }
  }

  async function deleteUpload(id: string, filename: string) {
    try {
      await api(`/attachments/${id}`, { method: "DELETE" });
      toast.success(`Removed ${filename}`);
      uploads.reload();
    } catch (err) {
      toast.error(message(err));
    }
  }

  const totalCount = list.length + uploadedFiles.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="size-4 text-accent" />
          <h3 className="text-sm font-semibold">Documents</h3>
          {totalCount > 0 && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {totalCount}
            </span>
          )}
        </div>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => { setAdding(!adding); if (adding) resetForm(); }}>
          <Plus className="size-3" /> Add document
        </Button>
      </div>

      {adding && (
        <div className="rounded-lg border border-accent/30 bg-surface p-4 space-y-3">
          {/* Mode toggle */}
          <div className="flex gap-1 rounded-md bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={cn(
                "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5",
                mode === "upload" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Upload className="size-3" /> Upload file
            </button>
            <button
              type="button"
              onClick={() => setMode("link")}
              className={cn(
                "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5",
                mode === "link" ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Link2 className="size-3" /> Paste URL
            </button>
          </div>

          {/* Upload area */}
          {mode === "upload" && (
            <div
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-lg border-2 border-dashed border-border bg-surface-2/40 py-6 text-center transition-colors hover:border-accent/40 hover:bg-surface-2/70"
            >
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <File className="size-4 text-accent" />
                  <span className="font-medium">{selectedFile.name}</span>
                  <span className="text-muted-foreground">({formatSize(selectedFile.size)})</span>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto size-6 text-muted-foreground/50" />
                  <p className="mt-1.5 text-xs text-muted-foreground">Click to choose a file <span className="text-muted-foreground/60">(max 5 MB)</span></p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/50">PDF, Word, Excel, Images, ZIP, PPT</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.zip,.pptx"
              />
            </div>
          )}

          {/* Link input */}
          {mode === "link" && (
            <Input
              placeholder="https://drive.google.com/..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="text-sm"
            />
          )}

          {/* Common fields */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              placeholder="Document name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-sm"
              autoFocus={mode === "link"}
            />
            <div className="relative">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as DocumentKind)}
                className="h-9 w-full appearance-none rounded-md border border-input bg-surface px-3 pr-8 text-sm"
              >
                {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-muted-foreground" />
            </div>
          </div>
          <Textarea
            placeholder="Notes (optional) — version, expiry, key terms..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[50px] text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setAdding(false); resetForm(); }}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={name.trim().length < 3 || uploading}>
              {uploading ? "Uploading…" : "Save"}
            </Button>
          </div>
        </div>
      )}

      {totalCount === 0 && !adding ? (
        <div className="rounded-lg border border-border bg-surface py-10 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">No documents yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload files or paste links to proposals, contracts, invoices, and more.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {uploadedFiles.map((file) => {
            const FIcon = fileIcon(file.contentType);
            const isViewing = viewingId === file.id;
            const fileUrl = `/api/backend/attachments/${file.id}/file`;
            return (
              <div key={file.id} className="rounded-lg border border-border bg-surface transition-colors">
                <div className="group flex items-start gap-3 px-4 py-3 hover:bg-surface-2/50">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <FIcon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{file.filename}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-border bg-accent/5 px-1.5 py-0.5 font-medium text-accent">
                            <Upload className="size-2.5" /> Uploaded
                          </span>
                          <span>{formatSize(file.sizeBytes)}</span>
                          <span>{file.contentType.split("/").pop()}</span>
                          <span>{formatRelativeTime(file.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          onClick={() => setViewingId(isViewing ? null : file.id)}
                          className={cn("rounded p-1 transition-colors", isViewing ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-accent/10 hover:text-accent")}
                          title={isViewing ? "Close" : "View"}
                        >
                          <Eye className="size-3.5" />
                        </button>
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded p-1 text-muted-foreground hover:bg-accent/10 hover:text-accent"
                          title="Open in new tab"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => deleteUpload(file.id, file.filename)}
                          className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {isViewing && (
                  <div className="border-t border-border bg-surface-2/30 p-3">
                    <FilePreview file={file} />
                  </div>
                )}
              </div>
            );
          })}

          {list.map((doc) => {
            const DocIcon = KIND_ICON[doc.kind] ?? FileText;
            const colorCls = KIND_COLOR[doc.kind] ?? "bg-slate-50 dark:bg-slate-950 text-slate-500";
            return (
              <div key={doc.id} className="group flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2/50">
                <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", colorCls)}>
                  <DocIcon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {doc.link ? (
                        <a href={doc.link} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:underline inline-flex items-center gap-1">
                          {doc.name} <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                        </a>
                      ) : (
                        <p className="text-sm font-semibold">{doc.name}</p>
                      )}
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="rounded-full border border-border bg-surface-2 px-1.5 py-0.5 font-medium">{doc.kind}</span>
                        {doc.link && (
                          <span className="inline-flex items-center gap-0.5">
                            <Link2 className="size-2.5" /> Link
                          </span>
                        )}
                        <span>by {doc.addedBy}</span>
                        <span>{doc.date}</span>
                      </div>
                      {doc.notes && (
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{doc.notes}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { removeDocument(doc.id); toast.success("Document removed"); }}
                      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
