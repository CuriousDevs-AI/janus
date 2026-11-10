"use client";

import * as React from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useRoles } from "@/features/portfolio/lib/companies";
import { inr } from "@/features/portfolio/lib/format";
import { parseCustomerHistory } from "@/features/portfolio/lib/history-csv";
import type { PortfolioCompany, PortfolioRetention } from "@/features/portfolio/types";

const monthName = (value: string) => new Date(`${value.length === 7 ? `${value}-01` : value}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

/** Customers kept, new and lost per company over the last twelve finished months against the twelve
 * before, with the customers who stopped buying, largest first. */
export function CustomersKept({ list }: { list: PortfolioCompany[] }) {
  const { handlesMoney } = useRoles();
  const data = useApi<PortfolioRetention>("/portfolio/customers");
  const editable = list.filter((item) => handlesMoney(item));
  const [companyId, setCompanyId] = React.useState(editable[0]?.id ?? "");
  const [source, setSource] = React.useState<"tally" | "zoho" | "other">("tally");
  const [busy, setBusy] = React.useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const parsed = parseCustomerHistory(await file.text());
      if (parsed.rows.length === 0) throw new Error("No customer with sales in a month was found.");
      const result = await api<{ rows: number }>(`/portfolio/companies/${companyId}/history/customers`, { method: "POST", body: JSON.stringify({ source, rows: parsed.rows.slice(0, 20000) }) });
      toast.success(`${result.rows} customer-months imported${parsed.skipped ? `; ${parsed.skipped} rows left out (totals or blank)` : ""}.`);
      data.reload();
    } catch (error) { toast.error(message(error)); } finally { setBusy(false); }
  };
  const span = data.data ? `${monthName(data.data.recentStart)} – ${monthName(data.data.recentEnd)} against ${monthName(data.data.beforeStart)} – ${monthName(data.data.beforeEnd)}` : "";
  return <SectionCard title="Customers kept" description={`Of the customers who bought in the twelve months before, how many bought again in the last twelve, who is new, and who stopped buying. ${span}. From invoices, and a customer-wise report imported from Tally or Zoho Books for the time before Janus.`}>
    {data.loading ? <p className="text-sm text-muted-foreground" role="status">Loading…</p>
      : data.error ? <p className="text-sm text-danger">{data.error}</p>
      : <ul className="flex flex-col divide-y divide-border">{(data.data?.companies ?? []).map((item) => <li key={item.companyId} className="flex flex-col gap-2 py-3 text-sm first:pt-0 last:pb-0">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="font-medium">{item.company}</span>
          {item.before === 0 ? <span className="text-muted-foreground">No customers on record for the twelve months before. Import a customer-wise report to see who was kept.</span>
            : <><span className={`tabular-nums font-medium ${item.rate! >= 70 ? "text-success" : item.rate! >= 50 ? "text-warning" : "text-danger"}`}>{item.rate}% kept</span><span className="text-muted-foreground">{item.kept} of {item.before} came back · {item.new} new · {item.lostCount} stopped buying</span></>}
          {item.imported && <span className="text-xs text-muted-foreground">includes imported months</span>}</p>
        {item.lost.length > 0 && <div><p className="text-xs font-medium text-muted-foreground">Stopped buying, largest first</p><ul className="mt-1 flex flex-col gap-0.5">{item.lost.map((customer) => <li key={customer.name} className="flex flex-wrap justify-between gap-2 text-xs"><span>{customer.name}</span><span className="tabular-nums text-muted-foreground">{inr(Number(customer.salesBefore))} the year before · last bought {monthName(customer.lastBought)}</span></li>)}</ul>{item.lostCount > item.lost.length && <p className="mt-1 text-xs text-muted-foreground">and {item.lostCount - item.lost.length} more.</p>}</div>}
      </li>)}</ul>}
    {editable.length > 0 && <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <label className="grid gap-1 text-xs text-muted-foreground">Company<select className="h-9 rounded-md border border-input bg-surface-2 px-2 text-sm text-foreground" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{editable.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs text-muted-foreground">From<select className="h-9 rounded-md border border-input bg-surface-2 px-2 text-sm text-foreground" value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="tally">Tally</option><option value="zoho">Zoho Books</option><option value="other">Another system</option></select></label>
      <label className={`inline-flex h-9 cursor-pointer items-center rounded-md border border-border px-3 text-sm ${busy ? "opacity-50" : ""}`}>Import customer-wise sales (CSV)<input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy || !companyId} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /></label>
      <p className="w-full text-xs text-muted-foreground">Tally&apos;s party-wise sales register with a column per month, or any report with a customer, a month and sales, saved as CSV.</p>
    </div>}
  </SectionCard>;
}
