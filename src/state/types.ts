import type { CaptureSnapshot, JobSnapshot } from "../contracts/ingest";
import type { TargetDescriptor } from "../contracts/target-descriptor";

export type MainPage = "library" | "collect" | "compare" | "result";
export type PopupPage = MainPage | "settings";
export type SessionItemStatus = "saved" | "queued" | "running" | "succeeded" | "failed";
export type InlineToastKind = "saved" | "queued";
export type HoverCandidateStrength = "soft" | "hard";
export type CompareTeaserState = "idle" | "loading" | "ready";

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

export interface TechniqueDefinition {
  key: string;
  title: string;
  summary: string;
  whyItMatters?: string;
  alias?: string;
  clusterFit?: string;
  triggerStrength?: number;
  specificity?: number;
  displayScore?: number;
}

export interface TechniqueEvidenceSnapshot {
  commentId?: string;
  author?: string;
  text?: string;
  likes?: number | null;
  comments?: number | null;
  reposts?: number | null;
  forwards?: number | null;
}

export interface TechniqueReadingSnapshot {
  id: string;
  sessionId: string;
  itemId: string;
  side: "A" | "B";
  clusterKey: string;
  clusterTitle: string;
  thesis: string;
  techniques: TechniqueDefinition[];
  evidence: TechniqueEvidenceSnapshot[];
  savedAt: string;
}

export interface ActiveCompareDraft {
  itemAId: string;
  itemBId: string;
  teaserState: CompareTeaserState;
  teaserId: string | null;
}

export interface ActiveAnalysisResult {
  resultId: string;
  compareKey: string;
  itemAId: string;
  itemBId: string;
  saved: boolean;
  viewedAt: string;
}

export interface SavedAnalysisSnapshot {
  resultId: string;
  compareKey: string;
  itemAId: string;
  itemBId: string;
  sourceLabelA: string;
  sourceLabelB: string;
  headline: string;
  deck: string;
  primaryTensionSummary: string;
  groupSummary: string;
  totalComments: number;
  dateRangeLabel: string;
  savedAt: string;
  analysisVersion: string;
  briefVersion: string;
  briefSource: "ai" | "fallback";
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
  currentMainPage: MainPage;
  currentPreview: TargetDescriptor | null;
  hoveredTarget: TargetDescriptor | null;
  hoveredTargetStrength: HoverCandidateStrength | null;
  flashPreview: TargetDescriptor | null;
  activeItemId: string | null;
  activeCompareDraft: ActiveCompareDraft | null;
  activeAnalysisResult: ActiveAnalysisResult | null;
  lastViewedResultId: string | null;
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
    popupPage: "library",
    currentMainPage: "library",
    currentPreview: null,
    hoveredTarget: null,
    hoveredTargetStrength: null,
    flashPreview: null,
    activeItemId: null,
    activeCompareDraft: null,
    activeAnalysisResult: null,
    lastViewedResultId: null,
    lastSavedToast: null,
    error: null,
    updatedAt: null
  };
}
