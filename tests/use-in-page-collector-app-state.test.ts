import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import type { ExtensionMessage, ExtensionResponse } from "../src/state/messages.ts";
import type { PrNarrativeRead } from "../src/compare/pr-narrative.ts";
import type { PrCampaign } from "../src/state/pr-evidence-storage.ts";
import { normalizePrCriteria, prCampaignToDraft } from "../src/state/pr-evidence-storage.ts";
import { createRequestReconciler } from "../src/state/request-reconcile.ts";
import { createSessionRecord } from "../src/state/store-helpers.ts";
import { createEmptyGlobalState, createEmptyTabState, type ExtensionSnapshot } from "../src/state/types.ts";
import { createPrEvidenceResource } from "../src/ui/pr-evidence-resource.ts";
import { applyPrGeneratedCriteriaSaveResult, applyPrCampaignSaveResult, applyPrSetupSuggestionToDraft, applyPrGenerateSummaryResult, applyPrNarrativeResult, buildEffectiveSettingsSnapshot, buildInPageHydrateTraceTerminalSequence, buildLocalSettingsOverride, shouldClearPrReconciledLoading, useInPageCollectorAppState } from "../src/ui/useInPageCollectorAppState.ts";

function makePrCampaign(id: string, sessionId = "session-pr", label = id): PrCampaign {
  return {
    id,
    sessionId,
    name: `Campaign ${label}`,
    briefText: `Brief ${label}`,
    criteria: normalizePrCriteria([{ label: `Criterion ${label}` }]),
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z"
  };
}

function makePrNarrativeRead(campaignId = "campaign-new"): PrNarrativeRead {
  return {
    schemaVersion: 1,
    campaignId,
    sourceRowIds: ["row-1", "row-2"],
    collectedRowCount: 2,
    snippetFallbackCount: 0,
    sourceHash: `sha256:${campaignId}`,
    promptVersion: "pr-narrative.v1",
    provider: "openai",
    model: "gpt-4.1-mini",
    generatedAt: "2026-07-14T03:00:00.000Z",
    status: "complete",
    priorityClaimId: "claim-1",
    claims: [
      {
        id: "claim-1",
        title: "Priority",
        statement: "Current evidence supports the claim.",
        implication: "Lead with practical proof.",
        mode: "actionable",
        alignment: "echoes",
        supportRefs: [{ rowId: "row-1", summary: "Evidence one" }],
        counterRefs: []
      },
      {
        id: "claim-2",
        title: "Supporting",
        statement: "Current evidence clarifies the action.",
        implication: "Keep the action explicit.",
        mode: "behavior",
        alignment: "mixed",
        supportRefs: [{ rowId: "row-2", summary: "Evidence two" }],
        counterRefs: []
      }
    ]
  };
}

function stalePrDecision(lane: string) {
  const reconciler = createRequestReconciler();
  const token = reconciler.begin({
    lane,
    requestId: `${lane}-old`,
    target: { sessionId: "session-pr", campaignId: "campaign-old" }
  });
  reconciler.begin({
    lane,
    requestId: `${lane}-new`,
    target: { sessionId: "session-pr", campaignId: "campaign-new" }
  });
  return reconciler.complete(token, {
    currentTarget: { sessionId: "session-pr", campaignId: "campaign-new" }
  });
}

function acceptedPrDecision(lane: string) {
  const reconciler = createRequestReconciler();
  const token = reconciler.begin({
    lane,
    requestId: `${lane}-accepted`,
    target: { sessionId: "session-pr", campaignId: "campaign-new" }
  });
  return reconciler.complete(token, {
    currentTarget: { sessionId: "session-pr", campaignId: "campaign-new" }
  });
}

