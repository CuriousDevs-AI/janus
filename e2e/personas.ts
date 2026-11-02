/**
 * The people in the end-to-end suite. See PERSONAS.md for who they are and what each wants from Janus.
 * Each run gets its own email addresses, so runs never collide.
 */
export type Role = "owner" | "admin" | "manager" | "agent" | "group_finance";
export type Department = "Sales" | "Finance" | "Operations" | "Projects" | "IT";

export interface Person {
  key: string;
  name: string;
  title: string;
  role: Role;
  department?: Department;
  managerKey?: string;
  salary?: number;
}

export const COMPANIES = [
  { key: "textiles", name: "Malhotra Textiles", industry: "Textile manufacturing" },
  { key: "foods", name: "Malhotra Foods", industry: "Food distribution" },
  { key: "tech", name: "Malhotra Tech Services", industry: "IT services" },
] as const;
export type CompanyKey = (typeof COMPANIES)[number]["key"];

export const OWNER: Person = { key: "vikram", name: "Vikram Malhotra", title: "Managing Director", role: "owner" };
export const HR_HEAD: Person = { key: "shalini", name: "Shalini Rao", title: "Head of HR", role: "admin", managerKey: "vikram", salary: 180000 };
export const GROUP_CFO: Person = { key: "anita", name: "Anita Bose", title: "Group CFO", role: "group_finance" };
/** Runs Malhotra Foods day to day, and belongs to no other company. */
export const FOODS_MANAGER: Person = { key: "foodsmgr", name: "Sameer Kulkarni", title: "General Manager, Foods", role: "manager" };

/** Five departments of three: one head and two staff, fifteen people in all. */
export const EMPLOYEES: Person[] = [
  { key: "arjun", name: "Arjun Mehta", title: "Sales Manager", role: "manager", department: "Sales", managerKey: "vikram", salary: 120000 },
  { key: "priya", name: "Priya Nair", title: "Sales Executive", role: "agent", department: "Sales", managerKey: "arjun", salary: 45000 },
  { key: "rohan", name: "Rohan Das", title: "Sales Executive", role: "agent", department: "Sales", managerKey: "arjun", salary: 42000 },
  { key: "meera", name: "Meera Iyer", title: "Finance Manager", role: "manager", department: "Finance", managerKey: "vikram", salary: 130000 },
  { key: "sneha", name: "Sneha Reddy", title: "Accountant", role: "agent", department: "Finance", managerKey: "meera", salary: 60000 },
  { key: "tarun", name: "Tarun Jain", title: "Accounts Payable Executive", role: "agent", department: "Finance", managerKey: "meera", salary: 40000 },
  { key: "karan", name: "Karan Singh", title: "Operations Manager", role: "manager", department: "Operations", managerKey: "vikram", salary: 110000 },
  { key: "deepak", name: "Deepak Kumar", title: "Store Keeper", role: "agent", department: "Operations", managerKey: "karan", salary: 32000 },
  { key: "sunita", name: "Sunita Yadav", title: "Purchase Executive", role: "agent", department: "Operations", managerKey: "karan", salary: 38000 },
  { key: "neha", name: "Neha Gupta", title: "Projects Manager", role: "manager", department: "Projects", managerKey: "vikram", salary: 125000 },
  { key: "aditya", name: "Aditya Mehra", title: "Project Coordinator", role: "agent", department: "Projects", managerKey: "neha", salary: 48000 },
  { key: "fatima", name: "Fatima Shaikh", title: "Site Engineer", role: "agent", department: "Projects", managerKey: "neha", salary: 52000 },
  { key: "imran", name: "Imran Khan", title: "IT Manager", role: "manager", department: "IT", managerKey: "vikram", salary: 115000 },
  { key: "rahul", name: "Rahul Verma", title: "Helpdesk Engineer", role: "agent", department: "IT", managerKey: "imran", salary: 40000 },
  { key: "pooja", name: "Pooja Sharma", title: "Systems Administrator", role: "agent", department: "IT", managerKey: "imran", salary: 55000 },
];

export const DEPARTMENTS: { name: Department; workspace: string; permission: string }[] = [
  { name: "Sales", workspace: "crm-sales", permission: "leads:read_own" },
  { name: "Finance", workspace: "finance-accounting", permission: "billing:manage" },
  { name: "Operations", workspace: "operations-inventory", permission: "stock:adjust" },
  { name: "Projects", workspace: "projects-delivery", permission: "projects:manage" },
  { name: "IT", workspace: "it-infrastructure", permission: "settings:manage" },
];

export const person = (key: string) => {
  const found = [OWNER, HR_HEAD, GROUP_CFO, FOODS_MANAGER, ...EMPLOYEES].find((item) => item.key === key);
  if (!found) throw new Error(`No persona called ${key}`);
  return found;
};
