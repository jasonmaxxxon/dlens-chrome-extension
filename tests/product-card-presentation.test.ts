import assert from "node:assert/strict";
import test from "node:test";

import type { ProductSignalAnalysis, ProductSignalType, ProductSignalReferenceType } from "../src/state/types.ts";
import {
  derivePrimaryCategory,
  deriveProductCardRecommendations,
  resolveProductHero,
  deriveProductCardPresentation,
  extractCapturedUrl,
  findCapturedUrl,
  ROOT_SPAN_REF,
  type ProductCardInput,
  type ProductPrimaryCategory
} from "../src/viewmodel/product-card-presentation.ts";

function analysis(over: Partial<ProductSignalAnalysis> = {}): ProductSignalAnalysis {
  return {
    signalId: "s", signalType: "learning", signalSubtype: "x", contentType: "content",
    contentSummary: "c", relevance: 3, relevantTo: [], whyRelevant: "w",
    verdict: "try", reason: "r", evidenceRefs: [], productContextHash: "h",
    promptVersion: "v", analyzedAt: "t", status: "complete", ...over
  } as ProductSignalAnalysis;
}

function input(over: Partial<ProductCardInput> = {}): ProductCardInput {
  return { analysis: analysis(), citations: [], capturedSpans: [], tally: null, ...over };
}

/* ── W0.1: exhaustive category matrix (6 signalType × (6 referenceType + undefined)) ── */
const SIGNAL_TYPES: ProductSignalType[] = ["learning", "competitor", "demand", "technical", "marketing", "noise"];
const REFERENCE_TYPES: Array<ProductSignalReferenceType | undefined> = [
  "product_reference", "technical_learning", "workflow_pattern",
  "market_language", "general_learning", "no_direct_fit", undefined
];
const PRECEDENCE: ProductPrimaryCategory[] = ["lift", "need", "rival", "market", "learn"];

// Independent reference spec (written separately from the implementation).
function refMatches(cat: ProductPrimaryCategory, st: ProductSignalType, rt?: ProductSignalReferenceType): boolean {
  if (cat === "lift") return st === "technical" || rt === "technical_learning" || rt === "workflow_pattern" || rt === "product_reference";
  if (cat === "need") return st === "demand";
  if (cat === "rival") return st === "competitor";
  if (cat === "market") return st === "marketing" || rt === "market_language";
  return st === "learning" || rt === "general_learning" || rt === "no_direct_fit";
}
function refExpected(st: ProductSignalType, rt?: ProductSignalReferenceType): {
  primary: ProductPrimaryCategory | null;
  secondary: ProductPrimaryCategory[];
} {
  if (st === "noise") return { primary: null, secondary: [] };
  const matched = PRECEDENCE.filter((c) => refMatches(c, st, rt));
  const primary = matched[0] ?? "learn";
  return { primary, secondary: matched.filter((c) => c !== primary).slice(0, 2) };
}

test("derivePrimaryCategory matches the precedence spec across all signalType × referenceType", () => {
  for (const st of SIGNAL_TYPES) {
    for (const rt of REFERENCE_TYPES) {
      const got = derivePrimaryCategory(analysis({ signalType: st, referenceType: rt }));
      const want = refExpected(st, rt);
      assert.deepEqual(got, want, `signalType=${st} referenceType=${rt}`);
      assert.ok(got.primary === null || PRECEDENCE.includes(got.primary), `primary is a category or null (${st}/${rt})`);
      assert.ok(got.secondary.length <= 2, `secondary cap (${st}/${rt})`);
      assert.ok(!got.secondary.includes(got.primary), `primary excluded from secondary (${st}/${rt})`);
    }
  }
});

test("derivePrimaryCategory anchors: literal expectations for key combinations", () => {
  assert.equal(derivePrimaryCategory(analysis({ signalType: "technical" })).primary, "lift");
  assert.equal(derivePrimaryCategory(analysis({ signalType: "demand" })).primary, "need");
  assert.equal(derivePrimaryCategory(analysis({ signalType: "competitor" })).primary, "rival");
  assert.equal(derivePrimaryCategory(analysis({ signalType: "marketing" })).primary, "market");
  assert.equal(derivePrimaryCategory(analysis({ signalType: "learning" })).primary, "learn");
  for (const referenceType of REFERENCE_TYPES) {
    assert.deepEqual(
      derivePrimaryCategory(analysis({ signalType: "noise", referenceType })),
      { primary: null, secondary: [] },
      `noise ignores inconsistent referenceType=${referenceType}`
    );
  }
  // technical (lift) + market_language (market) → primary lift, market a secondary
  const both = derivePrimaryCategory(analysis({ signalType: "technical", referenceType: "market_language" }));
  assert.deepEqual(both, { primary: "lift", secondary: ["market"] });
});

