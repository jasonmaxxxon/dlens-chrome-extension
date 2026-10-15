import assert from "node:assert/strict";
import test from "node:test";

import { buildPrEvidenceViewModel, type PrEvidenceUiState } from "../src/viewmodel/pr-evidence.ts";
import type { PrNarrativeRead } from "../src/compare/pr-narrative.ts";
import { prCampaignToDraft, type PrCampaign, type PrEvidenceRow } from "../src/state/pr-evidence-storage.ts";
import { createPrEvidenceResource } from "../src/ui/pr-evidence-resource.ts";

const idleUiState: PrEvidenceUiState = {
  activeLens: "evidence",
  selectedNarrativeClaimId: null,
  isGeneratingNarrative: false,
  activePane: "ledger",
  isSaving: false,
  isReadingBrief: false,
  isGeneratingCriteria: false,
  criteriaReview: {},
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
    { id: "c4", label: "" },
    { id: "c5", label: "" },
    { id: "c6", label: "" }
  ],
  narrativeSettings: {
    narrativeAnchor: "Wellness belongs in daily life",
    targetAudience: "Young working adults",
    desiredAction: "Register for the event"
  },
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

const narrativeRows: PrEvidenceRow[] = [
  row,
  {
    ...row,
    id: "row-support",
    itemId: "item-support",
    postUrl: "https://www.threads.net/@support/post/2",
    authorHandle: "support_author",
    caption: "A second supporting post"
  },
  {
    ...row,
    id: "row-counter",
    itemId: "item-counter",
    postUrl: "https://www.threads.net/@counter/post/3",
    authorHandle: "counter_author",
    caption: "A counterexample post"
  }
];

const narrativeRead: PrNarrativeRead = {
  schemaVersion: 1,
  campaignId: campaign.id,
  sourceRowIds: ["row-shared", "row-support", "row-counter"],
  collectedRowCount: 3,
  snippetFallbackCount: 1,
  sourceHash: "sha256:current",
  promptVersion: "pr-narrative.v1",
  provider: "openai",
  model: "gpt-4.1-mini",
  generatedAt: "2026-07-14T03:00:00.000Z",
  status: "complete",
  priorityClaimId: "claim-1",
  claims: [
    {
      id: "claim-1",
      title: "Practical proof",
      statement: "Collected posts frame wellness as practical.",
      implication: "Lead with practical proof.",
      mode: "actionable",
      alignment: "mixed",
      supportRefs: [
        { rowId: "row-shared", summary: "The event fits daily life." },
        { rowId: "row-support", summary: "The experience feels accessible." }
      ],
      counterRefs: [{ rowId: "row-counter", summary: "One post sees setup friction." }]
    },
    {
      id: "claim-2",
      title: "Social relevance",
      statement: "Collected posts connect wellness with shared activity.",
      implication: "Show the social experience.",
      mode: "experience",
      alignment: "echoes",
      supportRefs: [{ rowId: "row-support", summary: "The post highlights shared activity." }],
      counterRefs: []
    }
  ]
};

test("PrEvidence resource initializes narrative read state without starting generation", () => {
  const resource = createPrEvidenceResource("session-pr");

  assert.equal(resource.narrativeRead, null);
  assert.equal(resource.narrativeCurrentSourceHash, "");
  assert.equal(resource.narrativeError, "");
});

test("ViewModel derives narrative counts and joins refs to current rows", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      ...createPrEvidenceResource("session-pr"),
      campaign: prCampaignToDraft(campaign),
      rows: narrativeRows,
      narrativeRead,
      narrativeCurrentSourceHash: narrativeRead.sourceHash
    },
    uiState: {
      ...idleUiState,
      activeLens: "narrative",
      selectedNarrativeClaimId: "claim-1"
    }
  });

  assert.equal(vm.activeLens, "narrative");
  assert.equal(vm.narrative?.status, "ready");
  assert.equal(vm.narrative?.priorityClaim?.supportCount, 2);
  assert.equal(vm.narrative?.priorityClaim?.denominator, narrativeRead.sourceRowIds.length);
  assert.equal(vm.narrative?.priorityClaim?.counterCount, 1);
  assert.deepEqual(vm.narrative?.priorityClaim?.support.map((entry) => entry.row.id), ["row-shared", "row-support"]);
  assert.equal(vm.narrative?.detail?.counterexamples[0]?.row.sourceUrl, "https://www.threads.net/@counter/post/3");
  assert.deepEqual(vm.lensCommands.narrative, {
    kind: "setLens",
    target: { sessionId: "session-pr" },
    lens: "narrative"
  });
  assert.deepEqual(vm.narrative?.generateCommand, {
    kind: "generateNarrative",
    target: { sessionId: "session-pr", campaignId: "campaign-shared" }
  });
  assert.deepEqual(vm.narrative?.priorityClaim?.selectCommand, {
    kind: "selectNarrativeClaim",
    target: { sessionId: "session-pr", campaignId: "campaign-shared" },
    claimId: "claim-1"
  });
});

