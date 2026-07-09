import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { EvidencePacket, TopicAuditReport } from "../src/compare/topic-audit.ts";
import type { TopicAuditValidationFlag } from "../src/compare/topic-audit-validator.ts";
import type { TopicAuditMemoBundle } from "../src/state/topic-audit-storage.ts";
import { AuditReportView, auditReportViewTestables } from "../src/ui/AuditReportView.tsx";

const report: TopicAuditReport = {
  auditRunId: "audit-1",
  inputHash: "hash-1",
  topicId: "topic-1",
  topicName: "航班爭議",
  generatedFrom: ["S1:p1"],
  coveragePerSection: { overall: "4/6", narratives: "4/6" },
  sections: {
    overall: "整體讀法 [S1.OP]",
    lexicon: "詞群讀法 [S1.OP]",
    scaleOrTime: "時間尺度 [S1.OP]",
    narratives: "敘事線 [S1.R1]",
    audience: "受眾反應 [S1.R1]",
    absence: "缺席訊號 [S1.OP]",
    editorial: "編輯判斷 [S1.OP]"
  },
  limitations: ["樣本仍少"],
  promptVersion: "v1",
  model: "mock",
  generatedAt: "2026-05-23T00:00:00.000Z"
};

const packet: EvidencePacket = {
  auditRunId: "audit-1",
  inputHash: "hash-1",
  topicId: "topic-1",
  signalId: "signal-1",
  itemId: "item-1",
  shortCode: "S1",
  sourceUrl: "https://www.threads.net/@alpha/post/1",
  capturedAt: "2026-05-23T00:00:00.000Z",
  status: "succeeded",
  opAuthor: "alpha",
  opText: "OP 原文",
  opLikes: 12,
  commentCount: 3,
  replyFragments: [{ ref: "S1.R1", author: "reader", text: "讀者回覆", likes: 2, role: "audience" }],
  gaps: [],
  notes: []
};

const flags: TopicAuditValidationFlag[] = [
  { severity: "SCOPE", kind: "ungrounded-generalization", section: "§5", claim: "scope", reason: "scope reason", evidenceRefs: [] },
  { severity: "FAIL", kind: "unknown-ref", section: "§4", claim: "fail", reason: "fail reason", evidenceRefs: ["S9.OP"] },
  { severity: "WEAK", kind: "thin-evidence", section: "§2", claim: "weak", reason: "weak reason", evidenceRefs: ["S1.OP"] }
];

const auditMemos: TopicAuditMemoBundle = {
  auditRunId: "audit-1",
  inputHash: "hash-1",
  signalReadings: [],
  lensMemos: [
    {
      auditRunId: "audit-1",
      inputHash: "hash-1",
      topicId: "topic-1",
      stageName: "narrative",
      prose: "敘事線 [S1.R1]",
      evidenceRefs: ["S1.R1"],
      caveats: [],
      coverage: "4/6",
      displayHints: {
        themeChips: ["航班補救", "客服落差"],
        narrativeLanes: [
          { id: "lane-service", label: "客服補救失速", signalRefs: ["S1.OP", "S2.OP"], consensus: 0.87 },
          { id: "lane-delay", label: "延誤說明不足", signalRefs: ["S1.R1"], consensus: 0.62 }
        ]
      },
      promptVersion: "v3",
      model: "mock",
      generatedAt: "2026-05-23T00:00:00.000Z"
    }
  ]
};

test("AuditReportView renders seven report sections plus validator quality section", () => {
  const html = renderToStaticMarkup(
    React.createElement(AuditReportView, {
      topicId: "topic-1",
      report,
      packets: [packet],
      auditMemos,
      flags,
      onCopyMarkdown: () => undefined
    })
  );

  assert.match(html, /data-audit-report-view="topic-audit"/);
  assert.match(html, /§1 整體/);
  assert.match(html, /§2 詞群/);
  assert.match(html, /§3 時間/);
  assert.match(html, /§4 敘事/);
  assert.match(html, /§5 受眾/);
  assert.match(html, /§6 缺席/);
  assert.match(html, /§7 編輯/);
  assert.match(html, /§8 資料品質/);
  assert.equal((html.match(/data-audit-report-section=/g) ?? []).length, 8);
  assert.match(html, /data-ref="S1.OP"/);
  assert.match(html, /href="#source-S1.OP"/);
  assert.match(html, /data-audit-report-coverage="4\/6"/);
  assert.match(html, /覆蓋 4\/6/);
  assert.match(html, /data-audit-report-theme-strip="true"/);
  assert.match(html, /data-theme-chip="航班補救"/);
  assert.match(html, /data-audit-report-narrative-lane="lane-service"/);
  assert.match(html, /data-audit-report-lane-strength="lane-service"/);
  assert.match(html, /跨 2\/2 篇/);
  assert.doesNotMatch(html, /共識\s*\d+%/);
});

test("AuditReportView sorts validator flags by severity", () => {
  assert.deepEqual(auditReportViewTestables.sortFlagsBySeverity(flags).map((flag) => flag.severity), [
    "FAIL",
    "WEAK",
    "SCOPE"
  ]);

  const markdown = auditReportViewTestables.serializeReportMarkdown(report, flags);
  assert.match(markdown, /# 航班爭議/);
  assert.match(markdown, /S1\.OP/);
  assert.match(markdown, /FAIL/);
});