/* ── hero precedence (locked): resource > tally > quote > editorial ── */
test("resolveProductHero: URL must be verbatim in a captured span, not a model field", () => {
  const r = resolveProductHero(input({
    analysis: analysis({ referenceLabel: "see example.com for details" }),
    capturedSpans: [{ ref: ROOT_SPAN_REF, text: "作者只談了介面節制，沒有附任何連結。" }],
    citations: []
  }));
  assert.equal(r.heroKind, "editorial");
  assert.equal(r.heroPayload, null);
});

test("resolveProductHero: root-post URL yields resource with the explicit root ref, never null", () => {
  const r = resolveProductHero(input({
    capturedSpans: [{ ref: ROOT_SPAN_REF, text: "整理在 github.com/Subhan-code/Amicro 這個 repo" }]
  }));
  assert.equal(r.heroKind, "resource");
  assert.equal((r.heroPayload as any).sourceRef, ROOT_SPAN_REF);
  assert.notEqual((r.heroPayload as any).sourceRef, null);
  assert.equal((r.heroPayload as any).verification, "captured");
  assert.match((r.heroPayload as any).url, /github\.com\/Subhan-code\/Amicro/);
});

test("resolveProductHero: reply-span URL carries that reply's ref", () => {
  const r = resolveProductHero(input({
    capturedSpans: [
      { ref: ROOT_SPAN_REF, text: "沒有連結的主文" },
      { ref: "e3", text: "我用的是 github.com/x/y" }
    ]
  }));
  assert.equal(r.heroKind, "resource");
  assert.equal((r.heroPayload as any).sourceRef, "e3");
});

test("resolveProductHero: resource outranks a valid quote", () => {
  const r = resolveProductHero(input({
    capturedSpans: [{ ref: ROOT_SPAN_REF, text: "code at github.com/x/y" }],
    citations: [{ ref: "e1", text: "some real reply" }]
  }));
  assert.equal(r.heroKind, "resource");
});

test("resolveProductHero: quote must use captured entry text, never a model summary", () => {
  const r = resolveProductHero(input({ citations: [{ ref: "e1", text: "" }] }));
  assert.equal(r.heroKind, "editorial");
});

test("resolveProductHero: real captured reply text qualifies as quote with its ref", () => {
  const r = resolveProductHero(input({ citations: [{ ref: "e5", text: "  最接近的是 VueUse Motion  ", author: "@meta" }] }));
  assert.equal(r.heroKind, "quote");
  assert.deepEqual(r.heroPayload, { text: "最接近的是 VueUse Motion", ref: "e5", author: "@meta" });
});

