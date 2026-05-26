import type { ReactNode } from "react";

import type { EvidencePacket, TopicAuditReport } from "../compare/topic-audit.ts";
import type { TopicAuditValidationFlag, TopicAuditValidationSeverity } from "../compare/topic-audit-validator.ts";
import { tokens } from "./tokens";
import { GhostButton, PrimaryButton } from "./topic-audit-components.tsx";

const SECTION_META: Array<{ key: keyof TopicAuditReport["sections"]; number: string; title: string }> = [
  { key: "overall", number: "§1", title: "整體" },
  { key: "lexicon", number: "§2", title: "詞群" },
  { key: "scaleOrTime", number: "§3", title: "時間" },
  { key: "narratives", number: "§4", title: "敘事" },
  { key: "audience", number: "§5", title: "受眾" },
  { key: "absence", number: "§6", title: "缺席" },
  { key: "editorial", number: "§7", title: "編輯" }
];

const SEVERITY_ORDER: Record<TopicAuditValidationSeverity, number> = {
  FAIL: 0,
  WEAK: 1,
  SCOPE: 2
};

const REF_PATTERN = /(S\d+\.(?:OPC\d+|OP|R\d+|P\d+))/g;

export function sortFlagsBySeverity(flags: TopicAuditValidationFlag[]): TopicAuditValidationFlag[] {
  return [...flags].sort((left, right) => {
    const severityDelta = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severityDelta !== 0) return severityDelta;
    return left.section.localeCompare(right.section);
  });
}

export function serializeReportMarkdown(report: TopicAuditReport, flags: TopicAuditValidationFlag[] = []): string {
  const sections = SECTION_META.map((section) => `${section.number} ${section.title}\n${report.sections[section.key] || "尚未生成"}`);
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

export function AuditReportView({
  topicId,
  report,
  packets = [],
  flags = [],
  onCopyMarkdown
}: {
  topicId: string;
  report: TopicAuditReport | null;
  packets?: EvidencePacket[];
  flags?: TopicAuditValidationFlag[];
  onCopyMarkdown?: (markdown: string) => void;
}) {
  const markdown = report ? serializeReportMarkdown(report, flags) : "";
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
        {SECTION_META.map((section) => (
          <a key={section.key} href={`#${section.key}`} style={{ color: tokens.color.subInk, textDecoration: "none", fontWeight: 700 }}>
            {section.number} {section.title}
          </a>
        ))}
        <a href="#dq" style={{ color: tokens.topicAccent.primary, textDecoration: "none", fontWeight: 800 }}>§8 資料品質</a>
      </nav>

      <main style={{ display: "grid", gap: 22 }}>
        <header style={{ display: "grid", gap: 12 }}>
          <span style={{ fontFamily: tokens.font.mono, fontSize: 11, color: tokens.topicAccent.primary }}>{topicId}</span>
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
        </header>

        {report ? SECTION_META.map((section) => (
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
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.78, color: tokens.color.subInk }}>
              {renderCitations(report.sections[section.key] || "尚未生成")}
            </p>
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
