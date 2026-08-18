"use client";

import * as React from "react";
import { toast } from "sonner";
import { tenant } from "@/lib/mock-data";
import { SectionCard, FieldRow } from "@/components/settings/section-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ChannelType } from "@/lib/types";

const industries = ["B2B SaaS", "E-commerce", "Fintech", "Healthtech", "Logistics", "Manufacturing", "Other"];

const timezones = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "America/New_York", label: "America/New York (ET)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
  { value: "UTC", label: "UTC" },
];

const defaultChannelOptions: { value: ChannelType; label: string }[] = [
  { value: "website_chat", label: "Website Chat" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
];

export function WorkspaceSection() {
  const [companyName, setCompanyName] = React.useState(tenant.name);
  const [industry, setIndustry] = React.useState(tenant.industry);
  const [timezone, setTimezone] = React.useState(tenant.timezone);
  const [hoursStart, setHoursStart] = React.useState(tenant.businessHours.start);
  const [hoursEnd, setHoursEnd] = React.useState(tenant.businessHours.end);
  const [defaultChannel, setDefaultChannel] = React.useState<ChannelType>(tenant.defaultChannel);

  function handleSave() {
    toast.success("Workspace settings saved");
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Company" description="Basic information about your workspace.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Company name">
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </FieldRow>
          <FieldRow label="Industry">
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {industries.map((i) => (
                  <SelectItem key={i} value={i}>
                    {i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard title="Locale & hours" description="Timezone and business hours used for scheduling and AI handoff rules.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Timezone">
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Default communication channel">
            <Select value={defaultChannel} onValueChange={(v) => setDefaultChannel(v as ChannelType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {defaultChannelOptions.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Business hours start">
            <Input type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} />
          </FieldRow>
          <FieldRow label="Business hours end">
            <Input type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} />
          </FieldRow>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Save changes</Button>
      </div>
    </div>
  );
}
