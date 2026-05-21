import assert from "node:assert/strict";
import test from "node:test";

import {
  TOPIC_SIGNAL_READING_EVIDENCE_CAP,
  TOPIC_SIGNAL_READING_JSON_SCHEMA,
  TOPIC_SIGNAL_READING_PROMPT_VERSION,
  TOPIC_SIGNAL_READING_SYSTEM_PROMPT,
  buildTopicSignalReadingInputFromCapture,
  buildTopicSignalReadingPrompt,
  parseTopicSignalReadingResponse
} from "../src/compare/topic-signal-reading.ts";
import { generateTopicSignalReading } from "../src/compare/provider.ts";

test("buildTopicSignalReadingInputFromCapture uses assembled content, replies, and cluster hints", () => {
  const input = buildTopicSignalReadingInputFromCapture({
    signalId: "sig-1",
    topicId: "topic-1",
    researchQuestion: "Claude Code 使用者對 agent mode 的主要抱怨是什麼？",
    capture: {
      source_post_url: "https://www.threads.net/@dev/post/abc",
      result: {
        thread_read_model: {
          assembled_content: "主文：agent mode 跑得很慢，但能自動完成重構。",
          discussion_replies: Array.from({ length: TOPIC_SIGNAL_READING_EVIDENCE_CAP + 2 }, (_, index) => ({
            comment_id: `c${index + 1}`,
            author: `reader${index + 1}`,
            text: `留言 ${index + 1}`,
            like_count: TOPIC_SIGNAL_READING_EVIDENCE_CAP + 2 - index
          }))
        }
      },
      analysis: {
        clusters: [
          { keywords: ["agent mode", "latency"], size_share: 0.7, like_share: 0.8 },
          { keywords: ["agent mode", "prompt caching"], size_share: 0.3, like_share: 0.2 }
        ]
      }
    } as any
  });

  assert.ok(input);
  assert.equal(input?.assembledContent, "主文：agent mode 跑得很慢，但能自動完成重構。");
  assert.equal(input?.postUrl, "https://www.threads.net/@dev/post/abc");
  assert.equal(input?.evidenceCatalog.length, TOPIC_SIGNAL_READING_EVIDENCE_CAP);
  assert.deepEqual(input?.evidenceCatalog.slice(0, 2), [
    { ref: "e1", id: "c1", author: "reader1", text: "留言 1", likeCount: 17 },
    { ref: "e2", id: "c2", author: "reader2", text: "留言 2", likeCount: 16 }
  ]);
  assert.deepEqual(input?.clusterKeywords, ["agent mode", "latency", "prompt caching"]);
});

test("buildTopicSignalReadingInputFromCapture returns null without assembled content", () => {
  assert.equal(
    buildTopicSignalReadingInputFromCapture({
      signalId: "sig-1",
      topicId: "topic-1",
      researchQuestion: "研究問題",
      capture: { result: { thread_read_model: { assembled_content: "", discussion_replies: [] } } } as any
    }),
    null
  );
});

test("buildTopicSignalReadingPrompt grounds the reading in research question and audience evidence", () => {
  const input = buildTopicSignalReadingInputFromCapture({
    signalId: "sig-1",
    topicId: "topic-1",
    researchQuestion: "AI coding agent 的採用障礙是速度還是信任？",
    capture: {
      result: {
        thread_read_model: {
          assembled_content: "主文：agent 一直改壞測試，我只敢拿它做小任務。",
          discussion_replies: [
            { comment_id: "c1", author: "builder", text: "我也是，最後都要人工 review。", like_count: 42 }
          ]
        }
      },
      analysis: {
        clusters: [{ keywords: ["review burden", "agent trust"], size_share: 1, like_share: 1 }]
      }
    } as any
  });

  assert.ok(input);
  const prompt = buildTopicSignalReadingPrompt(input!);

  assert.match(prompt, /AI coding agent 的採用障礙是速度還是信任？/);
  assert.match(prompt, /主文：agent 一直改壞測試/);
  assert.match(prompt, /e1 \[♥42\] @builder: 我也是，最後都要人工 review。/);
  assert.match(prompt, /關鍵詞線索/);
  assert.match(prompt, /僅供參考，不要直接引用為分析結論/);
  assert.match(prompt, /reading：必須引用至少一個 e ref/);
  assert.equal(TOPIC_SIGNAL_READING_PROMPT_VERSION, "v1");
  assert.match(TOPIC_SIGNAL_READING_SYSTEM_PROMPT, /輿情研究員/);
  assert.deepEqual(TOPIC_SIGNAL_READING_JSON_SCHEMA.required, [
    "stance",
    "reading",
    "audience_signal",
    "evidence_refs",
    "uncertainties"
  ]);
});

