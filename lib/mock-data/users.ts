import type { Tenant, User } from "@/lib/types";

export const tenant: Tenant = {
  id: "tenant-1",
  name: "CuriousDevs",
  industry: "B2B SaaS",
  companySize: "11-50",
  timezone: "Asia/Kolkata",
  businessHours: { start: "09:00", end: "18:00" },
  defaultChannel: "email",
  plan: "growth",
  environment: "demo",
};

export const currentUser: User = {
  id: "u-1",
  name: "Pankaj",
  email: "pankaj200321@gmail.com",
  role: "owner",
  title: "Founder",
  avatarColor: "#0284C7",
  online: true,
};

export const users: User[] = [
  currentUser,
  {
    id: "u-2",
    name: "Aman Verma",
    email: "aman@curiousdevs.ai",
    role: "sales_agent",
    title: "Sales Executive",
    avatarColor: "#7C3AED",
    online: true,
  },
  {
    id: "u-3",
    name: "Riya Kapoor",
    email: "riya@curiousdevs.ai",
    role: "sales_agent",
    title: "Sales Executive",
    avatarColor: "#D97706",
    online: true,
  },
  {
    id: "u-4",
    name: "Karan Bhatt",
    email: "karan@curiousdevs.ai",
    role: "sales_manager",
    title: "Sales Manager",
    avatarColor: "#16A34A",
    online: false,
  },
  {
    id: "u-5",
    name: "Sana Iyer",
    email: "sana@curiousdevs.ai",
    role: "support_agent",
    title: "Support Engineer",
    avatarColor: "#DC2626",
    online: true,
  },
  {
    id: "u-6",
    name: "Neha Joshi",
    email: "neha@curiousdevs.ai",
    role: "support_agent",
    title: "Support Engineer",
    avatarColor: "#DB2777",
    online: false,
  },
  {
    id: "u-7",
    name: "Vikram Rao",
    email: "vikram@curiousdevs.ai",
    role: "finance",
    title: "Finance Lead",
    avatarColor: "#475569",
    online: false,
  },
];

export function getUserById(id?: string): User | undefined {
  if (!id) return undefined;
  return users.find((u) => u.id === id);
}
