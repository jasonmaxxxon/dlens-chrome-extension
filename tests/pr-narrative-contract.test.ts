import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrNarrativePostReadPrompt,
  buildPrNarrativeRepairPrompt,
  buildPrNarrativeSnapshot,
  buildPrNarrativeSynthesisPrompt,
  chunkPrNarrativeSources,
  collectPrNarrativePostReadingSoftFlags,
  collectPrNarrativeSynthesisSoftFlags,
  materializePrNarrativeRead,
  parsePrNarrativePostReadResponse,
  parsePrNarrativeStageWithRepair,
  parsePrNarrativeSynthesisResponse,
  PrNarrativeValidationError,
  type PrNarrativePostReading,
  type PrNarrativeSnapshot,
  type PrNarrativeSource
} from "../src/compare/pr-narrative.ts";
import { normalizePrCriteria, type PrCampaign, type PrEvidenceRow } from "../src/state/pr-evidence-storage.ts";
import type { SessionItem, SessionRecord } from "../src/state/types.ts";

const NOW = "2026-07-14T02:00:00.000Z";

const campaign: PrCampaign = {
  id: "campaign-1",
  sessionId: "session-1",
  name: "BoostUP Launch",
  briefText: "Make everyday wellness practical and social.",
  criteria: normalizePrCriteria([
    { id: "c1", label: "Campaign named" },
    { id: "c2", label: "Wellness proposition" },
    { id: "c3", label: "Social proof" },
    { id: "c4", label: "Experience proof" },
    { id: "c5", label: "Audience relevance" },
    { id: "c6", label: "Registration CTA" }
  ]),
  narrativeSettings: {
    narrativeAnchor: "Wellness can fit into everyday life",
    targetAudience: "Young working adults",
    desiredAction: "Register for the launch event"
  },
  createdAt: NOW,
  updatedAt: NOW
};

function makeRow(
  id: string,
  itemId: string,
  caption: string,
  collectedAt = NOW
): PrEvidenceRow {
  return {
    id,
    campaignId: campaign.id,
    itemId,
    postUrl: `https://www.threads.net/@author/post/${id}`,
    authorHandle: `@${id}`,
    caption,
    metrics: {},
    expectedEngagement: "",
    criteriaMatches: { c1: false, c2: false, c3: false, c4: false, c5: false, c6: false },
    collectedAt
  };
}

function makeItem(id: string, canonicalText: string, excludedReply = "excluded reply text"): SessionItem {
  return {
    id,
    descriptor: {
      target_type: "post",
      page_url: `https://www.threads.net/@author/post/${id}`,
      post_url: `https://www.threads.net/@author/post/${id}`,
      author_hint: `@${id}`,
      text_snippet: `descriptor ${id}`,
      time_token_hint: "1h",
      dom_anchor: id,
      engagement: { likes: null, comments: null, reposts: null, forwards: null, views: null },
      engagement_present: { likes: false, comments: false, reposts: false, forwards: false, views: false },
      captured_at: NOW
    },
    status: "succeeded",
    selectedAt: NOW,
    savedAt: NOW,
    queuedAt: NOW,
    completedAt: NOW,
    captureId: `capture-${id}`,
    jobId: `job-${id}`,
    canonicalTargetUrl: `https://www.threads.net/@author/post/${id}`,
    latestJob: null,
    latestCapture: {
      result: {
        canonical_post: { text: canonicalText },
        comments: [{ text: excludedReply }],
        threadReadModel: { assembledContent: `${canonicalText}\n${excludedReply}` }
      }
    } as SessionItem["latestCapture"],
    commentsPreview: [{ id: "reply-1", author: "reply", text: excludedReply, likes: null, timeToken: null }],
    lastStatusAt: NOW,
    lastErrorKind: null,
    lastError: null
  };
}

