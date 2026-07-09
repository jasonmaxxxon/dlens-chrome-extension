import type { ReactNode } from "react";

import type { EvidencePacket, ReactionCoverage, ReactionPattern, TopicAuditReport } from "../compare/topic-audit.ts";
import type { TopicAuditValidationFlag, TopicAuditValidationSeverity } from "../compare/topic-audit-validator.ts";
import type { TopicAuditMemoBundle } from "../state/topic-audit-storage.ts";
import { tokens } from "./tokens";
import {
  AuditReportNarrativeLanes,
  AuditReportReactionPatterns,
  GhostButton,
  PrimaryButton,
  ThemeChip,
  type NarrativeLaneHint
} from "./topic-audit-components.tsx";

const SECTION_META: Array<{ key: keyof TopicAuditReport["sections"]; number: string; title: string }> = [
  { key: "overall", number: "§1", title: "整體" },
  { key: "lexicon", number: "§2", title: "詞群" },
  { key: "scaleOrTime", number: "§3", title: "時間" },
  { key: "narratives", number: "§4", title: "敘事" },
  { key: "audience", number: "§5", title: "受眾" },
  { key: "absence", number: "§6", title: "缺席" },
  { key: "editorial", number: "§7", title: "編輯" }
];

const EMPTY_SECTION_COPY = "等待訊號累積後生成";

const SEVERITY_ORDER: Record<TopicAuditValidationSeverity, number> = {
  FAIL: 0,
  WEAK: 1,
  SCOPE: 2
};

const REF_PATTERN = /(S\d+\.(?:OPC\d+|OP|R\d+|P\d+))/g;

type ReportSection = (typeof SECTION_META)[number] & {
  body: string;
  empty: boolean;
};

type AuditReportDisplayHints = {
  themeChips: string[];
  narrativeLanes: NarrativeLaneHint[];
  reactionCoverage?: ReactionCoverage;
  reactionPatterns: ReactionPattern[];
};

