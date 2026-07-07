import {
  buildPrEvidenceCsv,
  buildPrEvidenceCsvRows,
  extractPrCoreMessages,
  inferPrViewsFromText
} from "../compare/pr-evidence.ts";
import {
  buildPrSummaryDocxExport,
  buildPrSummaryMarkdownExport,
  sanitizePrFileBase,
  type PrFileExportDescriptor
} from "../compare/pr-summary-export.ts";
import type { TargetDescriptor } from "../contracts/target-descriptor.ts";
import type {
  PrCampaign,
  PrCampaignDraft,
  PrCampaignSaveDraft,
  PrCriteriaMatches,
  PrCriterion,
  PrCriterionId,
  PrEvidenceRow
} from "../state/pr-evidence-storage.ts";
import { normalizePrCriteria, PR_CRITERION_IDS } from "../state/pr-evidence-storage.ts";

export type PrWorkPane = "ledger" | "match" | "metrics";
export type PrTabTone = "accent" | "success" | "neutral";

export interface PrEvidenceResourceState {
  campaign: PrCampaignDraft;
  rows: PrEvidenceRow[];
  summary: string;
  notice: string;
  uploadError: string;
  setupCollapsed: boolean;
}

export interface PrEvidenceUiState {
  activePane: PrWorkPane;
  isSaving: boolean;
  isReadingBrief: boolean;
  isGeneratingCriteria: boolean;
  isMatching: boolean;
  isFetchingAdvancedMetrics: boolean;
  isGeneratingSummary: boolean;
}

export type PrEvidenceCommand =
  | { kind: "updateDraft"; target: { sessionId: string }; draft: PrCampaignSaveDraft }
  | { kind: "setSetupCollapsed"; target: { sessionId: string }; collapsed: boolean }
  | { kind: "setPane"; target: { sessionId: string }; pane: PrWorkPane }
  | { kind: "saveCampaign"; target: { sessionId: string }; draft: PrCampaignSaveDraft }
  | { kind: "generateCriteria"; target: { sessionId: string }; campaignName: string; briefText: string }
  | { kind: "requestBriefUpload"; target: { sessionId: string } }
  | { kind: "matchCriteria"; target: { sessionId: string; campaignId: string } }
  | { kind: "fetchAdvancedMetrics"; target: { sessionId: string; campaignId: string } }
  | { kind: "generateSummary"; target: { sessionId: string; campaignId: string } }
  | { kind: "exportCsv"; target: { sessionId: string; campaignId: string }; file: PrFileExportDescriptor }
  | { kind: "exportSummaryMarkdown"; target: { sessionId: string; campaignId: string }; file: PrFileExportDescriptor }
  | { kind: "exportSummaryDocx"; target: { sessionId: string; campaignId: string }; file: PrFileExportDescriptor };

export interface PrCampaignViewModel {
  id: string | null;
  sessionId: string;
  name: string;
  briefText: string;
  criteria: [PrCriterion, PrCriterion, PrCriterion, PrCriterion, PrCriterion, PrCriterion];
  placeholders: Record<PrCriterionId, string>;
  saved: boolean;
  canSave: boolean;
  setupCollapsed: boolean;
  lastMatchedAt?: string;
  savedLabel: string;
  saveDraft: PrCampaignSaveDraft;
}

export interface PrEvidenceCriterionMatchViewModel {
  id: PrCriterionId;
  index: number;
  label: string;
  matched: boolean;
}

export interface PrEvidenceMetricCellViewModel {
  label: string;
  value: string;
  advanced: boolean;
}

export interface PrEvidenceRowViewModel {
  id: string;
  sourceUrl: string;
  sourceLinkAriaLabel: string;
  authorLabel: string;
  captionLabel: string;
  metricLine: string;
  collectedAtLabel: string;
  matchedCount: number;
  matchCountLabel: string;
  matchedCriterionLabels: string[];
  criteria: PrEvidenceCriterionMatchViewModel[];
  metrics: PrEvidenceMetricCellViewModel[];
  collectorDescriptor: TargetDescriptor;
  advancedMetricsError: string;
}

export interface PrEvidenceTabViewModel {
  id: PrWorkPane;
  label: string;
  count: string;
  tone: PrTabTone;
}

export interface PrEvidenceWorkingAreaViewModel {
  activePane: PrWorkPane;
  tabs: PrEvidenceTabViewModel[];
  ledgerCaption: string;
  match: {
    caption: string;
    matchedCells: number;
    totalCells: number;
    criterionTotals: number[];
  };
  metricsCaption: string;
  canExportCsv: boolean;
  canMatchCriteria: boolean;
  canFetchAdvancedMetrics: boolean;
}

export type PrCriterionStrength = "strong" | "partial" | "gap";

