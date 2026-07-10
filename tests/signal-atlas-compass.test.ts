import assert from "node:assert/strict";
import test from "node:test";

import type { ReactionPattern } from "../src/compare/topic-audit.ts";
import { layoutSignalAtlasCompass, postReactionMixByShortCode } from "../src/viewmodel/signal-atlas-compass.ts";

function pattern(overrides: Partial<ReactionPattern> & { id: string; nComments: number }): ReactionPattern {
  return {
    label: `形狀 ${overrides.id}`,
    dynamicImplication: "implication",
    nAuthors: 5,
    coverageDenominator: 126,
    supportRefs: ["S1.R1"],
    counterRefs: [],
    representativeRefs: ["S1.R1"],
    counterRepresentativeRefs: [],
    ...overrides
  };
}

test("layoutSignalAtlasCompass uses compass mode when every pattern carries valence and mode", () => {
  const layout = layoutSignalAtlasCompass([
    pattern({ id: "p1", nComments: 31, valence: 0.7, mode: 0.6 }),
    pattern({ id: "p2", nComments: 21, valence: -0.6, mode: 0.5 }),
    pattern({ id: "p3", nComments: 18, valence: -0.5, mode: -0.6 })
  ]);

  assert.equal(layout.kind, "compass");
  assert.equal(layout.bubbles.length, 3);
  const [p1, p2] = layout.bubbles;
  // positive valence lands right of centre, negative lands left
  assert.ok(p1!.x > layout.width / 2, "positive valence should sit right of centre");
  assert.ok(p2!.x < layout.width / 2, "negative valence should sit left of centre");
  // positive mode (情緒共鳴) sits above centre
  assert.ok(p1!.y < layout.height / 2, "positive mode should sit above centre");
});

test("layoutSignalAtlasCompass falls back to field mode when any pattern lacks scalars", () => {
  const layout = layoutSignalAtlasCompass([
    pattern({ id: "p1", nComments: 31, valence: 0.7, mode: 0.6 }),
    pattern({ id: "p2", nComments: 21 })
  ]);

  assert.equal(layout.kind, "field");
  assert.equal(layout.bubbles.length, 2);
});

test("layoutSignalAtlasCompass sizes bubbles by sqrt of comment count", () => {
  const layout = layoutSignalAtlasCompass([
    pattern({ id: "big", nComments: 36, valence: 0.5, mode: 0.5 }),
    pattern({ id: "small", nComments: 9, valence: -0.5, mode: -0.5 })
  ]);

  const big = layout.bubbles.find((bubble) => bubble.id === "big")!;
  const small = layout.bubbles.find((bubble) => bubble.id === "small")!;
  assert.ok(big.r > small.r, "more comments must render a larger bubble");
});

test("layoutSignalAtlasCompass separates bubbles dropped on the same coordinates deterministically", () => {
  const input = [
    pattern({ id: "a", nComments: 20, valence: 0.5, mode: 0.5 }),
    pattern({ id: "b", nComments: 20, valence: 0.5, mode: 0.5 }),
    pattern({ id: "c", nComments: 20, valence: 0.5, mode: 0.5 })
  ];
  const first = layoutSignalAtlasCompass(input);
  const second = layoutSignalAtlasCompass(input);

  for (let i = 0; i < first.bubbles.length; i += 1) {
    for (let j = i + 1; j < first.bubbles.length; j += 1) {
      const a = first.bubbles[i]!;
      const b = first.bubbles[j]!;
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      assert.ok(distance >= a.r + b.r, `bubbles ${a.id}/${b.id} must not overlap (distance ${distance})`);
    }
  }
  assert.deepEqual(first, second, "layout must be deterministic");
});

test("postReactionMixByShortCode counts deduped evidence refs per post, aligned with pattern order", () => {
  const mix = postReactionMixByShortCode([
    pattern({ id: "p1", nComments: 3, supportRefs: ["S1.R1", "S1.R2", "S2.R1"], representativeRefs: ["S1.R1"] }),
    pattern({ id: "p2", nComments: 2, supportRefs: ["S2.R3"], representativeRefs: ["S2.R3", "S1.R9"] })
  ]);

  // S1.R1 appears in both supportRefs and representativeRefs of p1 → counted once
  assert.deepEqual(mix.get("S1"), [2, 1]);
  assert.deepEqual(mix.get("S2"), [1, 1]);
  assert.equal(mix.get("S9"), undefined);
});

test("layoutSignalAtlasCompass keeps every bubble inside the viewbox", () => {
  const layout = layoutSignalAtlasCompass([
    pattern({ id: "edge1", nComments: 40, valence: 1, mode: 1 }),
    pattern({ id: "edge2", nComments: 40, valence: -1, mode: -1 })
  ]);

  for (const bubble of layout.bubbles) {
    assert.ok(bubble.x - bubble.r >= 0, `${bubble.id} overflows left`);
    assert.ok(bubble.x + bubble.r <= layout.width, `${bubble.id} overflows right`);
    assert.ok(bubble.y - bubble.r >= 0, `${bubble.id} overflows top`);
    assert.ok(bubble.y + bubble.r <= layout.height, `${bubble.id} overflows bottom`);
  }
});
