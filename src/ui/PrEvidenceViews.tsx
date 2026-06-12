import type { ReactNode } from "react";
import { memo, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

import type { PrCampaignSaveDraft } from "../state/pr-evidence-storage.ts";
import {
  metricLine,
  PR_CRITERION_PLACEHOLDERS,
  summarizeAdvancedMetricsNotice,
  type PrEvidenceCommand,
  type PrEvidenceCsvPreviewViewModel,
  type PrEvidenceRowViewModel,
  type PrEvidenceViewModel,
  type PrWorkPane
} from "../viewmodel/pr-evidence.ts";
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
import { textStyles, tokens } from "./tokens.ts";

const accentButtonStyle = {
  borderColor: "var(--dlens-mode-accent)",
  background: "var(--dlens-mode-accent-soft)",
  color: "var(--dlens-mode-accent)",
  fontWeight: 700
} as const;

const compactButtonStyle = {
  padding: "6px 10px",
  fontSize: textStyles.caption.fontSize
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
const PR_ROUND = tokens.radius.round;

const prMonoMetaStyle = {
  ...textStyles.mono,
  fontSize: textStyles.caption.fontSize,
  lineHeight: textStyles.caption.lineHeight,
  fontWeight: 500
} as const;

const prRowTextStyle = {
  ...textStyles.bodyTight,
  lineHeight: 1.4
} as const;

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
  campaign: PrEvidenceViewModel["campaign"];
  onChange: (draft: PrCampaignSaveDraft) => void;
  onSave: () => void;
  onGenerateCriteria: () => void;
  onUploadBrief: () => void;
  isSaving: boolean;
  isReadingBrief: boolean;
  isGenerating: boolean;
  uploadError: string;
  coreMessages: string[];
  collapsed?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}) {
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
    ) as PrCampaignSaveDraft["criteria"];
    onChange({ ...campaign.saveDraft, criteria });
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
        <span style={{ ...fieldLabelStyle, flex: "0 0 96px" }}>活動</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tokens.color.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {campaign.name || "未命名活動"}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: PR_MOSS, fontSize: 12, fontWeight: 600 }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: PR_ROUND, background: PR_MOSS }} />
          已設定
        </span>
        <SecondaryButton onClick={() => onExpand?.()} style={compactButtonStyle}>
          編輯設定
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
              活動名稱
            </span>
            <input
              data-pr-field="name"
              value={campaign.name}
              onChange={(event) => onChange({ ...campaign.saveDraft, name: event.target.value })}
              placeholder="輸入活動或品牌名稱"
              style={inputLineStyle}
            />
          </label>
        </div>

        {/* ── PR brief (collapsible) ────────────────────────────────── */}
        <div data-pr-section="brief" style={{ display: "grid", gap: 8 }}>

          {/* Header row — always visible */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={fieldLabelStyle}>
              新聞稿 / PR brief
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {/* Upload — always available */}
              <SecondaryButton
                onClick={() => {
                  setBriefExpanded(true);
                  onUploadBrief();
                }}
                disabled={isReadingBrief || isGenerating}
                style={{ ...accentButtonStyle, ...compactButtonStyle, whiteSpace: "nowrap" }}
              >
                {isReadingBrief ? "讀取中..." : "上傳 PDF"}
              </SecondaryButton>
              {/* Edit / Done toggle — only when brief has content */}
              {campaign.briefText.trim() ? (
                <SecondaryButton
                  onClick={() => setBriefExpanded((v) => !v)}
                  style={compactButtonStyle}
                >
                  {briefExpanded ? "完成" : "編輯"}
                </SecondaryButton>
              ) : null}
            </div>
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
                  borderRadius: PR_ROUND
                }}
              >
                {campaign.briefText.length} 字
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
                onChange={(event) => onChange({ ...campaign.saveDraft, briefText: event.target.value })}
                placeholder="貼上新聞稿、message house 或 PR guideline，也可以上傳 PDF。"
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
                <Kicker tone="accent">偵測到的核心訊息</Kicker>
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
                          borderRadius: PR_ROUND,
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
              PR 判斷條件
            </span>
            <SecondaryButton onClick={onGenerateCriteria} disabled={isReadingBrief || isGenerating} style={{ ...accentButtonStyle, ...compactButtonStyle }}>
              {isGenerating ? "生成中..." : "生成條件"}
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
                  placeholder={campaign.placeholders[criterion.id] || PR_CRITERION_PLACEHOLDERS[criterion.id]}
                  style={criteriaInputLineStyle}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Save ─────────────────────────────────────────────────── */}
        <div data-pr-section="save" style={{ paddingTop: 4, display: "flex", gap: 8, alignItems: "center" }}>
          <PrimaryButton onClick={onSave} disabled={isSaving || !campaign.name.trim()} style={compactButtonStyle}>
            {isSaving ? "儲存中..." : "儲存活動"}
          </PrimaryButton>
          <SecondaryButton onClick={() => onCollapse?.()} style={compactButtonStyle}>
            取消
          </SecondaryButton>
          <span style={{ ...prMonoMetaStyle, marginLeft: "auto", color: tokens.color.softInk }}>
            儲存後自動同步
          </span>
        </div>
    </section>
  );
}

