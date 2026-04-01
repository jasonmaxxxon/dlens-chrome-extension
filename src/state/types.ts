import type { CaptureSnapshot, JobSnapshot } from "../contracts/ingest";
import type { TargetDescriptor } from "../contracts/target-descriptor";

export type PopupPage = "collect" | "library" | "compare" | "settings";
export type SessionItemStatus = "saved" | "queued" | "running" | "succeeded" | "failed";
export type InlineToastKind = "saved" | "queued";
export type HoverCandidateStrength = "soft" | "hard";

export interface InlineToast {
  id: string;
  kind: InlineToastKind;
  message: string;
  createdAt: string;
}

export interface ExtensionSettings {
  ingestBaseUrl: string;
  oneLinerProvider: "openai" | "claude" | "google" | null;
  openaiApiKey: string;
  claudeApiKey: string;
  googleApiKey: string;
}

export interface CommentPreview {
  id: string;
  author: string;
  text: string;
  likeCount: number | null;
}

export interface SessionItem {
  id: string;
  descriptor: TargetDescriptor;
  status: SessionItemStatus;
  selectedAt: string;
  savedAt: string;
  queuedAt: string | null;
  completedAt: string | null;
  captureId: string | null;
  jobId: string | null;
  canonicalTargetUrl: string | null;
  latestJob: JobSnapshot | null;
  latestCapture: CaptureSnapshot | null;
  commentsPreview: CommentPreview[];
  lastStatusAt: string | null;
  lastErrorKind: string | null;
  lastError: string | null;
}

export interface SessionRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: SessionItem[];
}

export interface ExtensionGlobalState {
  settings: ExtensionSettings;
  sessions: SessionRecord[];
  activeSessionId: string | null;
  updatedAt: string | null;
}

export interface TabUiState {
  selectionMode: boolean;
  collectModeBannerVisible: boolean;
  popupOpen: boolean;
  popupPage: PopupPage;
  currentPreview: TargetDescriptor | null;
  hoveredTarget: TargetDescriptor | null;
  hoveredTargetStrength: HoverCandidateStrength | null;
  flashPreview: TargetDescriptor | null;
  activeItemId: string | null;
  lastSavedToast: InlineToast | null;
  error: string | null;
  updatedAt: string | null;
}

export interface ExtensionSnapshot {
  global: ExtensionGlobalState;
  tab: TabUiState;
}

export function createDefaultSettings(): ExtensionSettings {
  return {
    ingestBaseUrl: "http://127.0.0.1:8000",
    oneLinerProvider: "google",
    openaiApiKey: "",
    claudeApiKey: "",
    googleApiKey: ""
  };
}

export function createEmptyGlobalState(): ExtensionGlobalState {
  return {
    settings: createDefaultSettings(),
    sessions: [],
    activeSessionId: null,
    updatedAt: null
  };
}

export function createEmptyTabState(): TabUiState {
  return {
    selectionMode: false,
    collectModeBannerVisible: false,
    popupOpen: false,
    popupPage: "collect",
    currentPreview: null,
    hoveredTarget: null,
    hoveredTargetStrength: null,
    flashPreview: null,
    activeItemId: null,
    lastSavedToast: null,
    error: null,
    updatedAt: null
  };
}
