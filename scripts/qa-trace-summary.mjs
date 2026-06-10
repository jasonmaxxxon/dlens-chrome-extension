#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PAIRS = [
  ["popup.collect.toggle.request", "popup.collect.toggle.response", "collect toggle roundtrip"],
  ["content.selection.sync.request", "content.selection.sync.response", "content selection rehydrate"],
  ["content.hover.card-change", "content.overlay.render", "hover to overlay render"],
  ["content.hover.intent-fired", "content.hover.publish", "hover descriptor publish"],
  ["content.collect.click.capture", "content.collect.save.response", "collect click to save response"],
  ["popup.topic.hydrate.request", "popup.topic.hydrate.response", "topic/signal hydration"],
  ["popup.product.hydrate.request", "popup.product.hydrate.response", "product hydration"],
  ["popup.product.analyze.request", "popup.product.analyze.response", "product analyze"],
  ["popup.worker.status.request", "popup.worker.status.response", "worker status poll"],
  ["popup.worker.refresh.request", "popup.worker.refresh.response", "worker refresh"],
  ["popup.worker.status.error", "popup.worker.next-poll", "worker error backoff"]
];

function parseArgs(argv) {
  const args = {
    trace: null,
    out: null,
    markdown: null,
    label: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--trace") {
      args.trace = argv[++index];
    } else if (arg === "--out") {
      args.out = argv[++index];
    } else if (arg === "--markdown") {
      args.markdown = argv[++index];
    } else if (arg === "--label") {
      args.label = argv[++index];
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/qa-trace-summary.mjs --trace docs/qa/assets/YYYY-MM-DD/runN/flow1-trace.json --out docs/qa/assets/YYYY-MM-DD/runN/flow1-summary.json --markdown docs/qa/assets/YYYY-MM-DD/runN/flow1-summary.md

The trace input is the JSON copied from window.__DLENS_QA_TRACE__.
This script is read-only against Chrome/backend state; it only reads the trace
file and writes derived QA artifacts.
`);
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function roundMs(value) {
  return value == null ? null : Math.round(value * 10) / 10;
}

function stats(values) {
  if (!values.length) {
    return {
      count: 0,
      minMs: null,
      p50Ms: null,
      p95Ms: null,
      maxMs: null,
      avgMs: null
    };
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    minMs: roundMs(Math.min(...values)),
    p50Ms: roundMs(percentile(values, 50)),
    p95Ms: roundMs(percentile(values, 95)),
    maxMs: roundMs(Math.max(...values)),
    avgMs: roundMs(sum / values.length)
  };
}

function normalizeTrace(raw) {
  if (!Array.isArray(raw)) {
    throw new Error("Trace file must contain a JSON array.");
  }
  return raw
    .filter((entry) => entry && typeof entry.event === "string" && typeof entry.at === "number")
    .map((entry, index) => ({
      id: typeof entry.id === "number" ? entry.id : index + 1,
      event: entry.event,
      at: entry.at,
      isoTime: typeof entry.isoTime === "string" ? entry.isoTime : null,
      detail: entry.detail ?? null
    }))
    .sort((left, right) => left.at - right.at || left.id - right.id);
}

function summarizePairs(trace) {
  return DEFAULT_PAIRS.map(([startEvent, endEvent, label]) => {
    const starts = trace.filter((entry) => entry.event === startEvent);
    const ends = trace.filter((entry) => entry.event === endEvent);
    const usedEndIds = new Set();
    const samples = [];
    const missingStarts = [];
    for (const start of starts) {
      const end = ends.find((candidate) => candidate.at >= start.at && !usedEndIds.has(candidate.id));
      if (!end) {
        missingStarts.push({
          startId: start.id,
          at: roundMs(start.at),
          isoTime: start.isoTime,
          detail: start.detail
        });
        continue;
      }
      usedEndIds.add(end.id);
      samples.push({
        startId: start.id,
        endId: end.id,
        latencyMs: roundMs(end.at - start.at),
        startAt: roundMs(start.at),
        endAt: roundMs(end.at),
        startDetail: start.detail,
        endDetail: end.detail
      });
    }
    return {
      label,
      startEvent,
      endEvent,
      ...stats(samples.map((sample) => sample.latencyMs).filter((value) => typeof value === "number")),
      missingEndCount: missingStarts.length,
      missingStarts,
      samples
    };
  });
}

function summarizeGaps(trace) {
  const gaps = [];
  for (let index = 1; index < trace.length; index += 1) {
    const previous = trace[index - 1];
    const current = trace[index];
    gaps.push({
      fromEvent: previous.event,
      toEvent: current.event,
      fromId: previous.id,
      toId: current.id,
      gapMs: roundMs(current.at - previous.at),
      fromDetail: previous.detail,
      toDetail: current.detail
    });
  }
  return gaps.sort((left, right) => right.gapMs - left.gapMs).slice(0, 12);
}

function eventCounts(trace) {
  const counts = {};
  for (const entry of trace) {
    counts[entry.event] = (counts[entry.event] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function renderMarkdown(summary) {
  const lines = [
    `# DLens QA Trace Summary`,
    "",
    `- Label: ${summary.label}`,
    `- Trace: \`${summary.traceFile}\``,
    `- Events: ${summary.eventCount}`,
    `- Duration: ${summary.durationMs ?? "n/a"} ms`,
    "",
    "## Latency Pairs",
    "",
    "| Pair | Count | Avg | P50 | P95 | Max | Missing end |",
    "|------|------:|----:|----:|----:|----:|------------:|"
  ];
  for (const pair of summary.pairs) {
    lines.push(`| ${pair.label} | ${pair.count} | ${pair.avgMs ?? ""} | ${pair.p50Ms ?? ""} | ${pair.p95Ms ?? ""} | ${pair.maxMs ?? ""} | ${pair.missingEndCount} |`);
  }
  lines.push("", "## Slowest Event Gaps", "", "| Gap | From | To |", "|----:|------|----|");
  for (const gap of summary.slowestGaps) {
    lines.push(`| ${gap.gapMs} | ${gap.fromEvent} | ${gap.toEvent} |`);
  }
  lines.push("", "## Event Counts", "");
  for (const [event, count] of Object.entries(summary.eventCounts)) {
    lines.push(`- \`${event}\`: ${count}`);
  }
  return `${lines.join("\n")}\n`;
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.trace) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const raw = JSON.parse(await readFile(args.trace, "utf8"));
  const trace = normalizeTrace(raw);
  const first = trace[0] ?? null;
  const last = trace[trace.length - 1] ?? null;
  const summary = {
    generatedAt: new Date().toISOString(),
    type: "dlens-qa-trace-summary",
    label: args.label ?? path.basename(args.trace, path.extname(args.trace)),
    traceFile: args.trace,
    eventCount: trace.length,
    firstAt: first ? roundMs(first.at) : null,
    lastAt: last ? roundMs(last.at) : null,
    firstIsoTime: first?.isoTime ?? null,
    lastIsoTime: last?.isoTime ?? null,
    durationMs: first && last ? roundMs(last.at - first.at) : null,
    eventCounts: eventCounts(trace),
    pairs: summarizePairs(trace),
    slowestGaps: summarizeGaps(trace)
  };

  if (args.out) {
    await writeJson(args.out, summary);
  }
  if (args.markdown) {
    await writeText(args.markdown, renderMarkdown(summary));
  }
  if (!args.out && !args.markdown) {
    console.log(JSON.stringify(summary, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
