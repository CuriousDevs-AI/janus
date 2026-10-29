"use client";

import { api, message } from "@/lib/api/client";
import { demoMode } from "@/lib/demo-mode";
import { type TrailEntry, trailEntry, withTrail } from "@/lib/stores/audit-trail";
import { type BudgetLine, useFinanceStore } from "@/lib/stores/finance-store";
import { periodLockProblem } from "@/lib/stores/period-lock-store";

/**
 * Budget money moves on the server. A draw or release is sent once with an Idempotency-Key; the balance
 * the screen shows is replaced by the balance the server returns, so a failed request changes nothing.
 * The local store only holds a copy for display. Demo mode has no server and keeps the local path.
 */

interface ServerBudgetLine {
  external_key: string;
  name: string;
  owner_name: string;
  allocated_paise: number;
  drawn_paise: number;
  remaining_paise: number;
}

interface ServerMovement {
  id: string;
  line_key: string;
  amount_paise: number;
  note: string;
  booked_on: string;
  budget: ServerBudgetLine;
}

export const toPaise = (rupees: number) => Math.round(rupees * 100);

const inFlight = new Set<string>();

function applyLine(line: ServerBudgetLine) {
  useFinanceStore.setState((state) => ({
    budgetLines: state.budgetLines.map((item) =>
      item.id === line.external_key
        ? { ...item, allocated: line.allocated_paise / 100, drawn: line.drawn_paise / 100 }
        : item,
    ),
  }));
}

/** Loads the server's balances into the screen. Lines that exist only on this screen are created on the server first. */
export async function syncBudgetLines(): Promise<void> {
  if (demoMode) return;
  const server = await api<ServerBudgetLine[]>("/finance/budget-lines");
  const known = new Set(server.map((line) => line.external_key));
  const missing = useFinanceStore.getState().budgetLines.filter((line) => !known.has(line.id));
  for (const line of missing) {
    await api<ServerBudgetLine>("/finance/budget-lines", {
      method: "POST",
      body: JSON.stringify({
        external_key: line.id,
        name: line.name,
        owner_name: line.owner,
        allocated_paise: toPaise(line.allocated),
      }),
    }).catch((error: unknown) => {
      // A line that already exists on the server is fine; anything else is reported by the caller.
      if (!(error instanceof Error && message(error).includes("already"))) throw error;
    });
  }
  const latest = missing.length > 0 ? await api<ServerBudgetLine[]>("/finance/budget-lines") : server;
  useFinanceStore.setState((state) => {
    const local = new Set(state.budgetLines.map((line) => line.id));
    const balances = new Map(latest.map((line) => [line.external_key, line]));
    const updated = state.budgetLines.map((item) => {
      const line = balances.get(item.id);
      return line ? { ...item, allocated: line.allocated_paise / 100, drawn: line.drawn_paise / 100 } : item;
    });
    // Lines the server knows about but this screen does not (for example, drawn from another device) are added.
    const added = latest
      .filter((line) => !local.has(line.external_key))
      .map((line) => ({ id: line.external_key, name: line.name, owner: line.owner_name, allocated: line.allocated_paise / 100, drawn: line.drawn_paise / 100 }));
    return { budgetLines: [...updated, ...added] };
  });
}

/**
 * Draws (kind "draw") or releases (kind "release") money on a budget line. Returns the problem to show, or null.
 * The request is refused on the server when the line does not have enough left, so nothing is changed locally.
 */
export async function moveBudget(
  kind: "draw" | "release",
  lineId: string,
  rupees: number,
  note: string,
  by: string,
  date: string,
): Promise<string | null> {
  if (demoMode) {
    const store = useFinanceStore.getState();
    return kind === "draw" ? store.drawBudget(lineId, rupees, note, by, date) : store.releaseBudget(lineId, rupees, note, by, date);
  }
  const line: BudgetLine | undefined = useFinanceStore.getState().budgetLines.find((item) => item.id === lineId);
  if (!line) return "Budget line not found.";
  if (!(rupees > 0)) return kind === "draw" ? "Enter an amount above zero." : "Nothing to release.";
  const locked = periodLockProblem(date);
  if (locked) return locked;
  const flightKey = `${kind}:${lineId}`;
  if (inFlight.has(flightKey)) return "This is already being saved.";
  inFlight.add(flightKey);
  try {
    const path = `/finance/budget-lines/${encodeURIComponent(lineId)}/${kind === "draw" ? "draws" : "releases"}`;
    const result = await api<ServerMovement>(path, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ amount_paise: toPaise(rupees), note, booked_on: date }),
    });
    applyLine(result.budget);
    const amount = result.amount_paise / 100;
    const entry: TrailEntry =
      kind === "draw"
        ? trailEntry("finance", date, by, `Drew ₹${amount.toLocaleString("en-IN")} from ${line.name} for ${note}`)
        : trailEntry("finance", date, by, `Released ₹${(-amount).toLocaleString("en-IN")} to ${line.name} from ${note}`);
    useFinanceStore.setState((state) => ({
      draws: [{ id: `draw-${result.id}`, lineId, amount, note, by, date }, ...state.draws],
      trail: withTrail(state.trail, entry),
    }));
    return null;
  } catch (error: unknown) {
    return message(error);
  } finally {
    inFlight.delete(flightKey);
  }
}
