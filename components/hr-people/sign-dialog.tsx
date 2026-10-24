"use client";

/* eslint-disable @next/next/no-img-element -- blob and data URLs for documents and signatures cannot use next/image */

import * as React from "react";
import { Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DocumentReader, type ReaderSource } from "@/components/hr-people/document-reader";
import { certificateText, deviceLabel, makeReference, sha256Hex, type SignatureRecord } from "@/lib/hr-document-content";
import { downloadHrFile } from "@/lib/hr-payroll";
import type { HrDocument } from "@/lib/types";

const normalise = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
const cursive = '"Snell Roundhand","Segoe Script","Brush Script MT","Apple Chancery",cursive';
const istTime = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

function SignaturePad({ onChange }: { onChange: (image: string | null) => void }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);
  const ink = React.useRef(0);
  const paint = React.useCallback(() => {
    const canvas = ref.current; const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(24, canvas.height - 44); ctx.lineTo(canvas.width - 24, canvas.height - 44); ctx.stroke();
  }, []);
  React.useEffect(() => { paint(); }, [paint]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const canvas = ref.current!; const rect = canvas.getBoundingClientRect(); return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height }; };
  function down(event: React.PointerEvent<HTMLCanvasElement>) {
    // Capture keeps the stroke going if the pointer leaves the pad. Some devices refuse it, which must not stop drawing.
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* drawing still works without capture */ }
    drawing.current = true; last.current = point(event);
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = ref.current!.getContext("2d")!; const next = point(event);
    ctx.strokeStyle = "#111827"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(next.x, next.y); ctx.stroke();
    ink.current += Math.hypot(next.x - last.current.x, next.y - last.current.y); last.current = next;
  }
  function up() { if (!drawing.current) return; drawing.current = false; last.current = null; onChange(ink.current > 80 ? ref.current!.toDataURL("image/png") : null); }
  function clear() { paint(); ink.current = 0; onChange(null); }
  return <div className="space-y-2"><canvas ref={ref} width={600} height={180} role="img" aria-label="Signature pad. Draw your signature with a mouse, finger or pen. Or use the Type tab." onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="h-[180px] w-full touch-none cursor-crosshair border border-border bg-white" /><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Sign above the line.</p><Button type="button" size="sm" variant="outline" onClick={clear}>Clear</Button></div></div>;
}

interface SignDialogProps { mode: "sign" | "acknowledge"; document: HrDocument; source: ReaderSource; signerName: string; onComplete: (record: SignatureRecord) => void; onClose: () => void }