test("resolveProductHero: hardened tally gate — traceable counts, union===attributed, attributed<=total", () => {
  // Citations alone are insufficient: tally refs must resolve to captured reply text.
  const cites = ["e1", "e2", "e3", "e4", "e5"].map((ref) => ({ ref, text: "" }));
  const capturedReplies = ["e1", "e2", "e3", "e4", "e5"].map((ref) => ({ ref, text: `captured reply ${ref}` }));
  const valid = {
    total: 23, attributed: 5, rows: [
      { label: "Cursor", count: 2, refs: ["e1", "e2"] },
      { label: "Claude Code", count: 2, refs: ["e3", "e4"] },
      { label: "v0", count: 1, refs: ["e5"] }
    ]
  };
  assert.equal(resolveProductHero(input({ citations: cites, capturedSpans: capturedReplies, tally: valid })).heroKind, "tally");
  // a valid tally outranks a single reply quote (survey posts always have replies)
  assert.equal(resolveProductHero(input({
    citations: ["e1", "e2", "e3", "e4", "e5"].map((ref) => ({ ref, text: "some reply " + ref })),
    capturedSpans: capturedReplies,
    tally: valid
  })).heroKind, "tally");

  const bad = (rows: any, over: any = {}) => resolveProductHero(input({
    citations: cites,
    capturedSpans: capturedReplies,
    tally: { total: 23, attributed: 5, rows, ...over }
  })).heroKind;
  // count !== unique(refs).size
  assert.equal(bad([{ label: "Cursor", count: 7, refs: ["e1"] }, { label: "Claude Code", count: 2, refs: ["e3", "e4"] }, { label: "v0", count: 1, refs: ["e5"] }]), "editorial");
  // duplicate refs within a row
  assert.equal(bad([{ label: "Cursor", count: 2, refs: ["e1", "e1"] }, { label: "Claude Code", count: 2, refs: ["e3", "e4"] }, { label: "v0", count: 1, refs: ["e5"] }]), "editorial");
  // empty label
  assert.equal(bad([{ label: "  ", count: 2, refs: ["e1", "e2"] }, { label: "Claude Code", count: 2, refs: ["e3", "e4"] }, { label: "v0", count: 1, refs: ["e5"] }]), "editorial");
  // non-integer count
  assert.equal(bad([{ label: "Cursor", count: 2.5, refs: ["e1", "e2"] }, { label: "Claude Code", count: 2, refs: ["e3", "e4"] }, { label: "v0", count: 1, refs: ["e5"] }]), "editorial");
  // union(refs) !== attributed (union is 5, attributed claims 4)
  assert.equal(bad(valid.rows, { attributed: 4 }), "editorial");
  // attributed > total
  assert.equal(bad(valid.rows, { total: 4 }), "editorial");
  // fewer than 3 rows
  assert.equal(bad([{ label: "Cursor", count: 2, refs: ["e1", "e2"] }, { label: "v0", count: 1, refs: ["e5"] }]), "editorial");
  // ref does not resolve to a captured reply
  assert.equal(bad([{ label: "Cursor", count: 1, refs: ["e9_missing"] }, { label: "Claude Code", count: 2, refs: ["e3", "e4"] }, { label: "v0", count: 1, refs: ["e5"] }]), "editorial");
});

test("resolveProductHero: tally refs require non-root captured reply spans with non-empty refs and text", () => {
  const tally = {
    total: 3, attributed: 3, rows: [
      { label: "A", count: 1, refs: ["e1"] },
      { label: "B", count: 1, refs: ["e2"] },
      { label: "C", count: 1, refs: ["e3"] }
    ]
  };
  const syntheticCitation = input({
    citations: ["e1", "e2", "e3"].map((ref) => ({ ref, text: "citation-only" })),
    capturedSpans: [
      { ref: "e1", text: "captured e1" },
      { ref: "e2", text: "captured e2" }
    ],
    tally
  });
  assert.equal(resolveProductHero(syntheticCitation).heroKind, "quote");

  const rootOnly = input({
    capturedSpans: [
      { ref: ROOT_SPAN_REF, text: "root cannot back a reply tally" },
      { ref: "e2", text: "captured e2" },
      { ref: "e3", text: "captured e3" }
    ],
    tally: { ...tally, rows: [{ label: "A", count: 1, refs: [ROOT_SPAN_REF] }, ...tally.rows.slice(1)] }
  });
  assert.equal(resolveProductHero(rootOnly).heroKind, "editorial");

  const blankReply = input({
    capturedSpans: [
      { ref: "e1", text: "captured e1" },
      { ref: "e2", text: "   " },
      { ref: "e3", text: "captured e3" }
    ],
    tally
  });
  assert.equal(resolveProductHero(blankReply).heroKind, "editorial");

  const blankRef = input({
    capturedSpans: [
      { ref: "e1", text: "captured e1" },
      { ref: " ", text: "captured e2" },
      { ref: "e3", text: "captured e3" }
    ],
    tally
  });
  assert.equal(resolveProductHero(blankRef).heroKind, "editorial");
});

test("extractCapturedUrl / findCapturedUrl find real domains, ignore prose without a TLD", () => {
  assert.match(extractCapturedUrl("看 https://github.com/a/b 這個") ?? "", /github\.com\/a\/b/);
  assert.match(extractCapturedUrl("試 npmjs.com/package/foo") ?? "", /npmjs\.com\/package\/foo/);
  assert.equal(extractCapturedUrl("這只是一句話，沒有連結。"), null);
  assert.equal(extractCapturedUrl("e.g. 之類 vs. 對照"), null);
  assert.equal(findCapturedUrl([{ ref: ROOT_SPAN_REF, text: "沒連結" }, { ref: "e1", text: "有 github.com/z" }])?.sourceRef, "e1");
  assert.equal(findCapturedUrl([{ ref: ROOT_SPAN_REF, text: "沒連結" }]), null);
});

