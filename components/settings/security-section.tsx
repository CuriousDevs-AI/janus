"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { SectionCard, SettingRow, FieldRow } from "@/components/settings/section-ui";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const sessionTimeouts = [
  { value: "15m", label: "15 minutes" },
  { value: "30m", label: "30 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "never", label: "Never" },
];

function randomKeySuffix() {
  return Math.random().toString(16).slice(2, 6);
}

export function SecuritySection() {
  const [sessionTimeout, setSessionTimeout] = React.useState("1h");
  const [require2fa, setRequire2fa] = React.useState(true);
  const [apiKeySuffix, setApiKeySuffix] = React.useState("4f2a");

  function regenerateKey() {
    setApiKeySuffix(randomKeySuffix());
    toast.success("API key regenerated", { description: "The previous key was revoked immediately." });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Session & access" description="Session lifetime and multi-factor authentication requirements.">
        <SettingRow label="Session timeout" description="How long a session stays active without activity.">
          <Select value={sessionTimeout} onValueChange={setSessionTimeout}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sessionTimeouts.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Require 2FA for admins" description="Owner and admin roles must enroll in two-factor authentication.">
          <Switch aria-label="Require 2FA for admins" checked={require2fa} onCheckedChange={setRequire2fa} />
        </SettingRow>
      </SectionCard>

      <SectionCard title="API access" description="Used by server-to-server integrations to authenticate with Janus.">
        <FieldRow label="API key">
          <div className="flex items-center gap-2">
            <code className="text-mono flex-1 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-foreground">
              sk-janus-••••••••••••{apiKeySuffix}
            </code>
            <Button variant="secondary" size="sm" onClick={regenerateKey}>
              <RefreshCw className="size-3.5" />
              Regenerate
            </Button>
          </div>
        </FieldRow>
      </SectionCard>
    </div>
  );
}
