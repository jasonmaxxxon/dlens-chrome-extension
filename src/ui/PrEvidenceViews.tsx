import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

import { buildPrEvidenceCsv, buildPrEvidenceCsvRows, extractPrCoreMessages, inferPrViewsFromText } from "../compare/pr-evidence.ts";
import type { ExtensionResponse } from "../state/messages.ts";
import type { PrCampaign, PrCriterion, PrCriterionId, PrEvidenceRow } from "../state/pr-evidence-storage.ts";
import { normalizePrCriteria, PR_CRITERION_IDS } from "../state/pr-evidence-storage.ts";
import { sendExtensionMessage } from "./controller.tsx";
import {
  Kicker,
  ModeHeader,
  PrimaryButton,
  SCAN_ROW_HOVER_CSS,
  SecondaryButton,
  SegmentedTabs,
  Stamp,
  WorkspaceSurface,
  viewRootStyle,
  type SegmentedTabItem
} from "./components.tsx";
import { readPrBriefFile } from "./pr-brief-upload.ts";
import { exportPrSummaryDocx, exportPrSummaryMarkdown } from "./pr-summary-export.ts";
import { tokens } from "./tokens.ts";

type PrResponse = ExtensionResponse & {
  prCampaigns?: PrCampaign[];
  prEvidenceRows?: PrEvidenceRow[];
  prAdvancedMetricsSummary?: {
    updated: number;
    failed: number;
  };
  prCriteria?: PrCriterion[];
  prSummary?: string;
};

const CRITERION_PLACEHOLDERS: Record<PrCriterionId, string> = {
  c1: "Campaign name or identity",
  c2: "#Hashtag or handle",
  c3: "Core message or tagline",
  c4: "Venue / location",
  c5: "Experience theme",
  c6: "CTA / ticket / action"
};

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function createDraftCampaign(sessionId: string): PrCampaign {
  const now = new Date().toISOString();
  return {
    id: createId("prcampaign"),
    sessionId,
    name: "",
    briefText: "",
    criteria: normalizePrCriteria([]),
    createdAt: now,
    updatedAt: now
  };
}

function matchedCount(row: PrEvidenceRow): number {
  return Object.values(row.criteriaMatches).filter(Boolean).length;
}

