"use client";

/* eslint-disable @next/next/no-img-element -- blob and data URLs for documents and signatures cannot use next/image */

import * as React from "react";
import { Download, Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadHrFile, type DocumentExtras } from "@/lib/stores/hr-document-store";
import { blocksFromText, sampleMarkup, type Block } from "@/lib/hr-document-content";
import type { HrDocument, HrEmployee } from "@/lib/types";

export type ReaderSource =
  | { kind: "loading" }
  | { kind: "blocks"; blocks: Block[]; text: string }
  | { kind: "file"; url: string; mime: string; name: string; blob: Blob }
  | { kind: "error"; message: string };

/** Finds something readable for a document: the policy text, an uploaded file, or a sample. */
export function useDocumentSource(document: HrDocument, employee: HrEmployee | undefined, extra: DocumentExtras | undefined, policyBody?: string): ReaderSource {
  const [file, setFile] = React.useState<ReaderSource>({ kind: "loading" });
  const key = extra?.fileKey;
  const mime = extra?.mime ?? "";
  const name = extra?.fileName ?? document.name;
  React.useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let url = "";
    loadHrFile(key).then(async (blob) => {
      if (cancelled) return;
      if (!blob) { setFile({ kind: "error", message: "The stored file could not be found in this browser." }); return; }
      if (mime.startsWith("text/")) { const text = await blob.text(); if (!cancelled) setFile({ kind: "blocks", blocks: blocksFromText(text, document.name), text }); return; }
      url = URL.createObjectURL(blob);
      setFile({ kind: "file", url, mime, name, blob });
    }).catch(() => { if (!cancelled) setFile({ kind: "error", message: "The file could not be opened." }); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [key, mime, name, document.name]);
  return React.useMemo<ReaderSource>(() => {
    if (key) return file;
    const text = extra?.body ?? (policyBody && policyBody.trim() ? policyBody : sampleMarkup(document, employee));
    return { kind: "blocks", blocks: blocksFromText(text, document.name), text };
  }, [key, file, extra?.body, policyBody, document, employee]);
}

function Inline({ text }: { text: string }) {
  return <>{text.split(/(\*\*.+?\*\*)/g).map((part, index) => /^\*\*.+\*\*$/.test(part) ? <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong> : <React.Fragment key={index}>{part}</React.Fragment>)}</>;
}

const sizes = ["text-[14px] leading-6", "text-[16px] leading-7", "text-[18px] leading-8"] as const;
const slug = (text: string, index: number) => `sec-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`;

/** Comfortable reading view. Reports whether the reader has reached the end so signing can require it. */
export function DocumentReader({ source, height = "max-h-[52vh]", onProgress }: { source: ReaderSource; height?: string; onProgress?: (state: { reachedEnd: boolean; tracked: boolean }) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState(1);
  const [progress, setProgress] = React.useState(0);
  const report = React.useRef(onProgress);
  React.useEffect(() => { report.current = onProgress; }, [onProgress]);
  const blocks = source.kind === "blocks" ? source.blocks : [];
  const headings = blocks.flatMap((block, index) => block.type === "h2" ? [{ text: block.text, index }] : []);

  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const value = max <= 4 ? 1 : Math.min(1, el.scrollTop / max);
    setProgress(value);
    report.current?.({ reachedEnd: value >= 0.97, tracked: true });
  }, []);
  React.useEffect(() => {
    if (source.kind === "blocks") { const frame = requestAnimationFrame(measure); return () => cancelAnimationFrame(frame); }
    report.current?.({ reachedEnd: false, tracked: false });
  }, [source, size, measure]);

  if (source.kind === "loading") return <p className="border border-border p-8 text-center text-sm text-muted-foreground" role="status">Opening document…</p>;
  if (source.kind === "error") return <p className="border border-border p-8 text-center text-sm text-danger" role="alert">{source.message}</p>;
  if (source.kind === "file") {
    const image = source.mime.startsWith("image/");
    const pdf = source.mime === "application/pdf";
    return <div className="border border-border">{image ? <div className="flex max-h-[52vh] justify-center overflow-auto bg-surface-2 p-3"><img src={source.url} alt={`Uploaded document: ${source.name}`} className="h-auto max-w-full" /></div> : pdf ? <object data={source.url} type="application/pdf" aria-label={`PDF: ${source.name}`} className="h-[52vh] w-full"><p className="p-6 text-sm">Your browser can&apos;t show this PDF here. Use Download to open it.</p></object> : <div className="space-y-3 p-8 text-center text-sm"><p className="font-medium">{source.name}</p><p className="text-muted-foreground">This file type can&apos;t be shown here. Download it to read it.</p></div>}
      <div className="flex justify-end border-t border-border bg-surface-2 px-3 py-2"><Button size="sm" variant="outline" asChild><a href={source.url} download={source.name}><Download className="mr-1 size-3.5" />Download</a></Button></div></div>;
  }
  return <div className="border border-border bg-surface">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2" aria-hidden="true"><div className="h-1.5 w-28 bg-border"><div className="h-1.5 bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} /></div><span className="text-[11px] text-muted-foreground">{progress >= 0.97 ? "End of document" : `${Math.round(progress * 100)}% read`}</span></div>
      <div className="flex items-center gap-1" role="group" aria-label="Text size"><Button type="button" size="icon" variant="ghost" aria-label="Smaller text" disabled={size === 0} onClick={() => setSize(size - 1)}><Minus className="size-3.5" /></Button><span className="w-6 text-center text-xs text-muted-foreground">Aa</span><Button type="button" size="icon" variant="ghost" aria-label="Larger text" disabled={size === sizes.length - 1} onClick={() => setSize(size + 1)}><Plus className="size-3.5" /></Button></div>
    </div>
    {headings.length > 2 && <nav aria-label="Sections" className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">{headings.map(({ text, index }) => <button key={index} type="button" onClick={() => ref.current?.querySelector(`#${slug(text, index)}`)?.scrollIntoView({ block: "start", behavior: "smooth" })} className="border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-accent hover:text-accent">{text.replace(/^\d+\.\s*/, "")}</button>)}</nav>}
    <div ref={ref} onScroll={measure} tabIndex={0} role="region" aria-label="Document text" className={`${height} overflow-y-auto px-6 py-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}>
      <article className={`mx-auto max-w-[68ch] ${sizes[size]} text-foreground/90`}>
        {blocks.map((block, index) => {
          if (block.type === "hr") return <hr key={index} className="my-6 border-border" />;
          if (block.type === "title") return <h2 key={index} className="mb-4 text-2xl font-semibold leading-tight tracking-tight text-foreground">{block.text}</h2>;
          if (block.type === "h2") return <h3 key={index} id={slug(block.text, index)} className="mb-2 mt-7 scroll-mt-2 text-base font-semibold text-foreground">{block.text}</h3>;
          if (block.type === "note") return <p key={index} className="mb-5 border-l-2 border-warning bg-warning-muted px-3 py-2 text-[13px] leading-5 text-warning"><Inline text={block.text} /></p>;
          if ("items" in block) { const rows = block.items.map((item, i) => <li key={i}><Inline text={item} /></li>); return block.type === "ol" ? <ol key={index} className="mb-4 list-decimal space-y-1.5 pl-6">{rows}</ol> : <ul key={index} className="mb-4 list-disc space-y-1.5 pl-6">{rows}</ul>; }
          return <p key={index} className="mb-4 whitespace-pre-line"><Inline text={block.text} /></p>;
        })}
      </article>
    </div>
  </div>;
}

export function FullReadDialog({ title, subtitle, source, onClose }: { title: string; subtitle?: string; source: ReaderSource; onClose: () => void }) {
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-4xl flex-col gap-3 overflow-hidden rounded-none"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{subtitle ?? "Reading view"}</DialogDescription></DialogHeader><DocumentReader source={source} height="max-h-[72dvh]" /></DialogContent></Dialog>;
}

export function ReadFullButton({ onClick }: { onClick: () => void }) {
  return <Button type="button" size="sm" variant="outline" onClick={onClick}><Maximize2 className="mr-1 size-3.5" />Read full screen</Button>;
}
