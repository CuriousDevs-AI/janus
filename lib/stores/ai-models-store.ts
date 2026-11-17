import { create } from "zustand";
import { persist } from "zustand/middleware";
import { userScoped } from "@/lib/stores/user-scoped";
import type { UseCaseId } from "@/lib/ai-providers";

export interface ConnectedProvider {
  id: string;
  providerId: string;
  name: string;
  last4: string;
  status: "connected" | "error" | "untested";
  companies: string[];
  capInr: number;
  spentInr: number;
  createdAt: string;
  lastUsed: string | null;
  lastTestedAt: string | null;
  testLatencyMs: number | null;
  testError: string | null;
  modelsSyncedAt: string | null;
}

export interface EnabledModel {
  modelId: string;
  providerId: string;
  connectionId: string;
  enabled: boolean;
}

export interface DefaultRoute {
  useCaseId: UseCaseId;
  defaultConnectionId: string | null;
  defaultModelId: string | null;
  fallbackConnectionId: string | null;
  fallbackModelId: string | null;
}

interface AiModelsState {
  connections: ConnectedProvider[];
  enabledModels: EnabledModel[];
  defaults: DefaultRoute[];
  budgetAlertInr: number;

  addConnection: (conn: Omit<ConnectedProvider, "id">) => string;
  updateConnection: (id: string, patch: Partial<ConnectedProvider>) => void;
  removeConnection: (id: string) => void;
  rotateKey: (id: string, newLast4: string) => void;

  setModelEnabled: (connectionId: string, modelId: string, providerId: string, enabled: boolean) => void;
  bulkEnableModels: (connectionId: string, models: { modelId: string; providerId: string }[]) => void;

  setDefault: (route: DefaultRoute) => void;
  setBudgetAlert: (amount: number) => void;
}

export const useAiModelsStore = create<AiModelsState>()(
  persist(
    (set) => ({
      connections: [],
      enabledModels: [],
      defaults: [],
      budgetAlertInr: 10000,

      addConnection: (conn) => {
        const id = crypto.randomUUID();
        set((state) => ({ connections: [...state.connections, { ...conn, id }] }));
        return id;
      },
      updateConnection: (id, patch) =>
        set((state) => ({ connections: state.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      removeConnection: (id) =>
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
          enabledModels: state.enabledModels.filter((m) => m.connectionId !== id),
          defaults: state.defaults.map((d) =>
            d.defaultConnectionId === id ? { ...d, defaultConnectionId: null, defaultModelId: null } :
            d.fallbackConnectionId === id ? { ...d, fallbackConnectionId: null, fallbackModelId: null } : d),
        })),
      rotateKey: (id, newLast4) =>
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id ? { ...c, last4: newLast4, status: "untested" as const, lastTestedAt: null, testLatencyMs: null, testError: null } : c),
        })),

      setModelEnabled: (connectionId, modelId, providerId, enabled) =>
        set((state) => {
          const idx = state.enabledModels.findIndex((m) => m.connectionId === connectionId && m.modelId === modelId);
          if (idx >= 0) {
            const next = [...state.enabledModels];
            next[idx] = { ...next[idx], enabled };
            return { enabledModels: next };
          }
          return { enabledModels: [...state.enabledModels, { connectionId, modelId, providerId, enabled }] };
        }),
      bulkEnableModels: (connectionId, models) =>
        set((state) => {
          const other = state.enabledModels.filter((m) => m.connectionId !== connectionId);
          return { enabledModels: [...other, ...models.map((m) => ({ ...m, connectionId, enabled: true }))] };
        }),

      setDefault: (route) =>
        set((state) => {
          const idx = state.defaults.findIndex((d) => d.useCaseId === route.useCaseId);
          if (idx >= 0) {
            const next = [...state.defaults];
            next[idx] = route;
            return { defaults: next };
          }
          return { defaults: [...state.defaults, route] };
        }),
      setBudgetAlert: (amount) => set({ budgetAlertInr: amount }),
    }),
    { name: userScoped("janus.ai-models.v1") },
  ),
);