test("buildTopicSignalReadingPrompt supports exploratory readings without a research question", () => {
  const input = buildTopicSignalReadingInputFromCapture({
    signalId: "sig-1",
    topicId: "topic-1",
    researchQuestion: "",
    capture: {
      result: {
        thread_read_model: {
          assembled_content: "主文：有人整理跨平台 agent workflow，留言在問定期爬資料和瀏覽器自動化。",
          discussion_replies: [
            { comment_id: "c1", author: "builder", text: "這比較像 recurring crawl + browser automation。", like_count: 12 }
          ]
        }
      }
    } as any
  });

  assert.ok(input);
  const prompt = buildTopicSignalReadingPrompt(input!);

  assert.doesNotMatch(prompt, /\[研究問題\]/);
  assert.match(prompt, /\[探索模式\]/);
  assert.match(prompt, /這篇在說什麼/);
  assert.match(prompt, /產品開發或工作流/);
  assert.match(prompt, /stance: central = 這篇本身就是 topic 的核心材料/);
});

test("parseTopicSignalReadingResponse accepts grounded readings and filters invalid refs", () => {
  const input = buildTopicSignalReadingInputFromCapture({
    signalId: "sig-1",
    topicId: "topic-1",
    researchQuestion: "AI coding agent 的採用障礙是什麼？",
    capture: {
      result: {
        thread_read_model: {
          assembled_content: "主文",
          discussion_replies: [{ comment_id: "c1", author: "builder", text: "需要 review。", like_count: 2 }]
        }
      }
    } as any
  });

  const parsed = parseTopicSignalReadingResponse(
    JSON.stringify({
      stance: "central",
      reading: "這則討論顯示信任成本比速度更核心，因為留言者仍強調人工 review（e1）。",
      audience_signal: "觀眾主流反應是接受工具，但不願放棄人工檢查（e1）。",
      evidence_refs: ["e1", "e9", "bad"],
      uncertainties: ["需要確認這是否只發生在大型重構。"]
    }),
    input!,
    "google:test-model",
    "2026-05-21T00:00:00.000Z"
  );

  assert.deepEqual(parsed, {
    signalId: "sig-1",
    topicId: "topic-1",
    status: "complete",
    stance: "central",
    reading: "這則討論顯示信任成本比速度更核心，因為留言者仍強調人工 review（e1）。",
    audienceSignal: "觀眾主流反應是接受工具，但不願放棄人工檢查（e1）。",
    evidenceRefs: ["e1"],
    uncertainties: ["需要確認這是否只發生在大型重構。"],
    promptVersion: TOPIC_SIGNAL_READING_PROMPT_VERSION,
    model: "google:test-model",
    generatedAt: "2026-05-21T00:00:00.000Z"
  });
});

test("parseTopicSignalReadingResponse rejects malformed stance or empty reading", () => {
  const input = buildTopicSignalReadingInputFromCapture({
    signalId: "sig-1",
    topicId: "topic-1",
    researchQuestion: "研究問題",
    capture: {
      result: { thread_read_model: { assembled_content: "主文", discussion_replies: [] } }
    } as any
  });

  assert.equal(
    parseTopicSignalReadingResponse(
      JSON.stringify({
        stance: "try",
        reading: "不應接受",
        audience_signal: "x",
        evidence_refs: [],
        uncertainties: []
      }),
      input!,
      "model"
    ),
    null
  );
  assert.equal(
    parseTopicSignalReadingResponse(
      JSON.stringify({
        stance: "central",
        reading: "",
        audience_signal: "x",
        evidence_refs: [],
        uncertainties: []
      }),
      input!,
      "model"
    ),
    null
  );
});

test("generateTopicSignalReading returns a clear missing key error", async () => {
  const input = buildTopicSignalReadingInputFromCapture({
    signalId: "sig-1",
    topicId: "topic-1",
    researchQuestion: "研究問題",
    capture: {
      result: { thread_read_model: { assembled_content: "主文", discussion_replies: [] } }
    } as any
  });

  await assert.rejects(() => generateTopicSignalReading("openai", "", input!), /AI key/);
});
