import assert from "node:assert/strict";
import test from "node:test";

import { createSessionItem } from "../src/state/store-helpers.ts";
import type { SavedAnalysisSnapshot } from "../src/state/types.ts";
import { resolveCompareSelection } from "../src/ui/useCompareDraftState.ts";
import {
  buildActiveResultFromCompareItems,
  buildActiveResultFromSavedAnalysis
} from "../src/ui/useResultSurfaceState.ts";
import {
  buildInitialPopupWorkspaceState,
  syncPopupWorkspaceStateFromSnapshot
} from "../src/ui/usePopupWorkspaceState.ts";

function buildReadyItem(id: string, author: string) {
  const item = createSessionItem({
    target_type: "post",
    page_url: `https://www.threads.net/@${author}/post/${id}`,
    post_url: `https://www.threads.net/@${author}/post/${id}`,
    author_hint: author,
    text_snippet: `post ${id}`,
    time_token_hint: "4月21日",
    dom_anchor: id,
    engagement: { likes: 1, comments: 1, reposts: 0, forwards: 0, views: 10 },
    engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true },
    captured_at: "2026-04-21T09:00:00.000Z"
  }, "2026-04-21T09:00:00.000Z");
  item.status = "succeeded";
  item.latestCapture = { analysis: { status: "succeeded" } } as typeof item.latestCapture;
  item.id = id;
  return item;
}

function buildSavedAnalysis(overrides: Partial<SavedAnalysisSnapshot> = {}): SavedAnalysisSnapshot {
  return {
    resultId: "saved_result_1",
    compareKey: "item-a::item-b",
    itemAId: "item-a",
    itemBId: "item-b",
    sourceLabelA: "@openai_tw",
    sourceLabelB: "@tec_journalist",
    headline: "焦慮是主調，但理性聲音正在集結",
    deck: "兩篇貼文的留言區呈現截然不同的反應結構。",
    primaryTensionSummary: "A 群量大，B 群互動更高。",
    groupSummary: "3 群組",
    totalComments: 847,
    dateRangeLabel: "3/28–4/4",
    savedAt: "2026-04-13T13:00:00.000Z",
    analysisVersion: "v1",
    briefVersion: "v7",
    briefSource: "ai",
    ...overrides
  };
}

test("resolveCompareSelection prefers a valid persisted draft pair", () => {
  const readyItems = [
    buildReadyItem("item-a", "openai_tw"),
    buildReadyItem("item-b", "tec_journalist"),
    buildReadyItem("item-c", "product_writer")
  ];

  const selection = resolveCompareSelection(readyItems, {
    itemAId: "item-b",
    itemBId: "item-c",
    teaserId: "item-b::item-c",
    teaserState: "ready"
  });

  assert.deepEqual(selection, {
    selectedCompareA: "item-b",
    selectedCompareB: "item-c"
  });
});

test("resolveCompareSelection falls back to the first distinct ready pair when the draft is stale", () => {
  const readyItems = [
    buildReadyItem("item-a", "openai_tw"),
    buildReadyItem("item-b", "tec_journalist")
  ];

  const selection = resolveCompareSelection(readyItems, {
    itemAId: "missing-a",
    itemBId: "missing-b",
    teaserId: "missing-a::missing-b",
    teaserState: "ready"
  });

  assert.deepEqual(selection, {
    selectedCompareA: "item-a",
    selectedCompareB: "item-b"
  });
});

test("buildActiveResultFromSavedAnalysis preserves the saved result contract", () => {
  const viewedAt = "2026-04-21T10:00:00.000Z";
  const result = buildActiveResultFromSavedAnalysis(buildSavedAnalysis(), viewedAt);

  assert.deepEqual(result, {
    resultId: "saved_result_1",
    compareKey: "item-a::item-b",
    itemAId: "item-a",
    itemBId: "item-b",
    saved: true,
    viewedAt
  });
});

test("buildActiveResultFromCompareItems preserves the live result contract", () => {
  const viewedAt = "2026-04-21T10:05:00.000Z";
  const result = buildActiveResultFromCompareItems("item-a", "item-b", viewedAt);

  assert.match(result.resultId, /^result_item-a::item-b_/);
  assert.equal(result.compareKey, "item-a::item-b");
  assert.equal(result.itemAId, "item-a");
  assert.equal(result.itemBId, "item-b");
  assert.equal(result.saved, false);
  assert.equal(result.viewedAt, viewedAt);
});

test("buildInitialPopupWorkspaceState derives compare mode only when the popup opens with a ready pair", () => {
  const summaryWithPair = {
    total: 2,
    ready: 2,
    crawling: 0,
    analyzing: 0,
    pending: 0,
    failed: 0,
    hasReadyPair: true,
    hasInflight: false
  };

  assert.deepEqual(buildInitialPopupWorkspaceState(summaryWithPair, true), {
    currentMode: "compare",
    popupOpen: true,
    modeLocked: true
  });

  assert.deepEqual(buildInitialPopupWorkspaceState(summaryWithPair, false), {
    currentMode: "library",
    popupOpen: false,
    modeLocked: false
  });
});

test("syncPopupWorkspaceStateFromSnapshot lets persisted popup page override local mode", () => {
  const nextState = syncPopupWorkspaceStateFromSnapshot(
    {
      currentMode: "library",
      popupOpen: true,
      modeLocked: true
    },
    "result",
    true
  );

  assert.deepEqual(nextState, {
    currentMode: "result",
    popupOpen: true,
    modeLocked: true
  });
});
