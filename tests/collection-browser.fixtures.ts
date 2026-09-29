import type { CaptureSnapshot } from "../src/contracts/ingest";
import type { TargetDescriptor } from "../src/contracts/target-descriptor";
import type { SessionItem, SessionRecord } from "../src/state/types";

export const savedAt = "2026-09-20T08:00:00.000Z";

export function descriptor(overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    target_type: "post", page_url: "https://www.threads.com/", post_url: "https://www.threads.com/@author/post/ABC",
    author_hint: "author", text_snippet: "收藏時的原始文字", time_token_hint: "1h", dom_anchor: "article-1",
    engagement: { likes: 12, comments: 3, reposts: 0, forwards: 0, views: null },
    engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: false },
    image_url: "https://images.example.com/saved.jpg", captured_at: savedAt,
    ...overrides
  };
}

export function capture(canonical: Record<string, unknown> = {}, overrides: Partial<CaptureSnapshot> = {}): CaptureSnapshot {
  return {
    id: "capture-1", source_type: "threads", capture_type: "post", source_page_url: "https://www.threads.com/",
    source_post_url: descriptor().post_url, canonical_target_url: descriptor().post_url,
    author_hint: "author", text_snippet: "收藏時的原始文字", time_token_hint: "1h", dom_anchor: null,
    engagement: {}, client_context: {}, ingestion_status: "succeeded", captured_at: savedAt,
    created_at: savedAt, updated_at: savedAt, job: null, analysis: null,
    result: {
      id: "result-1", job_id: "job-1", capture_id: "capture-1", source_type: "threads",
      canonical_target_url: descriptor().post_url, canonical_post: { text: "完整原文第一段。\n原文第二段。", ...canonical },
      comments: [{ text: "其他人的討論回覆" }], crawl_meta: {}, fetched_at: savedAt, created_at: savedAt
    },
    ...overrides
  };
}

export function item(id: string, overrides: Partial<SessionItem> = {}): SessionItem {
  return {
    id, descriptor: descriptor(), status: "saved", selectedAt: savedAt, savedAt,
    queuedAt: null, completedAt: null, captureId: null, jobId: null, canonicalTargetUrl: null,
    latestJob: null, latestCapture: null, commentsPreview: [], lastStatusAt: null,
    lastErrorKind: null, lastError: null, ...overrides
  };
}

export function session(id: string, items: SessionItem[], mode: SessionRecord["mode"] = "archive"): SessionRecord {
  return { id, name: `工作區 ${id}`, mode, createdAt: savedAt, updatedAt: savedAt, items };
}