test("ViewModel marks a hash-mismatched narrative read stale", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      ...createPrEvidenceResource("session-pr"),
      campaign: prCampaignToDraft(campaign),
      rows: narrativeRows,
      narrativeRead,
      narrativeCurrentSourceHash: "sha256:new"
    },
    uiState: idleUiState
  });

  assert.equal(vm.narrative?.status, "stale");
});

test("ViewModel treats a stored read with an unknown current hash as stale", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      ...createPrEvidenceResource("session-pr"),
      campaign: prCampaignToDraft(campaign),
      rows: narrativeRows,
      narrativeRead,
      narrativeCurrentSourceHash: ""
    },
    uiState: idleUiState
  });

  assert.equal(vm.narrative?.status, "stale");
});

test("ViewModel exposes insufficient evidence without fabricated claims", () => {
  const insufficientRead: PrNarrativeRead = {
    ...narrativeRead,
    sourceRowIds: [],
    collectedRowCount: 3,
    snippetFallbackCount: 0,
    status: "insufficient_evidence",
    priorityClaimId: null,
    claims: []
  };
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      ...createPrEvidenceResource("session-pr"),
      campaign: prCampaignToDraft(campaign),
      rows: narrativeRows,
      narrativeRead: insufficientRead,
      narrativeCurrentSourceHash: insufficientRead.sourceHash
    },
    uiState: idleUiState
  });

  assert.equal(vm.narrative?.status, "insufficient_evidence");
  assert.equal(vm.narrative?.priorityClaim, null);
  assert.deepEqual(vm.narrative?.claims, []);
});

test("ViewModel keeps optional counterexamples empty", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      ...createPrEvidenceResource("session-pr"),
      campaign: prCampaignToDraft(campaign),
      rows: narrativeRows,
      narrativeRead,
      narrativeCurrentSourceHash: narrativeRead.sourceHash
    },
    uiState: { ...idleUiState, selectedNarrativeClaimId: "claim-2" }
  });
  const claim = vm.narrative?.claims.find((entry) => entry.id === "claim-2");

  assert.equal(claim?.counterCount, 0);
  assert.deepEqual(claim?.counterexamples, []);
  assert.deepEqual(vm.narrative?.detail?.counterexamples, []);
});

test("ViewModel surfaces narrative errors only when no stored read exists", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      ...createPrEvidenceResource("session-pr"),
      campaign: prCampaignToDraft(campaign),
      rows: narrativeRows,
      narrativeError: "Provider key required"
    },
    uiState: idleUiState
  });

  assert.equal(vm.narrative?.status, "error");
  assert.equal(vm.narrative?.error, "Provider key required");
});

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
  assert.equal(vm.workingArea.match.caption, "約 1 次 AI call · 3 格");
  assert.equal(vm.workingArea.match.totalCells, 3);
  assert.equal(vm.ledger.rows[0]?.matchCountLabel, "2 / 3");
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
      criteria: campaign.criteria,
      narrativeSettings: campaign.narrativeSettings
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
  /* Strong is 2 of the 3 criteria: index 0-4 match c1+c2+c3, index 5 matches c1+c2. */
  assert.equal(vm.criteriaHealth.strongRows, 6);
  assert.equal(vm.criteriaHealth.criteria.length, 3);

  // First criterion matched by every row -> strong; carries the real label, not "C1".
  assert.equal(vm.criteriaHealth.criteria[0]?.matchedRows, 10);
  assert.equal(vm.criteriaHealth.criteria[0]?.totalRows, 10);
  assert.equal(vm.criteriaHealth.criteria[0]?.label, "Campaign");
  assert.equal(vm.criteriaHealth.criteria[0]?.strength, "strong");

  // Half coverage -> partial.
  assert.equal(vm.criteriaHealth.criteria[2]?.matchedRows, 5);
  assert.equal(vm.criteriaHealth.criteria[2]?.strength, "partial");

  /* Every counted criterion has coverage here, so there is no systemic gap. */
  assert.equal(vm.criteriaHealth.systemicGap, null);
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

test("PrEvidence VM offers three criterion rows, not six", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      campaign: prCampaignToDraft({
        ...campaign,
        criteria: [
          { id: "c1", label: "Campaign" },
          { id: "c2", label: "Hashtag" },
          { id: "c3", label: "Message" },
          /* Stale labels from the six-criterion era stay in storage. */
          { id: "c4", label: "Venue" },
          { id: "c5", label: "Experience" },
          { id: "c6", label: "CTA" }
        ]
      }),
      rows: [row],
      summary: "",
      notice: "",
      uploadError: "",
      setupCollapsed: false
    },
    uiState: idleUiState
  });

  assert.deepEqual(vm.campaign.criteriaSetup.map((entry) => entry.id), ["c1", "c2", "c3"]);
  assert.equal(vm.campaign.countedCriteriaCount, 3);
  assert.deepEqual(vm.campaign.criteria.map((entry) => entry.id), ["c1", "c2", "c3"]);
  /* The stale c4..c6 labels are saved as-is but never counted or rendered. */
  assert.deepEqual(vm.campaign.saveDraft.criteria.map((entry) => entry.label), [
    "Campaign",
    "Hashtag",
    "Message",
    "Venue",
    "Experience",
    "CTA"
  ]);
  assert.equal(vm.ledger.rows[0]?.matchCountLabel, "2 / 3");
  assert.equal(vm.criteriaHealth.criteria.length, 3);
});

