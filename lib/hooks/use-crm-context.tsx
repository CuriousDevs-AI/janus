"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import type { CrmBrief } from "@/lib/api/types";

const STORAGE_KEY = "janus:activeCrmId";

function readStored(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function writeStored(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export interface CrmContextValue {
  crms: CrmBrief[];
  activeCrm: CrmBrief | null;
  selectedId: string | null;
  selectCrm: (id: string | null) => void;
  multiCrm: boolean;
  isAdmin: boolean;
  crmParam: string;
  crmQueryParam: string;
}

const CrmContext = createContext<CrmContextValue | null>(null);

export function CrmProvider({ crms, permissions, children }: {
  crms: CrmBrief[];
  permissions: string[];
  children: React.ReactNode;
}) {
  const isAdmin = permissions.includes("*") || permissions.includes("settings:manage");
  const multiCrm = crms.length > 1;

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (crms.length <= 1) return crms[0]?.id ?? null;
    const stored = readStored();
    if (stored && crms.some((c) => c.id === stored)) return stored;
    const def = crms.find((c) => c.isDefault);
    return def?.id ?? crms[0]?.id ?? null;
  });

  useEffect(() => {
    if (crms.length === 0) return;
    if (selectedId && crms.some((c) => c.id === selectedId)) return;
    const stored = readStored();
    if (stored && crms.some((c) => c.id === stored)) { setSelectedId(stored); return; }
    const def = crms.find((c) => c.isDefault);
    setSelectedId(def?.id ?? crms[0]?.id ?? null);
  }, [crms, selectedId]);

  const activeCrm = crms.find((c) => c.id === selectedId) ?? null;

  const selectCrm = useCallback((id: string | null) => {
    setSelectedId(id);
    writeStored(id);
  }, []);

  const crmParam = useMemo(() => {
    if (!multiCrm) return "";
    if (!selectedId) return "";
    return `&crm_id=${selectedId}`;
  }, [multiCrm, selectedId]);

  const crmQueryParam = useMemo(() => {
    if (!multiCrm || !selectedId) return "";
    return `crm_id=${selectedId}`;
  }, [multiCrm, selectedId]);

  const value = useMemo<CrmContextValue>(() => ({
    crms, activeCrm, selectedId, selectCrm, multiCrm, isAdmin, crmParam, crmQueryParam,
  }), [crms, activeCrm, selectedId, selectCrm, multiCrm, isAdmin, crmParam, crmQueryParam]);

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrmContext(): CrmContextValue {
  const ctx = useContext(CrmContext);
  if (!ctx) {
    return {
      crms: [], activeCrm: null, selectedId: null,
      selectCrm: () => {}, multiCrm: false, isAdmin: false,
      crmParam: "", crmQueryParam: "",
    };
  }
  return ctx;
}
