"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { SectionCard, SettingRow } from "@/components/settings/section-ui";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export function KnowledgeSection() {
  const [autoPublish, setAutoPublish] = React.useState(false);
  const [requireReview, setRequireReview] = React.useState(true);

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Knowledge base" description="Controls how new documents enter the AI's knowledge base.">
        <SettingRow label="Auto-publish new documents" description="Skip manual review for newly uploaded documents.">
          <Switch
            checked={autoPublish}
            onCheckedChange={(v) => {
              setAutoPublish(v);
              if (v) setRequireReview(false);
            }}
          />
        </SettingRow>
        <SettingRow label="Require review before publishing" description="A team member must approve a document before AI agents can use it.">
          <Switch
            checked={requireReview}
            onCheckedChange={(v) => {
              setRequireReview(v);
              if (v) setAutoPublish(false);
            }}
          />
        </SettingRow>
      </SectionCard>

      <SectionCard>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-foreground">Manage documents</p>
            <p className="text-[11.5px] text-muted-foreground">Upload, version and audit the documents AI agents retrieve from.</p>
          </div>
          <Button variant="secondary" size="sm" asChild onClick={() => toast.success("Opening Knowledge base…")}>
            <Link href="/knowledge">
              Go to Knowledge
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
