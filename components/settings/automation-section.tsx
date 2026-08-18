"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { SectionCard, SettingRow } from "@/components/settings/section-ui";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export function AutomationSection() {
  const [aiCanTrigger, setAiCanTrigger] = React.useState(true);
  const [requireApproval, setRequireApproval] = React.useState(true);

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Automation policy" description="Controls what AI agents are allowed to automate without a human in the loop.">
        <SettingRow label="Allow AI to trigger automations automatically" description="AI agents may start a workflow without an explicit human request.">
          <Switch checked={aiCanTrigger} onCheckedChange={setAiCanTrigger} />
        </SettingRow>
        <SettingRow label="Require approval for high-risk automation actions" description="Automations that touch billing, contracts or deletions pause for approval.">
          <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
        </SettingRow>
      </SectionCard>

      <SectionCard>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-foreground">Manage automations</p>
            <p className="text-[11.5px] text-muted-foreground">Build and monitor workflows that run across leads, deals and tickets.</p>
          </div>
          <Button variant="secondary" size="sm" asChild onClick={() => toast.success("Opening Automations…")}>
            <Link href="/automations">
              Go to Automations
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
