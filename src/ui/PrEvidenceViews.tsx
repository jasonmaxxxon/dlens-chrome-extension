import { memo, useEffect, useRef, useState } from "react";
import { Download, ExternalLink } from "lucide-react";

import type { PrCampaignSaveDraft } from "../state/pr-evidence-storage.ts";
import {
  metricLine,
  summarizeAdvancedMetricsNotice,
  type PrCriterionSetupViewModel,
  type PrCriterionStrength,
  type PrEvidenceCommand,
  type PrEvidenceCsvPreviewViewModel,
  type PrEvidenceRowViewModel,
  type PrEvidenceViewModel,
  type PrNarrativeClaimViewModel,
  type PrNarrativeEvidenceViewModel,
  type PrNarrativeViewStatus
} from "../viewmodel/pr-evidence.ts";
import {
  AttentionBeam,
  Kicker,
  ModeHeader,
  PrimaryButton,
  SCAN_ROW_HOVER_CSS,
  SecondaryButton,
  SegmentedTabs,
  Stamp,
  SurfaceCard,
  WorkspaceSurface,
  viewRootStyle
} from "./components.tsx";
import { CollectorGist, CollectorMetricStrip } from "./CollectorMetricStrip.tsx";
import { useUiText } from "./i18n.ts";
import { tokens } from "./tokens.ts";

const panel = tokens.panel;

const accentButtonStyle = {
  borderColor: panel.accent,
  background: panel.accentSoft,
  color: panel.accent,
  fontWeight: 600
} as const;

const compactButtonStyle = {
  padding: `${(panel.space.xs + panel.space.xxs)}px ${(panel.space.sm + panel.space.xxs)}px`,
  fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight, fontWeight: panel.type.micro.fontWeight
} as const;

const exportButtonStyle = {
  borderColor: panel.success,
  background: panel.successSoft,
  color: panel.success,
  fontWeight: 600
} as const;

const PR_RADIUS = panel.radius.md;
const PR_RULE = panel.border;
const PR_ACCENT = panel.accent;
const PR_MOSS = panel.success;
const PR_ROUND = panel.radius.pill;

const prMonoMetaStyle = {
  ...panel.type.micro,
  fontSize: panel.type.micro.fontSize,
  lineHeight: panel.type.micro.lineHeight,
  fontWeight: 500
} as const;

function ExportButtonContent({ format, label = "匯出" }: { format: "csv" | "md" | "docx"; label?: string }) {
  const upper = format.toUpperCase();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: (panel.space.xs + panel.space.xxs), minWidth: 0 }}>
      <Download data-pr-export-download-icon={format} size={panel.size.icon} strokeWidth={panel.iconStrokeWidth} aria-hidden="true" />
      <span style={{ fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight, fontWeight: 600 }}>{label}</span>
      <span
        data-pr-export-format-tag={format}
        style={{
          fontFamily: tokens.font.sans,
          fontSize: panel.type.micro.fontSize,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: 0,
          lineHeight: panel.type.micro.lineHeight
        }}
      >
        {upper}
      </span>
    </span>
  );
}

const prRowTextStyle = {
  ...panel.type.bodySm,
  lineHeight: panel.type.bodySm.lineHeight
} as const;

/* ── Notice bar: success/error tones ────────────────────────────────── */

function NoticeBar({ notice }: { notice: string }) {
  if (!notice) return null;
  const isError = /error|fail|invalid|cannot|save a campaign/i.test(notice);
  return (
    <div
      style={{
        fontSize: panel.type.meta.fontSize, fontWeight: panel.type.meta.fontWeight,
        lineHeight: panel.type.meta.lineHeight,
        padding: `${panel.space.sm}px ${(panel.space.sm + panel.space.xxs)}px`,
        borderRadius: PR_RADIUS,
        background: isError ? panel.dangerSoft : panel.successSoft,
        color: isError ? panel.danger : panel.success,
        transition: `transform ${panel.motion.base} ${panel.motion.standard}, opacity ${panel.motion.base} ${panel.motion.standard}`
      }}
    >
      {notice}
    </div>
  );
}

const CAMPAIGN_EDITOR_CSS = `
[data-pr-field]:focus-visible {
  border-color: ${panel.accent} !important;
  box-shadow: ${panel.focusRing} !important;
  outline: none !important;
}
[data-pr-section] + [data-pr-section] {
  border-top: 1px solid ${panel.border};
  padding-top: ${panel.space.md}px;
}
`;

function parseCoreMessage(raw: string): { label: string | null; value: string } {
  const idx = raw.indexOf(": ");
  if (idx > 0 && idx < 40) {
    return { label: raw.slice(0, idx), value: raw.slice(idx + 2) };
  }
  return { label: null, value: raw };
}

const CRITERION_GHOST_BUTTON_STYLE = {
  padding: `${panel.space.xs}px ${panel.space.sm}px`,
  fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight,
  fontWeight: 500
} as const;

/*
 * One criterion, three separate acts: confirm the AI candidate, correct it, or
 * mark it as not mentioned in the brief. Marking is not a confirmation, so it
 * never shares the confirm button, and only a candidate the brief actually
 * backs gets the emphasised confirm (docs/mockups review F6/F7).
 */
function CriterionReviewRow({
  criterion,
  onLabelChange,
  onDispatch
}: {
  criterion: PrCriterionSetupViewModel;
  onLabelChange: (label: string) => void;
  onDispatch: (command: PrEvidenceCommand) => void;
}) {
  const statusTone = criterion.status === "not_mentioned"
    ? panel.ink3
    : criterion.status === "candidate"
      ? PR_ACCENT
      : criterion.status === "confirmed"
        ? PR_MOSS
        : panel.ink2;
  return (
    <div
      data-pr-criterion-row={criterion.id}
      data-pr-criterion-status={criterion.status}
      style={{
        display: "grid",
        gap: panel.space.xs,
        padding: `${panel.space.sm}px 0`,
        borderTop: `1px solid ${panel.border}`
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: (panel.space.sm + panel.space.xxs), minWidth: 0 }}>
        <span style={{ ...prMonoMetaStyle, color: panel.ink3, flex: "0 0 18px" }}>
          {criterion.numberLabel}
        </span>
        {criterion.editable ? (
          <input
            data-pr-field={`criterion-${criterion.index}`}
            value={criterion.label}
            onChange={(event) => onLabelChange(event.target.value)}
            placeholder={criterion.placeholder}
            style={{
              flex: 1,
              minWidth: 0,
              boxSizing: "border-box",
              fontFamily: tokens.font.sans,
              fontSize: panel.type.meta.fontSize, lineHeight: panel.type.meta.lineHeight, fontWeight: panel.type.meta.fontWeight,
              padding: `${panel.space.sm}px ${panel.space.sm}px`,
              background: panel.surface,
              border: `1px solid ${PR_RULE}`,
              borderRadius: panel.radius.md,
              color: panel.ink,
              outline: "none"
            }}
          />
        ) : (
          <span
            data-pr-criterion-label={criterion.id}
            style={{
              ...prRowTextStyle,
              flex: 1,
              minWidth: 0,
              color: criterion.status === "not_mentioned" ? panel.ink3 : panel.ink,
              fontWeight: 500
            }}
          >
            {criterion.status === "not_mentioned" ? "brief 未提及" : criterion.label}
          </span>
        )}
        <span
          data-pr-criterion-status-chip={criterion.status}
          style={{ ...prMonoMetaStyle, color: statusTone, whiteSpace: "nowrap" }}
        >
          {criterion.statusLabel}
        </span>
      </div>
      {criterion.supportLabel ? (
        <p
          data-pr-criterion-support={criterion.supported ? "found" : "missing"}
          style={{
            margin: 0,
            paddingLeft: (panel.space.xxl + panel.space.xs),
            ...panel.type.micro,
            color: criterion.supported ? panel.ink2 : PR_AMBER
          }}
        >
          {criterion.supportLabel}
          {criterion.supportExcerpt ? `：「${criterion.supportExcerpt}」` : ""}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: (panel.space.xs + panel.space.xxs), paddingLeft: (panel.space.xxl + panel.space.xs), flexWrap: "wrap" }}>
        {criterion.confirmCommand ? (
          <SecondaryButton
            onClick={() => onDispatch(criterion.confirmCommand as PrEvidenceCommand)}
            dataAttrs={{ "data-pr-criterion-confirm": criterion.id }}
            style={criterion.confirmEmphasis
              ? { ...accentButtonStyle, ...CRITERION_GHOST_BUTTON_STYLE, fontWeight: 600 }
              : CRITERION_GHOST_BUTTON_STYLE}
          >
            {criterion.confirmLabel}
          </SecondaryButton>
        ) : null}
        {criterion.correctCommand ? (
          <SecondaryButton
            onClick={() => onDispatch(criterion.correctCommand as PrEvidenceCommand)}
            dataAttrs={{ "data-pr-criterion-correct": criterion.id }}
            style={CRITERION_GHOST_BUTTON_STYLE}
          >
            更正
          </SecondaryButton>
        ) : null}
        {criterion.notMentionedCommand ? (
          <SecondaryButton
            onClick={() => onDispatch(criterion.notMentionedCommand as PrEvidenceCommand)}
            dataAttrs={{ "data-pr-criterion-not-mentioned": criterion.id }}
            style={CRITERION_GHOST_BUTTON_STYLE}
          >
            標記為未提及
          </SecondaryButton>
        ) : null}
      </div>
    </div>
  );
}

