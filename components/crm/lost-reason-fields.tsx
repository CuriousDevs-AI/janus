"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type LostCategory, lostReasons } from "@/lib/lost-reasons";

/** The reason a lead or deal was lost, from the short list, and a note; "Other" needs the note. */
export function LostReasonFields({
  id,
  category,
  note,
  onChange,
}: {
  id: string;
  category: LostCategory | "";
  note: string;
  onChange: (category: LostCategory | "", note: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-danger/30 bg-danger/5 p-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-category`}>Why was it lost?</Label>
        <select
          id={`${id}-category`}
          required
          value={category}
          onChange={(event) => onChange(event.target.value as LostCategory | "", note)}
          className="h-8 w-full rounded-md border border-input bg-surface-2 px-2 text-sm focus:ring-2 focus:ring-ring"
        >
          <option value="" disabled>Choose a reason</option>
          {lostReasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-note`}>{category === "other" ? "What happened" : "What happened (optional)"}</Label>
        <Input
          id={`${id}-note`}
          required={category === "other"}
          maxLength={1000}
          value={note}
          placeholder={category === "competitor" ? "Which competitor, and why they chose them" : category === "price" ? "What they expected to pay" : "A line the team can learn from"}
          onChange={(event) => onChange(category, event.target.value)}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">Counted in Why leads are lost on the CRM overview, so the team can fix the most common reason.</p>
    </div>
  );
}
