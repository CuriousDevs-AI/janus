import { demoMode } from "@/lib/demo-mode";

/** The demo keeps its fixed day, so its figures stay the same. A real account uses today's date in India. */
const DEMO_DAY = "2026-10-23";

/** Today as YYYY-MM-DD in India time. */
export const todayIso = (): string =>
  demoMode ? DEMO_DAY : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
