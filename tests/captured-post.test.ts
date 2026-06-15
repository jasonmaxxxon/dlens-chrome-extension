import assert from "node:assert/strict";
import test from "node:test";

import { projectCapturedPost, projectCapturedPostFromCapture } from "../src/state/captured-post.ts";
import { createSessionItem } from "../src/state/store-helpers.ts";
import type { SessionItem } from "../src/state/types.ts";

const descriptor = {
  target_type: "post" as const,
  page_url: "https://www.threads.net/@op",
  post_url: "https://www.threads.net/@op/post/abc",
  author_hint: "descriptor-op",
  text_snippet: "descriptor fallback",
  time_token_hint: "1h",
  dom_anchor: "card-1",
  engagement: { likes: 5, comments: 9, reposts: null, forwards: null, views: null },
  engagement_present: { likes: true, comments: true, reposts: false, forwards: false, views: false },
  captured_at: "2026-06-11T00:00:00.000Z"
};

function makeItem(): SessionItem {
  return {
    ...createSessionItem(descriptor, "2026-06-11T00:00:00.000Z"),
    id: "item-1",
    status: "succeeded",
    canonicalTargetUrl: "https://www.threads.net/@op/post/canonical",
    latestCapture: {
      id: "cap-1",
      source_type: "threads",
      capture_type: "post",
      source_page_url: "https://www.threads.net/@op",
      source_post_url: "https://www.threads.net/@op/post/source",
      canonical_target_url: "https://www.threads.net/@op/post/capture-canonical",
      author_hint: "capture-op",
      text_snippet: "capture fallback",
      time_token_hint: "1h",
      dom_anchor: "card-1",
      engagement: {},
      client_context: {},
      raw_payload: {},
      ingestion_status: "succeeded",
      captured_at: "2026-06-11T00:00:00.000Z",
      created_at: "2026-06-11T00:00:00.000Z",
      updated_at: "2026-06-11T00:01:00.000Z",
      job: null,
      result: {
        id: "result-1",
        job_id: "job-1",
        capture_id: "cap-1",
        source_type: "threads",
        canonical_target_url: "https://www.threads.net/@op/post/result-canonical",
        canonical_post: {},
        comments: [],
        threadReadModel: {
          assembledContent: "Root from model\n\nPart two\n\nReader says hi",
          rootPost: { postId: "root-1", author: "op", text: "Root from model", likeCount: 42 },
          opContinuations: [{ commentId: "op-1", author: "op", text: "Part two", likeCount: 7 }],
          discussionReplies: [
            { commentId: "same-author", author: "op", text: "Same author reply", likeCount: 3 },
            { commentId: "reader-1", author: "reader", text: "Reader says hi", likeCount: null },
            { commentId: "placeholder-1", author: "", text: "bookmark", likeCount: undefined }
          ]
        },
        crawl_meta: {},
        raw_payload: {},
        fetched_at: "2026-06-11T00:01:00.000Z",
        created_at: "2026-06-11T00:01:00.000Z"
      },
      analysis: {
        id: "analysis-1",
        capture_id: "cap-1",
        status: "succeeded",
        stage: "final",
        analysis_version: "v1",
        source_comment_count: 5,
        clusters: [],
        evidence: [],
        metrics: {},
        generated_at: "2026-06-11T00:02:00.000Z",
        last_error: null,
        created_at: "2026-06-11T00:02:00.000Z",
        updated_at: "2026-06-11T00:02:00.000Z"
      }
    }
  };
}

test("projectCapturedPost normalizes camelCase thread read model into one canonical post view", () => {
  const post = projectCapturedPost(makeItem());

  assert.equal(post.author, "op");
  assert.equal(post.text, "Root from model");
  assert.equal(post.sourceUrl, "https://www.threads.net/@op/post/source");
  assert.equal(post.likes, 42);
  assert.equal(post.commentCount, 5);
  assert.equal(post.hasAssembledContent, true);
  assert.equal(post.assembledContent, "Root from model\n\nPart two\n\nReader says hi");
  assert.deepEqual(post.opContinuations.map(({ id, author, text, likes, role }) => ({ id, author, text, likes, role })), [
    { id: "op-1", author: "op", text: "Part two", likes: 7, role: "op_continuation" },
    { id: "same-author", author: "op", text: "Same author reply", likes: 3, role: "op_continuation" }
  ]);
  assert.deepEqual(post.replies.map(({ id, author, text, likes, role }) => ({ id, author, text, likes, role })), [
    { id: "reader-1", author: "reader", text: "Reader says hi", likes: null, role: "audience" },
    { id: "placeholder-1", author: "", text: "bookmark", likes: null, role: "placeholder" }
  ]);
});