test("extractCapturedUrl keeps Chinese sentence punctuation and closing quotes outside the captured URL", () => {
  assert.equal(extractCapturedUrl("參考 https://example.com/中文路徑。"), "https://example.com/中文路徑");
  assert.equal(extractCapturedUrl("參考 https://example.com/docs!"), "https://example.com/docs");
  assert.equal(extractCapturedUrl("他說「https://example.com/guide」"), "https://example.com/guide");
  assert.deepEqual(
    findCapturedUrl([{ ref: "e7", text: "詳細說明：https://example.com/guide。」" }]),
    { url: "https://example.com/guide", sourceRef: "e7" }
  );
});

test("findCapturedUrl skips URL spans without a resolvable source ref", () => {
  assert.deepEqual(
    findCapturedUrl([
      { ref: "  ", text: "先出現 https://example.com/unresolvable" },
      { ref: "e8", text: "後面是 https://example.com/resolvable" }
    ]),
    { url: "https://example.com/resolvable", sourceRef: "e8" }
  );
});

/* ── density (composite membership) + eligibility ── */
test("density is compact for park/insufficient, and always compact for noise", () => {
  assert.equal(deriveProductCardPresentation(input({ analysis: analysis({ verdict: "park" }) })).density, "compact");
  assert.equal(deriveProductCardPresentation(input({ analysis: analysis({ verdict: "insufficient_data" }) })).density, "compact");
  assert.equal(deriveProductCardPresentation(input({ analysis: analysis({ verdict: "try" }) })).density, "full");
  assert.equal(deriveProductCardPresentation(input({ analysis: analysis({ verdict: "watch" }) })).density, "full");
  // noise is compact even with an inconsistent try verdict (composite bucket membership)
  assert.equal(deriveProductCardPresentation(input({ analysis: analysis({ signalType: "noise", verdict: "try" }) })).density, "compact");
});

test("briefEligible only for try/watch non-noise; agentBriefReady needs a real taskPrompt", () => {
  assert.equal(deriveProductCardPresentation(input({ analysis: analysis({ verdict: "try" }) })).briefEligible, true);
  assert.equal(deriveProductCardPresentation(input({ analysis: analysis({ verdict: "watch" }) })).briefEligible, true);
  assert.equal(deriveProductCardPresentation(input({ analysis: analysis({ verdict: "park" }) })).briefEligible, false);
  assert.equal(deriveProductCardPresentation(input({ analysis: analysis({ verdict: "try", signalType: "noise" }) })).briefEligible, false);

  assert.equal(deriveProductCardPresentation(input()).agentBriefReady, false);
  assert.equal(deriveProductCardPresentation(input({
    analysis: analysis({ agentTaskSpec: { targetAgent: "codex", taskPrompt: "do it", requiredContext: [] } })
  })).agentBriefReady, true);
  assert.equal(deriveProductCardPresentation(input({
    analysis: analysis({ agentTaskSpec: { targetAgent: "codex", taskPrompt: "   ", requiredContext: [] } })
  })).agentBriefReady, false);
});

/* ── W1.1: evidence-grounded recommendations ── */
test("deriveProductCardRecommendations keeps only captured text-grounded reusable patterns after the experiment", () => {
  const result = deriveProductCardRecommendations(input({
    analysis: analysis({
      experimentHint: "  先用一張卡測試聚焦層級。  ",
      evidenceNotes: [
        {
          ref: "e1",
          quoteSummary: "不應成為建議",
          whyItMatters: "不應成為建議",
          grounding: "text_grounded",
          reusablePattern: "  聚焦主要操作  ",
          whyItWorks: "不應成為建議"
        },
        {
          ref: "e2",
          quoteSummary: "不應成為建議",
          whyItMatters: "不應成為建議",
          grounding: "model_inferred",
          reusablePattern: "模型推論模式",
          whyItWorks: "不應成為建議"
        },
        {
          ref: "e3_missing",
          quoteSummary: "不應成為建議",
          whyItMatters: "不應成為建議",
          grounding: "text_grounded",
          reusablePattern: "缺失引用模式",
          whyItWorks: "不應成為建議"
        }
      ]
    }),
    capturedSpans: [{ ref: "e1", text: "作者明確描述如何聚焦主要操作。" }]
  }));

  assert.deepEqual(result, [
    { kind: "experiment", text: "先用一張卡測試聚焦層級。", support: "analysis", sourceRef: null },
    { kind: "pattern", text: "聚焦主要操作", support: "text_grounded", sourceRef: "e1" }
  ]);
});

