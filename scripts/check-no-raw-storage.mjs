#!/usr/bin/env node
// SEAM_GUARD: bans new raw chrome.storage.local.{set,remove,clear} in production
// code (src/, entrypoints/). Reads remain unrestricted. Legacy bypass sites carry
// an inline `// TODO(seam-bypass): <key>` marker (same line trailing OR preceding
// line); the guard counts them as known debt and exits clean. Unmarked writes
// are an error.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const ROOTS = ["src", "entrypoints"];
const FILE_EXT_RE = /\.(ts|tsx)$/;
const EXCLUDE_DIRS = new Set(["node_modules", ".wxt", ".output", "dist", ".git"]);

const STORAGE_WRITE_RE = /chrome\.storage\.local\.(set|remove|clear)\s*\(/;
const MARKER_RE = /TODO\(seam-bypass\):\s*\S+/;

export function findUnauthorizedRawStorage(source, { filePath = "<inline>" } = {}) {
  const lines = source.split(/\r?\n/);
  const findings = [];
  const allowlisted = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) continue;
    const match = STORAGE_WRITE_RE.exec(line);
    if (!match) continue;
    const op = match[1];
    const prev = i > 0 ? lines[i - 1] : "";
    const markerOnLine = MARKER_RE.test(line);
    const markerOnPrev = MARKER_RE.test(prev);
    const hit = { filePath, line: i + 1, op, snippet: line.trim() };
    if (markerOnLine || markerOnPrev) {
      allowlisted.push(hit);
    } else {
      findings.push(hit);
    }
  }
  return { findings, allowlisted };
}

function* walk(dir, repoRoot) {
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
      yield* walk(path, repoRoot);
    } else if (entry.isFile() && FILE_EXT_RE.test(entry.name)) {
      yield path;
    }
  }
}

function main() {
  const repoRoot = process.cwd();
  const allFindings = [];
  const allAllowlisted = [];
  for (const root of ROOTS) {
    const rootDir = join(repoRoot, root);
    try {
      statSync(rootDir);
    } catch {
      continue;
    }
    for (const filePath of walk(rootDir, repoRoot)) {
      const source = readFileSync(filePath, "utf8");
      const rel = relative(repoRoot, filePath).split(sep).join("/");
      const { findings, allowlisted } = findUnauthorizedRawStorage(source, { filePath: rel });
      allFindings.push(...findings);
      allAllowlisted.push(...allowlisted);
    }
  }

  if (allFindings.length > 0) {
    console.error("[seam-guard] FAILED — unauthorized raw chrome.storage write(s):");
    for (const f of allFindings) {
      console.error(`  ${f.filePath}:${f.line}  chrome.storage.local.${f.op}  →  ${f.snippet}`);
    }
    console.error(`[seam-guard] To allowlist as legacy debt, add a preceding line:`);
    console.error(`               // TODO(seam-bypass): <short-key>`);
    console.error(`[seam-guard] ${allFindings.length} unauthorized, ${allAllowlisted.length} allowlisted.`);
    process.exit(1);
  }

  console.log(`[seam-guard] OK — no unauthorized raw chrome.storage writes.`);
  console.log(`[seam-guard] ${allAllowlisted.length} allowlisted bypass(es) (TODO(seam-bypass)).`);
  if (allAllowlisted.length > 0 && process.argv.includes("--list")) {
    for (const a of allAllowlisted) {
      console.log(`  ${a.filePath}:${a.line}  chrome.storage.local.${a.op}`);
    }
  }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main();
}
