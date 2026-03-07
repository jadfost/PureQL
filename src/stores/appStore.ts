import { create } from "zustand";
import type { ProfileData, VersionData } from "../lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  versionLabel?: string;
}

export interface ActiveModelInfo {
  displayName: string;       // "Qwen 2.5 7B" / "GPT-4o"
  modelId: string;           // "qwen2.5:7b" / "gpt-4o"
  type: "local" | "api";
  provider?: string;         // "OpenAI" | "Anthropic" | "Groq" | "Mistral AI"
  providerColor?: string;    // tailwind text color class
}

interface AppState {
  // Onboarding
  isFirstLaunch: boolean;
  setFirstLaunch: (v: boolean) => void;

  // Active AI model
  activeModelInfo: ActiveModelInfo | null;
  setActiveModelInfo: (m: ActiveModelInfo | null) => void;

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

  activeModelInfo: {
    displayName: "Qwen 2.5 7B",
    modelId: "qwen2.5:7b",
    type: "local",
  },
  setActiveModelInfo: (m) => set({ activeModelInfo: m }),

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

export type { ChatMessage, ActiveModelInfo };