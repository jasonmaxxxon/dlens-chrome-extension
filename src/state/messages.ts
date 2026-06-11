import type { CaptureSnapshot, CaptureTargetResponse, JobSnapshot } from "../contracts/ingest";
import type { CompareBrief, CompareBriefRequest } from "../compare/brief";
import type { CompareOneLinerRequest } from "../compare/one-liner";
import type {
  ActiveAnalysisResult,
  ActiveCompareDraft,
  FolderSynthesis,
  JudgmentResult,
  LayoutPreferences,
  ProductAgentTaskFeedback,
  ProductSignalAnalysis,
  SignalTagsRecord,
  TopicSignalReading,
  ProductContext,
  ProductProfile,
  FolderMode,
  SavedAnalysisSnapshot,
  Signal,
  SignalInboxStatus,
  Topic,
  TriageAction,
  TechniqueReadingSnapshot
} from "./types";
import type { SignalReading } from "../compare/signal-reading-storage";
import type { ClusterInterpretation, CompareClusterSummaryRequest } from "../compare/cluster-interpretation";
import type { EvidenceAnnotation, EvidenceAnnotationRequest } from "../compare/evidence-annotation";
import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { ExtensionSnapshot, HoverCandidateStrength, PopupPage } from "./types";
import type { WorkerStatus } from "./processing-state";
import type { PrCampaign, PrCriterion, PrEvidenceRow } from "./pr-evidence-storage";
import type { DLensSignalPacket, SignalPacketIndexFilter } from "../compare/signal-packet";
import type { SignalPacketExportFormat, SignalPacketExportResult } from "../compare/signal-packet-export";
import type { CrossTopicCalibration, EvidencePacket, TopicAuditReport, TopicAuditStageName } from "../compare/topic-audit";
import type { TopicAuditValidationFlag } from "../compare/topic-audit-validator";
import type { TopicAuditMemoBundle } from "./topic-audit-storage";
import type { SaveCurrentPreviewActionTarget, SessionActionTarget, SessionItemActionTarget } from "./action-target";