function makeSession(items: SessionItem[]): SessionRecord {
  return {
    id: campaign.sessionId,
    name: "PR campaign",
    mode: "pr-evidence",
    createdAt: NOW,
    updatedAt: NOW,
    items
  };
}

function makeReading(ref: string, alignmentScore = 0.5, actionabilityScore = 0.5): PrNarrativePostReading {
  return {
    ref,
    gist: `Gist ${ref}`,
    evidenceSummary: `Evidence ${ref}`,
    alignmentScore,
    actionabilityScore,
    claimSeeds: [`Seed ${ref}`],
    caveat: ""
  };
}

function rawReading(reading: PrNarrativePostReading): Record<string, unknown> {
  return { ...reading };
}

async function makeThreeSourceSnapshot(): Promise<PrNarrativeSnapshot> {
  const rows = [
    makeRow("row-1", "item-1", "one", "2026-07-14T00:01:00.000Z"),
    makeRow("row-2", "item-2", "two", "2026-07-14T00:02:00.000Z"),
    makeRow("row-3", "item-3", "three", "2026-07-14T00:03:00.000Z")
  ];
  return buildPrNarrativeSnapshot({
    campaign,
    rows,
    session: makeSession([
      makeItem("item-1", "Canonical one"),
      makeItem("item-2", "Canonical two"),
      makeItem("item-3", "Canonical three")
    ])
  });
}

test("snapshot reads only collected campaign rows and canonical main-post text", async () => {
  const rows = [
    makeRow("row-2", "item-2", "Snippet fallback", "2026-07-14T00:02:00.000Z"),
    makeRow("row-1", "item-1", "Old snippet", "2026-07-14T00:01:00.000Z")
  ];
  const snapshot = await buildPrNarrativeSnapshot({
    campaign,
    rows,
    session: makeSession([
      makeItem("item-1", "Canonical main post"),
      makeItem("item-2", ""),
      makeItem("not-collected", "Unrelated folder post")
    ])
  });

  assert.deepEqual(snapshot.sources.map((source) => source.rowId), ["row-1", "row-2"]);
  assert.equal(snapshot.sources[0]?.text, "Canonical main post");
  assert.equal(snapshot.sources[0]?.textQuality, "canonical");
  assert.equal(snapshot.sources[1]?.text, "Snippet fallback");
  assert.equal(snapshot.sources[1]?.textQuality, "snippet");
  assert.equal(snapshot.sources.some((source) => source.text.includes("excluded reply")), false);
  assert.equal(snapshot.sources.some((source) => source.text.includes("Unrelated folder post")), false);
  assert.equal(snapshot.collectedRowCount, 2);
  assert.equal(snapshot.snippetFallbackCount, 1);
});

test("snapshot hash tracks unreadable campaign inventory without promoting it to a source", async () => {
  const readableRow = makeRow("row-readable", "item-readable", "fallback");
  const readableItem = makeItem("item-readable", "Readable");
  const readableOnly = await buildPrNarrativeSnapshot({
    campaign,
    rows: [readableRow],
    session: makeSession([readableItem])
  });
  const withUnreadable = await buildPrNarrativeSnapshot({
    campaign,
    rows: [readableRow, makeRow("row-empty", "item-empty", "   ")],
    session: makeSession([readableItem, makeItem("item-empty", "")])
  });

  assert.deepEqual(withUnreadable.sources.map((source) => source.rowId), ["row-readable"]);
  assert.equal(withUnreadable.collectedRowCount, 2);
  assert.notEqual(withUnreadable.sourceHash, readableOnly.sourceHash);
});

