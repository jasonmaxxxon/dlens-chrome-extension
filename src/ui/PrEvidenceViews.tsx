import { useEffect, useMemo, useRef, useState } from "react";

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
  Stamp,
  WorkspaceSurface,
  lineClamp,
  scanRowStyle,
  surfaceCardStyle,
  viewRootStyle
} from "./components.tsx";
import { readPrBriefFile } from "./pr-brief-upload.ts";
import { exportPrSummaryDocx, exportPrSummaryMarkdown } from "./pr-summary-export.ts";
import { tokens } from "./tokens.ts";

type PrResponse = ExtensionResponse & {
  prCampaigns?: PrCampaign[];
  prEvidenceRows?: PrEvidenceRow[];
  prCriteria?: PrCriterion[];
  prSummary?: string;
};

const inputStyle = {
  borderRadius: tokens.radius.card,
  border: `1px solid ${tokens.color.line}`,
  background: tokens.color.surface,
  color: tokens.color.ink,
  padding: "9px 10px",
  fontSize: 12,
  fontFamily: tokens.font.sans,
  outline: "none",
  transition: tokens.motion.interactiveTransitionFast
} as const;

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
    views != null ? `${formatMetric(views)} views` : ""
  ].filter(Boolean).join(" · ");
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

/* ── Match badge: 4-tier colour system ─────────────────────────────── */

function MatchBadge({ count, total = 6 }: { count: number; total?: number }) {
  let bg: string;
  let color: string;

  if (count === 0) {
    bg = tokens.color.neutralSurface;
    color = tokens.color.softInk;
  } else if (count >= total - 1) {
    /* 5–6/6 → green */
    bg = tokens.color.successSoft;
    color = tokens.color.success;
  } else if (count >= Math.ceil(total / 2)) {
    /* 3–4/6 → amber */
    bg = tokens.color.queuedSoft;
    color = tokens.color.queued;
  } else {
    /* 1–2/6 → muted rose */
    bg = tokens.color.failedSoft;
    color = tokens.color.failed;
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 22,
        padding: "0 8px",
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0,
        transition: tokens.motion.interactiveTransitionFast
      }}
    >
      {count}/{total} matched
    </span>
  );
}

/* ── Button style overrides ─────────────────────────────────────────── */

const accentButtonStyle = {
  borderColor: "var(--dlens-mode-accent)",
  background: "var(--dlens-mode-accent-soft)",
  color: "var(--dlens-mode-accent)",
  fontWeight: 700
} as const;

/* Export CSV is the primary output action — solid green */
const primaryExportStyle = {
  background: `linear-gradient(135deg, ${tokens.color.success}, ${tokens.color.tealMid})`,
  boxShadow: `0 8px 18px rgba(63,90,59,0.18)`
} as const;

