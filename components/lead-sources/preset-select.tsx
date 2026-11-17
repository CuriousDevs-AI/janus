const webhookPresets = [
  { group: "Calls", value: "exotel", label: "Exotel" },
  { group: "Calls", value: "knowlarity", label: "Knowlarity" },
  { group: "Calls", value: "ozonetel", label: "Ozonetel" },
  { group: "Calls", value: "servetel", label: "Servetel" },
  { group: "Forms/ads", value: "facebook_leads", label: "Facebook Lead Ads" },
  { group: "Forms/ads", value: "google_ads", label: "Google Ads" },
  { group: "Forms/ads", value: "indiamart", label: "IndiaMART" },
  { group: "Forms/ads", value: "justdial", label: "JustDial" },
  { group: "Forms/ads", value: "tradeindia", label: "TradeIndia" },
  { group: "Automation", value: "zapier", label: "Zapier" },
  { group: "Automation", value: "make", label: "Make (Integromat)" },
  { group: "Automation", value: "pabbly", label: "Pabbly Connect" },
  { group: "Custom", value: "custom_webhook", label: "Custom Webhook" },
  { group: "Custom", value: "custom_api", label: "Custom API" },
];

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