test("snapshot hash is deterministic and changes with source or campaign definition", async () => {
  const rows = [makeRow("row-1", "item-1", "fallback")];
  const session = makeSession([makeItem("item-1", "Canonical")]);
  const first = await buildPrNarrativeSnapshot({ campaign, rows, session });
  const same = await buildPrNarrativeSnapshot({ campaign, rows: [...rows], session });
  const changedText = await buildPrNarrativeSnapshot({ campaign, rows, session: makeSession([makeItem("item-1", "Changed")]) });
  const changedDefinition = await buildPrNarrativeSnapshot({
    campaign: { ...campaign, narrativeSettings: { ...campaign.narrativeSettings!, desiredAction: "Share the campaign" } },
    rows,
    session
  });

  assert.equal(first.sourceHash, same.sourceHash);
  assert.notEqual(first.sourceHash, changedText.sourceHash);
  assert.notEqual(first.sourceHash, changedDefinition.sourceHash);
});

test("source chunking honors both row and character budgets", () => {
  const sources: PrNarrativeSource[] = ["P01", "P02", "P03"].map((ref, index) => ({
    ref,
    rowId: `row-${index + 1}`,
    itemId: `item-${index + 1}`,
    sourceUrl: `https://threads.net/${index + 1}`,
    authorHandle: `@${index + 1}`,
    text: index === 1 ? "12345678" : "1234",
    textQuality: "canonical"
  }));

  assert.deepEqual(chunkPrNarrativeSources(sources, { maxRows: 2, maxChars: 10 }).map((chunk) => chunk.map((source) => source.ref)), [
    ["P01"],
    ["P02"],
    ["P03"]
  ]);
  assert.deepEqual(chunkPrNarrativeSources(sources, { maxRows: 2, maxChars: 100 }).map((chunk) => chunk.map((source) => source.ref)), [
    ["P01", "P02"],
    ["P03"]
  ]);
});

test("Stage A prompt is current-only and includes only supplied source refs", async () => {
  const snapshot = await makeThreeSourceSnapshot();
  const prompt = buildPrNarrativePostReadPrompt(campaign, snapshot.sources.slice(0, 2));

  assert.match(prompt, /P01/);
  assert.match(prompt, /P02/);
  assert.doesNotMatch(prompt, /P03/);
  assert.match(prompt, /main posts only/i);
  assert.match(prompt, /do not.*count|no counts/i);
  assert.match(prompt, /do not.*delta|no temporal/i);
});

test("Stage A parser accepts every expected ref exactly once", () => {
  const parsed = parsePrNarrativePostReadResponse(JSON.stringify({
    readings: [rawReading(makeReading("P01")), rawReading(makeReading("P02", -0.4, 0.9))]
  }), ["P01", "P02"]);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[1]?.alignmentScore, -0.4);
});

test("Stage A parser rejects duplicate, missing, unknown, and out-of-range refs", () => {
  assert.throws(() => parsePrNarrativePostReadResponse(JSON.stringify({
    readings: [rawReading(makeReading("P01")), rawReading(makeReading("P01"))]
  }), ["P01", "P02"]), /duplicate/i);
  assert.throws(() => parsePrNarrativePostReadResponse(JSON.stringify({
    readings: [rawReading(makeReading("P01"))]
  }), ["P01", "P02"]), /missing/i);
  assert.throws(() => parsePrNarrativePostReadResponse(JSON.stringify({
    readings: [rawReading(makeReading("P01")), rawReading(makeReading("P99"))]
  }), ["P01", "P02"]), /unknown/i);
  assert.throws(() => parsePrNarrativePostReadResponse(JSON.stringify({
    readings: [rawReading(makeReading("P01", 1.2, 0.2))]
  }), ["P01"]), /alignmentScore/i);
});

test("Stage A reading prose may cite only its own ref", () => {
  for (const invalidReading of [
    { ...rawReading(makeReading("P01")), gist: "Gist cites P02." },
    { ...rawReading(makeReading("P01")), evidenceSummary: "Evidence cites P99." },
    { ...rawReading(makeReading("P01")), claimSeeds: ["Seed cites P02."] },
    { ...rawReading(makeReading("P01")), caveat: "Caveat cites P99." }
  ]) {
    assert.throws(() => parsePrNarrativePostReadResponse(JSON.stringify({
      readings: [invalidReading, rawReading(makeReading("P02"))]
    }), ["P01", "P02"]), /P02|P99|unknown|own ref/i);
  }

  assert.doesNotThrow(() => parsePrNarrativePostReadResponse(JSON.stringify({
    readings: [
      { ...rawReading(makeReading("P01")), caveat: "P01 is the only evidence ref used here." },
      rawReading(makeReading("P02"))
    ]
  }), ["P01", "P02"]));
});