test("deriveProductCardRecommendations returns none for compact and noise cards", () => {
  const usable = {
    experimentHint: "先試一個小改動",
    evidenceNotes: [{
      ref: "e1",
      quoteSummary: "不應成為建議",
      whyItMatters: "不應成為建議",
      grounding: "text_grounded" as const,
      reusablePattern: "可借用模式",
      whyItWorks: "不應成為建議"
    }]
  };
  const capturedSpans = [{ ref: "e1", text: "可驗證的原文" }];

  assert.deepEqual(
    deriveProductCardRecommendations(input({ analysis: analysis({ ...usable, verdict: "park" }), capturedSpans })),
    []
  );
  assert.deepEqual(
    deriveProductCardRecommendations(input({ analysis: analysis({ ...usable, signalType: "noise" }), capturedSpans })),
    []
  );
});

test("deriveProductCardRecommendations deduplicates normalized text and caps the output at three", () => {
  const result = deriveProductCardRecommendations(input({
    analysis: analysis({
      experimentHint: "  聚焦主要操作  ",
      evidenceNotes: [
        {
          ref: "e1", quoteSummary: "不應成為建議", whyItMatters: "不應成為建議",
          grounding: "text_grounded", reusablePattern: "聚焦主要操作", whyItWorks: "不應成為建議"
        },
        {
          ref: "e2", quoteSummary: "不應成為建議", whyItMatters: "不應成為建議",
          grounding: "text_grounded", reusablePattern: "  分段顯示關鍵狀態  ", whyItWorks: "不應成為建議"
        },
        {
          ref: "e3", quoteSummary: "不應成為建議", whyItMatters: "不應成為建議",
          grounding: "text_grounded", reusablePattern: "用來源證據校驗建議", whyItWorks: "不應成為建議"
        },
        {
          ref: "e4", quoteSummary: "不應成為建議", whyItMatters: "不應成為建議",
          grounding: "text_grounded", reusablePattern: "第四個不得超過上限", whyItWorks: "不應成為建議"
        }
      ]
    }),
    capturedSpans: [
      { ref: "e1", text: "captured e1" },
      { ref: "e2", text: "captured e2" },
      { ref: "e3", text: "captured e3" },
      { ref: "e4", text: "captured e4" }
    ]
  }));

  assert.deepEqual(result, [
    { kind: "experiment", text: "聚焦主要操作", support: "analysis", sourceRef: null },
    { kind: "pattern", text: "分段顯示關鍵狀態", support: "text_grounded", sourceRef: "e2" },
    { kind: "pattern", text: "用來源證據校驗建議", support: "text_grounded", sourceRef: "e3" }
  ]);
});

test("deriveProductCardRecommendations keeps at most two patterns without an experiment", () => {
  const result = deriveProductCardRecommendations(input({
    analysis: analysis({
      evidenceNotes: [
        { ref: "e1", quoteSummary: "x", whyItMatters: "x", grounding: "text_grounded", reusablePattern: "模式一", whyItWorks: "x" },
        { ref: "e2", quoteSummary: "x", whyItMatters: "x", grounding: "text_grounded", reusablePattern: "模式二", whyItWorks: "x" },
        { ref: "e3", quoteSummary: "x", whyItMatters: "x", grounding: "text_grounded", reusablePattern: "模式三", whyItWorks: "x" },
        { ref: "e4", quoteSummary: "x", whyItMatters: "x", grounding: "text_grounded", reusablePattern: "模式四", whyItWorks: "x" }
      ]
    }),
    capturedSpans: [
      { ref: "e1", text: "captured e1" },
      { ref: "e2", text: "captured e2" },
      { ref: "e3", text: "captured e3" },
      { ref: "e4", text: "captured e4" }
    ]
  }));

  assert.deepEqual(result, [
    { kind: "pattern", text: "模式一", support: "text_grounded", sourceRef: "e1" },
    { kind: "pattern", text: "模式二", support: "text_grounded", sourceRef: "e2" }
  ]);
});