const exportButtonStyle = {
  borderColor: "rgba(63,90,59,0.34)",
  background: tokens.color.successSoft,
  color: tokens.color.success,
  fontWeight: 700
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
        borderRadius: tokens.radius.card,
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
  onExpand
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

  /* ── Collapsed summary row ───────────────────────────────────────── */
  if (collapsed) {
    return (
      <div
        data-pr-campaign-setup="true"
        style={surfaceCardStyle({
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 16px",
          flexWrap: "wrap"
        })}
      >
        <Kicker>Campaign setup</Kicker>
        <span style={{ fontSize: 10, color: tokens.color.lineStrong }}>·</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tokens.color.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {campaign.name || "Unnamed campaign"}
        </span>
        <Stamp tone="success">Ready</Stamp>
        <SecondaryButton onClick={() => onExpand?.()} style={{ padding: "5px 10px", fontSize: 11 }}>
          Edit
        </SecondaryButton>
      </div>
    );
  }

  return (
    <section
      data-pr-campaign-setup="true"
      style={{
        ...surfaceCardStyle({ padding: 0, overflow: "hidden" }),
        display: "flex",
        flexDirection: "column"
      }}
    >
      <style>{CAMPAIGN_EDITOR_CSS}</style>

      {/* ── Card header ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: `1px solid ${tokens.color.line}`,
          background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.surface})`
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Kicker>Campaign setup</Kicker>
          <span style={{ fontSize: 10, color: tokens.color.lineStrong }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: tokens.color.ink }}>PR Evidence campaign</span>
        </div>
        <Stamp tone={campaign.name.trim() ? "success" : "warning"}>{campaign.name.trim() ? "Ready" : "Draft"}</Stamp>
      </div>

      <div style={{ display: "grid", gap: 0, padding: "0 16px 16px" }}>

        {/* ── Campaign name ─────────────────────────────────────────── */}
        <div data-pr-section="name" style={{ paddingTop: 14 }}>
          <label style={{ display: "grid", gap: 7 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: tokens.color.subInk, letterSpacing: "0.01em" }}>
              Campaign name
            </span>
            <input
              data-pr-field="name"
              value={campaign.name}
              onChange={(event) => onChange({ ...campaign, name: event.target.value, updatedAt: new Date().toISOString() })}
              placeholder="Mannings BoostUP Wellness Carnival"
              style={{ ...inputStyle, fontSize: 13, padding: "10px 11px" }}
            />
          </label>
        </div>

        {/* ── PR brief (collapsible) ────────────────────────────────── */}
        <div data-pr-section="brief" style={{ display: "grid", gap: 8 }}>

          {/* Header row — always visible */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: tokens.color.subInk, letterSpacing: "0.01em" }}>
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
                style={{ ...accentButtonStyle, padding: "5px 10px", fontSize: 11, whiteSpace: "nowrap" }}
              >
                {isReadingBrief ? "Reading..." : "Upload PDF"}
              </SecondaryButton>
              {/* Edit / Done toggle — only when brief has content */}
              {campaign.briefText.trim() ? (
                <SecondaryButton
                  onClick={() => setBriefExpanded((v) => !v)}
                  style={{ padding: "5px 10px", fontSize: 11, whiteSpace: "nowrap" }}
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
                borderRadius: tokens.radius.card,
                border: `1px solid ${tokens.color.line}`,
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
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontSize: 12 }}
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
                borderRadius: tokens.radius.card,
                border: `1px solid ${tokens.color.line}`,
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
            <span style={{ fontSize: 11, fontWeight: 600, color: tokens.color.subInk, letterSpacing: "0.01em" }}>
              PR matching criteria
            </span>
            <SecondaryButton onClick={onGenerateCriteria} disabled={isReadingBrief || isGenerating} style={accentButtonStyle}>
              {isGenerating ? "Generating..." : "Generate criteria"}
            </SecondaryButton>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7 }}>
            {campaign.criteria.map((criterion, index) => (
              <div key={criterion.id} style={{ display: "grid", gap: 5 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 15,
                      height: 15,
                      borderRadius: 999,
                      background: tokens.color.neutralSurface,
                      fontSize: 8,
                      fontWeight: 700,
                      color: tokens.color.softInk,
                      flexShrink: 0
                    }}
                  >
                    {index + 1}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: tokens.color.softInk, letterSpacing: "0.01em" }}>
                    Criterion
                  </span>
                </span>
                <input
                  data-pr-field={`criterion-${index}`}
                  value={criterion.label}
                  onChange={(event) => updateCriterion(index, event.target.value)}
                  placeholder={CRITERION_PLACEHOLDERS[criterion.id]}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Save ─────────────────────────────────────────────────── */}
        <div data-pr-section="save" style={{ paddingTop: 14 }}>
          <PrimaryButton onClick={onSave} disabled={isSaving || !campaign.name.trim()}>
            {isSaving ? "Saving..." : "Save campaign"}
          </PrimaryButton>
        </div>

      </div>
    </section>
  );
}

