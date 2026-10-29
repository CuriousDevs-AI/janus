import { create } from "zustand";
import type { TeamSpace } from "@/components/team/types";

/** What the left sidebar needs to show the Team Chat list. The Team Chat page fills it while it is open. */
export interface TeamChatActions {
  pick: (item: TeamSpace) => void;
  create: () => void;
  newMessage: () => void;
  searchMessages: () => void;
}

interface TeamChatState {
  channels: TeamSpace[];
  direct: TeamSpace[];
  selected: string | null;
  loading: boolean;
  actions: TeamChatActions | null;
  publish: (state: Omit<TeamChatState, "publish" | "clear">) => void;
  clear: () => void;
}

export const useTeamChatStore = create<TeamChatState>((set) => ({
  channels: [],
  direct: [],
  selected: null,
  loading: true,
  actions: null,
  publish: (state) => set(state),
  clear: () => set({ channels: [], direct: [], selected: null, loading: true, actions: null }),
}));
