import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const [, , bundlePathArg, limitsPathArg] = process.argv;

const limitsPath = limitsPathArg
  ? resolve(process.cwd(), limitsPathArg)
  : new URL("./ui-bundle-budget.json", import.meta.url);
const limits = JSON.parse(readFileSync(limitsPath, "utf8"));

const bundlePath = bundlePathArg
  ? resolve(process.cwd(), bundlePathArg)
  : new URL("../output/chrome-mv3/content-scripts/threads.js", import.meta.url);
const source = readFileSync(bundlePath);

const actual = {
  rawBytes: source.length,
  gzip9Bytes: gzipSync(source, { level: 9 }).length,
  brotliBytes: brotliCompressSync(source).length
};

console.log("UI bundle budget check");
console.log(`  bundle: ${bundlePath instanceof URL ? bundlePath.pathname : bundlePath}`);
console.log(`  limits: ${limitsPath instanceof URL ? limitsPath.pathname : limitsPath}`);

let failed = false;
for (const key of Object.keys(actual)) {
  const limit = limits.threads[key];
  const value = actual[key];
  const withinBudget = value <= limit;
  if (!withinBudget) {
    failed = true;
  }
  console.log(
    `  ${key}: ${value} / ${limit} bytes${withinBudget ? "" : "  <-- OVER BUDGET"}`
  );
}

if (failed) {
  process.exitCode = 1;
}