function EvidenceLedger({ rows, lastMatchedAt }: { rows: PrEvidenceRow[]; lastMatchedAt?: string }) {
  return (
    <section data-pr-evidence-ledger="compact" style={surfaceCardStyle({ display: "grid", gap: 10, padding: "14px 16px" })}>
      <style>{SCAN_ROW_HOVER_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Kicker>Evidence ledger</Kicker>
          {lastMatchedAt ? (
            <span style={{ fontSize: 10, color: tokens.color.softInk }}>
              matched {formatTime(lastMatchedAt)}
            </span>
          ) : null}
        </div>
        <Stamp tone="neutral">{rows.length} rows</Stamp>
      </div>
      {rows.length ? (
        <div data-scan-list="pr-evidence" style={{ display: "grid" }}>
          {rows.map((row) => (
            <div
              key={row.id}
              data-pr-evidence-row="compact"
              data-scan-row="true"
              style={scanRowStyle({
                display: "grid",
                gridTemplateColumns: "24px minmax(0, 0.8fr) minmax(0, 1.7fr) minmax(0, 1fr) auto auto",
                alignItems: "center",
                gap: 10,
                padding: "10px 4px"
              })}
            >
              <Stamp tone={row.matchedAt ? "success" : "neutral"}>{row.matchedAt ? "✓" : ""}</Stamp>
              <div style={{ fontSize: 12, fontWeight: 700, color: tokens.color.ink, ...lineClamp(1) }}>{row.authorHandle || "-"}</div>
              <div style={{ fontSize: 12, color: tokens.color.subInk, ...lineClamp(1) }}>{row.caption || "-"}</div>
              <div style={{ fontSize: 11, color: tokens.color.softInk, ...lineClamp(1) }}>{metricLine(row)}</div>
              <MatchBadge count={matchedCount(row)} />
              <div style={{ fontSize: 11, color: tokens.color.softInk, textAlign: "right", minWidth: 64 }}>{formatTime(row.collectedAt)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "16px 12px", borderRadius: tokens.radius.card, border: `1px solid ${tokens.color.line}`, background: tokens.color.surface, fontSize: 12, color: tokens.color.subInk }}>
          尚未收集 evidence rows。先到 Collect 保存已打開的 Threads posts。
        </div>
      )}
    </section>
  );
}

function CsvPreview({ campaign, rows }: { campaign: PrCampaign; rows: PrEvidenceRow[] }) {
  const preview = csvPreviewRows(campaign, rows);
  const [header, ...body] = preview;
  return (
    <section data-pr-csv-preview="true" style={surfaceCardStyle({ display: "grid", gap: 10, padding: "14px 16px", overflow: "hidden" })}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <Kicker>CSV preview</Kicker>
        <Stamp tone="neutral">Header + first 20</Stamp>
      </div>
      <div style={{ overflowX: "auto", border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.card, background: tokens.color.surface }}>
        <table style={{ borderCollapse: "collapse", minWidth: 1320, width: "100%", fontSize: 11, color: tokens.color.subInk }}>
          <thead>
            <tr>
              {(header || []).map((cell, index) => (
                <th
                  key={`${cell}-${index}`}
                  style={{
                    textAlign: "left",
                    padding: "8px 7px",
                    borderBottom: `1px solid ${tokens.color.line}`,
                    color: tokens.color.ink,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    minWidth: index <= 2 ? 150 : index >= 8 ? 118 : 74
                  }}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.slice(0, 20).map((line, rowIndex) => (
              <tr key={rowIndex}>
                {line.map((cell, cellIndex) => (
                  <td
                    key={`${rowIndex}-${cellIndex}`}
                    style={{
                      padding: "7px",
                      borderBottom: `1px solid ${tokens.color.line}`,
                      whiteSpace: "nowrap",
                      color: cell ? tokens.color.subInk : tokens.color.softInk
                    }}
                  >
                    {cell || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryPanel({ campaign, summary }: { campaign: PrCampaign; summary: string }) {
  return (
    <section data-pr-summary="facts-first" style={surfaceCardStyle({ display: "grid", gap: 12, padding: "14px 16px" })}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Kicker>Topline PR audit summary</Kicker>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <SecondaryButton onClick={() => exportPrSummaryMarkdown(summary, campaign.name)} style={accentButtonStyle}>
            Export MD
          </SecondaryButton>
          <SecondaryButton onClick={() => exportPrSummaryDocx(summary, campaign.name)} style={exportButtonStyle}>
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
  const [showPreview, setShowPreview] = useState(false);
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReadingBrief, setIsReadingBrief] = useState(false);
  const [isGeneratingCriteria, setIsGeneratingCriteria] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const coreMessages = useMemo(() => extractPrCoreMessages(campaign.briefText), [campaign.briefText]);

  const batchEstimate = Math.max(0, Math.ceil(rows.length / 25));
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

  const preview = useMemo(() => showPreview && savedCampaignReady, [showPreview, savedCampaignReady]);

  return (
    <div style={viewRootStyle({ gap: tokens.spacing.md })} data-pr-evidence-view="true">
      <ModeHeader
        mode="pr-evidence"
        kicker="PR Evidence"
        title="把已找到的 Threads 貼文整理成 PR evidence CSV"
        deck="Collect 儲存貼文 → Match 批次判斷 → Export CSV 交付。V1 不在 Collect 跑 AI。"
        stamp={<Stamp tone="accent">CSV first</Stamp>}
      />

      <WorkspaceSurface tone="utility" style={{ display: "grid", gap: tokens.spacing.md }}>
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
        />

        <section data-pr-actions="true" style={surfaceCardStyle({ display: "grid", gap: 10, padding: "12px 14px" })}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 3 }}>
              <Kicker>Batch actions</Kicker>
              <div style={{ fontSize: 12, color: tokens.color.subInk }}>
                {rows.length} posts · 6 criteria · ~{batchEstimate} AI calls
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
              <SecondaryButton
                onClick={matchCriteria}
                disabled={!rows.length || isMatching || !savedCampaignReady}
                style={accentButtonStyle}
              >
                {isMatching ? "Matching..." : "Match criteria"}
              </SecondaryButton>
              <SecondaryButton onClick={() => setShowPreview((current) => !current)} disabled={!savedCampaignReady}>
                Preview CSV
              </SecondaryButton>
              <PrimaryButton onClick={exportCsv} disabled={!savedCampaignReady} style={primaryExportStyle}>
                Export CSV
              </PrimaryButton>
              <SecondaryButton
                onClick={() => void generateSummary()}
                disabled={!savedCampaignReady || isGeneratingSummary}
                style={accentButtonStyle}
              >
                {isGeneratingSummary ? "Generating..." : "Generate summary"}
              </SecondaryButton>
            </div>
          </div>
          <NoticeBar notice={notice} />
        </section>

        <EvidenceLedger rows={rows} lastMatchedAt={campaign.lastMatchedAt} />
        {preview ? <CsvPreview campaign={campaign} rows={rows} /> : null}

        {summary ? <SummaryPanel campaign={campaign} summary={summary} /> : null}
      </WorkspaceSurface>
    </div>
  );
}

export const prEvidenceViewTestables = {
  matchedCount,
  csvPreviewRows,
  metricLine
};
