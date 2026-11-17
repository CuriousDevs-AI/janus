/** Today as YYYY-MM-DD in India time. */
export const todayIso = (): string =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