export interface PrCriteriaHealthEntryViewModel {
  id: PrCriterionId;
  label: string;
  matchedRows: number;
  totalRows: number;
  strength: PrCriterionStrength;
}

export interface PrCriteriaHealthViewModel {
  totalRows: number;
  strongRows: number;
  criteria: PrCriteriaHealthEntryViewModel[];
  systemicGap: { criterionId: PrCriterionId; label: string; missingRows: number } | null;
}

export interface PrEvidenceCsvPreviewViewModel {
  header: string[];
  rows: string[][];
  exportableCountLabel: string;
}

export interface PrEvidenceViewModel {
  sessionId: string;
  campaign: PrCampaignViewModel;
  coreMessages: string[];
  rows: PrEvidenceRowViewModel[];
  ledger: { rows: PrEvidenceRowViewModel[] };
  workingArea: PrEvidenceWorkingAreaViewModel;
  criteriaHealth: PrCriteriaHealthViewModel;
  csvPreview: PrEvidenceCsvPreviewViewModel | null;
  summary: string;
  notice: string;
  uploadError: string;
  exports: {
    csv: PrFileExportDescriptor | null;
    summaryMarkdown: PrFileExportDescriptor | null;
    summaryDocx: PrFileExportDescriptor | null;
  };
  ui: PrEvidenceUiState;
  actions: PrEvidenceCommand[];
}

export interface BuildPrEvidenceViewModelInput {
  sessionId: string;
  resource: PrEvidenceResourceState;
  uiState: PrEvidenceUiState;
}

export const PR_CRITERION_PLACEHOLDERS: Record<PrCriterionId, string> = {
  c1: "活動名稱或品牌",
  c2: "Hashtag 或官方帳號",
  c3: "核心訊息或 tagline",
  c4: "場地 / 地點",
  c5: "體驗主題",
  c6: "CTA / 報名動作"
};

function formatMetric(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}

