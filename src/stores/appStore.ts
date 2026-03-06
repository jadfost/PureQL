import { create } from "zustand";

export interface DataColumn {
  name: string;
  type: string;
  nullCount: number;
  uniqueCount: number;
  sampleValues: string[];
}

export interface DataProfile {
  rowCount: number;
  colCount: number;
  qualityScore: number;
  columns: DataColumn[];
  issues: string[];
  duplicateCount: number;
}

export interface DataVersion {
  id: string;
  label: string;
  description: string;
  timestamp: number;
  qualityScore: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  version?: string;
}

interface AppState {
  // Onboarding
  isFirstLaunch: boolean;
  setFirstLaunch: (v: boolean) => void;

  // Hardware
  hardware: {
    ram: number;
    cpuCores: number;
    gpu: string | null;
    os: string;
  } | null;
  setHardware: (h: AppState["hardware"]) => void;

  // AI Model
  selectedModel: string | null;
  setSelectedModel: (m: string) => void;

  // Dataset
  datasetPath: string | null;
  datasetName: string | null;
  setDataset: (path: string, name: string) => void;

  // Profile
  profile: DataProfile | null;
  setProfile: (p: DataProfile) => void;

  // Preview data (sample rows)
  previewData: Record<string, unknown>[];
  setPreviewData: (d: Record<string, unknown>[]) => void;

  // Versions
  versions: DataVersion[];
  currentVersion: string | null;
  addVersion: (v: DataVersion) => void;
  setCurrentVersion: (id: string) => void;

  // Chat
  messages: ChatMessage[];
  addMessage: (m: ChatMessage) => void;
  clearMessages: () => void;

  // UI State
  activePanel: "data" | "sql" | "stats" | "diff";
  setActivePanel: (p: AppState["activePanel"]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Onboarding
  isFirstLaunch: true,
  setFirstLaunch: (v) => set({ isFirstLaunch: v }),

  // Hardware
  hardware: null,
  setHardware: (h) => set({ hardware: h }),

  // AI Model
  selectedModel: null,
  setSelectedModel: (m) => set({ selectedModel: m }),

  // Dataset
  datasetPath: null,
  datasetName: null,
  setDataset: (path, name) => set({ datasetPath: path, datasetName: name }),

  // Profile
  profile: null,
  setProfile: (p) => set({ profile: p }),

  // Preview
  previewData: [],
  setPreviewData: (d) => set({ previewData: d }),

  // Versions
  versions: [],
  currentVersion: null,
  addVersion: (v) =>
    set((state) => ({
      versions: [...state.versions, v],
      currentVersion: v.id,
    })),
  setCurrentVersion: (id) => set({ currentVersion: id }),

  // Chat
  messages: [],
  addMessage: (m) =>
    set((state) => ({ messages: [...state.messages, m] })),
  clearMessages: () => set({ messages: [] }),

  // UI
  activePanel: "data",
  setActivePanel: (p) => set({ activePanel: p }),
}));
