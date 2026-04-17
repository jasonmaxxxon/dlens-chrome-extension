import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createSessionItem, createSessionRecord } from "../src/state/store-helpers.ts";
import { CompareSetupView } from "../src/ui/CompareSetupView.tsx";
import type { SessionItem } from "../src/state/types.ts";

function buildReadyItems(): SessionItem[] {
  const session = createSessionRecord("Signals", "2026-04-13T13:00:00.000Z");
  const itemA = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@openai_tw/post/a",
      post_url: "https://www.threads.net/@openai_tw/post/a",
      author_hint: "openai_tw",
      text_snippet: "GPT-5 正式發布，多模態能力全面提升",
      time_token_hint: "4月2日",
      dom_anchor: "a",
      engagement: { likes: 10, comments: 10, reposts: 0, forwards: 0, views: 100 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-04-13T13:00:00.000Z"
    },
    "2026-04-13T13:00:00.000Z"
  );
  itemA.status = "succeeded";
  itemA.latestCapture = { analysis: { status: "succeeded" } } as SessionItem["latestCapture"];
  const itemB = createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@tec_journalist/post/b",
      post_url: "https://www.threads.net/@tec_journalist/post/b",
      author_hint: "tec_journalist",
      text_snippet: "AI 取代潮已來臨，這次不是狼來了",
      time_token_hint: "4月1日",
      dom_anchor: "b",
      engagement: { likes: 8, comments: 8, reposts: 0, forwards: 0, views: 90 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
      captured_at: "2026-04-13T13:00:00.000Z"
    },
    "2026-04-13T13:00:00.000Z"
  );
  itemB.status = "succeeded";
  itemB.latestCapture = { analysis: { status: "succeeded" } } as SessionItem["latestCapture"];
  session.items.push(itemA, itemB);
  return session.items;
}

test("CompareSetupView renders a teaser card and keeps the CTA disabled while loading", () => {
  const readyItems = buildReadyItems();
  const html = renderToStaticMarkup(
    React.createElement(CompareSetupView, {
      readyItems,
      selectedA: readyItems[0]!.id,
      selectedB: readyItems[1]!.id,
      teaserState: "loading",
      teaser: null,
      onChangeA: () => undefined,
      onChangeB: () => undefined,
      onOpenResult: () => undefined,
      onReset: () => undefined
    })
  );

  assert.match(html, /建立比較|Compare/);
  assert.match(html, /data-compare-teaser-state="loading"/);
  assert.match(html, /查看完整分析/);
  assert.match(html, /disabled/);
});

test("CompareSetupView enables the CTA once the teaser is ready, including fallback copy", () => {
  const readyItems = buildReadyItems();
  const html = renderToStaticMarkup(
    React.createElement(CompareSetupView, {
      readyItems,
      selectedA: readyItems[0]!.id,
      selectedB: readyItems[1]!.id,
      teaserState: "ready",
      teaser: {
        headline: "焦慮是主調，但理性聲音正在集結",
        deck: "兩篇貼文的留言區呈現截然不同的反應結構。",
        metadataLabel: "847 則留言 · 3 群組 · fallback"
      },
      onChangeA: () => undefined,
      onChangeB: () => undefined,
      onOpenResult: () => undefined,
      onReset: () => undefined
    })
  );

  assert.match(html, /data-compare-teaser-state="ready"/);
  assert.match(html, /焦慮是主調，但理性聲音正在集結/);
  assert.match(html, /847 則留言 · 3 群組 · fallback/);
  assert.doesNotMatch(html, /查看完整分析[^<]*disabled/);
});
