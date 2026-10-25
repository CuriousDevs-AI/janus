import type { HrEmployee } from "@/lib/types";
import type { EngageItem } from "@/lib/stores/hr-engage-store";

export const kudosValues = ["Teamwork", "Customer first", "Ownership", "Going the extra mile", "Learning", "Kindness"] as const;
export const reactionEmojis = ["👍", "👏", "🎉", "❤️"] as const;

export type DerivedKind = "birthday" | "anniversary" | "newcomer";
export interface DerivedItem { id: string; kind: DerivedKind; employee: HrEmployee; date: string; text: string; years?: number }

const dayDiff = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);

/** Birthdays, work anniversaries and new joiners come from employee records, so nobody has to post them. */
export function derivedCelebrations(employees: HrEmployee[], today: string, window = 7): DerivedItem[] {
  const year = Number(today.slice(0, 4));
  const out: DerivedItem[] = [];
  for (const employee of employees.filter((item) => item.status !== "archived")) {
    if (employee.birthDate) {
      const date = `${year}-${employee.birthDate.slice(5)}`;
      const diff = dayDiff(today, date);
      if (diff >= -1 && diff <= window) out.push({ id: `birthday:${employee.id}:${year}`, kind: "birthday", employee, date, text: diff === 0 ? `It's ${employee.name.split(" ")[0]}'s birthday today!` : diff < 0 ? `${employee.name.split(" ")[0]}'s birthday was yesterday.` : `${employee.name.split(" ")[0]}'s birthday is on ${new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.` });
    }
    const anniversary = `${year}-${employee.joiningDate.slice(5)}`;
    const years = year - Number(employee.joiningDate.slice(0, 4));
    const diff = dayDiff(today, anniversary);
    if (years >= 1 && diff >= -1 && diff <= window) out.push({ id: `anniversary:${employee.id}:${year}`, kind: "anniversary", employee, date: anniversary, years, text: `${employee.name.split(" ")[0]} completes ${years} ${years === 1 ? "year" : "years"} with the company${diff === 0 ? " today" : ""}.` });
    const since = dayDiff(employee.joiningDate, today);
    if (since >= 0 && since <= 30) out.push({ id: `newcomer:${employee.id}`, kind: "newcomer", employee, date: employee.joiningDate, text: `Welcome ${employee.name.split(" ")[0]}, our new ${employee.title} in ${employee.department}.` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} ${days === 1 ? "day" : "days"} ago` : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export const itemGroups = (items: EngageItem[], employees: HrEmployee[]) => ["all", ...new Set([...items.map((item) => item.group).filter((group) => group !== "all"), ...employees.map((item) => item.department)])];
