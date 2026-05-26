import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPrEvidenceCsv,
  buildPrEvidenceCsvRows,
  buildPrSummaryFacts,
  buildDeterministicPrSummary,
  buildPrCriteriaSuggestionPrompt,
  buildDeterministicPrCriteria,
  buildDeterministicPrCriteriaMatches,
  extractPrCoreMessages,
  inferPrViewsFromText,
  isDefaultPrCriteria,
  mergePrCriteriaMatches,
  normalizePrCriteriaSuggestionResponse,
  parsePrCriteriaMatchResponse,
  validatePrSummaryDraft
} from "../src/compare/pr-evidence.ts";
import type { PrCampaign, PrEvidenceRow } from "../src/state/pr-evidence-storage.ts";

const campaign: PrCampaign = {
  id: "campaign-1",
  sessionId: "session-1",
  name: "Mannings BoostUP",
  briefText: "Wellness event campaign",
  criteria: [
    { id: "c1", label: "Brand named" },
    { id: "c2", label: "Event mentioned" },
    { id: "c3", label: "" },
    { id: "c4", label: "Offer details" },
    { id: "c5", label: "Wellness angle" },
    { id: "c6", label: "CTA included" }
  ],
  createdAt: "2026-05-06T10:00:00.000Z",
  updatedAt: "2026-05-06T10:00:00.000Z"
};

const rows: PrEvidenceRow[] = [
  {
    id: "row-1",
    campaignId: "campaign-1",
    itemId: "item-1",
    postUrl: "https://threads.net/post/1",
    authorHandle: "@kol_a",
    caption: "BoostUP event with wellness offers",
    metrics: { likes: 1200, comments: 38, reposts: 4, views: 9000, followers: 756 },
    expectedEngagement: "",
    criteriaMatches: { c1: true, c2: true, c3: false, c4: true, c5: true, c6: false },
    collectedAt: "2026-05-06T12:00:00.000Z",
    matchedAt: "2026-05-06T12:10:00.000Z"
  },
  {
    id: "row-2",
    campaignId: "campaign-1",
    itemId: "item-2",
    postUrl: "https://threads.net/post/2",
    authorHandle: "@media_b",
    caption: "Brand mention only",
    metrics: { likes: 320, comments: 12 },
    expectedEngagement: "",
    criteriaMatches: { c1: true, c2: false, c3: false, c4: false, c5: false, c6: false },
    collectedAt: "2026-05-06T12:05:00.000Z"
  }
];

test("normalizePrCriteriaSuggestionResponse returns exactly six short labels", () => {
  const criteria = normalizePrCriteriaSuggestionResponse(JSON.stringify({
    criteria: [
      { id: "c9", label: "Brand named" },
      { id: "c2", label: "Event mentioned" },
      { id: "c3", label: "" },
      { id: "c4", label: "Offer details" },
      { id: "c5", label: "Wellness angle" },
      { id: "c6", label: "CTA included" },
      { id: "c7", label: "Extra should be ignored" }
    ]
  }));

  assert.deepEqual(criteria.map((criterion) => criterion.id), ["c1", "c2", "c3", "c4", "c5", "c6"]);
  assert.deepEqual(criteria.map((criterion) => criterion.label), [
    "Brand named",
    "Event mentioned",
    "criterion_3",
    "Offer details",
    "Wellness angle",
    "CTA included"
  ]);
});

test("normalizePrCriteriaSuggestionResponse accepts string arrays and alternate label keys", () => {
  const stringCriteria = normalizePrCriteriaSuggestionResponse(JSON.stringify({
    criteria: [
      "Campaign named",
      "Wellness angle",
      "Experience proof",
      "Scale proof",
      "Expert advisor proof",
      "Ticket CTA"
    ]
  }));
  const keyedCriteria = normalizePrCriteriaSuggestionResponse(JSON.stringify({
    criteria: [
      { name: "Campaign named" },
      { criterion: "Wellness angle" },
      { message: "Experience proof" },
      { text: "Scale proof" },
      { label: "Expert advisor proof" },
      {}
    ]
  }));

  assert.deepEqual(stringCriteria.map((criterion) => criterion.label), [
    "Campaign named",
    "Wellness angle",
    "Experience proof",
    "Scale proof",
    "Expert advisor proof",
    "Ticket CTA"
  ]);
  assert.deepEqual(keyedCriteria.map((criterion) => criterion.label), [
    "Campaign named",
    "Wellness angle",
    "Experience proof",
    "Scale proof",
    "Expert advisor proof",
    "criterion_6"
  ]);
});

