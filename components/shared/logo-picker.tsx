"use client";

import * as React from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/shared/company-logo";
import { readLogo } from "@/lib/company-logo";

/** Choose, preview and remove a company logo. */
export function LogoPicker({ id, name, value, onChange }: { id: string; name: string; value?: string; onChange: (logo: string | undefined) => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try { onChange(await readLogo(file)); } catch (error) { toast.error(error instanceof Error ? error.message : "That image could not be used."); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div className="flex items-center gap-4">
      <CompanyLogo company={{ id, name: name || "Company", logo: value }} size={56} className="rounded-lg" />
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><ImagePlus className="mr-1 size-4" aria-hidden />{value ? "Change logo" : "Upload logo"}</Button>
          {value && <Button type="button" size="sm" variant="ghost" onClick={() => onChange(undefined)}><Trash2 className="mr-1 size-4" aria-hidden />Remove</Button>}
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPG or WebP, up to 3 MB. Shown in the sidebar and the company menu.</p>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Company logo" onChange={(event) => void pick(event.target.files?.[0])} />
      </div>
    </div>
  );
}
