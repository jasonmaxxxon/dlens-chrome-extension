#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PIPELINE_PHASES = [
  "hover.detected",
  "preview.confirmed",
  "signal.saved",
  "backend.request",
  "crawl.queued",
  "capture.ready",
  "llm.call",
  "analysis.ready",
  "ui.ready"
];

const PIPELINE_RESULTS = new Set(["ok", "pending", "error"]);
const PIPELINE_PHASE_SET = new Set(PIPELINE_PHASES);

const LEGACY_PAIRS = [
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

export function parseArgs(argv) {
  const args = {
    trace: null,
    out: null,
    markdown: null,
    label: null,
    requirePhases: [],
    requireTerminal: null
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
    } else if (arg === "--require-phases") {
      args.requirePhases = String(argv[++index] || "")
        .split(",")
        .map((phase) => phase.trim())
        .filter(Boolean);
    } else if (arg === "--require-terminal") {
      args.requireTerminal = argv[++index];
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
  node scripts/qa-trace-summary.mjs --trace docs/qa/assets/YYYY-MM-DD/runN/trace.json --out docs/qa/assets/YYYY-MM-DD/runN/summary.json --markdown docs/qa/assets/YYYY-MM-DD/runN/summary.md --require-phases hover.detected,preview.confirmed,signal.saved,backend.request,crawl.queued,capture.ready,llm.call,analysis.ready,ui.ready --require-terminal ui.ready

The trace input is JSON copied from window.__DLENS_QA_TRACE__. The script
supports the current typed pipeline trace shape {phase, step, target, result}
and older legacy QA trace dumps that only had {event, detail}.
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

function isoTimeMs(entry) {
  if (!entry?.isoTime) return NaN;
  return Date.parse(entry.isoTime);
}

function timeDeltaMs(start, end) {
  const startIsoMs = isoTimeMs(start);
  const endIsoMs = isoTimeMs(end);
  if (Number.isFinite(startIsoMs) && Number.isFinite(endIsoMs)) {
    return roundMs(endIsoMs - startIsoMs);
  }
  return roundMs(end.at - start.at);
}

function isSameOrAfter(start, candidate) {
  const startIsoMs = isoTimeMs(start);
  const candidateIsoMs = isoTimeMs(candidate);
  if (Number.isFinite(startIsoMs) && Number.isFinite(candidateIsoMs)) {
    return candidateIsoMs >= startIsoMs;
  }
  return candidate.at >= start.at;
}

function stats(values) {
  const numeric = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!numeric.length) {
    return {
      count: 0,
      minMs: null,
      p50Ms: null,
      p95Ms: null,
      maxMs: null,
      avgMs: null
    };
  }
  const sum = numeric.reduce((total, value) => total + value, 0);
  return {
    count: numeric.length,
    minMs: roundMs(Math.min(...numeric)),
    p50Ms: roundMs(percentile(numeric, 50)),
    p95Ms: roundMs(percentile(numeric, 95)),
    maxMs: roundMs(Math.max(...numeric)),
    avgMs: roundMs(sum / numeric.length)
  };
}

function readOptionalObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTypedEntry(entry, index) {
  if (!PIPELINE_PHASE_SET.has(String(entry.phase)) || typeof entry.at !== "number") {
    return null;
  }
  const result = PIPELINE_RESULTS.has(String(entry.result)) ? String(entry.result) : "ok";
  return {
    id: typeof entry.id === "number" ? entry.id : index + 1,
    phase: String(entry.phase),
    step: typeof entry.step === "string" && entry.step.trim() ? entry.step : "unknown",
    target: readOptionalObject(entry.target),
    result,
    requestId: typeof entry.requestId === "string" && entry.requestId.trim() ? entry.requestId : null,
    detail: entry.detail ?? null,
    at: entry.at,
    isoTime: typeof entry.isoTime === "string" ? entry.isoTime : null,
    event: null
  };
}

function normalizeLegacyEntry(entry, index) {
  if (typeof entry.event !== "string" || typeof entry.at !== "number") {
    return null;
  }
  const isError = entry.event.endsWith(".error") || entry.detail?.ok === false;
  return {
    id: typeof entry.id === "number" ? entry.id : index + 1,
    phase: null,
    step: entry.event,
    target: {},
    result: isError ? "error" : "ok",
    requestId: null,
    detail: entry.detail ?? null,
    at: entry.at,
    isoTime: typeof entry.isoTime === "string" ? entry.isoTime : null,
    event: entry.event
  };
}

export function normalizeTrace(raw) {
  if (!Array.isArray(raw)) {
    throw new Error("Trace file must contain a JSON array.");
  }
  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      return normalizeTypedEntry(entry, index) ?? normalizeLegacyEntry(entry, index);
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftIsoMs = left.isoTime ? Date.parse(left.isoTime) : NaN;
      const rightIsoMs = right.isoTime ? Date.parse(right.isoTime) : NaN;
      if (Number.isFinite(leftIsoMs) && Number.isFinite(rightIsoMs) && leftIsoMs !== rightIsoMs) {
        return leftIsoMs - rightIsoMs;
      }
      return left.at - right.at || left.id - right.id;
    });
}

