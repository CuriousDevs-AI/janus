"use client";

import * as React from "react";
import { toast } from "sonner";
import { agents } from "@/lib/mock-data";
import { channelMeta } from "@/lib/status-meta";
import { SectionCard, SettingRow, FieldRow } from "@/components/settings/section-ui";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ChannelType } from "@/lib/types";

const allowedChannelOptions: ChannelType[] = ["website_chat", "email", "whatsapp"];
const models = ["Claude Sonnet 5", "Claude Opus 5", "Claude Haiku 4.5"];

export function AISection() {
  const [handoffEnabled, setHandoffEnabled] = React.useState(true);
  const [respectHours, setRespectHours] = React.useState(true);
  const [channels, setChannels] = React.useState<ChannelType[]>(["website_chat", "email", "whatsapp"]);
  const [discountThreshold, setDiscountThreshold] = React.useState("15");
  const [refundThreshold, setRefundThreshold] = React.useState("25000");
  const [model, setModel] = React.useState(models[0]);
  const [defaultAgentId, setDefaultAgentId] = React.useState(agents[0]?.id ?? "");
  const [temperature, setTemperature] = React.useState("0.4");

  function toggleChannel(channel: ChannelType) {
    setChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]));
  }

  function handleSave() {
    toast.success("AI policy saved", { description: "Global AI behavior rules were updated." });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Global AI policy" description="Rules that apply to every AI agent across the workspace.">
        <SettingRow label="Human handoff enabled" description="Allow AI agents to hand off conversations to a human.">
          <Switch checked={handoffEnabled} onCheckedChange={setHandoffEnabled} />
        </SettingRow>
        <SettingRow label="Respect business hours" description="Pause proactive AI outreach outside working hours.">
          <Switch checked={respectHours} onCheckedChange={setRespectHours} />
        </SettingRow>
        <SettingRow label="Allowed channels" description="Channels AI agents are permitted to operate on.">
          <div className="flex items-center gap-4">
            {allowedChannelOptions.map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-[12px] text-foreground">
                <Checkbox checked={channels.includes(c)} onCheckedChange={() => toggleChannel(c)} />
                {channelMeta[c].label}
              </label>
            ))}
          </div>
        </SettingRow>
      </SectionCard>

      <SectionCard title="Approval thresholds" description="Actions above these thresholds require human approval.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Discount approval threshold (%)">
            <Input
              type="number"
              min={0}
              max={100}
              value={discountThreshold}
              onChange={(e) => setDiscountThreshold(e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Refund approval threshold (₹)">
            <Input
              type="number"
              min={0}
              value={refundThreshold}
              onChange={(e) => setRefundThreshold(e.target.value)}
            />
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard title="Model defaults" description="Default model and agent used for new conversations.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FieldRow label="Default model">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Default agent">
            <Select value={defaultAgentId} onValueChange={setDefaultAgentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Temperature">
            <Input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />
          </FieldRow>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Save changes</Button>
      </div>
    </div>
  );
}
