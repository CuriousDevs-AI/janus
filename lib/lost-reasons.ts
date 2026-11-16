/** Why a lead or deal was lost: the short list a sales manager counts. Matches the server's list. */
export const lostReasons = [
  { value: "price", label: "Price too high" },
  { value: "competitor", label: "Went with a competitor" },
  { value: "no_budget", label: "No budget" },
  { value: "no_response", label: "Stopped responding" },
  { value: "timing", label: "Not the right time" },
  { value: "not_a_fit", label: "Not a fit" },
  { value: "other", label: "Other" },
] as const;

export type LostCategory = (typeof lostReasons)[number]["value"];

export function lostLabel(category: string | null | undefined): string {
  return lostReasons.find((item) => item.value === category)?.label ?? "Other";
}

/** "Price too high: asked for 20% off", or just the reason, or just the note for older records. */
export function lostWords(category: string | null | undefined, note: string | null | undefined): string {
  const reason = category ? lostLabel(category) : "";
  const text = (note ?? "").trim();
  return reason && text && reason !== "Other" ? `${reason}: ${text}` : text || reason;
}
