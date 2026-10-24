import type { DemoAccount } from "@/lib/demo-accounts";
import type { HrEmployee } from "@/lib/types";
import type { CompanySpec } from "@/lib/companies/spec";

const employee = (id: string, name: string, email: string, title: string, department: string, managerId: string | null, managerName: string | null, salaryMonthly: number, joiningDate: string, color: string, birthDate: string): HrEmployee => ({ id, name, email, phone: `+91 98${id.slice(-1)}0${id.slice(-1)}1 2${id.slice(-1)}4${id.slice(-1)}0`, title, department, branch: "Bengaluru", managerId, managerName, status: "active", employmentType: "full_time", joiningDate, location: "Bengaluru", avatarColor: color, salaryMonthly, onboardingPercent: 100, documentsDue: 0, birthDate });
const employees: HrEmployee[] = [
  employee("emp-001", "Pankaj Neema", "pankaj@nimbusstudio.in", "Founder", "Management", null, null, 150000, "2021-06-01", "#0284c7", "1985-12-02"),
  employee("emp-002", "Zoya Khan", "zoya@nimbusstudio.in", "Finance and HR Manager", "People", "emp-001", "Pankaj Neema", 72000, "2022-03-14", "#0891b2", "1990-02-09"),
  employee("emp-003", "Tanya Menon", "tanya@nimbusstudio.in", "Account Manager", "Client Services", "emp-001", "Pankaj Neema", 95000, "2021-09-20", "#7c3aed", "1989-08-23"),
  employee("emp-004", "Ishaan Rao", "ishaan@nimbusstudio.in", "Creative Director", "Creative", "emp-001", "Pankaj Neema", 110000, "2021-07-05", "#d97706", "1987-11-30"),
  employee("emp-005", "Dev Arora", "dev@nimbusstudio.in", "Account Executive", "Client Services", "emp-003", "Tanya Menon", 48000, "2024-01-15", "#16a34a", "1996-04-12"),
  employee("emp-006", "Sneha Pillai", "sneha@nimbusstudio.in", "Graphic Designer", "Creative", "emp-004", "Ishaan Rao", 52000, "2023-05-22", "#db2777", "1997-10-28"),
];

const account = (id: string, email: string, password: string, name: string, title: string, employeeId: string, crmUserId: string, hrRole: DemoAccount["hrRole"], crm: DemoAccount["crm"], blurb: string): DemoAccount => ({ id, email, password, name, title, employeeId, crmUserId, hrRole, crm, blurb });
const accounts: DemoAccount[] = [
  account("owner", "pankaj@acmetraders.in", "Owner@123", "Pankaj Neema", "Founder", "emp-001", "u-1", "owner", "all", "Everything in this company."),
  account("sales-manager", "tanya@nimbusstudio.in", "Manager@123", "Tanya Menon", "Account Manager", "emp-003", "u-2", "reporting_manager", "team", "Clients and deals for her team, and her team's leave."),
  account("sales-rep-1", "dev@nimbusstudio.in", "Sales@123", "Dev Arora", "Account Executive", "emp-005", "u-3", "employee", "own", "Only his own leads, deals and clients."),
  account("hr", "zoya@nimbusstudio.in", "HR@12345", "Zoya Khan", "Finance and HR Manager", "emp-002", "u-4", "hr_manager", "none", "All of HR & People."),
  account("employee", "sneha@nimbusstudio.in", "Employee@123", "Sneha Pillai", "Graphic Designer", "emp-006", "u-6", "employee", "none", "Own leave, pay and documents only."),
];

export const nimbusSpec: CompanySpec = {
  id: "nimbus",
  company: { name: "Nimbus Digital Studio", short: "Nimbus", domain: "nimbusstudio.in", industry: "Digital marketing and web agency", city: "Bengaluru, Karnataka", gstin: "29AAECN4821K1Z7" },
  owners: { owner: { id: "u-1", name: "Pankaj Neema" }, tanya: { id: "u-2", name: "Tanya Menon" }, dev: { id: "u-3", name: "Dev Arora" } },
  buyers: [
    { id: "cus-1", company: "Fynd Fresh Foods", contact: "Aditi Rao", phone: "+91 98450 11230", email: "aditi@fyndfresh.in", city: "Bengaluru", kind: "Packaged food brand" },
    { id: "cus-2", company: "BlueOak Realty", contact: "Kunal Bhatia", phone: "+91 98860 20318", email: "kunal@blueoakrealty.in", city: "Bengaluru", kind: "Real estate developer" },
    { id: "cus-3", company: "Kiddo Toys", contact: "Preeti Hegde", phone: "+91 98440 77120", email: "preeti@kiddotoys.in", city: "Mysuru", kind: "D2C toys brand" },
    { id: "cus-4", company: "Lumen Dental Clinics", contact: "Sahana Iyer", phone: "+91 98450 66011", email: "sahana@lumendental.in", city: "Bengaluru", kind: "Dental clinic chain" },
    { id: "cus-5", company: "Orchid School of Design", contact: "Naveen Kulkarni", phone: "+91 94480 31205", email: "naveen@orchiddesign.in", city: "Hubballi", kind: "Design school" },
    { id: "cus-6", company: "Saffron Table", contact: "Imran Qureshi", phone: "+91 98860 45510", email: "imran@saffrontable.in", city: "Bengaluru", kind: "Restaurant group" },
    { id: "cus-7", company: "Veda Wellness", contact: "Smita Prabhu", phone: "+91 99000 28817", email: "smita@vedawellness.in", city: "Mangaluru", kind: "Wellness brand" },
  ],
  rows: [
    [1, "website", "won", 40, 20, "tanya", "SEO audit offer", "Needs monthly social media and performance marketing for a new snack range.", ["Fynd Fresh social and performance retainer", 180000, -20]],
    [1, "whatsapp", "qualified", 3, 1, "tanya", null, "Wants a festive campaign plan and creative calendar for Diwali.", ["Fynd Fresh festive campaign", 260000, 12]],
    [2, "phone_call", "proposal", 8, 2, "owner", null, "Website redesign and a lead-gen microsite for a new residential launch.", ["BlueOak launch microsite", 540000, 16]],
    [3, "website", "qualified", 5, 2, "dev", "Instagram growth guide", "Store revamp and Meta ads for the toy range.", ["Kiddo Toys store revamp", 320000, 18]],
    [4, "whatsapp", "negotiation", 10, 1, "tanya", null, "Clinic chain wants local SEO and Google Business management for 9 clinics.", ["Lumen local SEO, 9 clinics", 150000, 7]],
    [5, "website", "new", 1, 1, "dev", null, "Admissions campaign enquiry for the next intake."],
    [6, "phone_call", "won", 30, 12, "owner", null, "Menu photography and a booking site.", ["Saffron Table booking site", 210000, -12]],
    [6, "whatsapp", "new", 2, 2, "dev", null, "Asking for a quote on Reels for three outlets."],
    [7, "website", "proposal", 9, 3, "tanya", "Wellness launch kit", "Brand identity and an online store for a new ayurvedic range.", ["Veda Wellness brand and store", 480000, 20]],
    [2, "whatsapp", "won", 55, 40, "owner", null, "Brochure and social posts for the first phase.", ["BlueOak phase 1 collateral", 95000, -40]],
    [5, "phone_call", "lost", 25, 18, "dev", null, "Chose a freelancer on price.", ["Orchid admissions ads", 60000, -18]],
    [3, "whatsapp", "new", 1, 1, "tanya", null, "Asked whether Nimbus handles Amazon listings."],
  ],
  employees,
  accounts,
};
