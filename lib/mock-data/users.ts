import type { Tenant, User } from "@/lib/types";

export const tenant: Tenant = {
  id: "tenant-1",
  name: "Acme Traders Pvt Ltd",
  industry: "FMCG & household goods distribution",
  companySize: "11-50",
  timezone: "Asia/Kolkata",
  businessHours: { start: "09:00", end: "18:00" },
  defaultChannel: "whatsapp",
  plan: "growth",
  environment: "demo",
};

/** The same people as the HR demo employees. */
export const currentUser: User = {
  id: "u-1",
  name: "Pankaj Neema",
  email: "pankaj@acmetraders.in",
  role: "owner",
  title: "Owner",
  avatarColor: "#0284C7",
  online: true,
};

export const users: User[] = [
  currentUser,
  { id: "u-2", name: "Meera Singh", email: "meera@acmetraders.in", role: "sales_agent", title: "Sales Executive", avatarColor: "#7C3AED", online: true },
  { id: "u-3", name: "Riya Kapoor", email: "riya@acmetraders.in", role: "sales_agent", title: "Account Executive", avatarColor: "#D97706", online: true },
  { id: "u-4", name: "Arjun Mehta", email: "arjun@acmetraders.in", role: "sales_manager", title: "Sales Manager", avatarColor: "#16A34A", online: false },
  { id: "u-5", name: "Karan Bhatt", email: "karan@acmetraders.in", role: "support_agent", title: "Customer Support Lead", avatarColor: "#DC2626", online: true },
  { id: "u-6", name: "Shaista Khan", email: "shaista@acmetraders.in", role: "admin", title: "HR Manager", avatarColor: "#0891B2", online: true },
  { id: "u-7", name: "Aman Verma", email: "aman@acmetraders.in", role: "finance", title: "Finance Executive", avatarColor: "#4F46E5", online: false },
];

export function getUserById(id?: string): User | undefined {
  if (!id) return undefined;
  return users.find((u) => u.id === id);
}
