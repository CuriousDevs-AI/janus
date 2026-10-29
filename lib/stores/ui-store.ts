import { create } from "zustand";
interface UIState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  chatOpen: boolean;
  chatTarget: string | null;
  setSidebarCollapsed: (value: boolean) => void;
  setMobileNavOpen: (value: boolean) => void;
  setCommandPaletteOpen: (value: boolean) => void;
  setChatOpen: (value: boolean) => void;
  openChat: (conversationId: string) => void;
  setChatTarget: (conversationId: string | null) => void;
}
export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  commandPaletteOpen: false,
  chatOpen: false,
  chatTarget: null,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  openChat: (chatTarget) => set({ chatOpen: true, chatTarget }),
  setChatTarget: (chatTarget) => set({ chatTarget }),
}));
