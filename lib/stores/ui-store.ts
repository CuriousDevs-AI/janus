import { create } from "zustand";
interface UIState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  setMobileNavOpen: (value: boolean) => void;
  setCommandPaletteOpen: (value: boolean) => void;
}
export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  commandPaletteOpen: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
}));