test("saved settings become the immediate Product snapshot before background state catches up", () => {
  const session = createSessionRecord("Product workspace", "2026-07-07T08:00:00.000Z", "product");
  const snapshot: ExtensionSnapshot = {
    global: {
      version: 1,
      sessions: [session],
      activeSessionId: session.id,
      settings: {
        ingestBaseUrl: "http://127.0.0.1:8000",
        oneLinerProvider: "google",
        openaiApiKey: "",
        claudeApiKey: "",
        googleApiKey: "",
        hasGoogleKey: false,
        productProfile: null,
        layoutPreferences: {
          productSignalCardLayout: "marginalia",
          topicSynthesisLayout: "console",
          compareResultLayout: "parallel"
        }
      },
      updatedAt: "2026-07-07T08:00:00.000Z"
    },
    tab: createEmptyTabState()
  };

  const override = buildLocalSettingsOverride({
    currentSettings: snapshot.global.settings,
    draftBaseUrl: "http://127.0.0.1:8000",
    draftProvider: "google",
    draftOpenAiKey: "",
    draftClaudeKey: "",
    draftGoogleKey: "AIza-live",
    draftLayoutPreferences: snapshot.global.settings.layoutPreferences,
    draftProductProfile: {
      name: "DLens",
      category: "Creator research",
      audience: "Product builders",
      contextText: "README context",
      contextFiles: [
        {
          id: "readme",
          name: "README.md",
          kind: "readme",
          importedAt: "2026-07-07T08:00:00.000Z",
          charCount: 1200
        }
      ]
    }
  });
  const effective = buildEffectiveSettingsSnapshot(snapshot, override);

  assert.equal(effective?.global.settings.oneLinerProvider, "google");
  assert.equal(effective?.global.settings.hasGoogleKey, true);
  assert.equal(effective?.global.settings.productProfile?.name, "DLens");
  assert.equal(effective?.global.settings.productProfile?.contextFiles?.length, 1);
});

test("popup.pr.hydrate.request is always followed by exactly one terminal hydrate event", () => {
  const responseSequence = buildInPageHydrateTraceTerminalSequence({
    surface: "pr",
    sessionId: "pr-session",
    terminal: "response"
  });
  const errorSequence = buildInPageHydrateTraceTerminalSequence({
    surface: "pr",
    sessionId: "pr-session",
    terminal: "error"
  });

  assert.deepEqual(responseSequence.map((event) => event.step), [
    "popup.pr.hydrate.request",
    "popup.pr.hydrate.response"
  ]);
  assert.deepEqual(responseSequence.map((event) => event.result), ["pending", "ok"]);
  assert.equal(responseSequence.filter((event) => event.step.endsWith(".request")).length, 1);
  assert.equal(responseSequence.filter((event) => !event.step.endsWith(".request")).length, 1);

  assert.deepEqual(errorSequence.map((event) => event.step), [
    "popup.pr.hydrate.request",
    "popup.pr.hydrate.error"
  ]);
  assert.deepEqual(errorSequence.map((event) => event.result), ["pending", "error"]);
  assert.equal(errorSequence.filter((event) => event.step.endsWith(".request")).length, 1);
  assert.equal(errorSequence.filter((event) => !event.step.endsWith(".request")).length, 1);
});

test("applyPrGenerateSummaryResult ignores stale summary and leaves newer loading pending", () => {
  const stale = stalePrDecision("pr.generateSummary");
  const current = {
    ...createPrEvidenceResource("session-pr"),
    summary: "new campaign summary",
    notice: ""
  };

  const next = applyPrGenerateSummaryResult(
    current,
    { ok: true, prSummary: "old campaign summary" } as ExtensionResponse,
    stale
  );

  assert.equal(stale.accepted, false);
  assert.deepEqual(next, current);
  assert.equal(shouldClearPrReconciledLoading(stale), false);

  const accepted = acceptedPrDecision("pr.generateSummary");
  const applied = applyPrGenerateSummaryResult(
    current,
    { ok: true, prSummary: "accepted campaign summary" } as ExtensionResponse,
    accepted
  );

  assert.equal(shouldClearPrReconciledLoading(accepted), true);
  assert.equal(applied.summary, "accepted campaign summary");
  assert.equal(applied.notice, "");
});