test("normalizePrCriteriaSuggestionResponse accepts fenced JSON, top-level arrays, and keyed objects", () => {
  const fencedCriteria = normalizePrCriteriaSuggestionResponse(`\`\`\`json
{"criteria":["Campaign named","Wellness angle","Experience proof","Scale proof","Expert advisor proof","Ticket CTA"]}
\`\`\``);
  const arrayCriteria = normalizePrCriteriaSuggestionResponse(JSON.stringify([
    "Campaign named",
    "Wellness angle",
    "Experience proof",
    "Scale proof",
    "Expert advisor proof",
    "Ticket CTA"
  ]));
  const keyedCriteria = normalizePrCriteriaSuggestionResponse(JSON.stringify({
    c1: "Campaign named",
    c2: "Wellness angle",
    c3: "Experience proof",
    c4: "Scale proof",
    c5: "Expert advisor proof",
    c6: "Ticket CTA"
  }));

  assert.equal(fencedCriteria[0]?.label, "Campaign named");
  assert.equal(arrayCriteria[2]?.label, "Experience proof");
  assert.equal(keyedCriteria[5]?.label, "Ticket CTA");
});

test("buildDeterministicPrCriteria produces campaign-specific labels instead of default placeholders", () => {
  const criteria = buildDeterministicPrCriteria(
    "cp260324",
    "萬寧 BoostUP 好狀態嘉年華以全方位 Wellness、健康檢測、沉浸式體驗、西九文化區 4 月 25 至 26 日、六大主題區及 40 場體驗為核心。"
  );

  assert.equal(isDefaultPrCriteria(normalizePrCriteriaSuggestionResponse("not json")), true);
  assert.equal(isDefaultPrCriteria(criteria), false);
  assert.ok(criteria.some((criterion) => criterion.label.includes("好狀態") || criterion.label.includes("wellness")));
  assert.ok(criteria.some((criterion) => criterion.label.includes("six zones") || criterion.label.includes("40+")));
});

test("parsePrCriteriaMatchResponse accepts known row ids and defaults missing rows to false", () => {
  const matches = parsePrCriteriaMatchResponse(
    JSON.stringify({
      rows: [
        { row_id: "row-1", matches: { c1: true, c2: false, c3: true, c4: false, c5: false, c6: true } },
        { row_id: "unknown", matches: { c1: true, c2: true, c3: true, c4: true, c5: true, c6: true } }
      ]
    }),
    ["row-1", "row-2"]
  );

  assert.deepEqual(matches.row1, undefined);
  assert.deepEqual(matches["row-1"], { c1: true, c2: false, c3: true, c4: false, c5: false, c6: true });
  assert.deepEqual(matches["row-2"], { c1: false, c2: false, c3: false, c4: false, c5: false, c6: false });
});

test("parsePrCriteriaMatchResponse accepts array matches, alternate row ids, and keyed row maps", () => {
  const arrayMatches = parsePrCriteriaMatchResponse(
    JSON.stringify([{ rowId: "row-1", matches: ["c1", "c3", "c6"] }]),
    ["row-1", "row-2"]
  );
  const keyedMatches = parsePrCriteriaMatchResponse(
    JSON.stringify({ "row-2": { c2: "✓", c4: "true" } }),
    ["row-1", "row-2"]
  );

  assert.deepEqual(arrayMatches["row-1"], { c1: true, c2: false, c3: true, c4: false, c5: false, c6: true });
  assert.deepEqual(keyedMatches["row-2"], { c1: false, c2: true, c3: false, c4: true, c5: false, c6: false });
});

test("buildDeterministicPrCriteriaMatches catches explicit campaign keywords as AI backstop", () => {
  const prCampaign: PrCampaign = {
    ...campaign,
    criteria: [
      { id: "c1", label: "萬寧 BoostUP 好狀態嘉年華" },
      { id: "c2", label: "ManningsBoostUP" },
      { id: "c3", label: "全方位健康好狀態" },
      { id: "c4", label: "西九文化區沉浸式體驗" },
      { id: "c5", label: "六大主題區與40+體驗" },
      { id: "c6", label: "門票公開發售" }
    ]
  };
  const prRows: PrEvidenceRow[] = [{
    ...rows[0]!,
    caption: "去咗萬寧 BoostUP 好狀態嘉年華，西九文化區有好多沉浸式體驗同六大主題區。"
  }];
  const fallback = buildDeterministicPrCriteriaMatches(prCampaign, prRows);
  const merged = mergePrCriteriaMatches(
    { [prRows[0]!.id]: { c1: false, c2: false, c3: false, c4: false, c5: false, c6: false } },
    fallback,
    [prRows[0]!.id]
  );

  assert.deepEqual(merged[prRows[0]!.id], { c1: true, c2: true, c3: true, c4: true, c5: true, c6: false });
});

test("buildPrEvidenceCsv exports UTF-8 BOM, label headers, fallback headers, and checkmark values", () => {
  const csv = buildPrEvidenceCsv(campaign, rows);
  const previewRows = buildPrEvidenceCsvRows(campaign, rows, 1);

  assert.ok(csv.startsWith("\uFEFF"));
  const [header, firstRow] = csv.replace(/^\uFEFF/, "").split("\n");
  assert.match(header!, /views,followers,expected_engagement/);
  assert.match(firstRow!, /9000,756,/);
  assert.match(header!, /Brand named,Event mentioned,criterion_3,Offer details/);
  assert.match(firstRow!, /✓,✓,,✓,✓,/);
  assert.match(firstRow!, /BoostUP event with wellness offers/);
  assert.equal(previewRows.length, 2);
  assert.equal(previewRows[0]?.join(","), header);
});