function formatMetric(value: number | undefined): string {
  if (typeof value !== "number") {
    return "-";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}

function metricLine(row: PrEvidenceRow): string {
  const views = row.metrics.views ?? inferPrViewsFromText(row.caption) ?? undefined;
  return [
    `${formatMetric(row.metrics.likes)} likes`,
    `${formatMetric(row.metrics.comments)} replies`,
    `${formatMetric(row.metrics.reposts)} reposts`,
    views != null ? `${formatMetric(views)} views` : "",
    row.metrics.followers != null ? `${formatMetric(row.metrics.followers)} followers` : ""
  ].filter(Boolean).join(" · ");
}

function summarizeAdvancedMetricsNotice(
  summary: { updated: number; failed: number } | undefined,
  rows: PrEvidenceRow[]
): string {
  const updated = summary?.updated ?? 0;
  const failed = summary?.failed ?? 0;
  const firstError = rows.find((row) => row.advancedMetricsError)?.advancedMetricsError?.trim();
  const firstErrorText = firstError
    ? ` First error: ${firstError.slice(0, 160)}`
    : "";
  return `Advanced metrics updated: ${updated} rows${failed ? `, ${failed} failed` : ""}.${firstErrorText}`;
}

function formatTime(value: string): string {
  if (!value || value.startsWith("1970-01-01")) {
    return "剛加入";
  }
  return new Intl.DateTimeFormat("zh-HK", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function csvPreviewRows(campaign: PrCampaign, rows: PrEvidenceRow[]): string[][] {
  return buildPrEvidenceCsvRows(campaign, rows, 20);
}

const accentButtonStyle = {
  borderColor: "var(--dlens-mode-accent)",
  background: "var(--dlens-mode-accent-soft)",
  color: "var(--dlens-mode-accent)",
  fontWeight: 700
} as const;

const compactButtonStyle = {
  padding: "6px 10px",
  fontSize: 11
} as const;

const exportButtonStyle = {
  borderColor: "rgba(63,90,59,0.34)",
  background: tokens.color.successSoft,
  color: tokens.color.success,
  fontWeight: 700
} as const;

const PR_RADIUS = tokens.radius.card;
const PR_RULE = tokens.color.line;
const PR_ACCENT = "var(--dlens-mode-accent)";
const PR_MOSS = tokens.color.success;

/* ── Notice bar: success/error tones ────────────────────────────────── */

function NoticeBar({ notice }: { notice: string }) {
  if (!notice) return null;
  const isError = /error|fail|invalid|cannot|save a campaign/i.test(notice);
  return (
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.55,
        padding: "8px 10px",
        borderRadius: PR_RADIUS,
        background: isError ? tokens.color.failedSoft : tokens.color.successSoft,
        color: isError ? tokens.color.failed : tokens.color.success,
        transition: tokens.motion.interactiveTransition
      }}
    >
      {notice}
    </div>
  );
}

const CAMPAIGN_EDITOR_CSS = `
[data-pr-field]:focus {
  border-color: var(--dlens-mode-accent) !important;
  box-shadow: 0 0 0 2.5px var(--dlens-mode-accent-soft) !important;
  outline: none !important;
}
[data-pr-section] + [data-pr-section] {
  border-top: 1px solid var(--dlens-line, rgba(27,26,23,0.10));
  padding-top: 14px;
}
`;

function parseCoreMessage(raw: string): { label: string | null; value: string } {
  const idx = raw.indexOf(": ");
  if (idx > 0 && idx < 40) {
    return { label: raw.slice(0, idx), value: raw.slice(idx + 2) };
  }
  return { label: null, value: raw };
}

function CampaignEditor({
  campaign,
  onChange,
  onSave,
  onGenerateCriteria,
  onUploadBrief,
  isSaving,
  isReadingBrief,
  isGenerating,
  uploadError,
  coreMessages,
  collapsed,
  onExpand,
  onCollapse
}: {
  campaign: PrCampaign;
  onChange: (campaign: PrCampaign) => void;
  onSave: () => void;
  onGenerateCriteria: () => void;
  onUploadBrief: (file: File) => void;
  isSaving: boolean;
  isReadingBrief: boolean;
  isGenerating: boolean;
  uploadError: string;
  coreMessages: string[];
  collapsed?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [briefExpanded, setBriefExpanded] = useState(true);
  const hasAutoCollapsed = useRef(false);
  const prevIsReadingBrief = useRef(isReadingBrief);

  /* Collapse once on initial load when brief already has content */
  useEffect(() => {
    if (!hasAutoCollapsed.current && campaign.briefText.trim()) {
      hasAutoCollapsed.current = true;
      setBriefExpanded(false);
    }
  }, [campaign.briefText]);

  /* Auto-collapse after PDF upload finishes */
  useEffect(() => {
    if (prevIsReadingBrief.current && !isReadingBrief && campaign.briefText.trim()) {
      setBriefExpanded(false);
    }
    prevIsReadingBrief.current = isReadingBrief;
  }, [isReadingBrief, campaign.briefText]);

  function updateCriterion(index: number, label: string) {
    const criteria = campaign.criteria.map((criterion, currentIndex) =>
      currentIndex === index ? { ...criterion, label } : criterion
    ) as PrCampaign["criteria"];
    onChange({ ...campaign, criteria, updatedAt: new Date().toISOString() });
  }

  const parsedMessages = coreMessages.slice(0, 5).map(parseCoreMessage);
  const briefPreview = campaign.briefText.split("\n").find((l) => l.trim()) ?? "";
  const fieldLabelStyle = {
    fontFamily: tokens.font.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0,
    color: tokens.color.subInk
  } as const;
  const inputLineStyle = {
    width: "100%",
    fontFamily: tokens.font.sans,
    fontSize: 12,
    fontWeight: 400,
    padding: "9px 10px",
    background: tokens.color.surface,
    border: `1px solid ${PR_RULE}`,
    borderRadius: tokens.radius.card,
    color: tokens.color.ink,
    outline: "none",
    margin: 0,
    transition: tokens.motion.interactiveTransitionFast
  } as const;
  const criteriaInputLineStyle = {
    ...inputLineStyle,
    fontSize: 12
  } as const;

  /* ── Collapsed summary row ───────────────────────────────────────── */
  if (collapsed) {
    return (
      <div
        data-pr-campaign-setup="true"
        data-pr-campaign-summary="editorial"
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.spacing.md,
          padding: `${tokens.spacing.sm}px 0`,
          borderBottom: `1px dashed ${PR_RULE}`,
          borderRadius: PR_RADIUS
        }}
      >
        <span style={{ ...fieldLabelStyle, flex: "0 0 96px" }}>Campaign</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tokens.color.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {campaign.name || "Unnamed campaign"}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: PR_MOSS, fontSize: 12, fontWeight: 600 }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: PR_MOSS }} />
          Ready
        </span>
        <SecondaryButton onClick={() => onExpand?.()} style={compactButtonStyle}>
          Edit setup
        </SecondaryButton>
      </div>
    );
  }

  return (
    <section
      data-pr-campaign-setup="true"
      data-pr-campaign-form="editorial"
      style={{
        display: "grid",
        gap: tokens.spacing.md,
        padding: `0 0 ${tokens.spacing.section}px`,
        borderBottom: `1px dashed ${PR_RULE}`,
        borderRadius: PR_RADIUS
      }}
    >
      <style>{CAMPAIGN_EDITOR_CSS}</style>

        {/* ── Campaign name ─────────────────────────────────────────── */}
        <div data-pr-section="name">
          <label style={{ display: "grid", gap: 6 }}>
            <span style={fieldLabelStyle}>
              Campaign name
            </span>
            <input
              data-pr-field="name"
              value={campaign.name}
              onChange={(event) => onChange({ ...campaign, name: event.target.value, updatedAt: new Date().toISOString() })}
              placeholder="Mannings BoostUP Wellness Carnival"
              style={inputLineStyle}
            />
          </label>
        </div>

        {/* ── PR brief (collapsible) ────────────────────────────────── */}
        <div data-pr-section="brief" style={{ display: "grid", gap: 8 }}>

          {/* Header row — always visible */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={fieldLabelStyle}>
              PR brief
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {/* Upload — always available */}
              <SecondaryButton
                onClick={() => {
                  setBriefExpanded(true);
                  fileInputRef.current?.click();
                }}
                disabled={isReadingBrief || isGenerating}
                style={{ ...accentButtonStyle, ...compactButtonStyle, whiteSpace: "nowrap" }}
              >
                {isReadingBrief ? "Reading..." : "Upload PDF"}
              </SecondaryButton>
              {/* Edit / Done toggle — only when brief has content */}
              {campaign.briefText.trim() ? (
                <SecondaryButton
                  onClick={() => setBriefExpanded((v) => !v)}
                  style={compactButtonStyle}
                >
                  {briefExpanded ? "Done" : "Edit"}
                </SecondaryButton>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown,.text,application/pdf,text/plain,text/markdown"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUploadBrief(file);
                event.target.value = "";
              }}
            />
          </div>

          {/* Collapsed: one-line preview + char count */}
          {!briefExpanded && campaign.briefText.trim() ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: PR_RADIUS,
                border: `1px solid ${PR_RULE}`,
                background: tokens.color.surface,
                cursor: "default"
              }}
            >
              <div
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: tokens.color.softInk,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis"
                }}
              >
                {briefPreview}
              </div>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 10,
                  fontWeight: 700,
                  color: tokens.color.softInk,
                  background: tokens.color.neutralSurface,
                  padding: "2px 7px",
                  borderRadius: 999
                }}
              >
                {campaign.briefText.length} chars
              </span>
            </div>
          ) : null}

          {/* Expanded: full textarea */}
          {briefExpanded ? (
            <>
              <textarea
                id="pr-brief-text"
                data-pr-field="brief"
                value={campaign.briefText}
                onChange={(event) => onChange({ ...campaign, briefText: event.target.value, updatedAt: new Date().toISOString() })}
                placeholder="Paste the press release, message house, or PR guideline — or upload a PDF."
                rows={4}
                style={{
                  width: "100%",
                  fontFamily: tokens.font.sans,
                  fontSize: 13,
                  lineHeight: 1.55,
                  padding: "12px 14px",
                  background: tokens.color.neutralSurfaceSoft,
                  border: `1px solid ${PR_RULE}`,
                  color: tokens.color.subInk,
                  outline: "none",
                  resize: "vertical",
                  minHeight: 88,
                  borderRadius: PR_RADIUS
                }}
              />
              {uploadError ? (
                <div data-pr-upload-error="true" style={{ fontSize: 11, color: tokens.color.failed }}>
                  {uploadError}
                </div>
              ) : null}
            </>
          ) : null}

          {/* Parsed PR messages — always visible when available */}
          {parsedMessages.length ? (
            <div
              data-pr-core-messages="true"
              style={{
                borderRadius: PR_RADIUS,
                border: `1px solid ${PR_RULE}`,
                background: tokens.color.contextSurface,
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 10px",
                  borderBottom: `1px solid ${tokens.color.line}`,
                  background: "rgba(122,32,48,0.04)"
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--dlens-mode-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" />
                </svg>
                <Kicker tone="accent">Detected core PR messages</Kicker>
              </div>
              <div style={{ display: "grid" }}>
                {parsedMessages.map(({ label, value }, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: label ? "minmax(0, 130px) minmax(0, 1fr)" : "1fr",
                      gap: 8,
                      alignItems: "start",
                      padding: "7px 10px",
                      borderBottom: i < parsedMessages.length - 1 ? `1px solid ${tokens.color.line}` : "none"
                    }}
                  >
                    {label ? (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--dlens-mode-accent)",
                          background: "var(--dlens-mode-accent-soft)",
                          padding: "2px 7px",
                          borderRadius: 999,
                          display: "inline-flex",
                          alignItems: "center",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "100%",
                          letterSpacing: 0
                        }}
                      >
                        {label}
                      </span>
                    ) : null}
                    <span
                      style={{
                        fontSize: 11,
                        lineHeight: 1.55,
                        color: tokens.color.subInk,
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 2,
                        overflow: "hidden"
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* ── PR matching criteria ──────────────────────────────────── */}
        <div data-pr-section="criteria" style={{ display: "grid", gap: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <span style={fieldLabelStyle}>
              PR matching criteria
            </span>
            <SecondaryButton onClick={onGenerateCriteria} disabled={isReadingBrief || isGenerating} style={{ ...accentButtonStyle, ...compactButtonStyle }}>
              {isGenerating ? "Generating..." : "Generate criteria"}
            </SecondaryButton>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: `${tokens.spacing.sm}px ${tokens.spacing.md}px` }}>
            {campaign.criteria.map((criterion, index) => (
              <div key={criterion.id} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: tokens.font.mono, fontSize: 10, color: tokens.color.softInk, flex: "0 0 18px", letterSpacing: "0.04em" }}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <input
                  data-pr-field={`criterion-${index}`}
                  value={criterion.label}
                  onChange={(event) => updateCriterion(index, event.target.value)}
                  placeholder={CRITERION_PLACEHOLDERS[criterion.id]}
                  style={criteriaInputLineStyle}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Save ─────────────────────────────────────────────────── */}
        <div data-pr-section="save" style={{ paddingTop: 4, display: "flex", gap: 8, alignItems: "center" }}>
          <PrimaryButton onClick={onSave} disabled={isSaving || !campaign.name.trim()} style={compactButtonStyle}>
            {isSaving ? "Saving..." : "Save campaign"}
          </PrimaryButton>
          <SecondaryButton onClick={() => onCollapse?.()} style={compactButtonStyle}>
            Cancel
          </SecondaryButton>
          <span style={{ marginLeft: "auto", fontFamily: tokens.font.mono, fontSize: 10.5, color: tokens.color.softInk }}>
            Auto-saves after Save
          </span>
        </div>
    </section>
  );
}

function EvidenceLedger({ rows, criteria = [] }: { rows: PrEvidenceRow[]; criteria?: PrCriterion[] }) {
  return (
    <section data-pr-evidence-ledger="compact" style={{ display: "grid", minWidth: 0 }}>
      <style>{SCAN_ROW_HOVER_CSS}</style>
      {rows.length ? (
        <div data-scan-list="pr-evidence" style={{ display: "grid", borderTop: `1px solid ${PR_RULE}` }}>
          {rows.map((row) => (
            <div
              key={row.id}
              data-pr-evidence-row="compact"
              data-scan-row="true"
              style={{
                display: "grid",
                gridTemplateColumns: "28px minmax(96px, 124px) minmax(0, 1fr) minmax(82px, 92px) minmax(62px, 78px) 56px",
                alignItems: "center",
                gap: 14,
                padding: "12px 4px",
                borderBottom: `1px solid ${PR_RULE}`,
                background: "transparent",
                cursor: "default",
                transition: tokens.motion.interactiveTransitionFast
              }}
            >
              <SourceLinkIcon row={row} />
              <div style={{ fontFamily: tokens.font.mono, fontSize: 12, color: tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.authorHandle || "-"}</div>
              <div style={{ fontSize: 13, color: tokens.color.subInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.caption || "-"}</div>
              <div style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.softInk, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{metricLine(row)}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", overflow: "hidden" }}>
                <CriterionChips row={row} criteria={criteria} variant="compact" />
              </div>
              <div style={{ fontFamily: tokens.font.mono, fontSize: 10.5, color: tokens.color.softInk, textAlign: "right", minWidth: 56 }}>{formatTime(row.collectedAt)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "16px 12px", borderRadius: PR_RADIUS, border: `1px solid ${PR_RULE}`, background: tokens.color.surface, fontSize: 12, color: tokens.color.subInk }}>
          尚未收集 evidence rows。先到 Collect 保存已打開的 Threads posts。
        </div>
      )}
    </section>
  );
}

function SourceLinkIcon({ row }: { row: PrEvidenceRow }) {
  const href = row.postUrl.trim();
  const baseStyle = {
    width: 24,
    height: 24,
    borderRadius: 999,
    background: `linear-gradient(135deg, ${tokens.color.neutralSurfaceSoft}, ${tokens.color.neutralSurface})`,
    border: `1px solid ${PR_RULE}`,
    color: href ? PR_ACCENT : tokens.color.softInk,
    display: "inline-grid",
    placeItems: "center",
    textDecoration: "none",
    opacity: href ? 1 : 0.42,
    transition: tokens.motion.interactiveTransitionFast
  } as const;

  if (!href) {
    return <span data-pr-evidence-source-link="missing" aria-hidden style={baseStyle} />;
  }

  return (
    <a
      data-pr-evidence-source-link="true"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open original Threads post by ${row.authorHandle || "unknown author"}`}
      title="Open original Threads post"
      onClick={(event) => event.stopPropagation()}
      style={baseStyle}
    >
      <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
    </a>
  );
}

type PrWorkPane = "ledger" | "match" | "metrics";

function CriterionChips({
  row,
  criteria,
  variant
}: {
  row: PrEvidenceRow;
  criteria: PrCriterion[];
  variant: "full" | "compact";
}) {
  const matchedTotal = matchedCount(row);

  if (variant === "compact") {
    if (matchedTotal === 0) {
      return (
        <span
          aria-label="No criteria matched yet"
          style={{
            fontFamily: tokens.font.mono,
            fontSize: 11,
            color: tokens.color.softInk,
            fontVariantNumeric: "tabular-nums"
          }}
        >
          0 / 6
        </span>
      );
    }
    const matchedIds = PR_CRITERION_IDS
      .map((id, index) => ({ id, index, matched: row.criteriaMatches[id] }))
      .filter((entry) => entry.matched);
    return (
      <span
        aria-label={`${matchedTotal} of 6 criteria matched`}
        title={matchedIds.map(({ index }) => criteria[index]?.label || `C${index + 1}`).join(" · ")}
        style={{
          display: "inline-flex",
          gap: 5,
          flexWrap: "nowrap",
          overflow: "hidden",
          fontFamily: tokens.font.mono,
          fontSize: 10.5,
          fontWeight: 700,
          color: matchedTotal >= 5 ? PR_MOSS : PR_ACCENT,
          fontVariantNumeric: "tabular-nums",
          justifyContent: "flex-end"
        }}
      >
        {matchedIds.map(({ id, index }) => (
          <span key={id}>C{index + 1}</span>
        ))}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, paddingLeft: 2 }}>
      {PR_CRITERION_IDS.map((id, index) => {
        const criterion = criteria[index];
        const matched = row.criteriaMatches[id];
        return (
          <span
            key={id}
            title={criterion?.label || id}
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 3,
              color: matched ? PR_MOSS : tokens.color.softInk,
              fontFamily: tokens.font.mono,
              fontSize: 10.5,
              fontWeight: matched ? 700 : 400,
              opacity: matched ? 1 : 0.7
            }}
          >
            C{index + 1}
            <span aria-hidden>{matched ? "✓" : "·"}</span>
          </span>
        );
      })}
    </div>
  );
}

function criterionTotals(campaign: PrCampaign, rows: PrEvidenceRow[]): number[] {
  return campaign.criteria.map((criterion) =>
    rows.reduce((total, row) => total + (row.criteriaMatches[criterion.id] ? 1 : 0), 0)
  );
}

function PrWorkingArea({
  campaign,
  rows,
  activePane,
  onPaneChange,
  onMatchCriteria,
  onFetchAdvancedMetrics,
  onExportCsv,
  isMatching,
  isFetchingAdvancedMetrics,
  savedCampaignReady,
  lastMatchedAt
}: {
  campaign: PrCampaign;
  rows: PrEvidenceRow[];
  activePane: PrWorkPane;
  onPaneChange: (pane: PrWorkPane) => void;
  onMatchCriteria: () => void;
  onFetchAdvancedMetrics: () => void;
  onExportCsv: () => void;
  isMatching: boolean;
  isFetchingAdvancedMetrics: boolean;
  savedCampaignReady: boolean;
  lastMatchedAt?: string;
}) {
  const totals = criterionTotals(campaign, rows);
  const matchedCells = rows.reduce((total, row) => total + matchedCount(row), 0);
  const totalCells = rows.length * 6;
  const hasFetchedMetrics = rows.some((row) => row.advancedMetricsFetchedAt);
  const tabs: ReadonlyArray<SegmentedTabItem<PrWorkPane>> = [
    { id: "ledger", label: "Ledger", count: String(rows.length), tone: rows.length ? "accent" : "neutral" },
    { id: "match", label: "Match criteria", count: `${matchedCells}/${totalCells}`, tone: matchedCells ? "success" : "neutral" },
    { id: "metrics", label: "Fetch metrics", count: hasFetchedMetrics ? "done" : "—", tone: hasFetchedMetrics ? "success" : "neutral" }
  ];

  const paneStyle = (pane: PrWorkPane) => ({
    display: activePane === pane ? "block" : "none"
  });

  return (
    <section data-pr-working-area="true" data-pr-actions="true" style={{ display: "grid", gap: tokens.spacing.md, marginBottom: tokens.spacing.lg, minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: tokens.spacing.sm,
          borderBottom: `1px solid ${PR_RULE}`,
          flexWrap: "wrap"
        }}
      >
        <SegmentedTabs
          tabs={tabs}
          activeId={activePane}
          onChange={onPaneChange}
          ariaLabel="PR working area panes"
          dataAttr={(id) => ({ "data-pr-work-tab": id })}
        />
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", paddingBottom: 6 }}>
          <PrimaryButton onClick={onExportCsv} disabled={!savedCampaignReady} style={compactButtonStyle}>
            Export CSV
          </PrimaryButton>
        </div>
      </div>

      <div style={paneStyle("ledger")}>
        <PaneHeader
          title="Saved posts"
          caption={`${rows.length} rows · click to inspect${lastMatchedAt ? ` · matched ${formatTime(lastMatchedAt)}` : ""}`}
        />
        <EvidenceLedger rows={rows} criteria={campaign.criteria} />
      </div>

      <div style={paneStyle("match")}>
        <PaneHeader
          title="Score each post against 6 criteria"
          caption={`~${Math.max(0, Math.ceil(rows.length / 25))} AI calls · ${totalCells} cells`}
          action={
            <PrimaryButton
              onClick={onMatchCriteria}
              disabled={!rows.length || isMatching || !savedCampaignReady}
              style={compactButtonStyle}
            >
              {isMatching ? "Matching..." : "Match criteria"}
            </PrimaryButton>
          }
        />
        <div data-pr-match-list="wrap" style={{ display: "grid", borderTop: `1px solid ${PR_RULE}` }}>
          {rows.length ? rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: "grid",
                gap: 6,
                padding: "11px 4px",
                borderBottom: `1px solid ${PR_RULE}`
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
                <span style={{ fontFamily: tokens.font.mono, fontSize: 11.5, color: tokens.color.ink, fontWeight: 500, flex: "0 0 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 124 }}>
                  {row.authorHandle || "-"}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: tokens.color.subInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.caption || "-"}
                </span>
                <span style={{ fontFamily: tokens.font.mono, fontSize: 11, fontWeight: 700, color: matchedCount(row) >= 5 ? PR_MOSS : matchedCount(row) > 0 ? PR_ACCENT : tokens.color.softInk, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {matchedCount(row)} / 6
                </span>
              </div>
              <CriterionChips row={row} criteria={campaign.criteria} variant="full" />
            </div>
          )) : (
            <div style={{ padding: "16px 8px", fontSize: 12, color: tokens.color.subInk }}>Collect posts before matching criteria.</div>
          )}
          {rows.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", padding: "10px 4px", borderTop: `1px solid ${PR_RULE}` }}>
              <span style={{ fontFamily: tokens.font.mono, fontSize: 9.5, color: tokens.color.softInk, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
                Σ per criterion
              </span>
              {totals.map((total, index) => (
                <span
                  key={index}
                  style={{
                    fontFamily: tokens.font.mono,
                    fontSize: 10.5,
                    color: total > 0 ? tokens.color.ink : tokens.color.softInk,
                    fontWeight: total > 0 ? 700 : 400
                  }}
                >
                  C{index + 1}:{total}
                </span>
              ))}
              <span style={{ marginLeft: "auto", fontFamily: tokens.font.mono, fontSize: 11, fontWeight: 700, color: matchedCells ? PR_MOSS : tokens.color.softInk }}>
                {matchedCells} / {totalCells}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div style={paneStyle("metrics")}>
        <PaneHeader
          title="Advanced metrics"
          caption="likes · replies · reposts · views · followers"
          action={
            <span data-pr-metrics-action="toolbar" title="Fetch advanced metrics" style={{ display: "inline-flex" }}>
              <PrimaryButton
                onClick={onFetchAdvancedMetrics}
                disabled={!rows.length || isFetchingAdvancedMetrics || !savedCampaignReady}
                style={compactButtonStyle}
              >
                {isFetchingAdvancedMetrics ? "Fetching..." : "Fetch advanced metrics"}
              </PrimaryButton>
            </span>
          }
        />
        <AdvancedMetricsPanel rows={rows} />
      </div>
    </section>
  );
}

function PaneHeader({ title, caption, action }: { title: string; caption?: string; action?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        marginBottom: 12,
        flexWrap: "wrap"
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 16, color: tokens.color.ink, fontWeight: 700, lineHeight: 1.3 }}>
          {title}
        </span>
        {caption ? (
          <span style={{ fontFamily: tokens.font.mono, fontSize: 10.5, color: tokens.color.softInk, letterSpacing: "0.04em" }}>
            {caption}
          </span>
        ) : null}
      </div>
      {action ? (
        <>
          <span style={{ flex: 1 }} />
          {action}
        </>
      ) : null}
    </div>
  );
}

function MetricCell({ label, value, advanced = false }: { label: string; value: string; advanced?: boolean }) {
  const valuePresent = value !== "-";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 4,
        fontFamily: tokens.font.mono,
        fontSize: 11,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums"
      }}
    >
      <span style={{ color: tokens.color.softInk, fontWeight: 500 }}>{label}</span>
      <span style={{ color: !valuePresent ? tokens.color.softInk : advanced ? PR_ACCENT : tokens.color.ink, fontWeight: valuePresent ? 700 : 400 }}>
        {value}
      </span>
    </span>
  );
}

function AdvancedMetricsPanel({ rows }: { rows: PrEvidenceRow[] }) {
  return (
    <section data-pr-metrics-list="wrap" style={{ display: "grid", minWidth: 0 }}>
      {rows.length ? (
        <div data-scan-list="pr-metrics" style={{ display: "grid", borderTop: `1px solid ${PR_RULE}` }}>
          <style>{SCAN_ROW_HOVER_CSS}</style>
          {rows.map((row) => {
            const views = row.metrics.views ?? inferPrViewsFromText(row.caption) ?? undefined;
            return (
              <div
                key={row.id}
                data-scan-row="true"
                style={{
                  display: "grid",
                  gap: 6,
                  padding: "12px 4px",
                  borderBottom: `1px solid ${PR_RULE}`
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span aria-hidden style={{ width: 22, height: 22, borderRadius: 999, background: `linear-gradient(135deg, ${tokens.color.neutralSurfaceSoft}, ${tokens.color.neutralSurface})`, border: `1px solid ${PR_RULE}`, flexShrink: 0 }} />
                  <div style={{ fontFamily: tokens.font.mono, fontSize: 11.5, color: tokens.color.ink, fontWeight: 500, flexShrink: 0, maxWidth: 124, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.authorHandle || "-"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: tokens.color.subInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.caption || "-"}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", columnGap: 16, rowGap: 4, paddingLeft: 32 }}>
                  <MetricCell label="likes" value={formatMetric(row.metrics.likes)} />
                  <MetricCell label="replies" value={formatMetric(row.metrics.comments)} />
                  <MetricCell label="reposts" value={formatMetric(row.metrics.reposts)} advanced />
                  <MetricCell label="views" value={formatMetric(views)} advanced />
                  <MetricCell label="followers" value={formatMetric(row.metrics.followers)} advanced />
                </div>
                {row.advancedMetricsError ? (
                  <div style={{ fontSize: 11, lineHeight: 1.45, color: tokens.color.failed, paddingLeft: 32 }}>
                    {row.advancedMetricsError}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: "16px 12px", borderRadius: PR_RADIUS, border: `1px solid ${PR_RULE}`, background: tokens.color.surface, fontSize: 12, color: tokens.color.subInk }}>
          Collect posts before fetching advanced metrics.
        </div>
      )}
    </section>
  );
}

function CsvPreview({ campaign, rows }: { campaign: PrCampaign; rows: PrEvidenceRow[] }) {
  const preview = csvPreviewRows(campaign, rows);
  const [header, ...body] = preview;
  return (
    <details data-pr-csv-preview="true" style={{ marginTop: 4, borderTop: `1px solid ${PR_RULE}`, paddingTop: 18, borderRadius: PR_RADIUS }}>
      <summary style={{ listStyle: "none", cursor: "pointer", display: "flex", alignItems: "baseline", gap: 8, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 16, fontWeight: 600, color: tokens.color.ink }}>
        <span style={{ fontSize: 11, color: tokens.color.softInk }}>▸</span>
        CSV preview
        <span style={{ marginLeft: "auto", fontFamily: tokens.font.mono, fontSize: 10.5, color: tokens.color.softInk, fontWeight: 400 }}>
          header + first 20 rows · {rows.length} rows ready
        </span>
      </summary>
      <div
        data-pr-csv-preview-layout="wrap"
        style={{
          marginTop: 14,
          display: "grid",
          gap: 8,
          border: `1px solid ${PR_RULE}`,
          borderRadius: PR_RADIUS,
          background: tokens.color.surface,
          overflow: "hidden"
        }}
      >
        {body.slice(0, 20).length ? body.slice(0, 20).map((line, rowIndex) => (
          <article
            key={rowIndex}
            style={{
              display: "grid",
              gap: 8,
              padding: "10px 12px",
              borderBottom: rowIndex < Math.min(body.length, 20) - 1 ? `1px solid ${PR_RULE}` : "none"
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: tokens.font.mono, fontSize: 10, color: PR_ACCENT, fontWeight: 700 }}>
                row {rowIndex + 1}
              </span>
              <span style={{ fontFamily: tokens.font.mono, fontSize: 10, color: tokens.color.softInk }}>
                {(line[1] || line[0] || "-").slice(0, 72)}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
                gap: 8,
                minWidth: 0
              }}
            >
              {(header || []).map((cell, cellIndex) => (
                <div key={`${rowIndex}-${cell}-${cellIndex}`} style={{ display: "grid", gap: 3, minWidth: 0 }}>
                  <span style={{ fontFamily: tokens.font.mono, fontSize: 9.5, letterSpacing: "0.04em", color: tokens.color.softInk, overflowWrap: "anywhere" }}>
                    {cell}
                  </span>
                  <span style={{ fontSize: 11.5, lineHeight: 1.35, color: line[cellIndex] ? tokens.color.subInk : tokens.color.softInk, overflowWrap: "anywhere" }}>
                    {line[cellIndex] || "-"}
                  </span>
                </div>
              ))}
            </div>
          </article>
        )) : (
          <div style={{ padding: "14px 12px", fontSize: 12, color: tokens.color.subInk }}>
            No CSV rows yet.
          </div>
        )}
      </div>
    </details>
  );
}

function SummaryPanel({ campaign, summary }: { campaign: PrCampaign; summary: string }) {
  return (
    <section
      data-pr-summary="facts-first"
      style={{
        display: "grid",
        gap: 12,
        padding: "14px 16px",
        border: `1px solid ${PR_RULE}`,
        borderRadius: PR_RADIUS,
        background: tokens.color.surface,
        overflow: "hidden"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Kicker>Topline PR audit summary</Kicker>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <SecondaryButton onClick={() => exportPrSummaryMarkdown(summary, campaign.name)} style={{ ...accentButtonStyle, ...compactButtonStyle }}>
            Export MD
          </SecondaryButton>
          <SecondaryButton onClick={() => exportPrSummaryDocx(summary, campaign.name)} style={{ ...exportButtonStyle, ...compactButtonStyle }}>
            Export DOCX
          </SecondaryButton>
        </div>
      </div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: tokens.font.sans, fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk }}>
        {summary}
      </pre>
    </section>
  );
}

export function PrEvidenceView({ sessionId }: { sessionId: string }) {
  const [campaign, setCampaign] = useState<PrCampaign>(() => createDraftCampaign(sessionId));
  const [rows, setRows] = useState<PrEvidenceRow[]>([]);
  const [summary, setSummary] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [activePane, setActivePane] = useState<PrWorkPane>("ledger");
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReadingBrief, setIsReadingBrief] = useState(false);
  const [isGeneratingCriteria, setIsGeneratingCriteria] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isFetchingAdvancedMetrics, setIsFetchingAdvancedMetrics] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const coreMessages = useMemo(() => extractPrCoreMessages(campaign.briefText), [campaign.briefText]);

  const savedCampaignReady = Boolean(campaign.id && campaign.name.trim());

  useEffect(() => {
    setCampaign((current) => current.sessionId === sessionId ? current : createDraftCampaign(sessionId));
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      return;
    }
    void sendExtensionMessage<PrResponse>({ type: "pr/list-campaigns", sessionId })
      .then(async (response) => {
        if (!response.ok || cancelled) {
          return;
        }
        const active = response.prCampaigns?.[0] || null;
        if (!active) {
          setCampaign(createDraftCampaign(sessionId));
          setRows([]);
          return;
        }
        setCampaign(active);
        setSetupCollapsed(true);
        const rowResponse = await sendExtensionMessage<PrResponse>({ type: "pr/list-evidence-rows", campaignId: active.id });
        if (!cancelled && rowResponse.ok) {
          setRows(rowResponse.prEvidenceRows ?? []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function saveCampaign() {
    setIsSaving(true);
    setNotice("");
    const now = new Date().toISOString();
    const next = {
      ...campaign,
      sessionId,
      criteria: normalizePrCriteria(campaign.criteria),
      updatedAt: now,
      createdAt: campaign.createdAt || now
    };
    const response = await sendExtensionMessage<PrResponse>({ type: "pr/save-campaign", campaign: next });
    if (response.ok) {
      const active = response.prCampaigns?.[0] || next;
      setCampaign(active);
      setSetupCollapsed(true);
      setNotice("Campaign saved. Collect can now add evidence rows.");
    } else {
      setNotice(response.error);
    }
    setIsSaving(false);
  }

  async function generateCriteriaFromBrief(name: string, briefText: string) {
    setIsGeneratingCriteria(true);
    setNotice("");
    const response = await sendExtensionMessage<PrResponse>({
      type: "pr/generate-criteria",
      campaignName: name,
      briefText
    });
    if (response.ok && response.prCriteria?.length) {
      const now = new Date().toISOString();
      const next = {
        ...campaign,
        criteria: normalizePrCriteria(response.prCriteria!),
        name,
        briefText,
        sessionId,
        updatedAt: now,
        createdAt: campaign.createdAt || now
      };
      setCampaign(next);
      if (next.name.trim()) {
        const saveResponse = await sendExtensionMessage<PrResponse>({ type: "pr/save-campaign", campaign: next });
        if (saveResponse.ok) {
          setCampaign(saveResponse.prCampaigns?.[0] || next);
          setNotice("Criteria generated and saved. Match criteria can now use the six labels.");
        } else {
          setNotice(saveResponse.error);
        }
      } else {
        setNotice("Criteria generated. Add a campaign name before matching.");
      }
    } else if (!response.ok) {
      setNotice(response.error);
    }
    setIsGeneratingCriteria(false);
  }

  async function generateCriteria() {
    await generateCriteriaFromBrief(campaign.name, campaign.briefText);
  }

  async function uploadBriefFile(file: File) {
    setUploadError("");
    setIsReadingBrief(true);
    try {
      const result = await readPrBriefFile(file);
      const now = new Date().toISOString();
      const nextName = campaign.name.trim() || result.inferredName;
      setCampaign((current) => ({ ...current, name: nextName, briefText: result.text, updatedAt: now }));
      setIsReadingBrief(false);
      setNotice(`已載入 ${file.name}${result.sourceKind === "pdf" ? " PDF" : ""}，正在用 brief 產生六項 criteria...`);
      await generateCriteriaFromBrief(nextName, result.text);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsReadingBrief(false);
    }
  }

  async function matchCriteria() {
    if (!savedCampaignReady) {
      setNotice("Save a campaign before matching criteria.");
      return;
    }
    setIsMatching(true);
    setNotice("");
    const response = await sendExtensionMessage<PrResponse>({ type: "pr/match-criteria", campaignId: campaign.id });
    if (response.ok) {
      setRows(response.prEvidenceRows ?? []);
      setNotice("Criteria matching updated.");
    } else {
      setNotice(response.error);
    }
    setIsMatching(false);
  }

  async function fetchAdvancedMetrics() {
    if (!savedCampaignReady) {
      setNotice("Save a campaign before fetching advanced metrics.");
      return;
    }
    setIsFetchingAdvancedMetrics(true);
    setNotice("");
    try {
      const response = await sendExtensionMessage<PrResponse>({ type: "pr/fetch-advanced-metrics", campaignId: campaign.id });
      if (response.ok) {
        const nextRows = response.prEvidenceRows ?? [];
        setRows(nextRows);
        setNotice(summarizeAdvancedMetricsNotice(response.prAdvancedMetricsSummary, nextRows));
      } else {
        setNotice(response.error);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setIsFetchingAdvancedMetrics(false);
    }
  }

  async function generateSummary() {
    if (!savedCampaignReady) {
      setNotice("Save a campaign before generating summary.");
      return;
    }
    setIsGeneratingSummary(true);
    setNotice("");
    const response = await sendExtensionMessage<PrResponse>({ type: "pr/generate-summary", campaignId: campaign.id });
    if (response.ok) {
      setSummary(response.prSummary || "");
    } else {
      setNotice(response.error);
    }
    setIsGeneratingSummary(false);
  }

  function exportCsv() {
    const csv = buildPrEvidenceCsv(campaign, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${campaign.name.trim() || "pr-evidence"}-evidence.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      style={viewRootStyle({
        gap: tokens.spacing.md,
        boxSizing: "border-box",
        maxWidth: "100%",
        paddingRight: tokens.spacing.sm,
        paddingBottom: tokens.spacing.xl
      })}
      data-pr-evidence-view="true"
      data-pr-editorial-v1="true"
    >
      <ModeHeader
        mode="pr-evidence"
        kicker="PR Evidence"
        title="把已找到的 Threads 貼文整理成 PR evidence CSV"
        deck="Collect 儲存貼文 → Match 批次判斷 → Export CSV 交付。V1 不在 Collect 跑 AI。"
        stamp={<Stamp tone="accent">CSV first</Stamp>}
      />

      <WorkspaceSurface tone="utility" style={{ display: "grid", gap: tokens.spacing.md, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
        <CampaignEditor
          campaign={campaign}
          onChange={setCampaign}
          onSave={() => void saveCampaign()}
          onGenerateCriteria={() => void generateCriteria()}
          onUploadBrief={(file) => void uploadBriefFile(file)}
          isSaving={isSaving}
          isReadingBrief={isReadingBrief}
          isGenerating={isGeneratingCriteria}
          uploadError={uploadError}
          coreMessages={coreMessages}
          collapsed={setupCollapsed}
          onExpand={() => setSetupCollapsed(false)}
          onCollapse={() => setSetupCollapsed(true)}
        />

        <PrWorkingArea
          campaign={campaign}
          rows={rows}
          activePane={activePane}
          onPaneChange={setActivePane}
          onMatchCriteria={() => void matchCriteria()}
          onFetchAdvancedMetrics={() => void fetchAdvancedMetrics()}
          onExportCsv={exportCsv}
          isMatching={isMatching}
          isFetchingAdvancedMetrics={isFetchingAdvancedMetrics}
          savedCampaignReady={savedCampaignReady}
          lastMatchedAt={campaign.lastMatchedAt}
        />

        <NoticeBar notice={notice} />

        {rows.length ? <CsvPreview campaign={campaign} rows={rows} /> : null}

        {summary ? (
          <SummaryPanel campaign={campaign} summary={summary} />
        ) : (
          <SummaryGenerateCard
            onGenerate={() => void generateSummary()}
            loading={isGeneratingSummary}
            disabled={!savedCampaignReady || rows.length === 0}
          />
        )}
      </WorkspaceSurface>
    </div>
  );
}

function SummaryGenerateCard({ onGenerate, loading, disabled = false }: { onGenerate: () => void; loading: boolean; disabled?: boolean }) {
  return (
    <section
      data-pr-summary-cta="empty"
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: tokens.spacing.md,
        alignItems: "center",
        flexWrap: "wrap",
        padding: "12px 14px",
        border: `1px solid ${PR_RULE}`,
        borderRadius: PR_RADIUS,
        background: tokens.color.surface
      }}
    >
      <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <span style={{ fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 14, fontWeight: 700, color: tokens.color.ink }}>
          Topline narrative
        </span>
        <span style={{ fontSize: 11.5, color: tokens.color.softInk, lineHeight: 1.5 }}>
          Generate summary: turn matched evidence into a paragraph you can paste into the PR brief.
        </span>
      </div>
      <SecondaryButton onClick={onGenerate} disabled={disabled || loading} style={{ ...accentButtonStyle, ...compactButtonStyle, whiteSpace: "nowrap" }}>
        {loading ? "Generating..." : "Generate summary"}
      </SecondaryButton>
    </section>
  );
}

export const prEvidenceViewTestables = {
  matchedCount,
  csvPreviewRows,
  metricLine,
  summarizeAdvancedMetricsNotice,
  CsvPreview,
  EvidenceLedger
};
