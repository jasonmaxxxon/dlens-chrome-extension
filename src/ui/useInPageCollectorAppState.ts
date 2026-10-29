import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import { IS_PR_ONLY_BUILD } from "../build-variant";
import type { SignalPacketExportFormat,SignalPacketExportResult } from "../compare/signal-packet-export";
import type { ExtensionMessage,ExtensionResponse } from "../state/messages";
import { isKnownPage,shouldBypassModeGuard } from "../state/page-registry";
import { createPipelineRequestId,emitPipelineEvent,type PipelineEventInput } from "../state/pipeline-trace";
import type { PrCampaign,PrCampaignDraft,PrCriterionId,PrEvidenceRow,PrNarrativeSettings } from "../state/pr-evidence-storage";
import { normalizePrCriteria,normalizePrNarrativeSettings,PR_ACTIVE_CRITERION_IDS,prCampaignToDraft } from "../state/pr-evidence-storage";
import { getModeHomePage,guardPage,summarizeSessionProcessing } from "../state/processing-state";
import {
buildReconcileIgnoredEvent,
createRequestReconciler,
type RequestReconcileDecision,
type RequestReconcileTarget,
type RequestReconcileToken
} from "../state/request-reconcile";
import { classifyIngestBaseUrl } from "../ingest/host-permission";
import { mergeIngestApiToken,mergeLayoutPreferences,mergeOneLinerSettings } from "../state/settings-storage";
import { createDefaultLayoutPreferences,createDefaultSettings,type ExtensionSettings,type ExtensionSnapshot,type FolderMode,type LayoutPreferences,type ProductContext,type ProductProfileContextFile } from "../state/types";
import {
buildPrEvidenceViewModel,
summarizeAdvancedMetricsNotice,
type PrCriterionReviewMark,
type PrEvidenceCommand,
type PrEvidenceUiState
} from "../viewmodel/pr-evidence";
import { getActiveSession,sendExtensionMessage } from "./controller";
import { readPrBriefFile } from "./pr-brief-upload";
import { createPrEvidenceResource,type PrEvidenceResourceState } from "./pr-evidence-resource";
import { downloadPrFileExport } from "./pr-summary-export";
import {
buildSettingsSaveMessages,
createEmptyProductProfile,
normalizeProductProfileDraft,
type SettingsDraftValues
} from "./settings-save-messages";
import { requestCollectionSignalPacketExport } from "./useCollectionSignalPacketExport";
import { usePopupWorkspaceState } from "./usePopupWorkspaceState";
import { useProcessingCoordinator } from "./useProcessingCoordinator";
import { useTopicState } from "./useTopicState";

type SendAndSync = <T extends ExtensionResponse = ExtensionResponse>(message: ExtensionMessage) => Promise<T>;

type UseInPageCollectorAppStateArgs = {
  snapshot: ExtensionSnapshot | null;
  tabId: number | null;
  sendAndSync: SendAndSync;
};

