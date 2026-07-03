import assert from "node:assert/strict";
import test from "node:test";

import { buildPrEvidenceViewModel, type PrEvidenceUiState } from "../src/viewmodel/pr-evidence.ts";
import { prCampaignToDraft, type PrCampaign, type PrEvidenceRow } from "../src/state/pr-evidence-storage.ts";
import { createPrEvidenceResource } from "../src/ui/pr-evidence-resource.ts";

const idleUiState: PrEvidenceUiState = {
  activePane: "ledger",
  isSaving: false,
  isReadingBrief: false,
  isGeneratingCriteria: false,
  isMatching: false,
  isFetchingAdvancedMetrics: false,
  isGeneratingSummary: false
};

const campaign: PrCampaign = {
  id: "campaign-shared",
  sessionId: "session-pr",
  name: "Shared campaign",
  briefText: "「Shared Launch Campaign」 #SharedLaunch",
  criteria: [
    { id: "c1", label: "Campaign" },
    { id: "c2", label: "Hashtag" },
    { id: "c3", label: "Message" },
    { id: "c4", label: "Venue" },
    { id: "c5", label: "Experience" },
    { id: "c6", label: "CTA" }
  ],
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z",
  lastMatchedAt: "2026-05-26T02:00:00.000Z"
};

const row: PrEvidenceRow = {
  id: "row-shared",
  campaignId: "campaign-shared",
  itemId: "item-shared",
  postUrl: "https://www.threads.net/@shared/post/1",
  authorHandle: "shared_author",
  caption: "Shared row from app boundary",
  metrics: { likes: 12, comments: 3, reposts: 1 },
  criteriaMatches: { c1: true, c2: false, c3: true, c4: false, c5: false, c6: false },
  collectedAt: "2026-05-26T01:00:00.000Z"
};

test("PrEvidence VM composes rows, counters, actions, and exports from resource plus UI state", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      campaign: prCampaignToDraft(campaign),
      rows: [row],
      summary: "## Summary\nShared evidence.",
      notice: "",
      uploadError: "",
      setupCollapsed: true
    },
    uiState: { ...idleUiState, activePane: "match" }
  });

  assert.equal(vm.sessionId, "session-pr");
  assert.equal(vm.campaign.name, "Shared campaign");
  assert.equal(vm.campaign.saved, true);
  assert.equal(vm.campaign.canSave, true);
  assert.deepEqual(vm.coreMessages, [
    "Campaign identity: Shared Launch Campaign",
    "Social tags / campaign handles: #SharedLaunch"
  ]);
  assert.deepEqual(vm.workingArea.tabs, []);
  assert.equal(vm.workingArea.activePane, "match");
  assert.equal(vm.workingArea.match.caption, "約 1 次 AI call · 6 格");
  assert.equal(vm.ledger.rows[0]?.authorLabel, "shared_author");
  assert.equal(vm.ledger.rows[0]?.captionLabel, "Shared row from app boundary");
  assert.equal(vm.ledger.rows[0]?.metricLine, "12 喜歡 · 3 回覆 · 1 轉發");
  assert.equal(vm.ledger.rows[0]?.matchedCount, 2);
  assert.deepEqual(vm.ledger.rows[0]?.matchedCriterionLabels, ["Campaign", "Message"]);
  assert.equal(vm.csvPreview?.exportableCountLabel, "header + 前 20 列 · 1 列可匯出");
  assert.equal(vm.exports.csv?.filename, "Shared-campaign-evidence.csv");
  assert.equal(vm.exports.csv?.mime, "text/csv;charset=utf-8");
  assert.match(String(vm.exports.csv?.content), /^﻿/);
  assert.equal(vm.exports.summaryMarkdown?.filename, "Shared-campaign-summary.md");
  assert.equal(vm.exports.summaryDocx?.filename, "Shared-campaign-summary.docx");
  assert.deepEqual(vm.actions.map((action) => action.kind), [
    "saveCampaign",
    "generateCriteria",
    "matchCriteria",
    "fetchAdvancedMetrics",
    "generateSummary",
    "exportCsv",
    "exportSummaryMarkdown",
    "exportSummaryDocx"
  ]);
  const saveCommand = vm.actions.find((action) => action.kind === "saveCampaign");
  assert.deepEqual(saveCommand, {
    kind: "saveCampaign",
    target: { sessionId: "session-pr" },
    draft: {
      id: "campaign-shared",
      name: "Shared campaign",
      briefText: "「Shared Launch Campaign」 #SharedLaunch",
      criteria: campaign.criteria
    }
  });
});

