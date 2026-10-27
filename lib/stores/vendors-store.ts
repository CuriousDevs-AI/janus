"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { workspaceStorage } from "@/lib/stores/workspace-storage";
import { isFirstCompany } from "@/lib/companies";
import { scoped } from "@/lib/company";

/**
 * The vendor master (plan §8.7, Operations V2). Purchase orders and vendor bills pick a vendor from this
 * list, so a name is spelled the same way everywhere. Each company keeps its own vendors.
 *
 * Bank details are not kept here: they live on the server in the encrypted vault (vendor_bank_accounts),
 * where a change needs approval by someone other than the requester.
 */

export interface Vendor { id: string; name: string; gstin: string; paymentTermsDays: number }

/** A GSTIN is 15 characters: state code, PAN, entity number, the letter Z, and a check character. */
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

interface VendorsState {
  vendors: Vendor[];
  addVendor: (input: { name: string; gstin: string; paymentTermsDays: number }) => string | null;
}

const seed = (): Vendor[] => {
  if (!isFirstCompany) return [];
  return [
    { id: "ven-1", name: "Gurugram Packaging Co", gstin: "06AAGCG5555P1ZA", paymentTermsDays: 30 },
    { id: "ven-2", name: "Udyog Electricals", gstin: "06AAFCU4321K1Z3", paymentTermsDays: 15 },
  ];
};

export const useVendorsStore = create<VendorsState>()(
  persist(
    (set, get) => ({
      vendors: seed(),
      addVendor: (input) => {
        const name = input.name.trim();
        const gstin = input.gstin.trim().toUpperCase();
        if (name.length < 2) return "Enter the vendor's name.";
        if (get().vendors.some((v) => v.name.toLowerCase() === name.toLowerCase())) return `${name} is already in the vendor list.`;
        if (gstin && !GSTIN_PATTERN.test(gstin)) return "A GSTIN has 15 characters in the usual format, for example 06AAGCG5555P1ZA.";
        if (!(input.paymentTermsDays >= 0 && input.paymentTermsDays <= 365)) return "Payment terms must be between 0 and 365 days.";
        set((state) => ({ vendors: [...state.vendors, { id: `ven-${Date.now()}`, name, gstin, paymentTermsDays: input.paymentTermsDays }] }));
        return null;
      },
    }),
    {
      name: scoped("janus.vendors.v1"),
      storage: createJSONStorage(() => workspaceStorage),
      // Version 3 drops the bank details an earlier build kept in the browser; they now live only on the server.
      version: 3,
      migrate: (persisted) => {
        const state = persisted as { vendors?: Vendor[] };
        return {
          vendors: (state.vendors ?? []).map(({ id, name, gstin, paymentTermsDays }) => ({ id, name, gstin, paymentTermsDays })),
        } as VendorsState;
      },
    },
  ),
);
