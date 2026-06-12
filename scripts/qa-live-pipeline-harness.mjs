#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  buildTraceSummary,
  normalizeTrace,
  readTraceFile,
  renderMarkdown,
  writeJson,
  writeText
} from "./qa-trace-summary.mjs";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    trace: null,
    out: null,
    markdown: null,
    label: null,
    skipBuild: false,
    cdpUrl: "http://127.0.0.1:9222",
    tabUrlIncludes: "threads.",
    terminal: "ui.ready"
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
    } else if (arg === "--skip-build") {
      args.skipBuild = true;
    } else if (arg === "--cdp-url") {
      args.cdpUrl = argv[++index];
    } else if (arg === "--tab-url-includes") {
      args.tabUrlIncludes = argv[++index];
    } else if (arg === "--terminal") {
      args.terminal = argv[++index];
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
  node scripts/qa-live-pipeline-harness.mjs --out docs/qa/assets/YYYY-MM-DD/runN/live-pipeline.json
  node scripts/qa-live-pipeline-harness.mjs --trace docs/qa/assets/YYYY-MM-DD/runN/live-trace.json --out docs/qa/assets/YYYY-MM-DD/runN/live-pipeline.json

By default the harness runs npm run build, then reads a live trace from a Chrome
CDP tab whose URL contains "threads.". Use --trace to gate an already-dumped
live trace JSON artifact, and --skip-build when a test or manual run has already
built the extension.
`);
}

async function runBuild(skipBuild) {
  if (skipBuild) {
    return { skipped: true };
  }
  const startedAt = new Date().toISOString();
  const started = Date.now();
  try {
    const result = await execFileAsync("npm", ["run", "build"], {
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024
    });
    return {
      skipped: false,
      ok: true,
      startedAt,
      durationMs: Date.now() - started,
      stdoutTail: result.stdout.trim().split("\n").slice(-12),
      stderrTail: result.stderr.trim().split("\n").filter(Boolean).slice(-12)
    };
  } catch (error) {
    return {
      skipped: false,
      ok: false,
      startedAt,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      stdoutTail: typeof error.stdout === "string" ? error.stdout.trim().split("\n").slice(-12) : [],
      stderrTail: typeof error.stderr === "string" ? error.stderr.trim().split("\n").filter(Boolean).slice(-12) : []
    };
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json();
}

function pickTab(tabs, tabUrlIncludes) {
  return tabs.find((tab) =>
    tab.type === "page" &&
    typeof tab.webSocketDebuggerUrl === "string" &&
    typeof tab.url === "string" &&
    tab.url.includes(tabUrlIncludes)
  ) ?? null;
}

async function readTraceViaCdp(cdpUrl, tabUrlIncludes) {
  if (typeof WebSocket === "undefined") {
    throw new Error("Global WebSocket is not available in this Node runtime; pass --trace instead.");
  }
  const tabs = await fetchJson(new URL("/json", cdpUrl).toString());
  const tab = pickTab(Array.isArray(tabs) ? tabs : [], tabUrlIncludes);
  if (!tab) {
    throw new Error(`No CDP page tab found with URL containing ${tabUrlIncludes}`);
  }
  let sequence = 0;
  const pending = new Map();
  const socket = new WebSocket(tab.webSocketDebuggerUrl);

  const waitOpen = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP WebSocket connection failed")), { once: true });
  });
  await waitOpen;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message || JSON.stringify(message.error)));
    } else {
      resolve(message.result);
    }
  });

  async function send(method, params = {}) {
    const id = ++sequence;
    const response = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`CDP command timed out: ${method}`));
        }
      }, 5000);
    });
    socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  try {
    const result = await send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `(() => {
        const direct = Array.isArray(globalThis.__DLENS_QA_TRACE__) ? globalThis.__DLENS_QA_TRACE__ : null;
        if (direct) return direct;
        const node = document.getElementById("__dlens_qa_trace_json__");
        if (!node || !node.textContent) return [];
        try { return JSON.parse(node.textContent); } catch { return []; }
      })()`
    });
    return {
      source: {
        mode: "cdp",
        cdpUrl,
        tabUrlIncludes,
        tab: {
          id: tab.id,
          title: tab.title,
          url: tab.url
        }
      },
      trace: normalizeTrace(result.result?.value ?? [])
    };
  } finally {
    socket.close();
  }
}

async function writeRawTrace(outFile, trace) {
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
}

async function loadTrace(args) {
  if (args.trace) {
    return {
      source: {
        mode: "trace-file",
        traceFile: args.trace
      },
      trace: await readTraceFile(args.trace)
    };
  }
  return readTraceViaCdp(args.cdpUrl, args.tabUrlIncludes);
}

function buildEvidence({ args, build, traceSource, trace, summary }) {
  const terminal = summary.terminal;
  const status = summary.firstError || !terminal?.reached ? "fail" : "pass";
  return {
    generatedAt: new Date().toISOString(),
    type: "dlens-live-pipeline-harness",
    status,
    label: args.label ?? "live-pipeline",
    build,
    traceSource,
    trace: {
      eventCount: trace.length,
      firstAt: summary.firstAt,
      lastAt: summary.lastAt,
      durationMs: summary.durationMs
    },
    assertions: {
      terminalUiReady: {
        requiredPhase: args.terminal,
        reached: Boolean(terminal?.reached),
        eventId: terminal?.eventId ?? null,
        step: terminal?.step ?? null
      },
      noPipelineError: {
        ok: summary.firstError == null,
        firstError: summary.firstError
      }
    },
    summary
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const build = await runBuild(args.skipBuild);
  if (build.ok === false) {
    const evidence = {
      generatedAt: new Date().toISOString(),
      type: "dlens-live-pipeline-harness",
      label: args.label ?? "live-pipeline",
      build,
      status: "fail"
    };
    if (args.out) {
      await writeJson(args.out, evidence);
    } else {
      console.log(JSON.stringify(evidence, null, 2));
    }
    console.error("Build failed before live pipeline trace gate.");
    process.exit(2);
  }

  const { source, trace } = await loadTrace(args);
  const traceFileForSummary = args.trace ?? (args.out ? `${args.out.replace(/\.json$/i, "")}-trace.json` : null);
  if (!args.trace && traceFileForSummary) {
    await writeRawTrace(traceFileForSummary, trace);
  }
  const summary = buildTraceSummary(trace, {
    label: args.label ?? "live-pipeline",
    traceFile: traceFileForSummary,
    requireTerminal: args.terminal
  });
  const evidence = buildEvidence({
    args,
    build,
    traceSource: source,
    trace,
    summary
  });

  if (args.out) {
    await writeJson(args.out, evidence);
  }
  if (args.markdown) {
    await writeText(args.markdown, renderMarkdown(summary));
  }
  if (!args.out && !args.markdown) {
    console.log(JSON.stringify(evidence, null, 2));
  }

  if (summary.firstError) {
    console.error(`First pipeline error: ${summary.firstError.phase ?? summary.firstError.event}:${summary.firstError.step}`);
    process.exit(2);
  }
  if (!summary.terminal?.reached) {
    console.error(`Missing required terminal phase: ${args.terminal}`);
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
