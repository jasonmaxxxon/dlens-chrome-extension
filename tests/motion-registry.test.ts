import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as motionModule from "../src/ui/motion.ts";
import { tokens } from "../src/ui/tokens.ts";

const {
  DLENS_KEYFRAMES_CSS,
  DLENS_REDUCED_MOTION_CSS,
  DLENS_KEYFRAMES_STYLE_ID,
  ensureDlensKeyframes
} = motionModule;
const motionTestables = motionModule as unknown as {
  resolveMotionScrollBehavior: (matchMedia: (query: string) => { matches: boolean }) => ScrollBehavior;
  scrollWorkspaceViewportToTop: (
    queryRoot: { querySelector: (selector: string) => { scrollTo: (options: ScrollToOptions) => void } | null },
    fallbackTarget: { scrollTo: (options: ScrollToOptions) => void },
    behavior: ScrollBehavior
  ) => "workspace" | "fallback";
};

const MOTION_PATH = fileURLToPath(new URL("../src/ui/motion.ts", import.meta.url));
const COMPARE_PATH = fileURLToPath(new URL("../src/ui/CompareView.tsx", import.meta.url));
const SCAN_ROOTS = ["../src/ui", "../src/compare", "../src/state", "../entrypoints"]
  .map((rel) => fileURLToPath(new URL(rel, import.meta.url)));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function sourceFiles(): string[] {
  return SCAN_ROOTS.flatMap(walk);
}

function registryKeyframeNames(): string[] {
  return [...DLENS_KEYFRAMES_CSS.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)].map((match) => match[1]!);
}

test("keyframe registry names are unique (guards the dlens-success-pulse dup-name class of bug)", () => {
  const names = registryKeyframeNames();
  assert.deepEqual([...names].sort(), [...new Set(names)].sort());
});

test("no @keyframes are defined outside the single motion registry", () => {
  const offenders = sourceFiles()
    .filter((file) => file !== MOTION_PATH)
    .filter((file) => /@keyframes/.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});

test("every tokens.motion.keyframes animation resolves to a registry keyframe", () => {
  const defined = new Set(registryKeyframeNames());
  for (const value of Object.values(tokens.motion.keyframes)) {
    const name = value.trim().split(/\s+/)[0]!;
    assert.ok(defined.has(name), `tokens.motion.keyframes references undefined @keyframes ${name}`);
  }
});

test("every inline `animation:` keyframe name resolves to a registry keyframe", () => {
  const defined = new Set(registryKeyframeNames());
  const missing = new Set<string>();
  for (const file of sourceFiles()) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/animation:\s*["'`]?\s*(dlens-[a-z0-9-]+)/g)) {
      if (!defined.has(match[1]!)) {
        missing.add(`${match[1]} (${file})`);
      }
    }
  }
  assert.deepEqual([...missing], []);
});

test("reduced-motion safety net is scoped to DLens roots and neutralises animation", () => {
  assert.match(DLENS_REDUCED_MOTION_CSS, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /\[data-dlens-control="true"\]/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /animation-iteration-count:\s*1\s*!important/);
});

test("ensureDlensKeyframes injects the registry + reduced-motion exactly once per document", () => {
  const appended: Array<{ id: string; textContent: string }> = [];
  const byId = new Map<string, { id: string; textContent: string }>();
  const fakeDoc = {
    getElementById: (id: string) => byId.get(id) ?? null,
    createElement: () => ({ id: "", textContent: "" }),
    head: {
      appendChild: (element: { id: string; textContent: string }) => {
        appended.push(element);
        byId.set(element.id, element);
      }
    }
  } as unknown as Document;

  ensureDlensKeyframes(fakeDoc);
  ensureDlensKeyframes(fakeDoc);
  ensureDlensKeyframes(fakeDoc);

  assert.equal(appended.length, 1);
  assert.equal(appended[0]!.id, DLENS_KEYFRAMES_STYLE_ID);
  assert.match(appended[0]!.textContent, /@keyframes dlens-spin/);
  assert.match(appended[0]!.textContent, /prefers-reduced-motion:\s*reduce/);
});

test("resolveMotionScrollBehavior returns auto when reduced motion is requested", () => {
  const resolveBehavior = motionTestables.resolveMotionScrollBehavior;
  const queries: string[] = [];

  assert.equal(typeof resolveBehavior, "function");
  assert.equal(resolveBehavior((query) => {
    queries.push(query);
    return { matches: true };
  }), "auto");
  assert.deepEqual(queries, ["(prefers-reduced-motion: reduce)"]);
});

test("resolveMotionScrollBehavior returns smooth when reduced motion is not requested", () => {
  const resolveBehavior = motionTestables.resolveMotionScrollBehavior;

  assert.equal(typeof resolveBehavior, "function");
  assert.equal(resolveBehavior(() => ({ matches: false })), "smooth");
});

test("scrollWorkspaceViewportToTop scrolls the DLens viewport without touching the host window", () => {
  const scrollWorkspace = motionTestables.scrollWorkspaceViewportToTop;
  const workspaceCalls: ScrollToOptions[] = [];
  const fallbackCalls: ScrollToOptions[] = [];
  const selectors: string[] = [];

  assert.equal(typeof scrollWorkspace, "function");
  const target = scrollWorkspace({
    querySelector: (selector) => {
      selectors.push(selector);
      return { scrollTo: (options) => workspaceCalls.push(options) };
    }
  }, { scrollTo: (options) => fallbackCalls.push(options) }, "auto");

  assert.equal(target, "workspace");
  assert.deepEqual(selectors, ['[data-workspace-popup-scroll="viewport"]']);
  assert.deepEqual(workspaceCalls, [{ top: 0, behavior: "auto" }]);
  assert.deepEqual(fallbackCalls, []);
});

test("scrollWorkspaceViewportToTop falls back for a standalone Compare surface", () => {
  const scrollWorkspace = motionTestables.scrollWorkspaceViewportToTop;
  const fallbackCalls: ScrollToOptions[] = [];

  assert.equal(typeof scrollWorkspace, "function");
  const target = scrollWorkspace(
    { querySelector: () => null },
    { scrollTo: (options) => fallbackCalls.push(options) },
    "smooth"
  );

  assert.equal(target, "fallback");
  assert.deepEqual(fallbackCalls, [{ top: 0, behavior: "smooth" }]);
});

test("Compare scrolling uses the shared motion preference instead of hard-coded smooth behavior", () => {
  const source = readFileSync(COMPARE_PATH, "utf8");
  const start = source.indexOf('  const openTechniqueView = (side: "A" | "B") => {');
  assert.notEqual(start, -1);
  const end = source.indexOf("\n  const jumpBackToCluster", start);
  assert.notEqual(end, -1);
  const openTechniqueBlock = source.slice(start, end);

  assert.doesNotMatch(source, /behavior:\s*["']smooth["']/);
  assert.match(source, /resolveMotionScrollBehavior/);
  assert.match(openTechniqueBlock, /scrollWorkspaceViewportToTop/);
  assert.doesNotMatch(openTechniqueBlock, /window\.scrollTo/);
});
