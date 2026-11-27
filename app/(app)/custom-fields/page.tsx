"use client";

import { Hash, Calendar, Type, ChevronDown, ListChecks, ToggleLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CustomFieldsSettings } from "@/components/crm/custom-fields-settings";

const FIELD_TYPE_ICONS = [
  { icon: Type, label: "Text", desc: "Free-form text" },
  { icon: Hash, label: "Number", desc: "Numeric values" },
  { icon: Calendar, label: "Date", desc: "Date picker" },
  { icon: ChevronDown, label: "Dropdown", desc: "Pick from options" },
  { icon: ToggleLeft, label: "Yes/No", desc: "Boolean toggle" },
];

export default function CustomFieldsPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Custom Fields"
        description="Add custom fields to leads, customers and deals to capture the data your business needs."
      />
      <div className="px-6 pb-4">
        <div className="flex gap-2 overflow-x-auto">
          {FIELD_TYPE_ICONS.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shrink-0">
              <Icon className="size-4 text-accent" />
              <div>
                <span className="text-xs font-medium">{label}</span>
                <span className="block text-[10px] text-muted-foreground">{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-2">
        <CustomFieldsSettings />
      </div>
    </div>
  );
}