/* ── W2.1: presentation-time application suggestion precedence ── */
test("valid application suggestions replace generic rows, keep all refs, and do not ready an Agent brief", () => {
  const result = deriveProductCardPresentation(input({
    analysis: analysis({
      experimentHint: "這個 generic experiment 不應與 application 並列。",
      evidenceRefs: ["e1", "e2", "e3"],
      evidenceNotes: [
        { ref: "e1", quoteSummary: "x", whyItMatters: "x", grounding: "text_grounded", reusablePattern: "generic pattern", whyItWorks: "x" },
        { ref: "e2", quoteSummary: "x", whyItMatters: "x", grounding: "text_grounded" },
        { ref: "e3", quoteSummary: "x", whyItMatters: "x", grounding: "text_grounded" }
      ],
      applicationSuggestions: [
        {
          sourcePattern: "把證據卡的來源狀態直接放進操作卡",
          fitReason: "可能降低核心流程的來源誤讀",
          smallTest: "在 Product Action 加一個來源狀態檢查",
          productContextTarget: "coreWorkflows",
          supportRefs: ["e1", "e2"],
          verificationQuestion: "小型可用性測試是否降低來源誤讀？"
        },
        {
          sourcePattern: "這一則因任一 ref 無法解析而整則丟棄",
          fitReason: "可能無效",
          smallTest: "不應顯示",
          productContextTarget: "evaluationCriteria",
          supportRefs: ["e2", "e3"],
          verificationQuestion: "e3 是否仍有目前捕捉文字？"
        }
      ]
    }),
    capturedSpans: [
      { ref: "e1", text: "第一段目前捕捉文字" },
      { ref: "e2", text: "第二段目前捕捉文字" }
    ]
  }));

  assert.deepEqual(result.recommendations, [{
    kind: "application",
    support: "text_grounded",
    text: "在 Product Action 加一個來源狀態檢查",
    sourcePattern: "把證據卡的來源狀態直接放進操作卡",
    fitReason: "可能降低核心流程的來源誤讀",
    smallTest: "在 Product Action 加一個來源狀態檢查",
    sourceRefs: ["e1", "e2"],
    productContextTarget: "coreWorkflows",
    verificationQuestion: "小型可用性測試是否降低來源誤讀？"
  }]);
  assert.equal(result.agentBriefReady, false);
});

test("application suggestion presentation gate rejects malformed refs and fields independently", () => {
  const base = {
    sourcePattern: "有效的來源做法",
    fitReason: "可能適合目前能力",
    smallTest: "在既有能力上做一次 bounded 小試",
    productContextTarget: "currentCapabilities",
    supportRefs: ["e1"],
    verificationQuestion: "目前能力是否能完成這個 bounded experiment？"
  };
  const malformed = [
    { ...base, sourcePattern: "   " },
    { ...base, fitReason: "   " },
    { ...base, smallTest: "   " },
    { ...base, productContextTarget: "technicalLearning" },
    { ...base, supportRefs: [] },
    { ...base, supportRefs: ["e1", "e1"] },
    { ...base, supportRefs: ["e1", "e2", "e3", "e4"] },
    { ...base, supportRefs: ["e_missing"] },
    { ...base, supportRefs: ["e2"] },
    { ...base, verificationQuestion: "   " }
  ];

  const result = deriveProductCardRecommendations(input({
    analysis: analysis({
      evidenceRefs: ["e1", "e2", "e3", "e4"],
      evidenceNotes: [
        { ref: "e1", quoteSummary: "x", whyItMatters: "x", grounding: "text_grounded" },
        { ref: "e2", quoteSummary: "x", whyItMatters: "x", grounding: "model_inferred" },
        { ref: "e3", quoteSummary: "x", whyItMatters: "x", grounding: "text_grounded" },
        { ref: "e4", quoteSummary: "x", whyItMatters: "x", grounding: "text_grounded" }
      ],
      applicationSuggestions: malformed as ProductSignalAnalysis["applicationSuggestions"],
      experimentHint: "所有 application 失敗時要完整保留 fallback。"
    }),
    capturedSpans: [
      { ref: "e1", text: "captured e1" },
      { ref: "e2", text: "captured e2" },
      { ref: "e3", text: "captured e3" },
      { ref: "e4", text: "captured e4" }
    ]
  }));

  assert.deepEqual(result, [{
    kind: "experiment",
    text: "所有 application 失敗時要完整保留 fallback。",
    support: "analysis",
    sourceRef: null
  }]);
});

