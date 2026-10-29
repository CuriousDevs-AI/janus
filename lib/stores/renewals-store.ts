"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { workspaceStorage } from "@/lib/stores/workspace-storage";
import { isFirstCompany } from "@/lib/companies";
import { scoped } from "@/lib/company";

/**
 * Renewals and contract dates (plan §AH, Support & Success V2). A renewal is a customer's contract with an end
 * date and a value. Each company keeps its own renewals.
 */

export interface Renewal { id: string; customerId: string; customerName: string; contractEnd: string; value: number; owner: string }

interface RenewalsState {
  renewals: Renewal[];
  addRenewal: (input: Omit<Renewal, "id">) => string | null;
  setContractEnd: (id: string, contractEnd: string) => string | null;
}

const seed = (): Renewal[] => {
  if (!isFirstCompany) return [];
  return [
    { id: "ren-1", customerId: "cus-1", customerName: "Kavita Rao", contractEnd: "2026-12-15", value: 120000, owner: "Arjun Mehta" },
    { id: "ren-2", customerId: "cus-7", customerName: "Suresh Nair", contractEnd: "2027-03-31", value: 85000, owner: "Meera Singh" },
  ];
};

export const useRenewalsStore = create<RenewalsState>()(
  persist(
    (set, get) => ({
      renewals: seed(),
      addRenewal: (input) => {
        if (!input.customerId) return "Choose the customer.";
        if (get().renewals.some((r) => r.customerId === input.customerId)) return `${input.customerName} already has a renewal. Change its end date instead.`;
        if (!input.contractEnd) return "Enter the contract end date.";
        if (!(input.value >= 0)) return "The contract value cannot be negative.";
        if (!input.owner) return "Choose who owns the renewal.";
        set((state) => ({ renewals: [...state.renewals, { ...input, id: `ren-${Date.now()}` }] }));
        return null;
      },
      setContractEnd: (id, contractEnd) => {
        if (!contractEnd) return "Enter the contract end date.";
        set((state) => ({ renewals: state.renewals.map((r) => r.id === id ? { ...r, contractEnd } : r) }));
        return null;
      },
    }),
    { name: scoped("janus.renewals.v1"), storage: createJSONStorage(() => workspaceStorage) },
  ),
);