function EvidenceLedger({ rows }: { rows: PrEvidenceRowViewModel[] }) {
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
              <div style={{ ...prMonoMetaStyle, color: tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.authorLabel}</div>
              <div style={{ ...prRowTextStyle, color: tokens.color.subInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.captionLabel}</div>
              <div style={{ ...textStyles.metric, color: tokens.color.softInk, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.metricLine}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", overflow: "hidden" }}>
                <CriterionChips row={row} variant="compact" />
              </div>
              <div style={{ ...prMonoMetaStyle, color: tokens.color.softInk, textAlign: "right", minWidth: 56 }}>{row.collectedAtLabel}</div>
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

function SourceLinkIcon({ row }: { row: PrEvidenceRowViewModel }) {
  const href = row.sourceUrl;
  const baseStyle = {
    width: 24,
    height: 24,
    borderRadius: PR_ROUND,
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
      aria-label={row.sourceLinkAriaLabel}
      title="Open original Threads post"
      onClick={(event) => event.stopPropagation()}
      style={baseStyle}
    >
      <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
    </a>
  );
}

function CriterionChips({ row, variant }: { row: PrEvidenceRowViewModel; variant: "full" | "compact" }) {
  const matchedTotal = row.matchedCount;
  if (variant === "compact") {
    if (matchedTotal === 0) {
      return (
        <span
          aria-label="No criteria matched yet"
          style={{
            ...textStyles.metric,
            color: tokens.color.softInk,
            fontWeight: 700
          }}
        >
          0 / 6
        </span>
      );
    }
    const matchedIds = row.criteria.filter((entry) => entry.matched);
    return (
      <span
        aria-label={`${matchedTotal} of 6 criteria matched`}
        title={row.matchedCriterionLabels.join(" · ")}
        style={{
          display: "inline-flex",
          gap: 5,
          flexWrap: "nowrap",
          overflow: "hidden",
          ...textStyles.metric,
          color: matchedTotal >= 5 ? PR_MOSS : PR_ACCENT,
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
      {row.criteria.map((criterion) => {
        const matched = criterion.matched;
        return (
          <span
            key={criterion.id}
            title={criterion.label || criterion.id}
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 3,
              color: matched ? PR_MOSS : tokens.color.softInk,
              ...prMonoMetaStyle,
              fontWeight: matched ? 700 : 400,
              opacity: matched ? 1 : 0.7
            }}
          >
            C{criterion.index + 1}
            <span aria-hidden>{matched ? "✓" : "·"}</span>
          </span>
        );
      })}
    </div>
  );
}

function PrWorkingArea({
  viewModel,
  onPaneChange,
  onCommand
}: {
  viewModel: PrEvidenceViewModel;
  onPaneChange: (pane: PrWorkPane) => void;
  onCommand: (command: PrEvidenceCommand) => void;
}) {
  const rows = viewModel.rows;
  const activePane = viewModel.workingArea.activePane;
  const tabs: ReadonlyArray<SegmentedTabItem<PrWorkPane>> = viewModel.workingArea.tabs;
  const matchAction = viewModel.actions.find((action) => action.kind === "matchCriteria");
  const metricsAction = viewModel.actions.find((action) => action.kind === "fetchAdvancedMetrics");
  const exportCsvAction = viewModel.actions.find((action) => action.kind === "exportCsv");

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
          ariaLabel="PR 工作區分頁"
          dataAttr={(id) => ({ "data-pr-work-tab": id })}
        />
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", paddingBottom: 6 }}>
          <PrimaryButton onClick={() => exportCsvAction ? onCommand(exportCsvAction) : undefined} disabled={!viewModel.workingArea.canExportCsv || !exportCsvAction} style={compactButtonStyle}>
            匯出 CSV
          </PrimaryButton>
        </div>
      </div>

      <div style={paneStyle("ledger")}>
        <PaneHeader
          title="已儲存貼文"
          caption={viewModel.workingArea.ledgerCaption}
        />
        <EvidenceLedger rows={rows} />
      </div>

      <div style={paneStyle("match")}>
        <PaneHeader
          title="用 6 項條件逐篇判斷"
          caption={viewModel.workingArea.match.caption}
          action={
            <PrimaryButton
              onClick={() => matchAction ? onCommand(matchAction) : undefined}
              disabled={!viewModel.workingArea.canMatchCriteria || !matchAction}
              style={compactButtonStyle}
            >
              {viewModel.ui.isMatching ? "判斷中..." : "批次判斷"}
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
                <span style={{ ...prMonoMetaStyle, color: tokens.color.ink, flex: "0 0 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 124 }}>
                  {row.authorLabel}
                </span>
                <span style={{ ...prRowTextStyle, flex: 1, minWidth: 0, color: tokens.color.subInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.captionLabel}
                </span>
                <span style={{ ...textStyles.metric, color: row.matchedCount >= 5 ? PR_MOSS : row.matchedCount > 0 ? PR_ACCENT : tokens.color.softInk, flexShrink: 0 }}>
                  {row.matchCountLabel}
                </span>
              </div>
              <CriterionChips row={row} variant="full" />
            </div>
          )) : (
            <div style={{ padding: "16px 8px", fontSize: 12, color: tokens.color.subInk }}>先收集貼文，再執行條件判斷。</div>
          )}
          {rows.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", padding: "10px 4px", borderTop: `1px solid ${PR_RULE}` }}>
              <span style={{ ...textStyles.label, fontFamily: tokens.font.mono, color: tokens.color.softInk, letterSpacing: "0.06em" }}>
                Σ 各條件
              </span>
              {viewModel.workingArea.match.criterionTotals.map((total, index) => (
                <span
                  key={index}
                  style={{
                    ...prMonoMetaStyle,
                    color: total > 0 ? tokens.color.ink : tokens.color.softInk,
                    fontWeight: total > 0 ? 700 : 400
                  }}
                >
                  C{index + 1}:{total}
                </span>
              ))}
              <span style={{ ...textStyles.metric, marginLeft: "auto", color: viewModel.workingArea.match.matchedCells ? PR_MOSS : tokens.color.softInk }}>
                {viewModel.workingArea.match.matchedCells} / {viewModel.workingArea.match.totalCells}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div style={paneStyle("metrics")}>
        <PaneHeader
          title="進階指標"
          caption={viewModel.workingArea.metricsCaption}
          action={
            <span data-pr-metrics-action="toolbar" title="抓取進階指標" style={{ display: "inline-flex" }}>
              <PrimaryButton
                onClick={() => metricsAction ? onCommand(metricsAction) : undefined}
                disabled={!viewModel.workingArea.canFetchAdvancedMetrics || !metricsAction}
                style={compactButtonStyle}
              >
                {viewModel.ui.isFetchingAdvancedMetrics ? "抓取中..." : "抓取進階指標"}
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
          <span style={{ ...prMonoMetaStyle, color: tokens.color.softInk, letterSpacing: "0.04em" }}>
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

function AdvancedMetricsPanel({ rows }: { rows: PrEvidenceRowViewModel[] }) {
  return (
    <section data-pr-metrics-list="wrap" style={{ display: "grid", minWidth: 0 }}>
      {rows.length ? (
        <div data-scan-list="pr-metrics" style={{ display: "grid", borderTop: `1px solid ${PR_RULE}` }}>
          <style>{SCAN_ROW_HOVER_CSS}</style>
          {rows.map((row) => (
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
                  <span aria-hidden style={{ width: 22, height: 22, borderRadius: PR_ROUND, background: `linear-gradient(135deg, ${tokens.color.neutralSurfaceSoft}, ${tokens.color.neutralSurface})`, border: `1px solid ${PR_RULE}`, flexShrink: 0 }} />
                  <div style={{ ...prMonoMetaStyle, color: tokens.color.ink, flexShrink: 0, maxWidth: 124, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.authorLabel}
                  </div>
                  <div style={{ ...prRowTextStyle, flex: 1, minWidth: 0, color: tokens.color.subInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.captionLabel}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", columnGap: 16, rowGap: 4, paddingLeft: 32 }}>
                  {row.metrics.map((metric) => (
                    <MetricCell key={metric.label} label={metric.label} value={metric.value} advanced={metric.advanced} />
                  ))}
                </div>
                {row.advancedMetricsError ? (
                  <div style={{ fontSize: 11, lineHeight: 1.45, color: tokens.color.failed, paddingLeft: 32 }}>
                    {row.advancedMetricsError}
                  </div>
                ) : null}
              </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "16px 12px", borderRadius: PR_RADIUS, border: `1px solid ${PR_RULE}`, background: tokens.color.surface, fontSize: 12, color: tokens.color.subInk }}>
          先收集貼文，再抓取進階指標。
        </div>
      )}
    </section>
  );
}

function CsvPreview({ preview }: { preview: PrEvidenceCsvPreviewViewModel }) {
  const body = preview.rows;
  return (
    <details data-pr-csv-preview="true" style={{ marginTop: 4, borderTop: `1px solid ${PR_RULE}`, paddingTop: 18, borderRadius: PR_RADIUS }}>
      <summary style={{ listStyle: "none", cursor: "pointer", display: "flex", alignItems: "baseline", gap: 8, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 16, fontWeight: 600, color: tokens.color.ink }}>
        <span style={{ fontSize: 11, color: tokens.color.softInk }}>▸</span>
        CSV 預覽
        <span style={{ ...prMonoMetaStyle, marginLeft: "auto", color: tokens.color.softInk, fontWeight: 500 }}>
          {preview.exportableCountLabel}
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
              <span style={{ ...textStyles.label, fontFamily: tokens.font.mono, color: PR_ACCENT }}>
                第 {rowIndex + 1} 列
              </span>
              <span style={{ ...prMonoMetaStyle, color: tokens.color.softInk }}>
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
              {preview.header.map((cell, cellIndex) => (
                <div key={`${rowIndex}-${cell}-${cellIndex}`} style={{ display: "grid", gap: 3, minWidth: 0 }}>
                  <span style={{ ...textStyles.label, fontFamily: tokens.font.mono, letterSpacing: "0.04em", color: tokens.color.softInk, overflowWrap: "anywhere" }}>
                    {cell}
                  </span>
                  <span style={{ ...textStyles.caption, fontWeight: 500, color: line[cellIndex] ? tokens.color.subInk : tokens.color.softInk, overflowWrap: "anywhere" }}>
                    {line[cellIndex] || "-"}
                  </span>
                </div>
              ))}
            </div>
          </article>
        )) : (
          <div style={{ padding: "14px 12px", fontSize: 12, color: tokens.color.subInk }}>
            還沒有 CSV 列。
          </div>
        )}
      </div>
    </details>
  );
}

function SummaryPanel({
  summary,
  markdownCommand,
  docxCommand,
  onCommand
}: {
  summary: string;
  markdownCommand: PrEvidenceCommand | null;
  docxCommand: PrEvidenceCommand | null;
  onCommand: (command: PrEvidenceCommand) => void;
}) {
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
        <Kicker>PR 稽核摘要</Kicker>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <SecondaryButton onClick={() => markdownCommand ? onCommand(markdownCommand) : undefined} disabled={!markdownCommand} style={{ ...accentButtonStyle, ...compactButtonStyle }}>
            匯出 MD
          </SecondaryButton>
          <SecondaryButton onClick={() => docxCommand ? onCommand(docxCommand) : undefined} disabled={!docxCommand} style={{ ...exportButtonStyle, ...compactButtonStyle }}>
            匯出 DOCX
          </SecondaryButton>
        </div>
      </div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: tokens.font.sans, fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk }}>
        {summary}
      </pre>
    </section>
  );
}

export interface PrEvidenceViewProps {
  viewModel: PrEvidenceViewModel;
  onCommand: (command: PrEvidenceCommand) => Promise<unknown> | unknown;
}

// memo-wrapped below as PrEvidenceView. Inline export `PrEvidenceViewInner`
// is kept for tests / hot-reload introspection.
function PrEvidenceViewInner({ viewModel, onCommand }: PrEvidenceViewProps) {
  const dispatchCommand = (command: PrEvidenceCommand) => Promise.resolve(onCommand(command));
  const saveCampaignAction = viewModel.actions.find((action) => action.kind === "saveCampaign");
  const generateCriteriaAction = viewModel.actions.find((action) => action.kind === "generateCriteria");
  const generateSummaryAction = viewModel.actions.find((action) => action.kind === "generateSummary");
  const markdownCommand = viewModel.actions.find((action) => action.kind === "exportSummaryMarkdown") ?? null;
  const docxCommand = viewModel.actions.find((action) => action.kind === "exportSummaryDocx") ?? null;

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
        deck="採集先儲存貼文，PR 頁再批次判斷與匯出 CSV；V1 不在採集時跑 AI。"
        stamp={<Stamp tone="accent">先出 CSV</Stamp>}
      />

      <WorkspaceSurface
        tone="utility"
        style={{
          display: "grid",
          gap: tokens.spacing.md,
          minWidth: 0,
          maxWidth: "100%",
          overflow: "hidden",
          borderRadius: tokens.radius.cardLg,
          boxShadow: tokens.shadow.topicCard
        }}
      >
        <CampaignEditor
          campaign={viewModel.campaign}
          onChange={(draft) => void dispatchCommand({ kind: "updateDraft", target: { sessionId: viewModel.sessionId }, draft })}
          onSave={() => saveCampaignAction ? void dispatchCommand(saveCampaignAction) : undefined}
          onGenerateCriteria={() => generateCriteriaAction ? void dispatchCommand(generateCriteriaAction) : undefined}
          onUploadBrief={() => void dispatchCommand({ kind: "requestBriefUpload", target: { sessionId: viewModel.sessionId } })}
          isSaving={viewModel.ui.isSaving}
          isReadingBrief={viewModel.ui.isReadingBrief}
          isGenerating={viewModel.ui.isGeneratingCriteria}
          uploadError={viewModel.uploadError}
          coreMessages={viewModel.coreMessages}
          collapsed={viewModel.campaign.setupCollapsed}
          onExpand={() => void dispatchCommand({ kind: "setSetupCollapsed", target: { sessionId: viewModel.sessionId }, collapsed: false })}
          onCollapse={() => void dispatchCommand({ kind: "setSetupCollapsed", target: { sessionId: viewModel.sessionId }, collapsed: true })}
        />

        <PrWorkingArea
          viewModel={viewModel}
          onPaneChange={(pane) => void dispatchCommand({ kind: "setPane", target: { sessionId: viewModel.sessionId }, pane })}
          onCommand={(command) => void dispatchCommand(command)}
        />

        <NoticeBar notice={viewModel.notice} />

        {viewModel.csvPreview ? <CsvPreview preview={viewModel.csvPreview} /> : null}

        {viewModel.summary ? (
          <SummaryPanel
            summary={viewModel.summary}
            markdownCommand={markdownCommand}
            docxCommand={docxCommand}
            onCommand={(command) => void dispatchCommand(command)}
          />
        ) : (
          <SummaryGenerateCard
            onGenerate={() => generateSummaryAction ? void dispatchCommand(generateSummaryAction) : undefined}
            loading={viewModel.ui.isGeneratingSummary}
            disabled={!generateSummaryAction || viewModel.ui.isGeneratingSummary}
          />
        )}
      </WorkspaceSurface>
    </div>
  );
}

/* ─── memoized export ───
 * The popup re-renders for many unrelated reasons (pending workspace switch,
 * mode rail badge counts, processing strip ticks). PrEvidenceView now receives
 * a shell-built ViewModel and command dispatcher; React.memo keeps unrelated
 * shell renders from re-running the presentational tree when the VM is stable.
 */
export const PrEvidenceView = memo(PrEvidenceViewInner);

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
          PR 摘要
        </span>
        <span style={{ ...textStyles.caption, color: tokens.color.softInk, fontWeight: 500, lineHeight: 1.5 }}>
          生成摘要：把已判斷 evidence 轉成可貼進 PR brief 的段落。
        </span>
      </div>
      <SecondaryButton onClick={onGenerate} disabled={disabled || loading} style={{ ...accentButtonStyle, ...compactButtonStyle, whiteSpace: "nowrap" }}>
        {loading ? "生成中..." : "生成摘要"}
      </SecondaryButton>
    </section>
  );
}

export const prEvidenceViewTestables = {
  metricLine,
  summarizeAdvancedMetricsNotice,
  CsvPreview,
  EvidenceLedger
};