test("buildPrEvidenceCsvRows infers visible views from captions when stored metrics miss views", () => {
  const visibleViewsRows: PrEvidenceRow[] = [{
    ...rows[1]!,
    caption: "132 views seeor 今日嚟萬寧 BoostUP 好狀態嘉年華",
    metrics: { likes: 2, comments: 1 }
  }];
  const previewRows = buildPrEvidenceCsvRows(campaign, visibleViewsRows, 1);
  const facts = buildPrSummaryFacts(campaign, visibleViewsRows);

  assert.equal(inferPrViewsFromText("132 views seeor 今日嚟"), 132);
  assert.equal(inferPrViewsFromText("1.2萬瀏覽"), 12000);
  assert.equal(previewRows[1]?.[6], "132");
  assert.equal(facts.observed_metrics.views, 132);
  assert.equal(facts.observed_metrics.views_rows_observed, 1);
});

test("buildPrSummaryFacts aggregates only observed metrics and criteria matches", () => {
  const facts = buildPrSummaryFacts(campaign, rows);

  assert.equal(facts.total_rows, 2);
  assert.equal(facts.observed_metrics.likes, 1520);
  assert.equal(facts.observed_metrics.views, 9000);
  assert.equal(facts.observed_metrics.views_rows_observed, 1);
  assert.equal(facts.criteria[0]?.matched_rows, 2);
  assert.equal(facts.criteria[0]?.pull_through_rate, 1);
  assert.equal(facts.criteria[1]?.matched_rows, 1);
  assert.equal(facts.criteria[1]?.pull_through_rate, 0.5);
  assert.equal(facts.top_rows[0]?.author_handle, "@kol_a");
});

test("buildDeterministicPrSummary produces client-ready Markdown instead of raw caption dump", () => {
  const facts = buildPrSummaryFacts(campaign, [{
    ...rows[0]!,
    caption: "BoostUP event with wellness offers ".repeat(30)
  }, rows[1]!]);
  const summary = buildDeterministicPrSummary(facts);

  assert.match(summary, /^# Mannings BoostUP - PR Evidence Audit Summary/);
  assert.match(summary, /## Executive Read/);
  assert.match(summary, /## Message Pull-Through/);
  assert.match(summary, /\| Criterion \| Matched rows \| Pull-through \|/);
  assert.match(summary, /## Data Limits/);
  assert.ok(!summary.includes("BoostUP event with wellness offers ".repeat(20)));
});

test("validatePrSummaryDraft rejects invented reach, EAV, all-channel claims, and inflated numbers", () => {
  const facts = buildPrSummaryFacts(campaign, rows);

  assert.equal(validatePrSummaryDraft("Collected evidence shows 1,520 likes and views observed on 1 row.", facts), true);
  assert.equal(validatePrSummaryDraft("The campaign reached 500,000 people across all channels with HK$1M EAV.", facts), false);
  assert.equal(validatePrSummaryDraft("Collected evidence shows 99,999 likes.", facts), false);
});

test("extractPrCoreMessages detects campaign messages from a press release brief", () => {
  const messages = extractPrCoreMessages(`
    萬寧打造首個大型 Wellness 沉浸式快閃體驗
    「萬寧 BoostUP 好狀態嘉年華」4 月 25 至 26 日在西九文化區登場。
    #ManningsBoostUP #ReimagineWellnessTogether
    活動以重新定義 Wellness、全方位健康、免費健康檢測、六大主題區、超過 40 場體驗及社區連結為核心。
    門票現正發售。
  `);

  assert.ok(messages.some((message) => message.includes("萬寧 BoostUP 好狀態嘉年華")));
  assert.ok(messages.some((message) => message.includes("holistic good-state")));
  assert.ok(messages.some((message) => message.includes("six themed zones")));
  assert.ok(messages.some((message) => message.includes("ticketing")));
});

test("buildPrCriteriaSuggestionPrompt uses detected core messages to avoid generic criteria", () => {
  const prompt = buildPrCriteriaSuggestionPrompt(
    "Mannings BoostUP",
    "「萬寧 BoostUP 好狀態嘉年華」以重新定義 Wellness、六大主題區、超過 40 場體驗、免費健康檢測及門票發售為核心。"
  );

  assert.match(prompt, /Core PR messages detected from the brief/);
  assert.match(prompt, /Each label must be matchable/);
  assert.match(prompt, /Experience proof/);
  assert.match(prompt, /Scale proof/);
});

test("background routes PR advanced metrics through a dedicated action", async () => {
  const source = await readFile(new URL("../entrypoints/background.ts", import.meta.url), "utf8");

  assert.match(source, /case "pr\/fetch-advanced-metrics"/);
});