test("Stage A hard-rejects corpus-delta language and names the ref, sentence, and match", () => {
  for (const evidenceSummary of [
    "Support grew over time.",
    "The narrative shifted after the previous reading.",
    "Criticism is stronger than before.",
    "較上次閱讀質疑更多。"
  ]) {
    const reading = { ...rawReading(makeReading("P01")), evidenceSummary };
    assert.throws(() => parsePrNarrativePostReadResponse(
      JSON.stringify({ readings: [reading] }),
      ["P01"]
    ), (error: unknown) => {
      assert.ok(error instanceof PrNarrativeValidationError);
      assert.match(error.message, /temporal|delta/i);
      assert.match(error.message, /post reading P01/);
      assert.ok(error.message.includes(evidenceSummary.slice(0, 12)), `sentence missing from: ${error.message}`);
      return true;
    });
  }

  for (const evidenceSummary of [
    "Compared with competitors, the current offer is clearer.",
    "The post discusses a wellness trend without measuring change.",
    "A new post format makes the instructions easier to scan."
  ]) {
    const reading = { ...rawReading(makeReading("P01")), evidenceSummary };
    assert.doesNotThrow(() => parsePrNarrativePostReadResponse(
      JSON.stringify({ readings: [reading] }),
      ["P01"]
    ));
  }
});

test("Stage A soft-flags bare change verbs for semantic adjudication instead of hard-failing", () => {
  for (const evidenceSummary of [
    "Criticism declined recently.",
    "質疑聲音越來越多。",
    "支持明顯減少。"
  ]) {
    const reading = { ...rawReading(makeReading("P01")), evidenceSummary };
    const readings = parsePrNarrativePostReadResponse(
      JSON.stringify({ readings: [reading] }),
      ["P01"]
    );
    const flags = collectPrNarrativePostReadingSoftFlags(readings);
    assert.equal(flags.length, 1);
    assert.equal(flags[0]?.severity, "soft");
    assert.equal(flags[0]?.kind, "temporal");
    assert.match(flags[0]?.context ?? "", /post reading P01/);
    assert.ok(flags[0]?.sentence.includes(evidenceSummary.slice(0, 8)));
  }

  const clean = parsePrNarrativePostReadResponse(
    JSON.stringify({ readings: [rawReading(makeReading("P01"))] }),
    ["P01"]
  );
  assert.deepEqual(collectPrNarrativePostReadingSoftFlags(clean), []);
});

test("Stage A rejects aggregate/count/distribution prose and momentum delta", () => {
  for (const evidenceSummary of [
    "Three of five posts support the message.",
    "3/5 posts support the message.",
    "60% of posts support the message.",
    "The majority of posts support the message.",
    "A minority of posts challenges the message.",
    "Most posts support the message.",
    "Half of the posts support the message.",
    "Half the posts support the message.",
    "A third of the posts supports the message.",
    "One in three posts supports the message.",
    "Two-thirds of posts support the message.",
    "Three quarters of the posts support the message.",
    "五篇貼文中有三篇支持這個說法。",
    "3/5 篇貼文支持這個說法。",
    "60% 的貼文支持這個說法。",
    "三分之二的貼文支持這個說法。",
    "四分之三的貼文支持這個說法。",
    "約三成貼文支持這個說法。",
    "多數貼文支持這個說法。",
    "少數貼文提出質疑。",
    "Support is gaining momentum.",
    "Campaign momentum is building.",
    "支持聲勢正在升溫。"
  ]) {
    const reading = { ...rawReading(makeReading("P01")), evidenceSummary };
    assert.throws(() => parsePrNarrativePostReadResponse(
      JSON.stringify({ readings: [reading] }),
      ["P01"]
    ), /aggregate|count|distribution|temporal|delta/i);
  }
});