export type ExtensionMessage =
  | { type: "state/get-active-tab" }
  | { type: "state/get-tab"; tabId: number }
  | { type: "storage/get-usage" }
  | { type: "settings/set-ingest-base-url"; value: string }
  | { type: "settings/set-product-profile"; productProfile: ProductProfile | null }
  | { type: "settings/init-product-profile"; description: string }
  | { type: "settings/set-one-liner-config"; provider: "openai" | "claude" | "google" | null; openaiApiKey: string; claudeApiKey: string; googleApiKey: string }
  | { type: "settings/set-layout-preferences"; layoutPreferences: Partial<LayoutPreferences> }
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
  | { type: "session/create"; name: string; saveCurrentPreview?: boolean; mode?: FolderMode; descriptor?: TargetDescriptor }
  | { type: "session/rename"; sessionId: string; name: string }
  | { type: "session/delete"; sessionId: string }
  | { type: "session/set-active"; sessionId: string }
  | { type: "session/set-mode"; sessionId: string; mode: FolderMode }
  | { type: "session/save-current-preview"; target: SaveCurrentPreviewActionTarget; descriptor?: TargetDescriptor }
  | { type: "session/select-item"; sessionId: string; itemId: string }
  | { type: "session/queue-item"; sessionId: string; itemId: string }
  | { type: "session/queue-items"; sessionId: string; itemIds: string[] }
  | { type: "session/queue-items-and-start-processing"; sessionId: string; itemIds: string[] }
  | { type: "session/queue-selected"; target: SessionItemActionTarget }
  | { type: "session/queue-all-pending"; target: SessionActionTarget }
  | { type: "session/refresh-item"; sessionId: string; itemId: string }
  | { type: "session/refresh-selected"; target: SessionItemActionTarget }
  | { type: "session/refresh-all"; target: SessionActionTarget }
  | { type: "worker/start-processing" }
  | { type: "worker/get-status" }
  | { type: "backend/get-health"; baseUrl: string }
  | { type: "compare/get-brief"; request: CompareBriefRequest }
  | { type: "compare/get-one-liner"; request: CompareOneLinerRequest }
  | { type: "compare/get-cluster-summaries"; request: CompareClusterSummaryRequest }
  | { type: "compare/get-evidence-annotations"; request: EvidenceAnnotationRequest }
  | { type: "compare/get-technique-readings" }
  | { type: "compare/save-technique-reading"; snapshot: TechniqueReadingSnapshot }
  | { type: "compare/get-saved-analyses" }
  | { type: "compare/save-analysis"; snapshot: SavedAnalysisSnapshot }
  | { type: "topic/list"; sessionId: string }
  | { type: "topic/create"; sessionId: string; name: string; description?: string; context?: Topic["context"] }
  | { type: "topic/update"; id: string; patch: Partial<Pick<Topic, "name" | "status" | "tags" | "description" | "context">> }
  | { type: "topic/delete"; id: string }
  | { type: "topic/set-collection-target"; topicId: string | null }
  | { type: "topic/add-pair"; topicId: string; resultId: string }
  | { type: "topic/remove-pair"; topicId: string; resultId: string }
  | { type: "topic/synthesis/generate"; topicId: string }
  | { type: "topic/synthesis/clear"; topicId: string }
  | { type: "topic/audit/build-evidence"; sessionId: string; topicId: string }
  | { type: "topic/audit/run"; sessionId: string; topicId: string; fromStage?: TopicAuditStageName }
  | { type: "topic/audit/p1-signal"; sessionId: string; topicId: string; signalId: string }
  | { type: "extension/open-page"; path: string }
  | { type: "topic/audit/get"; topicId: string }
  | { type: "topic/audit/validate"; topicId: string }
  | { type: "topic/audit/clear"; topicId: string }
  | { type: "cross-topic/calibrate"; topicIds: string[] }
  | { type: "topic/generate-signal-reading"; signalId: string; topicId: string }
  | { type: "topic/list-signal-readings"; topicId: string }
  | { type: "topic/generate-missing-signal-tags"; topicId: string }
  | { type: "signal/list-tags"; itemIds?: string[] }
  | { type: "folder/synthesis/get"; sessionId: string }
  | { type: "folder/synthesis/generate"; sessionId: string }
  | { type: "folder/synthesis/clear"; sessionId: string }
  | { type: "signal/list"; sessionId: string; status?: SignalInboxStatus }
  | { type: "signal/triage"; signalId: string; action: TriageAction }
  | { type: "signal/delete"; signalId: string }
  | { type: "compare/set-active-draft"; draft: ActiveCompareDraft | null }
  | { type: "compare/set-active-result"; result: ActiveAnalysisResult | null }
  | { type: "judgment/start"; resultId: string }
  | { type: "product/list-signal-analyses"; signalIds?: string[] }
  | { type: "product/analyze-signals"; sessionId: string }
  | { type: "product/list-agent-task-feedback" }
  | { type: "product/save-agent-task-feedback"; feedback: ProductAgentTaskFeedback }
  | { type: "product/clear-cache" }
  | { type: "product/get-context" }
  | { type: "product/synthesize-signal-reading"; signalId: string; sessionId: string; force?: boolean }
  | { type: "product/list-signal-readings" }
  | { type: "product/review-signal-reading"; cacheKey: string; decision: "filed" | "deferred" | "rejected"; note?: string }
  | { type: "signal-packet/get"; signalId: string }
  | { type: "signal-packet/index"; filter?: SignalPacketIndexFilter }
  | { type: "signal-packet/export"; format: SignalPacketExportFormat; filter?: SignalPacketIndexFilter }
  | { type: "pr/list-campaigns"; sessionId: string }
  | { type: "pr/save-campaign"; campaign: PrCampaign }
  | { type: "pr/list-evidence-rows"; campaignId: string }
  | { type: "pr/save-evidence-row"; row: PrEvidenceRow }
  | { type: "pr/generate-criteria"; campaignName: string; briefText: string }
  | { type: "pr/match-criteria"; campaignId: string }
  | { type: "pr/fetch-advanced-metrics"; campaignId: string }
  | { type: "pr/generate-summary"; campaignId: string }
  | {
    type: "judgment/result";
    resultId: string;
    judgmentResult: JudgmentResult | null;
    judgmentVersion: string | null;
    judgmentSource: SavedAnalysisSnapshot["judgmentSource"];
  }
  | { type: "state/updated"; tabId: number; snapshot: ExtensionSnapshot };

