"use client";

import { useCallback, useState } from "react";
import { Upload, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const FIELDS = [
  { value: "name", label: "Name" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "company", label: "Company" },
  { value: "requirement", label: "Requirement" },
  { value: "skip", label: "Skip column" },
];

type Step = "upload" | "map" | "importing" | "done";

export function ImportDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [results, setResults] = useState({ imported: 0, skipped: 0, errors: 0 });

  function reset() {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResults({ imported: 0, skipped: 0, errors: 0 });
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        toast.error("CSV needs at least a header row and one data row");
        return;
      }
      const csvHeaders = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const csvRows = lines.slice(1, 6).map((l) =>
        l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")),
      );
      setHeaders(csvHeaders);
      setRows(csvRows);
      const autoMap: Record<number, string> = {};
      csvHeaders.forEach((h, i) => {
        const lower = h.toLowerCase();
        if (lower.includes("name") && !lower.includes("company")) autoMap[i] = "name";
        else if (lower.includes("phone") || lower.includes("mobile")) autoMap[i] = "phone";
        else if (lower.includes("email") || lower.includes("mail")) autoMap[i] = "email";
        else if (lower.includes("company") || lower.includes("organization")) autoMap[i] = "company";
        else if (lower.includes("require") || lower.includes("message") || lower.includes("note")) autoMap[i] = "requirement";
        else autoMap[i] = "skip";
      });
      setMapping(autoMap);
      setStep("map");
    };
    reader.readAsText(file);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
      handleFile(file);
    } else {
      toast.error("Please upload a CSV file");
    }
  }, []);

  async function runImport() {
    setStep("importing");
    const fileInput = document.querySelector<HTMLInputElement>("#csv-file-input");
    const file = fileInput?.files?.[0];
    if (!file) {
      toast.error("No file selected");
      setStep("map");
      return;
    }

    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    const dataRows = lines.slice(1).map((l) =>
      l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")),
    );

    let imported = 0, skipped = 0, errors = 0;
    for (const row of dataRows) {
      const data: Record<string, string> = {};
      headers.forEach((_, i) => {
        const field = mapping[i];
        if (field && field !== "skip" && row[i]) {
          data[field] = row[i];
        }
      });
      if (!data.phone && !data.email) {
        skipped++;
        continue;
      }
      try {
        await api("/leads", {
          method: "POST",
          body: JSON.stringify({
            name: data.name ?? "",
            phone: data.phone ?? "",
            email: data.email ?? "",
            company: data.company ?? "",
            requirement: data.requirement ?? "",
            skipDuplicateCheck: true,
          }),
          headers: { "idempotency-key": `import-${Date.now()}-${imported + skipped + errors}` },
        });
        imported++;
      } catch {
        errors++;
      }
    }
    setResults({ imported, skipped, errors });
    setStep("done");
    if (imported > 0) onDone?.();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Leads from CSV</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border py-12 hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => document.getElementById("csv-file-input")?.click()}
          >
            <Upload className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Drag & drop a CSV file, or click to browse</p>
            <p className="text-xs text-muted-foreground">Columns: Name, Phone, Email, Company, Requirement</p>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            />
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Map CSV columns to lead fields:</p>
            <div className="space-y-2">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm w-40 truncate font-mono bg-surface-2 px-2 py-1 rounded">{h}</span>
                  <span className="text-muted-foreground">→</span>
                  <Select value={mapping[i] ?? "skip"} onValueChange={(v) => setMapping({ ...mapping, [i]: v })}>
                    <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">Preview (first {rows.length} rows):</div>
            <div className="rounded border border-border overflow-auto max-h-40">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h, i) => (
                      <TableHead key={i} className="text-xs whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, ri) => (
                    <TableRow key={ri}>
                      {row.map((cell, ci) => (
                        <TableCell key={ci} className="text-xs whitespace-nowrap">{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importing leads...</p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 py-6">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle className="size-8 text-success" />
              <span className="text-lg font-semibold">Import Complete</span>
            </div>
            <div className="flex justify-center gap-6 text-sm">
              <div className="text-center">
                <span className="text-2xl font-bold text-success">{results.imported}</span>
                <p className="text-muted-foreground">Imported</p>
              </div>
              <div className="text-center">
                <span className="text-2xl font-bold text-warning">{results.skipped}</span>
                <p className="text-muted-foreground">Skipped</p>
              </div>
              <div className="text-center">
                <span className="text-2xl font-bold text-danger">{results.errors}</span>
                <p className="text-muted-foreground">Errors</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "map" && (
            <>
              <Button variant="outline" onClick={() => { reset(); }}>Cancel</Button>
              <Button onClick={runImport}>Import Leads</Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => { reset(); onOpenChange(false); }}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
