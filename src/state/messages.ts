import type { TopicReadingRecord } from "../compare/topic-reading-storage";
import type { DeepReadingRecord } from "../compare/deep-reading-storage";
import type { CaptureSnapshot, CaptureTargetResponse, JobSnapshot } from "../contracts/ingest";
import type { ExtensionSettings, LayoutPreferences, ProductAgentTaskFeedback, ProductSignalAnalysis, ProductContext, ProductProfile, FolderMode, Signal, SignalInboxStatus, Topic, TriageAction } from "./types";
import type { SignalReading } from "../compare/signal-reading-storage";
import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { ExtensionSnapshot, PopupPage } from "./types";
import type { BackendWorkUiState, WorkerStatus } from "./processing-state";
import type { PrCampaign, PrCampaignSaveDraft, PrCriterion, PrEvidenceRow, PrNarrativeSettings } from "./pr-evidence-storage";
import type { PrNarrativeRead } from "../compare/pr-narrative";
import type { DLensSignalPacket, SignalPacketIndexFilter } from "../compare/signal-packet";
import type { SignalPacketExportFormat, SignalPacketExportResult } from "../compare/signal-packet-export";
import type { SaveCurrentPreviewActionTarget, SessionActionTarget, SessionItemActionTarget } from "./action-target";
import type { PipelineTraceEntry } from "./pipeline-trace";

import type { InlineCollectMessage, InlineCollectState } from "./inline-collect";

export type ExtensionMessagePayload =
  | InlineCollectMessage
  | { type: "state/get-active-tab" }
  | { type: "state/get-tab"; tabId: number }
  | { type: "storage/get-usage" }
  | { type: "settings/set-ingest-base-url"; value: string; apiToken?: string; clearApiToken?: boolean }
  | { type: "settings/set-product-profile"; productProfile: ProductProfile | null }
  | { type: "settings/init-product-profile"; description: string }
  | { type: "settings/set-one-liner-config"; provider: "openai" | "claude" | "google" | null; openaiApiKey: string; claudeApiKey: string; googleApiKey: string; deepReadingModels?: ExtensionSettings["deepReadingModels"] }
  | { type: "settings/set-layout-preferences"; layoutPreferences: Partial<LayoutPreferences> }
  | { type: "sidepanel/open"; sessionId: string; itemId?: string; lens?: string; settingsSection?: "ai" }
  | { type: "sidepanel/take-workspace-open" }
  | { type: "deep-reading/run"; itemId: string }
  | { type: "topic-reading/run"; topicId: string }
  | { type: "inline-reading/ensure"; sessionId: string; itemId: string; retry?: boolean }
  /** The post crossing the middle of the Threads viewport; the side panel follows it. */
  | { type: "inline/in-view"; postKey: string | null }
  | { type: "inline/in-view-get"; tabId?: number }
  /** Ask the chosen provider whether the saved key works (a models listing, no generation). */
  | { type: "settings/test-ai-key" }
  | { type: "popup/navigate-active-tab"; page: PopupPage }
  | { type: "pipeline-trace/enable-background" }
  | { type: "pipeline-trace/background-event"; event: PipelineTraceEntry }
  | { type: "session/create"; name: string; saveCurrentPreview?: boolean; mode?: FolderMode; descriptor?: TargetDescriptor }
  | { type: "session/move-to-product"; sessionId: string; itemId: string }
  | { type: "session/rename"; sessionId: string; name: string }
  | { type: "session/delete"; sessionId: string }
  | { type: "session/set-active"; sessionId: string }
  | { type: "session/set-mode"; sessionId: string; mode: FolderMode }
  | { type: "session/save-current-preview"; target: SaveCurrentPreviewActionTarget; descriptor?: TargetDescriptor }
  | { type: "session/select-item"; sessionId: string; itemId: string }
  | { type: "session/undo-save"; sessionId: string; itemId: string }
  | { type: "session/queue-item"; sessionId: string; itemId: string }
  | { type: "session/queue-items"; sessionId: string; itemIds: string[] }
  | { type: "session/queue-items-and-start-processing"; sessionId: string; itemIds: string[] }
  | { type: "session/queue-selected"; target: SessionItemActionTarget }
  | { type: "session/queue-all-pending"; target: SessionActionTarget }
  | { type: "session/cancel-job"; sessionId: string; itemId: string }
  | { type: "session/refresh-item"; sessionId: string; itemId: string }
  | { type: "session/refresh-selected"; target: SessionItemActionTarget }
  | { type: "session/refresh-all"; target: SessionActionTarget }
  | { type: "worker/start-processing" }
  | { type: "worker/get-status" }
  | { type: "backend/get-health"; baseUrl: string }
  | { type: "topic/list"; sessionId: string }
  | { type: "topic/create"; sessionId: string; name: string; description?: string; context?: Topic["context"] }
  | { type: "topic/update"; id: string; patch: Partial<Pick<Topic, "name" | "status" | "tags" | "description" | "context">> }
  | { type: "topic/delete"; id: string }
  | { type: "topic/set-collection-target"; topicId: string | null }
  | { type: "extension/open-page"; path: string }
  | { type: "signal/list"; sessionId: string; status?: SignalInboxStatus }
  | { type: "signal/triage"; signalId: string; action: TriageAction }
  /** onlyIfOrphan: automatic cleanup; the background deletes only if the signal still has no backing item. */
  | { type: "signal/delete"; signalId: string; onlyIfOrphan?: boolean }
  | { type: "product/list-signal-analyses"; signalIds?: string[] }
  | { type: "product/analyze-signals"; sessionId: string }
  | { type: "product/list-agent-task-feedback" }
  | { type: "product/save-agent-task-feedback"; feedback: ProductAgentTaskFeedback }
  | { type: "product/clear-cache" }
  | { type: "product/get-context" }
  | { type: "product/list-signal-readings" }
  | { type: "product/review-signal-reading"; cacheKey: string; decision: "filed" | "deferred" | "rejected"; note?: string }
  | { type: "signal-packet/get"; signalId: string }
  | { type: "signal-packet/index"; filter?: SignalPacketIndexFilter }
  | { type: "signal-packet/export"; format: SignalPacketExportFormat; filter?: SignalPacketIndexFilter }
  | { type: "pr/list-campaigns"; sessionId: string }
  | { type: "pr/save-campaign"; sessionId: string; draft: PrCampaignSaveDraft }
  | { type: "pr/list-evidence-rows"; campaignId: string }
  | { type: "pr/save-evidence-row"; row: PrEvidenceRow }
  | { type: "pr/generate-criteria"; campaignName: string; briefText: string }
  | { type: "pr/match-criteria"; campaignId: string }
  | { type: "pr/fetch-advanced-metrics"; campaignId: string }
  | { type: "pr/generate-summary"; campaignId: string }
  | { type: "pr/get-narrative-read"; campaignId: string }
  | { type: "pr/generate-narrative-read"; campaignId: string }
  | { type: "state/updated"; tabId: number; snapshot: ExtensionSnapshot };