function CampaignEditor({
  campaign,
  onChange,
  onDispatch,
  onSave,
  onGenerateCriteria,
  canGenerateCriteria,
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
  onDispatch: (command: PrEvidenceCommand) => void;
  onSave: () => void;
  onGenerateCriteria: () => void;
  canGenerateCriteria: boolean;
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

  function updateCriterion(criterionId: string, label: string) {
    const criteria = campaign.saveDraft.criteria.map((criterion) =>
      criterion.id === criterionId ? { ...criterion, label } : criterion
    ) as PrCampaignSaveDraft["criteria"];
    onChange({ ...campaign.saveDraft, criteria });
  }

  function updateNarrativeSetting(
    key: keyof NonNullable<PrCampaignSaveDraft["narrativeSettings"]>,
    value: string
  ) {
    onChange({
      ...campaign.saveDraft,
      narrativeSettings: {
        ...campaign.narrativeSettings,
        [key]: value
      }
    });
  }

  const parsedMessages = coreMessages.slice(0, 5).map(parseCoreMessage);
  const briefPreview = campaign.briefText.split("\n").find((l) => l.trim()) ?? "";
  const fieldLabelStyle = {
    fontFamily: tokens.font.sans,
    fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight,
    fontWeight: 600,
    letterSpacing: 0,
    color: panel.ink2
  } as const;
  const inputLineStyle = {
    width: "100%",
    boxSizing: "border-box",
    fontFamily: tokens.font.sans,
    fontSize: panel.type.meta.fontSize, lineHeight: panel.type.meta.lineHeight,
    fontWeight: 400,
    padding: `${panel.space.sm}px ${(panel.space.sm + panel.space.xxs)}px`,
    background: panel.surface,
    border: `1px solid ${PR_RULE}`,
    borderRadius: panel.radius.md,
    color: panel.ink,
    outline: "none",
    margin: 0,
    transition: `transform ${panel.motion.fast} ${panel.motion.standard}, opacity ${panel.motion.fast} ${panel.motion.standard}`
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
          gap: panel.space.md,
          padding: `${panel.space.sm}px 0`,
          borderBottom: `1px dashed ${PR_RULE}`,
          borderRadius: PR_RADIUS
        }}
      >
        <span style={{ ...fieldLabelStyle, flex: "0 0 96px" }}>活動</span>
        <span style={{ fontSize: panel.type.bodySm.fontSize, lineHeight: panel.type.bodySm.lineHeight, fontWeight: 600, color: panel.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {campaign.name || "未命名活動"}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: (panel.space.xs + panel.space.xxs), color: PR_MOSS, fontSize: panel.type.meta.fontSize, lineHeight: panel.type.meta.lineHeight, fontWeight: 600 }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: PR_ROUND, background: PR_MOSS }} />
          已設定
        </span>
        <SecondaryButton
          onClick={() => onExpand?.()}
          style={compactButtonStyle}
          dataAttrs={{ "data-pr-open-settings": "summary" }}
        >
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
        gap: panel.space.md,
        padding: `0 0 ${panel.space.lg}px`,
        borderBottom: `1px dashed ${PR_RULE}`,
        borderRadius: PR_RADIUS
      }}
    >
      <style>{CAMPAIGN_EDITOR_CSS}</style>

        {/* ── Campaign name ─────────────────────────────────────────── */}
        <div data-pr-section="name">
          <label style={{ display: "grid", gap: (panel.space.xs + panel.space.xxs) }}>
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
        <div data-pr-section="brief" style={{ display: "grid", gap: panel.space.sm }}>

          {/* Header row — always visible */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: panel.space.sm }}>
            <span style={fieldLabelStyle}>
              新聞稿 / PR brief
            </span>
            <div style={{ display: "flex", gap: (panel.space.xs + panel.space.xxs), alignItems: "center" }}>
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
                gap: panel.space.sm,
                padding: `${panel.space.sm}px ${(panel.space.sm + panel.space.xxs)}px`,
                borderRadius: PR_RADIUS,
                border: `1px solid ${PR_RULE}`,
                background: panel.surface,
                cursor: "default"
              }}
            >
              <div
                style={{
                  flex: 1,
                  fontSize: panel.type.meta.fontSize, lineHeight: panel.type.meta.lineHeight, fontWeight: panel.type.meta.fontWeight,
                  color: panel.ink3,
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
                  fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight,
                  fontWeight: 600,
                  color: panel.ink3,
                  background: panel.surfaceSunken,
                  padding: `${panel.space.xxs}px ${panel.space.sm}px`,
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
                  fontSize: panel.type.bodySm.fontSize, fontWeight: panel.type.bodySm.fontWeight,
                  lineHeight: panel.type.bodySm.lineHeight,
                  padding: `${panel.space.md}px ${(panel.space.md + panel.space.xxs)}px`,
                  background: panel.surfaceSubtle,
                  border: `1px solid ${PR_RULE}`,
                  color: panel.ink2,
                  outline: "none",
                  resize: "vertical",
                  minHeight: 88,
                  borderRadius: PR_RADIUS
                }}
              />
              {uploadError ? (
                <div data-pr-upload-error="true" style={{ fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight, fontWeight: panel.type.micro.fontWeight, color: panel.danger }}>
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
                background: panel.surfaceSubtle,
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: (panel.space.xs + panel.space.xxs),
                  padding: `${panel.space.sm}px ${(panel.space.sm + panel.space.xxs)}px`,
                  borderBottom: `1px solid ${panel.border}`,
                  background: panel.accentSoft
                }}
              >
                <svg width={panel.size.icon} height={panel.size.icon} viewBox="0 0 24 24" fill="none" stroke={panel.accent} strokeWidth={panel.iconStrokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                      gap: panel.space.sm,
                      alignItems: "start",
                      padding: `${panel.space.sm}px ${(panel.space.sm + panel.space.xxs)}px`,
                      borderBottom: i < parsedMessages.length - 1 ? `1px solid ${panel.border}` : "none"
                    }}
                  >
                    {label ? (
                      <span
                        style={{
                          fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight,
                          fontWeight: 600,
                          color: panel.accent,
                          background: panel.accentSoft,
                          padding: `${panel.space.xxs}px ${panel.space.sm}px`,
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
                        fontSize: panel.type.micro.fontSize, fontWeight: panel.type.micro.fontWeight,
                        lineHeight: panel.type.micro.lineHeight,
                        color: panel.ink2,
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

        {/* ── Narrative definition ─────────────────────────────────── */}
        <div data-pr-section="narrative" style={{ display: "grid", gap: (panel.space.sm + panel.space.xxs) }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: (panel.space.sm + panel.space.xxs) }}>
            <span style={fieldLabelStyle}>敘事判讀設定</span>
            <span style={{ ...prMonoMetaStyle, color: panel.ink3 }}>提供給 AI 的判讀邊界</span>
          </div>
          <label style={{ display: "grid", gap: (panel.space.xs + panel.space.xxs) }}>
            <span style={fieldLabelStyle}>核心敘事</span>
            <textarea
              aria-label="核心敘事"
              data-pr-field="narrative-anchor"
              value={campaign.narrativeSettings.narrativeAnchor}
              onChange={(event) => updateNarrativeSetting("narrativeAnchor", event.target.value)}
              placeholder="這個活動希望市場記住的主要說法"
              rows={2}
              style={{ ...inputLineStyle, lineHeight: panel.type.bodySm.lineHeight, resize: "vertical", minHeight: 58 }}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: panel.space.md }}>
            <label style={{ display: "grid", gap: (panel.space.xs + panel.space.xxs) }}>
              <span style={fieldLabelStyle}>目標受眾</span>
              <input
                aria-label="目標受眾"
                data-pr-field="target-audience"
                value={campaign.narrativeSettings.targetAudience}
                onChange={(event) => updateNarrativeSetting("targetAudience", event.target.value)}
                placeholder="希望被說服或採取行動的人"
                style={inputLineStyle}
              />
            </label>
            <label style={{ display: "grid", gap: (panel.space.xs + panel.space.xxs) }}>
              <span style={fieldLabelStyle}>希望行動</span>
              <input
                aria-label="希望行動"
                data-pr-field="desired-action"
                value={campaign.narrativeSettings.desiredAction}
                onChange={(event) => updateNarrativeSetting("desiredAction", event.target.value)}
                placeholder="閱讀後希望對方採取的行動"
                style={inputLineStyle}
              />
            </label>
          </div>
        </div>

        {/* ── PR matching criteria ──────────────────────────────────── */}
        <div data-pr-section="criteria" style={{ display: "grid", gap: panel.space.sm }}>
          {campaign.briefText.trim() ? (
            <div
              data-pr-criteria-ai-banner="true"
              style={{ display: "flex", gap: (panel.space.sm + panel.space.xxs), alignItems: "center", padding: `${panel.space.sm}px ${panel.space.md}px`, borderRadius: PR_RADIUS, border: `1px solid ${panel.border}`, background: panel.surfaceSubtle }}
            >
              <span aria-hidden style={{ width: 28, height: 28, borderRadius: panel.radius.sm, background: panel.accentSoft, color: PR_ACCENT, display: "grid", placeItems: "center", fontSize: panel.type.body.fontSize, lineHeight: panel.type.body.lineHeight, fontWeight: panel.type.body.fontWeight, flexShrink: 0 }}>✦</span>
              <span data-pr-criteria-caption="true" style={{ ...prRowTextStyle, color: panel.ink2, minWidth: 0 }}>
                {campaign.criteriaCaption}
              </span>
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", gap: (panel.space.sm + panel.space.xxs), alignItems: "center" }}>
            <span style={fieldLabelStyle}>
              PR 判斷條件
            </span>
            <SecondaryButton
              onClick={onGenerateCriteria}
              ariaBusy={isGenerating}
              dataAttrs={{ "data-pr-criteria-generate": "true" }}
              disabled={!canGenerateCriteria || isReadingBrief || isGenerating}
              style={{ ...accentButtonStyle, ...compactButtonStyle }}
            >
              <AttentionBeam
                state={isGenerating ? "generating" : canGenerateCriteria && !isReadingBrief ? "actionable" : "none"}
                generatingLabel="生成中..."
              >
                生成條件
              </AttentionBeam>
            </SecondaryButton>
          </div>
          <div data-pr-criteria-review="true" style={{ display: "grid" }}>
            {campaign.criteriaSetup.map((criterion) => (
              <CriterionReviewRow
                key={criterion.id}
                criterion={criterion}
                onLabelChange={(label) => updateCriterion(criterion.id, label)}
                onDispatch={onDispatch}
              />
            ))}
          </div>
        </div>

        {/* ── Save ─────────────────────────────────────────────────── */}
        <div data-pr-section="save" style={{ paddingTop: panel.space.xs, display: "flex", gap: panel.space.sm, alignItems: "center" }}>
          <PrimaryButton onClick={onSave} disabled={isSaving || !campaign.name.trim()} style={compactButtonStyle}>
            {isSaving ? "儲存中..." : "儲存活動"}
          </PrimaryButton>
          <SecondaryButton onClick={() => onCollapse?.()} style={compactButtonStyle}>
            取消
          </SecondaryButton>
          <span style={{ ...prMonoMetaStyle, marginLeft: `auto`, color: panel.ink3 }}>
            儲存後自動同步
          </span>
        </div>
    </section>
  );
}

/* Frame 6 header stats — captured / strong / criteria gaps, derived from criteria health. */
function PrEvidenceHeaderStats({ health }: { health: PrEvidenceViewModel["criteriaHealth"] }) {
  if (!health.totalRows) {
    return null;
  }
  const needsWorkCount = health.criteria.filter((entry) => entry.strength !== "strong").length;
  const cell = (id: "captured" | "strong" | "criteria-gap", value: string, label: string, tone: string) => (
    <span
      data-pr-evidence-header-stat={id}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: panel.space.xs,
        minWidth: 0,
        fontFamily: tokens.font.sans,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap"
      }}
    >
      <b style={{ fontSize: panel.type.bodySm.fontSize, lineHeight: panel.type.bodySm.lineHeight, fontWeight: 600, color: tone }}>{value}</b>
      <span style={{ fontSize: panel.type.micro.fontSize, fontWeight: panel.type.micro.fontWeight, lineHeight: panel.type.micro.lineHeight, color: panel.ink3 }}>{label}</span>
    </span>
  );
  return (
    <div
      data-pr-evidence-header-stats="true"
      data-pr-criteria-health-kpis="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: panel.space.md,
        flexWrap: "wrap",
        padding: `${panel.space.sm}px 0 ${panel.space.xs}px`,
        minWidth: 0
      }}
    >
      {cell("captured", String(health.totalRows), "Captured", PR_ACCENT)}
      {cell("strong", String(health.strongRows), "Strong", PR_MOSS)}
      {cell("criteria-gap", `+${needsWorkCount}`, "Criteria 待補", PR_AMBER)}
    </div>
  );
}

