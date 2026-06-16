#!/usr/bin/env node
// BOUNDARY_GUARD: bans View modules from owning side effects, browser storage,
// runtime messaging, or nondeterministic time/random sources. Inline legacy debt
// can be marked with `TODO(boundary-bypass): <reason>`, but the locked state
// requires zero allowlisted bypasses.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = "src/ui";
const FILE_EXT_RE = /\.tsx$/;
const EXCLUDE_DIRS = new Set(["node_modules", ".wxt", ".output", "dist", ".git"]);
// These TSX files are extension entry/controller shells. They are allowed to
// own runtime messaging or orchestration; leaf Views below this layer are not.
const VIEW_FILE_EXCLUDE = new Set([
  "src/ui/AuditReportEntry.tsx",
  "src/ui/controller.tsx",
  "src/ui/InPageCollectorResultWorkspace.tsx",
  "src/ui/SidepanelApp.tsx",
  "src/ui/inpage-helpers.tsx"
]);

const VIEW_FORBIDDEN_PATTERNS = [
  { name: "sendExtensionMessage", re: /\bsendExtensionMessage\b/, op: "runtime-message" },
  { name: "Date.now()", re: /\bDate\.now\s*\(/, op: "time-source" },
  { name: "Math.random()", re: /\bMath\.random\s*\(/, op: "random-source" },
  { name: "performance.now()", re: /\bperformance\.now\s*\(/, op: "time-source" },
  { name: "chrome.storage.local.set", re: /chrome\.storage\.local\.set\s*\(/, op: "storage-write" },
  { name: "chrome.storage.local.remove", re: /chrome\.storage\.local\.remove\s*\(/, op: "storage-write" },
  { name: "chrome.storage.local.clear", re: /chrome\.storage\.local\.clear\s*\(/, op: "storage-write" },
  { name: "chrome.storage.local.get", re: /chrome\.storage\.local\.get\s*\(/, op: "storage-read" },
  { name: "chrome.runtime.sendMessage", re: /chrome\.runtime\.sendMessage\s*\(/, op: "runtime-message" }
];

const MARKER_RE = /TODO\(boundary-bypass\):\s*\S+/;

function isCommentOnlyLine(line) {
  return /^\s*(?:\/\/|\*|\/\*)/.test(line);
}

function isViewFile(relativePath) {
  if (!FILE_EXT_RE.test(relativePath)) {
    return false;
  }
  if (VIEW_FILE_EXCLUDE.has(relativePath)) {
    return false;
  }
  const fileName = relativePath.split("/").pop() ?? "";
  return !/^use[A-Z]/.test(fileName);
}

export function findViewBoundaryViolations(source, { filePath = "<inline>" } = {}) {
  const lines = source.split(/\r?\n/);
  const findings = [];
  const allowlisted = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentOnlyLine(line)) continue;
    for (const pattern of VIEW_FORBIDDEN_PATTERNS) {
      if (!pattern.re.test(line)) continue;
      const prev = i > 0 ? lines[i - 1] : "";
      const markerOnLine = MARKER_RE.test(line);
      const markerOnPrev = MARKER_RE.test(prev);
      const hit = {
        filePath,
        line: i + 1,
        name: pattern.name,
        op: pattern.op,
        snippet: line.trim()
      };
      if (markerOnLine || markerOnPrev) {
        allowlisted.push(hit);
      } else {
        findings.push(hit);
      }
    }
  }
  return { findings, allowlisted };
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== "." && entry.name !== "..") continue;
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile() && FILE_EXT_RE.test(entry.name)) {
      yield path;
    }
  }
}

export function scanRepoForViewBoundary({ repoRoot = process.cwd() } = {}) {
  const allFindings = [];
  const allAllowlisted = [];
  const rootDir = join(repoRoot, ROOT);
  try {
    statSync(rootDir);
  } catch {
    return { findings: allFindings, allowlisted: allAllowlisted };
  }
  for (const filePath of walk(rootDir)) {
    const rel = relative(repoRoot, filePath).split(sep).join("/");
    if (!isViewFile(rel)) {
      continue;
    }
    const source = readFileSync(filePath, "utf8");
    const { findings, allowlisted } = findViewBoundaryViolations(source, { filePath: rel });
    allFindings.push(...findings);
    allAllowlisted.push(...allowlisted);
  }
  return { findings: allFindings, allowlisted: allAllowlisted };
}

function main() {
  const { findings, allowlisted } = scanRepoForViewBoundary();
  if (findings.length > 0) {
    console.error("[boundary-guard:view] FAILED — unauthorized View boundary violation(s):");
    for (const f of findings) {
      console.error(`  ${f.filePath}:${f.line}  ${f.name} (${f.op})  →  ${f.snippet}`);
    }
    console.error("[boundary-guard:view] To allowlist as legacy debt, add a preceding line:");
    console.error("                       // TODO(boundary-bypass): <short-key>");
    console.error(`[boundary-guard:view] ${findings.length} unauthorized, ${allowlisted.length} allowlisted.`);
    process.exit(1);
  }

  console.log("[boundary-guard:view] OK — no unauthorized View boundary violations.");
  console.log(`[boundary-guard:view] ${allowlisted.length} allowlisted bypass(es) (TODO(boundary-bypass)).`);
  if (allowlisted.length > 0 && process.argv.includes("--list")) {
    for (const a of allowlisted) {
      console.log(`  ${a.filePath}:${a.line}  ${a.name}`);
    }
  }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main();
}
