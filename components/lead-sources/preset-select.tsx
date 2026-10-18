import { webhookPresets } from "@/lib/mock-data/lead-sources";

export function PresetSelect({ value, onChange, callsOnly = false, id }: {
  value: string;
  onChange: (value: string) => void;
  callsOnly?: boolean;
  id: string;
}) {
  const groups = callsOnly ? ["Calls", "Custom"] : ["Calls", "Forms/ads", "Automation", "Custom"];
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-foreground">Provider preset</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full border border-border bg-surface-2 px-2.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {groups.map((group) => (
          <optgroup key={group} label={group}>
            {webhookPresets.filter((preset) => preset.group === group).map((preset) => (
              <option key={preset.value} value={preset.value}>{preset.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