test("publication prose allows benign product numerals, ratios, and static momentum mentions", () => {
  const benignProse = [
    "The post describes Version 3 with two onboarding steps.",
    "The 24-hour battery is a concrete product benefit.",
    "The product uses a 2:1 compression ratio.",
    "Mix water and concentrate at a 3/5 ratio.",
    "A two-thirds size card fits the product layout.",
    "A third-size card fits the product layout.",
    "Momentum is the campaign slogan quoted by the post.",
    "這篇貼文介紹 3 個產品功能。",
    "產品版本 3 的設定步驟更清楚。",
    "產品包裝採用三分之二尺寸。",
    "產品包裝縮小約三成尺寸。",
    "配方比例是 3/5。"
  ];
  for (const evidenceSummary of benignProse) {
    const reading = { ...rawReading(makeReading("P01")), evidenceSummary };
    assert.doesNotThrow(() => parsePrNarrativePostReadResponse(
      JSON.stringify({ readings: [reading] }),
      ["P01"]
    ));
  }

  for (const statement of benignProse) {
    const synthesis = validSynthesisPayload();
    (synthesis.claims as Array<Record<string, unknown>>)[0]!.statement = statement;
    assert.doesNotThrow(() => parsePrNarrativeSynthesisResponse(JSON.stringify(synthesis), ["P01", "P02", "P03"]));
  }
});

function validSynthesisPayload(): Record<string, unknown> {
  return {
    status: "complete",
    priorityClaimId: "claim-1",
    claims: [
      {
        id: "claim-1",
        title: "Setup friction shapes the story",
        statement: "P01 and P02 describe setup friction.",
        implication: "Lead with a simpler onboarding proof.",
        supportRefs: ["P01", "P02"],
        counterRefs: ["P03"]
      },
      {
        id: "claim-2",
        title: "Practical examples remain useful",
        statement: "P03 provides a practical example.",
        implication: "Keep one concrete demonstration.",
        supportRefs: ["P03"],
        counterRefs: []
      }
    ]
  };
}

test("Stage B prompt forbids temporal claims, model counts, and forced counterexamples", () => {
  const prompt = buildPrNarrativeSynthesisPrompt(campaign, [makeReading("P01"), makeReading("P02")]);
  assert.match(prompt, /two to four|2-4/i);
  assert.match(prompt, /do not.*increase|no temporal/i);
  assert.match(prompt, /do not.*count|no counts/i);
  assert.match(prompt, /counter.*empty|do not force.*counter/i);
});

test("Stage B parser accepts optional counterexamples and explicit insufficient evidence", () => {
  const complete = parsePrNarrativeSynthesisResponse(JSON.stringify(validSynthesisPayload()), ["P01", "P02", "P03"]);
  const insufficient = parsePrNarrativeSynthesisResponse(JSON.stringify({
    status: "insufficient_evidence",
    priorityClaimId: null,
    claims: []
  }), ["P01"]);

  assert.deepEqual(complete.claims[1]?.counterRefs, []);
  assert.equal(insufficient.status, "insufficient_evidence");
  assert.deepEqual(insufficient.claims, []);
});