function rowEvidenceStrength(row: PrEvidenceRowViewModel): PrCriterionStrength {
  if (row.strong) return "strong";
  if (row.matchedCount > 0) return "partial";
  return "gap";
}

function EvidenceStrengthChip({ row }: { row: PrEvidenceRowViewModel }) {
  const strength = rowEvidenceStrength(row);
  const meta = CRITERIA_STRENGTH_META[strength];
  return (
    <span
      data-pr-evidence-strength-chip={strength}
      title={row.matchCountAriaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: panel.space.xs,
        justifySelf: "end",
        alignSelf: "center",
        padding: `${panel.space.xs}px ${panel.space.sm}px`,
        borderRadius: PR_ROUND,
        border: `1px solid ${meta.rowBorder}`,
        background: meta.rowBg,
        color: meta.accent,
        fontFamily: tokens.font.sans,
        fontSize: panel.type.micro.fontSize,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        lineHeight: panel.type.micro.lineHeight,
        whiteSpace: "nowrap"
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: PR_ROUND, background: meta.accent }} />
      {strength}
    </span>
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
            paddingTop: panel.space.md,
            borderRadius: PR_RADIUS,
            minWidth: 0
          }}
        >
          <summary
            data-dlens-presence="row"
            className="dlens-tactile-row"
            style={{
              listStyle: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "baseline",
              gap: panel.space.sm,
              color: panel.ink,
              fontFamily: tokens.font.sans,
              fontSize: panel.type.heading.fontSize, lineHeight: panel.type.heading.lineHeight,
              fontWeight: 600
            }}
          >
            <span style={{ fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight, fontWeight: panel.type.micro.fontWeight, color: panel.ink3 }}>▸</span>
            已儲存貼文
            <span style={{ ...prMonoMetaStyle, marginLeft: `auto`, color: panel.ink3 }}>
              {caption}
            </span>
          </summary>
          <div style={{ display: "grid", gap: (panel.space.sm + panel.space.xxs), paddingTop: (panel.space.sm + panel.space.xxs) }}>
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
                      gridTemplateColumns: "26px minmax(0, 1fr) auto",
                      gap: (panel.space.sm + panel.space.xxs),
                      padding: `${panel.space.md}px ${panel.space.xs}px`,
                      borderBottom: `1px solid ${PR_RULE}`,
                      background: "transparent",
                      cursor: "default",
                      transition: `transform ${panel.motion.fast} ${panel.motion.standard}, opacity ${panel.motion.fast} ${panel.motion.standard}`,
                      minWidth: 0
                    }}
                  >
                    <span
                      data-pr-evidence-audit-number={auditNumber}
                      style={{
                        ...panel.type.meta,
                        color: PR_ACCENT,
                        fontWeight: 600,
                        paddingTop: panel.space.xxs,
                        textAlign: "center",
                        letterSpacing: 0
                      }}
                    >
                      {auditNumber}
                    </span>
                    <div style={{ display: "grid", gap: panel.space.sm, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: panel.space.sm, flexWrap: "wrap", minWidth: 0 }}>
                        <span
                          style={{
                            ...prMonoMetaStyle,
                            color: panel.ink,
                            maxWidth: 124,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {row.authorLabel}
                        </span>
                        <span style={{ flex: 1 }} />
                        <SourceLinkIcon row={row} />
                        <CriterionChips row={row} variant="compact" />
                        <span style={{ ...prMonoMetaStyle, color: panel.ink3 }}>
                          {row.collectedAtLabel}
                        </span>
                      </div>
                      <span
                        data-pr-evidence-gist="true"
                        style={{ display: "grid", minWidth: 0 }}
                      >
                        <CollectorGist lines={2}>{row.captionLabel}</CollectorGist>
                      </span>
                      <CollectorMetricStrip descriptor={row.collectorDescriptor} marker={row.id} />
                    </div>
                    <EvidenceStrengthChip row={row} />
                  </article>
                );
              })}
            </div>
          </div>
        </details>
      ) : (
        <div style={{ padding: `${panel.space.lg}px ${panel.space.md}px`, borderRadius: PR_RADIUS, border: `1px solid ${PR_RULE}`, background: panel.surface, fontSize: panel.type.meta.fontSize, lineHeight: panel.type.meta.lineHeight, fontWeight: panel.type.meta.fontWeight, color: panel.ink2 }}>
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
    width: panel.size.button,
    height: panel.size.button,
    borderRadius: PR_ROUND,
    background: `linear-gradient(135deg, ${panel.surfaceSubtle}, ${panel.surfaceSunken})`,
    border: `1px solid ${PR_RULE}`,
    color: href ? PR_ACCENT : panel.ink3,
    display: "inline-grid",
    placeItems: "center",
    textDecoration: "none",
    opacity: href ? 1 : 0.42,
    transition: `transform ${panel.motion.fast} ${panel.motion.standard}, opacity ${panel.motion.fast} ${panel.motion.standard}`
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
      <ExternalLink size={panel.size.icon} strokeWidth={panel.iconStrokeWidth} aria-hidden="true" />
    </a>
  );
}