test("PrEvidence VM marks AI candidates for review and gates confirm on brief support", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      campaign: prCampaignToDraft({
        ...campaign,
        briefText: "Shared Launch Campaign opens in March. Register at the venue desk.",
        criteria: [
          { id: "c1", label: "Shared Launch Campaign" },
          { id: "c2", label: "Unrelated invented angle" },
          { id: "c3", label: "Message" },
          { id: "c4", label: "" },
          { id: "c5", label: "" },
          { id: "c6", label: "" }
        ]
      }),
      rows: [],
      summary: "",
      notice: "",
      uploadError: "",
      setupCollapsed: false
    },
    uiState: {
      ...idleUiState,
      criteriaReview: { c1: "candidate", c2: "candidate", c3: "confirmed" }
    }
  });
  const [first, second, third] = vm.campaign.criteriaSetup;

  assert.equal(first?.status, "candidate");
  assert.equal(first?.supported, true);
  assert.ok(first?.supportExcerpt.includes("Shared Launch Campaign"));
  assert.equal(first?.confirmEmphasis, true);

  /* An unsupported candidate still gets a confirm, just never the emphasised one. */
  assert.equal(second?.status, "candidate");
  assert.equal(second?.supported, false);
  assert.equal(second?.confirmEmphasis, false);
  assert.equal(second?.confirmCommand?.kind, "confirmCriterion");

  assert.equal(third?.status, "confirmed");
  assert.equal(third?.statusLabel, "已確認");
  assert.match(vm.campaign.criteriaCaption, /2 條候選/);
});

test("PrEvidence VM keeps not-mentioned separate from confirmed and out of the denominator", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      campaign: prCampaignToDraft({
        ...campaign,
        criteria: [
          { id: "c1", label: "Campaign" },
          { id: "c2", label: "Hashtag" },
          /* markCriterionNotMentioned clears the label so it stops counting. */
          { id: "c3", label: "" },
          { id: "c4", label: "" },
          { id: "c5", label: "" },
          { id: "c6", label: "" }
        ]
      }),
      rows: [row],
      summary: "",
      notice: "",
      uploadError: "",
      setupCollapsed: false
    },
    uiState: { ...idleUiState, criteriaReview: { c3: "not_mentioned" } }
  });
  const notMentioned = vm.campaign.criteriaSetup[2];

  assert.equal(notMentioned?.status, "not_mentioned");
  assert.equal(notMentioned?.statusLabel, "未提及 · 不計分");
  assert.equal(notMentioned?.counted, false);
  /* Marking is its own act: it is never offered as a confirmation. */
  assert.equal(notMentioned?.confirmCommand, null);
  assert.equal(notMentioned?.notMentionedCommand, null);
  assert.equal(notMentioned?.correctCommand?.kind, "correctCriterion");

  assert.equal(vm.campaign.countedCriteriaCount, 2);
  assert.match(vm.campaign.criteriaCaption, /1 條標記為未提及/);
  /* row matches c1 and c3; c3 no longer counts, so the honest read is 1 of 2. */
  assert.equal(vm.ledger.rows[0]?.matchCountLabel, "1 / 2");
  assert.equal(vm.workingArea.match.totalCells, 2);
});

test("PrEvidence VM reports a reloaded label as saved rather than confirmed", () => {
  const vm = buildPrEvidenceViewModel({
    sessionId: "session-pr",
    resource: {
      campaign: prCampaignToDraft(campaign),
      rows: [],
      summary: "",
      notice: "",
      uploadError: "",
      setupCollapsed: false
    },
    uiState: idleUiState
  });

  assert.deepEqual(vm.campaign.criteriaSetup.map((entry) => entry.status), ["saved", "saved", "saved"]);
  assert.equal(vm.campaign.criteriaSetup[0]?.confirmCommand, null);
  assert.equal(vm.campaign.criteriaSetup[0]?.correctCommand?.kind, "correctCriterion");
  assert.equal(vm.campaign.criteriaCaption, "3 條條件計分");
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
      criteria: vm.campaign.saveDraft.criteria,
      narrativeSettings: {
        narrativeAnchor: "",
        targetAudience: "",
        desiredAction: ""
      }
    }
  });
  assert.equal("createdAt" in (saveCommand as any).draft, false);
  assert.equal("updatedAt" in (saveCommand as any).draft, false);
});
