"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isFirstCompany } from "@/lib/companies";
import { scoped } from "@/lib/company";

/**
 * The vendor master (plan §8.7, Operations V2). Purchase orders and vendor bills pick a vendor from this
 * list, so a name is spelled the same way everywhere. Each company keeps its own vendors.
 */

export interface VendorBank { holder: string; account: string; ifsc: string }
export interface Vendor { id: string; name: string; gstin: string; paymentTermsDays: number; bank?: VendorBank }

/** A change to a vendor's bank details. It takes effect only when someone other than the requester approves it (plan §8.2S). */
export interface BankChange extends VendorBank { id: string; vendorId: string; vendorName: string; requestedBy: string; status: "pending" | "approved"; approvedBy?: string; date: string }

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** A GSTIN is 15 characters: state code, PAN, entity number, the letter Z, and a check character. */
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

interface VendorsState {
  vendors: Vendor[];
  bankChanges: BankChange[];
  addVendor: (input: { name: string; gstin: string; paymentTermsDays: number }) => string | null;
  requestBankChange: (vendorId: string, input: VendorBank, date: string, by: string) => string | null;
  approveBankChange: (id: string, by: string) => string | null;
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
      bankChanges: [],
      requestBankChange: (vendorId, input, date, by) => {
        const vendor = get().vendors.find((v) => v.id === vendorId);
        if (!vendor) return "Choose a vendor.";
        const holder = input.holder.trim();
        const account = input.account.replace(/\s/g, "");
        const ifsc = input.ifsc.trim().toUpperCase();
        if (holder.length < 2) return "Enter the account holder's name.";
        if (!/^\d{9,18}$/.test(account)) return "A bank account number has 9 to 18 digits.";
        if (!IFSC_PATTERN.test(ifsc)) return "An IFSC code has 11 characters, for example HDFC0001234.";
        if (get().bankChanges.some((c) => c.vendorId === vendorId && c.status === "pending")) return `${vendor.name} already has a bank change waiting approval.`;
        set((state) => ({ bankChanges: [{ id: `bc-${Date.now()}`, vendorId, vendorName: vendor.name, holder, account, ifsc, requestedBy: by, status: "pending", date }, ...state.bankChanges] }));
        return null;
      },
      approveBankChange: (id, by) => {
        const change = get().bankChanges.find((c) => c.id === id);
        if (!change || change.status !== "pending") return "This bank change is not waiting for approval.";
        if (change.requestedBy === by) return "The person who requested a bank change cannot approve it.";
        set((state) => ({
          bankChanges: state.bankChanges.map((c) => c.id === id ? { ...c, status: "approved", approvedBy: by } : c),
          vendors: state.vendors.map((v) => v.id === change.vendorId ? { ...v, bank: { holder: change.holder, account: change.account, ifsc: change.ifsc } } : v),
        }));
        return null;
      },
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
    { name: scoped("janus.vendors.v1"), storage: createJSONStorage(() => localStorage) },
  ),
);
