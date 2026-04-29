import type { CaptureSnapshot, CaptureTargetResponse, JobSnapshot } from "../contracts/ingest";
import type { CompareBrief, CompareBriefRequest } from "../compare/brief";
import type { CompareOneLinerRequest } from "../compare/one-liner";
import type {
  ActiveAnalysisResult,
  ActiveCompareDraft,
  JudgmentResult,
  ProductAgentTaskFeedback,
  ProductSignalAnalysis,
  ProductContext,
  ProductProfile,
  SavedAnalysisSnapshot,
  FolderMode,
  Signal,
  SignalInboxStatus,
  Topic,
  TriageAction,
  TechniqueReadingSnapshot
} from "./types";
import type { ClusterInterpretation, CompareClusterSummaryRequest } from "../compare/cluster-interpretation";
import type { EvidenceAnnotation, EvidenceAnnotationRequest } from "../compare/evidence-annotation";
import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { ExtensionSnapshot, HoverCandidateStrength, PopupPage } from "./types";
import type { WorkerStatus } from "./processing-state";

export type ExtensionMessage =
  | { type: "state/get-active-tab" }
  | { type: "state/get-tab"; tabId: number }
  | { type: "settings/set-ingest-base-url"; value: string }
  | { type: "settings/set-product-profile"; productProfile: ProductProfile | null }
  | { type: "settings/init-product-profile"; description: string }
  | { type: "settings/set-one-liner-config"; provider: "openai" | "claude" | "google" | null; openaiApiKey: string; claudeApiKey: string; googleApiKey: string }
  | { type: "popup/open-active-tab" }
  | { type: "popup/close-tab"; tabId: number }
  | { type: "popup/navigate-active-tab"; page: PopupPage }
  | { type: "selection/start-active-tab" }
  | { type: "selection/cancel-active-tab" }
  | { type: "selection/start-tab"; tabId: number; mode?: FolderMode }
  | { type: "selection/cancel-tab"; tabId: number }
  | { type: "selection/hovered"; descriptor: TargetDescriptor | null; strength?: HoverCandidateStrength | null }
  | { type: "selection/selected"; descriptor: TargetDescriptor }
  | { type: "selection/mode-changed"; enabled: boolean }
  | { type: "session/create"; name: string; saveCurrentPreview?: boolean; mode?: FolderMode }
  | { type: "session/rename"; sessionId: string; name: string }
  | { type: "session/delete"; sessionId: string }
  | { type: "session/set-active"; sessionId: string }
  | { type: "session/set-mode"; sessionId: string; mode: FolderMode }
  | { type: "session/save-current-preview" }
  | { type: "session/select-item"; sessionId: string; itemId: string }
  | { type: "session/queue-item"; sessionId: string; itemId: string }
  | { type: "session/queue-selected" }
  | { type: "session/queue-all-pending"; sessionId?: string }
  | { type: "session/refresh-item"; sessionId: string; itemId: string }
  | { type: "session/refresh-selected" }
  | { type: "session/refresh-all"; sessionId?: string }
  | { type: "worker/start-processing" }
  | { type: "worker/get-status" }
  | { type: "compare/get-brief"; request: CompareBriefRequest }
  | { type: "compare/get-one-liner"; request: CompareOneLinerRequest }
  | { type: "compare/get-cluster-summaries"; request: CompareClusterSummaryRequest }
  | { type: "compare/get-evidence-annotations"; request: EvidenceAnnotationRequest }
  | { type: "compare/get-technique-readings" }
  | { type: "compare/save-technique-reading"; snapshot: TechniqueReadingSnapshot }
  | { type: "compare/get-saved-analyses" }
  | { type: "compare/save-analysis"; snapshot: SavedAnalysisSnapshot }
  | { type: "topic/list"; sessionId: string }
  | { type: "topic/create"; sessionId: string; name: string; description?: string }
  | { type: "topic/update"; id: string; patch: Partial<Pick<Topic, "name" | "status" | "tags" | "description">> }
  | { type: "topic/delete"; id: string }
  | { type: "topic/add-pair"; topicId: string; resultId: string }
  | { type: "topic/remove-pair"; topicId: string; resultId: string }
  | { type: "signal/list"; sessionId: string; status?: SignalInboxStatus }
  | { type: "signal/triage"; signalId: string; action: TriageAction }
  | { type: "compare/set-active-draft"; draft: ActiveCompareDraft | null }
  | { type: "compare/set-active-result"; result: ActiveAnalysisResult | null }
  | { type: "judgment/start"; resultId: string }
  | { type: "product/list-signal-analyses"; signalIds?: string[] }
  | { type: "product/analyze-signals"; sessionId: string }
  | { type: "product/list-agent-task-feedback" }
  | { type: "product/save-agent-task-feedback"; feedback: ProductAgentTaskFeedback }
  | { type: "product/get-context" }
  | {
    type: "judgment/result";
    resultId: string;
    judgmentResult: JudgmentResult | null;
    judgmentVersion: string | null;
    judgmentSource: SavedAnalysisSnapshot["judgmentSource"];
  }
  | { type: "state/updated"; tabId: number; snapshot: ExtensionSnapshot };

export type ExtensionSuccessResponse = {
  ok: true;
  tabId?: number;
  snapshot?: ExtensionSnapshot;
  submit?: CaptureTargetResponse;
  job?: JobSnapshot;
  capture?: CaptureSnapshot;
  compareBrief?: CompareBrief | null;
  oneLiner?: string | null;
  clusterInterpretations?: ClusterInterpretation[];
  evidenceAnnotations?: EvidenceAnnotation[];
  techniqueReadings?: TechniqueReadingSnapshot[];
  savedAnalyses?: SavedAnalysisSnapshot[];
  topics?: Topic[];
  signals?: Signal[];
  productProfile?: ProductProfile | null;
  productContext?: ProductContext | null;
  productContextError?: string | null;
  productSignalAnalyses?: ProductSignalAnalysis[];
  productAgentTaskFeedback?: ProductAgentTaskFeedback[];
  productSignalAnalysisSummary?: {
    queued: number;
    analyzed: number;
    failed: number;
  };
};

export type StartProcessingResponse =
  | (ExtensionSuccessResponse & { processingStatus: "started" | "already_running" })
  | { ok: false; error: string };

export type WorkerStatusMessageResponse =
  | (ExtensionSuccessResponse & { workerStatus: WorkerStatus })
  | { ok: false; error: string };

export type ExtensionResponse = ExtensionSuccessResponse | { ok: false; error: string };
