import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as motionModule from "../src/ui/motion.ts";
import { tokens } from "../src/ui/tokens.ts";
import { readUiSourceFamily, type UiSourceFamilyName } from "./helpers/read-ui-source-family.ts";

const {
  DLENS_ATTENTION_CSS,
  DLENS_KEYFRAMES_CSS,
  DLENS_PROPERTY_CSS,
  DLENS_REDUCED_MOTION_CSS,
  DLENS_MOTION_CSS,
  DLENS_KEYFRAMES_STYLE_ID,
  ensureDlensKeyframes
} = motionModule;
const MOTION_PATH = fileURLToPath(new URL("../src/ui/motion.ts", import.meta.url));

// Every workspace route's card/motion marker either lives in a single file
// (no split is planned for it) or in a UI source family (facade file today,
// facade + sibling dir once a future wave splits it apart). Family entries
// must be scanned as a whole family so a marker that moves into a sibling
// file doesn't silently escape the guard.
type RouteCardSource = { kind: "file"; relativePath: string } | { kind: "family"; family: UiSourceFamilyName };

const WORKSPACE_ROUTE_CARD_SOURCES: readonly RouteCardSource[] = [
  { kind: "file", relativePath: "../src/ui/TopicDiscourseView.tsx" },
  { kind: "file", relativePath: "../src/ui/SettingsView.tsx" },
  { kind: "family", family: "PrEvidenceViews" }
];
const SCAN_ROOTS = ["../src/ui", "../src/content", "../src/compare", "../src/state", "../entrypoints"]
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

// Slices out the `{ ... }` block that starts at or after `fromIndex`, by
// counting braces rather than by looking for a sibling symbol's name. This
// lets a function's body be isolated wherever it lives inside a source
// family, without assuming a particular neighboring declaration follows it
// in the same file.
function sliceBalancedBlock(source: string, fromIndex: number): string {
  const openIndex = source.indexOf("{", fromIndex);
  assert.notEqual(openIndex, -1, "expected an opening brace after fromIndex");

  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(fromIndex, i + 1);
    }
  }
  throw new Error("unbalanced braces while slicing block");
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
  assert.match(DLENS_REDUCED_MOTION_CSS, /\[data-dlens-control="true"\]\s+\*/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /animation-iteration-count:\s*1\s*!important/);
});

test("active status rail motion stays under the global control-root reduced-motion wildcard", () => {
  const componentsSource = readFileSync(fileURLToPath(new URL("../src/ui/components.tsx", import.meta.url)), "utf8");
  const popupSource = readFileSync(fileURLToPath(new URL("../src/ui/InPageCollectorPopup.tsx", import.meta.url)), "utf8");

  assert.match(componentsSource, /data-status-rail-active/);
  assert.match(componentsSource, /tokens\.motion\.keyframes\.pulse/);
  assert.match(popupSource, /data-dlens-control="true"/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /\[data-dlens-control="true"\]\s+\*[\s\S]*animation-duration:\s*0\.01ms\s*!important[\s\S]*animation-iteration-count:\s*1\s*!important/);
});

test("AI attention primitives become explicitly static under reduced motion", () => {
  const componentsSource = readFileSync(fileURLToPath(new URL("../src/ui/components.tsx", import.meta.url)), "utf8");
  const popupSource = readFileSync(fileURLToPath(new URL("../src/ui/InPageCollectorPopup.tsx", import.meta.url)), "utf8");

  assert.match(componentsSource, /data-searching-orb/);
  assert.match(componentsSource, /data-attention-beam/);
  assert.match(popupSource, /data-dlens-control="true"/);
  assert.match(DLENS_ATTENTION_CSS, /\[data-attention-beam="generating"\]/);
  assert.match(DLENS_ATTENTION_CSS, /\[data-attention-beam-sweep="true"\]::before/);
  assert.match(DLENS_ATTENTION_CSS, /\[data-searching-orb="true"\]/);
  assert.match(DLENS_ATTENTION_CSS, /data-searching-orb="true"\]\{width:16px;height:16px;flex:0 0 16px/);
  // The orb is a canvas scanning sphere, so its motion is owned by rAF in
  // components.tsx and its reduced-motion branch paints one static frame.
  assert.match(componentsSource, /prefers-reduced-motion: reduce/);
  assert.match(componentsSource, /requestAnimationFrame/);
  assert.match(DLENS_ATTENTION_CSS, /dlens-popup-indeterminate/);
  assert.match(DLENS_ATTENTION_CSS, /\[data-attention-beam\]\{[^}]*box-sizing:border-box/);
  const reduceStart = DLENS_REDUCED_MOTION_CSS.indexOf("@media (prefers-reduced-motion: reduce)");
  const reduceBlock = sliceBalancedBlock(DLENS_REDUCED_MOTION_CSS, reduceStart);
  const orbSelector = '[data-dlens-control="true"] [data-searching-orb="true"]';
  const orbRule = sliceBalancedBlock(reduceBlock, reduceBlock.indexOf(orbSelector));
  const sweepSelector = '[data-dlens-control="true"] [data-attention-beam-sweep="true"]::before';
  const sweepRule = sliceBalancedBlock(reduceBlock, reduceBlock.indexOf(sweepSelector));

  assert.match(orbRule, /animation:\s*none\s*!important/);
  assert.match(sweepRule, /animation:\s*none\s*!important/);
  assert.match(sweepRule, /display:\s*none\s*!important/);
});

