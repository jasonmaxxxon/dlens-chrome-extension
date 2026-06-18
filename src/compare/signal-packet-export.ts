import type { DLensSignalFeedbackTimelineEvent, DLensSignalPacket, SignalPacketIndexFilter } from "./signal-packet.ts";

export type SignalPacketExportFormat = "jsonl" | "markdown" | "html";

export interface SignalPacketExportOptions {
  format: SignalPacketExportFormat;
  filter?: SignalPacketIndexFilter;
  generatedAt?: string;
}

export interface SignalPacketExportResult {
  format: SignalPacketExportFormat;
  content: string;
  filename: string;
  mimeType: string;
  packetCount: number;
  generatedAt: string;
}

export function exportSignalPackets(
  packets: DLensSignalPacket[],
  options: SignalPacketExportOptions
): SignalPacketExportResult {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const extension = formatExtension(options.format);
  const mimeType = formatMimeType(options.format);
  return {
    format: options.format,
    content: renderContent(packets, options.format, generatedAt),
    filename: `dlens-signal-packets-${sanitizeTimestamp(generatedAt)}.${extension}`,
    mimeType,
    packetCount: packets.length,
    generatedAt
  };
}

function renderContent(packets: DLensSignalPacket[], format: SignalPacketExportFormat, generatedAt: string): string {
  if (format === "jsonl") {
    return renderJsonl(packets);
  }
  if (format === "html") {
    return renderHtml(packets, generatedAt);
  }
  return renderMarkdown(packets, generatedAt);
}

function formatExtension(format: SignalPacketExportFormat): string {
  if (format === "jsonl") {
    return "jsonl";
  }
  if (format === "html") {
    return "html";
  }
  return "md";
}

function formatMimeType(format: SignalPacketExportFormat): string {
  if (format === "jsonl") {
    return "application/x-ndjson;charset=utf-8";
  }
  if (format === "html") {
    return "text/html;charset=utf-8";
  }
  return "text/markdown;charset=utf-8";
}

function renderJsonl(packets: DLensSignalPacket[]): string {
  return packets.map((packet) => JSON.stringify(packet)).join("\n");
}

