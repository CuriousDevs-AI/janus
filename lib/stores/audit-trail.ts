/**
 * Shared audit trail for the workspace stores (plan §8.6). Every money, stock, approval and access
 * change appends one entry with the acting user and the date. The newest entries come first and the
 * list is capped, so a long-running preview cannot grow without limit.
 */

export const TRAIL_LIMIT = 200;

export type TrailModule = "finance" | "operations" | "projects" | "support" | "it";

export interface TrailEntry {
  id: string;
  module: TrailModule;
  at: string;
  by: string;
  text: string;
}

export function trailEntry(module: TrailModule, at: string, by: string, text: string): TrailEntry {
  return { id: `trail-${module}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, module, at, by, text };
}

/** Prepend an entry and keep the list within the cap. */
export function withTrail(trail: TrailEntry[], entry: TrailEntry): TrailEntry[] {
  return [entry, ...trail].slice(0, TRAIL_LIMIT);
}