test("applyPrGeneratedCriteriaSaveResult ignores stale generated criteria save results", () => {
  const stale = stalePrDecision("pr.saveGeneratedCriteria");
  const current = {
    ...createPrEvidenceResource("session-pr"),
    campaign: {
      ...createPrEvidenceResource("session-pr").campaign,
      ...makePrCampaign("campaign-new")
    },
    setupCollapsed: false,
    notice: ""
  };

  const next = applyPrGeneratedCriteriaSaveResult(
    current,
    { ok: true, prCampaigns: [makePrCampaign("campaign-old")] } as ExtensionResponse,
    stale
  );

  assert.equal(stale.accepted, false);
  assert.deepEqual(next, current);
  assert.equal(shouldClearPrReconciledLoading(stale), false);

  const accepted = acceptedPrDecision("pr.saveGeneratedCriteria");
  const applied = applyPrGeneratedCriteriaSaveResult(
    current,
    { ok: true, prCampaigns: [makePrCampaign("campaign-new", "session-pr", "accepted")] } as ExtensionResponse,
    accepted
  );

  assert.equal(shouldClearPrReconciledLoading(accepted), true);
  assert.equal(applied.campaign.id, "campaign-new");
  assert.equal(applied.campaign.name, "Campaign accepted");
  assert.equal(applied.setupCollapsed, true);
  assert.equal(applied.narrativeCurrentSourceHash, "");
  assert.equal(applied.narrativeError, "");
  assert.equal(applied.notice, "條件已生成並儲存；批次判斷會使用這六個標籤。");
});

test("applyPrSetupSuggestionToDraft preserves newer edits and only fills empty narrative settings", () => {
  const current = {
    ...prCampaignToDraft(makePrCampaign("campaign-new")),
    name: "Latest campaign name",
    briefText: "Latest brief typed while generation was running",
    narrativeSettings: {
      narrativeAnchor: "Keep this anchor",
      targetAudience: "",
      desiredAction: "Keep this action"
    }
  };

  const next = applyPrSetupSuggestionToDraft(current, {
    criteria: [{ label: "Generated criterion" }],
    narrativeSettings: {
      narrativeAnchor: "",
      targetAudience: "Suggested audience",
      desiredAction: ""
    }
  });

  assert.equal(next.name, "Latest campaign name");
  assert.equal(next.briefText, "Latest brief typed while generation was running");
  assert.equal(next.criteria[0].label, "Generated criterion");
  assert.deepEqual(next.narrativeSettings, {
    narrativeAnchor: "Keep this anchor",
    targetAudience: "Suggested audience",
    desiredAction: "Keep this action"
  });
});

test("applyPrSetupSuggestionToDraft preserves fields changed after the generation request, including deliberate clears", () => {
  const requested = {
    ...prCampaignToDraft(makePrCampaign("campaign-new")),
    criteria: normalizePrCriteria([{ label: "Criterion at request time" }]),
    narrativeSettings: {
      narrativeAnchor: "Anchor at request time",
      targetAudience: "Audience at request time",
      desiredAction: "Action at request time"
    }
  };
  const current = {
    ...requested,
    criteria: normalizePrCriteria([{ label: "Manually edited criterion" }]),
    narrativeSettings: {
      ...requested.narrativeSettings,
      desiredAction: ""
    }
  };

  const next = applyPrSetupSuggestionToDraft(current, {
    criteria: [{ label: "Generated criterion" }],
    narrativeSettings: {
      narrativeAnchor: "Generated anchor",
      targetAudience: "Generated audience",
      desiredAction: "Generated action"
    }
  }, requested);

  assert.equal(next.criteria[0].label, "Manually edited criterion");
  assert.equal(next.narrativeSettings.narrativeAnchor, "Anchor at request time");
  assert.equal(next.narrativeSettings.targetAudience, "Audience at request time");
  assert.equal(next.narrativeSettings.desiredAction, "");
});

