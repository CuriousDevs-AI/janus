import { pipelineFunnel } from "@/lib/mock-data";
import { formatCurrencyINR, formatNumber } from "@/lib/utils";

export function PipelineStrip() {
  const max = Math.max(...pipelineFunnel.map((s) => s.count));
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-semibold text-foreground">Pipeline</h2>
        <span className="text-[11px] text-muted-foreground">By stage · last 30 days</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
        {pipelineFunnel.map((s) => (
          <div key={s.stage} className="flex flex-col gap-2 bg-surface px-4 py-3.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.stage}</span>
            <span className="text-mono text-[20px] font-semibold text-foreground">{formatNumber(s.count)}</span>
            <div className="h-1 w-full bg-surface-3">
              <div className="h-1 bg-accent" style={{ width: `${(s.count / max) * 100}%` }} />
            </div>
            <span className="text-[11px] text-muted-foreground">
              {formatCurrencyINR(s.value ?? 0)} {s.conversion !== undefined && <>· {s.conversion}%</>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
