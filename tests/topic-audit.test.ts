import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTopicEvidencePackets,
  getAudienceReplies,
  getOpContinuations,
  getPlaceholderReplies
} from "../src/compare/topic-audit.ts";
import type { SessionItem, Signal, SignalTagsRecord, Topic } from "../src/state/types.ts";

function makeTopic(): Topic {
  return {
    id: "topic-love",
    sessionId: "session-1",
    name: "love",
    status: "watching",
    tags: [],
    signalIds: ["signal-love"],
    pairIds: [],
    createdAt: "2026-05-22T09:00:00.000Z",
    updatedAt: "2026-05-22T09:00:00.000Z",
    context: null,
    synthesis: null
  };
}

function makeSignal(): Signal {
  return {
    id: "signal-love",
    sessionId: "session-1",
    itemId: "item-love",
    source: "threads",
    inboxStatus: "assigned",
    topicId: "topic-love",
    capturedAt: "2026-05-22T09:05:00.000Z"
  };
}

function makeItem(): SessionItem {
  return {
    id: "item-love",
    descriptor: {
      target_type: "post",
      page_url: "https://www.threads.net/",
      post_url: "https://www.threads.net/@op/post/love",
      author_hint: "op",
      text_snippet: "Root fallback should not win",
      time_token_hint: "22/5",
      dom_anchor: "anchor",
      engagement: { likes: null, comments: null, reposts: null, forwards: null, views: null },
      engagement_present: { likes: false, comments: false, reposts: false, forwards: false, views: false },
      captured_at: "2026-05-22T09:03:00.000Z"
    },
    status: "succeeded",
    selectedAt: "2026-05-22T09:03:00.000Z",
    savedAt: "2026-05-22T09:04:00.000Z",
    queuedAt: null,
    completedAt: "2026-05-22T09:06:00.000Z",
    captureId: "cap-love",
    jobId: null,
    canonicalTargetUrl: "https://www.threads.net/@op/post/love",
    latestJob: null,
    latestCapture: {
      id: "cap-love",
      source_type: "threads",
      capture_type: "post",
      source_page_url: "https://www.threads.net/",
      source_post_url: "https://www.threads.net/@op/post/love",
      canonical_target_url: "https://www.threads.net/@op/post/love",
      author_hint: "op",
      text_snippet: "Root fallback should not win",
      time_token_hint: "22/5",
      dom_anchor: "anchor",
      engagement: {},
      client_context: {},
      raw_payload: {},
      ingestion_status: "succeeded",
      captured_at: "2026-05-22T09:03:00.000Z",
      created_at: "2026-05-22T09:03:00.000Z",
      updated_at: "2026-05-22T09:06:00.000Z",
      job: null,
      result: {
        id: "result-love",
        job_id: "job-love",
        capture_id: "cap-love",
        source_type: "threads",
        canonical_target_url: "https://www.threads.net/@op/post/love",
        canonical_post: {},
        comments: [],
        thread_read_model: {
          root_post: {
            author: "op",
            text: "靚女玩 app 會遇到市場錯配。",
            like_count: 81
          },
          op_continuations: [
            { comment_id: "op-c1", source_comment_id: "src-op-c1", author: "op", text: "第一點：app 會放大選擇成本。", time_token: "1h", like_count: 7, reply_count: 1 }
          ],
          discussion_replies: [
            { comment_id: "r1", source_comment_id: "src-r1", parent_comment_id: "root", author: "reader", text: "我同老公就是 app 識的。", time_token: "58m", like_count: null, reply_count: 2 },
            { comment_id: "op-c2", source_comment_id: "src-op-c2", parent_comment_id: "r1", author: "op", text: "補充：這不是叫人不要拍拖。", time_token: "55m", like_count: 3, reply_count: 0 },
            { comment_id: "p1", author: "", text: "bookmark", time_token: "50m", like_count: undefined, reply_count: 0 }
          ]
        },
        crawl_meta: {},
        raw_payload: {},
        fetched_at: "2026-05-22T09:06:00.000Z",
        created_at: "2026-05-22T09:06:00.000Z"
      },
      analysis: {
        id: "analysis-love",
        capture_id: "cap-love",
        status: "succeeded",
        stage: "final",
        analysis_version: "v1",
        source_comment_count: 4,
        clusters: [],
        evidence: [],
        metrics: {},
        generated_at: "2026-05-22T09:07:00.000Z",
        last_error: null,
        created_at: "2026-05-22T09:07:00.000Z",
        updated_at: "2026-05-22T09:07:00.000Z"
      }
    },
    commentsPreview: [],
    lastStatusAt: "2026-05-22T09:06:00.000Z",
    lastErrorKind: null,
    lastError: null
  };
}

