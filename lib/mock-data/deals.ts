import type { Deal } from "@/lib/types";
import { dealRows } from "@/lib/demo-universe";

const ownerMap: Record<string, string> = { "demo-owner": "u-1", "emp-003": "u-4", "emp-004": "u-3", "emp-009": "u-2" };
const probability: Record<string, number> = { qualified: 30, proposal: 55, negotiation: 75, won: 100, lost: 0, new: 15 };
const nextAction: Record<string, string> = {
  qualified: "Send the rate card and confirm the first delivery slot.",
  proposal: "Follow up on the proposal within two working days.",
  negotiation: "Agree the credit period and confirm the order quantity.",
  won: "Schedule the first delivery and send the GST invoice.",
  lost: "Revisit next quarter with a fresh price list.",
};

/** Deals for Acme Traders, from the shared demo company. */
export const deals: Deal[] = dealRows.map((row) => {
  const done = row.stage === "won" || row.stage === "lost";
  return {
    id: row.id.replace("demo-deal-", "deal-"), name: row.name, customerId: `cus-${Number(row.customerId.replace("demo-customer-", ""))}`, ownerId: ownerMap[row.ownerId ?? "demo-owner"] ?? "u-1", stage: row.stage,
    amount: Number(row.amount), probability: probability[row.stage] ?? 20, expectedCloseAt: row.expectedCloseAt ?? row.updatedAt, createdAt: row.createdAt, lastActivityAt: row.updatedAt,
    lostReason: row.stage === "lost" ? row.lostReason : undefined,
    tasks: done ? [{ id: `${row.id}-t1`, title: row.stage === "won" ? "Confirm delivery and collect payment" : "Log the reason and close the record", done: true }] : [{ id: `${row.id}-t1`, title: "Share the latest rate card", done: row.stage !== "qualified" }, { id: `${row.id}-t2`, title: "Confirm quantity and delivery slot", done: false }],
    nextAction: nextAction[row.stage],
  };
});

export function getDealById(id?: string): Deal | undefined {
  if (!id) return undefined;
  return deals.find((d) => d.id === id);
}

export function getDealsForCustomer(customerId: string): Deal[] {
  return deals.filter((d) => d.customerId === customerId);
}