const DEFAULT_PR_EVIDENCE_UI_STATE: PrEvidenceUiState = {
  activeLens: "narrative",
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

export function resolveEffectivePopupPage(page: ExtensionSnapshot["tab"]["popupPage"], activeFolderMode: FolderMode) {
  // Storage can hold a route this build no longer has. Send it to the mode home
  // rather than letting the registry lookup throw while the popup renders.
  if (IS_PR_ONLY_BUILD && page !== "settings") return getModeHomePage("pr-evidence");
  if (!isKnownPage(page)) {
    return getModeHomePage(activeFolderMode);
  }
  if (shouldBypassModeGuard(page)) {
    return page;
  }
  return guardPage(page, activeFolderMode);
}

function readInteractionNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function readWallClockNowMs(): number {
  return Date.now();
}

type LocalSettingsOverrideInput = SettingsDraftValues & { currentSettings: ExtensionSettings };

function hasDraftOrStoredKey(draftValue: string, storedPresence: boolean | undefined, storedValue: string): boolean {
  return Boolean(draftValue.trim() || storedPresence || storedValue.trim());
}

export function buildLocalSettingsOverride({
  currentSettings,
  draftBaseUrl,
  draftIngestApiToken = "",
  clearIngestApiToken = false,
  draftProvider,
  draftOpenAiKey,
  draftClaudeKey,
  draftGoogleKey,
  draftDeepReadingModels,
  draftLayoutPreferences,
  draftProductProfile
}: LocalSettingsOverrideInput): ExtensionSettings {
  const withProvider = mergeOneLinerSettings(currentSettings, {
    provider: draftProvider || null,
    openaiApiKey: draftOpenAiKey,
    claudeApiKey: draftClaudeKey,
    googleApiKey: draftGoogleKey,
    deepReadingModels: draftDeepReadingModels
  });
  const withLayout = mergeLayoutPreferences(withProvider, draftLayoutPreferences);
  const ingestApiToken = mergeIngestApiToken(currentSettings.ingestApiToken, draftIngestApiToken, clearIngestApiToken === true);
  return {
    ...withLayout,
    ingestBaseUrl: draftBaseUrl,
    ingestApiToken,
    hasIngestApiToken: clearIngestApiToken === true ? Boolean(ingestApiToken) : Boolean(ingestApiToken || currentSettings.hasIngestApiToken),
    hasOpenAiKey: hasDraftOrStoredKey(draftOpenAiKey, currentSettings.hasOpenAiKey, currentSettings.openaiApiKey),
    hasClaudeKey: hasDraftOrStoredKey(draftClaudeKey, currentSettings.hasClaudeKey, currentSettings.claudeApiKey),
    hasGoogleKey: hasDraftOrStoredKey(draftGoogleKey, currentSettings.hasGoogleKey, currentSettings.googleApiKey),
    productProfile: normalizeProductProfileDraft(draftProductProfile)
  };
}

export function buildEffectiveSettingsSnapshot(
  snapshot: ExtensionSnapshot | null,
  settingsOverride: ExtensionSettings | null
): ExtensionSnapshot | null {
  if (!snapshot || !settingsOverride) {
    return snapshot;
  }
  return {
    ...snapshot,
    global: {
      ...snapshot.global,
      settings: settingsOverride
    }
  };
}

function createContextFileId(kind: ProductProfileContextFile["kind"], name: string): string {
  return `ctx_${kind}_${name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${Date.now().toString(36)}`;
}

export function shouldClearPrReconciledLoading(settled: RequestReconcileDecision | null): boolean {
  return settled === null || settled.accepted || settled.reason === "target-mismatch";
}

export function applyPrGenerateSummaryResult(
  current: PrEvidenceResourceState,
  response: ExtensionResponse,
  settled: RequestReconcileDecision
): PrEvidenceResourceState {
  if (!settled.accepted) {
    return current;
  }
  if (response.ok) {
    return {
      ...current,
      summary: response.prSummary || ""
    };
  }
  return {
    ...current,
    notice: response.error
  };
}

export function applyPrNarrativeResult(
  current: PrEvidenceResourceState,
  response: ExtensionResponse,
  settled: RequestReconcileDecision
): PrEvidenceResourceState {
  if (!settled.accepted) {
    return current;
  }
  if (!response.ok) {
    return {
      ...current,
      narrativeError: response.error
    };
  }
  const hasRead = Object.prototype.hasOwnProperty.call(response, "prNarrativeRead");
  return {
    ...current,
    narrativeRead: hasRead ? response.prNarrativeRead ?? null : current.narrativeRead,
    narrativeCurrentSourceHash: response.prNarrativeCurrentSourceHash ?? current.narrativeCurrentSourceHash,
    narrativeError: ""
  };
}

export function applyPrSetupSuggestionToDraft(
  current: PrCampaignDraft,
  suggestion: {
    criteria: unknown;
    narrativeSettings?: PrNarrativeSettings | null;
  },
  requested?: PrCampaignDraft
): PrCampaignDraft {
  const currentSettings = current.narrativeSettings;
  const suggestedSettings = normalizePrNarrativeSettings(suggestion.narrativeSettings);
  const requestedSettings = requested?.narrativeSettings;
  const preserveEnteredValue = (
    key: keyof PrNarrativeSettings,
    currentValue: string,
    suggestedValue: string
  ): string => {
    if (requestedSettings && currentValue !== requestedSettings[key]) {
      return currentValue;
    }
    return currentValue.trim() ? currentValue : suggestedValue;
  };
  const criteriaChangedAfterRequest = Boolean(requested && !hasSamePrCriteria(current, requested));
  return {
    ...current,
    criteria: criteriaChangedAfterRequest ? current.criteria : normalizePrCriteria(suggestion.criteria),
    narrativeSettings: {
      narrativeAnchor: preserveEnteredValue("narrativeAnchor", currentSettings.narrativeAnchor, suggestedSettings.narrativeAnchor),
      targetAudience: preserveEnteredValue("targetAudience", currentSettings.targetAudience, suggestedSettings.targetAudience),
      desiredAction: preserveEnteredValue("desiredAction", currentSettings.desiredAction, suggestedSettings.desiredAction)
    }
  };
}

function hasSamePrCriteria(left: PrCampaignDraft, right: PrCampaignDraft): boolean {
  return left.criteria.every((criterion, index) => criterion.label === right.criteria[index]?.label);
}

function hasSamePrEditableDraft(left: PrCampaignDraft, right: PrCampaignDraft): boolean {
  return left.name === right.name
    && left.briefText === right.briefText
    && hasSamePrCriteria(left, right)
    && left.narrativeSettings.narrativeAnchor === right.narrativeSettings.narrativeAnchor
    && left.narrativeSettings.targetAudience === right.narrativeSettings.targetAudience
    && left.narrativeSettings.desiredAction === right.narrativeSettings.desiredAction;
}

function applySuccessfulPrCampaignSave(
  current: PrEvidenceResourceState,
  active: PrCampaign,
  submittedDraft: PrCampaignDraft,
  successNotice: string,
  newerEditsNotice: string
): PrEvidenceResourceState {
  const savedDraft = prCampaignToDraft(active);
  const hasNewerEdits = !hasSamePrEditableDraft(current.campaign, submittedDraft);
  return {
    ...current,
    campaign: hasNewerEdits ? {
      ...savedDraft,
      name: current.campaign.name,
      briefText: current.campaign.briefText,
      criteria: current.campaign.criteria,
      narrativeSettings: current.campaign.narrativeSettings
    } : savedDraft,
    narrativeCurrentSourceHash: "",
    narrativeError: "",
    setupCollapsed: !hasNewerEdits,
    notice: hasNewerEdits ? newerEditsNotice : successNotice
  };
}

export function applyPrCampaignSaveResult(
  current: PrEvidenceResourceState,
  response: ExtensionResponse,
  submittedDraft: PrCampaignDraft,
  successNotice: string
): PrEvidenceResourceState {
  if (!response.ok) {
    return { ...current, notice: response.error };
  }
  const active = response.prCampaigns?.[0] || null;
  return active
    ? applySuccessfulPrCampaignSave(
        current,
        active,
        submittedDraft,
        successNotice,
        "活動已儲存；你在等待期間的編輯尚未儲存。"
      )
    : current;
}

export function applyPrGeneratedCriteriaSaveResult(
  current: PrEvidenceResourceState,
  response: ExtensionResponse,
  settled: RequestReconcileDecision,
  submittedDraft?: PrCampaignDraft
): PrEvidenceResourceState {
  if (!settled.accepted) {
    return current;
  }
  if (!response.ok) {
    return {
      ...current,
      notice: response.error
    };
  }
  const active = response.prCampaigns?.[0] || null;
  if (!active) {
    return current;
  }
  return submittedDraft
    ? applySuccessfulPrCampaignSave(
        current,
        active,
        submittedDraft,
        "條件已生成並儲存；批次判斷會使用這六個標籤。",
        "條件已生成並儲存；你在等待期間的編輯尚未儲存。"
      )
    : {
        ...current,
        campaign: prCampaignToDraft(active),
        narrativeCurrentSourceHash: "",
        narrativeError: "",
        setupCollapsed: true,
        notice: "條件已生成並儲存；批次判斷會使用這六個標籤。"
      };
}

type InPageHydrateSurface = "pr";
type HydrateTraceEventKind = "skip" | "request" | "response" | "error";

export function buildInPageHydrateTraceEvent({
  surface,
  event,
  sessionId,
  result,
  detail
}: {
  surface: InPageHydrateSurface;
  event: HydrateTraceEventKind;
  sessionId?: string;
  result: PipelineEventInput["result"];
  detail?: unknown;
}): PipelineEventInput {
  return {
    phase: "ui.ready",
    step: `popup.${surface}.hydrate.${event}`,
    target: { sessionId },
    result,
    ...(detail === undefined ? {} : { detail })
  };
}

export function buildInPageHydrateTraceTerminalSequence({
  surface,
  sessionId,
  terminal
}: {
  surface: InPageHydrateSurface;
  sessionId: string;
  terminal: "response" | "error";
}): PipelineEventInput[] {
  return [
    buildInPageHydrateTraceEvent({
      surface,
      event: "request",
      sessionId,
      result: "pending"
    }),
    buildInPageHydrateTraceEvent({
      surface,
      event: terminal,
      sessionId,
      result: terminal === "response" ? "ok" : "error"
    })
  ];
}
export function useInPageCollectorAppState({ snapshot, tabId, sendAndSync }: UseInPageCollectorAppStateArgs) {
  const requestReconcilerRef = useRef(createRequestReconciler());
  const refreshedOnOpenFolderRef = useRef<string | null>(null);
  const popupOpen = true;
  const [draftBaseUrl, setDraftBaseUrl] = useState("http://127.0.0.1:8000");
  const [draftIngestApiToken, setDraftIngestApiToken] = useState("");
  const [clearIngestApiToken, setClearIngestApiToken] = useState(false);
  const [draftProvider, setDraftProvider] = useState<"openai" | "claude" | "google" | "">("google");
  const [draftOpenAiKey, setDraftOpenAiKey] = useState("");
  const [draftClaudeKey, setDraftClaudeKey] = useState("");
  const [draftDeepReadingModels, setDraftDeepReadingModels] = useState<ExtensionSettings["deepReadingModels"]>({});
  const [draftGoogleKey, setDraftGoogleKey] = useState("");
  const [draftLayoutPreferences, setDraftLayoutPreferences] = useState(createDefaultLayoutPreferences);
  const [draftProductProfile, setDraftProductProfile] = useState(createEmptyProductProfile);
  const [productProfileSeedText, setProductProfileSeedText] = useState("");
  const [isInitializingProductProfile, setIsInitializingProductProfile] = useState(false);
  const [activePrCampaign, setActivePrCampaign] = useState<PrCampaign | null>(null);
  const [prEvidenceResource, setPrEvidenceResource] = useState<PrEvidenceResourceState>(() => createPrEvidenceResource(""));
  const prEvidenceResourceRef = useRef(prEvidenceResource);
  prEvidenceResourceRef.current = prEvidenceResource;
  const [prEvidenceUiState, setPrEvidenceUiState] = useState<PrEvidenceUiState>(DEFAULT_PR_EVIDENCE_UI_STATE);
  const [compiledProductContext, setCompiledProductContext] = useState<ProductContext | null>(null);
  const [storageUsage, setStorageUsage] = useState<{
    bytesInUse: number;
    quotaBytes: number;
    unlimitedStorage: boolean;
  } | null>(null);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [localSettingsOverride, setLocalSettingsOverride] = useState<ExtensionSettings | null>(null);
  const effectiveSnapshot = useMemo(
    () => buildEffectiveSettingsSnapshot(snapshot, localSettingsOverride),
    [localSettingsOverride, snapshot]
  );
  const effectiveSettings = effectiveSnapshot?.global.settings ?? null;

  const snapshotActiveFolder = useMemo(() => getActiveSession(snapshot), [snapshot]);
  const activeFolder = snapshotActiveFolder;
  const activeFolderIdRef = useRef(activeFolder?.id ?? "");
  const activePrCampaignIdRef = useRef(activePrCampaign?.id ?? prEvidenceResource.campaign.id ?? "");
  activeFolderIdRef.current = activeFolder?.id ?? "";
  activePrCampaignIdRef.current = activePrCampaign?.id ?? prEvidenceResource.campaign.id ?? "";
  const settleReconciledResponse = useCallback((
    token: RequestReconcileToken,
    currentTarget: RequestReconcileTarget
  ): RequestReconcileDecision => {
    const decision = requestReconcilerRef.current.complete(token, { currentTarget });
    if (!decision.accepted) {
      emitPipelineEvent(buildReconcileIgnoredEvent(token, decision));
    }
    return decision;
  }, []);

  const activeFolderMode: FolderMode = activeFolder?.mode ?? "archive";
  const processingSummary = useMemo(
    () => summarizeSessionProcessing(activeFolder?.items || []),
    [activeFolder?.items]
  );
  const { workerStatus, backendWorkUiState, backendReachability } = useProcessingCoordinator({
    popupOpen,
    activeFolderId: activeFolder?.id,
    hasInflight: processingSummary.hasInflight,
    ingestBaseUrl: snapshot?.global.settings.ingestBaseUrl,
    sendAndSync
  });
  const {
    page: rawPage,
    onNavigate
  } = usePopupWorkspaceState({
    popupOpen,
    popupPage: snapshot?.tab.popupPage,
    processingSummary,
    sendAndSync
  });
  const page = resolveEffectivePopupPage(rawPage, activeFolderMode);
  const hasGoogleKey = Boolean(effectiveSettings?.hasGoogleKey ?? effectiveSettings?.googleApiKey.trim());
  const hasOpenAiKey = Boolean(effectiveSettings?.hasOpenAiKey ?? effectiveSettings?.openaiApiKey.trim());
  const hasClaudeKey = Boolean(effectiveSettings?.hasClaudeKey ?? effectiveSettings?.claudeApiKey.trim());
  const hasIngestApiToken = clearIngestApiToken
    ? Boolean(draftIngestApiToken.trim())
    : Boolean(effectiveSettings?.hasIngestApiToken || effectiveSettings?.ingestApiToken?.trim() || draftIngestApiToken.trim());

  useEffect(() => {
    if (!popupOpen) {
      refreshedOnOpenFolderRef.current = null;
      return;
    }
    const folderId = activeFolder?.id;
    if (!folderId || refreshedOnOpenFolderRef.current === folderId) {
      return;
    }
    refreshedOnOpenFolderRef.current = folderId;
    void sendAndSync({ type: "session/refresh-all", target: { sessionId: folderId } }).catch((error: unknown) => {
      console.error("failed to refresh active folder on popup open", error);
    });
  }, [popupOpen, activeFolder?.id, sendAndSync]);

  useEffect(() => {
    let cancelled = false;
    if (!popupOpen || !activeFolder?.id || activeFolderMode !== "pr-evidence") {
      setActivePrCampaign(null);
      const inactiveSessionId = activeFolder?.id || "";
      setPrEvidenceResource((current) => (
        current.campaign.sessionId === inactiveSessionId ? current : createPrEvidenceResource(inactiveSessionId)
      ));
      emitPipelineEvent(buildInPageHydrateTraceEvent({
        surface: "pr",
        event: "skip",
        sessionId: activeFolder?.id,
        result: "ok",
        detail: {
          popupOpen,
          mode: activeFolderMode
        }
      }));
      return;
    }
    const sessionId = activeFolder.id;
    emitPipelineEvent(buildInPageHydrateTraceEvent({
      surface: "pr",
      event: "request",
      sessionId,
      result: "pending",
      detail: {
        mode: activeFolderMode
      }
    }));
    void sendExtensionMessage<{ ok: true; prCampaigns?: PrCampaign[] } | { ok: false; error: string }>({
      type: "pr/list-campaigns",
      sessionId
    })
      .then(async (response) => {
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setActivePrCampaign(null);
          setPrEvidenceResource((current) => ({
            ...(current.campaign.sessionId === sessionId ? current : createPrEvidenceResource(sessionId)),
            notice: response.error
          }));
          emitPipelineEvent(buildInPageHydrateTraceEvent({
            surface: "pr",
            event: "response",
            sessionId,
            result: "error",
            detail: {
              mode: activeFolderMode,
              campaignsOk: false,
              campaignCount: null,
              rowsOk: null,
              rowCount: null
            }
          }));
          return;
        }
        const active = response.prCampaigns?.[0] ?? null;
        if (!active) {
          setActivePrCampaign(null);
          setPrEvidenceResource(createPrEvidenceResource(sessionId));
          emitPipelineEvent(buildInPageHydrateTraceEvent({
            surface: "pr",
            event: "response",
            sessionId,
            result: "ok",
            detail: {
              mode: activeFolderMode,
              campaignsOk: true,
              campaignCount: response.prCampaigns?.length ?? 0,
              rowsOk: null,
              rowCount: null
            }
          }));
          return;
        }
        setActivePrCampaign(active);
        setPrEvidenceResource((current) => ({
          campaign: prCampaignToDraft(active),
          rows: current.campaign.id === active.id ? current.rows : [],
          narrativeRead: current.campaign.id === active.id ? current.narrativeRead : null,
          narrativeCurrentSourceHash: current.campaign.id === active.id ? current.narrativeCurrentSourceHash : "",
          narrativeError: "",
          summary: current.campaign.id === active.id ? current.summary : "",
          notice: "",
          uploadError: "",
          setupCollapsed: true
        }));
        let rowResponse: { ok: true; prEvidenceRows?: PrEvidenceRow[] } | { ok: false; error: string };
        try {
          rowResponse = await sendExtensionMessage<{ ok: true; prEvidenceRows?: PrEvidenceRow[] } | { ok: false; error: string }>({
            type: "pr/list-evidence-rows",
            campaignId: active.id
          });
        } catch (error) {
          if (!cancelled) {
            setPrEvidenceResource((current) => ({
              ...current,
              campaign: prCampaignToDraft(active),
              rows: [],
              notice: error instanceof Error ? error.message : String(error)
            }));
            emitPipelineEvent(buildInPageHydrateTraceEvent({
              surface: "pr",
              event: "error",
              sessionId,
              result: "error",
              detail: {
                mode: activeFolderMode,
                campaignId: active.id
              }
            }));
          }
          return;
        }
        let narrativeResponse: ExtensionResponse | null = null;
        if (rowResponse.ok) {
          try {
            narrativeResponse = await sendExtensionMessage({
              type: "pr/get-narrative-read",
              campaignId: active.id
            });
          } catch (error) {
            narrativeResponse = {
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            };
          }
        }
        if (!cancelled) {
          const hydrateOk = rowResponse.ok && narrativeResponse?.ok !== false;
          setActivePrCampaign(active);
          setPrEvidenceResource({
            campaign: prCampaignToDraft(active),
            rows: rowResponse.ok ? rowResponse.prEvidenceRows ?? [] : [],
            narrativeRead: narrativeResponse?.ok ? narrativeResponse.prNarrativeRead ?? null : null,
            narrativeCurrentSourceHash: narrativeResponse?.ok ? narrativeResponse.prNarrativeCurrentSourceHash ?? "" : "",
            narrativeError: narrativeResponse && !narrativeResponse.ok ? narrativeResponse.error : "",
            summary: "",
            notice: rowResponse.ok ? "" : rowResponse.error,
            uploadError: "",
            setupCollapsed: true
          });
          emitPipelineEvent(buildInPageHydrateTraceEvent({
            surface: "pr",
            event: "response",
            sessionId,
            result: hydrateOk ? "ok" : "error",
            detail: {
              mode: activeFolderMode,
              campaignId: active.id,
              campaignsOk: true,
              campaignCount: response.prCampaigns?.length ?? 0,
              rowsOk: rowResponse.ok,
              rowCount: rowResponse.ok ? rowResponse.prEvidenceRows?.length ?? 0 : null,
              narrativeOk: narrativeResponse?.ok ?? null
            }
          }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActivePrCampaign(null);
          setPrEvidenceResource((current) => ({
            ...(current.campaign.sessionId === sessionId ? current : createPrEvidenceResource(sessionId)),
            notice: "PR campaign 讀取失敗。"
          }));
          emitPipelineEvent(buildInPageHydrateTraceEvent({
            surface: "pr",
            event: "error",
            sessionId,
            result: "error",
            detail: {
              mode: activeFolderMode
            }
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeFolder?.id, activeFolderMode, popupOpen, snapshot?.global.updatedAt]);

  useEffect(() => {
    if (snapshot?.global.settings.ingestBaseUrl) {
      setDraftBaseUrl(snapshot.global.settings.ingestBaseUrl);
    }
    setDraftIngestApiToken(snapshot?.global.settings.ingestApiToken || "");
    setClearIngestApiToken(false);
    setDraftProvider(snapshot?.global.settings.oneLinerProvider || "");
    setDraftOpenAiKey(snapshot?.global.settings.openaiApiKey || "");
    setDraftClaudeKey(snapshot?.global.settings.claudeApiKey || "");
    setDraftGoogleKey(snapshot?.global.settings.googleApiKey || "");
    setDraftDeepReadingModels(snapshot?.global.settings.deepReadingModels ?? {});
    setDraftLayoutPreferences(snapshot?.global.settings.layoutPreferences ?? createDefaultLayoutPreferences());
    setDraftProductProfile(snapshot?.global.settings.productProfile ?? createEmptyProductProfile());
  }, [
    snapshot?.global.settings.ingestBaseUrl,
    snapshot?.global.settings.ingestApiToken,
    snapshot?.global.settings.oneLinerProvider,
    snapshot?.global.settings.openaiApiKey,
    snapshot?.global.settings.claudeApiKey,
    snapshot?.global.settings.googleApiKey,
    snapshot?.global.settings.deepReadingModels,
    snapshot?.global.settings.layoutPreferences,
    snapshot?.global.settings.productProfile
  ]);

  useEffect(() => {
    if (!popupOpen || page !== "settings" || activeFolderMode !== "product") {
      return;
    }
    let cancelled = false;
    void sendExtensionMessage<{ ok: true; productContext?: ProductContext | null } | { ok: false; error: string }>({
      type: "product/get-context"
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setCompiledProductContext(response.ok ? (response.productContext ?? null) : null);
      })
      .catch(() => {
        if (!cancelled) {
          setCompiledProductContext(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeFolderMode, page, popupOpen, snapshot?.global.updatedAt]);

  useEffect(() => {
    if (!popupOpen || page !== "settings") {
      return;
    }
    let cancelled = false;
    void sendExtensionMessage<{
      ok: true;
      bytesInUse?: number;
      quotaBytes?: number;
      unlimitedStorage?: boolean;
    } | { ok: false; error: string }>({
      type: "storage/get-usage"
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        if (
          response.ok
          && typeof response.bytesInUse === "number"
          && typeof response.quotaBytes === "number"
          && typeof response.unlimitedStorage === "boolean"
        ) {
          setStorageUsage({
            bytesInUse: response.bytesInUse,
            quotaBytes: response.quotaBytes,
            unlimitedStorage: response.unlimitedStorage
          });
          return;
        }
        setStorageUsage(null);
      })
      .catch(() => {
        if (!cancelled) {
          setStorageUsage(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, popupOpen, snapshot?.global.updatedAt]);

  async function onRenameWorkspace(sessionId: string, name: string) {
    if (!name.trim() || !snapshot?.global.sessions.some((session) => session.id === sessionId)) return { ok: false as const };
    return sendAndSync({ type: "session/rename", sessionId, name: name.trim() });
  }

  // The workspace view asks for confirmation before invoking this command.
  async function onDeleteWorkspace(sessionId: string) {
    if (!snapshot?.global.sessions.some((session) => session.id === sessionId)) return { ok: false as const };
    return sendAndSync({ type: "session/delete", sessionId });
  }

  async function onMoveAudienceItem(sessionId: string, itemId: string) {
    const response = await sendAndSync({ type: "session/move-to-product", sessionId, itemId });
    if (!response.ok) throw new Error(response.error);
  }

  async function onCreateWorkspace(name: string, mode: FolderMode) {
    return sendAndSync({ type: "session/create", name: name.trim(), mode });
  }

  async function onSetActiveSession(sessionId: string) {
    return sendAndSync({
      type: "session/set-active",
      sessionId
    });
  }

  function onDraftIngestApiTokenChange(value: string) {
    setDraftIngestApiToken(value);
    if (value.trim()) setClearIngestApiToken(false);
  }

  function onClearIngestApiToken() {
    setDraftIngestApiToken("");
    setClearIngestApiToken(true);
  }

  /** Saves every draft setting; resolves true when all writes landed. */
  async function onSaveSettings(): Promise<boolean> {
    if (isSavingSettings) {
      return false;
    }
    const classified = classifyIngestBaseUrl(draftBaseUrl);
    if (!classified.ok) {
      setSettingsSaveStatus({ kind: "error", message: classified.message });
      return false;
    }
    setIsSavingSettings(true);
    setSettingsSaveStatus(null);
    try {
      let latestProductContext: ProductContext | null | undefined;
      let productContextError: string | null | undefined;
      for (const message of buildSettingsSaveMessages({
        draftBaseUrl: classified.normalized,
        draftIngestApiToken,
        clearIngestApiToken,
        draftProvider,
        draftOpenAiKey,
        draftClaudeKey,
        draftGoogleKey,
        draftDeepReadingModels,
        draftLayoutPreferences,
        draftProductProfile
      })) {
        const response = await sendAndSync(message);
        if (!response.ok) {
          setSettingsSaveStatus({ kind: "error", message: response.error });
          return false;
        }
        if ("productContext" in response) {
          latestProductContext = response.productContext ?? null;
        }
        if ("productContextError" in response) {
          productContextError = response.productContextError ?? null;
        }
      }
      setDraftBaseUrl(classified.normalized);
      setLocalSettingsOverride(buildLocalSettingsOverride({
        currentSettings: snapshot?.global.settings ?? createDefaultSettings(),
        draftBaseUrl: classified.normalized,
        draftIngestApiToken,
        clearIngestApiToken,
        draftProvider,
        draftOpenAiKey,
        draftClaudeKey,
        draftGoogleKey,
        draftDeepReadingModels,
        draftLayoutPreferences,
        draftProductProfile
      }));
      if (latestProductContext !== undefined) {
        setCompiledProductContext(latestProductContext);
      }
      if (productContextError) {
        setSettingsSaveStatus({
          kind: "error",
          message: `Settings 已儲存；ProductContext 編譯失敗：${productContextError}`
        });
        return true;
      }
      setSettingsSaveStatus({
        kind: "success",
        message: latestProductContext ? "Settings 已儲存，ProductContext 已編譯。" : "Settings 已儲存。"
      });
      return true;
    } catch (error) {
      setSettingsSaveStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
      return false;
    } finally {
      setIsSavingSettings(false);
    }
  }

  // Settings' AI group: save, then ask the chosen provider whether the key works.
  const [aiKeyStatus, setAiKeyStatus] = useState<{ kind: "ok" | "error" | "testing"; message: string } | null>(null);
  async function onSaveAndTestAi() {
    setAiKeyStatus(null);
    if (!await onSaveSettings()) return;
    setAiKeyStatus({ kind: "testing", message: "測試中…" });
    try {
      const response = await sendExtensionMessage<ExtensionResponse>({ type: "settings/test-ai-key" });
      setAiKeyStatus(response.ok && response.aiKeyTest
        ? { kind: response.aiKeyTest.ok ? "ok" : "error", message: response.aiKeyTest.message }
        : { kind: "error", message: response.ok ? "未能測試 key" : response.error });
    } catch (error) {
      setAiKeyStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function onClearProductCache() {
    setSettingsSaveStatus(null);
    try {
      const response = await sendAndSync({ type: "product/clear-cache" });
      if (!response.ok) {
        setSettingsSaveStatus({ kind: "error", message: response.error });
        return;
      }
      setCompiledProductContext(null);
      setSettingsSaveStatus({
        kind: "success",
        message: "Product cache 已清除。已儲存 signals、topics、PR evidence 不受影響。"
      });
    } catch (error) {
      setSettingsSaveStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function onDraftProductProfileChange(patch: Partial<typeof draftProductProfile>) {
    setDraftProductProfile((current) => ({
      ...current,
      ...patch
    }));
  }

  function onDraftLayoutPreferencesChange(patch: Partial<LayoutPreferences>) {
    setDraftLayoutPreferences((current) => ({
      ...current,
      ...patch
    }));
  }

  async function onInitProductProfile() {
    if (!productProfileSeedText.trim() || isInitializingProductProfile) {
      return;
    }
    setIsInitializingProductProfile(true);
    try {
      const response = await sendExtensionMessage<{ ok: true; productProfile?: typeof draftProductProfile | null } | { ok: false; error: string }>({
        type: "settings/init-product-profile",
        description: productProfileSeedText.trim()
      });
      if (response.ok && response.productProfile) {
        setDraftProductProfile(response.productProfile);
      }
    } finally {
      setIsInitializingProductProfile(false);
    }
  }

  async function onExportSignalPackets({
    sessionId,
    format
  }: {
    sessionId: string;
    format: SignalPacketExportFormat;
  }): Promise<{ ok: true; exportResult: SignalPacketExportResult } | { ok: false; error: string }> {
    return requestCollectionSignalPacketExport(sendAndSync, { sessionId, format });
  }

  const onPrEvidenceResourceChange = useCallback((resource: PrEvidenceResourceState) => {
    prEvidenceResourceRef.current = resource;
    setPrEvidenceResource(resource);
  }, []);

  const onPrEvidenceActiveCampaignChange = useCallback((campaign: PrCampaign | null) => {
    setActivePrCampaign(campaign);
    if (campaign) {
      setPrEvidenceResource((current) => ({
        ...current,
        campaign: prCampaignToDraft(campaign),
        setupCollapsed: true
      }));
    }
  }, []);

  const prEvidenceViewModel = useMemo(() => buildPrEvidenceViewModel({
    sessionId: activeFolder?.id || prEvidenceResource.campaign.sessionId || "",
    resource: prEvidenceResource,
    uiState: prEvidenceUiState
  }), [activeFolder?.id, prEvidenceResource, prEvidenceUiState]);

  const onPrEvidenceCommand = useCallback(async (command: PrEvidenceCommand) => {
    const updateUiState = (patch: Partial<PrEvidenceUiState>) => {
      setPrEvidenceUiState((current) => ({ ...current, ...patch }));
    };
    const updateResource = (updater: (current: PrEvidenceResourceState) => PrEvidenceResourceState) => {
      setPrEvidenceResource((current) => {
        const next = updater(current);
        prEvidenceResourceRef.current = next;
        return next;
      });
    };
    const markCriterionReview = (criterionId: PrCriterionId, mark: PrCriterionReviewMark) => {
      setPrEvidenceUiState((current) => ({
        ...current,
        criteriaReview: { ...current.criteriaReview, [criterionId]: mark }
      }));
    };
    const setCriterionLabel = (criterionId: PrCriterionId, label: string) => {
      updateResource((current) => ({
        ...current,
        campaign: {
          ...current.campaign,
          criteria: current.campaign.criteria.map((criterion) =>
            criterion.id === criterionId ? { ...criterion, label } : criterion
          ) as PrCampaignDraft["criteria"]
        }
      }));
    };
    const beginPrRequest = (
      lane: string,
      target: RequestReconcileTarget,
      prefix: string
    ): { requestId: string; token: RequestReconcileToken } => {
      const requestId = createPipelineRequestId(prefix);
      return {
        requestId,
        token: requestReconcilerRef.current.begin({
          lane,
          requestId,
          target
        })
      };
    };
    const currentPrTarget = (campaignId: string): RequestReconcileTarget => ({
      sessionId: activeFolderIdRef.current,
      campaignId: activePrCampaignIdRef.current || campaignId
    });
    const saveDraft = async (draft: PrEvidenceCommand & { kind: "saveCampaign" }, successNotice: string) => {
      const submittedDraft: PrCampaignDraft = {
        ...prEvidenceResourceRef.current.campaign,
        ...draft.draft,
        sessionId: draft.target.sessionId,
        criteria: normalizePrCriteria(draft.draft.criteria),
        narrativeSettings: normalizePrNarrativeSettings(draft.draft.narrativeSettings)
      };
      updateUiState({ isSaving: true });
      updateResource((current) => ({ ...current, notice: "" }));
      try {
        const response = await sendAndSync({
          type: "pr/save-campaign",
          sessionId: draft.target.sessionId,
          draft: draft.draft
        });
        if (response.ok) {
          const active = response.prCampaigns?.[0] || null;
          if (active) {
            setActivePrCampaign(active);
          }
          updateResource((current) => applyPrCampaignSaveResult(current, response, submittedDraft, successNotice));
        } else {
          updateResource((current) => ({ ...current, notice: response.error }));
        }
      } catch (error) {
        updateResource((current) => ({ ...current, notice: error instanceof Error ? error.message : String(error) }));
      } finally {
        updateUiState({ isSaving: false });
      }
    };
    const generateCriteria = async (campaignName: string, briefText: string) => {
      const requestedDraft: PrCampaignDraft = {
        ...prEvidenceResourceRef.current.campaign,
        criteria: normalizePrCriteria(prEvidenceResourceRef.current.campaign.criteria),
        narrativeSettings: { ...prEvidenceResourceRef.current.campaign.narrativeSettings }
      };
      updateUiState({ isGeneratingCriteria: true });
      updateResource((current) => ({ ...current, notice: "" }));
      const campaignId = requestedDraft.id || "draft";
      const { requestId, token } = beginPrRequest(
        "pr.generateCriteria",
        { sessionId: command.target.sessionId, campaignId },
        "pr-generate-criteria"
      );
      let settled: RequestReconcileDecision | null = null;
      try {
        const response = await sendAndSync({
          type: "pr/generate-criteria",
          requestId,
          campaignName,
          briefText
        });
        settled = settleReconciledResponse(token, currentPrTarget(campaignId));
        if (!settled.accepted) {
          return;
        }
        if (response.ok && response.prCriteria?.length) {
          const currentDraft = prEvidenceResourceRef.current.campaign;
          const changedDuringGeneration = !hasSamePrEditableDraft(currentDraft, requestedDraft);
          const nextDraft = applyPrSetupSuggestionToDraft(currentDraft, {
            criteria: response.prCriteria,
            narrativeSettings: response.prNarrativeSettings
          }, requestedDraft);
          setPrEvidenceUiState((current) => ({
            ...current,
            criteriaReview: Object.fromEntries(
              PR_ACTIVE_CRITERION_IDS
                .filter((id) => nextDraft.criteria.some((criterion) => criterion.id === id && criterion.label.trim()))
                .map((id) => [id, "candidate" as PrCriterionReviewMark])
            )
          }));
          prEvidenceResourceRef.current = {
            ...prEvidenceResourceRef.current,
            campaign: nextDraft,
            ...(changedDuringGeneration ? {
              setupCollapsed: false,
              notice: "活動設定在生成期間已變更；新建議尚未儲存，請確認後再儲存。"
            } : {})
          };
          setPrEvidenceResource(prEvidenceResourceRef.current);
          if (changedDuringGeneration) {
            return;
          }
          if (nextDraft.name.trim()) {
            const {
              requestId: saveRequestId,
              token: saveToken
            } = beginPrRequest(
              "pr.saveGeneratedCriteria",
              { sessionId: command.target.sessionId, campaignId },
              "pr-save-generated-criteria"
            );
            const saveResponse = await sendAndSync({
              type: "pr/save-campaign",
              requestId: saveRequestId,
              sessionId: command.target.sessionId,
              draft: {
                ...(nextDraft.id ? { id: nextDraft.id } : {}),
                name: nextDraft.name.trim(),
                briefText: nextDraft.briefText,
                criteria: nextDraft.criteria,
                narrativeSettings: nextDraft.narrativeSettings
              }
            });
            const saveSettled = settleReconciledResponse(saveToken, currentPrTarget(campaignId));
            settled = saveSettled;
            if (!saveSettled.accepted) {
              return;
            }
            if (saveResponse.ok) {
              const active = saveResponse.prCampaigns?.[0] || null;
              if (active) {
                setActivePrCampaign(active);
              }
            }
            updateResource((current) => applyPrGeneratedCriteriaSaveResult(current, saveResponse, saveSettled, nextDraft));
          } else {
            updateResource((current) => ({ ...current, notice: "條件已生成。請先填活動名稱，再執行批次判斷。" }));
          }
        } else if (!response.ok) {
          updateResource((current) => ({ ...current, notice: response.error }));
        }
      } catch (error) {
        settled = settleReconciledResponse(token, currentPrTarget(campaignId));
        if (!settled.accepted) {
          return;
        }
        updateResource((current) => ({ ...current, notice: error instanceof Error ? error.message : String(error) }));
      } finally {
        if (shouldClearPrReconciledLoading(settled)) {
          updateUiState({ isGeneratingCriteria: false });
        }
      }
    };

    switch (command.kind) {
      case "updateDraft":
        {
          const next = {
            ...prEvidenceResourceRef.current,
            campaign: {
              ...prEvidenceResourceRef.current.campaign,
              ...command.draft,
              sessionId: command.target.sessionId
            }
          };
          prEvidenceResourceRef.current = next;
          setPrEvidenceResource(next);
        }
        return;
      case "setSetupCollapsed":
        updateResource((current) => ({ ...current, setupCollapsed: command.collapsed }));
        return;
      case "setLens":
        updateUiState({ activeLens: command.lens });
        return;
      case "selectNarrativeClaim":
        updateUiState({ selectedNarrativeClaimId: command.claimId });
        return;
      case "generateNarrative":
        updateUiState({ isGeneratingNarrative: true });
        updateResource((current) => ({ ...current, narrativeError: "" }));
        {
          const { requestId, token } = beginPrRequest(
            "pr.generateNarrative",
            { sessionId: command.target.sessionId, campaignId: command.target.campaignId },
            "pr-generate-narrative"
          );
          let settled: RequestReconcileDecision | null = null;
          try {
            const response = await sendAndSync({
              type: "pr/generate-narrative-read",
              requestId,
              campaignId: command.target.campaignId
            });
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (!settled.accepted) {
              return;
            }
            const acceptedSettled = settled;
            updateResource((current) => applyPrNarrativeResult(current, response, acceptedSettled));
            if (response.ok) {
              updateUiState({ selectedNarrativeClaimId: null });
            }
          } catch (error) {
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (settled.accepted) {
              updateResource((current) => ({
                ...current,
                narrativeError: error instanceof Error ? error.message : String(error)
              }));
            }
          } finally {
            if (shouldClearPrReconciledLoading(settled)) {
              updateUiState({ isGeneratingNarrative: false });
            }
          }
        }
        return;
      case "setPane":
        updateUiState({ activePane: command.pane });
        return;
      case "saveCampaign":
        await saveDraft(command, "活動已儲存；Collect 現在可以加入 evidence rows。");
        return;
      case "generateCriteria":
        await generateCriteria(command.campaignName, command.briefText);
        return;
      case "confirmCriterion":
        markCriterionReview(command.criterionId, "confirmed");
        return;
      case "correctCriterion":
        markCriterionReview(command.criterionId, "editing");
        return;
      case "markCriterionNotMentioned":
        /* Not a confirmation: the label is cleared so the criterion stops
           counting, and the row says so rather than reading as confirmed. */
        setCriterionLabel(command.criterionId, "");
        markCriterionReview(command.criterionId, "not_mentioned");
        return;
      case "requestBriefUpload":
        return;
      case "matchCriteria":
        updateUiState({ isMatching: true });
        updateResource((current) => ({ ...current, notice: "" }));
        {
          const { requestId, token } = beginPrRequest(
            "pr.matchCriteria",
            { sessionId: command.target.sessionId, campaignId: command.target.campaignId },
            "pr-match-criteria"
          );
          let settled: RequestReconcileDecision | null = null;
          try {
            const response = await sendAndSync({ type: "pr/match-criteria", requestId, campaignId: command.target.campaignId });
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (!settled.accepted) {
              return;
            }
            if (response.ok) {
              updateResource((current) => ({ ...current, rows: response.prEvidenceRows ?? [], notice: "條件判斷已更新。" }));
            } else {
              updateResource((current) => ({ ...current, notice: response.error }));
            }
          } catch (error) {
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (settled.accepted) {
              updateResource((current) => ({ ...current, notice: error instanceof Error ? error.message : String(error) }));
            }
          } finally {
            if (settled === null || settled.accepted || settled.reason === "target-mismatch") {
              updateUiState({ isMatching: false });
            }
          }
        }
        return;
      case "fetchAdvancedMetrics":
        updateUiState({ isFetchingAdvancedMetrics: true });
        updateResource((current) => ({ ...current, notice: "" }));
        {
          const { requestId, token } = beginPrRequest(
            "pr.fetchAdvancedMetrics",
            { sessionId: command.target.sessionId, campaignId: command.target.campaignId },
            "pr-fetch-metrics"
          );
          let settled: RequestReconcileDecision | null = null;
          try {
            const response = await sendAndSync({ type: "pr/fetch-advanced-metrics", requestId, campaignId: command.target.campaignId });
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (!settled.accepted) {
              return;
            }
            if (response.ok) {
              const nextRows = response.prEvidenceRows ?? [];
              updateResource((current) => ({
                ...current,
                rows: nextRows,
                notice: summarizeAdvancedMetricsNotice(response.prAdvancedMetricsSummary, nextRows)
              }));
            } else {
              updateResource((current) => ({ ...current, notice: response.error }));
            }
          } catch (error) {
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (settled.accepted) {
              updateResource((current) => ({ ...current, notice: error instanceof Error ? error.message : String(error) }));
            }
          } finally {
            if (settled === null || settled.accepted || settled.reason === "target-mismatch") {
              updateUiState({ isFetchingAdvancedMetrics: false });
            }
          }
        }
        return;
      case "generateSummary":
        updateUiState({ isGeneratingSummary: true });
        updateResource((current) => ({ ...current, notice: "" }));
        {
          const { requestId, token } = beginPrRequest(
            "pr.generateSummary",
            { sessionId: command.target.sessionId, campaignId: command.target.campaignId },
            "pr-generate-summary"
          );
          let settled: RequestReconcileDecision | null = null;
          try {
            const response = await sendAndSync({ type: "pr/generate-summary", requestId, campaignId: command.target.campaignId });
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (!settled.accepted) {
              return;
            }
            const acceptedSettled = settled;
            updateResource((current) => applyPrGenerateSummaryResult(current, response, acceptedSettled));
          } catch (error) {
            settled = settleReconciledResponse(token, currentPrTarget(command.target.campaignId));
            if (settled.accepted) {
              updateResource((current) => ({ ...current, notice: error instanceof Error ? error.message : String(error) }));
            }
          } finally {
            if (shouldClearPrReconciledLoading(settled)) {
              updateUiState({ isGeneratingSummary: false });
            }
          }
        }
        return;
      case "exportCsv":
      case "exportSummaryMarkdown":
      case "exportSummaryDocx":
        downloadPrFileExport(command.file);
        return;
      default:
        return;
    }
  }, [prEvidenceResource, sendAndSync]);

  const onPrEvidenceBriefFileSelected = useCallback(async (file: File) => {
    const updateUiState = (patch: Partial<PrEvidenceUiState>) => {
      setPrEvidenceUiState((current) => ({ ...current, ...patch }));
    };
    const sessionId = activeFolder?.id || prEvidenceResource.campaign.sessionId || "";
    updateUiState({ isReadingBrief: true });
    setPrEvidenceResource((current) => ({ ...current, uploadError: "" }));
    try {
      const result = await readPrBriefFile(file);
      const nextName = prEvidenceResource.campaign.name.trim() || result.inferredName;
      setPrEvidenceResource((current) => ({
        ...current,
        campaign: {
          ...current.campaign,
          name: nextName,
          briefText: result.text
        },
        notice: `已載入 ${file.name}${result.sourceKind === "pdf" ? " PDF" : ""}，正在用 brief 產生六項條件...`
      }));
      updateUiState({ isReadingBrief: false });
      await onPrEvidenceCommand({
        kind: "generateCriteria",
        target: { sessionId },
        campaignName: nextName,
        briefText: result.text
      });
    } catch (error) {
      setPrEvidenceResource((current) => ({ ...current, uploadError: error instanceof Error ? error.message : String(error) }));
    } finally {
      updateUiState({ isReadingBrief: false });
    }
  }, [activeFolder?.id, onPrEvidenceCommand, prEvidenceResource.campaign]);
  const topicState = useTopicState({ popupOpen, activeFolder, activeFolderMode, stateUpdatedAt: snapshot?.global.updatedAt, sendAndSync });

  return {
    snapshot: effectiveSnapshot,
    tabId,
    activeFolder,
    activeFolderMode,
    popupOpen,
    page,
    readInteractionNowMs,
    readWallClockNowMs,
    createContextFileId,
    processingSummary,
    draftBaseUrl,
    draftIngestApiToken,
    hasIngestApiToken,
    onDraftIngestApiTokenChange,
    onClearIngestApiToken,
    draftProvider,
    draftOpenAiKey,
    draftClaudeKey,
    draftGoogleKey,
    draftDeepReadingModels,
    setDraftDeepReadingModels,
    hasOpenAiKey,
    hasClaudeKey,
    hasGoogleKey,
    draftLayoutPreferences,
    draftProductProfile,
    compiledProductContext,
    storageUsage,
    settingsSaveStatus,
    isSavingSettings,
    productProfileSeedText,
    isInitializingProductProfile,
    workerStatus,
    backendWorkUiState,
    backendReachability,
    activePrCampaign,
    prEvidenceResource,
    prEvidenceViewModel,
    topics: topicState.topics,
    signals: topicState.signals,
    setDraftBaseUrl,
    setDraftProvider,
    setDraftOpenAiKey,
    setDraftClaudeKey,
    setDraftGoogleKey,
    onDraftLayoutPreferencesChange,
    setProductProfileSeedText,
    onDraftProductProfileChange,
    onNavigate,
    onDeleteTopic: topicState.onDeleteTopic,
    onCreateTopicNamed: topicState.onCreateTopicNamed,
    onUpdateTopic: topicState.onUpdateTopic,
    onSignalTriaged: topicState.onSignalTriaged,
    onSignalDeleted: topicState.onSignalDeleted,
    onInitProductProfile,
    onExportSignalPackets,
    onPrEvidenceResourceChange,
    onPrEvidenceActiveCampaignChange,
    onPrEvidenceCommand,
    onPrEvidenceBriefFileSelected,
    onRenameWorkspace,
    onDeleteWorkspace,
    onSetActiveSession,
    onCreateWorkspace,
    onMoveAudienceItem,
    onSaveSettings,
    onSaveAndTestAi,
    aiKeyStatus,
    onClearProductCache
  };
}

export type InPageCollectorAppModel = ReturnType<typeof useInPageCollectorAppState>;