test("Stage B parser rejects unknown refs, overlap, multiple priority signals, counts, inline refs, and temporal delta", () => {
  const unknown = validSynthesisPayload();
  (unknown.claims as Array<Record<string, unknown>>)[0]!.supportRefs = ["P01", "P99"];
  assert.throws(() => parsePrNarrativeSynthesisResponse(JSON.stringify(unknown), ["P01", "P02", "P03"]), /unknown/i);

  const overlap = validSynthesisPayload();
  (overlap.claims as Array<Record<string, unknown>>)[0]!.counterRefs = ["P02"];
  assert.throws(() => parsePrNarrativeSynthesisResponse(JSON.stringify(overlap), ["P01", "P02", "P03"]), /overlap/i);

  const multiplePriority = validSynthesisPayload();
  (multiplePriority.claims as Array<Record<string, unknown>>)[0]!.primary = true;
  (multiplePriority.claims as Array<Record<string, unknown>>)[1]!.primary = true;
  assert.throws(() => parsePrNarrativeSynthesisResponse(JSON.stringify(multiplePriority), ["P01", "P02", "P03"]), /primary|unexpected/i);

  const count = validSynthesisPayload();
  (count.claims as Array<Record<string, unknown>>)[0]!.supportCount = 2;
  assert.throws(() => parsePrNarrativeSynthesisResponse(JSON.stringify(count), ["P01", "P02", "P03"]), /count|unexpected/i);

  const inlineUnknown = validSynthesisPayload();
  (inlineUnknown.claims as Array<Record<string, unknown>>)[0]!.implication = "Investigate P99.";
  assert.throws(() => parsePrNarrativeSynthesisResponse(JSON.stringify(inlineUnknown), ["P01", "P02", "P03"]), /P99|unknown/i);

  const temporal = validSynthesisPayload();
  (temporal.claims as Array<Record<string, unknown>>)[0]!.statement = "Criticism increased compared to the previous reading.";
  assert.throws(() => parsePrNarrativeSynthesisResponse(JSON.stringify(temporal), ["P01", "P02", "P03"]), (error: unknown) => {
    assert.ok(error instanceof PrNarrativeValidationError);
    assert.match(error.message, /temporal|delta/i);
    assert.match(error.message, /claim claim-1 \(refs P01, P02, P03\)/);
    assert.match(error.message, /Criticism increased compared to the previous reading/);
    return true;
  });
});

test("Stage B soft-flags bare change verbs for semantic adjudication instead of hard-failing", () => {
  const payload = validSynthesisPayload();
  (payload.claims as Array<Record<string, unknown>>)[0]!.statement = "Criticism increased over the last 12 days.";
  const draft = parsePrNarrativeSynthesisResponse(JSON.stringify(payload), ["P01", "P02", "P03"]);
  const flags = collectPrNarrativeSynthesisSoftFlags(draft);
  assert.equal(flags.length, 1);
  assert.equal(flags[0]?.severity, "soft");
  assert.match(flags[0]?.context ?? "", /claim claim-1/);
  assert.match(flags[0]?.sentence ?? "", /Criticism increased/);

  const clean = parsePrNarrativeSynthesisResponse(JSON.stringify(validSynthesisPayload()), ["P01", "P02", "P03"]);
  assert.deepEqual(collectPrNarrativeSynthesisSoftFlags(clean), []);
});

test("Stage B rejects aggregate/count/distribution prose and momentum delta", () => {
  for (const statement of [
    "Three of five posts support the message.",
    "3/5 posts support the message.",
    "60% of posts support the message.",
    "Most posts support the message.",
    "Half of the posts support the message.",
    "Half the posts support the message.",
    "A third of the posts supports the message.",
    "One in three posts supports the message.",
    "Two-thirds of posts support the message.",
    "Three quarters of the posts support the message.",
    "多數貼文支持這個說法。",
    "三分之二的貼文支持這個說法。",
    "約三成貼文支持這個說法。",
    "Support is gaining momentum."
  ]) {
    const payload = validSynthesisPayload();
    (payload.claims as Array<Record<string, unknown>>)[0]!.statement = statement;
    assert.throws(
      () => parsePrNarrativeSynthesisResponse(JSON.stringify(payload), ["P01", "P02", "P03"]),
      /aggregate|count|distribution|temporal|delta/i
    );
  }
});

