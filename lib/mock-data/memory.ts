import type { MemoryItem } from "@/lib/types";
import { isFirstCompany } from "@/lib/companies";
import { at } from "@/lib/demo-universe";

type Row = [number, MemoryItem["kind"], string, string, string, number, MemoryItem["status"], number?];
const rows: Row[] = [
  [1, "stable_fact", "Preferred channel", "WhatsApp", "Consent settings", 9, "approved"],
  [1, "stable_fact", "Stores", "6 stores across Delhi, weekly drops from the Gurugram warehouse.", "Account notes", 35, "approved"],
  [1, "derived_insight", "Buying pattern", "Orders the festive range 4 weeks before Diwali and reorders staples every 10 days.", "Orders and conversations", 3, "approved", 0.86],
  [1, "conversation", "Current requirement", "Wants weekly drops from 3 November and the first order split across two stores.", "WhatsApp conversation", 0, "approved"],
  [3, "stable_fact", "Payment terms", "30 days from delivery date for the first three months.", "Proposal notes", 2, "approved"],
  [3, "derived_insight", "Decision maker", "Neelam decides alone and replies within the hour on WhatsApp.", "WhatsApp conversations", 2, "pending", 0.78],
  [3, "support", "Prior issue", "Disputed a ₹1.2L reminder that included an invoice paid on 12 October.", "Ticket #1022", 2, "approved"],
  [7, "derived_insight", "Negotiation style", "Anchors on margin and credit days. Accepts a longer credit period over a lower rate.", "Conversation on WhatsApp", 1, "approved", 0.82],
  [7, "support", "Prior issue", "Four floor-cleaner cartons arrived crushed, credit note requested.", "Ticket #1024", 3, "approved"],
  [12, "stable_fact", "Preferred channel", "WhatsApp", "Consent settings", 28, "approved"],
  [12, "derived_insight", "Reorder habit", "Reorders detergent cartons about every 6 weeks, usually 100 to 120 cartons.", "Order history", 9, "approved", 0.9],
  [12, "support", "Prior issue", "Short delivery of 6 cartons on the latest truck.", "Ticket #1031", 0, "pending"],
  [9, "derived_insight", "Risk driver", "Pays only against invoices that match challans, so quantity errors delay collection.", "Ticket #1029", 1, "approved", 0.87],
  [10, "derived_insight", "Service need", "Dispatch before 6am is non-negotiable for the dark stores.", "Email thread", 4, "approved", 0.92],
  [10, "support", "Prior issue", "Truck loaded late on 20 and 22 October.", "Ticket #1015", 4, "approved"],
  [14, "derived_insight", "Competition", "Comparing with a Kota wholesaler on flour and sugar rates.", "WhatsApp conversation", 0, "pending", 0.74],
  [5, "conversation", "Lost reason", "Chose a nearer distributor on price, open to a fresh offer after Diwali.", "Call note", 22, "approved"],
  [2, "conversation", "Current requirement", "Monthly rates for edible oil and pulses, plus delivery to the Manesar plant canteen.", "Phone call", 3, "pending"],
];

const acme_memoryItems: MemoryItem[] = rows.map(([customer, kind, label, value, source, daysAgo, status, confidence], index) => ({ id: `mem-${index + 1}`, customerId: `cus-${customer}`, kind, label, value, confidence, source, createdAt: at(daysAgo, "10:30"), status }));

export const memoryItems: MemoryItem[] = isFirstCompany ? acme_memoryItems : [];

export function getMemoryForCustomer(customerId: string): MemoryItem[] {
  return memoryItems.filter((m) => m.customerId === customerId);
}
