import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as motionModule from "../src/ui/motion.ts";
import { tokens } from "../src/ui/tokens.ts";
import { readSourceFamily, readUiSourceFamily, type UiSourceFamilyName } from "./helpers/read-ui-source-family.ts";

const {
  DLENS_KEYFRAMES_CSS,
  DLENS_REDUCED_MOTION_CSS,
  DLENS_MOTION_CSS,
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
  planCausalListTransitions: (
    previous: ReadonlyMap<string, { left: number; top: number }>,
    current: ReadonlyMap<string, { left: number; top: number }>
  ) => Array<{ key: string; kind: "move" | "enter"; deltaX: number; deltaY: number }>;
};

const MOTION_PATH = fileURLToPath(new URL("../src/ui/motion.ts", import.meta.url));
const ATLAS_REACTION_MAP_PATH = fileURLToPath(new URL("../src/ui/AtlasReactionMap.tsx", import.meta.url));

// Every workspace route's card/motion marker either lives in a single file
// (no split is planned for it) or in a UI source family (facade file today,
// facade + sibling dir once a future wave splits it apart). Family entries
// must be scanned as a whole family so a marker that moves into a sibling
// file doesn't silently escape the guard.
type RouteCardSource = { kind: "file"; relativePath: string } | { kind: "family"; family: UiSourceFamilyName };

const WORKSPACE_ROUTE_CARD_SOURCES: readonly RouteCardSource[] = [
  { kind: "file", relativePath: "../src/ui/TopicsListView.tsx" },
  { kind: "family", family: "TopicDetailView" },
  { kind: "file", relativePath: "../src/ui/CollectView.tsx" },
  { kind: "family", family: "LibraryView" },
  { kind: "file", relativePath: "../src/ui/CasebookView.tsx" },
  { kind: "file", relativePath: "../src/ui/SettingsView.tsx" },
  { kind: "file", relativePath: "../src/ui/CompareSetupView.tsx" },
  { kind: "family", family: "CompareView" },
  { kind: "file", relativePath: "../src/ui/TechniqueView.tsx" },
  { kind: "family", family: "ProductSignalViews" },
  { kind: "family", family: "PrEvidenceViews" },
  { kind: "file", relativePath: "../src/ui/InPageCollectorResultWorkspace.tsx" }
];
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

test("Product Action stage keyframes enter from opposite token-owned x offsets", () => {
  const distancePx = tokens.motion.presence.cardRisePx;
  const directions = [
    {
      keyframe: "dlens-product-stage-forward-in",
      expectedFromTransform: `translateX(${distancePx}px)`
    },
    {
      keyframe: "dlens-product-stage-backward-in",
      expectedFromTransform: `translateX(-${distancePx}px)`
    }
  ] as const;

  for (const { keyframe, expectedFromTransform } of directions) {
    const start = DLENS_KEYFRAMES_CSS.indexOf(`@keyframes ${keyframe}`);
    assert.notEqual(start, -1, `expected ${keyframe} in the single motion registry`);
    const block = sliceBalancedBlock(DLENS_KEYFRAMES_CSS, start);
    assert.ok(block.includes(`from { transform: ${expectedFromTransform}; }`));
    assert.ok(block.includes("to { transform: translateX(0); }"));
  }

  const source = readFileSync(MOTION_PATH, "utf8");
  assert.match(
    source,
    /@keyframes dlens-product-stage-forward-in[\s\S]*?translateX\(\$\{tokens\.motion\.presence\.cardRisePx\}px\)/
  );
  assert.match(
    source,
    /@keyframes dlens-product-stage-backward-in[\s\S]*?translateX\(-\$\{tokens\.motion\.presence\.cardRisePx\}px\)/
  );
});

