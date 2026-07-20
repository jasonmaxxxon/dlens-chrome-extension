#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FILES = {
  threadsContent: "entrypoints/threads.content.ts",
  productSignalViews: "src/ui/ProductSignalViews.tsx",
  inpageState: "src/ui/useInPageCollectorAppState.ts",
  background: "entrypoints/background.ts",
  storeHelpers: "src/state/store-helpers.ts"
};

function parseArgs(argv) {
  const args = { out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      args.out = argv[++index];
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
  node scripts/qa-code-path-audit.mjs --out docs/qa/assets/YYYY-MM-DD/runN/code-path-audit.json

This script is a read-only QA evidence collector. It does not modify extension
storage, Chrome state, backend state, or user API keys.
`);
}

async function readLines(file) {
  const text = await readFile(file, "utf8");
  return text.split("\n");
}

function lineHit(file, lines, pattern, label = pattern.toString()) {
  const hits = [];
  lines.forEach((line, index) => {
    const matched = typeof pattern === "string" ? line.includes(pattern) : pattern.test(line);
    if (matched) {
      hits.push({
        file,
        line: index + 1,
        text: line.trim(),
        label
      });
    }
  });
  return hits;
}

function uniqueHits(hits) {
  const seen = new Set();
  return hits.filter((hit) => {
    const key = `${hit.file}:${hit.line}:${hit.label}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function firstLineNumber(lines, pattern) {
  const index = lines.findIndex((line) => (typeof pattern === "string" ? line.includes(pattern) : pattern.test(line)));
  return index === -1 ? null : index + 1;
}

function firstLineNumberInBlock(block, pattern) {
  if (!block) {
    return null;
  }
  const index = block.lines.findIndex((line) => (typeof pattern === "string" ? line.includes(pattern) : pattern.test(line)));
  return index === -1 ? null : block.startLine + index;
}

function lineHitsInBlock(file, block, pattern, label = pattern.toString()) {
  if (!block) {
    return [];
  }
  return lineHit(file, block.lines, pattern, label).map((hit) => ({
    ...hit,
    line: block.startLine + hit.line - 1
  }));
}

function functionBlock(lines, functionName) {
  const startIndex = lines.findIndex((line) => line.includes(`function ${functionName}`));
  if (startIndex === -1) {
    return null;
  }
  let depth = 0;
  let started = false;
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    for (const char of line) {
      if (char === "{") {
        depth += 1;
        started = true;
      } else if (char === "}") {
        depth -= 1;
      }
    }
    if (started && depth === 0) {
      return {
        startLine: startIndex + 1,
        endLine: index + 1,
        lines: lines.slice(startIndex, index + 1)
      };
    }
  }
  return {
    startLine: startIndex + 1,
    endLine: lines.length,
    lines: lines.slice(startIndex)
  };
}

function statusFromFail(failed) {
  return failed ? "fail" : "pass";
}

async function auditClickInterception(allLines) {
  const file = FILES.threadsContent;
  const lines = allLines[file];
  const block = functionBlock(lines, "onClick");
  const preventLine = firstLineNumberInBlock(block, "event.preventDefault();");
  const stopLine = firstLineNumberInBlock(block, "event.stopPropagation();");
  const candidateLine = firstLineNumberInBlock(block, "const candidate = findCardCandidate(event.target);");
  const cardGuardLine = firstLineNumberInBlock(block, "if (!card) {");
  const descriptorGuardLine = firstLineNumberInBlock(block, "if (!descriptor) {");
  const preventBeforeCardResolution = preventLine != null && candidateLine != null && preventLine < candidateLine;
  const preventBeforeCardGuard = preventLine != null && cardGuardLine != null && preventLine < cardGuardLine;
  const preventBeforeDescriptorGuard = preventLine != null && descriptorGuardLine != null && preventLine < descriptorGuardLine;
  return {
    id: "B-01",
    status: statusFromFail(preventBeforeCardResolution || preventBeforeCardGuard || preventBeforeDescriptorGuard),
    summary: "collect mode click handler can swallow non-card navigation before proving the click is collectable",
    evidence: {
      functionRange: block ? { file, startLine: block.startLine, endLine: block.endLine } : null,
      preventLine,
      stopLine,
      candidateLine,
      cardGuardLine,
      descriptorGuardLine,
      preventBeforeCardResolution,
      preventBeforeCardGuard,
      preventBeforeDescriptorGuard
    },
    expectedFixShape: "resolve card/descriptor first; only call preventDefault/stopPropagation after the click is known to be a collect action; let non-card clicks pass through"
  };
}

async function auditProductErrorSurface(allLines) {
  const stateFile = FILES.inpageState;
  const backgroundFile = FILES.background;
  const storeFile = FILES.storeHelpers;
  const stateLines = allLines[stateFile];
  const backgroundLines = allLines[backgroundFile];
  const storeLines = allLines[storeFile];

  const rawErrorHits = [
    ...lineHit(stateFile, stateLines, "setProductSignalAnalysisError(response.error)", "raw response.error rendered"),
    ...lineHit(stateFile, stateLines, "setProductSignalAnalysisError(error instanceof Error ? error.message : String(error))", "raw thrown error rendered")
  ];
  const responseSummaryHits = lineHit(backgroundFile, backgroundLines, "productSignalAnalysisSummary", "summary response");
  const failedItemDetailHits = [
    ...lineHit(backgroundFile, backgroundLines, "failedItems", "failed item details"),
    ...lineHit(backgroundFile, backgroundLines, "pendingWithLastError", "pending last error details"),
    ...lineHit(backgroundFile, backgroundLines, "buildProductSignalFailureDetails", "failed item/job detail builder"),
    ...lineHit(backgroundFile, backgroundLines, "failures: failureDetails", "failed item/job details in response"),
    ...lineHit(backgroundFile, backgroundLines, "lastErrorKind", "job lastErrorKind surfaced"),
    ...lineHit(backgroundFile, backgroundLines, "lastError ||", "job lastError surfaced")
  ];
  const uiErrorMappingHits = [
    ...lineHit(stateFile, stateLines, "getProcessingFailureUiMessage", "user-facing error mapper"),
    ...lineHit(FILES.productSignalViews, allLines[FILES.productSignalViews], "Backend 離線", "backend status visible")
  ];
  const storeErrorHits = [
    ...lineHit(storeFile, storeLines, "lastErrorKind", "stored lastErrorKind"),
    ...lineHit(storeFile, storeLines, "lastError:", "stored lastError")
  ];
  const failed = rawErrorHits.length > 0 || failedItemDetailHits.length === 0 || uiErrorMappingHits.length === 0;
  return {
    id: "B-04",
    status: statusFromFail(failed),
    summary: "Product analysis UI can render raw errors and the analyze response lacks failed item/job details",
    evidence: {
      rawErrorHits,
      uiErrorMappingHits,
      responseSummaryHits,
      failedItemDetailHits,
      storeErrorHits
    },
    expectedFixShape: "return failed item/job lastError details from product/analyze-signals and map user-visible errors to concise Chinese copy; keep raw backend detail in console/log evidence"
  };
}

async function auditRawLabels(allLines) {
  const file = FILES.productSignalViews;
  const lines = allLines[file];
  const rawDisplayHits = uniqueHits([
    ...lineHit(file, lines, "relevance {score}/5", "raw relevance label"),
    ...lineHit(file, lines, "{analysis.contentType}", "raw contentType render"),
    ...lineHit(file, lines, "collected posts", "raw collected posts copy"),
    ...lineHit(file, lines, "Keep as observation", "English action CTA"),
    ...lineHit(file, lines, "TRY experiment", "English action CTA")
  ]);
  return {
    id: "B-06",
    status: statusFromFail(rawDisplayHits.length > 0),
    summary: "Product signal display layer still exposes raw provider/schema labels",
    evidence: { rawDisplayHits },
    expectedFixShape: "centralize label mapping for subtype/contentType/relevance/action CTA; unknown enum must not be shown verbatim in user UI"
  };
}

async function auditNoiseActionSemantics(allLines) {
  const file = FILES.productSignalViews;
  const lines = allLines[file];
  const actionStage = functionBlock(lines, "ProductActionStage");
  const verdictTileHits = [
    ...lineHit(file, lines, "function VerdictFilterTiles", "verdict tile component"),
    ...lineHit(file, lines, 'data-verdict-filter-tiles="true"', "four-color verdict tile group"),
    ...lineHit(file, lines, "data-action-verdict-filter={stat.key}", "verdict tile filter control"),
    ...lineHit(file, lines, '{ key: "try", label: "值得嘗試"', "try tile"),
    ...lineHit(file, lines, '{ key: "watch", label: "保留觀察"', "watch tile"),
    ...lineHit(file, lines, '{ key: "park", label: "噪音 / 前提不符"', "park tile"),
    ...lineHit(file, lines, '{ key: "insufficient", label: "資料不足"', "insufficient tile")
  ];
  const stageHits = [
    ...lineHit(file, lines, "function ProductActionStage", "single Action stage owner"),
    ...lineHit(file, lines, 'data-product-action-workspace="stage"', "stage workspace"),
    ...lineHit(file, lines, 'data-product-action-pager="text"', "text pager")
  ];
  const activeStageHits = lineHit(file, lines, "data-product-action-stage={activeAnalysis.signalId}", "one active stage card");
  const verdictTileMountHits = lineHitsInBlock(file, actionStage, "<VerdictFilterTiles", "verdict tiles mounted in Action stage");
  const nonActionableSemanticHits = [
    ...lineHit(file, lines, 'const activeIsActionable = resolvedFilter === "try" || resolvedFilter === "watch"', "actionable verdict boundary"),
    ...lineHit(file, lines, "data-product-action-verdict-reason={resolvedFilter}", "non-actionable semantic reason block"),
    ...lineHit(file, lines, 'resolvedFilter === "park" ? "排除原因" : "資料缺口"', "park and insufficient copy"),
    ...lineHit(file, lines, "activeIsActionable ? (", "reading/review guarded to actionable verdicts")
  ];
  const retiredFramingHits = uniqueHits([
    ...lineHit(file, lines, 'data-product-action-card=', "retired action-card wall"),
    ...lineHit(file, lines, 'data-exclusion-card=', "retired exclusion card"),
    ...lineHit(file, lines, 'data-product-action-dot', "retired dot pager"),
    ...lineHit(file, lines, 'data-product-action-exclusions', "retired exclusion lane"),
    ...lineHit(file, lines, 'data-product-action-insufficient', "retired insufficient lane")
  ]);
  const failed = verdictTileHits.length < 7 || stageHits.length < 3 || activeStageHits.length !== 1 || verdictTileMountHits.length !== 1 || nonActionableSemanticHits.length < 4 || retiredFramingHits.length > 0;
  return {
    id: "B-07",
    status: statusFromFail(failed),
    summary: "Product Action uses four-color verdict tiles above one text-paged stage, with semantic park/insufficient content and no card wall or dots",
    evidence: {
      verdictTileHits,
      stageHits,
      activeStageHits,
      verdictTileMountHits,
      nonActionableSemanticHits,
      retiredFramingHits
    },
    expectedFixShape: "mount exactly one four-tile verdict selector inside ProductActionStage above one active stage with a text pager; park/insufficient must render a verdict-specific reason rather than actionable reading controls, with no card wall, dot pager, or duplicate exclusion lanes"
  };
}

async function auditSignalReadingExportGate(allLines) {
  const file = FILES.productSignalViews;
  const lines = allLines[file];
  const actionStage = functionBlock(lines, "ProductActionStage");
  const savedSignalsBoard = functionBlock(lines, "SavedSignalsBoard");
  const retiredRouteSwapHits = [
    ...lineHit(file, lines, "const showSignalReadingReview = scopedSignalReadings.length > 0", "reading review gate"),
    ...lineHit(file, lines, "showSignalReadingReview ?", "conditional review workspace"),
    ...lineHit(file, lines, "<SignalReadingReviewWorkspace", "review/export workspace")
  ];
  const readingReviewHits = uniqueHits([
    ...lineHit(file, lines, "function ProductActionReadingOperations", "stage-owned reading operations"),
    ...lineHit(file, lines, 'data-product-action-generate-reading', "first reading action"),
    ...lineHit(file, lines, 'data-product-action-regenerate-reading', "regenerate action"),
    ...lineHit(file, lines, 'data-product-action-review', "reading review controls"),
    ...lineHitsInBlock(file, actionStage, "<ProductActionReadingOperations", "reading operations mounted in Action stage")
  ]);
  const actionExportHits = uniqueHits([
    ...lineHitsInBlock(file, actionStage, 'data-product-action-brief-export="true"', "single Action brief export shelf"),
    ...lineHitsInBlock(file, actionStage, "<ProductActionBriefExport", "Action brief export renderer"),
    ...lineHitsInBlock(file, actionStage, 'data-product-action-export="true"', "single Action whole-folder packet shelf"),
    ...lineHitsInBlock(file, actionStage, "<SignalPacketHtmlExportSection", "Action whole-folder packet renderer"),
    ...lineHit(file, lines, "<ProductActionStage", "single Action route owner")
  ]);
  const actionBriefShelfHits = lineHit(file, lines, 'data-product-action-brief-export="true"', "Action brief export shelf count");
  const actionPacketShelfHits = lineHit(file, lines, 'data-product-action-export="true"', "Action whole-folder packet shelf count");
  const savedExportHits = uniqueHits([
    ...lineHitsInBlock(file, savedSignalsBoard, "ProductActionBriefExport", "Action brief rendered by Saved"),
    ...lineHitsInBlock(file, savedSignalsBoard, "SignalPacketHtmlExportSection", "packet export rendered by Saved"),
    ...lineHitsInBlock(file, savedSignalsBoard, "data-saved-signals-batch-export", "retired Saved batch export"),
    ...lineHitsInBlock(file, savedSignalsBoard, "data-product-action-brief-export", "Action brief shelf rendered by Saved"),
    ...lineHitsInBlock(file, savedSignalsBoard, "data-product-action-export", "Action packet shelf rendered by Saved")
  ]);
  const failed = retiredRouteSwapHits.length > 0
    || readingReviewHits.length < 5
    || actionExportHits.length < 5
    || actionBriefShelfHits.length !== 1
    || actionPacketShelfHits.length !== 1
    || savedExportHits.length > 0;
  return {
    id: "B-08",
    status: statusFromFail(failed),
    summary: "Reading/review plus one selected brief shelf and one whole-folder packet shelf belong only to Product Action",
    evidence: {
      retiredRouteSwapHits,
      readingReviewHits,
      actionExportHits,
      actionBriefShelfHits,
      actionPacketShelfHits,
      savedExportHits
    },
    expectedFixShape: "keep generation, regeneration, and review inside the active Action stage; render exactly one Action-owned selected brief shelf and one Action-owned whole-folder packet shelf, with no Saved export surface or reading-review route swap"
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const allLines = {};
  for (const file of Object.values(FILES)) {
    allLines[file] = await readLines(file);
  }

  const checks = [
    await auditClickInterception(allLines),
    await auditProductErrorSurface(allLines),
    await auditRawLabels(allLines),
    await auditNoiseActionSemantics(allLines),
    await auditSignalReadingExportGate(allLines)
  ];

  const evidence = {
    generatedAt: new Date().toISOString(),
    cwd: process.cwd(),
    type: "dlens-code-path-audit",
    note: "Read-only code-path evidence. This complements live Chrome QA but does not replace hover/collect/analyze runs.",
    summary: {
      fail: checks.filter((check) => check.status === "fail").length,
      warn: checks.filter((check) => check.status === "warn").length,
      pass: checks.filter((check) => check.status === "pass").length
    },
    checks
  };

  const output = `${JSON.stringify(evidence, null, 2)}\n`;
  if (args.out) {
    const outPath = path.resolve(args.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, output, "utf8");
    console.log(outPath);
  } else {
    process.stdout.write(output);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
