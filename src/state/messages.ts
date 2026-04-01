import type { CaptureSnapshot, CaptureTargetResponse, JobSnapshot } from "../contracts/ingest";
import type { CompareOneLinerRequest } from "../compare/one-liner";
import type { ClusterInterpretation, CompareClusterSummaryRequest } from "../compare/cluster-interpretation";
import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { ExtensionSnapshot, HoverCandidateStrength, PopupPage } from "./types";
import type { WorkerStatus } from "./processing-state";

export type ExtensionMessage =
  | { type: "state/get-active-tab" }
  | { type: "state/get-tab"; tabId: number }
  | { type: "settings/set-ingest-base-url"; value: string }
  | { type: "settings/set-one-liner-config"; provider: "openai" | "claude" | "google" | null; openaiApiKey: string; claudeApiKey: string; googleApiKey: string }
  | { type: "popup/open-active-tab" }
  | { type: "popup/close-tab"; tabId: number }
  | { type: "popup/navigate-active-tab"; page: PopupPage }
  | { type: "selection/start-active-tab" }
  | { type: "selection/cancel-active-tab" }
  | { type: "selection/start-tab"; tabId: number }
  | { type: "selection/cancel-tab"; tabId: number }
  | { type: "selection/hovered"; descriptor: TargetDescriptor | null; strength?: HoverCandidateStrength | null }
  | { type: "selection/selected"; descriptor: TargetDescriptor }
  | { type: "selection/mode-changed"; enabled: boolean }
  | { type: "session/create"; name: string; saveCurrentPreview?: boolean }
  | { type: "session/rename"; sessionId: string; name: string }
  | { type: "session/delete"; sessionId: string }
  | { type: "session/set-active"; sessionId: string }
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
  | { type: "compare/get-one-liner"; request: CompareOneLinerRequest }
  | { type: "compare/get-cluster-summaries"; request: CompareClusterSummaryRequest }
  | { type: "state/updated"; tabId: number; snapshot: ExtensionSnapshot };

export type ExtensionSuccessResponse = {
  ok: true;
  tabId?: number;
  snapshot?: ExtensionSnapshot;
  submit?: CaptureTargetResponse;
  job?: JobSnapshot;
  capture?: CaptureSnapshot;
  oneLiner?: string | null;
  clusterInterpretations?: ClusterInterpretation[];
};

export type StartProcessingResponse =
  | (ExtensionSuccessResponse & { processingStatus: "started" | "already_running" })
  | { ok: false; error: string };

export type WorkerStatusMessageResponse =
  | (ExtensionSuccessResponse & { workerStatus: WorkerStatus })
  | { ok: false; error: string };

export type ExtensionResponse = ExtensionSuccessResponse | { ok: false; error: string };