test("materializer resolves durable row refs and derives compass axes from support scores", async () => {
  const snapshot = await makeThreeSourceSnapshot();
  const read = materializePrNarrativeRead({
    snapshot,
    postReadings: [
      makeReading("P01", -0.8, 0.9),
      makeReading("P02", -0.4, 0.7),
      makeReading("P03", 0.8, -0.7)
    ],
    synthesis: parsePrNarrativeSynthesisResponse(JSON.stringify(validSynthesisPayload()), ["P01", "P02", "P03"]),
    generatedAt: NOW,
    provider: "openai",
    model: "gpt-4.1-mini"
  });

  assert.equal(read.schemaVersion, 1);
  assert.deepEqual(read.sourceRowIds, ["row-1", "row-2", "row-3"]);
  assert.deepEqual(read.claims[0]?.supportRefs.map((ref) => ref.rowId), ["row-1", "row-2"]);
  assert.deepEqual(read.claims[0]?.counterRefs.map((ref) => ref.rowId), ["row-3"]);
  assert.equal(read.claims[0]?.supportRefs.length, 2);
  assert.equal(read.claims[0]?.counterRefs.length, 1);
  assert.equal(read.claims[0]?.alignment, "challenges");
  assert.equal(read.claims[0]?.mode, "actionable");
  assert.equal(read.priorityClaimId, "claim-1");
});

test("materializer revalidates unparsed readings and synthesis at the publication boundary", async () => {
  const snapshot = await makeThreeSourceSnapshot();
  const validReadings = [makeReading("P01"), makeReading("P02"), makeReading("P03")];
  const validSynthesis = parsePrNarrativeSynthesisResponse(
    JSON.stringify(validSynthesisPayload()),
    ["P01", "P02", "P03"]
  );
  const materialize = (postReadings: PrNarrativePostReading[], synthesis = validSynthesis) => materializePrNarrativeRead({
    snapshot,
    postReadings,
    synthesis,
    generatedAt: NOW,
    provider: "openai",
    model: "gpt-4.1-mini"
  });

  assert.throws(() => materialize([
    { ...makeReading("P01"), alignmentScore: 2 },
    makeReading("P02"),
    makeReading("P03")
  ]), /alignmentScore/i);

  assert.throws(() => materialize(validReadings, {
    status: "complete",
    priorityClaimId: "claim-1",
    claims: [{
      id: "claim-1",
      title: "Only one",
      statement: "P01 supports it.",
      implication: "Act on it.",
      supportRefs: ["P01"],
      counterRefs: []
    }]
  }), /two to four/i);

  assert.throws(() => materialize(validReadings, {
    ...validSynthesis,
    claims: validSynthesis.claims.map((claim, index) => index === 0
      ? { ...claim, statement: "Support is higher than before." }
      : claim)
  }), /temporal|delta/i);

  assert.throws(() => materialize([
    { ...makeReading("P01"), evidenceSummary: "A third of the posts supports the message." },
    makeReading("P02"),
    makeReading("P03")
  ]), /aggregate|count|distribution/i);

  assert.throws(() => materialize([
    { ...makeReading("P01"), caveat: "See P02 for the real evidence." },
    makeReading("P02"),
    makeReading("P03")
  ]), /P02|unknown|own ref/i);

  assert.throws(() => materialize(validReadings, {
    ...validSynthesis,
    claims: validSynthesis.claims.map((claim, index) => index === 0
      ? { ...claim, statement: "Support is gaining momentum." }
      : claim)
  }), /temporal|delta/i);

  assert.throws(() => materialize(validReadings, {
    ...validSynthesis,
    claims: validSynthesis.claims.map((claim, index) => index === 0
      ? { ...claim, counterRefs: [claim.supportRefs[0]!] }
      : claim)
  }), /overlap/i);
});

