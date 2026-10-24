"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";
import { useHrLifecycleStore } from "@/lib/stores/hr-lifecycle-store";
import { useHrOperationsStore } from "@/lib/stores/hr-operations-store";
import { useHrImportStore, type HrImportBatch } from "@/lib/stores/hr-import-store";
import { MAX_BYTES, MAX_ROWS, autoMap, buildImport, importFields, parseDelimited, reportCsv, sampleCsv, validateRows, type ImportFieldKey, type Mapping, type RowState } from "@/lib/hr-import";
import { HrEmpty, HrStatus, downloadHrCsv, hrInputClass } from "@/components/hr-people/operations-ui";
import { downloadHrFile } from "@/lib/hr-payroll";

type Step = "upload" | "map" | "review" | "done";
const when = (value: string) => new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const stateLabel: Record<RowState, string> = { ready: "Ready", warning: "Warnings", error: "Rejected", duplicate: "Duplicate" };
const stateStatus: Record<RowState, string> = { ready: "approved", warning: "pending", error: "rejected", duplicate: "review" };
const SHOW_ROWS = 200;

export function HrEmployeeImport({ actorId, onClose }: { actorId: string; onClose: () => void }) {
  const { employees, importEmployees, removeEmployees, updateEmployee, leaveRequests, attendance, onboardingTasks, documents, candidates } = useHrPeopleStore();
  const exits = useHrLifecycleStore((state) => state.exits);
  const regularisations = useHrOperationsStore((state) => state.regularisations);
  const log = useHrOperationsStore((state) => state.log);
  const { batches, addBatch, markRolledBack } = useHrImportStore();
  const [tab, setTab] = React.useState<"import" | "history">("import");
  const [step, setStep] = React.useState<Step>("upload");
  const [fileName, setFileName] = React.useState("pasted data");
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState("");
  const [table, setTable] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<Mapping | null>(null);
  const [duplicates, setDuplicates] = React.useState<"skip" | "update">("skip");
  const [filter, setFilter] = React.useState<"all" | "attention">("all");
  const [result, setResult] = React.useState<HrImportBatch | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const headers = table[0] ?? [];
  const body = React.useMemo(() => table.slice(1), [table]);
  const rows = React.useMemo(() => mapping ? validateRows(body, mapping, employees) : [], [body, mapping, employees]);
  const count = (state: RowState) => rows.filter((row) => row.state === state).length;
  const importable = rows.filter((row) => row.employee && (row.state !== "duplicate" || duplicates === "update"));
  const missing = mapping ? importFields.filter((field) => field.required && mapping[field.key] === null) : [];
  const used = mapping ? Object.values(mapping).filter((value): value is number => value !== null) : [];
  const reused = used.length !== new Set(used).size;
  const latestActive = batches.find((batch) => !batch.rolledBackAt);

  function load(raw: string, name: string) {
    setError("");
    if (raw.includes("\u0000") || raw.startsWith("PK")) { setError("This looks like an Excel (.xlsx) file. In Excel choose File → Save As → CSV UTF-8, then upload that file."); return; }
    const parsed = parseDelimited(raw);
    if (parsed.length < 2) { setError("The file needs a header row and at least one employee row."); return; }
    if (parsed.length - 1 > MAX_ROWS) { setError(`Import up to ${MAX_ROWS} employees at a time. This file has ${parsed.length - 1}. Split it and import in parts.`); return; }
    setFileName(name);
    setTable(parsed);
    setMapping(autoMap(parsed[0]));
    setStep("map");
  }
  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) { setError("Choose a file under 1 MB."); return; }
    load(await file.text(), file.name);
  }
  function reset() { setStep("upload"); setTable([]); setMapping(null); setText(""); setError(""); setResult(null); setFilter("all"); }

  function runImport() {
    if (!mapping) return;
    const { created, updates, skipped } = buildImport(rows, employees, duplicates);
    if (!created.length && !updates.length) { toast.error("Nothing to import."); return; }
    importEmployees(created, updates.map(({ id, patch }) => ({ id, patch })));
    const batch: HrImportBatch = { id: `import-${crypto.randomUUID()}`, fileName, at: new Date().toISOString(), actorId, createdIds: created.map((item) => item.id), updated: updates.map(({ id, before }) => ({ id, before })), skipped, rejected: count("error") };
    addBatch(batch);
    log({ recordId: batch.id, actorId, action: "employees_imported", reason: `${fileName}: ${created.length} added, ${updates.length} updated, ${count("error")} rejected` });
    setResult(batch);
    setStep("done");
    toast.success(`${created.length} added${updates.length ? `, ${updates.length} updated` : ""}`);
  }
  function blockers(batch: HrImportBatch) {
    const ids = new Set(batch.createdIds);
    return employees.filter((employee) => ids.has(employee.id)).filter((employee) => leaveRequests.some((item) => item.employeeId === employee.id) || attendance.some((item) => item.employeeId === employee.id) || onboardingTasks.some((item) => item.employeeId === employee.id) || documents.some((item) => item.employeeId === employee.id) || regularisations.some((item) => item.employeeId === employee.id) || exits.some((item) => item.employeeId === employee.id) || candidates.some((item) => item.convertedEmployeeId === employee.id) || employees.some((other) => other.managerId === employee.id && !ids.has(other.id)));
  }
  function rollback(batch: HrImportBatch) {
    const blocked = blockers(batch);
    if (blocked.length) { toast.error(`Can't roll back: ${blocked.map((item) => item.name).slice(0, 3).join(", ")}${blocked.length > 3 ? ` and ${blocked.length - 3} more` : ""} already have leave, attendance, documents, onboarding or reports. Archive them instead.`); setConfirming(null); return; }
    removeEmployees(batch.createdIds);
    batch.updated.forEach((item) => updateEmployee(item.id, item.before));
    markRolledBack(batch.id, actorId);
    log({ recordId: batch.id, actorId, action: "import_rolled_back", reason: `${batch.fileName}: removed ${batch.createdIds.length}, restored ${batch.updated.length}` });
    setConfirming(null);
    toast.success("Import rolled back");
  }

  const shown = rows.filter((row) => filter === "all" || row.state !== "ready").slice(0, SHOW_ROWS);
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92dvh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-none">
    <DialogHeader><DialogTitle>Import employees</DialogTitle><DialogDescription>Upload a CSV, check what will happen, then import. You can undo the latest import.</DialogDescription></DialogHeader>
    <div className="flex gap-1 border-b border-border" role="tablist">{(["import", "history"] as const).map((item) => <button key={item} id={`imp-tab-${item}`} role="tab" aria-selected={tab === item} aria-controls="imp-panel" onClick={() => setTab(item)} className={`px-4 py-2 text-sm ${tab === item ? "border-b-2 border-accent font-medium" : "text-muted-foreground"}`}>{item === "import" ? "New import" : `History${batches.length ? ` (${batches.length})` : ""}`}</button>)}</div>
    <div id="imp-panel" role="tabpanel" aria-labelledby={`imp-tab-${tab}`}>
    {tab === "history" ? <div className="space-y-3">{batches.length ? <ul className="divide-y divide-border border border-border">{batches.map((batch) => { const blocked = blockers(batch); return <li key={batch.id} className="space-y-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{batch.fileName}</p><p className="text-xs text-muted-foreground">{when(batch.at)} · {employees.find((item) => item.id === actorId)?.name && batch.actorId === actorId ? "you" : employees.find((item) => item.id === batch.actorId)?.name ?? batch.actorId} · {batch.createdIds.length} added · {batch.updated.length} updated · {batch.skipped} skipped · {batch.rejected} rejected</p></div>
        {batch.rolledBackAt ? <span className="border border-border px-2 py-0.5 text-xs text-muted-foreground">Rolled back</span> : batch.id === latestActive?.id ? (confirming === batch.id ? <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Remove {batch.createdIds.length}, undo {batch.updated.length} edits?</span><Button size="sm" variant="outline" onClick={() => setConfirming(null)}>Keep</Button><Button size="sm" onClick={() => rollback(batch)}>Roll back</Button></div> : <Button size="sm" variant="outline" onClick={() => setConfirming(batch.id)}>Roll back</Button>) : <span className="text-xs text-muted-foreground">Roll back newer imports first</span>}</div>
      {batch.rolledBackAt && <p className="text-xs text-muted-foreground">Rolled back {when(batch.rolledBackAt)}.</p>}
      {!batch.rolledBackAt && blocked.length > 0 && <p className="text-xs text-warning">{blocked.length} imported {blocked.length === 1 ? "person already has" : "people already have"} leave, attendance, documents or onboarding, so rolling back is blocked. Archive them instead.</p>}
    </li>; })}</ul> : <HrEmpty>No imports yet.</HrEmpty>}</div> : <>
      {step === "upload" && <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border p-8 text-center text-sm hover:border-accent"><Upload className="size-6 text-muted-foreground" /><span className="font-medium">Choose a CSV file</span><span className="text-xs text-muted-foreground">.csv, .tsv or .txt · up to {MAX_ROWS} employees · 1 MB</span><input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" onChange={onFile} /></label>
          <div className="space-y-2"><label htmlFor="paste" className="text-xs font-medium text-muted-foreground">Or paste rows copied from Excel or Google Sheets</label><Textarea id="paste" rows={5} value={text} onChange={(event) => setText(event.target.value)} className="rounded-none font-mono text-xs" placeholder={"Full name\tWork email\t…"} /><Button variant="outline" disabled={!text.trim()} onClick={() => load(text, "pasted data")}>Use pasted rows</Button></div>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><span>Required columns: name, email, job title, department, joining date. Excel files: save as CSV first.</span><Button size="sm" variant="outline" onClick={() => downloadHrFile("employee-import-template.csv", sampleCsv, "text/csv")}><Download className="mr-1 size-3.5" />Download template</Button></div>
      </div>}
      {step === "map" && mapping && <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{body.length} rows found in <strong>{fileName}</strong>. Check which column holds each detail.</p>
        <div className="divide-y divide-border border border-border">{importFields.map((field) => { const index = mapping[field.key]; const samples = index === null ? [] : body.slice(0, 3).map((row) => row[index]).filter(Boolean); return <div key={field.key} className="grid items-center gap-3 px-4 py-2 text-sm sm:grid-cols-[200px_240px_1fr]"><div><p className="font-medium">{field.label}{field.required && <span className="text-danger"> *</span>}</p><p className="text-[11px] text-muted-foreground">{field.hint}</p></div>
          <select aria-label={`Column for ${field.label}`} className={hrInputClass} value={index ?? ""} onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value === "" ? null : Number(event.target.value) } as Record<ImportFieldKey, number | null>)}><option value="">{field.required ? "Choose a column…" : "Not in my file"}</option>{headers.map((header, position) => <option key={position} value={position}>{header || `Column ${position + 1}`}</option>)}</select>
          <p className="truncate text-xs text-muted-foreground">{samples.length ? `e.g. ${samples.join(" · ")}` : ""}</p></div>; })}</div>
        {missing.length > 0 && <p role="alert" className="text-sm text-danger">Choose a column for: {missing.map((field) => field.label).join(", ")}.</p>}
        {reused && <p role="alert" className="text-sm text-danger">A column can only be used once. Two details point to the same column.</p>}
        <div className="flex justify-between"><Button variant="outline" onClick={reset}>Back</Button><Button disabled={missing.length > 0 || reused} onClick={() => setStep("review")}>Check my data</Button></div>
      </div>}
      {step === "review" && <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">{(["ready", "warning", "duplicate", "error"] as const).map((state) => <div key={state} className="border border-border p-3"><p className="text-xs text-muted-foreground">{state === "warning" ? "Ready with warnings" : state === "error" ? "Rejected" : stateLabel[state] === "Ready" ? "Ready" : "Already exist"}</p><p className="mt-1 text-2xl font-semibold">{count(state)}</p></div>)}</div>
        {count("duplicate") > 0 && <fieldset className="space-y-2 border border-border p-3 text-sm"><legend className="px-1 text-xs font-medium">People who already exist (same email)</legend>{([["skip", "Skip them. Leave existing records alone."], ["update", "Update them with the values in this file."]] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="radio" name="dup" checked={duplicates === value} onChange={() => setDuplicates(value)} />{label}</label>)}</fieldset>}
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex gap-1">{(["all", "attention"] as const).map((item) => <Button key={item} size="sm" variant={filter === item ? "secondary" : "ghost"} onClick={() => setFilter(item)}>{item === "all" ? `All rows (${rows.length})` : `Needs attention (${rows.length - count("ready")})`}</Button>)}</div><Button size="sm" variant="outline" onClick={() => downloadHrCsv("employee-import-report.csv", reportCsv(rows))}><Download className="mr-1 size-3.5" />Download report</Button></div>
        <div className="max-h-80 overflow-auto border border-border"><table className="w-full text-left text-sm"><thead className="sticky top-0 border-b border-border bg-surface-2 text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Line</th><th className="px-3 py-2 font-medium">Person</th><th className="px-3 py-2 font-medium">Result</th><th className="px-3 py-2 font-medium">What we found</th></tr></thead><tbody className="divide-y divide-border">{shown.map((row) => <tr key={row.line} className="align-top"><td className="px-3 py-2 text-xs text-muted-foreground">{row.line}</td><td className="px-3 py-2"><p className="font-medium">{row.employee?.name ?? row.cells[mapping?.name ?? 0] ?? "—"}</p><p className="text-xs text-muted-foreground">{row.employee?.email ?? row.cells[mapping?.email ?? 0]}</p></td><td className="px-3 py-2"><HrStatus status={stateStatus[row.state]} /><span className="sr-only">{stateLabel[row.state]}</span></td><td className="px-3 py-2 text-xs">{[...row.errors.map((item) => <p key={item} className="text-danger">{item}</p>), ...(row.state === "error" ? [] : row.warnings).map((item) => <p key={item} className="text-warning">{item}</p>), row.duplicateOf && <p key="dup" className="text-muted-foreground">Already exists as {row.duplicateOf.name} ({row.duplicateOf.id.toUpperCase()}).{duplicates === "update" ? row.changes.length ? ` Will change: ${row.changes.join("; ")}.` : " Nothing to change." : " Will be skipped."}</p>, row.state === "ready" && <p key="ok" className="text-muted-foreground">No problems.</p>]}</td></tr>)}{!shown.length && <tr><td colSpan={4}><HrEmpty>Every row is ready.</HrEmpty></td></tr>}</tbody></table></div>
        {rows.length > SHOW_ROWS && filter === "all" && <p className="text-xs text-muted-foreground">Showing the first {SHOW_ROWS} rows. The report has all {rows.length}.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="outline" onClick={() => setStep("map")}>Back</Button><div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{count("error")} rejected rows are never imported.</span><Button disabled={!importable.length} onClick={runImport}>Import {importable.length} {importable.length === 1 ? "person" : "people"}</Button></div></div>
      </div>}
      {step === "done" && result && <div className="space-y-4 text-center"><p className="text-lg font-semibold">Import complete</p><p className="text-sm text-muted-foreground">{result.createdIds.length} added · {result.updated.length} updated · {result.skipped} skipped · {result.rejected} rejected</p><p className="text-xs text-muted-foreground">New people joining in the future are marked as onboarding. Open Onboarding to create their checklist.</p><div className="flex justify-center gap-2"><Button variant="outline" onClick={() => rollback(result)}>Undo this import</Button><Button variant="outline" onClick={reset}>Import another file</Button><Button onClick={onClose}>View employees</Button></div></div>}
    </>}
    </div>
  </DialogContent></Dialog>;
}
