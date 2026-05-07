import { useEffect, useMemo, useRef, useState } from "react";

import { buildPrEvidenceCsv, buildPrEvidenceCsvRows, extractPrCoreMessages, inferPrViewsFromText } from "../compare/pr-evidence.ts";
import type { ExtensionResponse } from "../state/messages.ts";
import type { PrCampaign, PrCriterion, PrEvidenceRow } from "../state/pr-evidence-storage.ts";
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
  outline: "none"
} as const;

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

const accentButtonStyle = {
  borderColor: "var(--dlens-mode-accent)",
  background: "var(--dlens-mode-accent-soft)",
  color: "var(--dlens-mode-accent)",
  fontWeight: 700
} as const;

const exportButtonStyle = {
  borderColor: "rgba(63,90,59,0.34)",
  background: tokens.color.successSoft,
  color: tokens.color.success,
  fontWeight: 700
} as const;

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
  coreMessages
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
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function updateCriterion(index: number, label: string) {
    const criteria = campaign.criteria.map((criterion, currentIndex) =>
      currentIndex === index ? { ...criterion, label } : criterion
    ) as PrCampaign["criteria"];
    onChange({ ...campaign, criteria, updatedAt: new Date().toISOString() });
  }

  return (
    <section data-pr-campaign-setup="true" style={surfaceCardStyle({ display: "grid", gap: 12, padding: "14px 16px" })}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <Kicker>Campaign setup</Kicker>
          <div style={{ fontSize: 15, fontWeight: 700, color: tokens.color.ink }}>PR Evidence campaign</div>
        </div>
        <Stamp tone={campaign.name.trim() ? "success" : "warning"}>{campaign.name.trim() ? "Ready" : "Draft"}</Stamp>
      </div>

      <label style={{ display: "grid", gap: 6, fontSize: 11, color: tokens.color.subInk }}>
        Campaign name
        <input
          value={campaign.name}
          onChange={(event) => onChange({ ...campaign, name: event.target.value, updatedAt: new Date().toISOString() })}
          placeholder="Mannings BoostUP Wellness Carnival"
          style={inputStyle}
        />
      </label>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label htmlFor="pr-brief-text" style={{ fontSize: 11, color: tokens.color.subInk }}>
            Brief / PR guideline
          </label>
          <SecondaryButton
            onClick={() => fileInputRef.current?.click()}
            disabled={isReadingBrief || isGenerating}
            style={{ ...accentButtonStyle, padding: "6px 10px", fontSize: 11, whiteSpace: "nowrap" }}
          >
            {isReadingBrief ? "Reading PDF..." : "Upload press release"}
          </SecondaryButton>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.markdown,.text,application/pdf,text/plain,text/markdown"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onUploadBrief(file);
              }
              event.target.value = "";
            }}
          />
        </div>
        <textarea
          id="pr-brief-text"
          value={campaign.briefText}
          onChange={(event) => onChange({ ...campaign, briefText: event.target.value, updatedAt: new Date().toISOString() })}
          placeholder="Paste the press release, message house, or report guideline — or upload a PDF / .txt / .md file."
          rows={4}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55 }}
        />
        {uploadError ? (
          <div data-pr-upload-error="true" style={{ fontSize: 10.5, color: tokens.color.failed }}>
            {uploadError}
          </div>
        ) : null}
        {coreMessages.length ? (
          <div data-pr-core-messages="true" style={{ display: "grid", gap: 6, padding: "8px 10px", borderRadius: tokens.radius.card, border: `1px solid ${tokens.color.line}`, background: tokens.color.contextSurface }}>
            <Kicker>Detected core PR messages</Kicker>
            <div style={{ display: "grid", gap: 4 }}>
              {coreMessages.slice(0, 5).map((message) => (
                <div key={message} style={{ fontSize: 10.5, lineHeight: 1.45, color: tokens.color.subInk }}>
                  {message}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Kicker>Six fixed criteria</Kicker>
          <SecondaryButton onClick={onGenerateCriteria} disabled={isReadingBrief || isGenerating} style={accentButtonStyle}>
            {isGenerating ? "Generating..." : "Generate criteria"}
          </SecondaryButton>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {campaign.criteria.map((criterion, index) => (
            <label key={criterion.id} style={{ display: "grid", gap: 5, fontSize: 10.5, color: tokens.color.softInk }}>
              {criterion.id}
              <input value={criterion.label} onChange={(event) => updateCriterion(index, event.target.value)} style={inputStyle} />
            </label>
          ))}
        </div>
      </div>

      <PrimaryButton onClick={onSave} disabled={isSaving || !campaign.name.trim()}>
        {isSaving ? "Saving..." : "Save campaign"}
      </PrimaryButton>
    </section>
  );
}

function EvidenceLedger({ rows }: { rows: PrEvidenceRow[] }) {
  return (
    <section data-pr-evidence-ledger="compact" style={surfaceCardStyle({ display: "grid", gap: 10, padding: "14px 16px" })}>
      <style>{SCAN_ROW_HOVER_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <Kicker>Evidence ledger</Kicker>
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
              <Stamp tone={matchedCount(row) ? "accent" : "neutral"}>{matchedCount(row)}/6 matched</Stamp>
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
        deck="V1 只處理已打開或已找到的 posts；Collect 不跑 AI，Match criteria 才批次判斷。"
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
        />

        <section data-pr-actions="true" style={surfaceCardStyle({ display: "grid", gap: 10, padding: "12px 14px" })}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 3 }}>
              <Kicker>Batch actions</Kicker>
              <div style={{ fontSize: 12, color: tokens.color.subInk }}>
                {rows.length} rows · 6 criteria · estimated AI batches: {batchEstimate}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <PrimaryButton onClick={matchCriteria} disabled={!rows.length || isMatching || !savedCampaignReady} style={{ padding: "7px 14px" }}>
                {isMatching ? "Matching..." : "Match criteria"}
              </PrimaryButton>
              <SecondaryButton onClick={() => setShowPreview((current) => !current)} disabled={!savedCampaignReady}>
                Preview CSV
              </SecondaryButton>
              <SecondaryButton onClick={exportCsv} disabled={!savedCampaignReady} style={exportButtonStyle}>
                Export CSV
              </SecondaryButton>
              <PrimaryButton onClick={generateSummary} disabled={!savedCampaignReady || isGeneratingSummary}>
                {isGeneratingSummary ? "Generating..." : "Generate summary"}
              </PrimaryButton>
            </div>
          </div>
          {notice ? <div style={{ fontSize: 12, color: tokens.color.subInk, lineHeight: 1.55 }}>{notice}</div> : null}
        </section>

        <EvidenceLedger rows={rows} />
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