export function SignDialog({ mode, document, source, signerName, onComplete, onClose }: SignDialogProps) {
  const signing = mode === "sign";
  const [step, setStep] = React.useState<"read" | "sign" | "done">("read");
  const [reached, setReached] = React.useState(false);
  const [tracked, setTracked] = React.useState(true);
  const [confirmedRead, setConfirmedRead] = React.useState(false);
  const [method, setMethod] = React.useState<"typed" | "drawn">("typed");
  const [typed, setTyped] = React.useState("");
  const [image, setImage] = React.useState<string | null>(null);
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [record, setRecord] = React.useState<SignatureRecord | null>(null);
  const onProgress = React.useCallback((state: { reachedEnd: boolean; tracked: boolean }) => { setTracked(state.tracked); if (state.reachedEnd) setReached(true); }, []);
  const canContinue = source.kind !== "loading" && source.kind !== "error" && ((tracked && reached) || (!tracked && confirmedRead));
  const typedOk = normalise(typed) === normalise(signerName);
  const ready = consent && (!signing || (method === "typed" ? typedOk : Boolean(image)));
  const verb = signing ? "Sign" : "Acknowledge";

  async function finish() {
    if (!ready || busy) return;
    setBusy(true);
    const hash = await sha256Hex(source.kind === "blocks" ? source.text : source.kind === "file" ? source.blob : document.id);
    const at = new Date();
    const next: SignatureRecord = { method: signing ? method : "acknowledged", typedName: signing && method === "typed" ? signerName : undefined, image: signing && method === "drawn" ? image ?? undefined : undefined, hash, signedAt: at.toISOString(), device: deviceLabel(), reference: makeReference(hash, at) };
    setRecord(next);
    onComplete(next);
    setStep("done");
    setBusy(false);
  }

  const steps = signing ? ["Read", "Sign", "Done"] : ["Read", "Confirm", "Done"];
  const index = step === "read" ? 0 : step === "sign" ? 1 : 2;
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent className="flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-3xl flex-col gap-4 overflow-y-auto rounded-none">
    <DialogHeader><DialogTitle>{step === "done" ? (signing ? "Document signed" : "Acknowledged") : `${verb}: ${document.name}`}</DialogTitle><DialogDescription>Version {document.version} · {signerName}</DialogDescription></DialogHeader>
    <ol className="flex items-center gap-2 text-xs" aria-label="Progress">{steps.map((label, position) => <li key={label} aria-current={position === index ? "step" : undefined} className={`flex items-center gap-2 ${position <= index ? "text-foreground" : "text-muted-foreground"}`}><span className={`flex size-5 items-center justify-center rounded-full border text-[10px] ${position < index ? "border-accent bg-accent text-white" : position === index ? "border-accent text-accent" : "border-border"}`}>{position < index ? <Check className="size-3" /> : position + 1}</span>{label}{position < steps.length - 1 && <span className="h-px w-6 bg-border" aria-hidden />}</li>)}</ol>

    {step === "read" && <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Read the whole document first. {tracked ? "Scroll to the end to continue." : "Tick the box once you have read it."}</p>
      <DocumentReader source={source} height="max-h-[48vh]" onProgress={onProgress} />
      {!tracked && source.kind !== "loading" && source.kind !== "error" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmedRead} onChange={(event) => setConfirmedRead(event.target.checked)} />I have read this document.</label>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!canContinue} onClick={() => setStep("sign")}>{signing ? "Continue to sign" : "Continue"}</Button></div>
    </div>}

    {step === "sign" && <div className="space-y-4">
      {signing && <>
        <div role="tablist" aria-label="How do you want to sign?" className="flex gap-1 border-b border-border">{(["typed", "drawn"] as const).map((item) => <button key={item} id={`sig-tab-${item}`} role="tab" type="button" aria-selected={method === item} aria-controls="sig-panel" onClick={() => setMethod(item)} className={`px-4 py-2 text-sm ${method === item ? "border-b-2 border-accent font-medium" : "text-muted-foreground"}`}>{item === "typed" ? "Type your name" : "Draw"}</button>)}</div>
        <div id="sig-panel" role="tabpanel" aria-labelledby={`sig-tab-${method}`}>
          {method === "typed" ? <div className="space-y-3"><label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Type your full name exactly as it appears: <span className="text-foreground">{signerName}</span><Input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" aria-invalid={typed !== "" && !typedOk} className="rounded-none text-base" /></label>
            <div className="flex h-24 items-center justify-center border border-border bg-white px-4" aria-label="Signature preview"><span className="truncate text-4xl text-slate-900" style={{ fontFamily: cursive }}>{typedOk ? signerName : <span className="text-base text-slate-400" style={{ fontFamily: "inherit" }}>Your signature appears here</span>}</span></div>
            {typed !== "" && !typedOk && <p role="alert" className="text-xs text-danger">The name must match {signerName}.</p>}</div> : <SignaturePad onChange={setImage} />}
        </div></>}
      <label className="flex items-start gap-2 border border-border bg-surface-2 p-3 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{signing ? "I have read this document and agree to sign it electronically." : "I have read and understood this document."} <span className="text-muted-foreground">This is a demonstration. It is not a legally valid e-signature.</span></span></label>
      <div className="flex flex-wrap justify-between gap-2"><Button variant="outline" onClick={() => setStep("read")}>Back</Button><Button disabled={!ready || busy} onClick={finish}>{busy ? "Saving…" : signing ? "Sign document" : "Acknowledge"}</Button></div>
    </div>}

    {step === "done" && record && <div className="space-y-4">
      <div className="flex items-center gap-3 border border-success/30 bg-success-muted p-4 text-success"><Check className="size-5 shrink-0" /><div><p className="text-sm font-semibold">{signing ? "Your signature has been recorded." : "Your acknowledgement has been recorded."}</p><p className="text-xs">{istTime(record.signedAt)} IST · {record.reference}</p></div></div>
      <SignatureSummary document={document} signerName={signerName} record={record} />
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => downloadHrFile(`signature-certificate-${record.reference}.txt`, certificateText(document, signerName, record))}><Download className="mr-1 size-3.5" />Download certificate</Button><Button onClick={onClose}>Done</Button></div>
    </div>}
  </DialogContent></Dialog>;
}

export function SignatureSummary({ document, signerName, record }: { document: HrDocument; signerName: string; record: SignatureRecord }) {
  return <div className="grid gap-4 border border-border p-4 sm:grid-cols-[200px_1fr]">
    <div className="flex h-24 items-center justify-center border border-border bg-white px-2" aria-label={`Signature of ${signerName}`}>{record.image ? <img src={record.image} alt={`Drawn signature of ${signerName}`} className="max-h-full max-w-full" /> : record.typedName ? <span className="truncate text-3xl text-slate-900" style={{ fontFamily: cursive }}>{record.typedName}</span> : <span className="text-xs text-slate-500">Acknowledged</span>}</div>
    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[120px_1fr]">
      <dt className="text-muted-foreground">Document</dt><dd>{document.name} · v{document.version}</dd>
      <dt className="text-muted-foreground">Signed by</dt><dd>{signerName}</dd>
      <dt className="text-muted-foreground">Method</dt><dd>{record.method === "typed" ? "Typed name" : record.method === "drawn" ? "Drawn signature" : "Read and acknowledged"}</dd>
      <dt className="text-muted-foreground">Time</dt><dd>{istTime(record.signedAt)} IST</dd>
      <dt className="text-muted-foreground">Device</dt><dd>{record.device}</dd>
      <dt className="text-muted-foreground">Fingerprint</dt><dd className="break-all font-mono text-[11px]" title="SHA-256 of the document. It changes if the document changes.">{record.hash}</dd>
    </dl>
  </div>;
}

export function DeclineDialog({ title, onSubmit, onClose }: { title: string; onSubmit: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-md rounded-none"><DialogHeader><DialogTitle>Decline to sign</DialogTitle><DialogDescription>{title}. HR sees your reason.</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 5) onSubmit(reason.trim()); }}>
      <Textarea aria-label="Reason for declining" required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-none" placeholder="e.g. The notice period is different from what we discussed" />
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={reason.trim().length < 5}>Decline</Button></div>
    </form></DialogContent></Dialog>;
}
