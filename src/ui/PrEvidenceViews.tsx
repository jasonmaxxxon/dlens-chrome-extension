import { memo, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

import type { PrCampaignSaveDraft } from "../state/pr-evidence-storage.ts";
import {
  metricLine,
  PR_CRITERION_PLACEHOLDERS,
  summarizeAdvancedMetricsNotice,
  type PrCriterionStrength,
  type PrEvidenceCommand,
  type PrEvidenceCsvPreviewViewModel,
  type PrEvidenceRowViewModel,
  type PrEvidenceViewModel
} from "../viewmodel/pr-evidence.ts";
import {
  Kicker,
  ModeHeader,
  PrimaryButton,
  QuoteBlock,
  SCAN_ROW_HOVER_CSS,
  SecondaryButton,
  Stamp,
  SurfaceCard,
  WorkspaceSurface,
  viewRootStyle
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
          {campaign.briefText.trim() ? (
            <div
              data-pr-criteria-ai-banner="true"
              style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px", borderRadius: PR_RADIUS, border: "1px solid rgba(122,32,48,0.20)", background: `linear-gradient(180deg, ${tokens.color.surface}, rgba(122,32,48,0.045))` }}
            >
              <span aria-hidden style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(122,32,48,0.10)", color: PR_ACCENT, display: "grid", placeItems: "center", fontSize: 14, flexShrink: 0 }}>✦</span>
              <span style={{ ...prRowTextStyle, color: tokens.color.subInk, minWidth: 0 }}>
                AI 已從 brief 抽出 <b style={{ color: PR_ACCENT, fontWeight: 600 }}>{campaign.criteria.length} 條 criteria</b> · 點任一條可改
              </span>
            </div>
          ) : null}
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

/* Frame 09 ledger strip — captured / strong / outlier, derived from real match counts. */
function LedgerStrip({ rows }: { rows: PrEvidenceRowViewModel[] }) {
  if (!rows.length) {
    return null;
  }
  const strong = rows.filter((row) => row.matchedCount >= 4).length;
  const outlier = rows.filter((row) => row.matchedCount <= 2).length;
  const cell = (value: number, label: string, labelColor: string) => (
    <span style={{ display: "grid", gap: 0, lineHeight: 1 }}>
      <b style={{ fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 18, fontWeight: 500, color: PR_ACCENT, lineHeight: 1.05 }}>{value}</b>
      <span style={{ fontSize: 10, color: labelColor }}>{label}</span>
    </span>
  );
  const divider = <span aria-hidden style={{ width: 1, height: 22, background: "rgba(122,32,48,0.20)" }} />;
  return (
    <div
      data-pr-ledger-strip="true"
      style={{ display: "flex", gap: 14, alignItems: "center", padding: "10px 13px", borderRadius: PR_RADIUS, border: "1px solid rgba(122,32,48,0.20)", background: "rgba(122,32,48,0.05)", marginBottom: 10 }}
    >
      {cell(rows.length, "captured", tokens.color.softInk)}
      {divider}
      {cell(strong, "strong", PR_MOSS)}
      {divider}
      {cell(outlier, "outlier", PR_ACCENT)}
      <span style={{ marginLeft: "auto", ...prMonoMetaStyle, color: PR_ACCENT }}>過 4 criteria 以上為 strong</span>
    </div>
  );
}

function EvidenceLedger({ rows, caption }: { rows: PrEvidenceRowViewModel[]; caption: string }) {
  const hasRows = rows.length > 0;
  return (
    <section data-pr-evidence-ledger="compact" data-pr-evidence-ledger-style="audit" style={{ display: "grid", minWidth: 0 }}>
      <style>{SCAN_ROW_HOVER_CSS}</style>
      {hasRows ? (
        <details
          data-pr-evidence-rows-detail="collapsed"
          style={{
            borderTop: `1px solid ${PR_RULE}`,
            paddingTop: 12,
            borderRadius: PR_RADIUS,
            minWidth: 0
          }}
        >
          <summary
            style={{
              listStyle: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              color: tokens.color.ink,
              fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`,
              fontSize: 15,
              fontWeight: 700
            }}
          >
            <span style={{ fontSize: 11, color: tokens.color.softInk }}>▸</span>
            已儲存貼文
            <span style={{ ...prMonoMetaStyle, marginLeft: "auto", color: tokens.color.softInk }}>
              {caption}
            </span>
          </summary>
          <div style={{ display: "grid", gap: 10, paddingTop: 10 }}>
            <LedgerStrip rows={rows} />
            <div data-scan-list="pr-evidence" style={{ display: "grid", borderTop: `1px solid ${PR_RULE}` }}>
              {rows.map((row, index) => {
                const auditNumber = formatAuditNumber(index);
                return (
                  <article
                    key={row.id}
                    data-pr-evidence-row="audit"
                    data-scan-row="true"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "34px minmax(0, 1fr)",
                      gap: 12,
                      padding: "14px 4px",
                      borderBottom: `1px solid ${PR_RULE}`,
                      background: "transparent",
                      cursor: "default",
                      transition: tokens.motion.interactiveTransitionFast,
                      minWidth: 0
                    }}
                  >
                    <span
                      data-pr-evidence-audit-number={auditNumber}
                      style={{
                        ...textStyles.metric,
                        color: PR_ACCENT,
                        fontWeight: 800,
                        paddingTop: 2,
                        textAlign: "center",
                        letterSpacing: "0.02em"
                      }}
                    >
                      {auditNumber}
                    </span>
                    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                        <span
                          style={{
                            ...prMonoMetaStyle,
                            color: tokens.color.ink,
                            maxWidth: 124,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {row.authorLabel}
                        </span>
                        <span style={{ ...textStyles.metric, color: tokens.color.softInk }}>
                          {row.metricLine}
                        </span>
                        <span style={{ flex: 1 }} />
                        <SourceLinkIcon row={row} />
                        <CriterionChips row={row} variant="compact" />
                        <span style={{ ...prMonoMetaStyle, color: tokens.color.softInk }}>
                          {row.collectedAtLabel}
                        </span>
                      </div>
                      <QuoteBlock
                        cite={<span>PR evidence row {auditNumber}</span>}
                        style={{
                          padding: "10px 12px",
                          borderRadius: tokens.radius.card,
                          background: tokens.color.surface
                        }}
                      >
                        {row.captionLabel}
                      </QuoteBlock>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </details>
      ) : (
        <div style={{ padding: "16px 12px", borderRadius: PR_RADIUS, border: `1px solid ${PR_RULE}`, background: tokens.color.surface, fontSize: 12, color: tokens.color.subInk }}>
          尚未收集 evidence rows。先到 Collect 保存已打開的 Threads posts。
        </div>
      )}
    </section>
  );
}

function formatAuditNumber(index: number) {
  return String(index + 1).padStart(2, "0");
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
    const tone = matchedTotal >= 5 ? PR_MOSS : matchedTotal > 0 ? PR_ACCENT : tokens.color.softInk;
    const soft = matchedTotal >= 5 ? tokens.color.successSoft : matchedTotal > 0 ? tokens.color.runningSoft : tokens.color.neutralSurfaceSoft;
    return (
      <span
        data-pr-match-indicator="true"
        aria-label={matchedTotal === 0 ? "No criteria matched yet" : `${matchedTotal} of 6 criteria matched`}
        title={matchedTotal === 0 ? "No criteria matched yet" : row.matchedCriterionLabels.join(" · ")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "nowrap",
          ...textStyles.metric,
          color: tone,
          justifyContent: "flex-end",
          whiteSpace: "nowrap"
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: PR_ROUND,
            background: tone,
            boxShadow: `0 0 0 3px ${soft}`,
            flexShrink: 0
          }}
        />
        {matchedTotal}/6
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

const PR_AMBER = "#a16a17";

const CRITERIA_STRENGTH_META: Record<PrCriterionStrength, { accent: string; rowBg: string; rowBorder: string; status: string }> = {
  strong: { accent: PR_MOSS, rowBg: tokens.color.surface, rowBorder: PR_RULE, status: "OK" },
  partial: { accent: PR_AMBER, rowBg: "rgba(161,106,23,0.04)", rowBorder: "rgba(161,106,23,0.25)", status: "半弱" },
  gap: { accent: PR_ACCENT, rowBg: "rgba(122,32,48,0.04)", rowBorder: "rgba(122,32,48,0.30)", status: "GAP" }
};

/* Frame 10 · PR Criteria Health — KPI grid + score-sorted criterion bars + systemic-gap callout. */
const CRITERIA_HEALTH_DISCLOSURE_CSS = `
[data-pr-criteria-health-detail] > summary::-webkit-details-marker {
  display: none;
}
`;

function CriteriaHealth({ health, rows }: { health: PrEvidenceViewModel["criteriaHealth"]; rows: PrEvidenceRowViewModel[] }) {
  if (!health.totalRows) {
    return null;
  }
  const gapCount = health.criteria.filter((entry) => entry.strength === "gap").length;
  const rankedCriteria = [...health.criteria].sort((left, right) => right.matchedRows - left.matchedRows);
  const monoStat = { fontFamily: tokens.font.mono, fontVariantNumeric: "tabular-nums" } as const;

  return (
    <SurfaceCard
      tone="default"
      dataAttrs={{ "data-pr-criteria-health": "true" }}
      style={{ display: "grid", gap: 12, padding: "14px 16px", background: tokens.color.surface }}
    >
      <style>{CRITERIA_HEALTH_DISCLOSURE_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <Kicker>條件健康度</Kicker>
        <span style={{ ...prMonoMetaStyle, color: tokens.color.softInk }}>
          依 {health.totalRows} 列 evidence 反推
        </span>
      </div>

      {/* KPI grid */}
      <div data-pr-criteria-health-kpis="true" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7 }}>
        <HealthKpi label="Captured" value={String(health.totalRows)} accent={PR_ACCENT} />
        <HealthKpi label="Strong" value={String(health.strongRows)} suffix={`/ ${health.totalRows}`} accent={PR_MOSS} />
        <HealthKpi label="Criteria 待補" value={String(gapCount)} suffix="/ 6" accent={PR_AMBER} />
      </div>

      {/* Per-criterion health rows, weakest sinks to the bottom */}
      <div style={{ display: "grid", gap: 5 }}>
        {rankedCriteria.map((entry) => {
          const meta = CRITERIA_STRENGTH_META[entry.strength];
          const pct = entry.totalRows ? Math.round((entry.matchedRows / entry.totalRows) * 100) : 0;
          const matchedRows = rows.filter((row) =>
            row.criteria.some((criterion) => criterion.id === entry.id && criterion.matched)
          );
          return (
            <details
              key={entry.id}
              data-pr-criteria-health-detail={entry.id}
              data-pr-criteria-health-strength={entry.strength}
              style={{
                borderRadius: tokens.radius.xs,
                border: `1px solid ${meta.rowBorder}`,
                background: meta.rowBg,
                overflow: "hidden"
              }}
            >
              <summary
                style={{
                  listStyle: "none",
                  cursor: "pointer",
                  display: "grid",
                  gridTemplateColumns: "30px minmax(0, 1fr) auto auto",
                  gap: 9,
                  alignItems: "center",
                  padding: "6px 11px"
                }}
              >
                <span
                  data-pr-criteria-id={entry.id}
                  style={{
                    ...monoStat,
                    fontSize: 10,
                    fontWeight: 700,
                    color: PR_ACCENT,
                    background: "var(--dlens-mode-accent-soft)",
                    border: `1px solid ${PR_RULE}`,
                    padding: "3px 0",
                    borderRadius: 5,
                    textAlign: "center"
                  }}
                >
                  {entry.id.toUpperCase()}
                </span>
                <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
                  <span style={{ ...prRowTextStyle, color: tokens.color.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.label}
                  </span>
                  <span aria-hidden style={{ height: 4, borderRadius: 3, background: "rgba(27,26,23,0.06)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${pct}%`, background: meta.accent, borderRadius: 3 }} />
                  </span>
                </span>
                <span style={{ ...monoStat, fontSize: 13, fontWeight: 600, color: meta.accent, textAlign: "right" }}>
                  {entry.matchedRows}<span style={{ fontSize: 9.5, color: tokens.color.softInk, fontWeight: 400 }}>/{entry.totalRows}</span>
                </span>
                <span style={{ ...monoStat, fontSize: 9.5, fontWeight: 600, color: meta.accent, textAlign: "right", minWidth: 30 }}>
                  {meta.status}
                </span>
              </summary>
              <div
                data-pr-criteria-health-matches={entry.id}
                style={{
                  display: "grid",
                  gap: 5,
                  padding: "0 11px 10px 50px"
                }}
              >
                {matchedRows.length ? matchedRows.map((row) => (
                  <div
                    key={row.id}
                    data-pr-criteria-health-match-row="true"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 98px) minmax(0, 1fr) auto",
                      gap: 8,
                      alignItems: "baseline",
                      padding: "6px 0",
                      borderTop: `1px solid ${tokens.color.line}`
                    }}
                  >
                    <span style={{ ...prMonoMetaStyle, color: tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.authorLabel}
                    </span>
                    <span style={{ ...textStyles.caption, color: tokens.color.subInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.captionLabel}
                    </span>
                    <span style={{ ...prMonoMetaStyle, color: row.matchedCount >= 4 ? PR_MOSS : PR_ACCENT }}>
                      {row.matchedCount}/6
                    </span>
                  </div>
                )) : (
                  <span style={{ ...textStyles.caption, color: tokens.color.softInk, paddingTop: 6 }}>
                    沒有命中貼文。
                  </span>
                )}
              </div>
            </details>
          );
        })}
      </div>

      {health.systemicGap ? (
        <div
          data-pr-criteria-health-gap="true"
          style={{
            display: "grid",
            gap: 5,
            padding: "10px 13px",
            borderRadius: PR_RADIUS,
            background: "rgba(122,32,48,0.04)",
            border: "1px solid rgba(122,32,48,0.22)",
            minWidth: 0
          }}
        >
          <span style={{ ...textStyles.label, fontFamily: tokens.font.sans, color: PR_ACCENT, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 700 }}>
            系統性缺口 · {health.systemicGap.label}
          </span>
          <span style={{ ...prRowTextStyle, color: tokens.color.subInk, minWidth: 0 }}>
            {health.systemicGap.label} 在 {health.systemicGap.missingRows} 列 evidence 全無命中,屬結構性缺欄,需先補來源才補得起來。
          </span>
        </div>
      ) : null}
    </SurfaceCard>
  );
}

