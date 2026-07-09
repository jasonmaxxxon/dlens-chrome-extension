import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TopicAuditReport } from "../src/compare/topic-audit.ts";
import type { TopicAuditMemoBundle } from "../src/state/topic-audit-storage.ts";
import { AuditReportView } from "../src/ui/AuditReportView.tsx";

function buildReport(sections: Partial<TopicAuditReport["sections"]>): TopicAuditReport {
  return {
    auditRunId: "audit-p0",
    inputHash: "hash-p0",
    topicId: "topic-p0",
    topicName: "Topic P0",
    generatedFrom: ["S1:p1"],
    coveragePerSection: { overall: "2/3", narratives: "2/3" },
    sections: {
      overall: "整體預設內容 [S1.OP]",
      lexicon: "詞群預設內容 [S1.OP]",
      scaleOrTime: "時間預設內容 [S1.OP]",
      narratives: "敘事預設內容 [S1.OP]",
      audience: "受眾預設內容 [S1.OP]",
      absence: "缺席預設內容 [S1.OP]",
      editorial: "編輯預設內容 [S1.OP]",
      ...sections
    },
    limitations: [],
    promptVersion: "v1",
    model: "mock",
    generatedAt: "2026-06-22T00:00:00.000Z"
  };
}

function renderReport(report: TopicAuditReport): Document {
  const html = renderToStaticMarkup(
    React.createElement(AuditReportView, {
      topicId: report.topicId,
      report,
      packets: [],
      flags: []
    })
  );
  return new JSDOM(html).window.document;
}

const auditMemos: TopicAuditMemoBundle = {
  auditRunId: "audit-p0",
  inputHash: "hash-p0",
  signalReadings: [],
  lensMemos: [
    {
      auditRunId: "audit-p0",
      inputHash: "hash-p0",
      topicId: "topic-p0",
      stageName: "narrative",
      prose: "敘事預設內容 [S1.OP]",
      evidenceRefs: ["S1.OP"],
      caveats: [],
      coverage: "2/3",
      displayHints: {
        themeChips: ["可靠性"],
        narrativeLanes: [{ id: "lane-p0", label: "可靠性是主要讀法", signalRefs: ["S1.OP"], consensus: 0.7 }]
      },
      promptVersion: "v3",
      model: "mock",
      generatedAt: "2026-06-22T00:00:00.000Z"
    }
  ]
};

const reactionAuditMemos: TopicAuditMemoBundle = {
  ...auditMemos,
  lensMemos: [
    ...auditMemos.lensMemos,
    {
      auditRunId: "audit-p0",
      inputHash: "hash-p0",
      topicId: "topic-p0",
      stageName: "audience",
      prose: "legacy audience prose should be replaced when structured reaction patterns exist.",
      evidenceRefs: ["S1.R1", "S1.R3"],
      caveats: [],
      coverage: "342/342",
      displayHints: {
        reactionCoverage: {
          postCount: 1,
          capturedCommentCount: 342,
          readCommentCount: 342,
          usableAudienceCommentCount: 318
        },
        reactionPatterns: [{
          id: "reaction-local-labor-defense",
          label: "本地勞工身份防守",
          dynamicImplication: "留言把政策爭議推向身份與分配正義，而不是單純效率討論。",
          nComments: 118,
          nAuthors: 72,
          coverageDenominator: 342,
          supportRefs: ["S1.R1", "S1.R2"],
          counterRefs: ["S1.R3"],
          representativeRefs: ["S1.R1"],
          counterRepresentativeRefs: ["S1.R3"],
          icon: "users"
        }]
      } as never,
      promptVersion: "v3",
      model: "mock",
      generatedAt: "2026-06-22T00:00:00.000Z"
    }
  ]
};

test("AuditReportView maps §1 and §7 to distinct section fields", () => {
  const doc = renderReport(buildReport({
    overall: "§1 只應顯示整體判讀",
    editorial: "§7 只應顯示編輯判讀"
  }));

  const overall = doc.querySelector('[data-audit-report-section="overall"]');
  const editorial = doc.querySelector('[data-audit-report-section="editorial"]');
  assert.match(overall?.textContent ?? "", /§1 只應顯示整體判讀/);
  assert.doesNotMatch(overall?.textContent ?? "", /§7 只應顯示編輯判讀/);
  assert.match(editorial?.textContent ?? "", /§7 只應顯示編輯判讀/);
  assert.doesNotMatch(editorial?.textContent ?? "", /§1 只應顯示整體判讀/);
});

