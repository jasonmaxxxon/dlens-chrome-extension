import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Topic } from "../src/state/types.ts";
import { CasebookView, casebookViewTestables } from "../src/ui/CasebookView.tsx";

function buildTopics(): Topic[] {
  return [
    {
      id: "topic-1",
      sessionId: "session-1",
      name: "航班爭議",
      description: "追蹤客服與航班改動討論",
      status: "watching",
      tags: ["客服", "航班", "延誤"],
      signalIds: ["signal-1", "signal-2"],
      pairIds: ["result-1"],
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-23T10:00:00.000Z"
    },
    {
      id: "topic-2",
      sessionId: "session-1",
      name: "機票促銷",
      description: "",
      status: "pending",
      tags: ["促銷"],
      signalIds: [],
      pairIds: [],
      createdAt: "2026-04-21T10:00:00.000Z",
      updatedAt: "2026-04-22T10:00:00.000Z"
    }
  ];
}

test("CasebookView renders the topic list and signal metadata", () => {
  const html = renderToStaticMarkup(
    React.createElement(CasebookView, {
      sessionId: "session-1",
      initialTopics: buildTopics(),
      pendingSignalCount: 3,
      onNavigateToTopic: () => undefined,
      onCreateTopic: () => undefined
    })
  );

  assert.match(html, /data-mode-header="casebook"/);
  assert.match(html, /航班爭議/);
  assert.match(html, /客服/);
  assert.match(html, /2 則訊號/);
  assert.match(html, /新增線索/);
  assert.match(html, /未分流訊號/);
  assert.doesNotMatch(html, /新建主題/);
  assert.doesNotMatch(html, /AI 建議主題/);
});

test("CasebookView renders a folder-first empty state when there are no signals to organize", () => {
  const html = renderToStaticMarkup(
    React.createElement(CasebookView, {
      sessionId: "session-1",
      initialTopics: [],
      pendingSignalCount: 0,
      onNavigateToTopic: () => undefined,
      onCreateTopic: () => undefined,
      onGoToCollect: () => undefined
    })
  );

  assert.match(html, /整理這個 folder 裡的訊號/);
  assert.match(html, /這個 folder 尚無可整理的訊號。先到採集收進貼文。/);
  assert.match(html, /前往採集/);
  assert.doesNotMatch(html, /尚無主題，新增一個開始追蹤/);
  assert.doesNotMatch(html, /新建主題/);
});

test("CasebookView lets pending signals start a tracking lane without folder wording collision", () => {
  const html = renderToStaticMarkup(
    React.createElement(CasebookView, {
      sessionId: "session-1",
      initialTopics: [],
      pendingSignalCount: 2,
      onNavigateToTopic: () => undefined,
      onCreateTopic: () => undefined
    })
  );

  assert.match(html, /新增線索/);
  assert.match(html, /目前有 2 則未分流訊號。建立追蹤線索後可以開始歸類。/);
  assert.match(html, /未分流訊號等待整理，新增一條線索開始追蹤。/);
  assert.doesNotMatch(html, /新建主題/);
});

test("casebookViewTestables filters topics by status tab", () => {
  const topics = buildTopics();

  assert.equal(casebookViewTestables.filterTopics(topics, "all").length, 2);
  assert.equal(casebookViewTestables.filterTopics(topics, "watching").length, 1);
  assert.equal(casebookViewTestables.filterTopics(topics, "pending").length, 1);
});

test("casebookViewTestables topic row click routes to the topic detail", () => {
  const calls: string[] = [];
  const element = casebookViewTestables.TopicRow({
    topic: buildTopics()[0]!,
    onSelect: (topicId) => calls.push(topicId)
  });

  element.props.onClick();
  assert.deepEqual(calls, ["topic-1"]);
});