test("Product Action stage direction selectors animate only when motion is preferred", () => {
  const mediaStart = DLENS_MOTION_CSS.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.notEqual(mediaStart, -1, "expected an explicit no-preference motion gate");
  const mediaBlock = sliceBalancedBlock(DLENS_MOTION_CSS, mediaStart);

  for (const [direction, keyframe] of [
    ["forward", "dlens-product-stage-forward-in"],
    ["backward", "dlens-product-stage-backward-in"]
  ] as const) {
    const selector = `[data-dlens-control="true"] [data-product-action-stage][data-direction="${direction}"]`;
    const selectorStart = mediaBlock.indexOf(selector);
    assert.notEqual(selectorStart, -1, `expected ${direction} Product Action stage selector`);
    const rule = sliceBalancedBlock(mediaBlock, selectorStart);
    assert.ok(
      rule.includes(
        `animation: ${keyframe} ${tokens.motion.duration.slow} ${tokens.motion.easing.entrance} both;`
      )
    );
  }

  const cssOutsideGate = DLENS_MOTION_CSS.replace(mediaBlock, "");
  assert.doesNotMatch(cssOutsideGate, /animation:\s*dlens-product-stage-(?:forward|backward)-in/);

  const source = readFileSync(MOTION_PATH, "utf8");
  assert.match(
    source,
    /animation: dlens-product-stage-forward-in \$\{tokens\.motion\.duration\.slow\} \$\{tokens\.motion\.easing\.entrance\} both;/
  );
  assert.match(
    source,
    /animation: dlens-product-stage-backward-in \$\{tokens\.motion\.duration\.slow\} \$\{tokens\.motion\.easing\.entrance\} both;/
  );
});

test("Product Action stage explicitly removes animation and transforms for reduced motion", () => {
  const mediaStart = DLENS_MOTION_CSS.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.notEqual(mediaStart, -1, "expected an explicit reduced-motion block");
  const mediaBlock = sliceBalancedBlock(DLENS_MOTION_CSS, mediaStart);
  const selector = '[data-dlens-control="true"] [data-product-action-stage]';
  const selectorStart = mediaBlock.indexOf(selector);
  assert.notEqual(selectorStart, -1, "expected Product Action stage reduced-motion selector");
  const rule = sliceBalancedBlock(mediaBlock, selectorStart);

  assert.match(rule, /animation:\s*none\s*!important/);
  assert.match(rule, /transform:\s*none\s*!important/);
});

test("reduced-motion safety net is scoped to DLens roots and neutralises animation", () => {
  assert.match(DLENS_REDUCED_MOTION_CSS, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /\[data-dlens-control="true"\]/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /\[data-dlens-control="true"\]\s+\*/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /animation-iteration-count:\s*1\s*!important/);
});

test("source-session motion stays under the global control-root reduced-motion wildcard", () => {
  const cardSource = readFileSync(fileURLToPath(new URL("../src/ui/TopicSourceSessionCard.tsx", import.meta.url)), "utf8");
  const popupSource = readFileSync(fileURLToPath(new URL("../src/ui/InPageCollectorPopup.tsx", import.meta.url)), "utf8");

  assert.match(cardSource, /data-topic-source-session-spinner/);
  assert.match(cardSource, /data-topic-source-session-progress/);
  assert.match(cardSource, /tokens\.motion\.keyframes\.(spin|indeterminate)/);
  assert.match(popupSource, /data-dlens-control="true"/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /\[data-dlens-control="true"\]\s+\*[\s\S]*animation-duration:\s*0\.01ms\s*!important[\s\S]*animation-iteration-count:\s*1\s*!important/);
});