function summarizeLegacyPairs(trace) {
  return LEGACY_PAIRS.map(([startEvent, endEvent, label]) => {
    const starts = trace.filter((entry) => entry.event === startEvent);
    const ends = trace.filter((entry) => entry.event === endEvent);
    const usedEndIds = new Set();
    const samples = [];
    const missingStarts = [];
    for (const start of starts) {
      const end = ends.find((candidate) => isSameOrAfter(start, candidate) && !usedEndIds.has(candidate.id));
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
        latencyMs: timeDeltaMs(start, end),
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
      ...stats(samples.map((sample) => sample.latencyMs)),
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
      fromEvent: previous.event ?? `${previous.phase}:${previous.step}`,
      toEvent: current.event ?? `${current.phase}:${current.step}`,
      fromId: previous.id,
      toId: current.id,
      gapMs: timeDeltaMs(previous, current),
      fromDetail: previous.detail,
      toDetail: current.detail
    });
  }
  return gaps.sort((left, right) => right.gapMs - left.gapMs).slice(0, 12);
}

function countBy(trace, keyFn) {
  const counts = {};
  for (const entry of trace) {
    const key = keyFn(entry);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function summarizePhaseJourney(trace) {
  const journey = [];
  const seen = new Set();
  for (const entry of trace) {
    if (!entry.phase || seen.has(entry.phase)) {
      continue;
    }
    seen.add(entry.phase);
    journey.push({
      phase: entry.phase,
      eventId: entry.id,
      step: entry.step,
      result: entry.result,
      at: roundMs(entry.at),
      isoTime: entry.isoTime,
      target: entry.target,
      requestId: entry.requestId
    });
  }
  return journey;
}

function summarizePhaseTransitions(phaseJourney) {
  const transitions = [];
  for (let index = 1; index < phaseJourney.length; index += 1) {
    const previous = phaseJourney[index - 1];
    const current = phaseJourney[index];
    transitions.push({
      fromPhase: previous.phase,
      toPhase: current.phase,
      fromEventId: previous.eventId,
      toEventId: current.eventId,
      latencyMs: timeDeltaMs(previous, current)
    });
  }
  return transitions;
}

function findFirstError(trace) {
  const error = trace.find((entry) => entry.result === "error");
  if (!error) return null;
  return {
    eventId: error.id,
    phase: error.phase,
    step: error.step,
    event: error.event,
    at: roundMs(error.at),
    isoTime: error.isoTime,
    target: error.target,
    detail: error.detail
  };
}

function summarizeTerminal(trace, requiredPhase) {
  if (!requiredPhase) {
    return null;
  }
  if (!PIPELINE_PHASE_SET.has(requiredPhase)) {
    throw new Error(`Unknown terminal phase: ${requiredPhase}`);
  }
  const event = trace.find((entry) => entry.phase === requiredPhase);
  if (!event) {
    return {
      requiredPhase,
      reached: false,
      eventId: null,
      step: null,
      result: null,
      at: null,
      target: null
    };
  }
  return {
    requiredPhase,
    reached: true,
    eventId: event.id,
    step: event.step,
    result: event.result,
    at: roundMs(event.at),
    target: event.target
  };
}

function summarizeRequiredPhases(trace, requiredPhases) {
  const required = [];
  for (const phase of requiredPhases || []) {
    if (!PIPELINE_PHASE_SET.has(phase)) {
      throw new Error(`Unknown required phase: ${phase}`);
    }
    if (!required.includes(phase)) {
      required.push(phase);
    }
  }
  if (!required.length) {
    return null;
  }
  const seen = new Set(trace.map((entry) => entry.phase).filter(Boolean));
  const missing = required.filter((phase) => !seen.has(phase));
  return {
    required,
    missing,
    reached: missing.length === 0
  };
}

export function buildTraceSummary(trace, options = {}) {
  const first = trace[0] ?? null;
  const last = trace[trace.length - 1] ?? null;
  const phaseJourney = summarizePhaseJourney(trace);
  const requiredPhases = summarizeRequiredPhases(trace, options.requirePhases ?? []);
  const terminal = summarizeTerminal(trace, options.requireTerminal ?? null);
  const firstError = findFirstError(trace);
  const missingRequiredPhases = requiredPhases ? requiredPhases.missing.length > 0 : false;
  const missingRequiredTerminal = terminal ? !terminal.reached : false;
  const status = firstError || missingRequiredPhases || missingRequiredTerminal ? "fail" : "pass";

  return {
    generatedAt: new Date().toISOString(),
    type: "dlens-qa-trace-summary",
    status,
    label: options.label ?? "trace",
    traceFile: options.traceFile ?? null,
    eventCount: trace.length,
    firstAt: first ? roundMs(first.at) : null,
    lastAt: last ? roundMs(last.at) : null,
    firstIsoTime: first?.isoTime ?? null,
    lastIsoTime: last?.isoTime ?? null,
    durationMs: first && last ? timeDeltaMs(first, last) : null,
    eventCounts: countBy(trace, (entry) => entry.event ?? `${entry.phase}:${entry.step}`),
    phaseCounts: countBy(trace, (entry) => entry.phase),
    requiredPhases,
    terminal,
    firstError,
    phaseJourney,
    phaseTransitions: summarizePhaseTransitions(phaseJourney),
    pairs: summarizeLegacyPairs(trace),
    slowestGaps: summarizeGaps(trace)
  };
}

export function renderMarkdown(summary) {
  const lines = [
    "# DLens QA Trace Summary",
    "",
    `- Status: ${summary.status}`,
    `- Label: ${summary.label}`,
    `- Trace: \`${summary.traceFile ?? "n/a"}\``,
    `- Events: ${summary.eventCount}`,
    `- Duration: ${summary.durationMs ?? "n/a"} ms`
  ];
  if (summary.terminal) {
    lines.push(`- Terminal \`${summary.terminal.requiredPhase}\`: ${summary.terminal.reached ? "reached" : "missing"}`);
  }
  if (summary.requiredPhases) {
    lines.push(`- Required phases: ${summary.requiredPhases.reached ? "reached" : `missing ${summary.requiredPhases.missing.join(", ")}`}`);
  }
  if (summary.firstError) {
    lines.push(`- First error: ${summary.firstError.phase ?? summary.firstError.event}:${summary.firstError.step}`);
  }

  lines.push("", "## Phase Journey", "", "| Phase | Step | Result | At |", "|------|------|--------|---:|");
  for (const event of summary.phaseJourney) {
    lines.push(`| ${event.phase} | ${event.step} | ${event.result} | ${event.at} |`);
  }

  lines.push("", "## Phase Transitions", "", "| Transition | Latency ms |", "|------------|-----------:|");
  for (const transition of summary.phaseTransitions) {
    lines.push(`| ${transition.fromPhase} -> ${transition.toPhase} | ${transition.latencyMs} |`);
  }

  lines.push("", "## Legacy Latency Pairs", "", "| Pair | Count | Avg | P50 | P95 | Max | Missing end |", "|------|------:|----:|----:|----:|----:|------------:|");
  for (const pair of summary.pairs) {
    lines.push(`| ${pair.label} | ${pair.count} | ${pair.avgMs ?? ""} | ${pair.p50Ms ?? ""} | ${pair.p95Ms ?? ""} | ${pair.maxMs ?? ""} | ${pair.missingEndCount} |`);
  }

  lines.push("", "## Slowest Event Gaps", "", "| Gap | From | To |", "|----:|------|----|");
  for (const gap of summary.slowestGaps) {
    lines.push(`| ${gap.gapMs} | ${gap.fromEvent} | ${gap.toEvent} |`);
  }

  lines.push("", "## Phase Counts", "");
  for (const [phase, count] of Object.entries(summary.phaseCounts)) {
    lines.push(`- \`${phase}\`: ${count}`);
  }

  lines.push("", "## Event Counts", "");
  for (const [event, count] of Object.entries(summary.eventCounts)) {
    lines.push(`- \`${event}\`: ${count}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeText(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value, "utf8");
}

export async function readTraceFile(traceFile) {
  const raw = JSON.parse(await readFile(traceFile, "utf8"));
  return normalizeTrace(raw);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.trace) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const trace = await readTraceFile(args.trace);
  const summary = buildTraceSummary(trace, {
    label: args.label ?? path.basename(args.trace, path.extname(args.trace)),
    traceFile: args.trace,
    requirePhases: args.requirePhases,
    requireTerminal: args.requireTerminal
  });

  if (args.out) {
    await writeJson(args.out, summary);
  }
  if (args.markdown) {
    await writeText(args.markdown, renderMarkdown(summary));
  }
  if (!args.out && !args.markdown) {
    console.log(JSON.stringify(summary, null, 2));
  }

  if (summary.firstError) {
    console.error(`First pipeline error: ${summary.firstError.phase ?? summary.firstError.event}:${summary.firstError.step}`);
    process.exit(2);
  }
  if (summary.requiredPhases && !summary.requiredPhases.reached) {
    console.error(`Missing required phases: ${summary.requiredPhases.missing.join(", ")}`);
    process.exit(2);
  }
  if (summary.terminal && !summary.terminal.reached) {
    console.error(`Missing required terminal phase: ${summary.terminal.requiredPhase}`);
    process.exit(2);
  }
}

const isCli = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