export interface BackendHealth {
  reachable: boolean;
  baseUrl: string;
  checkedAt: string;
  error?: string;
}

export type ExtensionSuccessResponse = {
  ok: true;
  tabId?: number;
  snapshot?: ExtensionSnapshot;
  backendHealth?: BackendHealth | null;
  submit?: CaptureTargetResponse;
  queuedItemIds?: string[];
  failedItemIds?: string[];
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
  signalReading?: SignalReading | null;
  signalReadings?: SignalReading[];
  topicSignalReading?: TopicSignalReading | null;
  topicSignalReadings?: TopicSignalReading[];
  signalTags?: SignalTagsRecord[];
  signalPacket?: DLensSignalPacket | null;
  signalPackets?: DLensSignalPacket[];
  signalPacketExport?: SignalPacketExportResult;
  productSignalAnalysisSummary?: {
    queued: number;
    analyzed: number;
    failed: number;
    failures?: Array<{
      signalId: string;
      itemId?: string;
      sourceUrl?: string;
      error: string;
      errorKind?: string | null;
    }>;
  };
  prCampaigns?: PrCampaign[];
  prEvidenceRows?: PrEvidenceRow[];
  prAdvancedMetricsSummary?: {
    updated: number;
    failed: number;
  };
  prCriteria?: PrCriterion[];
  prSummary?: string;
  folderSynthesis?: FolderSynthesis | null;
  auditEvidence?: EvidencePacket[];
  auditReport?: TopicAuditReport | null;
  auditMemos?: TopicAuditMemoBundle | null;
  auditValidatorFlags?: TopicAuditValidationFlag[];
  crossTopicCalibration?: CrossTopicCalibration | null;
  /** Optional server-side wall-clock for the handler (ms). Used by popup
   *  perf loggers to break out IPC + reconcile cost from background work. */
  serverDurationMs?: number;
  /** Optional chrome.storage.local.set duration inside saveSnapshot (ms).
   *  When present, surfaces the dominant cost inside serverDurationMs. */
  storageSetMs?: number;
  bytesInUse?: number;
  quotaBytes?: number;
  /** session/set-mode only. "fast" = active-id-only key write (~7ms);
   *  "slow" = full saveSnapshot. Lets popup logger correlate slow switches
   *  with sessions ref equality breaking. */
  setModePath?: "fast" | "slow";
};

export type StartProcessingResponse =
  | (ExtensionSuccessResponse & { processingStatus: "started" | "already_running" })
  | { ok: false; error: string };

export type QueueItemsAndStartProcessingResponse =
  | (ExtensionSuccessResponse & {
      processingStatus?: "started" | "already_running";
      processingError?: string;
      queuedItemIds: string[];
      failedItemIds: string[];
    })
  | { ok: false; error: string; queuedItemIds?: string[]; failedItemIds?: string[] };

export type WorkerStatusMessageResponse =
  | (ExtensionSuccessResponse & { workerStatus: WorkerStatus })
  | { ok: false; error: string };

export type ExtensionResponse = ExtensionSuccessResponse | { ok: false; error: string };