function HealthKpi({ label, value, suffix, accent }: { label: string; value: string; suffix?: string; accent: string }) {
  return (
    <div style={{ display: "grid", gap: 1, padding: "9px 12px", borderRadius: tokens.radius.card, border: `1px solid ${PR_RULE}`, background: tokens.color.surface, minWidth: 0 }}>
      <span style={{ ...textStyles.label, fontFamily: tokens.font.sans, color: tokens.color.softInk, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 24, lineHeight: 1, fontWeight: 500, color: accent }}>
        {value}
        {suffix ? <span style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.softInk, fontWeight: 400 }}> {suffix}</span> : null}
      </span>
    </div>
  );
}

function PrWorkingArea({
  viewModel,
  onCommand
}: {
  viewModel: PrEvidenceViewModel;
  onCommand: (command: PrEvidenceCommand) => void;
}) {
  const rows = viewModel.rows;
  const matchAction = viewModel.actions.find((action) => action.kind === "matchCriteria");
  const metricsAction = viewModel.actions.find((action) => action.kind === "fetchAdvancedMetrics");
  const exportCsvAction = viewModel.actions.find((action) => action.kind === "exportCsv");
  const hasMatchResult = Boolean(viewModel.campaign.lastMatchedAt || viewModel.workingArea.match.matchedCells > 0);

  return (
    <section
      data-pr-working-area="true"
      data-pr-actions="true"
      data-pr-working-layout="single"
      style={{ display: "grid", gap: tokens.spacing.md, marginBottom: tokens.spacing.lg, minWidth: 0 }}
    >
      <div
        data-pr-workflow-toolbar="true"
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.spacing.sm,
          borderBottom: `1px solid ${PR_RULE}`,
          paddingBottom: 8,
          flexWrap: "wrap"
        }}
      >
        <Kicker>證據流程</Kicker>
        <span style={{ flex: 1 }} />
        <PrimaryButton
          onClick={() => matchAction ? onCommand(matchAction) : undefined}
          disabled={!viewModel.workingArea.canMatchCriteria || !matchAction}
          style={compactButtonStyle}
        >
          {viewModel.ui.isMatching ? "判斷中..." : "批次判斷"}
        </PrimaryButton>
        <span data-pr-metrics-action="toolbar" title="抓取進階指標" style={{ display: "inline-flex" }}>
          <SecondaryButton
            onClick={() => metricsAction ? onCommand(metricsAction) : undefined}
            disabled={!viewModel.workingArea.canFetchAdvancedMetrics || !metricsAction}
            style={{ ...accentButtonStyle, ...compactButtonStyle }}
          >
            {viewModel.ui.isFetchingAdvancedMetrics ? "抓取中..." : "抓取進階指標"}
          </SecondaryButton>
        </span>
        <PrimaryButton
          onClick={() => exportCsvAction ? onCommand(exportCsvAction) : undefined}
          disabled={!viewModel.workingArea.canExportCsv || !exportCsvAction}
          style={compactButtonStyle}
        >
          匯出 CSV
        </PrimaryButton>
      </div>

      {hasMatchResult ? <CriteriaHealth health={viewModel.criteriaHealth} rows={rows} /> : null}

      <MatchSummary viewModel={viewModel} />

      <EvidenceLedger rows={rows} caption={viewModel.workingArea.ledgerCaption} />

      <details
        data-pr-metrics-detail="collapsed"
        style={{
          borderTop: `1px solid ${PR_RULE}`,
          paddingTop: 12,
          borderRadius: PR_RADIUS
        }}
      >
        <summary
          style={{
            listStyle: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            color: tokens.color.ink,
            fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`,
            fontSize: 15,
            fontWeight: 700
          }}
        >
          <span style={{ fontSize: 11, color: tokens.color.softInk }}>▸</span>
          進階指標
          <span style={{ ...prMonoMetaStyle, marginLeft: "auto", color: tokens.color.softInk }}>
            {viewModel.workingArea.metricsCaption}
          </span>
        </summary>
        <AdvancedMetricsPanel rows={rows} />
      </details>
    </section>
  );
}

function MatchSummary({ viewModel }: { viewModel: PrEvidenceViewModel }) {
  const totals = viewModel.workingArea.match.criterionTotals;
  const matchedCells = viewModel.workingArea.match.matchedCells;
  const totalCells = viewModel.workingArea.match.totalCells;
  return (
    <div
      data-pr-match-summary="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 12px",
        borderRadius: PR_RADIUS,
        border: `1px solid ${PR_RULE}`,
        background: tokens.color.neutralSurfaceSoft,
        minWidth: 0
      }}
    >
      <span style={{ ...textStyles.label, fontFamily: tokens.font.mono, color: tokens.color.softInk, letterSpacing: "0.04em" }}>
        條件命中
      </span>
      <span style={{ ...prMonoMetaStyle, color: matchedCells ? PR_MOSS : tokens.color.softInk }}>
        {matchedCells} / {totalCells}
      </span>
      <span style={{ ...prMonoMetaStyle, color: tokens.color.softInk }}>
        {viewModel.workingArea.match.caption}
      </span>
      {totals.some((total) => total > 0) ? (
        <span style={{ display: "flex", flexWrap: "wrap", gap: 10, marginLeft: "auto", minWidth: 0 }}>
          {totals.map((total, index) => (
            <span key={index} style={{ ...prMonoMetaStyle, color: total > 0 ? tokens.color.ink : tokens.color.softInk, fontWeight: total > 0 ? 700 : 400 }}>
              C{index + 1}:{total}
            </span>
          ))}
        </span>
      ) : (
        <span style={{ ...prRowTextStyle, color: tokens.color.subInk, marginLeft: "auto" }}>
          先收集貼文，再執行條件判斷。
        </span>
      )}
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
    <SurfaceCard
      tone="default"
      dataAttrs={{ "data-pr-summary": "facts-first" }}
      style={{
        display: "grid",
        gap: 12,
        padding: "14px 16px",
        background: tokens.color.surface
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
    </SurfaceCard>
  );
}

/* Frame 11 export preview — ready status + format cards + systemic-gap note, all from the VM. */
function ExportReadyPanel({ viewModel }: { viewModel: PrEvidenceViewModel }) {
  const rowCount = viewModel.ledger.rows.length;
  if (!rowCount) {
    return null;
  }
  const formats = [
    { id: "csv", name: "CSV", desc: "agent-ready · 逐列", available: Boolean(viewModel.exports.csv) },
    { id: "md", name: "MD", desc: "文章 · 含摘要", available: Boolean(viewModel.exports.summaryMarkdown) },
    { id: "docx", name: "DOCX", desc: "客戶交付", available: Boolean(viewModel.exports.summaryDocx) }
  ];
  const gap = viewModel.criteriaHealth.systemicGap;
  return (
    <section data-pr-export-ready="true" style={{ display: "grid", gap: 8 }}>
      <div
        data-pr-export-ready-card="true"
        style={{ display: "flex", gap: 13, alignItems: "center", padding: "14px 16px", borderRadius: tokens.radius.cardLg, border: "1px solid rgba(122,32,48,0.22)", background: `linear-gradient(180deg, ${tokens.color.surface}, rgba(122,32,48,0.045))` }}
      >
        <span aria-hidden style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(122,32,48,0.10)", color: PR_ACCENT, display: "grid", placeItems: "center", fontSize: 20, flexShrink: 0 }}>✓</span>
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <span style={{ fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 15, fontWeight: 500, color: tokens.color.ink }}>輸出 ready · 含 {rowCount} rows</span>
          <span style={{ ...textStyles.caption, color: tokens.color.softInk }}>
            {viewModel.exports.summaryMarkdown ? "CSV / MD / DOCX 三格式都已備齊" : "CSV 已備 · MD / DOCX 待生成摘要"}
          </span>
        </div>
        <span style={{ marginLeft: "auto", ...prMonoMetaStyle, color: PR_ACCENT, whiteSpace: "nowrap" }}>● ready</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {formats.map((format) => (
          <div
            key={format.id}
            data-pr-format-card={format.id}
            style={{ display: "flex", gap: 10, alignItems: "center", padding: "11px 13px", borderRadius: PR_RADIUS, border: `1px solid ${PR_RULE}`, background: tokens.color.surface, minWidth: 0 }}
          >
            <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: tokens.color.ink }}>{format.name}</span>
              <span style={{ fontSize: 10, color: tokens.color.softInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{format.desc}</span>
            </span>
            <span style={{ marginLeft: "auto", ...textStyles.label, fontFamily: tokens.font.mono, color: format.available ? PR_MOSS : tokens.color.softInk, background: format.available ? tokens.color.successSoft : tokens.color.neutralSurfaceSoft, padding: "2px 7px", borderRadius: 4, whiteSpace: "nowrap" }}>
              {format.available ? "可用" : "—"}
            </span>
          </div>
        ))}
      </div>
      {gap ? (
        <div
          data-pr-export-gap-note="true"
          style={{ ...prRowTextStyle, color: tokens.color.subInk, padding: "9px 12px", borderRadius: PR_RADIUS, border: "1px solid rgba(122,32,48,0.20)", background: "rgba(122,32,48,0.04)" }}
        >
          <b style={{ color: PR_ACCENT, fontWeight: 600 }}>{gap.label} gap note</b> 已寫進輸出:此條件 {gap.missingRows} 列全無命中,交付方已知此限制。
        </div>
      ) : null}
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
          onCommand={(command) => void dispatchCommand(command)}
        />

        <NoticeBar notice={viewModel.notice} />

        <ExportReadyPanel viewModel={viewModel} />

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
    <SurfaceCard
      tone="default"
      dataAttrs={{ "data-pr-summary-cta": "empty" }}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: tokens.spacing.md,
        alignItems: "center",
        flexWrap: "wrap",
        padding: "12px 14px",
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
    </SurfaceCard>
  );
}

export const prEvidenceViewTestables = {
  metricLine,
  summarizeAdvancedMetricsNotice,
  CsvPreview,
  EvidenceLedger,
  CriteriaHealth
};
