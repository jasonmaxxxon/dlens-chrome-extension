#!/usr/bin/env node
// BOUNDARY_GUARD: bans ViewModel modules from owning browser APIs, network
// calls, DOM globals, browser file constructors, or React dependencies.
// Inline legacy debt can be marked with `TODO(boundary-bypass): <reason>`,
// but the locked state requires zero allowlisted bypasses.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = "src/viewmodel";
const FILE_EXT_RE = /\.tsx?$/;
const TSX_RE = /\.tsx$/;
const EXCLUDE_DIRS = new Set(["node_modules", ".wxt", ".output", "dist", ".git"]);

const VM_FORBIDDEN_PATTERNS = [
  { name: "chrome.* namespace", re: /\bchrome\./, op: "browser-api" },
  { name: "fetch()", re: /\bfetch\s*\(/, op: "network" },
  { name: "document.*", re: /\bdocument\./, op: "dom" },
  { name: "window.*", re: /\bwindow\./, op: "dom" },
  { name: "File constructor", re: /\bnew\s+File\s*\(/, op: "browser-api" },
  { name: "Blob constructor", re: /\bnew\s+Blob\s*\(/, op: "browser-api" },
  { name: "FormData constructor", re: /\bnew\s+FormData\s*\(/, op: "browser-api" },
  { name: "React import", re: /from\s+["']react(?:-dom)?["']/, op: "react" }
];

const MARKER_RE = /TODO\(boundary-bypass\):\s*\S+/;

function isCommentOnlyLine(line) {
  return /^\s*(?:\/\/|\*|\/\*)/.test(line);
}

export function findViewModelBoundaryViolations(source, { filePath = "<inline>" } = {}) {
  const lines = source.split(/\r?\n/);
  const findings = [];
  const allowlisted = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentOnlyLine(line)) continue;
    for (const pattern of VM_FORBIDDEN_PATTERNS) {
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

export function scanRepoForViewModelBoundary({ repoRoot = process.cwd() } = {}) {
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
    if (TSX_RE.test(rel)) {
      allFindings.push({
        filePath: rel,
        line: 1,
        name: "ViewModel TSX file",
        op: "jsx",
        snippet: "ViewModel files must stay .ts and JSX-free"
      });
      continue;
    }
    const source = readFileSync(filePath, "utf8");
    const { findings, allowlisted } = findViewModelBoundaryViolations(source, { filePath: rel });
    allFindings.push(...findings);
    allAllowlisted.push(...allowlisted);
  }
  return { findings: allFindings, allowlisted: allAllowlisted };
}

function main() {
  const { findings, allowlisted } = scanRepoForViewModelBoundary();
  if (findings.length > 0) {
    console.error("[boundary-guard:vm] FAILED — unauthorized ViewModel boundary violation(s):");
    for (const f of findings) {
      console.error(`  ${f.filePath}:${f.line}  ${f.name} (${f.op})  →  ${f.snippet}`);
    }
    console.error("[boundary-guard:vm] To allowlist as legacy debt, add a preceding line:");
    console.error("                     // TODO(boundary-bypass): <short-key>");
    console.error(`[boundary-guard:vm] ${findings.length} unauthorized, ${allowlisted.length} allowlisted.`);
    process.exit(1);
  }

  console.log("[boundary-guard:vm] OK — no unauthorized ViewModel boundary violations.");
  console.log(`[boundary-guard:vm] ${allowlisted.length} allowlisted bypass(es) (TODO(boundary-bypass)).`);
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