export type ExtensionMessage = ExtensionMessagePayload & { requestId?: string };

export interface BackendHealth {
  reachable: boolean;
  baseUrl: string;
  checkedAt: string;
  error?: string;
  uptimeSeconds?: number;
  processId?: number;
}

export type ExtensionSuccessResponse = {
  ok: true;
  inlineCollect?: InlineCollectState;
  tabId?: number;
  snapshot?: ExtensionSnapshot;
  backendHealth?: BackendHealth | null;
  submit?: CaptureTargetResponse;
  queuedItemIds?: string[];
  failedItemIds?: string[];
  job?: JobSnapshot;
  capture?: CaptureSnapshot;
  /** The workspace a card asked the side panel to open, handed over once. */
  workspaceSessionId?: string | null;
  settingsSection?: "ai";
  cancelStatus?: "cancelled" | "running" | "unsupported";
  readerItemId?: string;
  readerLens?: string;
  deepReading?: DeepReadingRecord;
  topicReading?: TopicReadingRecord;
  inlineReadingStatus?: "started" | "exists" | "no-key" | "not-ready";
  inViewPostKey?: string | null;
  aiKeyTest?: { ok: boolean; message: string };
  topics?: Topic[];
  signals?: Signal[];
  productProfile?: ProductProfile | null;
  productContext?: ProductContext | null;
  productContextError?: string | null;
  productSignalAnalyses?: ProductSignalAnalysis[];
  productAgentTaskFeedback?: ProductAgentTaskFeedback[];
  signalReading?: SignalReading | null;
  signalReadings?: SignalReading[];
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
  prNarrativeSettings?: PrNarrativeSettings;
  prNarrativeRead?: PrNarrativeRead | null;
  prNarrativeCurrentSourceHash?: string;
  prSummary?: string;
  /** Optional server-side wall-clock for the handler (ms). Used by popup
   *  perf loggers to break out IPC + reconcile cost from background work. */
  serverDurationMs?: number;
  /** Optional chrome.storage.local.set duration inside saveSnapshot (ms).
   *  When present, surfaces the dominant cost inside serverDurationMs. */
  storageSetMs?: number;
  bytesInUse?: number;
  quotaBytes?: number;
  unlimitedStorage?: boolean;
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
  | (ExtensionSuccessResponse & { workerStatus: WorkerStatus; backendWorkUiState?: BackendWorkUiState })
  | { ok: false; error: string };

export type ExtensionResponse = ExtensionSuccessResponse | { ok: false; error: string };
