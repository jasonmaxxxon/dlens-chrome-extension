import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrEvidenceUiReadyEvent
} from "../src/ui/pipeline-ui-ready.ts";
import type { PrEvidenceViewModel } from "../src/viewmodel/pr-evidence.ts";

test("PR Evidence VM terminal state projects resource readiness without id generation", () => {
  const event = buildPrEvidenceUiReadyEvent({
    sessionId: "session-pr",
    campaign: {
      id: "campaign-1",
      saved: true
    },
    rows: [
      { id: "row-1" },
      { id: "row-2" }
    ],
    workingArea: {
      activePane: "match",
      match: {
        matchedCells: 3,
        totalCells: 12
      }
    },
    uploadError: "",
    notice: "",
    ui: {
      isSaving: false,
      isReadingBrief: false,
      isGeneratingCriteria: false,
      isMatching: false,
      isFetchingAdvancedMetrics: false,
      isGeneratingSummary: false
    }
  } as PrEvidenceViewModel);

  assert.equal(event.phase, "ui.ready");
  assert.equal(event.step, "popup.pr-evidence.vm.ready");
  assert.equal(event.result, "ok");
  assert.deepEqual(event.target, { sessionId: "session-pr" });
  assert.deepEqual(event.detail, {
    surface: "pr-evidence",
    campaignId: "campaign-1",
    campaignSaved: true,
    rowCount: 2,
    activePane: "match",
    matchedCells: 3,
    totalCells: 12,
    busy: false
  });
});

test("PR Evidence busy UI maps ui.ready result to pending", () => {
  const event = buildPrEvidenceUiReadyEvent({
    sessionId: "session-pr",
    campaign: {
      id: null,
      saved: false
    },
    rows: [],
    workingArea: {
      activePane: "ledger",
      match: {
        matchedCells: 0,
        totalCells: 0
      }
    },
    uploadError: "",
    notice: "",
    ui: {
      isSaving: false,
      isReadingBrief: true,
      isGeneratingCriteria: false,
      isMatching: false,
      isFetchingAdvancedMetrics: false,
      isGeneratingSummary: false
    }
  } as PrEvidenceViewModel);

  assert.equal(event.step, "popup.pr-evidence.vm.pending");
  assert.equal(event.result, "pending");
});