function stageARaw(evidenceSummary: string): string {
  return JSON.stringify({ readings: [{ ...rawReading(makeReading("P01")), evidenceSummary }] });
}

const parseStageA = (raw: string) => parsePrNarrativePostReadResponse(raw, ["P01"]);

test("repair prompt names each violation and restates the stage schema", () => {
  const prompt = buildPrNarrativeRepairPrompt({
    stage: "postRead",
    originalRaw: stageARaw("Support grew over time."),
    violations: [{
      context: "post reading P01",
      kind: "temporal",
      severity: "hard",
      sentence: "Support grew over time.",
      matched: "over time"
    }]
  });
  assert.match(prompt, /post reading P01/);
  assert.match(prompt, /Support grew over time\./);
  assert.match(prompt, /"readings"/);
  assert.match(prompt, /keep it as is/i);
});

test("semantic repair runs once on a hard violation and accepts the corrected output", async () => {
  const repairCalls: string[] = [];
  const outcome = await parsePrNarrativeStageWithRepair({
    raw: stageARaw("Support grew over time."),
    parse: parseStageA,
    collectSoftFlags: collectPrNarrativePostReadingSoftFlags,
    repair: async ({ violations }) => {
      repairCalls.push(violations[0]?.sentence ?? "");
      return stageARaw("Support is present in this post.");
    }
  });
  assert.equal(repairCalls.length, 1);
  assert.equal(repairCalls[0], "Support grew over time.");
  assert.equal(outcome.repaired, true);
  assert.equal(outcome.value[0]?.evidenceSummary, "Support is present in this post.");
  assert.equal(outcome.violationsBeforeRepair[0]?.severity, "hard");
});

test("semantic repair adjudicates soft flags: a kept sentence is accepted and reported", async () => {
  const original = stageARaw("作者提到最近三個月銷量增加。");
  const outcome = await parsePrNarrativeStageWithRepair({
    raw: original,
    parse: parseStageA,
    collectSoftFlags: collectPrNarrativePostReadingSoftFlags,
    repair: async () => original
  });
  assert.equal(outcome.repaired, true);
  assert.equal(outcome.keptSoftFlags.length, 1);
  assert.equal(outcome.keptSoftFlags[0]?.severity, "soft");
});

test("clean output triggers no repair call", async () => {
  let repairCalls = 0;
  const outcome = await parsePrNarrativeStageWithRepair({
    raw: stageARaw("The post states a clear registration ask."),
    parse: parseStageA,
    collectSoftFlags: collectPrNarrativePostReadingSoftFlags,
    repair: async () => {
      repairCalls += 1;
      return "";
    }
  });
  assert.equal(repairCalls, 0);
  assert.equal(outcome.repaired, false);
});

test("output that stays hard-invalid after repair fails with the precise sentence", async () => {
  await assert.rejects(parsePrNarrativeStageWithRepair({
    raw: stageARaw("Support grew over time."),
    parse: parseStageA,
    collectSoftFlags: collectPrNarrativePostReadingSoftFlags,
    repair: async () => stageARaw("Criticism is weaker than before.")
  }), (error: unknown) => {
    assert.ok(error instanceof PrNarrativeValidationError);
    assert.match(error.message, /post reading P01/);
    assert.match(error.message, /Criticism is weaker than before/);
    return true;
  });
});

test("a failed repair generation surfaces the original violations", async () => {
  await assert.rejects(parsePrNarrativeStageWithRepair({
    raw: stageARaw("Support grew over time."),
    parse: parseStageA,
    collectSoftFlags: collectPrNarrativePostReadingSoftFlags,
    repair: async () => {
      throw new Error("provider unavailable");
    }
  }), (error: unknown) => {
    assert.ok(error instanceof PrNarrativeValidationError);
    assert.match(error.message, /Support grew over time/);
    assert.match(error.message, /semantic repair attempt failed: provider unavailable/);
    return true;
  });
});