function renderMarkdown(packets: DLensSignalPacket[], generatedAt: string): string {
  const lines = [
    "# DLens Signal Packet Export",
    "",
    `generatedAt: ${generatedAt}`,
    `packetCount: ${packets.length}`,
    ""
  ];

  for (const packet of packets) {
    lines.push(...renderPacketMarkdown(packet));
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderPacketMarkdown(packet: DLensSignalPacket): string[] {
  const lines = [
    `## ${packet.source.signalId}`,
    "",
    `packetVersion: ${packet.packetVersion}`,
    `Source: ${packet.source.source}`,
    `URL: ${packet.source.url || "(none)"}`,
    `Captured: ${packet.source.capturedAt || "(unknown)"}`,
    `Session: ${packet.source.sessionName || packet.source.sessionId}`,
    ""
  ];

  if (hasProductContext(packet)) {
    lines.push(
      "### Product context",
      "",
      `Hash: ${packet.productContext.hash || "(none)"}`,
      `Compiled: ${packet.productContext.compiledAt || "(unknown)"}`,
      `Product promise: ${packet.productContext.productPromise || "(none)"}`,
      `Target audience: ${packet.productContext.targetAudience || "(none)"}`,
      `Agent roles: ${formatList(packet.productContext.agentRoles)}`,
      `Core workflows: ${formatList(packet.productContext.coreWorkflows)}`,
      `Current capabilities: ${formatList(packet.productContext.currentCapabilities)}`,
      `Explicit constraints: ${formatList(packet.productContext.explicitConstraints)}`,
      `Non-goals: ${formatList(packet.productContext.nonGoals)}`,
      `Preferred tech direction: ${packet.productContext.preferredTechDirection || "(none)"}`,
      `Evaluation criteria: ${formatList(packet.productContext.evaluationCriteria)}`,
      `Unknowns: ${formatList(packet.productContext.unknowns)}`,
      `Source file ids: ${formatList(packet.productContext.sourceFileIds)}`,
      `Prompt version: ${packet.productContext.promptVersion || "(unknown)"}`,
      ""
    );
  }

  if (packet.judgment) {
    lines.push(
      "### Judgment",
      "",
      `Verdict: ${packet.judgment.verdict}`,
      `Relevance: ${packet.judgment.relevance}`,
      `Type: ${packet.judgment.signalType} / ${packet.judgment.signalSubtype}`,
      `Summary: ${packet.judgment.contentSummary}`,
      `Reason: ${packet.judgment.reason}`,
      ""
    );
  }

  if (packet.evidence.assembledContent) {
    lines.push(
      "### Source packet",
      "",
      packet.evidence.assembledContent,
      ""
    );
  }

  if (packet.evidence.textEvidence.length) {
    lines.push("### Text evidence", "");
    for (const evidence of packet.evidence.textEvidence) {
      lines.push(`- ${evidence.ref} (${evidence.author || "unknown"}): ${evidence.text}`);
    }
    lines.push("");
  }

  if (packet.evidence.imageEvidence.length) {
    lines.push("### Image evidence", "");
    for (const evidence of packet.evidence.imageEvidence) {
      lines.push(`- ${evidence.ref}: ${evidence.ocrText || evidence.visualSummary || evidence.sourceUrl || "(no text)"}`);
    }
    lines.push("");
  }

  if (packet.reading.latest) {
    lines.push(
      "### Latest reading",
      "",
      packet.reading.latest.reading,
      ""
    );
  }

  if (packet.userFeedback.feedbackTimeline.length) {
    lines.push("### Feedback timeline", "");
    for (const event of packet.userFeedback.feedbackTimeline) {
      lines.push(`- ${renderFeedbackEvent(event)}`);
    }
    lines.push("");
  }

  if (packet.decisionTrace.stages.length) {
    lines.push("### Decision trace", "");
    lines.push(`Trace version: ${packet.decisionTrace.traceVersion}`, "");
    for (const stage of packet.decisionTrace.stages) {
      lines.push(
        `- ${stage.stage} (${stage.outputKind})`,
        `  Model: ${stage.model || "(unknown)"}`,
        `  Prompt: ${stage.promptVersion}`,
        `  Generated: ${stage.generatedAt}`,
        `  Summary: ${stage.reasoningDetails.summary}`
      );
      if (stage.evidenceRefs.length) {
        lines.push(`  Evidence refs: ${stage.evidenceRefs.join(", ")}`);
      }
      if (stage.reasoningDetails.keyInsights.length) {
        lines.push(`  Key insights: ${stage.reasoningDetails.keyInsights.join(" / ")}`);
      }
    }
    lines.push("");
  }

  if (packet.agentHandoff.taskPrompt) {
    lines.push(
      "### Agent handoff",
      "",
      `Target: ${packet.agentHandoff.targetAgent || "generic"}`,
      "",
      "```text",
      packet.agentHandoff.taskPrompt,
      "```",
      ""
    );
  }

  if (packet.topicContext.topics.length) {
    lines.push(
      "### Topic context",
      "",
      ...packet.topicContext.topics.map((topic) => `- ${topic.name} (${topic.status})`),
      ""
    );
  }

  return lines;
}

function hasProductContext(packet: DLensSignalPacket): boolean {
  const context = packet.productContext;
  return Boolean(context.hash || context.productPromise || context.coreWorkflows.length || context.currentCapabilities.length);
}

function formatList(values: string[]): string {
  return values.length ? values.join(" / ") : "(none)";
}

function renderFeedbackEvent(event: DLensSignalFeedbackTimelineEvent): string {
  if (event.kind === "reading") {
    return [
      event.at,
      `reading ${event.type}`,
      event.note ? `- ${event.note}` : ""
    ].filter(Boolean).join(" ");
  }
  return [
    event.at,
    `agent_task ${event.feedback}`,
    event.note ? `- ${event.note}` : ""
  ].filter(Boolean).join(" ");
}

function renderHtml(packets: DLensSignalPacket[], generatedAt: string): string {
  const lanes = {
    try: packets.filter((packet) => packet.judgment?.verdict === "try"),
    watch: packets.filter((packet) => packet.judgment?.verdict === "watch"),
    skip: packets.filter((packet) => packet.judgment?.verdict !== "try" && packet.judgment?.verdict !== "watch")
  };
  const handoffPackets = packets.filter((packet) => Boolean(packet.agentHandoff.taskPrompt));
  const productContext = packets.find((packet) => hasProductContext(packet))?.productContext;

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DLens Signal Reading</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;700;900&family=Noto+Sans+TC:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap">
  <style>
    :root {
      color-scheme: light;
      --paper: #faf9f5;
      --paper-deep: #f3f0e7;
      --surface: #fffefa;
      --ink: #22201d;
      --ink-soft: #3d3a35;
      --muted: #706a61;
      --soft-muted: #8e887e;
      --line: #ddd6ca;
      --line-soft: #ebe5d8;
      --soft: #f1eee7;
      --try: #234b3a;
      --try-soft: #e3ede5;
      --watch: #6d5522;
      --watch-soft: #efe8d3;
      --skip: #6c6460;
      --skip-soft: #ece8e1;
      --accent: #7b3a1f;
      --serif: "Noto Serif TC", "Source Han Serif TC", "Songti TC", "Times New Roman", serif;
      --sans: "Noto Sans TC", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", sans-serif;
      --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font: 16px/1.75 var(--serif);
      font-feature-settings: "palt" 1;
      letter-spacing: 0.01em;
    }
    main {
      width: min(720px, calc(100vw - 40px));
      margin: 0 auto;
      padding: 64px 0 96px;
    }
    .cover {
      padding-bottom: 40px;
      margin-bottom: 48px;
      border-bottom: 1px solid var(--line);
    }
    .cover-kicker {
      font: 500 11px/1 var(--sans);
      letter-spacing: 0.32em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 22px;
    }
    h1 {
      font-family: var(--serif);
      font-weight: 900;
      font-size: clamp(34px, 5.2vw, 54px);
      line-height: 1.08;
      margin: 0 0 18px;
      letter-spacing: -0.01em;
      color: var(--ink);
    }
    .cover-dek {
      font-family: var(--serif);
      font-size: 17px;
      line-height: 1.6;
      color: var(--ink-soft);
      max-width: 56ch;
      margin: 0;
    }
    .cover-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 18px;
      font: 500 12px/1.4 var(--sans);
      color: var(--muted);
      margin-top: 26px;
      letter-spacing: 0;
    }
    .cover-meta span::before {
      content: "·";
      margin-right: 18px;
      color: var(--line);
    }
    .cover-meta span:first-child::before { content: none; margin: 0; }
    .ratio-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin: 32px 0 0;
    }
    .ratio {
      border: 1px solid var(--line);
      background: var(--surface);
      padding: 18px 18px 16px;
      border-radius: 2px;
    }
    .ratio[data-lane="try"] { border-top: 3px solid var(--try); }
    .ratio[data-lane="watch"] { border-top: 3px solid var(--watch); }
    .ratio[data-lane="skip"] { border-top: 3px solid var(--skip); }
    .ratio strong {
      display: block;
      font-family: var(--serif);
      font-weight: 700;
      font-size: 32px;
      line-height: 1;
      color: var(--ink);
      margin-bottom: 6px;
    }
    .ratio[data-lane="try"] strong { color: var(--try); }
    .ratio[data-lane="watch"] strong { color: var(--watch); }
    .ratio[data-lane="skip"] strong { color: var(--skip); }
    .ratio span.ratio-label {
      font: 500 11px/1.3 var(--sans);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
    }
    nav.toc {
      margin-top: 36px;
      padding: 22px 24px;
      background: var(--paper-deep);
      border-radius: 2px;
    }
    nav.toc h2 {
      font: 500 10px/1 var(--sans);
      letter-spacing: 0.32em;
      text-transform: uppercase;
      color: var(--muted);
      margin: 0 0 14px;
    }
    nav.toc ol {
      margin: 0;
      padding: 0;
      list-style: none;
      counter-reset: toc-counter;
    }
    nav.toc li {
      counter-increment: toc-counter;
      font: 400 14px/1.7 var(--serif);
      padding: 2px 0;
      display: flex;
      gap: 12px;
      align-items: baseline;
    }
    nav.toc li::before {
      content: counter(toc-counter, decimal-leading-zero);
      font: 500 11px/1 var(--sans);
      color: var(--muted);
      letter-spacing: 0.04em;
      min-width: 24px;
    }
    nav.toc a {
      text-decoration: none;
      border-bottom: 1px dotted var(--line);
      padding-bottom: 1px;
      color: var(--ink-soft);
    }
    nav.toc a:hover { color: var(--accent); border-bottom-color: var(--accent); }
    nav.toc .toc-lane {
      font: 500 10px/1 var(--sans);
      letter-spacing: 0.16em;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 999px;
      margin-right: 4px;
      flex-shrink: 0;
    }
    nav.toc .toc-lane.try { background: var(--try-soft); color: var(--try); }
    nav.toc .toc-lane.watch { background: var(--watch-soft); color: var(--watch); }
    nav.toc .toc-lane.skip { background: var(--skip-soft); color: var(--skip); }
    h2.lane-heading {
      font: 700 11px/1 var(--sans);
      letter-spacing: 0.32em;
      text-transform: uppercase;
      color: var(--muted);
      margin: 0 0 22px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--line);
    }
    h2.lane-heading[data-lane="try"] { color: var(--try); border-bottom-color: var(--try); }
    h2.lane-heading[data-lane="watch"] { color: var(--watch); border-bottom-color: var(--watch); }
    h2.lane-heading[data-lane="skip"] { color: var(--skip); border-bottom-color: var(--skip); }
    h2.lane-heading .muted { font-weight: 400; color: var(--muted); margin-left: 6px; }
    .verdict-lane {
      margin-top: 48px;
    }
    .verdict-lane:first-of-type { margin-top: 48px; }
    .lane-empty {
      color: var(--muted);
      font-size: 14px;
      font-style: italic;
      padding: 12px 0;
    }
    .signal-card {
      margin: 0 0 44px;
      padding: 0;
      background: transparent;
      border: none;
    }
    .signal-card + .signal-card {
      padding-top: 44px;
      border-top: 1px solid var(--line-soft);
    }
    .signal-head { margin-bottom: 14px; }
    .signal-kicker {
      font: 500 11px/1.4 var(--sans);
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
    }
    .signal-kicker .pill {
      padding: 2px 8px;
      border-radius: 999px;
      letter-spacing: 0.12em;
      font-size: 10px;
    }
    .pill.try { background: var(--try-soft); color: var(--try); border: none; }
    .pill.watch { background: var(--watch-soft); color: var(--watch); border: none; }
    .pill.skip { background: var(--skip-soft); color: var(--skip); border: none; }
    h3.signal-title {
      font: 700 26px/1.3 var(--serif);
      letter-spacing: -0.005em;
      margin: 0 0 16px;
      color: var(--ink);
    }
    .reason {
      font: 400 16px/1.75 var(--serif);
      font-style: italic;
      color: var(--ink-soft);
      margin: 0 0 18px;
      padding-left: 14px;
      border-left: 2px solid var(--line);
    }
    .insight-row {
      display: grid;
      gap: 12px;
      margin: 16px 0 22px;
      padding: 14px 16px;
      background: var(--paper-deep);
      border-radius: 2px;
    }
    .insight-row .insight-label {
      font: 500 10px/1 var(--sans);
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 4px;
      display: block;
    }
    .insight-row .insight-body {
      font: 400 14.5px/1.7 var(--serif);
      color: var(--ink-soft);
      margin: 0;
    }
    .reading-panel {
      margin: 24px 0;
    }
    .reading-panel h4 {
      margin: 0 0 12px;
      font: 500 10px/1 var(--sans);
      letter-spacing: 0.32em;
      text-transform: uppercase;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .reading-panel h4::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--line);
    }
    .reading-text {
      font: 400 16px/1.75 var(--serif);
      color: var(--ink);
    }
    .reading-text p {
      margin: 0 0 0.8em;
    }
    .reading-text p:last-child { margin-bottom: 0; }
    .reading-text strong { font-weight: 700; color: var(--ink); }
    .reading-text em { font-style: italic; color: var(--accent); }
    .cited-evidence {
      margin: 24px 0;
    }
    .cited-evidence h4 {
      margin: 0 0 12px;
      font: 500 10px/1 var(--sans);
      letter-spacing: 0.32em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .cited-quote {
      margin: 0 0 12px;
      padding: 12px 16px 12px 18px;
      background: var(--surface);
      border-left: 3px solid var(--line);
      border-radius: 0 2px 2px 0;
    }
    .cited-quote .quote-ref {
      font: 500 11px/1 var(--sans);
      letter-spacing: 0.12em;
      color: var(--muted);
      margin-bottom: 6px;
      display: flex;
      gap: 10px;
      align-items: baseline;
    }
    .cited-quote .quote-ref strong {
      color: var(--accent);
      font-weight: 700;
    }
    .cited-quote .quote-text {
      font: 400 14.5px/1.65 var(--serif);
      color: var(--ink);
      margin: 0;
    }
    .cited-quote .quote-note {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed var(--line);
      font: 400 13px/1.7 var(--sans);
      color: var(--ink-soft);
      display: grid;
      gap: 4px;
    }
    .cited-quote .quote-note .note-label {
      font: 500 10px/1 var(--sans);
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .cited-quote .quote-recipe {
      margin-top: 8px;
      padding: 10px 12px;
      background: var(--paper);
      border-radius: 2px;
      font: 400 12.5px/1.65 var(--mono);
      color: var(--ink-soft);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    details.evidence-collapse {
      margin-top: 6px;
    }
    details.evidence-collapse > summary {
      cursor: pointer;
      list-style: none;
      font: 500 10px/1 var(--sans);
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--muted);
      padding: 8px 0;
      user-select: none;
    }
    details.evidence-collapse > summary::-webkit-details-marker { display: none; }
    details.evidence-collapse > summary::before {
      content: "▸ ";
      display: inline-block;
      margin-right: 4px;
      transition: transform 120ms ease;
    }
    details.evidence-collapse[open] > summary::before { content: "▾ "; }
    details.evidence-collapse > summary:hover { color: var(--accent); }
    details.evidence-collapse[open] > summary { color: var(--ink-soft); }
    details.evidence-collapse > .evidence-collapse-body { margin-top: 6px; }
    .source-link {
      display: inline-block;
      margin: 14px 0 0;
      font: 500 12px/1.4 var(--sans);
      letter-spacing: 0.04em;
      color: var(--accent);
      text-decoration: none;
      border-bottom: 1px solid var(--accent);
      padding-bottom: 1px;
    }
    .source-link::after { content: " ↗"; }
    .signal-meta {
      margin-top: 18px;
      font: 400 11px/1.5 var(--sans);
      color: var(--soft-muted);
      letter-spacing: 0;
    }
    .signal-detail {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid var(--line-soft);
    }
    .signal-detail summary {
      cursor: pointer;
      font: 500 10px/1 var(--sans);
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: var(--muted);
      padding: 4px 0;
      user-select: none;
    }
    .signal-detail summary:hover { color: var(--accent); }
    .signal-detail[open] summary { color: var(--ink-soft); }
    .detail-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin-top: 12px;
    }
    .detail-block {
      background: var(--soft);
      padding: 14px 16px;
      border-radius: 2px;
    }
    .detail-block h4 {
      margin: 0 0 10px;
      font: 500 10px/1 var(--sans);
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .detail-block ul { margin: 0; padding-left: 18px; }
    .detail-block li {
      font: 400 13.5px/1.7 var(--serif);
      color: var(--ink-soft);
    }
    .detail-block li + li { margin-top: 8px; }
    .detail-block li strong {
      font: 500 11px/1 var(--sans);
      color: var(--accent);
      margin-right: 6px;
    }
    .handoff {
      margin-top: 72px;
      padding-top: 32px;
      border-top: 2px solid var(--line);
    }
    .handoff > h2 {
      font: 700 11px/1 var(--sans);
      letter-spacing: 0.32em;
      text-transform: uppercase;
      color: var(--muted);
      margin: 0 0 24px;
    }
    .task {
      background: var(--surface);
      border: 1px solid var(--line);
      border-left: 3px solid var(--accent);
      padding: 20px 22px;
      margin: 0 0 18px;
      border-radius: 0 2px 2px 0;
    }
    .task h3 {
      font: 700 18px/1.4 var(--serif);
      margin: 0 0 6px;
      color: var(--ink);
    }
    .task .task-agent {
      font: 500 10px/1 var(--sans);
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: var(--accent);
      margin: 0 0 12px;
    }
    .task pre {
      background: var(--paper);
      padding: 14px 16px;
      border-radius: 2px;
      font: 400 13px/1.7 var(--mono);
      color: var(--ink-soft);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      margin: 0;
    }
    .task .task-feedback {
      margin-top: 10px;
      font: 400 12px/1.5 var(--sans);
      color: var(--muted);
    }
    footer.colophon {
      margin-top: 80px;
      padding-top: 24px;
      border-top: 1px solid var(--line);
      font: 400 11px/1.7 var(--sans);
      color: var(--soft-muted);
      letter-spacing: 0;
    }
    footer.colophon .colophon-line {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
    }
    .product-context {
      margin-top: 24px;
      padding: 18px 20px;
      background: var(--paper-deep);
      border-radius: 2px;
      font: 400 12.5px/1.7 var(--sans);
      color: var(--ink-soft);
    }
    .product-context h4 {
      margin: 0 0 10px;
      font: 500 10px/1 var(--sans);
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .product-context dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 4px 14px;
      margin: 0;
    }
    .product-context dt {
      font-weight: 500;
      color: var(--muted);
      letter-spacing: 0.04em;
    }
    .product-context dd { margin: 0; color: var(--ink-soft); }
    @media (max-width: 720px) {
      main { width: calc(100vw - 32px); padding: 40px 0 64px; }
      h1 { font-size: clamp(28px, 7vw, 38px); }
      .ratio-row { grid-template-columns: 1fr; }
      .reading-text { font-size: 16px; line-height: 1.85; }
      h3.signal-title { font-size: 22px; }
      .product-context dl { grid-template-columns: 1fr; gap: 2px 0; }
    }
    @media print {
      body { background: white; }
      main { padding: 0; }
      .signal-detail[open] summary { display: none; }
      nav.toc { background: transparent; padding: 0; }
    }
  </style>
</head>
<body>
  <main data-signal-packet-density="compact">
    <header class="cover">
      <p class="cover-kicker">DLens · Signal Reading</p>
      <h1>${escapeHtml(coverTitle(packets))}</h1>
      <p class="cover-dek">${escapeHtml(coverDek(packets, productContext))}</p>
      <div class="cover-meta">
        <span>${escapeHtml(formatGeneratedAt(generatedAt))}</span>
        <span>共 ${packets.length} 條</span>
        <span>packetVersion ${escapeHtml(packets[0]?.packetVersion || "v1")}</span>
      </div>
      ${renderHtmlRatios(lanes, packets.length)}
      ${renderHtmlToc(packets)}
      ${renderHtmlProductContext(productContext)}
    </header>
    ${renderHtmlLane("try", "Try", lanes.try, packets.length)}
    ${renderHtmlLane("watch", "Watch", lanes.watch, packets.length)}
    ${renderHtmlLane("skip", "Skip", lanes.skip, packets.length)}
    ${renderHtmlHandoffTasks(handoffPackets)}
    <footer class="colophon">
      <div class="colophon-line">
        <span>DLens Signal Packet</span>
        <span>${escapeHtml(formatGeneratedAt(generatedAt))}</span>
        <span>共 ${packets.length} 條</span>
        <span>packetVersion ${escapeHtml(packets[0]?.packetVersion || "v1")}</span>
      </div>
    </footer>
  </main>
</body>
</html>`;
}

function coverTitle(packets: DLensSignalPacket[]): string {
  if (packets.length === 1) {
    return packets[0]?.judgment?.contentSummary || packets[0]?.source.textSnippet?.slice(0, 60) || "Signal Reading";
  }
  return "Signal Reading";
}

function coverDek(packets: DLensSignalPacket[], productContext: DLensSignalPacket["productContext"] | undefined): string {
  const tryCount = packets.filter((packet) => packet.judgment?.verdict === "try").length;
  const watchCount = packets.filter((packet) => packet.judgment?.verdict === "watch").length;
  const skipCount = packets.length - tryCount - watchCount;
  const fragments: string[] = [];
  if (productContext?.productPromise) {
    fragments.push(`針對「${productContext.productPromise}」`);
  }
  fragments.push(`${packets.length} 則訊號的深度判讀`);
  const breakdown: string[] = [];
  if (tryCount) breakdown.push(`${tryCount} 條值得嘗試`);
  if (watchCount) breakdown.push(`${watchCount} 條保留觀察`);
  if (skipCount) breakdown.push(`${skipCount} 條暫不採用`);
  if (breakdown.length) {
    fragments.push(`：${breakdown.join("、")}。`);
  } else {
    fragments.push("。");
  }
  return fragments.join("");
}

function renderHtmlToc(packets: DLensSignalPacket[]): string {
  if (packets.length <= 1) return "";
  const items = packets.map((packet) => {
    const lane = packetLane(packet);
    const laneLabel = lane === "try" ? "Try" : lane === "watch" ? "Watch" : "Skip";
    const title = packet.judgment?.contentSummary || packet.source.textSnippet?.slice(0, 50) || packet.source.signalId;
    return `<li><span class="toc-lane ${lane}">${escapeHtml(laneLabel)}</span><a href="#${escapeHtml(anchorId(packet))}">${escapeHtml(title)}</a></li>`;
  }).join("");
  return `<nav class="toc" aria-label="Table of contents">
        <h2>Contents</h2>
        <ol>${items}</ol>
      </nav>`;
}

function renderHtmlProductContext(productContext: DLensSignalPacket["productContext"] | undefined): string {
  if (!productContext) return "";
  const rows: Array<[string, string]> = [];
  if (productContext.productPromise) rows.push(["產品定位", productContext.productPromise]);
  if (productContext.targetAudience) rows.push(["目標受眾", productContext.targetAudience]);
  if (productContext.coreWorkflows.length) rows.push(["核心工作流", productContext.coreWorkflows.join(" / ")]);
  if (productContext.currentCapabilities.length) rows.push(["現有能力", productContext.currentCapabilities.join(" / ")]);
  if (productContext.nonGoals.length) rows.push(["Non-goals", productContext.nonGoals.join(" / ")]);
  if (!rows.length) return "";
  const dl = rows.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("");
  return `<aside class="product-context" aria-label="Product context">
        <h4>Product context</h4>
        <dl>${dl}</dl>
      </aside>`;
}

function packetLane(packet: DLensSignalPacket): "try" | "watch" | "skip" {
  const verdict = packet.judgment?.verdict;
  if (verdict === "try") return "try";
  if (verdict === "watch") return "watch";
  return "skip";
}

function anchorId(packet: DLensSignalPacket): string {
  return `signal-${packet.source.signalId.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

function renderHtmlRatios(
  lanes: { try: DLensSignalPacket[]; watch: DLensSignalPacket[]; skip: DLensSignalPacket[] },
  total: number
): string {
  return `<section class="ratio-row" aria-label="Classification ratio">
      ${renderRatio("Try", lanes.try.length, total, "try")}
      ${renderRatio("Watch", lanes.watch.length, total, "watch")}
      ${renderRatio("Skip", lanes.skip.length, total, "skip")}
    </section>`;
}

function renderRatio(label: string, count: number, total: number, lane: "try" | "watch" | "skip"): string {
  return `<div class="ratio" data-lane="${lane}">
        <strong>${count}</strong>
        <span class="ratio-label">${escapeHtml(label)} · ${formatPercent(count, total)}</span>
      </div>`;
}

function renderHtmlLane(
  lane: "try" | "watch" | "skip",
  label: string,
  packets: DLensSignalPacket[],
  total: number
): string {
  const cards = packets.length
    ? packets.map((packet) => renderHtmlSignalCard(packet, lane)).join("\n")
    : `<p class="lane-empty">No signals in this lane.</p>`;
  return `<section class="verdict-lane" data-verdict-lane="${lane}">
      <h2 class="lane-heading" data-lane="${lane}">${escapeHtml(label)} (${packets.length}) <span class="muted">${formatPercent(packets.length, total)}</span></h2>
      ${cards}
    </section>`;
}

function renderHtmlSignalCard(packet: DLensSignalPacket, lane: "try" | "watch" | "skip"): string {
  const judgment = packet.judgment;
  const signalLabel = judgment?.contentSummary || packet.source.textSnippet || packet.source.signalId;
  const topicLabel = packet.topicContext.topics.map((topic) => topic.name).join(", ");
  const subtype = judgment?.referenceLabel || judgment?.signalSubtype || packet.source.source;
  const reason = judgment?.reason || "";
  const sourceLink = renderSourceLink(packet.source.url);
  const kickerLabels = [
    topicLabel || packet.source.sessionName,
    subtype,
    packet.source.author ? `by ${packet.source.author}` : "",
    judgment?.relevance ? `relevance ${judgment.relevance}/5` : ""
  ].filter(Boolean);
  const kickerHtml = [
    `<span class="pill ${lane}">${escapeHtml(formatVerdict(judgment?.verdict))}</span>`,
    ...kickerLabels.map((label) => `<span>${escapeHtml(label)}</span>`)
  ].join("");

  return `<article class="signal-card" id="${escapeHtml(anchorId(packet))}" data-signal-card="${escapeHtml(packet.source.signalId)}">
        <div class="signal-head">
          <p class="signal-kicker">${kickerHtml}</p>
          <h3 class="signal-title">${escapeHtml(signalLabel)}</h3>
          ${reason ? `<p class="reason">${escapeHtml(reason)}</p>` : ""}
        </div>
        ${renderHtmlInsightRow(packet)}
        ${renderHtmlReading(packet)}
        ${renderHtmlCitedEvidence(packet)}
        ${sourceLink}
        ${renderHtmlSignalMeta(packet)}
        <details class="signal-detail">
          <summary>原始資料</summary>
          <div class="detail-grid">
            ${renderHtmlEvidence(packet)}
            ${renderHtmlFeedback(packet)}
          </div>
        </details>
      </article>`;
}

function renderHtmlInsightRow(packet: DLensSignalPacket): string {
  const j = packet.judgment;
  if (!j) return "";
  const insights: Array<[string, string]> = [];
  if (j.whyRelevant) insights.push(["Why relevant", j.whyRelevant]);
  if (j.audienceGap) insights.push(["Audience gap", j.audienceGap]);
  if (j.experimentHint && j.verdict === "try") insights.push(["Experiment hint", j.experimentHint]);
  if (!insights.length) return "";
  const blocks = insights.map(([label, body]) => `
        <div>
          <span class="insight-label">${escapeHtml(label)}</span>
          <p class="insight-body">${escapeHtml(body)}</p>
        </div>`).join("");
  return `<aside class="insight-row" aria-label="Insight summary">${blocks}
      </aside>`;
}

const EVIDENCE_INLINE_VISIBLE_COUNT = 5;

function sortEvidenceByLikes<T extends { likeCount?: number | null }>(entries: T[]): T[] {
  return [...entries].sort((left, right) => {
    const leftLikes = typeof left.likeCount === "number" && Number.isFinite(left.likeCount) ? left.likeCount : 0;
    const rightLikes = typeof right.likeCount === "number" && Number.isFinite(right.likeCount) ? right.likeCount : 0;
    return rightLikes - leftLikes;
  });
}

function partitionForCollapse<T>(items: T[], visibleCount = EVIDENCE_INLINE_VISIBLE_COUNT): { visible: T[]; collapsed: T[] } {
  if (items.length <= visibleCount) return { visible: items, collapsed: [] };
  return { visible: items.slice(0, visibleCount), collapsed: items.slice(visibleCount) };
}

function maxLikeCount(entries: Array<{ likeCount?: number | null }>): number {
  return entries.reduce((max, entry) => {
    const likes = typeof entry.likeCount === "number" && Number.isFinite(entry.likeCount) ? entry.likeCount : 0;
    return likes > max ? likes : max;
  }, 0);
}

function formatModelShortName(model: string | null | undefined): string {
  if (!model) return "";
  const lower = model.toLowerCase();
  if (lower.includes("gemini")) {
    if (lower.includes("flash")) return "Gemini Flash";
    if (lower.includes("pro")) return "Gemini Pro";
    return "Gemini";
  }
  if (lower.includes("claude")) {
    if (lower.includes("opus")) return "Claude Opus";
    if (lower.includes("sonnet")) return "Claude Sonnet";
    if (lower.includes("haiku")) return "Claude Haiku";
    return "Claude";
  }
  if (lower.includes("gpt-4") || lower.includes("gpt4")) return "GPT-4";
  if (lower.includes("gpt-3") || lower.includes("gpt3")) return "GPT-3";
  if (lower.includes("gpt")) return "GPT";
  const afterColon = model.includes(":") ? model.slice(model.indexOf(":") + 1) : model;
  const firstSegment = afterColon.split(/[-\s/]/)[0] || "";
  return firstSegment ? firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1) : "";
}

function renderHtmlCitedEvidence(packet: DLensSignalPacket): string {
  const citedRefs = collectHtmlCitedEvidenceRefs(packet);
  if (!citedRefs.size) return "";
  const allEntries = packet.evidence.textEvidence.filter((entry) => citedRefs.has(entry.ref));
  if (!allEntries.length) return "";
  const sortedEntries = sortEvidenceByLikes(allEntries);
  const { visible, collapsed } = partitionForCollapse(sortedEntries);
  const notesByRef = new Map((packet.judgment?.evidenceNotes ?? []).map((note) => [note.ref, note]));

  const renderQuote = (entry: typeof sortedEntries[number]): string => {
    const note = notesByRef.get(entry.ref);
    const likeFragment = entry.likeCount ? `<span>${entry.likeCount}♥</span>` : "";
    const authorFragment = entry.author ? `<span>@${escapeHtml(entry.author)}</span>` : "";
    const noteParts: string[] = [];
    if (note?.whyItMatters) {
      noteParts.push(`<div><span class="note-label">為何重要</span>${escapeHtml(note.whyItMatters)}</div>`);
    }
    if (note?.workflowStack?.length) {
      noteParts.push(`<div><span class="note-label">Workflow stack</span>${escapeHtml(note.workflowStack.join(" → "))}</div>`);
    }
    if (note?.tradeoff) {
      noteParts.push(`<div><span class="note-label">Tradeoff</span>${escapeHtml(note.tradeoff)}</div>`);
    }
    if (note?.copyRecipeMarkdown) {
      noteParts.push(`<pre class="quote-recipe">${escapeHtml(note.copyRecipeMarkdown)}</pre>`);
    }
    const noteHtml = noteParts.length ? `<div class="quote-note">${noteParts.join("")}</div>` : "";
    return `<blockquote class="cited-quote" data-evidence-ref="${escapeHtml(entry.ref)}">
            <div class="quote-ref"><strong>${escapeHtml(entry.ref)}</strong>${authorFragment}${likeFragment}</div>
            <p class="quote-text">${escapeHtml(entry.text)}</p>
            ${noteHtml}
          </blockquote>`;
  };

  const visibleHtml = visible.map(renderQuote).join("");
  const collapsedHtml = collapsed.length
    ? `<details class="evidence-collapse" data-evidence-collapse="cited">
            <summary>展開其餘 ${collapsed.length} 則</summary>
            <div class="evidence-collapse-body">${collapsed.map(renderQuote).join("")}</div>
          </details>`
    : "";
  return `<section class="cited-evidence" aria-label="判讀輸入證據">
          <h4>判讀輸入證據</h4>
          ${visibleHtml}
          ${collapsedHtml}
        </section>`;
}

function renderHtmlSignalMeta(packet: DLensSignalPacket): string {
  const parts: string[] = [];
  const readingVersion = packet.reading.latest?.promptVersion;
  const analysisVersion = packet.judgment?.promptVersion;
  const model = formatModelShortName(packet.reading.latest?.model ?? packet.judgment?.model ?? null);
  const inputRefCount = packet.reading.latest?.sourceRefs?.length ?? 0;
  const maxLikes = maxLikeCount(packet.evidence.textEvidence);

  if (readingVersion) parts.push(`判讀 ${readingVersion}`);
  if (analysisVersion) parts.push(`分析 ${analysisVersion}`);
  if (model) parts.push(model);
  if (inputRefCount) parts.push(`${inputRefCount} 則留言`);
  if (maxLikes) parts.push(`max ♥${maxLikes}`);
  if (packet.source.capturedAt) parts.push(`captured ${packet.source.capturedAt.slice(0, 10)}`);
  if (packet.source.source) parts.push(`來源 ${packet.source.source}`);
  if (packet.source.captureId) parts.push(`capture ${packet.source.captureId}`);
  if (packet.source.itemStatus) parts.push(`item ${packet.source.itemStatus}`);

  if (!parts.length) return "";
  return `<p class="signal-meta" data-signal-provenance="true">${escapeHtml(parts.join(" · "))}</p>`;
}

function renderHtmlEvidence(packet: DLensSignalPacket): string {
  const citedRefs = collectHtmlCitedEvidenceRefs(packet);
  const textEntries = sortEvidenceByLikes(packet.evidence.textEvidence.filter((entry) => citedRefs.has(entry.ref)));
  const imageEntries = packet.evidence.imageEvidence.filter((entry) => citedRefs.has(entry.ref));
  const renderTextItem = (entry: typeof textEntries[number]): string =>
    `<li><strong>${escapeHtml(entry.ref)}</strong> ${escapeHtml(entry.author || "unknown")}: ${escapeHtml(entry.text)}</li>`;

  let textEvidence: string;
  if (!textEntries.length) {
    textEvidence = `<p class="muted">No cited text evidence.</p>`;
  } else {
    const { visible, collapsed } = partitionForCollapse(textEntries);
    const visibleList = `<ul>${visible.map(renderTextItem).join("")}</ul>`;
    const collapsedList = collapsed.length
      ? `<details class="evidence-collapse" data-evidence-collapse="catalog">
              <summary>展開其餘 ${collapsed.length} 則</summary>
              <ul class="evidence-collapse-body">${collapsed.map(renderTextItem).join("")}</ul>
            </details>`
      : "";
    textEvidence = `${visibleList}${collapsedList}`;
  }

  const imageEvidence = imageEntries.length
    ? `<h4>Image evidence</h4><ul>${imageEntries.map((entry) => `<li><strong>${escapeHtml(entry.ref)}</strong> ${escapeHtml(entry.ocrText || entry.visualSummary || entry.sourceUrl || "No image text")}</li>`).join("")}</ul>`
    : "";
  return `<section class="detail-block">
          <h4>Evidence catalog</h4>
          ${textEvidence}
          ${imageEvidence}
        </section>`;
}

function renderHtmlReading(packet: DLensSignalPacket): string {
  const latest = packet.reading.latest;
  if (!latest || !latest.reading.trim()) {
    return `<section class="reading-panel">
          <h4>Reading</h4>
          <p class="muted" style="font-style:italic">尚未生成深度判讀。</p>
        </section>`;
  }
  return `<section class="reading-panel">
          <h4>Reading</h4>
          <div class="reading-text">${renderReadingBody(latest.reading)}</div>
        </section>`;
}

function renderReadingBody(value: string): string {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean);
  if (!paragraphs.length) return "";
  return paragraphs
    .map((para) => `<p>${renderInlineMarkdown(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderHtmlFeedback(packet: DLensSignalPacket): string {
  if (!packet.userFeedback.feedbackTimeline.length) {
    return "";
  }
  const events = `<ul>${packet.userFeedback.feedbackTimeline.map((event) => `<li>${escapeHtml(renderFeedbackEvent(event))}</li>`).join("")}</ul>`;
  return `<section class="detail-block">
          <h4>Feedback timeline</h4>
          ${events}
        </section>`;
}

function collectHtmlCitedEvidenceRefs(packet: DLensSignalPacket): Set<string> {
  return new Set([
    ...(packet.judgment?.evidenceRefs ?? []),
    ...(packet.reading.latest?.sourceRefs ?? [])
  ].filter(Boolean));
}

function renderHtmlHandoffTasks(packets: DLensSignalPacket[]): string {
  const tasks = packets.map((packet) => {
    const feedback = packet.userFeedback.feedbackTimeline
      .filter((event) => event.kind === "agent_task")
      .map((event) => renderFeedbackEvent(event));
    return `<article class="task">
          <h3>${escapeHtml(packet.agentHandoff.taskSpec?.taskTitle || packet.source.signalId)}</h3>
          <p class="task-agent">${escapeHtml(formatAgentName(packet.agentHandoff.targetAgent || "generic"))}</p>
          <pre>${escapeHtml(packet.agentHandoff.taskPrompt || "")}</pre>
          ${feedback.length ? `<p class="task-feedback">${escapeHtml(feedback.join(" | "))}</p>` : ""}
        </article>`;
  }).join("\n");

  return `<section class="handoff">
      <h2>Agent handoff tasks</h2>
      ${tasks || `<p class="lane-empty">No agent handoff tasks.</p>`}
    </section>`;
}

function renderSourceLink(url: string): string {
  if (!url) {
    return "";
  }
  return `<p class="reason"><a href="${escapeHtml(safeHref(url))}" rel="noreferrer">${escapeHtml(url)}</a></p>`;
}

function formatVerdict(verdict: NonNullable<DLensSignalPacket["judgment"]>["verdict"] | null | undefined): string {
  if (verdict === "try") {
    return "Try";
  }
  if (verdict === "watch") {
    return "Watch";
  }
  if (verdict === "park") {
    return "Skip";
  }
  if (verdict === "insufficient_data") {
    return "Skip";
  }
  return "Unsorted";
}

function formatAgentName(agent: string): string {
  if (agent === "codex") {
    return "Codex";
  }
  if (agent === "claude") {
    return "Claude";
  }
  return "Generic agent";
}

function formatPercent(count: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }
  return `${Math.round((count / total) * 100)}%`;
}

function formatGeneratedAt(value: string): string {
  return `Generated ${value}`;
}

function safeHref(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "#";
  } catch {
    return "#";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w])_([^_\n]+?)_($|[^\w])/g, "$1<em>$2</em>$3");
}

function sanitizeTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-").replace(/[^0-9A-Za-zTZ-]/g, "-");
}