test("generated criteria save preserves edits made after submission and leaves them visibly unsaved", () => {
  const submittedDraft = {
    ...prCampaignToDraft(makePrCampaign("campaign-new")),
    narrativeSettings: {
      narrativeAnchor: "Submitted anchor",
      targetAudience: "Submitted audience",
      desiredAction: "Submitted action"
    }
  };
  const current = {
    ...createPrEvidenceResource("session-pr"),
    campaign: {
      ...submittedDraft,
      narrativeSettings: {
        ...submittedDraft.narrativeSettings,
        desiredAction: "Edited while save was running"
      }
    },
    narrativeRead: makePrNarrativeRead("campaign-new"),
    narrativeCurrentSourceHash: "sha256:current",
    narrativeError: "Previous failure"
  };

  const applied = applyPrGeneratedCriteriaSaveResult(
    current,
    { ok: true, prCampaigns: [makePrCampaign("campaign-new", "session-pr", "saved")] } as ExtensionResponse,
    acceptedPrDecision("pr.saveGeneratedCriteria"),
    submittedDraft
  );

  assert.equal(applied.campaign.id, "campaign-new");
  assert.equal(applied.campaign.narrativeSettings.desiredAction, "Edited while save was running");
  assert.equal(applied.setupCollapsed, false);
  assert.equal(applied.narrativeRead?.campaignId, "campaign-new");
  assert.equal(applied.narrativeCurrentSourceHash, "");
  assert.equal(applied.narrativeError, "");
  assert.match(applied.notice, /尚未儲存/);
});

test("campaign save response preserves edits made while storage was pending", () => {
  const submittedDraft = {
    ...prCampaignToDraft(makePrCampaign("campaign-new")),
    narrativeSettings: {
      narrativeAnchor: "Submitted anchor",
      targetAudience: "Submitted audience",
      desiredAction: "Submitted action"
    }
  };
  const current = {
    ...createPrEvidenceResource("session-pr"),
    campaign: {
      ...submittedDraft,
      briefText: "Edited while save was pending"
    },
    narrativeRead: makePrNarrativeRead("campaign-new"),
    narrativeCurrentSourceHash: "sha256:current",
    narrativeError: "Previous retry failure",
    setupCollapsed: true
  };

  const applied = applyPrCampaignSaveResult(
    current,
    { ok: true, prCampaigns: [makePrCampaign("campaign-new", "session-pr", "saved")] } as ExtensionResponse,
    submittedDraft,
    "活動已儲存。"
  );

  assert.equal(applied.campaign.id, "campaign-new");
  assert.equal(applied.campaign.briefText, "Edited while save was pending");
  assert.equal(applied.setupCollapsed, false);
  assert.equal(applied.narrativeCurrentSourceHash, "");
  assert.equal(applied.narrativeError, "");
  assert.match(applied.notice, /尚未儲存/);
});

test("applyPrNarrativeResult ignores stale campaign responses and applies only accepted reads", () => {
  const current = {
    ...createPrEvidenceResource("session-pr"),
    campaign: {
      ...createPrEvidenceResource("session-pr").campaign,
      ...makePrCampaign("campaign-new")
    },
    narrativeRead: makePrNarrativeRead("campaign-new"),
    narrativeCurrentSourceHash: "sha256:current",
    narrativeError: ""
  };
  const stale = stalePrDecision("pr.generateNarrative");
  const oldResponse = {
    ok: true,
    prNarrativeRead: makePrNarrativeRead("campaign-old"),
    prNarrativeCurrentSourceHash: "sha256:old"
  } as ExtensionResponse;

  assert.deepEqual(applyPrNarrativeResult(current, oldResponse, stale), current);
  assert.equal(shouldClearPrReconciledLoading(stale), false);

  const accepted = acceptedPrDecision("pr.generateNarrative");
  const acceptedRead = makePrNarrativeRead("campaign-new");
  const applied = applyPrNarrativeResult(current, {
    ok: true,
    prNarrativeRead: acceptedRead,
    prNarrativeCurrentSourceHash: acceptedRead.sourceHash
  } as ExtensionResponse, accepted);
  assert.deepEqual(applied.narrativeRead, acceptedRead);
  assert.equal(applied.narrativeCurrentSourceHash, acceptedRead.sourceHash);
  assert.equal(applied.narrativeError, "");
  assert.equal(shouldClearPrReconciledLoading(accepted), true);

  const failed = applyPrNarrativeResult(applied, { ok: false, error: "Provider unavailable" }, accepted);
  assert.deepEqual(failed.narrativeRead, acceptedRead);
  assert.equal(failed.narrativeError, "Provider unavailable");
});

