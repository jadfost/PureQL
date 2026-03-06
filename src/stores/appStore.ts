import { create } from "zustand";
import type { ProfileData, VersionData } from "../lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  versionLabel?: string;
}

interface AppState {
  // Onboarding
  isFirstLaunch: boolean;
  setFirstLaunch: (v: boolean) => void;

  // Dataset
  datasetName: string | null;
  setDatasetName: (name: string | null) => void;

  // Profile
  profile: ProfileData | null;
  setProfile: (p: ProfileData | null) => void;

  // Preview
  previewData: Record<string, unknown>[];
  setPreviewData: (d: Record<string, unknown>[]) => void;

  // Versions
  versions: VersionData[];
  currentVersionId: string | null;
  setVersions: (v: VersionData[]) => void;
  setCurrentVersionId: (id: string | null) => void;

  // Chat
  messages: ChatMessage[];
  addMessage: (m: ChatMessage) => void;
  clearMessages: () => void;

  // UI
  activePanel: "data" | "sql" | "stats" | "diff";
  setActivePanel: (p: "data" | "sql" | "stats" | "diff") => void;
  currentSQL: string | null;
  setCurrentSQL: (sql: string | null) => void;

  // Loading
  isLoading: boolean;
  setLoading: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isFirstLaunch: true,
  setFirstLaunch: (v) => set({ isFirstLaunch: v }),

  datasetName: null,
  setDatasetName: (name) => set({ datasetName: name }),

  profile: null,
  setProfile: (p) => set({ profile: p }),

  previewData: [],
  setPreviewData: (d) => set({ previewData: d }),

  versions: [],
  currentVersionId: null,
  setVersions: (v) => set({ versions: v }),
  setCurrentVersionId: (id) => set({ currentVersionId: id }),

  messages: [],
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  clearMessages: () => set({ messages: [] }),

  activePanel: "data",
  setActivePanel: (p) => set({ activePanel: p }),
  currentSQL: null,
  setCurrentSQL: (sql) => set({ currentSQL: sql }),

  isLoading: false,
  setLoading: (v) => set({ isLoading: v }),
}));

export type { ChatMessage };
