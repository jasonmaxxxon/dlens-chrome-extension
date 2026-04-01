import type { TargetDescriptor } from "./target-descriptor";

export interface CaptureTargetRequest {
  source_type: "threads";
  capture_type: "post";
  page_url: string;
  post_url?: string;
  author_hint?: string;
  text_snippet?: string;
  time_token_hint?: string;
  dom_anchor?: string;
  engagement: TargetDescriptor["engagement"];
  captured_at: string;
  client_context: {
    route_type: string;
    selection_source: "chrome_extension_v0";
    target_type: TargetDescriptor["target_type"];
    surface: "feed" | "post_detail";
  };
}

export interface CaptureTargetResponse {
  capture_id: string;
  job_id: string;
  status: "queued";
  job_type: "threads_post_comments_crawl";
  canonical_target_url: string;
}

export interface WorkerDrainResponse {
  status: "started" | "already_running";
}

export interface WorkerStatusResponse {
  status: "idle" | "draining";
}

export type BackendJobStatus = "pending" | "running" | "succeeded" | "dead";
export type SidebarJobStatus = "queued" | "running" | "succeeded" | "dead";

export interface JobSnapshot {
  id: string;
  capture_id: string;
  job_type: string;
  status: BackendJobStatus;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  scheduled_at: string;
  claimed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  lease_expires_at: string | null;
  worker_token: string | null;
  last_error_kind: string | null;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrawlResultSnapshot {
  id: string;
  job_id: string;
  capture_id: string;
  source_type: string;
  canonical_target_url: string;
  canonical_post: Record<string, unknown>;
  comments: Array<Record<string, unknown>>;
  crawl_meta: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  fetched_at: string;
  created_at: string;
}

export interface AnalysisClusterSnapshot {
  cluster_key: number;
  size_share: number;
  like_share: number;
  keywords: string[];
}

export interface AnalysisEvidenceCommentSnapshot {
  comment_id: string;
  text: string;
  author?: string;
  like_count?: number;
}

export interface AnalysisEvidenceSnapshot {
  cluster_key: number;
  comments: AnalysisEvidenceCommentSnapshot[];
}

export interface AnalysisSnapshot {
  id: string;
  capture_id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  stage: "final";
  analysis_version: string;
  source_comment_count: number | null;
  clusters: AnalysisClusterSnapshot[];
  evidence: AnalysisEvidenceSnapshot[];
  metrics: Record<string, unknown>;
  generated_at: string | null;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CaptureSnapshot {
  id: string;
  source_type: string;
  capture_type: string;
  source_page_url: string;
  source_post_url: string;
  canonical_target_url: string;
  author_hint: string | null;
  text_snippet: string | null;
  time_token_hint: string | null;
  dom_anchor: string | null;
  engagement: Record<string, unknown>;
  client_context: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  ingestion_status: "queued" | "running" | "succeeded" | "failed";
  captured_at: string;
  created_at: string;
  updated_at: string;
  job: JobSnapshot | null;
  result: CrawlResultSnapshot | null;
  analysis: AnalysisSnapshot | null;
}

export interface QueuedCapture {
  capture_id: string;
  job_id: string;
  canonical_target_url: string;
  status: SidebarJobStatus;
  last_status_at: string;
  last_error_kind: string | null;
  last_error: string | null;
}
