import { useMemo } from "react";
import { useHrOperationsStore, type HrHoliday } from "@/lib/stores/hr-operations-store";

/** Sample 2026 list for the demo. HR edits it in the Holiday Calendar. "optional" holidays can be taken as leave. */
const h = (date: string, name: string, kind: HrHoliday["kind"]): HrHoliday => ({ id: `hol-${date}`, date, name, kind });
export const defaultHolidays: HrHoliday[] = [
  h("2026-01-14", "Pongal", "optional"), h("2026-01-23", "Vasant Panchami", "optional"), h("2026-01-26", "Republic Day", "company"),
  h("2026-02-15", "Maha Shivaratri", "optional"),
  h("2026-03-19", "Ugadi / Gudi Padwa", "optional"), h("2026-03-21", "Id-ul-Fitr", "company"), h("2026-03-26", "Ram Navami", "optional"), h("2026-03-31", "Mahavir Jayanti", "optional"),
  h("2026-04-03", "Good Friday", "company"),
  h("2026-05-01", "Buddha Purnima", "optional"), h("2026-05-28", "Id-ul-Zuha", "company"),
  h("2026-06-26", "Muharram", "optional"),
  h("2026-08-15", "Independence Day", "company"), h("2026-08-26", "Onam", "optional"), h("2026-08-28", "Raksha Bandhan", "company"),
  h("2026-09-04", "Janmashtami", "optional"), h("2026-09-14", "Ganesh Chaturthi", "optional"),
  h("2026-10-02", "Gandhi Jayanti", "company"), h("2026-10-20", "Dussehra", "company"), h("2026-10-29", "Karva Chauth", "optional"),
  h("2026-11-08", "Diwali", "company"), h("2026-11-09", "Govardhan Puja", "optional"), h("2026-11-11", "Bhai Dooj", "optional"), h("2026-11-15", "Chhath Puja", "optional"),
  h("2026-12-24", "Christmas Eve", "optional"), h("2026-12-25", "Christmas Day", "company"),
];

export function mergeHolidays(custom: HrHoliday[], removed: string[]) {
  return [...defaultHolidays.filter((item) => !removed.includes(item.id)), ...custom].sort((a, b) => a.date.localeCompare(b.date));
}

export function useHolidays() {
  const custom = useHrOperationsStore((state) => state.customHolidays);
  const removed = useHrOperationsStore((state) => state.removedHolidays);
  return useMemo(() => mergeHolidays(custom, removed), [custom, removed]);
}

/** Dates on which the company is closed. Optional holidays are working days unless someone takes leave. */
export function useCompanyHolidayDates() {
  const holidays = useHolidays();
  return useMemo(() => new Set(holidays.filter((item) => item.kind === "company").map((item) => item.date)), [holidays]);
}
