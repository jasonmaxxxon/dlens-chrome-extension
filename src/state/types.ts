import type { CaptureSnapshot, JobSnapshot } from "../contracts/ingest";
import type { TargetDescriptor } from "../contracts/target-descriptor";

export type FolderMode = "archive" | "topic" | "product" | "pr-evidence";
export type TopicStatus = "pending" | "watching" | "learning" | "testing" | "archived";
export type SignalSource = "threads" | "manual";
export type SignalInboxStatus = "unprocessed" | "assigned" | "archived" | "rejected";
export type TriageAction =
  | { kind: "assign"; topicId: string }
  | { kind: "create-topic"; name: string; description?: string }
  | { kind: "archive" }
  | { kind: "reject" };

export type MainPage =
  | "library"
  | "collect"
  | "compare"
  | "result"
  | "casebook"
  | "topics"
  | "topic-detail"
  | "inbox"
  | "saved-signals"
  | "classification"
  | "actionable-filter"
  | "pr-evidence";
export type PopupPage = MainPage | "settings" | "audit-report";
export type SessionItemStatus = "saved" | "queued" | "running" | "succeeded" | "failed";
export type InlineToastKind = "saved" | "queued";
export type HoverCandidateStrength = "soft" | "hard";
export type CompareTeaserState = "idle" | "loading" | "ready";
export type ProductSignalCardLayout = "verdict" | "marginalia";
export type TopicSynthesisLayout = "stack" | "console";
export type CompareResultLayout = "reading" | "parallel" | "chapters";

export interface LayoutPreferences {
  productSignalCardLayout: ProductSignalCardLayout;
  topicSynthesisLayout: TopicSynthesisLayout;
  compareResultLayout: CompareResultLayout;
}

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
  /** Presence flags exposed to the content-script world instead of the raw keys (see sanitize-snapshot.ts). */
  hasOpenAiKey?: boolean;
  hasClaudeKey?: boolean;
  hasGoogleKey?: boolean;
  productProfile?: ProductProfile | null;
  layoutPreferences: LayoutPreferences;
}

export interface ProductProfileContextFile {
  id: string;
  name: string;
  kind: "readme" | "agents" | "ai-agents" | "other";
  importedAt: string;
  charCount: number;
}

export interface ProductProfile {
  name: string;
  category: string;
  audience: string;
  contextText?: string;
  contextFiles?: ProductProfileContextFile[];
}

export interface ProductContext {
  productPromise: string;
  targetAudience: string;
  agentRoles: string[];
  coreWorkflows: string[];
  currentCapabilities: string[];
  explicitConstraints: string[];
  nonGoals: string[];
  preferredTechDirection: string;
  evaluationCriteria: string[];
  unknowns: string[];
  compiledAt: string;
  sourceFileIds: string[];
  promptVersion: string;
}

export type ProductContextField =
  | "productPromise"
  | "targetAudience"
  | "agentRoles"
  | "coreWorkflows"
  | "currentCapabilities"
  | "explicitConstraints"
  | "nonGoals"
  | "preferredTechDirection"
  | "evaluationCriteria"
  | "unknowns";
export type ProductSignalType = "learning" | "competitor" | "demand" | "technical" | "marketing" | "noise";
export type ProductSignalContentType = "content" | "discussion_starter" | "mixed";
export type ProductSignalVerdict = "try" | "watch" | "park" | "insufficient_data";
export type ProductSignalAnalysisStatus = "pending" | "analyzing" | "complete" | "error";
export type ProductAgentTaskTarget = "codex" | "claude" | "generic";
export type ProductSignalEvidenceGrounding = "text_grounded" | "model_inferred" | "insufficient_detail";
export type ProductSignalReferenceType =
  | "product_reference"
  | "technical_learning"
  | "workflow_pattern"
  | "market_language"
  | "general_learning"
  | "no_direct_fit";
export type ProductSignalReferenceTarget =
  | ProductContextField
  | "technicalLearning"
  | "workflowPattern"
  | "marketLanguage"
  | "productAnalogy"
  | "generalLearning"
  | "noDirectFit";

export interface ProductAgentTaskSpec {
  targetAgent: ProductAgentTaskTarget;
  taskPrompt: string;
  requiredContext: string[];
  taskTitle?: string;
}

export type ProductAgentTaskFeedbackValue = "adopted" | "needs_rewrite" | "irrelevant" | "ignored";

export interface ProductAgentTaskFeedback {
  signalId: string;
  taskPromptHash: string;
  feedback: ProductAgentTaskFeedbackValue;
  note?: string;
  createdAt: string;
}

export interface ProductSignalEvidenceNote {
  ref: string;
  quoteSummary: string;
  whyItMatters: string;
  grounding?: ProductSignalEvidenceGrounding;
  reusablePattern?: string;
  whyItWorks?: string;
  copyableTemplate?: string;
  workflowStack?: string[];
  copyRecipeMarkdown?: string;
  tradeoff?: string;
}

