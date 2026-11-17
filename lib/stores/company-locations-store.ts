"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { workspaceStorage } from "@/lib/stores/workspace-storage";
import { scoped } from "@/lib/company";

/** Offices, warehouses and branches of the active company. Company Profile edits them; Operations stocks them. */
export interface CompanyLocation { id: number; name: string; kind: string; address: string; people: number; gst: string }

const seed: CompanyLocation[] = [];

/** Remove locations whose name duplicates an earlier entry (keeps the first). */
function deduplicate(list: CompanyLocation[]): CompanyLocation[] {
  const seen = new Set<string>();
  return list.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface LocationsState {
  locations: CompanyLocation[];
  saveLocation: (value: CompanyLocation) => string | null;
}

export const useLocationsStore = create<LocationsState>()(
  persist(
    (set, get) => ({
      locations: seed,
      saveLocation: (value) => {
        const current = get().locations;
        const nameKey = value.name.trim().toLowerCase();
        const duplicate = current.find((item) => item.name.trim().toLowerCase() === nameKey && item.id !== value.id);
        if (duplicate) return "A location with this name already exists.";
        if (current.some((item) => item.id === value.id)) {
          set({ locations: current.map((item) => item.id === value.id ? value : item) });
        } else {
          const id = Math.max(0, ...current.map((item) => item.id)) + 1;
          set({ locations: [...current, { ...value, id }] });
        }
        return null;
      },
    }),
    {
      name: scoped("janus.locations.v1"),
      storage: createJSONStorage(() => workspaceStorage),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<LocationsState>) };
        merged.locations = deduplicate(merged.locations);
        return merged;
      },
    },
  ),
);
