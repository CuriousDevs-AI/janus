"use client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export function SecretValue({
  title,
  value,
  once = false,
}: {
  title: string;
  value: string;
  once?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 border border-border bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast.success("Copied");
            } catch {
              toast.error("Select and copy the text manually.");
            }
          }}
        >
          Copy
        </Button>
      </div>
      {once && (
        <p className="text-xs text-warning">
          Shown only now. Copy this before leaving the page.
        </p>
      )}
      <Textarea
        aria-label={title}
        readOnly
        value={value}
        rows={value.includes("\n") ? 6 : 2}
        className="font-mono text-xs"
      />
    </div>
  );
}