test("AuditReportView does not render verbatim duplicate editorial content", () => {
  const duplicateList = "1. 整體判讀 2. 共同用字 3. 風向/時間 4. Narrative Clusters 5. Audience Reaction 6. 缺席聲音/Outliers 7. Editorial Reading";
  const doc = renderReport(buildReport({
    overall: duplicateList,
    editorial: duplicateList
  }));

  const overall = doc.querySelector('[data-audit-report-section="overall"]');
  const editorial = doc.querySelector('[data-audit-report-section="editorial"]');
  assert.match(overall?.textContent ?? "", /整體判讀/);
  assert.doesNotMatch(editorial?.textContent ?? "", /整體判讀/);
  assert.match(editorial?.textContent ?? "", /等待訊號累積後生成/);
});

test("AuditReportView renders §3 raw placeholder as empty state and dims the TOC item", () => {
  const doc = renderReport(buildReport({ scaleOrTime: "尚未生成" }));

  const section = doc.querySelector('[data-audit-report-section="scaleOrTime"]');
  assert.match(section?.textContent ?? "", /等待訊號累積後生成/);
  assert.doesNotMatch(doc.body.textContent ?? "", /尚未生成/);

  const tocItem = doc.querySelector('a[href="#scaleOrTime"]');
  assert.equal(tocItem?.getAttribute("data-audit-report-toc-empty"), "true");
  assert.match(tocItem?.getAttribute("style") ?? "", /opacity:/);
});

test("AuditReportView renders numbered body prefixes as a semantic ordered list", () => {
  const doc = renderReport(buildReport({
    overall: "1. 第一點是總結 [S1.OP] 2. 第二點是補充 3. 第三點收束"
  }));

  const items = [...doc.querySelectorAll('[data-audit-report-section="overall"] ol li')];
  assert.equal(items.length, 3);
  assert.match(items[0]?.textContent ?? "", /第一點是總結/);
  assert.match(items[1]?.textContent ?? "", /第二點是補充/);
  assert.match(items[2]?.textContent ?? "", /第三點收束/);
});

test("AuditReportView density grammar keeps honest empty-section guards", () => {
  const duplicateList = "1. 整體判讀 2. 共同用字 3. 風向/時間 4. Narrative Clusters 5. Audience Reaction 6. 缺席聲音/Outliers 7. Editorial Reading";
  const html = renderToStaticMarkup(
    React.createElement(AuditReportView, {
      topicId: "topic-p0",
      report: buildReport({
        overall: duplicateList,
        scaleOrTime: "尚未生成",
        editorial: duplicateList
      }),
      auditMemos,
      packets: [],
      flags: []
    })
  );
  const doc = new JSDOM(html).window.document;

  assert.equal(doc.querySelector("[data-audit-report-coverage]")?.textContent, "覆蓋 2/3");
  assert.match(doc.body.textContent ?? "", /可靠性是主要讀法/);
  assert.match(doc.querySelector('[data-audit-report-section="scaleOrTime"]')?.textContent ?? "", /等待訊號累積後生成/);
  assert.match(doc.querySelector('[data-audit-report-section="editorial"]')?.textContent ?? "", /等待訊號累積後生成/);
  assert.equal(doc.querySelector('[data-audit-report-lane-signal-row]'), null);
});

test("AuditReportView replaces §5 audience prose when structured reaction patterns exist", () => {
  const html = renderToStaticMarkup(
    React.createElement(AuditReportView, {
      topicId: "topic-p0",
      report: buildReport({
        audience: "legacy audience prose should not render beside the structured panel [S1.R1]"
      }),
      auditMemos: reactionAuditMemos,
      packets: [],
      flags: []
    })
  );
  const doc = new JSDOM(html).window.document;
  const audience = doc.querySelector('[data-audit-report-section="audience"]');

  assert.ok(audience);
  assert.match(audience!.textContent ?? "", /本地勞工身份防守/);
  assert.match(audience!.textContent ?? "", /118\/342 留言/);
  assert.match(audience!.textContent ?? "", /72 作者/);
  assert.match(audience!.textContent ?? "", /留言把政策爭議推向身份與分配正義/);
  assert.doesNotMatch(audience!.textContent ?? "", /legacy audience prose should not render/);
  assert.ok(audience!.querySelector("[data-audit-report-reaction-pattern]"));
});