function normalizeSectionBody(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isRawEmptySection(value: string | undefined): boolean {
  const normalized = normalizeSectionBody(value);
  return normalized.length === 0 || normalized === "尚未生成";
}

function buildReportSections(report: TopicAuditReport): ReportSection[] {
  return SECTION_META.map((section) => {
    const body = report.sections[section.key] ?? "";
    const duplicateEditorial = section.key === "editorial"
      && !isRawEmptySection(body)
      && normalizeSectionBody(body) === normalizeSectionBody(report.sections.overall);
    return {
      ...section,
      body,
      empty: isRawEmptySection(body) || duplicateEditorial
    };
  });
}

function readAuditReportDisplayHints(auditMemos: TopicAuditMemoBundle | null | undefined): AuditReportDisplayHints {
  const hints: AuditReportDisplayHints = { themeChips: [], narrativeLanes: [], reactionPatterns: [] };
  for (const memo of auditMemos?.lensMemos ?? []) {
    const displayHints = memo.displayHints;
    if (!displayHints) continue;
    if (!hints.themeChips.length && displayHints.themeChips?.length) {
      hints.themeChips = displayHints.themeChips;
    }
    if (!hints.narrativeLanes.length && displayHints.narrativeLanes?.length) {
      hints.narrativeLanes = displayHints.narrativeLanes;
    }
    if (!hints.reactionCoverage && displayHints.reactionCoverage) {
      hints.reactionCoverage = displayHints.reactionCoverage;
    }
    if (!hints.reactionPatterns.length && displayHints.reactionPatterns?.length) {
      hints.reactionPatterns = displayHints.reactionPatterns;
    }
  }
  return hints;
}

function normalizeCoverageLabel(value: string | undefined): string | null {
  const normalized = (value ?? "").trim();
  if (!normalized || normalized === "unknown") return null;
  return normalized;
}

function readReportCoverageLabel(
  report: TopicAuditReport,
  auditMemos: TopicAuditMemoBundle | null | undefined
): string | null {
  const candidates = [
    report.coveragePerSection.overall,
    report.coveragePerSection.editorial,
    report.coveragePerSection.narratives,
    ...(auditMemos?.lensMemos ?? []).map((memo) => memo.coverage)
  ];
  for (const candidate of candidates) {
    const normalized = normalizeCoverageLabel(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function parseNumberedListItems(text: string): string[] | null {
  const markers: Array<{ number: number; markerStart: number; contentStart: number }> = [];
  const markerPattern = /(^|\s)(\d+)\.\s+/g;
  for (const match of text.matchAll(markerPattern)) {
    const leading = match[1] ?? "";
    const number = Number(match[2]);
    const markerStart = (match.index ?? 0) + leading.length;
    markers.push({
      number,
      markerStart,
      contentStart: (match.index ?? 0) + match[0].length
    });
  }

  const leadingWhitespace = text.length - text.trimStart().length;
  if (markers.length < 2 || markers[0]?.markerStart !== leadingWhitespace || markers[0]?.number !== 1) {
    return null;
  }

  for (let index = 0; index < markers.length; index += 1) {
    if (markers[index]?.number !== index + 1) {
      return null;
    }
  }

  const items = markers.map((marker, index) => {
    const nextMarker = markers[index + 1];
    return text.slice(marker.contentStart, nextMarker?.markerStart ?? text.length).trim();
  }).filter(Boolean);

  return items.length === markers.length ? items : null;
}

export function sortFlagsBySeverity(flags: TopicAuditValidationFlag[]): TopicAuditValidationFlag[] {
  return [...flags].sort((left, right) => {
    const severityDelta = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severityDelta !== 0) return severityDelta;
    return left.section.localeCompare(right.section);
  });
}

export function serializeReportMarkdown(report: TopicAuditReport, flags: TopicAuditValidationFlag[] = []): string {
  const sections = buildReportSections(report).map((section) => `${section.number} ${section.title}\n${section.empty ? EMPTY_SECTION_COPY : section.body}`);
  const quality = sortFlagsBySeverity(flags).map((flag) => `- ${flag.severity} ${flag.section}: ${flag.reason} ${flag.evidenceRefs.join(" ")}`.trim());
  return [
    `# ${report.topicName}`,
    `Generated: ${report.generatedAt}`,
    ...sections,
    "§8 資料品質",
    ...(quality.length ? quality : ["- No validator flags"])
  ].join("\n\n");
}

export function serializeReportJsonl(
  report: TopicAuditReport,
  packets: EvidencePacket[],
  flags: TopicAuditValidationFlag[]
): string {
  const lines: string[] = [];
  lines.push(JSON.stringify({ kind: "report", topicId: report.topicId, topicName: report.topicName, generatedAt: report.generatedAt, promptVersion: report.promptVersion, model: report.model, coveragePerSection: report.coveragePerSection, sections: report.sections, limitations: report.limitations }));
  for (const flag of sortFlagsBySeverity(flags)) {
    lines.push(JSON.stringify({ kind: "validator-flag", severity: flag.severity, section: flag.section, flagKind: flag.kind, reason: flag.reason, evidenceRefs: flag.evidenceRefs }));
  }
  for (const packet of packets) {
    lines.push(JSON.stringify({ kind: "evidence", shortCode: packet.shortCode, signalId: packet.signalId, sourceUrl: packet.sourceUrl, capturedAt: packet.capturedAt, opAuthor: packet.opAuthor, opText: packet.opText, opLikes: packet.opLikes, commentCount: packet.commentCount, replyFragments: packet.replyFragments, gaps: packet.gaps }));
  }
  return lines.join("\n");
}

function downloadBlob(filename: string, mime: string, content: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function renderCitations(text: string): ReactNode[] {
  return text.split(REF_PATTERN).map((part, index) => {
    if (REF_PATTERN.test(part)) {
      REF_PATTERN.lastIndex = 0;
      return (
        <a
          key={`${part}-${index}`}
          className="ref"
          data-ref={part}
          href={`#source-${part}`}
          style={{
            color: tokens.topicAccent.primary,
            fontFamily: tokens.font.mono,
            fontSize: "0.9em",
            fontWeight: 800,
            textDecoration: "none"
          }}
        >
          {part}
        </a>
      );
    }
    REF_PATTERN.lastIndex = 0;
    return part;
  });
}

function severityStyle(severity: TopicAuditValidationSeverity) {
  if (severity === "FAIL") {
    return { color: tokens.topicAccent.fail, bg: tokens.topicAccent.failBg };
  }
  if (severity === "WEAK") {
    return { color: tokens.topicAccent.warm, bg: tokens.topicAccent.tintAmber };
  }
  return { color: tokens.topicAccent.primary, bg: tokens.topicAccent.tintSage };
}

function SectionBody({ section }: { section: ReportSection }) {
  if (section.empty) {
    return (
      <div
        data-audit-report-empty-state="true"
        style={{
          borderRadius: tokens.radius.card,
          background: tokens.color.contextSurface,
          color: tokens.color.softInk,
          padding: "10px 12px",
          fontSize: 13,
          lineHeight: 1.6
        }}
      >
        {EMPTY_SECTION_COPY}
      </div>
    );
  }

  const listItems = parseNumberedListItems(section.body);
  if (listItems) {
    return (
      <ol
        data-audit-report-ordered-list="true"
        style={{
          margin: 0,
          paddingLeft: 22,
          display: "grid",
          gap: 8,
          fontSize: 14,
          lineHeight: 1.78,
          color: tokens.color.subInk
        }}
      >
        {listItems.map((item, index) => (
          <li key={`${section.key}-${index}`} style={{ paddingLeft: 4 }}>
            {renderCitations(item)}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.78, color: tokens.color.subInk }}>
      {renderCitations(section.body)}
    </p>
  );
}

export function AuditReportView({
  topicId,
  report,
  packets = [],
  auditMemos = null,
  flags = [],
  onCopyMarkdown
}: {
  topicId: string;
  report: TopicAuditReport | null;
  packets?: EvidencePacket[];
  auditMemos?: TopicAuditMemoBundle | null;
  flags?: TopicAuditValidationFlag[];
  onCopyMarkdown?: (markdown: string) => void;
}) {
  const markdown = report ? serializeReportMarkdown(report, flags) : "";
  const reportSections = report ? buildReportSections(report) : SECTION_META.map((section) => ({ ...section, body: "", empty: false }));
  const displayHints = readAuditReportDisplayHints(auditMemos);
  const coverageLabel = report ? readReportCoverageLabel(report, auditMemos) : null;
  return (
    <div
      data-audit-report-view="topic-audit"
      data-topic-id={topicId}
      style={{
        minHeight: "100vh",
        background: tokens.color.canvas,
        color: tokens.color.ink,
        fontFamily: tokens.font.sans,
        display: "grid",
        gridTemplateColumns: "240px minmax(0, 800px)",
        gap: 34,
        padding: 28
      }}
    >
      <nav style={{ position: "sticky", top: 24, alignSelf: "start", display: "grid", gap: 8, fontSize: 12 }}>
        {reportSections.map((section) => (
          <a
            key={section.key}
            href={`#${section.key}`}
            data-audit-report-toc-empty={section.empty ? "true" : undefined}
            style={{
              color: section.empty ? tokens.color.softInk : tokens.color.subInk,
              opacity: section.empty ? 0.58 : 1,
              textDecoration: "none",
              fontWeight: 700
            }}
          >
            {section.number} {section.title}
          </a>
        ))}
        <a href="#dq" style={{ color: tokens.topicAccent.primary, textDecoration: "none", fontWeight: 800 }}>§8 資料品質</a>
      </nav>

      <main style={{ display: "grid", gap: 22 }}>
        <header style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span data-audit-report-topic-id={topicId} style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.topicAccent.primary }}>
              {topicId}
            </span>
            {coverageLabel ? (
              <span
                data-audit-report-coverage={coverageLabel}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: tokens.radius.round,
                  background: tokens.topicAccent.tintSage,
                  color: tokens.topicAccent.primaryDeep,
                  padding: "2px 9px",
                  fontFamily: tokens.font.mono,
                  fontSize: 11,
                  fontWeight: 800
                }}
              >
                覆蓋 {coverageLabel}
              </span>
            ) : null}
            {report ? (
              <span style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.color.softInk }}>
                {report.promptVersion} · {report.model}
              </span>
            ) : null}
          </div>
          <h1 style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 36, lineHeight: 1.05 }}>
            {report?.topicName ?? "審查報告生成中"}
          </h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <PrimaryButton disabled={!report} onClick={() => report && onCopyMarkdown?.(markdown)}>複製引用</PrimaryButton>
            <GhostButton
              disabled={!report}
              onClick={() => {
                if (!report) return;
                const safeName = (report.topicName || "report").replace(/[^a-z0-9一-龥_-]+/gi, "_").slice(0, 60);
                downloadBlob(`${safeName}.md`, "text/markdown;charset=utf-8", markdown);
              }}
            >下載 Markdown</GhostButton>
            <GhostButton
              disabled={!report}
              onClick={() => {
                if (!report) return;
                const safeName = (report.topicName || "report").replace(/[^a-z0-9一-龥_-]+/gi, "_").slice(0, 60);
                downloadBlob(`${safeName}.jsonl`, "application/x-ndjson;charset=utf-8", serializeReportJsonl(report, packets, flags));
              }}
            >下載 JSONL</GhostButton>
            <GhostButton
              disabled={!report}
              onClick={() => {
                if (typeof window !== "undefined") window.print();
              }}
            >列印 / 存 PDF</GhostButton>
          </div>
          {displayHints.themeChips.length ? (
            <div data-audit-report-theme-strip="true" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {displayHints.themeChips.map((theme) => (
                <ThemeChip key={theme} label={theme} />
              ))}
            </div>
          ) : null}
        </header>

        {report ? reportSections.map((section) => (
          <section
            key={section.key}
            id={section.key}
            data-audit-report-section={section.key}
            style={{
              display: "grid",
              gap: 10,
              borderTop: `1px solid ${tokens.color.line}`,
              paddingTop: 18
            }}
          >
            <h2 style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 22 }}>
              {section.number} {section.title}
            </h2>
            {section.key === "narratives" && !section.empty ? (
              <AuditReportNarrativeLanes lanes={displayHints.narrativeLanes} />
            ) : null}
            {section.key === "audience" && displayHints.reactionPatterns.length > 0 ? (
              <AuditReportReactionPatterns
                patterns={displayHints.reactionPatterns}
                coverage={displayHints.reactionCoverage}
              />
            ) : (
              <SectionBody section={section} />
            )}
          </section>
        )) : (
          <section style={{ display: "grid", gap: 10 }}>
            {SECTION_META.map((section) => (
              <div key={section.key} style={{ height: 72, borderRadius: tokens.radius.card, background: tokens.color.contextSurface, animation: tokens.motion.keyframes.shimmer }} />
            ))}
          </section>
        )}

        <section id="dq" data-audit-report-section="data-quality" style={{ display: "grid", gap: 10, borderTop: `1px solid ${tokens.color.line}`, paddingTop: 18 }}>
          <h2 style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 22 }}>§8 資料品質</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {sortFlagsBySeverity(flags).length ? sortFlagsBySeverity(flags).map((flag, index) => {
              const style = severityStyle(flag.severity);
              return (
                <div key={`${flag.severity}-${flag.kind}-${index}`} data-validator-flag={flag.severity} style={{ borderRadius: tokens.radius.card, background: style.bg, padding: "10px 12px", color: style.color }}>
                  <strong>{flag.severity}</strong> {flag.section} · {flag.reason}
                </div>
              );
            }) : <div style={{ color: tokens.color.softInk, fontSize: 13 }}>No validator flags</div>}
          </div>
        </section>

        {packets.length ? (
          <section style={{ display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0, fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 22 }}>Sources</h2>
            {packets.map((packet) => (
              <div key={packet.shortCode} id={`source-${packet.shortCode}.OP`} style={{ borderRadius: tokens.radius.card, background: tokens.color.elevated, boxShadow: tokens.shadow.topicCard, padding: 12 }}>
                <span style={{ fontFamily: tokens.font.mono, color: tokens.topicAccent.primary, fontSize: 11 }}>{packet.shortCode}.OP</span>
                <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.6, color: tokens.color.subInk }}>{packet.opText}</p>
              </div>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export const auditReportViewTestables = {
  sortFlagsBySeverity,
  serializeReportMarkdown,
  serializeReportJsonl
};
