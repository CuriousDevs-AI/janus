import type { PurchaseOrder } from "@/lib/stores/operations-store";

/**
 * Three-way match (plan §8.7 V2): a vendor bill is checked against the purchase order it was raised for
 * and the goods actually received against that order. A bill with an order is paid only when it matches.
 */

export type MatchStatus = "no order" | "goods not received" | "matched" | "bill above goods received" | "goods above bill";

const TOLERANCE = 0.5;

export function threeWayMatch(billAmount: number, order: PurchaseOrder | undefined) {
  const orderedValue = order ? order.lines.reduce((sum, line) => sum + line.qty * line.rate, 0) : 0;
  const receivedValue = order ? order.lines.reduce((sum, line) => sum + line.received * line.rate, 0) : 0;
  let status: MatchStatus;
  if (!order) status = "no order";
  else if (receivedValue <= 0) status = "goods not received";
  else if (Math.abs(billAmount - receivedValue) <= TOLERANCE) status = "matched";
  else if (billAmount > receivedValue) status = "bill above goods received";
  else status = "goods above bill";
  return { status, orderedValue, receivedValue, matched: status === "matched" };
}