test("projectCapturedPost treats legacy snake_case capture fields the same way", () => {
  const item = makeItem();
  item.latestCapture = {
    ...item.latestCapture!,
    source_post_url: "",
    canonical_target_url: "https://www.threads.net/@op/post/snake-canonical",
    result: {
      ...item.latestCapture!.result!,
      threadReadModel: null,
      thread_read_model: {
        assembled_content: "Snake root\n\nSnake reply",
        root_post: { post_id: "snake-root", author: "snake-op", text: "Snake root", like_count: 11 },
        op_continuations: [{ comment_id: "snake-op-1", author: "snake-op", text: "Snake continuation", like_count: 2 }],
        discussion_replies: [{ comment_id: "snake-r1", author: "reader", text: "Snake reply", like_count: 4 }]
      }
    }
  } as SessionItem["latestCapture"];

  const post = projectCapturedPost(item);

  assert.equal(post.author, "snake-op");
  assert.equal(post.text, "Snake root");
  assert.equal(post.sourceUrl, "https://www.threads.net/@op/post/snake-canonical");
  assert.equal(post.likes, 11);
  assert.equal(post.hasAssembledContent, true);
  assert.deepEqual(post.opContinuations.map((fragment) => fragment.id), ["snake-op-1"]);
  assert.deepEqual(post.replies.map((fragment) => fragment.id), ["snake-r1"]);
});

test("projectCapturedPost normalizes backend B1 reply edges and orphan replies", () => {
  const item = makeItem();
  item.latestCapture = {
    ...item.latestCapture!,
    result: {
      ...item.latestCapture!.result!,
      threadReadModel: null,
      thread_read_model: {
        assembled_content: "Root\n\nPart two",
        root_post: { post_id: "root", author: "op", text: "Root" },
        op_continuations: [
          {
            comment_id: "op-1",
            source_comment_id: "src-op-1",
            parent_comment_id: "root",
            author: "op",
            text: "Part two"
          }
        ],
        discussion_replies: [
          {
            comment_id: "c1",
            source_comment_id: "src-c1",
            parent_comment_id: "root",
            author: "reader",
            text: "Top-level reply"
          },
          {
            comment_id: "c2",
            source_comment_id: "src-c2",
            parent_comment_id: "missing-parent",
            parent_source_comment_id: "src-missing",
            author: "reader2",
            text: "Orphan reply"
          },
          {
            comment_id: "c3",
            source_comment_id: "src-c3",
            parent_comment_id: "c1",
            parent_source_comment_id: "src-c1",
            author: "reader3",
            text: "Nested reply"
          }
        ],
        reply_edges: [
          { comment_id: "c3", parent_comment_id: "c1", parent_kind: "comment" }
        ],
        orphan_replies: [
          {
            comment_id: "c2",
            parent_comment_id: "missing-parent",
            parent_source_comment_id: "src-missing",
            reason: "parent_not_found_in_comments_or_root"
          }
        ]
      }
    }
  } as SessionItem["latestCapture"];

  const post = projectCapturedPost(item);

  assert.deepEqual(post.replyEdges, [{ commentId: "c3", parentCommentId: "c1", parentKind: "comment" }]);
  assert.deepEqual(post.orphanReplies.map((entry) => entry.commentId), ["c2"]);
  assert.equal(post.discussionReplies.find((fragment) => fragment.id === "c2")?.isOrphan, true);
  assert.equal(post.discussionReplies.find((fragment) => fragment.id === "c2")?.parentId, "missing-parent");
  assert.equal(post.discussionReplies.find((fragment) => fragment.id === "c3")?.resolvedParentId, "c1");
});

test("projectCapturedPost does not turn unknown counts on unfinished captures into zero", () => {
  const item = {
    ...makeItem(),
    status: "running" as const
  };

  const post = projectCapturedPost(item);

  assert.equal(post.commentCount, null);
});

test("projectCapturedPost falls back to capture and descriptor text without swapping OP and replies", () => {
  const item = makeItem();
  item.latestCapture = {
    ...item.latestCapture!,
    result: null,
    analysis: null,
    text_snippet: "Capture fallback OP"
  } as SessionItem["latestCapture"];

  const post = projectCapturedPost(item);

  assert.equal(post.author, "capture-op");
  assert.equal(post.text, "Capture fallback OP");
  assert.equal(post.likes, 5);
  assert.deepEqual(post.opContinuations, []);
  assert.deepEqual(post.replies, []);
  assert.equal(post.hasAssembledContent, false);
});

test("projectCapturedPost only uses legacy comments when thread read model is absent", () => {
  const item = makeItem();
  item.latestCapture = {
    ...item.latestCapture!,
    result: {
      ...item.latestCapture!.result!,
      comments: [{ comment_id: "legacy-r1", author: "legacy", text: "Legacy reply", like_count: 8 }],
      threadReadModel: {
        assembledContent: "Model root",
        rootPost: { postId: "root-1", author: "op", text: "Model root", likeCount: 1 },
        opContinuations: [],
        discussionReplies: []
      }
    }
  } as SessionItem["latestCapture"];

  const withModel = projectCapturedPostFromCapture(item.latestCapture, { includeLegacyComments: true });

  assert.deepEqual(withModel.discussionReplies, []);

  item.latestCapture = {
    ...item.latestCapture!,
    result: {
      ...item.latestCapture!.result!,
      threadReadModel: null,
      thread_read_model: null
    }
  } as SessionItem["latestCapture"];

  const withoutModel = projectCapturedPostFromCapture(item.latestCapture, { includeLegacyComments: true });

  assert.deepEqual(withoutModel.discussionReplies.map(({ id, author, text, likes, role }) => ({ id, author, text, likes, role })), [
    { id: "legacy-r1", author: "legacy", text: "Legacy reply", likes: 8, role: "audience" }
  ]);
});