/* ── Task 1: recommendation strength tier ── */
test("application rows produce an application recommendation tier", () => {
  const result = deriveProductCardPresentation({
    analysis: analysis({
      verdict: "try",
      evidenceRefs: ["e1"],
      evidenceNotes: [{
        ref: "e1",
        quoteSummary: "來源指出先預覽再確認",
        whyItMatters: "支持一個可測流程",
        grounding: "text_grounded"
      }],
      applicationSuggestions: [{
        sourcePattern: "先展示可檢查結果，再要求採用",
        fitReason: "可能提高核心流程的首次完成率",
        smallTest: "先在一個入口測試預覽後確認",
        productContextTarget: "coreWorkflows",
        supportRefs: ["e1"],
        verificationQuestion: "首次完成率是否提高？"
      }]
    }),
    citations: [{ ref: "e1", text: "先預覽，再確認。" }],
    capturedSpans: [{ ref: "e1", text: "先預覽，再確認。" }]
  });

  assert.equal(result.recommendationTier, "application");
});

test("experiment and pattern fallback rows produce an inspiration tier", () => {
  const result = deriveProductCardPresentation({
    analysis: analysis({ verdict: "watch", experimentHint: "先做一個小測試" }),
    citations: [],
    capturedSpans: []
  });

  assert.equal(result.recommendationTier, "inspiration");
});

test("no recommendation rows produce a none tier", () => {
  const result = deriveProductCardPresentation({
    analysis: analysis({ verdict: "watch", experimentHint: "" }),
    citations: [],
    capturedSpans: []
  });

  assert.equal(result.recommendationTier, "none");
});

test("an application grounded on the root span is kept with the root ref", () => {
  const result = deriveProductCardRecommendations(input({
    analysis: analysis({
      verdict: "try",
      evidenceRefs: [ROOT_SPAN_REF],
      evidenceNotes: [{
        ref: ROOT_SPAN_REF,
        quoteSummary: "主文說先展示再要求採用",
        whyItMatters: "支持一個以主文文字為根據的可測流程",
        grounding: "text_grounded"
      }],
      applicationSuggestions: [{
        sourcePattern: "先展示可檢查結果，再要求採用",
        fitReason: "可能降低核心流程的首次決策負擔",
        smallTest: "只在一個入口測試先預覽後確認",
        productContextTarget: "coreWorkflows",
        supportRefs: [ROOT_SPAN_REF],
        verificationQuestion: "首次完成率是否提高？"
      }]
    }),
    capturedSpans: [{ ref: ROOT_SPAN_REF, text: "主文：先展示可檢查結果，再要求採用。" }]
  }));

  assert.equal(result.length, 1);
  assert.equal(result[0]?.kind, "application");
  assert.deepEqual((result[0] as { sourceRefs: string[] }).sourceRefs, [ROOT_SPAN_REF]);
});

test("application suggestions require a full non-noise try analysis", () => {
  const applicationSuggestions = [{
    sourcePattern: "只允許 try 卡顯示的來源做法",
    fitReason: "可能符合評估標準",
    smallTest: "在評估標準上做一次 bounded check",
    productContextTarget: "evaluationCriteria" as const,
    supportRefs: ["e1"],
    verificationQuestion: "這個提案能否通過一個 bounded check？"
  }];
  const evidenceNotes = [{ ref: "e1", quoteSummary: "x", whyItMatters: "x", grounding: "text_grounded" as const }];
  const capturedSpans = [{ ref: "e1", text: "captured e1" }];

  assert.deepEqual(
    deriveProductCardRecommendations(input({
      analysis: analysis({ verdict: "watch", evidenceRefs: ["e1"], evidenceNotes, applicationSuggestions, experimentHint: "watch fallback" }),
      capturedSpans
    })),
    [{ kind: "experiment", text: "watch fallback", support: "analysis", sourceRef: null }]
  );
  assert.deepEqual(
    deriveProductCardRecommendations(input({
      analysis: analysis({ verdict: "try", signalType: "noise", evidenceRefs: ["e1"], evidenceNotes, applicationSuggestions }),
      capturedSpans
    })),
    []
  );
});