test("PR hydrate loads campaign then rows then the stored narrative without auto-generation", () => {
  const source = readFileSync(new URL("../src/ui/useInPageCollectorAppState.ts", import.meta.url), "utf8");
  const campaignIndex = source.indexOf('type: "pr/list-campaigns"');
  const rowsIndex = source.indexOf('type: "pr/list-evidence-rows"', campaignIndex);
  const narrativeIndex = source.indexOf('type: "pr/get-narrative-read"', rowsIndex);

  assert.ok(campaignIndex >= 0);
  assert.ok(rowsIndex > campaignIndex);
  assert.ok(narrativeIndex > rowsIndex);
  assert.equal(source.includes('type: "pr/generate-narrative-read"'), true);
  assert.doesNotMatch(source.slice(campaignIndex, narrativeIndex), /pr\/generate-narrative-read/);
});

test("workspace management sends explicit inactive session ids and returns persistence failures", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, chrome: globalThis.chrome };
  const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
  const active = createSessionRecord("目前研究", "2026-09-29T00:00:00Z", "topic");
  const archive = createSessionRecord("舊收藏", "2026-09-29T00:00:00Z", "archive");
  const snapshot: ExtensionSnapshot = { global: { ...createEmptyGlobalState(), sessions: [active, archive], activeSessionId: active.id }, tab: createEmptyTabState() };
  const messages: ExtensionMessage[] = [];
  const sendAndSync = async <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage): Promise<T> => {
    messages.push(message);
    return { ok: false, error: "persistence failed" } as T;
  };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    chrome: { runtime: { sendMessage: async () => ({ ok: true }), onMessage: { addListener: () => undefined, removeListener: () => undefined } } } });
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  let app!: ReturnType<typeof useInPageCollectorAppState>;
  function Harness() { app = useInPageCollectorAppState({ snapshot, tabId: 7, sendAndSync }); return null; }
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(React.createElement(Harness)));
    assert.equal(app.popupOpen, true, "the side panel remains open without a persisted popup flag");
    assert.equal(typeof app.onRenameWorkspace, "function");
    assert.equal(typeof app.onDeleteWorkspace, "function");
    await act(async () => {
      assert.equal((await app.onRenameWorkspace(archive.id, "  保留收藏  "))?.ok, false);
      assert.equal((await app.onDeleteWorkspace(archive.id))?.ok, false);
    });
    assert.deepEqual(messages.filter((message) => message.type === "session/rename" || message.type === "session/delete"), [
      { type: "session/rename", sessionId: archive.id, name: "保留收藏" },
      { type: "session/delete", sessionId: archive.id }
    ]);
    assert.equal(snapshot.global.activeSessionId, active.id);
    const count = messages.length;
    await act(async () => {
      await app.onRenameWorkspace("missing", "name");
      await app.onRenameWorkspace(archive.id, "   ");
      await app.onDeleteWorkspace("missing");
    });
    assert.equal(messages.length, count, "unknown session ids and empty names never reach persistence");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousAct === undefined) delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
    else actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct;
    dom.window.close();
  }
});