test("buildTopicEvidencePackets separates OP continuations, OP replies, audience replies, and placeholders", () => {
  const tags: SignalTagsRecord = {
    itemId: "item-love",
    status: "complete",
    signalTags: ["交友 app", "戀愛市場"],
    signalGist: "這篇把交友 app 寫成選擇成本與價值錯配問題。",
    promptVersion: "v1",
    model: "google:test",
    generatedAt: "2026-05-22T09:08:00.000Z"
  };

  const [packet] = buildTopicEvidencePackets({
    topic: makeTopic(),
    signals: [makeSignal()],
    items: [makeItem()],
    signalTagsByItemId: { "item-love": tags }
  });

  assert.ok(packet);
  assert.equal(packet.shortCode, "S1");
  assert.equal(packet.opAuthor, "op");
  assert.equal(packet.opText, "靚女玩 app 會遇到市場錯配。");
  assert.equal(packet.opLikes, 81);
  assert.equal(packet.commentCount, 4);
  assert.deepEqual(packet.aiArtifacts, {
    gist: "這篇把交友 app 寫成選擇成本與價值錯配問題。",
    tags: ["交友 app", "戀愛市場"]
  });
  assert.deepEqual(packet.replyFragments.map((fragment) => [fragment.ref, fragment.role, fragment.author, fragment.likes]), [
    ["S1.OPC1", "op_continuation", "op", 7],
    ["S1.R1", "audience", "reader", null],
    ["S1.OPR1", "op_reply", "op", 3],
    ["S1.P1", "placeholder", "", null]
  ]);
  assert.deepEqual(packet.replyFragments.map((fragment) => [
    fragment.ref,
    fragment.commentId,
    fragment.sourceId,
    fragment.parentId,
    fragment.replyCount,
    fragment.timeToken
  ]), [
    ["S1.OPC1", "op-c1", "src-op-c1", null, 1, "1h"],
    ["S1.R1", "r1", "src-r1", "root", 2, "58m"],
    ["S1.OPR1", "op-c2", "src-op-c2", "r1", 0, "55m"],
    ["S1.P1", "p1", null, null, 0, "50m"]
  ]);
  assert.deepEqual(getOpContinuations(packet).map((fragment) => fragment.text), [
    "第一點：app 會放大選擇成本。"
  ]);
  assert.deepEqual(getAudienceReplies(packet).map((fragment) => fragment.ref), ["S1.R1"]);
  assert.equal(packet.replyFragments.find((fragment) => fragment.ref === "S1.OPR1")?.text, "補充：這不是叫人不要拍拖。");
  assert.deepEqual(getPlaceholderReplies(packet).map((fragment) => fragment.ref), ["S1.P1"]);
});

test("buildTopicEvidencePackets keeps queued and unknown numeric fields as null rather than zero", () => {
  const topic = { ...makeTopic(), signalIds: ["signal-queued"] };
  const signal: Signal = {
    ...makeSignal(),
    id: "signal-queued",
    itemId: "item-queued",
    capturedAt: "2026-05-22T10:00:00.000Z"
  };
  const item: SessionItem = {
    ...makeItem(),
    id: "item-queued",
    status: "queued",
    captureId: null,
    latestCapture: null,
    commentsPreview: [],
    descriptor: {
      ...makeItem().descriptor,
      post_url: "https://www.threads.net/@op/post/queued",
      text_snippet: "殯儀館看更 30k，敢唔敢做？",
      engagement: { likes: null, comments: null, reposts: null, forwards: null, views: null }
    }
  };

  const [packet] = buildTopicEvidencePackets({
    topic,
    signals: [signal],
    items: [item],
    signalTagsByItemId: {}
  });

  assert.ok(packet);
  assert.equal(packet.status, "queued");
  assert.equal(packet.opLikes, null);
  assert.equal(packet.commentCount, null);
  assert.deepEqual(packet.replyFragments, []);
  assert.match(packet.gaps.join(" "), /capture not completed/);
});
