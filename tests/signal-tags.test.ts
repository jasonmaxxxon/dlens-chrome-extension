import assert from "node:assert/strict";
import test from "node:test";

import {
  SIGNAL_TAGS_EVIDENCE_CAP,
  SIGNAL_TAGS_PROMPT_VERSION,
  SIGNAL_TAGS_SYSTEM_PROMPT,
  buildSignalTagsInputFromCapture,
  buildSignalTagsPrompt,
  parseSignalTagsResponse
} from "../src/compare/signal-tags.ts";

test("buildSignalTagsInputFromCapture uses assembled content and top replies", () => {
  const input = buildSignalTagsInputFromCapture({
    itemId: "item-1",
    capture: {
      source_post_url: "https://www.threads.net/@worker/post/abc",
      result: {
        thread_read_model: {
          assembled_content: "主文：僱主要請外勞，但本地求職者覺得職位被壓價。",
          discussion_replies: Array.from({ length: SIGNAL_TAGS_EVIDENCE_CAP + 2 }, (_, index) => ({
            comment_id: `c${index + 1}`,
            author: `reader${index + 1}`,
            text: `留言 ${index + 1}`,
            like_count: SIGNAL_TAGS_EVIDENCE_CAP + 2 - index
          }))
        }
      }
    } as any
  });

  assert.ok(input);
  assert.equal(input?.itemId, "item-1");
  assert.equal(input?.assembledContent, "主文：僱主要請外勞，但本地求職者覺得職位被壓價。");
  assert.equal(input?.postUrl, "https://www.threads.net/@worker/post/abc");
  assert.equal(input?.evidenceCatalog.length, SIGNAL_TAGS_EVIDENCE_CAP);
  assert.deepEqual(input?.evidenceCatalog.slice(0, 2), [
    { ref: "e1", id: "c1", author: "reader1", text: "留言 1", likeCount: 12 },
    { ref: "e2", id: "c2", author: "reader2", text: "留言 2", likeCount: 11 }
  ]);
});

test("buildSignalTagsPrompt asks for semantic tags rather than term frequency", () => {
  const input = buildSignalTagsInputFromCapture({
    itemId: "item-1",
    capture: {
      result: {
        thread_read_model: {
          assembled_content: "主文：僱主要請外勞，但本地求職者覺得職位被壓價。",
          discussion_replies: [
            { comment_id: "c1", author: "reader", text: "其實是在講本地人求職難。", like_count: 8 }
          ]
        }
      }
    } as any
  });

  assert.ok(input);
  const prompt = buildSignalTagsPrompt(input!);

  assert.match(prompt, /語意標籤/);
  assert.match(prompt, /不需要逐字出現在原文/);
  assert.match(prompt, /求職/);
  assert.match(prompt, /外勞/);
  assert.match(prompt, /signal_tags/);
  assert.match(prompt, /signal_gist/);
  assert.equal(SIGNAL_TAGS_PROMPT_VERSION, "v1");
  assert.match(SIGNAL_TAGS_SYSTEM_PROMPT, /只做輕量內容標記/);
});

test("parseSignalTagsResponse normalizes tags and gist", () => {
  const input = buildSignalTagsInputFromCapture({
    itemId: "item-1",
    capture: {
      result: {
        thread_read_model: {
          assembled_content: "主文：僱主要請外勞，但本地求職者覺得職位被壓價。",
          discussion_replies: []
        }
      }
    } as any
  });

  const parsed = parseSignalTagsResponse(
    JSON.stringify({
      signal_tags: ["求職", "外勞", "職位壓價", "求職", "本地勞工", "超出上限"],
      signal_gist: "這篇是在討論外勞招聘與本地求職者被壓價的衝突。"
    }),
    input!,
    "google:test-model",
    "2026-05-21T00:00:00.000Z"
  );

  assert.deepEqual(parsed, {
    itemId: "item-1",
    status: "complete",
    signalTags: ["求職", "外勞", "職位壓價", "本地勞工", "超出上限"],
    signalGist: "這篇是在討論外勞招聘與本地求職者被壓價的衝突。",
    promptVersion: SIGNAL_TAGS_PROMPT_VERSION,
    model: "google:test-model",
    generatedAt: "2026-05-21T00:00:00.000Z"
  });
});

test("parseSignalTagsResponse rejects empty tag or gist payloads", () => {
  const input = buildSignalTagsInputFromCapture({
    itemId: "item-1",
    capture: {
      result: { thread_read_model: { assembled_content: "主文", discussion_replies: [] } }
    } as any
  });

  assert.equal(parseSignalTagsResponse(JSON.stringify({ signal_tags: [], signal_gist: "x" }), input!, "model"), null);
  assert.equal(parseSignalTagsResponse(JSON.stringify({ signal_tags: ["求職"], signal_gist: "" }), input!, "model"), null);
});