test("tactile cards lift on intent, press below rest, and release through the shared spring", () => {
  assert.match(DLENS_MOTION_CSS, /\.dlens-card-lift:hover[\s\S]*translateY\(-4px\) scale\(1\.015\)/);
  assert.match(DLENS_MOTION_CSS, /\.dlens-card-lift:active[\s\S]*translateY\(1px\) scale\(0\.994\)/);
  assert.match(DLENS_MOTION_CSS, /prefers-reduced-motion:\s*reduce[\s\S]*\.dlens-card-lift:active[\s\S]*transform:\s*none\s*!important/);
});

test("approved hover preset A gives dense actionable rows the same pronounced lift", () => {
  assert.match(DLENS_MOTION_CSS, /\.dlens-tactile-row:hover[\s\S]*translateY\(-4px\)/);
  assert.match(DLENS_MOTION_CSS, /\.dlens-tactile-row:hover[\s\S]*box-shadow:[^;]*0 18px 40px/);
  assert.match(DLENS_MOTION_CSS, /\.dlens-tactile-row:active[\s\S]*translateY\(1px\) scale\(0\.995\)/);
  assert.match(DLENS_MOTION_CSS, /prefers-reduced-motion:\s*reduce[\s\S]*\.dlens-tactile-row:active[\s\S]*transform:\s*none\s*!important/);
});

test("motion tokens carry the approved presence and bottom-rebound values", () => {
  assert.deepEqual(tokens.motion.presence, {
    cardOpacityFrom: 0.28,
    cardRisePx: 10,
    cardDurationMs: 480,
    cardDelayMs: 70,
    cardStaggerMs: 60,
    rowOpacityFrom: 0.92,
    rowRisePx: 4,
    rowDurationMs: 220,
    staggerMs: 35,
    staggerCap: 6,
    staggerResetMs: 120,
    threshold: 0.08,
    rootMargin: "1000px 0px -96px 0px",
    leadSoftPop: {
      opacityFrom: 0.68,
      risePx: 10,
      overshootPx: -1.5,
      scaleFrom: 0.985,
      scaleOvershoot: 1.003,
      durationMs: 420
    }
  });
  assert.equal(tokens.motion.easing.softPop, "cubic-bezier(0.25, 0.46, 0.45, 0.94)");
  assert.deepEqual(tokens.motion.bottomRebound, {
    amplitudePx: 3,
    durationMs: 280,
    hysteresisPx: 30,
    wheelGain: 0.06,
    settleDelayMs: 140,
    cooldownMs: 400,
    bottomTolerancePx: 1
  });
});

test("every workspace route family opts real cards into the shared presence grammar", () => {
  const cardMarker = /data-dlens-presence="card"|<SurfaceCard\b/;

  for (const routeSource of WORKSPACE_ROUTE_CARD_SOURCES) {
    if (routeSource.kind === "file") {
      const source = readFileSync(fileURLToPath(new URL(routeSource.relativePath, import.meta.url)), "utf8");
      assert.match(
        source,
        cardMarker,
        `${routeSource.relativePath} must expose at least one real card to the route-independent presence grammar`
      );
      continue;
    }

    const family = readUiSourceFamily(routeSource.family);
    assert.ok(
      family.some((entry) => cardMarker.test(entry.source)),
      `${routeSource.family} family (${family.map((entry) => entry.relativePath).join(", ")}) must expose at least one real card to the route-independent presence grammar`
    );
  }

  const productionSource = sourceFiles().map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(
    productionSource,
    /data-dlens-presence-motion|topicSoftPop|topic-soft/,
    "presence behavior must not depend on a Topic-only marker or token"
  );
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
  assert.match(appended[0]!.textContent, /@keyframes dlens-card-shimmer/);
  assert.match(appended[0]!.textContent, /prefers-reduced-motion:\s*reduce/);
});

test("collection B owns rise, fold, glide, image and mist keyframes and current shell markers", () => {
  const names = new Set(registryKeyframeNames());
  for (const suffix of ["rise", "fold", "glide", "image", "mist"]) assert.ok(names.has(`dlens-collection-${suffix}`));
  const start = DLENS_MOTION_CSS.indexOf("@media (prefers-reduced-motion: no-preference) {\n  [data-collection-workspace-shell]");
  assert.notEqual(start, -1, "collection motion sits behind the no-preference gate");
  const block = DLENS_MOTION_CSS.slice(start, DLENS_MOTION_CSS.indexOf("\n}\n", start));
  for (const marker of ["data-collection-arrival", "data-collection-glide", "data-collection-exiting", "data-collection-tab-indicator", "data-collection-sort-knob", "data-collection-image-loaded", "data-collection-mist"]) assert.ok(block.includes(marker), marker);
});
