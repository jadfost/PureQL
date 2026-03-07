import { create } from "zustand";
import type { ProfileData, VersionData } from "../lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  versionLabel?: string;
  streaming?: boolean;
  actions?: { type: string; params: Record<string, unknown>; target: string }[];
}

export interface ActiveModelInfo {
  displayName: string;
  modelId: string;
  type: "local" | "api";
  provider?: string;
  providerColor?: string;
}

export interface DatasetEntry {
  name: string;
  rowCount: number;
  colCount: number;
  qualityScore: number;
  columns: string[];
  preview: Record<string, unknown>[];
  isActive: boolean;
}

interface AppState {
  isFirstLaunch: boolean;
  setFirstLaunch: (v: boolean) => void;

  activeModelInfo: ActiveModelInfo | null;
  setActiveModelInfo: (m: ActiveModelInfo | null) => void;

  datasetName: string | null;
  setDatasetName: (name: string | null) => void;

  // Multi-dataset registry
  loadedDatasets: DatasetEntry[];
  setLoadedDatasets: (ds: DatasetEntry[]) => void;
  addLoadedDataset: (ds: DatasetEntry) => void;
  removeLoadedDataset: (name: string) => void;

  // Names of AI-result datasets (shown with a special badge in the picker)
  resultDatasetNames: Set<string>;
  addResultDatasetName: (name: string) => void;

  // Selected datasets for the current prompt
  selectedDatasets: string[];
  setSelectedDatasets: (names: string[]) => void;
  toggleSelectedDataset: (name: string) => void;

  profile: ProfileData | null;
  setProfile: (p: ProfileData | null) => void;

  previewData: Record<string, unknown>[];
  setPreviewData: (d: Record<string, unknown>[]) => void;

  versions: VersionData[];
  currentVersionId: string | null;
  setVersions: (v: VersionData[]) => void;
  setCurrentVersionId: (id: string | null) => void;

  messages: ChatMessage[];
  addMessage: (m: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearMessages: () => void;

  activePanel: "data" | "sql" | "stats" | "diff";
  setActivePanel: (p: "data" | "sql" | "stats" | "diff") => void;
  currentSQL: string | null;
  setCurrentSQL: (sql: string | null) => void;

  isLoading: boolean;
  setLoading: (v: boolean) => void;

  // True once the AI has produced at least one result — gates the main preview area
  hasAIResult: boolean;
  setHasAIResult: (v: boolean) => void;
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

  loadedDatasets: [],
  setLoadedDatasets: (ds) => set({ loadedDatasets: ds }),
  addLoadedDataset: (ds) =>
    set((s) => ({
      loadedDatasets: s.loadedDatasets.some((d) => d.name === ds.name)
        ? s.loadedDatasets.map((d) => (d.name === ds.name ? ds : d))
        : [...s.loadedDatasets, ds],
    })),
  removeLoadedDataset: (name) =>
    set((s) => ({
      loadedDatasets: s.loadedDatasets.filter((d) => d.name !== name),
      selectedDatasets: s.selectedDatasets.filter((n) => n !== name),
      resultDatasetNames: new Set([...s.resultDatasetNames].filter((n) => n !== name)),
    })),

  resultDatasetNames: new Set<string>(),
  addResultDatasetName: (name) =>
    set((s) => ({ resultDatasetNames: new Set([...s.resultDatasetNames, name]) })),

  selectedDatasets: [],
  setSelectedDatasets: (names) => set({ selectedDatasets: names }),
  toggleSelectedDataset: (name) =>
    set((s) => ({
      selectedDatasets: s.selectedDatasets.includes(name)
        ? s.selectedDatasets.filter((n) => n !== name)
        : [...s.selectedDatasets, name],
    })),

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
  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((msg) =>
        msg.id === id ? { ...msg, ...patch } : msg
      ),
    })),
  clearMessages: () => set({ messages: [] }),

  activePanel: "data",
  setActivePanel: (p) => set({ activePanel: p }),
  currentSQL: null,
  setCurrentSQL: (sql) => set({ currentSQL: sql }),

  isLoading: false,
  setLoading: (v) => set({ isLoading: v }),

  hasAIResult: false,
  setHasAIResult: (v) => set({ hasAIResult: v }),
}));

export type { ChatMessage, ActiveModelInfo };