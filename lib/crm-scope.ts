import { demoAccounts, type DemoAccount } from "@/lib/demo-accounts";
import { useHrPeopleStore } from "@/lib/stores/hr-people-store";

/** Every employee who reports to this person, directly or further down. */
function reportsOf(employeeId: string) {
  const employees = useHrPeopleStore.getState().employees;
  const found = new Set<string>();
  const walk = (managerId: string) => employees.filter((item) => item.managerId === managerId && item.status !== "archived").forEach((item) => { if (!found.has(item.id)) { found.add(item.id); walk(item.id); } });
  walk(employeeId);
  return found;
}

/** The CRM user ids whose records this person may see. Null means everyone's. */
export function visibleOwners(account: DemoAccount | undefined): Set<string> | null {
  if (!account) return new Set();
  if (account.crm === "all") return null;
  if (account.crm === "own") return new Set([account.crmUserId]);
  if (account.crm === "team") {
    const team = reportsOf(account.employeeId);
    return new Set([account.crmUserId, ...demoAccounts.filter((item) => team.has(item.employeeId)).map((item) => item.crmUserId)]);
  }
  return new Set();
}

/** Can this person see a record owned by `ownerId`? Unowned records are only for people who see everything. */
export function canSeeOwner(account: DemoAccount | undefined, ownerId: string | null | undefined) {
  const owners = visibleOwners(account);
  return owners === null || Boolean(ownerId && owners.has(ownerId));
}