test("active status rail motion stays under the global control-root reduced-motion wildcard", () => {
  const componentsSource = readFileSync(fileURLToPath(new URL("../src/ui/components.tsx", import.meta.url)), "utf8");
  const popupSource = readFileSync(fileURLToPath(new URL("../src/ui/InPageCollectorPopup.tsx", import.meta.url)), "utf8");

  assert.match(componentsSource, /data-status-rail-active/);
  assert.match(componentsSource, /tokens\.motion\.keyframes\.pulse/);
  assert.match(popupSource, /data-dlens-control="true"/);
  assert.match(DLENS_REDUCED_MOTION_CSS, /\[data-dlens-control="true"\]\s+\*[\s\S]*animation-duration:\s*0\.01ms\s*!important[\s\S]*animation-iteration-count:\s*1\s*!important/);
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

test("Atlas distribution rows acknowledge hover without borrowing card lift or shadow", () => {
  assert.match(DLENS_MOTION_CSS, /\.dlens-atlas-distribution-row\s*\{[^}]*transition:\s*background-color/);
  assert.match(DLENS_MOTION_CSS, /\.dlens-atlas-distribution-row:hover[\s\S]*?background:\s*[^;]+;/);
  const quietRule = DLENS_MOTION_CSS.match(/\.dlens-atlas-distribution-row:hover\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(quietRule, /transform|box-shadow/);
});

test("Atlas focus rings disable their opacity transition when reduced motion is requested", () => {
  const source = readFileSync(ATLAS_REACTION_MAP_PATH, "utf8");
  assert.match(
    source,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.dlens-atlas-focus-ring\s*\{\s*transition:\s*none !important;\s*\}/
  );
});

test("popup opening still wakes masthead, rail, then main in order", () => {
  const popupRoot = '[data-dlens-control="true"][data-workspace-popup-material]';
  const masthead = DLENS_MOTION_CSS.indexOf(`${popupRoot} [data-shell-masthead="editorial"]`);
  const rail = DLENS_MOTION_CSS.indexOf(`${popupRoot} [data-shell-header="workspace"]`);
  const main = DLENS_MOTION_CSS.indexOf(`${popupRoot} [data-shell-main="workspace"]`);

  assert.ok(masthead >= 0);
  assert.ok(rail > masthead);
  assert.ok(main > rail);
  assert.match(DLENS_MOTION_CSS, /animation-delay:\s*0ms/);
  assert.match(DLENS_MOTION_CSS, /animation-delay:\s*35ms/);
  assert.match(DLENS_MOTION_CSS, /animation-delay:\s*70ms/);
  assert.doesNotMatch(DLENS_MOTION_CSS, /\[data-dlens-control="true"\]\s+\[data-workspace-popup-material\]/);
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

test("causal list planner moves retained rows and only enters rows created by a state change", () => {
  const plan = motionTestables.planCausalListTransitions;
  assert.equal(typeof plan, "function");

  const transitions = plan(
    new Map([
      ["a", { left: 12, top: 40 }],
      ["b", { left: 12, top: 92 }]
    ]),
    new Map([
      ["b", { left: 12, top: 40 }],
      ["c", { left: 12, top: 92 }]
    ])
  );

  assert.deepEqual(transitions, [
    { key: "b", kind: "move", deltaX: 0, deltaY: 52 },
    { key: "c", kind: "enter", deltaX: 0, deltaY: 0 }
  ]);
  assert.deepEqual(plan(new Map(), new Map([["a", { left: 0, top: 0 }]])), [
    { key: "a", kind: "enter", deltaX: 0, deltaY: 0 }
  ]);
  assert.deepEqual(plan(new Map([["a", { left: 0, top: 0 }]]), new Map([["a", { left: 0, top: 0 }]])), []);
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
  const family = readUiSourceFamily("CompareView");
  const openTechniqueMarker = 'const openTechniqueView = (side: "A" | "B") => {';
  const owner = family.find((entry) => entry.source.includes(openTechniqueMarker));
  assert.ok(
    owner,
    `expected some file in the CompareView family (${family.map((entry) => entry.relativePath).join(", ")}) to define openTechniqueView`
  );

  const start = owner!.source.indexOf(openTechniqueMarker);
  const openTechniqueBlock = sliceBalancedBlock(owner!.source, start);
  const familySource = family.map((entry) => entry.source).join("\n");

  assert.doesNotMatch(familySource, /behavior:\s*["']smooth["']/);
  assert.match(familySource, /resolveMotionScrollBehavior/);
  assert.match(openTechniqueBlock, /scrollWorkspaceViewportToTop/);
  assert.doesNotMatch(openTechniqueBlock, /window\.scrollTo/);
});

test("family reader catches a hard-coded scroll behavior hidden in a nested family sibling (RED-first proof)", () => {
  const FIXTURE_FACADE = "tests/fixtures/ui-source-family/FacadeView.tsx";
  const FIXTURE_SIBLING_DIR = "tests/fixtures/ui-source-family/sibling";
  const hardcodedSmooth = /behavior:\s*["']smooth["']/;

  // RED: a guard that only reads the single hardcoded facade file (the old
  // approach this task replaces) never looks at the sibling directory, so
  // it misses the violation planted in sibling/nested/BadScrollView.tsx.
  const facadeOnlySource = readFileSync(
    fileURLToPath(new URL("./fixtures/ui-source-family/FacadeView.tsx", import.meta.url)),
    "utf8"
  );
  assert.doesNotMatch(
    facadeOnlySource,
    hardcodedSmooth,
    "sanity check: the violation must live in the nested sibling, not the facade file itself"
  );

  // GREEN: the family reader walks the sibling directory recursively (via
  // readSourceTree) and surfaces the violation the facade-only read missed.
  const family = readSourceFamily(FIXTURE_FACADE, FIXTURE_SIBLING_DIR);
  const offenders = family.filter((entry) => hardcodedSmooth.test(entry.source));
  assert.ok(
    offenders.some((entry) => entry.relativePath.includes("sibling/nested/")),
    `expected the family scan to catch the nested fixture violation among: ${family.map((entry) => entry.relativePath).join(", ")}`
  );
});