export interface ProductSignalAnalysis {
  signalId: string;
  signalType: ProductSignalType;
  signalSubtype: string;
  contentType: ProductSignalContentType;
  contentSummary: string;
  relevance: 1 | 2 | 3 | 4 | 5;
  relevantTo: ProductSignalReferenceTarget[];
  referenceType?: ProductSignalReferenceType;
  referenceLabel?: string;
  referenceTakeaway?: string;
  whyRelevant: string;
  verdict: ProductSignalVerdict;
  reason: string;
  audienceGap?: string;
  experimentHint?: string;
  whyNow?: string;
  validationMetric?: string;
  blockers?: string[];
  agentTaskSpec?: ProductAgentTaskSpec;
  evidenceRefs: string[];
  evidenceNotes?: ProductSignalEvidenceNote[];
  productContextHash: string;
  promptVersion: string;
  model?: string;
  analyzedAt: string;
  status: ProductSignalAnalysisStatus;
  error?: string;
}

export type JudgmentRecommendedState = "park" | "watch" | "act";

export interface JudgmentResult {
  relevance: 1 | 2 | 3 | 4 | 5;
  recommendedState: JudgmentRecommendedState;
  whyThisMatters: string;
  actionCue: string;
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
  briefSource: "ai" | "fallback" | "unknown";
  judgmentResult?: JudgmentResult | null;
  judgmentVersion?: string | null;
  judgmentSource?: "ai" | "fallback" | "unknown" | null;
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
  mode: FolderMode;
  createdAt: string;
  updatedAt: string;
  items: SessionItem[];
}

export interface TopicSynthesisObservation {
  text: string;
  evidenceSignalIds: string[];
}

export interface TopicSynthesisCluster {
  keyword: string;
  signalCount: number;
  exampleSignalIds: string[];
}

export interface TopicSynthesisMeme {
  phrase: string;
  occurrences: number;
}

export interface TopicSynthesisOutlier {
  signalId: string;
  reason: string;
}

export interface TopicSynthesis {
  observations: TopicSynthesisObservation[];
  commonClusters: TopicSynthesisCluster[];
  verbalTechniques: string[];
  memes: TopicSynthesisMeme[];
  sentimentNarrative: string;
  outliers: TopicSynthesisOutlier[];
  /** Snapshot of how many analyzed signals were available when this synthesis ran. */
  generatedFromCount: number;
  /** Total signals attached to the topic at synthesis time (for coverage display). */
  totalSignalCount: number;
  generatedAt: string;
  /** "deterministic" today; reserved for future AI-backed runs. */
  generator: "deterministic";
  generatorVersion: string;
}

export interface TopicContext {
  researchQuestion: string;
  lens?: string;
  nonGoals?: string;
}

export type TopicSignalStance = "central" | "adjacent" | "off-topic";

export interface TopicSignalReading {
  signalId: string;
  topicId: string;
  status: "complete" | "error";
  stance: TopicSignalStance;
  reading: string;
  audienceSignal: string;
  evidenceRefs: string[];
  uncertainties: string[];
  promptVersion: string;
  model: string;
  generatedAt: string;
  errorMessage?: string;
}

export interface SignalTagsRecord {
  itemId: string;
  status: "complete" | "error";
  signalTags: string[];
  signalGist: string;
  promptVersion: string;
  model: string;
  generatedAt: string;
  errorMessage?: string;
}

export interface FolderSynthesisCluster {
  keyword: string;
  signalCount: number;
  /** Number of distinct topics this cluster appears in — the "spread" metric. */
  topicCount: number;
  topicIds: string[];
}

export interface FolderSynthesisMeme {
  phrase: string;
  occurrences: number;
  topicIds: string[];
}

export interface FolderSynthesisTopicCoverage {
  topicId: string;
  topicName: string;
  analyzedCount: number;
  totalCount: number;
}

export interface FolderSynthesis {
  sessionId: string;
  observations: TopicSynthesisObservation[];
  commonClusters: FolderSynthesisCluster[];
  memes: FolderSynthesisMeme[];
  verbalTechniques: string[];
  sentimentNarrative: string;
  topicCoverage: FolderSynthesisTopicCoverage[];
  /** Total analyzed signals across all topics in the folder. */
  generatedFromCount: number;
  /** Total signals across all topics at synthesis time. */
  totalSignalCount: number;
  /** Distinct topics that contributed at least one analyzed signal. */
  contributingTopicCount: number;
  generatedAt: string;
  generator: "deterministic";
  generatorVersion: string;
}

export interface Topic {
  id: string;
  sessionId: string;
  name: string;
  description?: string;
  status: TopicStatus;
  tags: string[];
  signalIds: string[];
  pairIds: string[];
  createdAt: string;
  updatedAt: string;
  context?: TopicContext | null;
  synthesis?: TopicSynthesis | null;
}

export interface Signal {
  id: string;
  sessionId: string;
  itemId?: string;
  source: SignalSource;
  inboxStatus: SignalInboxStatus;
  topicId?: string;
  suggestedTopicIds?: string[];
  capturedAt: string;
  triagedAt?: string;
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
  collectionTopicId: string | null;
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
    googleApiKey: "",
    productProfile: null,
    layoutPreferences: createDefaultLayoutPreferences()
  };
}

export function createDefaultLayoutPreferences(): LayoutPreferences {
  return {
    productSignalCardLayout: "marginalia",
    topicSynthesisLayout: "console",
    compareResultLayout: "parallel"
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
    collectionTopicId: null,
    activeCompareDraft: null,
    activeAnalysisResult: null,
    lastViewedResultId: null,
    lastSavedToast: null,
    error: null,
    updatedAt: null
  };
}
