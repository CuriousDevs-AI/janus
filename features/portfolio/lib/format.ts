/** How the Portfolio writes money, days and changes. */

/** Rupees the way an Indian owner reads them: ₹12,500 below a lakh, then ₹4.2L and ₹1.3Cr. */
export function inr(value: number): string {
  // A loss reads −₹3L, never ₹-3L.
  if (value < 0 && inr(-value) !== "₹0") return `−${inr(-value)}`;
  // Rounded half up on whole tenths, like the weekly email: ₹1.65L reads ₹1.7L, not toFixed's ₹1.6L.
  const tenths = (unit: number) => String(Math.round(value / (unit / 10)) / 10);
  if (Math.abs(value) >= 1e7) return `₹${tenths(1e7)}Cr`;
  if (Math.abs(value) >= 1e5) return `₹${tenths(1e5)}L`;
  return `₹${Math.round(Math.abs(value) < 0.5 ? 0 : value).toLocaleString("en-IN")}`;
}

/** 2026-10-26 as 26 Oct 2026, read as a day in India. */
export const day = (iso: string) => new Date(`${iso}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** A moment as Monday, 2 Nov, 9:00 am in India. */
export const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Today's date in India, as 2026-11-02. */
export const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** The change against the same days before, in words a reader can check against the two figures. */
export function change(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "Same as before" : "None in the same days before";
  const percent = Math.round(((current - previous) / previous) * 100);
  return percent === 0 ? "Same as before" : `${percent > 0 ? "+" : ""}${percent}% on the same days before`;
}

export const severityTone = { high: "danger", medium: "warning", low: "neutral" } as const;
export const severityName = { high: "High", medium: "Medium", low: "Low" } as const;
export const healthTone = { red: "danger", amber: "warning", green: "success" } as const;
export const healthName = { red: "Needs you", amber: "Watch", green: "On track" } as const;