function CriterionChips({ row, variant }: { row: PrEvidenceRowViewModel; variant: "full" | "compact" }) {
  const matchedTotal = row.matchedCount;
  if (variant === "compact") {
    const tone = row.strong ? PR_MOSS : matchedTotal > 0 ? PR_ACCENT : panel.ink3;
    const soft = row.strong ? panel.successSoft : matchedTotal > 0 ? panel.accentSoft : panel.surfaceSubtle;
    return (
      <span
        data-pr-match-indicator="true"
        aria-label={matchedTotal === 0 ? "No criteria matched yet" : row.matchCountAriaLabel}
        title={matchedTotal === 0 ? "No criteria matched yet" : row.matchedCriterionLabels.join(" · ")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: (panel.space.xs + panel.space.xxs),
          flexWrap: "nowrap",
          ...panel.type.meta,
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
        {row.matchCountLabel}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: (panel.space.md + panel.space.xxs), paddingLeft: panel.space.xxs }}>
      {row.criteria.map((criterion) => {
        const matched = criterion.matched;
        return (
          <span
            key={criterion.id}
            title={criterion.label || criterion.id}
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: panel.space.xs,
              color: matched ? PR_MOSS : panel.ink3,
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

const PR_AMBER = panel.warning;

const CRITERIA_STRENGTH_META: Record<PrCriterionStrength, { accent: string; rowBg: string; rowBorder: string; status: string }> = {
  strong: { accent: PR_MOSS, rowBg: panel.surface, rowBorder: PR_RULE, status: "OK" },
  partial: { accent: PR_AMBER, rowBg: panel.warningSoft, rowBorder: panel.warning, status: "半弱" },
  gap: { accent: PR_ACCENT, rowBg: panel.dangerSoft, rowBorder: panel.danger, status: "GAP" }
};

/* Frame 6 · PR Criteria Health — header stats + criterion coverage lanes + systemic-gap callout. */
const CRITERIA_HEALTH_DISCLOSURE_CSS = `
[data-pr-criteria-health-detail] > summary::-webkit-details-marker {
  display: none;
}
`;

function CriteriaHealth({ health, rows }: { health: PrEvidenceViewModel["criteriaHealth"]; rows: PrEvidenceRowViewModel[] }) {
  if (!health.totalRows) {
    return null;
  }
  const monoStat = { fontFamily: tokens.font.sans, fontVariantNumeric: "tabular-nums" } as const;

  return (
    <SurfaceCard
      tone="default"
      dataAttrs={{ "data-pr-criteria-health": "true" }}
      style={{ display: "grid", gap: panel.space.md, padding: `${(panel.space.md + panel.space.xxs)}px ${panel.space.lg}px`, background: panel.surface }}
    >
      <style>{CRITERIA_HEALTH_DISCLOSURE_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: (panel.space.sm + panel.space.xxs), flexWrap: "wrap" }}>
        <Kicker>條件健康度</Kicker>
        <span style={{ ...prMonoMetaStyle, color: panel.ink3 }}>
          依 {health.totalRows} 列 evidence 反推
        </span>
      </div>

      <PrEvidenceHeaderStats health={health} />

      <div style={{ display: "grid", gap: (panel.space.xs + panel.space.xxs) }}>
        {health.criteria.map((entry) => {
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
              data-pr-criteria-coverage-row={entry.id}
              data-pr-criteria-coverage-ratio={String(pct)}
              style={{
                borderRadius: panel.radius.xs,
                border: `1px solid ${meta.rowBorder}`,
                background: meta.rowBg,
                overflow: "hidden"
              }}
            >
              <summary
                data-dlens-presence="row"
                className="dlens-tactile-row"
                style={{
                  listStyle: "none",
                  cursor: "pointer",
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: (panel.space.sm + panel.space.xxs),
                  alignItems: "center",
                  padding: `${panel.space.sm}px ${panel.space.md}px`
                }}
              >
                <span style={{ display: "grid", gap: (panel.space.xs + panel.space.xxs), minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: panel.space.sm, minWidth: 0 }}>
                    <span
                      data-pr-criteria-strength-dot={entry.id}
                      aria-label={`${entry.strength} coverage`}
                      style={{ width: 7, height: 7, borderRadius: PR_ROUND, background: meta.accent, flexShrink: 0 }}
                    />
                    <span
                      data-pr-criteria-id={entry.id}
                      style={{
                        ...monoStat,
                        fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight,
                        fontWeight: 600,
                        color: PR_ACCENT,
                        background: panel.accentSoft,
                        border: `1px solid ${PR_RULE}`,
                        padding: `${panel.space.xxs}px ${panel.space.xs}px`,
                        borderRadius: panel.radius.xs,
                        textAlign: "center"
                      }}
                    >
                      {entry.id.toUpperCase()}
                    </span>
                    <span style={{ ...prRowTextStyle, color: panel.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.label}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    data-pr-criteria-coverage-bar={entry.id}
                    style={{
                      position: "relative",
                      height: 6,
                      width: "100%",
                      borderRadius: PR_ROUND,
                      background: panel.surfaceSunken,
                      overflow: "hidden"
                    }}
                  >
                    <span
                      data-pr-criteria-coverage-fill={entry.id}
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${pct}%`,
                        background: meta.accent
                      }}
                    />
                  </span>
                </span>
                <span style={{ display: "grid", gap: panel.space.xs, justifyItems: "end" }}>
                  <span
                    data-pr-criteria-coverage-count={entry.id}
                    style={{ ...monoStat, fontSize: panel.type.bodySm.fontSize, lineHeight: panel.type.bodySm.lineHeight, fontWeight: 600, color: meta.accent, textAlign: "right", whiteSpace: "nowrap" }}
                  >
                    {entry.matchedRows}/{entry.totalRows}
                  </span>
                  <span style={{ ...monoStat, fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight, fontWeight: 600, color: meta.accent, textAlign: "right", minWidth: 30 }}>
                    {meta.status}
                  </span>
                </span>
              </summary>
              <div
                data-pr-criteria-health-matches={entry.id}
                style={{
                  display: "grid",
                  gap: panel.space.xs,
                  padding: `0 ${panel.space.md}px ${(panel.space.sm + panel.space.xxs)}px ${panel.space.section}px`
                }}
              >
                {matchedRows.length ? matchedRows.map((row) => (
                  <div
                    key={row.id}
                    data-pr-criteria-health-match-row="true"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 98px) minmax(0, 1fr) auto",
                      gap: panel.space.sm,
                      alignItems: "baseline",
                      padding: `${(panel.space.xs + panel.space.xxs)}px 0`,
                      borderTop: `1px solid ${panel.border}`
                    }}
                  >
                    <span style={{ ...prMonoMetaStyle, color: panel.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.authorLabel}
                    </span>
                    <span style={{ ...panel.type.micro, color: panel.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.captionLabel}
                    </span>
                    <span style={{ ...prMonoMetaStyle, color: row.strong ? PR_MOSS : PR_ACCENT }}>
                      {row.matchCountLabel}
                    </span>
                  </div>
                )) : (
                  <span style={{ ...panel.type.micro, color: panel.ink3, paddingTop: (panel.space.xs + panel.space.xxs) }}>
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
            gap: panel.space.xs,
            padding: `${(panel.space.sm + panel.space.xxs)}px ${panel.space.md}px`,
            borderRadius: PR_RADIUS,
            background: panel.dangerSoft,
            border: `1px solid ${panel.danger}`,
            minWidth: 0
          }}
        >
          <span style={{ ...panel.type.micro, fontFamily: tokens.font.sans, color: PR_ACCENT, letterSpacing: 0, textTransform: "none", fontWeight: 600 }}>
            系統性缺口 · {health.systemicGap.label}
          </span>
          <span style={{ ...prRowTextStyle, color: panel.ink2, minWidth: 0 }}>
            {health.systemicGap.label} 在 {health.systemicGap.missingRows} 列 evidence 全無命中,屬結構性缺欄,需先補來源才補得起來。
          </span>
        </div>
      ) : null}
    </SurfaceCard>
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
      style={{ display: "grid", gap: panel.space.md, marginBottom: panel.space.xl, minWidth: 0 }}
    >
      <div
        data-pr-workflow-toolbar="true"
        style={{
          display: "flex",
          alignItems: "center",
          gap: panel.space.sm,
          borderBottom: `1px solid ${PR_RULE}`,
          paddingBottom: panel.space.sm,
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
          dataAttrs={{ "data-pr-export-button": "csv", "aria-label": "匯出 CSV" }}
        >
          <ExportButtonContent format="csv" />
        </PrimaryButton>
      </div>

      {hasMatchResult ? <CriteriaHealth health={viewModel.criteriaHealth} rows={rows} /> : null}

      <MatchSummary viewModel={viewModel} />

      <EvidenceLedger rows={rows} caption={viewModel.workingArea.ledgerCaption} />

      <details
        data-pr-metrics-detail="collapsed"
        style={{
          borderTop: `1px solid ${PR_RULE}`,
          paddingTop: panel.space.md,
          borderRadius: PR_RADIUS
        }}
      >
        <summary
          data-dlens-presence="row"
          className="dlens-tactile-row"
          style={{
            listStyle: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "baseline",
            gap: panel.space.sm,
            color: panel.ink,
            fontFamily: tokens.font.sans,
            fontSize: panel.type.heading.fontSize, lineHeight: panel.type.heading.lineHeight,
            fontWeight: 600
          }}
        >
          <span style={{ fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight, fontWeight: panel.type.micro.fontWeight, color: panel.ink3 }}>▸</span>
          進階指標
          <span style={{ ...prMonoMetaStyle, marginLeft: `auto`, color: panel.ink3 }}>
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
        gap: panel.space.md,
        flexWrap: "wrap",
        padding: `${(panel.space.sm + panel.space.xxs)}px ${panel.space.md}px`,
        borderRadius: PR_RADIUS,
        border: `1px solid ${PR_RULE}`,
        background: panel.surfaceSubtle,
        minWidth: 0
      }}
    >
      <span style={{ ...panel.type.micro, fontFamily: tokens.font.sans, color: panel.ink3, letterSpacing: 0 }}>
        條件命中
      </span>
      <span style={{ ...prMonoMetaStyle, color: matchedCells ? PR_MOSS : panel.ink3 }}>
        {matchedCells} / {totalCells}
      </span>
      <span style={{ ...prMonoMetaStyle, color: panel.ink3 }}>
        {viewModel.workingArea.match.caption}
      </span>
      {totals.some((total) => total > 0) ? (
        <span style={{ display: "flex", flexWrap: "wrap", gap: (panel.space.sm + panel.space.xxs), marginLeft: `auto`, minWidth: 0 }}>
          {totals.map((total, index) => (
            <span key={index} style={{ ...prMonoMetaStyle, color: total > 0 ? panel.ink : panel.ink3, fontWeight: total > 0 ? 700 : 400 }}>
              C{index + 1}:{total}
            </span>
          ))}
        </span>
      ) : (
        <span style={{ ...prRowTextStyle, color: panel.ink2, marginLeft: `auto` }}>
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
        gap: panel.space.xs,
        fontFamily: tokens.font.sans,
        fontSize: panel.type.micro.fontSize, fontWeight: panel.type.micro.fontWeight,
        lineHeight: panel.type.micro.lineHeight,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums"
      }}
    >
      <span style={{ color: panel.ink3, fontWeight: 500 }}>{label}</span>
      <span style={{ color: !valuePresent ? panel.ink3 : advanced ? PR_ACCENT : panel.ink, fontWeight: valuePresent ? 700 : 400 }}>
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
                  gap: (panel.space.xs + panel.space.xxs),
                  padding: `${panel.space.md}px ${panel.space.xs}px`,
                  borderBottom: `1px solid ${PR_RULE}`
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: (panel.space.sm + panel.space.xxs), minWidth: 0 }}>
                  <span aria-hidden style={{ width: 22, height: 22, borderRadius: PR_ROUND, background: `linear-gradient(135deg, ${panel.surfaceSubtle}, ${panel.surfaceSunken})`, border: `1px solid ${PR_RULE}`, flexShrink: 0 }} />
                  <div style={{ ...prMonoMetaStyle, color: panel.ink, flexShrink: 0, maxWidth: 124, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.authorLabel}
                  </div>
                  <div style={{ ...prRowTextStyle, flex: 1, minWidth: 0, color: panel.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.captionLabel}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", columnGap: panel.space.lg, rowGap: panel.space.xs, paddingLeft: panel.space.section }}>
                  {row.metrics.map((metric) => (
                    <MetricCell key={metric.label} label={metric.label} value={metric.value} advanced={metric.advanced} />
                  ))}
                </div>
                {row.advancedMetricsError ? (
                  <div style={{ fontSize: panel.type.micro.fontSize, fontWeight: panel.type.micro.fontWeight, lineHeight: panel.type.micro.lineHeight, color: panel.danger, paddingLeft: panel.space.section }}>
                    {row.advancedMetricsError}
                  </div>
                ) : null}
              </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: `${panel.space.lg}px ${panel.space.md}px`, borderRadius: PR_RADIUS, border: `1px solid ${PR_RULE}`, background: panel.surface, fontSize: panel.type.meta.fontSize, lineHeight: panel.type.meta.lineHeight, fontWeight: panel.type.meta.fontWeight, color: panel.ink2 }}>
          先收集貼文，再抓取進階指標。
        </div>
      )}
    </section>
  );
}

function CsvPreview({ preview }: { preview: PrEvidenceCsvPreviewViewModel }) {
  const body = preview.rows;
  return (
    <details data-pr-csv-preview="true" style={{ marginTop: panel.space.xs, borderTop: `1px solid ${PR_RULE}`, paddingTop: (panel.space.lg + panel.space.xxs), borderRadius: PR_RADIUS }}>
      <summary data-dlens-presence="row" className="dlens-tactile-row" style={{ listStyle: "none", cursor: "pointer", display: "flex", alignItems: "baseline", gap: panel.space.sm, fontFamily: tokens.font.sans, fontSize: panel.type.title.fontSize, lineHeight: panel.type.title.lineHeight, fontWeight: 600, color: panel.ink }}>
        <span style={{ fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight, fontWeight: panel.type.micro.fontWeight, color: panel.ink3 }}>▸</span>
        CSV 預覽
        <span style={{ ...prMonoMetaStyle, marginLeft: `auto`, color: panel.ink3, fontWeight: 500 }}>
          {preview.exportableCountLabel}
        </span>
      </summary>
      <div
        data-pr-csv-preview-layout="wrap"
        style={{
          marginTop: (panel.space.md + panel.space.xxs),
          display: "grid",
          gap: panel.space.sm,
          border: `1px solid ${PR_RULE}`,
          borderRadius: PR_RADIUS,
          background: panel.surface,
          overflow: "hidden"
        }}
      >
        {body.slice(0, 20).length ? body.slice(0, 20).map((line, rowIndex) => (
          <article
            key={rowIndex}
            style={{
              display: "grid",
              gap: panel.space.sm,
              padding: `${(panel.space.sm + panel.space.xxs)}px ${panel.space.md}px`,
              borderBottom: rowIndex < Math.min(body.length, 20) - 1 ? `1px solid ${PR_RULE}` : "none"
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: panel.space.sm, flexWrap: "wrap" }}>
              <span style={{ ...panel.type.micro, fontFamily: tokens.font.sans, color: PR_ACCENT }}>
                第 {rowIndex + 1} 列
              </span>
              <span style={{ ...prMonoMetaStyle, color: panel.ink3 }}>
                {(line[1] || line[0] || "-").slice(0, 72)}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
                gap: panel.space.sm,
                minWidth: 0
              }}
            >
              {preview.header.map((cell, cellIndex) => (
                <div key={`${rowIndex}-${cell}-${cellIndex}`} style={{ display: "grid", gap: panel.space.xs, minWidth: 0 }}>
                  <span style={{ ...panel.type.micro, fontFamily: tokens.font.sans, letterSpacing: 0, color: panel.ink3, overflowWrap: "anywhere" }}>
                    {cell}
                  </span>
                  <span style={{ ...panel.type.micro, fontWeight: 500, color: line[cellIndex] ? panel.ink2 : panel.ink3, overflowWrap: "anywhere" }}>
                    {line[cellIndex] || "-"}
                  </span>
                </div>
              ))}
            </div>
          </article>
        )) : (
          <div style={{ padding: `${(panel.space.md + panel.space.xxs)}px ${panel.space.md}px`, fontSize: panel.type.meta.fontSize, lineHeight: panel.type.meta.lineHeight, fontWeight: panel.type.meta.fontWeight, color: panel.ink2 }}>
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
      dataAttrs={{ "data-pr-summary": "facts-first", "data-dlens-presence": "card" }}
      style={{
        display: "grid",
        gap: panel.space.md,
        padding: `${(panel.space.md + panel.space.xxs)}px ${panel.space.lg}px`,
        background: panel.surface
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: (panel.space.sm + panel.space.xxs), alignItems: "center", flexWrap: "wrap" }}>
        <Kicker>PR 稽核摘要</Kicker>
        <div style={{ display: "flex", gap: panel.space.sm, flexWrap: "wrap" }}>
          <SecondaryButton
            onClick={() => markdownCommand ? onCommand(markdownCommand) : undefined}
            disabled={!markdownCommand}
            style={{ ...accentButtonStyle, ...compactButtonStyle }}
            dataAttrs={{ "data-pr-export-button": "md", "aria-label": "匯出 MD" }}
          >
            <ExportButtonContent format="md" />
          </SecondaryButton>
          <SecondaryButton
            onClick={() => docxCommand ? onCommand(docxCommand) : undefined}
            disabled={!docxCommand}
            style={{ ...exportButtonStyle, ...compactButtonStyle }}
            dataAttrs={{ "data-pr-export-button": "docx", "aria-label": "匯出 DOCX" }}
          >
            <ExportButtonContent format="docx" />
          </SecondaryButton>
        </div>
      </div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: tokens.font.sans, fontSize: panel.type.meta.fontSize, fontWeight: panel.type.meta.fontWeight, lineHeight: panel.type.meta.lineHeight, color: panel.ink2 }}>
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
    <section data-pr-export-ready="true" style={{ display: "grid", gap: panel.space.sm }}>
      <div
        data-pr-export-ready-card="true"
        data-dlens-presence="card"
        style={{ display: "flex", gap: panel.space.md, alignItems: "center", padding: `${(panel.space.md + panel.space.xxs)}px ${panel.space.lg}px`, borderRadius: panel.radius.md, border: `1px solid ${panel.border}`, background: panel.surfaceSubtle }}
      >
        <span aria-hidden style={{ width: 40, height: 40, borderRadius: panel.radius.md, background: panel.successSoft, color: panel.success, display: "grid", placeItems: "center", fontSize: panel.type.title.fontSize, lineHeight: panel.type.title.lineHeight, fontWeight: panel.type.title.fontWeight, flexShrink: 0 }}>✓</span>
        <div style={{ display: "grid", gap: panel.space.xxs, minWidth: 0 }}>
          <span style={{ fontFamily: tokens.font.sans, fontSize: panel.type.heading.fontSize, lineHeight: panel.type.heading.lineHeight, fontWeight: 500, color: panel.ink }}>輸出 ready · 含 {rowCount} rows</span>
          <span style={{ ...panel.type.micro, color: panel.ink3 }}>
            {viewModel.exports.summaryMarkdown ? "CSV / MD / DOCX 三格式都已備齊" : "CSV 已備 · MD / DOCX 待生成摘要"}
          </span>
        </div>
        <span style={{ marginLeft: `auto`, ...prMonoMetaStyle, color: PR_ACCENT, whiteSpace: "nowrap" }}>● ready</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: panel.space.sm }}>
        {formats.map((format) => (
          <div
            key={format.id}
            data-pr-format-card={format.id}
            style={{ display: "flex", gap: (panel.space.sm + panel.space.xxs), alignItems: "center", padding: `${panel.space.md}px ${panel.space.md}px`, borderRadius: PR_RADIUS, border: `1px solid ${PR_RULE}`, background: panel.surface, minWidth: 0 }}
          >
            <span style={{ display: "grid", gap: panel.space.xxs, minWidth: 0 }}>
              <span style={{ fontSize: panel.type.bodySm.fontSize, lineHeight: panel.type.bodySm.lineHeight, fontWeight: 500, color: panel.ink }}>{format.name}</span>
              <span style={{ fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight, fontWeight: panel.type.micro.fontWeight, color: panel.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{format.desc}</span>
            </span>
            <span style={{ marginLeft: `auto`, ...panel.type.micro, fontFamily: tokens.font.sans, color: format.available ? PR_MOSS : panel.ink3, background: format.available ? panel.successSoft : panel.surfaceSubtle, padding: `${panel.space.xxs}px ${panel.space.sm}px`, borderRadius: panel.radius.xs, whiteSpace: "nowrap" }}>
              {format.available ? "可用" : "—"}
            </span>
          </div>
        ))}
      </div>
      {gap ? (
        <div
          data-pr-export-gap-note="true"
          style={{ ...prRowTextStyle, color: panel.ink2, padding: `${panel.space.sm}px ${panel.space.md}px`, borderRadius: PR_RADIUS, border: `1px solid ${panel.danger}`, background: panel.dangerSoft }}
        >
          <b style={{ color: PR_ACCENT, fontWeight: 600 }}>{gap.label} gap note</b> 已寫進輸出:此條件 {gap.missingRows} 列全無命中,交付方已知此限制。
        </div>
      ) : null}
    </section>
  );
}

/* ── PR narrative lens ─────────────────────────────────────────────── */

function PrScopeBar({
  collectedCount,
  onOpenSettings
}: {
  collectedCount: number;
  onOpenSettings: () => void;
}) {
  return (
    <div
      data-pr-scope-bar="campaign-collected-posts"
      style={{
        display: "flex",
        alignItems: "center",
        gap: panel.space.sm,
        padding: `${panel.space.sm}px ${panel.space.md}px`,
        borderRadius: PR_RADIUS,
        border: `1px solid ${PR_RULE}`,
        background: panel.surfaceSubtle,
        minWidth: 0
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: PR_ROUND, background: PR_ACCENT, flexShrink: 0 }} />
      <span style={{ ...prRowTextStyle, color: panel.ink2, minWidth: 0 }}>
        只分析這個 campaign 已 Collect 的 Threads 主帖
      </span>
      <span style={{ ...prMonoMetaStyle, color: panel.ink3, whiteSpace: "nowrap" }}>
        {collectedCount} 篇
      </span>
      <SecondaryButton
        onClick={onOpenSettings}
        style={{ ...compactButtonStyle, marginLeft: `auto`, whiteSpace: "nowrap" }}
        dataAttrs={{ "data-pr-open-settings": "header" }}
      >
        活動設定
      </SecondaryButton>
    </div>
  );
}

function NarrativeEvidenceList({
  title,
  rows,
  marker
}: {
  title: string;
  rows: PrNarrativeEvidenceViewModel[];
  marker: "support" | "counterexamples";
}) {
  if (!rows.length) return null;
  return (
    <section
      data-pr-narrative-evidence-list={marker}
      {...(marker === "counterexamples" ? { "data-pr-narrative-counterexamples": "true" } : {})}
      style={{ display: "grid", gap: panel.space.sm }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: panel.space.sm }}>
        <Kicker tone={marker === "counterexamples" ? "accent" : "default"}>{title}</Kicker>
        <span style={{ ...prMonoMetaStyle, color: panel.ink3 }}>{rows.length} 篇</span>
      </div>
      <div style={{ display: "grid", borderTop: `1px solid ${PR_RULE}` }}>
        {rows.map((entry) => (
          <article
            key={`${marker}-${entry.rowId}`}
            style={{ display: "grid", gap: (panel.space.xs + panel.space.xxs), padding: `${panel.space.md}px 0`, borderBottom: `1px solid ${PR_RULE}` }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: panel.space.sm, minWidth: 0 }}>
              <span style={{ ...prMonoMetaStyle, color: PR_ACCENT, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                @{entry.row.authorLabel.replace(/^@/, "")}
              </span>
              <span style={{ ...prMonoMetaStyle, color: panel.ink3, marginLeft: `auto`, whiteSpace: "nowrap" }}>
                {entry.row.collectedAtLabel}
              </span>
            </div>
            <span style={{ ...prRowTextStyle, color: panel.ink }}>{entry.summary}</span>
            <span style={{ ...panel.type.micro, color: panel.ink3 }}>{entry.row.captionLabel}</span>
            {entry.row.sourceUrl ? (
              <a
                href={entry.row.sourceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Threads 原帖 · ${entry.row.authorLabel}`}
                style={{ display: "inline-flex", alignItems: "center", gap: panel.space.xs, width: "fit-content", color: PR_ACCENT, fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight, fontWeight: 600, textDecoration: "none" }}
              >
                Threads 原帖
                <ExternalLink size={panel.size.icon} strokeWidth={panel.iconStrokeWidth} aria-hidden="true" />
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function NarrativeDrawer({
  detail,
  onCommand
}: {
  detail: NonNullable<PrEvidenceViewModel["narrative"]["detail"]>;
  onCommand: (command: PrEvidenceCommand) => void;
}) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeCommandRef = useRef(detail.closeCommand);
  closeCommandRef.current = detail.closeCommand;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    drawerRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  return (
    <aside
      ref={drawerRef}
      role="dialog"
      aria-modal="true"
      aria-label={detail.claim.title}
      tabIndex={-1}
      data-pr-narrative-drawer="true"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCommand(closeCommandRef.current);
        }
      }}
      style={{
        position: "fixed",
        top: 80,
        right: 16,
        bottom: 16,
        zIndex: 2147483642,
        width: "min(430px, calc(100vw - 32px))",
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr)",
        borderRadius: panel.radius.md,
        border: `1px solid ${panel.borderStrong}`,
        background: panel.surface,
        boxShadow: panel.shadow.popover,
        overflow: "hidden"
      }}
    >
      <header style={{ display: "grid", gap: panel.space.sm, padding: `${panel.space.lg}px ${(panel.space.lg + panel.space.xxs)}px`, borderBottom: `1px solid ${PR_RULE}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: (panel.space.sm + panel.space.xxs) }}>
          <Kicker tone="accent">現象 claim</Kicker>
          <span style={{ ...prMonoMetaStyle, color: panel.ink3, marginLeft: `auto` }}>{detail.limitationLabel}</span>
          <SecondaryButton
            onClick={() => onCommand(detail.closeCommand)}
            style={compactButtonStyle}
            dataAttrs={{ "aria-label": "關閉敘事證據" }}
          >
            關閉
          </SecondaryButton>
        </div>
        <h2 style={{ margin: 0, fontFamily: tokens.font.sans, fontSize: panel.type.title.fontSize, fontWeight: panel.type.title.fontWeight, lineHeight: panel.type.title.lineHeight, color: panel.ink }}>
          {detail.claim.title}
        </h2>
        <p style={{ ...prRowTextStyle, margin: 0, color: panel.ink2 }}>{detail.claim.statement}</p>
      </header>
      <div style={{ display: "grid", gap: panel.space.xl, padding: `${panel.space.lg}px ${(panel.space.lg + panel.space.xxs)}px ${panel.space.xxl}px`, overflowY: "auto", alignContent: "start" }}>
        <NarrativeEvidenceList title="支持證據" rows={detail.support} marker="support" />
        {detail.counterexamples.length ? (
          <NarrativeEvidenceList title="反例／限制" rows={detail.counterexamples} marker="counterexamples" />
        ) : null}
      </div>
    </aside>
  );
}

const NARRATIVE_ALIGNMENT_POSITION: Record<PrNarrativeClaimViewModel["alignment"], string> = {
  challenges: "16%",
  mixed: "50%",
  echoes: "84%"
};

const NARRATIVE_ALIGNMENT_LABEL: Record<PrNarrativeClaimViewModel["alignment"], string> = {
  challenges: "挑戰",
  mixed: "混合",
  echoes: "呼應"
};

const NARRATIVE_MODE_LABEL: Record<PrNarrativeClaimViewModel["mode"], string> = {
  attitude: "態度",
  experience: "體驗",
  behavior: "行為",
  actionable: "行動"
};

const NARRATIVE_MODE_POSITION: Record<PrNarrativeClaimViewModel["mode"], string> = {
  attitude: "82%",
  experience: "62%",
  behavior: "38%",
  actionable: "18%"
};

function NarrativeCompass({
  claims,
  onCommand
}: {
  claims: PrNarrativeClaimViewModel[];
  onCommand: (command: PrEvidenceCommand) => void;
}) {
  if (claims.length < 2) return null;
  return (
    <details data-pr-narrative-compass="true" style={{ borderTop: `1px solid ${PR_RULE}`, paddingTop: panel.space.md, borderRadius: PR_RADIUS }}>
      <summary
        data-dlens-presence="row"
        className="dlens-tactile-row"
        style={{ listStyle: "none", cursor: "pointer", display: "flex", alignItems: "baseline", gap: panel.space.sm, color: panel.ink, fontFamily: tokens.font.sans, fontSize: panel.type.heading.fontSize, lineHeight: panel.type.heading.lineHeight, fontWeight: 600 }}
      >
        <span style={{ fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight, fontWeight: panel.type.micro.fontWeight, color: panel.ink3 }}>▸</span>
        敘事羅盤
        <span style={{ ...prMonoMetaStyle, marginLeft: `auto`, color: panel.ink3 }}>挑戰 ↔ 呼應 · 態度 ↕ 行動</span>
      </summary>
      <div style={{ paddingTop: panel.space.md }}>
        <div
          style={{
            position: "relative",
            height: 210,
            borderRadius: PR_RADIUS,
            border: `1px solid ${PR_RULE}`,
            background: panel.surfaceSubtle,
            overflow: "hidden"
          }}
        >
          <span aria-hidden style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: PR_RULE }} />
          <span aria-hidden style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: PR_RULE }} />
          <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", ...panel.type.micro, color: panel.ink3 }}>挑戰</span>
          <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", ...panel.type.micro, color: panel.ink3 }}>呼應</span>
          <span style={{ position: "absolute", left: "50%", top: 7, transform: "translateX(-50%)", ...panel.type.micro, color: panel.ink3 }}>行動</span>
          <span style={{ position: "absolute", left: "50%", bottom: 7, transform: "translateX(-50%)", ...panel.type.micro, color: panel.ink3 }}>態度</span>
          {claims.map((claim, index) => (
            <button
              key={claim.id}
              type="button"
              data-pr-narrative-compass-claim={claim.id}
              aria-label={`查看「${claim.title}」的證據`}
              title={claim.title}
              onClick={() => onCommand(claim.selectCommand)}
              style={{
                position: "absolute",
                left: NARRATIVE_ALIGNMENT_POSITION[claim.alignment],
                top: NARRATIVE_MODE_POSITION[claim.mode],
                transform: "translate(-50%, -50%)",
                width: claim.priority ? 32 : 26,
                height: claim.priority ? 32 : 26,
                borderRadius: PR_ROUND,
                border: `2px solid ${claim.priority ? PR_ACCENT : panel.surface}`,
                background: claim.priority ? panel.accentSoft : panel.successSoft,
                color: claim.priority ? PR_ACCENT : PR_MOSS,
                boxShadow: panel.shadow.card,
                fontFamily: tokens.font.sans,
                fontSize: panel.type.micro.fontSize, lineHeight: panel.type.micro.lineHeight,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}

const NARRATIVE_STATE_COPY: Record<Exclude<PrNarrativeViewStatus, "ready">, { title: string; body: string }> = {
  empty: {
    title: "尚未建立敘事判讀",
    body: "按下判讀後，AI 只會閱讀這個 campaign 已 Collect 的 Threads 主帖。"
  },
  stale: {
    title: "已收集的貼文已變更",
    body: "以下保留上次判讀；重新判讀後才會納入目前這批主帖。"
  },
  insufficient_evidence: {
    title: "可判讀內容不足",
    body: "目前沒有足夠的主帖形成可靠的現象 claim；不會硬湊分佈或趨勢。"
  },
  error: {
    title: "敘事判讀失敗",
    body: "舊結果不會被覆寫。請確認 provider 設定後再手動重試。"
  }
};

function NarrativeStateMessage({
  status,
  error
}: {
  status: Exclude<PrNarrativeViewStatus, "ready">;
  error: string;
}) {
  const copy = NARRATIVE_STATE_COPY[status];
  const warning = status === "stale" || status === "insufficient_evidence";
  return (
    <div
      data-pr-narrative-state={status}
      style={{
        display: "grid",
        gap: panel.space.xs,
        padding: `${panel.space.md}px ${panel.space.md}px`,
        borderRadius: PR_RADIUS,
        border: `1px solid ${warning ? panel.warning : status === "error" ? panel.danger : PR_RULE}`,
        background: warning ? panel.warningSoft : status === "error" ? panel.dangerSoft : panel.surfaceSubtle
      }}
    >
      <strong style={{ ...panel.type.bodySm, color: status === "error" ? panel.danger : panel.ink }}>{copy.title}</strong>
      <span style={{ ...panel.type.micro, color: panel.ink2, lineHeight: panel.type.micro.lineHeight }}>{copy.body}</span>
      {error ? (
        <span style={{ ...prMonoMetaStyle, color: panel.danger }}>
          {status === "error" ? error : `上次重新判讀失敗：${error}`}
        </span>
      ) : null}
    </div>
  );
}

function NarrativeClaimCard({
  claim,
  priority,
  onCommand
}: {
  claim: PrNarrativeClaimViewModel;
  priority: boolean;
  onCommand: (command: PrEvidenceCommand) => void;
}) {
  return (
    <button
      type="button"
      data-pr-narrative-claim={claim.id}
      {...(priority ? { "data-pr-narrative-priority": "true" } : {})}
      aria-label={`查看「${claim.title}」的證據`}
      onClick={() => onCommand(claim.selectCommand)}
      className="dlens-card-lift"
      style={{
        appearance: "none",
        width: "100%",
        display: "grid",
        gap: priority ? 9 : 6,
        padding: priority ? "16px 18px" : "12px 14px",
        borderRadius: priority ? panel.radius.md : PR_RADIUS,
        border: `1px solid ${priority ? panel.accent : PR_RULE}`,
        background: priority ? panel.accentSoft : panel.surface,
        boxShadow: priority ? panel.shadow.card : "none",
        color: panel.ink,
        textAlign: "left",
        cursor: "pointer",
        transition: `transform ${panel.motion.base} ${panel.motion.standard}, opacity ${panel.motion.base} ${panel.motion.standard}`
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: panel.space.sm, minWidth: 0 }}>
        {priority ? <Kicker tone="accent">優先判斷</Kicker> : null}
        <span style={{ fontFamily: tokens.font.sans, fontSize: priority ? panel.type.title.fontSize : panel.type.cardTitle.fontSize, fontWeight: 600, minWidth: 0 }}>
          {claim.title}
        </span>
        <span style={{ ...prMonoMetaStyle, marginLeft: `auto`, color: claim.supportCount ? PR_MOSS : panel.ink3, whiteSpace: "nowrap" }}>
          {claim.supportCount}/{claim.denominator} 支持
        </span>
      </div>
      {priority ? (
        <strong style={{ fontFamily: tokens.font.sans, fontSize: panel.type.title.fontSize, lineHeight: panel.type.title.lineHeight, fontWeight: 600, color: PR_ACCENT }}>
          {claim.implication}
        </strong>
      ) : null}
      <span style={{ ...prRowTextStyle, color: panel.ink2 }}>{claim.statement}</span>
      <span style={{ display: "flex", alignItems: "center", gap: panel.space.sm, flexWrap: "wrap" }}>
        <span style={{ ...prMonoMetaStyle, color: panel.ink3 }}>
          {NARRATIVE_ALIGNMENT_LABEL[claim.alignment]} · {NARRATIVE_MODE_LABEL[claim.mode]}
        </span>
        {claim.counterCount ? (
          <span style={{ ...prMonoMetaStyle, color: PR_ACCENT, background: panel.accentSoft, padding: `${panel.space.xxs}px ${panel.space.sm}px`, borderRadius: panel.radius.pill }}>
            {claim.counterCount} 個反例
          </span>
        ) : null}
        <span style={{ ...panel.type.micro, marginLeft: `auto`, color: PR_ACCENT, fontWeight: 600 }}>查看原帖 →</span>
      </span>
    </button>
  );
}

function PrNarrativeLens({
  viewModel,
  onCommand
}: {
  viewModel: PrEvidenceViewModel;
  onCommand: (command: PrEvidenceCommand) => void;
}) {
  const narrative = viewModel.narrative;
  const otherClaims = narrative.claims.filter((claim) => !claim.priority);
  const canGenerate = Boolean(narrative.generateCommand && viewModel.rows.length > 0 && !narrative.isGenerating);
  const showsRead = Boolean(narrative.priorityClaim && (narrative.status === "ready" || narrative.status === "stale"));
  return (
    <section data-pr-narrative-lens="true" style={{ display: "grid", gap: panel.space.md, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: (panel.space.sm + panel.space.xxs), flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: panel.space.xxs }}>
          <Kicker>敘事判讀</Kicker>
          <span style={{ ...prMonoMetaStyle, color: panel.ink3 }}>
            {narrative.coverageLabel}{narrative.snippetFallbackCount ? ` · ${narrative.snippetFallbackCount} 篇使用採集摘要` : ""}
          </span>
        </div>
        <PrimaryButton
          onClick={() => narrative.generateCommand ? onCommand(narrative.generateCommand) : undefined}
          ariaBusy={narrative.isGenerating}
          disabled={!canGenerate}
          style={{ ...compactButtonStyle, marginLeft: `auto` }}
          dataAttrs={{ "data-pr-narrative-generate": "true" }}
        >
          <AttentionBeam
            state={narrative.isGenerating ? "generating" : canGenerate ? "actionable" : "none"}
            generatingLabel="判讀中..."
          >
            {narrative.generateLabel}
          </AttentionBeam>
        </PrimaryButton>
      </div>

      {narrative.status !== "ready" ? <NarrativeStateMessage status={narrative.status} error={narrative.error} /> : null}
      {narrative.status === "ready" && narrative.error ? (
        <div data-pr-narrative-last-error="true" style={{ ...panel.type.micro, color: panel.danger, padding: `${panel.space.sm}px ${(panel.space.sm + panel.space.xxs)}px`, borderRadius: PR_RADIUS, background: panel.dangerSoft }}>
          上次重新判讀失敗：{narrative.error}
        </div>
      ) : null}

      {showsRead && narrative.priorityClaim ? (
        <NarrativeClaimCard claim={narrative.priorityClaim} priority onCommand={onCommand} />
      ) : null}

      {showsRead && otherClaims.length ? (
        <div style={{ display: "grid", gap: panel.space.sm }}>
          <Kicker>其餘現象</Kicker>
          {otherClaims.map((claim) => <NarrativeClaimCard key={claim.id} claim={claim} priority={false} onCommand={onCommand} />)}
        </div>
      ) : null}

      {showsRead ? <NarrativeCompass claims={narrative.claims} onCommand={onCommand} /> : null}
      {narrative.detail ? <NarrativeDrawer detail={narrative.detail} onCommand={onCommand} /> : null}
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
  const t = useUiText();
  const dispatchCommand = (command: PrEvidenceCommand) => Promise.resolve(onCommand(command));
  const saveCampaignAction = viewModel.actions.find((action) => action.kind === "saveCampaign");
  const generateCriteriaAction = viewModel.actions.find((action) => action.kind === "generateCriteria");
  const generateSummaryAction = viewModel.actions.find((action) => action.kind === "generateSummary");
  const markdownCommand = viewModel.actions.find((action) => action.kind === "exportSummaryMarkdown") ?? null;
  const docxCommand = viewModel.actions.find((action) => action.kind === "exportSummaryDocx") ?? null;

  return (
    <div
      style={viewRootStyle({
        gap: panel.space.md,
        fontFamily: tokens.font.sans,
        fontVariantNumeric: "tabular-nums",
        boxSizing: "border-box",
        maxWidth: "100%",
        paddingRight: panel.space.sm
      })}
      data-pr-evidence-view="true"
      data-pr-editorial-v1="true"
    >
      <ModeHeader
        mode="pr-evidence"
        kicker="PR Evidence"
        title={t("讀出已收集貼文正在形成的 campaign 敘事", "Read the campaign narrative forming across collected posts")}
        deck={t("同一批手動 Collect 的 Threads 主帖，可切換敘事判讀與逐帖 evidence matching。", "The same batch of manually collected Threads posts — switch between narrative reading and per-post evidence matching.")}
        stamp={<Stamp tone="accent">{t("手動判讀", "Manual read")}</Stamp>}
      />

      <WorkspaceSurface
        tone="utility"
        style={{
          display: "grid",
          gap: panel.space.md,
          minWidth: 0,
          maxWidth: "100%",
          overflow: "hidden",
          borderRadius: panel.radius.md,
          boxShadow: panel.shadow.card
        }}
      >
        <PrScopeBar
          collectedCount={viewModel.rows.length}
          onOpenSettings={() => void dispatchCommand({ kind: "setSetupCollapsed", target: { sessionId: viewModel.sessionId }, collapsed: false })}
        />

        <CampaignEditor
          campaign={viewModel.campaign}
          onChange={(draft) => void dispatchCommand({ kind: "updateDraft", target: { sessionId: viewModel.sessionId }, draft })}
          onDispatch={(command) => void dispatchCommand(command)}
          onSave={() => saveCampaignAction ? void dispatchCommand(saveCampaignAction) : undefined}
          onGenerateCriteria={() => generateCriteriaAction ? void dispatchCommand(generateCriteriaAction) : undefined}
          canGenerateCriteria={Boolean(generateCriteriaAction)}
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

        {viewModel.campaign.setupCollapsed ? (
          <>
            <div
              data-pr-lens-switcher="true"
              style={{
                display: "flex",
                alignItems: "center",
                gap: panel.space.sm,
                borderBottom: `1px solid ${PR_RULE}`,
                minWidth: 0,
                flexWrap: "wrap"
              }}
            >
              <SegmentedTabs
                tabs={[
                  { id: "narrative", label: "敘事判讀", tone: "accent" },
                  { id: "evidence", label: "證據匹配", tone: "neutral" }
                ]}
                activeId={viewModel.activeLens}
                onChange={(lens) => void dispatchCommand(viewModel.lensCommands[lens])}
                ariaLabel="PR 分析視角"
                dataAttr={(lens) => ({ "data-pr-lens-tab": lens })}
              />
              <span style={{ ...prMonoMetaStyle, marginLeft: `auto`, paddingRight: panel.space.xs, color: panel.ink3 }}>
                同一批 {viewModel.rows.length} 篇 · 兩種讀法
              </span>
            </div>

            {viewModel.activeLens === "narrative" ? (
              <PrNarrativeLens viewModel={viewModel} onCommand={(command) => void dispatchCommand(command)} />
            ) : (
              <>
                <PrWorkingArea
                  viewModel={viewModel}
                  onCommand={(command) => void dispatchCommand(command)}
                />

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
              </>
            )}

            <NoticeBar notice={viewModel.notice} />
          </>
        ) : null}
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
      dataAttrs={{ "data-pr-summary-cta": "empty", "data-dlens-presence": "card" }}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: panel.space.md,
        alignItems: "center",
        flexWrap: "wrap",
        padding: `${panel.space.md}px ${(panel.space.md + panel.space.xxs)}px`,
        background: panel.surface
      }}
    >
      <div style={{ display: "grid", gap: panel.space.xs, minWidth: 0 }}>
        <span style={{ fontFamily: tokens.font.sans, fontSize: panel.type.body.fontSize, lineHeight: panel.type.body.lineHeight, fontWeight: 600, color: panel.ink }}>
          PR 摘要
        </span>
        <span style={{ ...panel.type.micro, color: panel.ink3, fontWeight: 500, lineHeight: panel.type.micro.lineHeight }}>
          生成摘要：把已判斷 evidence 轉成可貼進 PR brief 的段落。
        </span>
      </div>
      <SecondaryButton
        onClick={onGenerate}
        ariaBusy={loading}
        dataAttrs={{ "data-pr-summary-generate": "true" }}
        disabled={disabled || loading}
        style={{ ...accentButtonStyle, ...compactButtonStyle, whiteSpace: "nowrap" }}
      >
        <AttentionBeam
          state={loading ? "generating" : disabled ? "none" : "actionable"}
          generatingLabel="生成中..."
        >
          生成摘要
        </AttentionBeam>
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
