import { useEffect, useState } from "react";

import { buildDeterministicCompareBrief, type CompareBrief } from "../compare/brief";
import { buildCompareBriefRequest } from "../compare/brief-request.ts";
import type { ExtensionResponse } from "../state/messages";
import type { ActiveCompareDraft, CompareTeaserState, ExtensionSettings, SessionItem } from "../state/types";
import type { CompareSetupTeaser } from "./CompareSetupView";
import { sendExtensionMessage } from "./controller";
import { buildCompareSetupTeaser, buildDateRangeLabel, comparePairKey } from "./inpage-helpers";

export function resolveCompareSelection(
  readyCompareItems: SessionItem[],
  draft: ActiveCompareDraft | null | undefined
): {
  selectedCompareA: string;
  selectedCompareB: string;
} {
  const hasValidDraft =
    Boolean(draft?.itemAId) &&
    Boolean(draft?.itemBId) &&
    draft?.itemAId !== draft?.itemBId &&
    readyCompareItems.some((item) => item.id === draft?.itemAId) &&
    readyCompareItems.some((item) => item.id === draft?.itemBId);

  if (hasValidDraft) {
    return {
      selectedCompareA: draft!.itemAId,
      selectedCompareB: draft!.itemBId
    };
  }

  const first = readyCompareItems[0]?.id || "";
  const second = readyCompareItems.find((item) => item.id !== first)?.id || "";
  return {
    selectedCompareA: first,
    selectedCompareB: second
  };
}

export function useCompareDraftState({
  page,
  draft,
  readyCompareItems,
  settings
}: {
  page: string;
  draft: ActiveCompareDraft | null | undefined;
  readyCompareItems: SessionItem[];
  settings: ExtensionSettings | null | undefined;
}) {
  const [selectedCompareA, setSelectedCompareA] = useState("");
  const [selectedCompareB, setSelectedCompareB] = useState("");
  const [compareTeaserState, setCompareTeaserState] = useState<CompareTeaserState>("idle");
  const [compareTeaser, setCompareTeaser] = useState<CompareSetupTeaser | null>(null);

  useEffect(() => {
    const selection = resolveCompareSelection(readyCompareItems, draft);
    setSelectedCompareA(selection.selectedCompareA);
    setSelectedCompareB(selection.selectedCompareB);
  }, [draft?.itemAId, draft?.itemBId, readyCompareItems]);

  const compareItemA = readyCompareItems.find((item) => item.id === selectedCompareA) || null;
  const compareItemB = readyCompareItems.find((item) => item.id === selectedCompareB && item.id !== selectedCompareA) || null;

  useEffect(() => {
    if (page !== "compare") {
      return;
    }
    if (!compareItemA || !compareItemB) {
      setCompareTeaser(null);
      setCompareTeaserState("idle");
      void sendExtensionMessage<ExtensionResponse>({
        type: "compare/set-active-draft",
        draft: null
      }).catch(() => undefined);
      return;
    }

    const request = buildCompareBriefRequest(compareItemA, compareItemB);
    if (!request) {
      setCompareTeaser(null);
      setCompareTeaserState("idle");
      return;
    }

    const teaserId = comparePairKey(compareItemA.id, compareItemB.id);
    const totalComments = request.left.sourceCommentCount + request.right.sourceCommentCount;
    const groupCount = request.left.clusters.length + request.right.clusters.length;
    const dateRangeLabel = buildDateRangeLabel(compareItemA.descriptor.time_token_hint, compareItemB.descriptor.time_token_hint);

    setCompareTeaserState("loading");
    void sendExtensionMessage<ExtensionResponse>({
      type: "compare/set-active-draft",
      draft: {
        itemAId: compareItemA.id,
        itemBId: compareItemB.id,
        teaserState: "loading",
        teaserId
      }
    }).catch(() => undefined);

    let cancelled = false;
    void sendExtensionMessage<{ ok: true; compareBrief?: CompareBrief | null } | { ok: false; error: string }>({
      type: "compare/get-brief",
      request
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const fallbackBrief = buildDeterministicCompareBrief(request);
        const brief = response.ok && response.compareBrief ? response.compareBrief : fallbackBrief;
        setCompareTeaser(buildCompareSetupTeaser(brief, totalComments, groupCount, dateRangeLabel));
        setCompareTeaserState("ready");
        void sendExtensionMessage<ExtensionResponse>({
          type: "compare/set-active-draft",
          draft: {
            itemAId: compareItemA.id,
            itemBId: compareItemB.id,
            teaserState: "ready",
            teaserId
          }
        }).catch(() => undefined);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        const fallbackBrief = buildDeterministicCompareBrief(request);
        setCompareTeaser(buildCompareSetupTeaser(fallbackBrief, totalComments, groupCount, dateRangeLabel));
        setCompareTeaserState("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [
    page,
    compareItemA?.id,
    compareItemB?.id,
    settings?.oneLinerProvider,
    settings?.openaiApiKey,
    settings?.claudeApiKey,
    settings?.googleApiKey
  ]);

  function onResetCompareSelection() {
    const selection = resolveCompareSelection(readyCompareItems, null);
    setSelectedCompareA(selection.selectedCompareA);
    setSelectedCompareB(selection.selectedCompareB);
  }

  return {
    selectedCompareA,
    setSelectedCompareA,
    selectedCompareB,
    setSelectedCompareB,
    compareItemA,
    compareItemB,
    compareTeaserState,
    compareTeaser,
    onResetCompareSelection
  };
}
