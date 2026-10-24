import type { HrPolicySettings } from "@/lib/stores/hr-operations-store";

export const toMinutes = (time: string) => { const [hours, minutes] = time.split(":").map(Number); return hours * 60 + minutes; };
export const nowIst = () => new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
export const shiftLabel = (settings: HrPolicySettings) => `${settings.shiftStart}–${settings.shiftEnd}`;

/** Status, note and overtime for a day's punches under the current shift policy. */
export function classify(checkIn: string | null, checkOut: string | null, settings: HrPolicySettings) {
  if (!checkIn) return { status: "absent" as const, anomaly: "No punch received", overtimeHours: 0 };
  const lateBy = toMinutes(checkIn) - toMinutes(settings.shiftStart);
  const late = lateBy > settings.graceMinutes;
  let overtimeHours = 0;
  let anomaly: string | null = late ? `Late by ${lateBy} minutes` : null;
  if (checkOut) {
    // Overtime counts only time actually worked after the shift ends, so a late arrival does not earn any.
    const over = toMinutes(checkOut) - Math.max(toMinutes(settings.shiftEnd), toMinutes(checkIn));
    const early = toMinutes(settings.shiftEnd) - toMinutes(checkOut);
    if (over >= 30) overtimeHours = Math.round(over / 30) / 2;
    else if (early > 30 && !anomaly) anomaly = `Left ${early} minutes early`;
  }
  return { status: late ? ("late" as const) : ("present" as const), anomaly, overtimeHours };
}
