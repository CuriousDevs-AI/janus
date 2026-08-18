"use client";

import * as React from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/settings/section-ui";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { NotificationCategory } from "@/lib/types";

const categories: { key: NotificationCategory; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "support", label: "Support" },
  { key: "ai", label: "AI" },
  { key: "automation", label: "Automation" },
  { key: "system", label: "System" },
];

const notifChannels = ["In-app", "Email", "Slack", "WhatsApp"] as const;
type NotifChannel = (typeof notifChannels)[number];

type Matrix = Record<NotificationCategory, Record<NotifChannel, boolean>>;

const initialMatrix: Matrix = {
  sales: { "In-app": true, Email: true, Slack: false, WhatsApp: false },
  support: { "In-app": true, Email: true, Slack: true, WhatsApp: false },
  ai: { "In-app": true, Email: false, Slack: true, WhatsApp: false },
  automation: { "In-app": true, Email: false, Slack: false, WhatsApp: false },
  system: { "In-app": true, Email: true, Slack: false, WhatsApp: false },
};

export function NotificationsSection() {
  const [matrix, setMatrix] = React.useState<Matrix>(initialMatrix);

  function toggle(category: NotificationCategory, channel: NotifChannel) {
    setMatrix((prev) => ({
      ...prev,
      [category]: { ...prev[category], [channel]: !prev[category][channel] },
    }));
  }

  function handleSave() {
    toast.success("Notification preferences saved");
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Notification matrix" description="Choose where each category of notification is delivered.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Category
                </th>
                {notifChannels.map((c) => (
                  <th
                    key={c}
                    className="py-2 px-3 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.key} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-3 text-foreground">{cat.label}</td>
                  {notifChannels.map((c) => (
                    <td key={c} className="py-2.5 px-3 text-center">
                      <Switch checked={matrix[cat.key][c]} onCheckedChange={() => toggle(cat.key, c)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Save changes</Button>
      </div>
    </div>
  );
}
