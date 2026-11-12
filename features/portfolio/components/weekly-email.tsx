"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/settings/section-ui";
import { api, message } from "@/lib/api/client";
import { usePortfolioApi } from "@/features/portfolio/lib/use-portfolio-api";
import { when } from "@/features/portfolio/lib/format";
import type { PortfolioDigest } from "@/features/portfolio/types";

/** The person's own Monday email of this page, with a preview of what it would say today. */
export function WeeklyEmail() {
  const setting = usePortfolioApi<PortfolioDigest>("/portfolio/digest");
  const [saving, setSaving] = React.useState(false);
  const [preview, setPreview] = React.useState<{ subject: string; body: string } | null>(null);
  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      await api("/portfolio/digest", { method: "PUT", body: JSON.stringify({ enabled }) });
      toast.success(enabled ? "Weekly email turned on." : "Weekly email turned off.");
      setting.reload();
    } catch (failure) {
      toast.error(message(failure));
    }
    setSaving(false);
  };
  // Building the email reads every company, which takes a moment: say so, and ignore a second click.
  const [opening, setOpening] = React.useState(false);
  const show = async () => {
    if (opening) return;
    setOpening(true);
    try { setPreview(await api("/portfolio/digest/preview")); } catch (failure) { toast.error(message(failure)); }
    setOpening(false);
  };
  const data = setting.data;
  if (!data?.eligible) return null;
  return <SectionCard title="Weekly email" description="Every Monday at 9 am, the week across these companies, sent to you alone. Owners get it unless they turn it off." action={<div className="flex gap-2"><Button size="sm" variant="outline" disabled={opening} onClick={() => void show()}>{opening ? "Preparing…" : "Preview"}</Button><Button size="sm" variant={data.enabled ? "secondary" : "default"} disabled={saving} onClick={() => void toggle(!data.enabled)}>{data.enabled ? "Turn off" : "Turn on"}</Button></div>}>
    <p className="text-sm text-muted-foreground" role="status">{data.enabled && data.nextDueAt ? `On. Next one ${when(data.nextDueAt)}.` : "Off."}{data.lastSentAt ? ` Last sent ${when(data.lastSentAt)}.` : ""}</p>
    {preview && <Dialog open onOpenChange={(value) => !value && setPreview(null)}><DialogContent><DialogHeader><DialogTitle>{preview.subject}</DialogTitle><DialogDescription>What the email would say if it went out now.</DialogDescription></DialogHeader><pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap border border-border bg-surface-2 p-3 text-xs leading-5">{preview.body}</pre></DialogContent></Dialog>}
  </SectionCard>;
}