function metricValue(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metricPresent(value: number | undefined): boolean {
  return metricValue(value) !== null;
}

function buildCollectorDescriptor(row: PrEvidenceRow, views: number | undefined): TargetDescriptor {
  return {
    target_type: "post",
    page_url: row.postUrl,
    post_url: row.postUrl,
    author_hint: row.authorHandle,
    text_snippet: row.caption,
    time_token_hint: "",
    dom_anchor: "",
    engagement: {
      likes: metricValue(row.metrics.likes),
      comments: metricValue(row.metrics.comments),
      reposts: metricValue(row.metrics.reposts),
      forwards: null,
      views: metricValue(views),
      followers: metricValue(row.metrics.followers)
    },
    engagement_present: {
      likes: metricPresent(row.metrics.likes),
      comments: metricPresent(row.metrics.comments),
      reposts: metricPresent(row.metrics.reposts),
      forwards: false,
      views: metricPresent(views),
      followers: metricPresent(row.metrics.followers)
    },
    captured_at: row.collectedAt
  };
}

export function metricLine(row: PrEvidenceRow): string {
  const views = row.metrics.views ?? inferPrViewsFromText(row.caption) ?? undefined;
  return [
    `${formatMetric(row.metrics.likes)} 喜歡`,
    `${formatMetric(row.metrics.comments)} 回覆`,
    `${formatMetric(row.metrics.reposts)} 轉發`,
    views != null ? `${formatMetric(views)} 瀏覽` : "",
    row.metrics.followers != null ? `${formatMetric(row.metrics.followers)} followers` : ""
  ].filter(Boolean).join(" · ");
}

export function summarizeAdvancedMetricsNotice(
  summary: { updated: number; failed: number } | undefined,
  rows: PrEvidenceRow[]
): string {
  const updated = summary?.updated ?? 0;
  const failed = summary?.failed ?? 0;
  const firstError = rows.find((row) => row.advancedMetricsError)?.advancedMetricsError?.trim();
  const firstErrorText = firstError
    ? ` 第一個錯誤：${firstError.slice(0, 160)}`
    : "";
  return `進階指標已更新：${updated} 列${failed ? `，${failed} 列失敗` : ""}.${firstErrorText}`;
}

export function formatPrEvidenceTime(value: string | undefined): string {
  if (!value || value.startsWith("1970-01-01")) {
    return "剛加入";
  }
  return new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function matchedCount(matches: PrCriteriaMatches): number {
  return Object.values(matches).filter(Boolean).length;
}

function safeRows(rows: PrEvidenceRow[] | null | undefined): PrEvidenceRow[] {
  return Array.isArray(rows) ? rows : [];
}

function campaignForExport(campaign: PrCampaignDraft): PrCampaign {
  const fallbackTime = "1970-01-01T00:00:00.000Z";
  return {
    id: campaign.id || "",
    sessionId: campaign.sessionId,
    name: campaign.name,
    briefText: campaign.briefText,
    criteria: normalizePrCriteria(campaign.criteria),
    createdAt: campaign.createdAt || fallbackTime,
    updatedAt: campaign.updatedAt || fallbackTime,
    ...(campaign.lastMatchedAt ? { lastMatchedAt: campaign.lastMatchedAt } : {})
  };
}

function buildCampaignViewModel(sessionId: string, draft: PrCampaignDraft, setupCollapsed: boolean): PrCampaignViewModel {
  const criteria = normalizePrCriteria(draft.criteria);
  const id = draft.id?.trim() || "";
  const saveDraft: PrCampaignSaveDraft = {
    ...(id ? { id } : {}),
    name: draft.name.trim(),
    briefText: draft.briefText,
    criteria
  };
  return {
    id: id || null,
    sessionId,
    name: draft.name,
    briefText: draft.briefText,
    criteria,
    placeholders: PR_CRITERION_PLACEHOLDERS,
    saved: Boolean(id),
    canSave: Boolean(draft.name.trim()),
    setupCollapsed,
    ...(draft.lastMatchedAt ? { lastMatchedAt: draft.lastMatchedAt } : {}),
    savedLabel: id ? "已設定" : "未儲存",
    saveDraft
  };
}

function buildRowViewModel(row: PrEvidenceRow, criteria: PrCriterion[]): PrEvidenceRowViewModel {
  const count = matchedCount(row.criteriaMatches);
  const criterionMatches = PR_CRITERION_IDS.map((id, index) => ({
    id,
    index,
    label: criteria[index]?.label || `C${index + 1}`,
    matched: row.criteriaMatches[id]
  }));
  const views = row.metrics.views ?? inferPrViewsFromText(row.caption) ?? undefined;
  return {
    id: row.id,
    sourceUrl: row.postUrl.trim(),
    sourceLinkAriaLabel: `Open original Threads post by ${row.authorHandle || "unknown author"}`,
    authorLabel: row.authorHandle || "-",
    captionLabel: row.caption || "-",
    metricLine: metricLine(row),
    collectedAtLabel: formatPrEvidenceTime(row.collectedAt),
    matchedCount: count,
    matchCountLabel: `${count} / 6`,
    matchedCriterionLabels: criterionMatches.filter((entry) => entry.matched).map((entry) => entry.label),
    criteria: criterionMatches,
    metrics: [
      { label: "喜歡", value: formatMetric(row.metrics.likes), advanced: false },
      { label: "回覆", value: formatMetric(row.metrics.comments), advanced: false },
      { label: "轉發", value: formatMetric(row.metrics.reposts), advanced: true },
      { label: "瀏覽", value: formatMetric(views), advanced: true },
      { label: "followers", value: formatMetric(row.metrics.followers), advanced: true }
    ],
    collectorDescriptor: buildCollectorDescriptor(row, views),
    advancedMetricsError: row.advancedMetricsError || ""
  };
}

function classifyCriterionStrength(matchedRows: number, totalRows: number): PrCriterionStrength {
  if (totalRows <= 0 || matchedRows <= 0) {
    return "gap";
  }
  return matchedRows / totalRows >= 0.6 ? "strong" : "partial";
}

/** A caption counts as "strong" once it matches at least this many of the six criteria. */
export const PR_STRONG_MATCH_THRESHOLD = 4;

function buildCriteriaHealth(
  criteria: PrCriterion[],
  criterionTotals: number[],
  totalRows: number,
  strongRows: number
): PrCriteriaHealthViewModel {
  const entries: PrCriteriaHealthEntryViewModel[] = criteria.map((criterion, index) => {
    const matchedRows = criterionTotals[index] ?? 0;
    return {
      id: criterion.id,
      label: criterion.label || `C${index + 1}`,
      matchedRows,
      totalRows,
      strength: classifyCriterionStrength(matchedRows, totalRows)
    };
  });
  const systemicGap = totalRows > 0
    ? entries
      .filter((entry) => entry.matchedRows === 0)
      .map((entry) => ({ criterionId: entry.id, label: entry.label, missingRows: entry.totalRows - entry.matchedRows }))
      .sort((a, b) => b.missingRows - a.missingRows)[0] ?? null
    : null;
  return { totalRows, strongRows, criteria: entries, systemicGap };
}

function buildCsvPreview(campaign: PrCampaignDraft, rows: PrEvidenceRow[]): PrEvidenceCsvPreviewViewModel | null {
  if (!rows.length) {
    return null;
  }
  const [header = [], ...body] = buildPrEvidenceCsvRows(campaignForExport(campaign), rows, 20);
  return {
    header,
    rows: body.slice(0, 20),
    exportableCountLabel: `header + 前 20 列 · ${rows.length} 列可匯出`
  };
}

function buildActions({
  sessionId,
  campaign,
  rows,
  summary,
  csv
}: {
  sessionId: string;
  campaign: PrCampaignViewModel;
  rows: PrEvidenceRow[];
  summary: string;
  csv: PrFileExportDescriptor | null;
}): PrEvidenceCommand[] {
  const actions: PrEvidenceCommand[] = [];
  if (campaign.canSave) {
    actions.push({ kind: "saveCampaign", target: { sessionId }, draft: campaign.saveDraft });
  }
  actions.push({ kind: "generateCriteria", target: { sessionId }, campaignName: campaign.name, briefText: campaign.briefText });
  if (!campaign.id) {
    return actions;
  }
  if (rows.length) {
    actions.push(
      { kind: "matchCriteria", target: { sessionId, campaignId: campaign.id } },
      { kind: "fetchAdvancedMetrics", target: { sessionId, campaignId: campaign.id } },
      { kind: "generateSummary", target: { sessionId, campaignId: campaign.id } }
    );
  }
  if (csv) {
    actions.push({ kind: "exportCsv", target: { sessionId, campaignId: campaign.id }, file: csv });
  }
  if (summary.trim()) {
    actions.push(
      { kind: "exportSummaryMarkdown", target: { sessionId, campaignId: campaign.id }, file: buildPrSummaryMarkdownExport(summary, campaign.name) },
      { kind: "exportSummaryDocx", target: { sessionId, campaignId: campaign.id }, file: buildPrSummaryDocxExport(summary, campaign.name) }
    );
  }
  return actions;
}

export function buildPrEvidenceViewModel({ sessionId, resource, uiState }: BuildPrEvidenceViewModelInput): PrEvidenceViewModel {
  const rows = safeRows(resource.rows);
  const campaign = buildCampaignViewModel(sessionId, resource.campaign, resource.setupCollapsed);
  const rowViewModels = rows.map((row) => buildRowViewModel(row, campaign.criteria));
  const criterionTotals = campaign.criteria.map((criterion) =>
    rows.reduce((total, row) => total + (row.criteriaMatches[criterion.id] ? 1 : 0), 0)
  );
  const matchedCells = rows.reduce((total, row) => total + matchedCount(row.criteriaMatches), 0);
  const totalCells = rows.length * 6;
  const strongRows = rowViewModels.filter((row) => row.matchedCount >= PR_STRONG_MATCH_THRESHOLD).length;
  const criteriaHealth = buildCriteriaHealth(campaign.criteria, criterionTotals, rows.length, strongRows);
  const csvPreview = buildCsvPreview(resource.campaign, rows);
  const csv = campaign.id && rows.length
    ? {
      content: buildPrEvidenceCsv(campaignForExport(resource.campaign), rows),
      filename: `${sanitizePrFileBase(campaign.name || "pr-evidence", "pr-evidence")}-evidence.csv`,
      mime: "text/csv;charset=utf-8"
    }
    : null;
  const workingArea: PrEvidenceWorkingAreaViewModel = {
    activePane: uiState.activePane,
    tabs: [],
    ledgerCaption: `${rows.length} 列 · 點擊查看${campaign.lastMatchedAt ? ` · 已判斷 ${formatPrEvidenceTime(campaign.lastMatchedAt)}` : ""}`,
    match: {
      caption: `約 ${Math.max(0, Math.ceil(rows.length / 25))} 次 AI call · ${totalCells} 格`,
      matchedCells,
      totalCells,
      criterionTotals
    },
    metricsCaption: "likes · replies · reposts · views · followers",
    canExportCsv: Boolean(campaign.id),
    canMatchCriteria: Boolean(rows.length && campaign.id && !uiState.isMatching),
    canFetchAdvancedMetrics: Boolean(rows.length && campaign.id && !uiState.isFetchingAdvancedMetrics)
  };
  return {
    sessionId,
    campaign,
    coreMessages: extractPrCoreMessages(resource.campaign.briefText),
    rows: rowViewModels,
    ledger: { rows: rowViewModels },
    workingArea,
    criteriaHealth,
    csvPreview,
    summary: resource.summary,
    notice: resource.notice,
    uploadError: resource.uploadError,
    exports: {
      csv,
      summaryMarkdown: campaign.id && resource.summary.trim() ? buildPrSummaryMarkdownExport(resource.summary, campaign.name) : null,
      summaryDocx: campaign.id && resource.summary.trim() ? buildPrSummaryDocxExport(resource.summary, campaign.name) : null
    },
    ui: uiState,
    actions: buildActions({ sessionId, campaign, rows, summary: resource.summary, csv })
  };
}