test("buildPrEvidenceViewModel derives criteria health from matched rows with real labels", () => {
  const healthRows: PrEvidenceRow[] = Array.from({ length: 10 }, (_, index) => ({
    id: `row-health-${index}`,
    campaignId: "campaign-shared",
    itemId: `item-health-${index}`,
    postUrl: `https://www.threads.net/@health/post/${index}`,
    authorHandle: `health_${index}`,
    caption: `Health row ${index}`,
    metrics: { likes: index, comments: 0, reposts: 0 },
    criteriaMatches: {
      c1: true,
      c2: index < 6,
      c3: index < 5,
      c4: index < 3,
      c5: index < 1,
      c6: false
    },
    collectedAt: "2026-05-26T01:00:00.000Z"
  }));

  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      campaign: prCampaignToDraft(campaign),
      rows: healthRows,
      summary: "",
      notice: "",
      uploadError: "",
      setupCollapsed: true
    },
    uiState: idleUiState
  });

  assert.equal(vm.criteriaHealth.totalRows, 10);
  // Rows matching >= 4 criteria are "strong": index 0 (5), index 1 (4), index 2 (4).
  assert.equal(vm.criteriaHealth.strongRows, 3);
  assert.equal(vm.criteriaHealth.criteria.length, 6);

  // First criterion matched by every row -> strong; carries the real label, not "C1".
  assert.equal(vm.criteriaHealth.criteria[0]?.matchedRows, 10);
  assert.equal(vm.criteriaHealth.criteria[0]?.totalRows, 10);
  assert.equal(vm.criteriaHealth.criteria[0]?.label, "Campaign");
  assert.equal(vm.criteriaHealth.criteria[0]?.strength, "strong");

  // Half coverage -> partial.
  assert.equal(vm.criteriaHealth.criteria[2]?.matchedRows, 5);
  assert.equal(vm.criteriaHealth.criteria[2]?.strength, "partial");

  // Last criterion matched by nobody -> gap, and it is the systemic gap.
  assert.equal(vm.criteriaHealth.criteria[5]?.matchedRows, 0);
  assert.equal(vm.criteriaHealth.criteria[5]?.strength, "gap");
  assert.equal(vm.criteriaHealth.systemicGap?.criterionId, "c6");
  assert.equal(vm.criteriaHealth.systemicGap?.label, "CTA");
  assert.equal(vm.criteriaHealth.systemicGap?.missingRows, 10);
});

test("buildPrEvidenceViewModel reports no systemic gap when every criterion has coverage", () => {
  const row: PrEvidenceRow = {
    id: "row-covered",
    campaignId: "campaign-shared",
    itemId: "item-covered",
    postUrl: "https://www.threads.net/@covered/post/1",
    authorHandle: "covered",
    caption: "Covered row",
    metrics: { likes: 1, comments: 0, reposts: 0 },
    criteriaMatches: { c1: true, c2: true, c3: true, c4: true, c5: true, c6: true },
    collectedAt: "2026-05-26T01:00:00.000Z"
  };

  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      campaign: prCampaignToDraft(campaign),
      rows: [row],
      summary: "",
      notice: "",
      uploadError: "",
      setupCollapsed: true
    },
    uiState: idleUiState
  });

  assert.equal(vm.criteriaHealth.systemicGap, null);
  assert.equal(vm.criteriaHealth.criteria.every((entry) => entry.strength === "strong"), true);
});

test("PrEvidence VM keeps unsaved draft commands free of id and timestamps", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      ...createPrEvidenceResource("session-pr"),
      campaign: {
        ...createPrEvidenceResource("session-pr").campaign,
        name: "Draft campaign",
        briefText: "Draft brief"
      }
    },
    uiState: idleUiState
  });
  const saveCommand = vm.actions.find((action) => action.kind === "saveCampaign");

  assert.equal(vm.campaign.saved, false);
  assert.equal(vm.workingArea.canExportCsv, false);
  assert.equal(vm.actions.some((action) => action.kind === "matchCriteria"), false);
  assert.equal(vm.actions.some((action) => action.kind === "exportCsv"), false);
  assert.deepEqual(saveCommand, {
    kind: "saveCampaign",
    target: { sessionId: "session-pr" },
    draft: {
      name: "Draft campaign",
      briefText: "Draft brief",
      criteria: vm.campaign.criteria
    }
  });
  assert.equal("createdAt" in (saveCommand as any).draft, false);
  assert.equal("updatedAt" in (saveCommand as any).draft, false);
});
