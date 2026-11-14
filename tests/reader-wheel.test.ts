import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalysisBlocks } from "../src/viewmodel/analysis-blocks.ts";
import { buildReaderWheel, readerOverview, readerRaw, readerTabs, wheelEntityDescription, wheelGeometry, wheelOffset, withoutAi, type WheelSector } from "../src/viewmodel/reader-wheel.ts";
import { tokens } from "../src/ui/tokens.ts";
import type { InlineReading } from "../src/compare/inline-reading.ts";
import { buildCollectionPosts } from "../src/viewmodel/collection-browser.ts";
import { buildCollectionReaderModel } from "../src/viewmodel/collection-reader.ts";
import { capture, descriptor, item, session } from "./collection-browser.fixtures.ts";

const comment = (id: string, likes: number, author = `user_${id}`, parent = "ROOT") =>
  ({ comment_id: id, source_comment_id: `source_${id}`, author, text: `Invented material ${id}`, like_count: likes, reply_count: 2, parent_comment_id: parent });
const block = (type: string, items: unknown[]) => ({ id: type, type, items });
const entity = (mentions = 1, kind = "web") => ({ key: "e", name: "Invented tool", url: "https://example.com/tool", kind, mention_count: mentions,
  evidence: [{ comment_id: "source_b", author: "user_b" }, { comment_id: "b", author: "user_b" }] });
function fixture(options: { type?: string; entities?: unknown[]; clusters?: boolean; questions?: boolean } = {}) {
  const latest = capture({ post_id: "ROOT", author: "op", text: "Invented root" });
  latest.result!.comments = [comment("a", 10), comment("b", 60), comment("c", 5), comment("n", 0), comment("o", 100, "op", "source_a"),
    comment("o2", 3, "op", "b"), comment("continuation", 200, "op"), comment("b", 60),
    { ...comment("blank", 0), text: "" }, { ...comment("unknown", 4), author: "unknown" }];
  latest.analysis = { status: "succeeded", analysis_version: "v3", source_comment_count: 10,
    clusters: options.clusters === false ? [] : [
      { cluster_key: 2, size_share: 2, like_share: .8, keywords: [], member_comment_ids: ["source_b", "c", "o"], comment_count: 2, top_comment_id: "o" },
      { cluster_key: 1, size_share: 3, like_share: .2, keywords: [], member_comment_ids: ["a", "source_n"], comment_count: 2, top_comment_id: "a" }],
    evidence: [], metrics: {}, post_type: { type: options.type ?? "discussion" }, blocks: [
      block("opinion_overview", [{ cluster_key: 1, label: "Backend opening", noise_count: 1 }]),
      block("noise_summary", [{ flag: "emoji_only", count: 1, comment_ids: ["source_n", "n", "o"] }]),
      block("entity_list", options.entities ?? [entity()]),
      block("qa_pairs", options.questions === false ? [] : [
        { question: { comment_id: "source_a", author: "user_a", text: "Invented question" }, status: "answered_by_op", answers: [{ comment_id: "source_o", author: "op", text: "Invented answer" }] },
        { question: { comment_id: "b", author: "user_b", text: "Invented question two" }, status: "unanswered", answers: [] },
        { question: { comment_id: "c", author: "user_c", text: "Invented question three" }, status: "replies_not_captured", answers: [] }])
    ] } as never;
  return item("wheel", { status: "succeeded", descriptor: descriptor({ author_hint: "op", post_url: "https://www.threads.com/@op/post/ROOT",
    engagement: { likes: 0, comments: 142, reposts: 0, forwards: 0, views: null } }), latestCapture: latest });
}
const quote = (commentId: string) => ({ commentId, text: "Invented quote", author: "user", likes: 1 });
const reading = (): InlineReading => ({ itemId: "wheel", captureId: "capture-1", promptVersion: "v5", model: "fixture", generatedAt: "fixture",
  gist: "Invented gist", find: { method: "", split: "", ask: "" }, clusterNames: { "2": "Invented topic" }, noiseClusters: [],
  methods: [{ name: "Invented method", fit: "Invented fit", quote: quote("source_b") }, { name: "Missing", fit: "", quote: quote("absent") }],
  split: { agree: "Invented agreement", sides: [{ claim: "Side one", why: "Reason one", quote: quote("a") },
    { claim: "Side two", why: "Reason two", quote: quote("source_b") }, { claim: "Missing", why: "", quote: quote("absent") }] } });
const model = (source = fixture(), ai: InlineReading | null = null) => buildReaderWheel(source, ai, buildAnalysisBlocks(source))!;
function completeFixture() {
  const source = fixture({ entities: [], questions: false });
  source.latestCapture!.result!.comments = Array.from({ length: 13 }, (_, index) => comment(`member_${index}`, index === 0 ? 2 : index === 12 ? 0 : 1));
  source.latestCapture!.analysis!.source_comment_count = 13;
  source.latestCapture!.analysis!.clusters = [
    { cluster_key: 1, size_share: 11 / 13, like_share: 12 / 13, keywords: [], member_comment_ids: Array.from({ length: 11 }, (_, index) => `member_${index}`), comment_count: 11 },
    { cluster_key: 2, size_share: 2 / 13, like_share: 1 / 13, keywords: [], member_comment_ids: ["member_11", "member_12"], comment_count: 2 }
  ];
  source.latestCapture!.analysis!.blocks = [];
  return source;
}

test("complete comparable clusters expose the audience and captured like totals", () => {
  const wheel = model(completeFixture());
  assert.deepEqual(wheel.totals, { comments: 13, likes: 13 });
  assert.equal(wheel.sectors[0].count, 11);
  assert.equal(wheel.sectors.find(s => s.key === "1")!.likeTotal, 12);
  // Verified numerator and denominator are what allow a like percentage to be printed.
  assert.equal(readerOverview(wheel, "1")!.likes, 12 / 13);
});
test("incomplete or incompatible clusters do not expose audience totals", () => {
  const partial = completeFixture();
  partial.latestCapture!.analysis!.clusters[0].member_comment_ids!.pop();
  const missing = completeFixture();
  delete missing.latestCapture!.analysis!.clusters[0].member_comment_ids;
  const incompatible = completeFixture();
  incompatible.latestCapture!.analysis!.source_comment_count = 14;
  const absent = completeFixture();
  absent.latestCapture!.analysis!.clusters = [];
  for (const source of [partial, missing, incompatible, absent, fixture()]) assert.equal(model(source).totals, null);
});
test("known zero likes remain zero in the audience total", () => {
  const source = completeFixture();
  for (const row of source.latestCapture!.result!.comments) row.like_count = 0;
  assert.deepEqual(model(source).totals, { comments: 13, likes: 0 });
});
test("any unknown or invalid captured like count makes the audience like total unknown", () => {
  for (const likes of [null, undefined, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
    const source = completeFixture();
    source.latestCapture!.result!.comments[0].like_count = likes;
    assert.deepEqual(model(source).totals, { comments: 13, likes: null });
  }
});

test("requires succeeded analysis and captured comments", () => {
  const source = fixture();
  source.latestCapture!.analysis!.status = "failed";
  assert.equal(model(source), null);
  source.latestCapture!.analysis!.status = "succeeded";
  source.latestCapture!.result!.comments = [];
  assert.equal(model(source), null);
  assert.equal(buildReaderWheel(null, null, buildAnalysisBlocks(null)), null);
});
test("sectors normalise, rank, resolve membership and retain noise; audience uses eligibility once per identity", () => {
  const wheel = model();
  assert.deepEqual(wheel.sectors.map(s => [s.key, s.rank, s.share, s.likeShare, s.count, s.topId]), [["1", 0, .6, .2, 2, "a"], ["2", 1, .4, .8, 2, "b"]]);
  assert.equal(wheel.sectors[0].quote, "Backend opening");
  assert.equal(wheel.sectors[1].quote, "Invented material b");
  assert.equal(wheel.sectors[0].noise, 1);
  assert.deepEqual(wheel.audience, ["b", "a", "c", "n"]);
  assert.deepEqual(wheel.raw.op, ["o", "o2"]);
  assert.deepEqual(wheel.raw.noise, ["n"]);
  assert.equal(wheel.comments.n.sector, "1");
  assert.equal(wheel.comments.n.noiseFlag, "emoji_only");
  assert.equal(wheel.comments.o.replyTo, "user_a");
  assert.equal(wheel.comments.o.isOp, true);
  assert.equal(wheel.comments.a.qa, "answered_by_op");
  assert.equal(wheel.comments.a.replies, 2);
  assert.equal(wheel.comments.a.href, null);
  assert.equal(wheel.comments.continuation.sector, null);
  assert.deepEqual(wheel.coverage, { got: 10, replies: 142 });
});
test("topic names the most liked topic only when it is not the most discussed", () => {
  assert.deepEqual(model().observations.find(o => o.key === "topic"), { key: "topic", ai: false, loud: "2" });
  const source = fixture();
  source.latestCapture!.analysis!.clusters[0].like_share = .1;
  assert.deepEqual(model(source).observations.find(o => o.key === "topic"), { key: "topic", ai: false, loud: null });
  source.latestCapture!.analysis!.clusters.splice(0, 1);
  assert.deepEqual(model(source).observations.find(o => o.key === "topic"), { key: "topic", ai: false, loud: null });
});
test("the gist heads the observations instead of being one; supporting refs widen sides and methods", () => {
  const ai = reading();
  ai.gistRefs = ["source_b", "absent", "a", "b"];
  ai.split.sides[0].refs = ["a", "c", "absent"];
  ai.methods[0].refs = ["source_b", "a"];
  const wheel = model(fixture(), ai);
  assert.deepEqual(wheel.headline, { text: "Invented gist", grounded: true });
  assert.equal(wheel.observations.some(o => (o.key as string) === "react"), false);
  const split = wheel.observations.find(o => o.key === "split"); assert.ok(split?.key === "split");
  assert.deepEqual(split.sides[0].refs, ["a", "c"]);
  const how = wheel.observations.find(o => o.key === "how"); assert.ok(how?.key === "how");
  assert.deepEqual(how.methods[0].refs, ["b", "a"]);
  // A gist whose refs resolve to nothing still heads the page, marked as not linked to comments.
  const bare = reading(); bare.gistRefs = ["absent"];
  assert.deepEqual(model(fixture(), bare).headline, { text: "Invented gist", grounded: false });
  assert.equal(model().headline, null);
});
test("AI observations resolve source/internal ids and drop missing quotes, with fixed observation order", () => {
  const wheel = model(fixture({ entities: [entity(2)] }), reading());
  assert.deepEqual(wheel.observations.map(o => o.key), ["split", "topic", "how", "link", "qa"]);
  const split = wheel.observations.find(o => o.key === "split")!;
  assert.ok(split.key === "split");
  assert.deepEqual(split.sides.map(s => s.refs), [["a"], ["b"]]);
  const how = wheel.observations.find(o => o.key === "how")!;
  assert.ok(how.key === "how");
  assert.deepEqual(how.methods.map(m => m.refs), [["b"]]);
  assert.deepEqual(wheel.observations.find(o => o.key === "topic"), { key: "topic", ai: true, loud: "2" });
  const ai = reading(); ai.split.sides.splice(1); ai.methods = [ai.methods[1]];
  assert.deepEqual(model(fixture(), ai).observations.map(o => o.key), ["topic", "qa"]);
});
test("links switch between observation and raw by substance, including an unenriched repo", () => {
  assert.equal(model().raw.links?.length, 1);
  for (const entities of [[entity(2)], [entity(), { ...entity(), key: "other" }], [entity(1, "github_repo")]]) {
    const wheel = model(fixture({ entities }));
    assert.equal(wheel.raw.links, null);
    const link = wheel.observations.find(o => o.key === "link"); assert.ok(link?.key === "link");
    assert.deepEqual(link.refs, ["b"]);
  }
  assert.equal(model(fixture({ entities: [] })).raw.links, null);
});
test("questions reuse statuses and captured answers; post questions retain their original data", () => {
  const wheel = model(), qa = wheel.observations.find(o => o.key === "qa")!;
  assert.ok(qa.key === "qa");
  assert.deepEqual([qa.total, qa.unanswered, qa.unseen], [3, 1, 1]);
  assert.deepEqual(qa.items.map(q => [q.id, q.status, q.answers]), [["a", "answered_by_op", ["o"]], ["b", "unanswered", []], ["c", "replies_not_captured", []]]);
  const source = fixture();
  const raw = source.latestCapture!.analysis!.blocks!.find(b => b.type === "qa_pairs")!;
  raw.items = [{ question: { is_post: true, text: "Invented root question", author: "op" }, status: "answered", answers: [] }];
  const postQa = model(source).observations.find(o => o.key === "qa")!;
  assert.ok(postQa.key === "qa");
  assert.equal(postQa.items[0].id, null);
  assert.equal(postQa.items[0].question.isPost, true);
});
test("initial respects help, resource link then how, other types topic and first-existing fallback", () => {
  assert.equal(model(fixture({ type: "help" })).initial, "qa");
  assert.equal(model(fixture({ type: "resource", entities: [entity(2)] })).initial, "link");
  assert.equal(model(fixture({ type: "resource" }), reading()).initial, "how");
  for (const type of ["discussion", "news", "entertainment", "unknown"]) assert.equal(model(fixture({ type })).initial, "topic");
  assert.equal(model(fixture({ type: "help", questions: false })).initial, "topic");
  assert.equal(model(fixture({ clusters: false })).initial, "qa");
  const empty = model(fixture({ clusters: false, questions: false }));
  assert.deepEqual(empty.observations, []);
  assert.equal(empty.initial, null);
});
test("an entry exists only for content that exists; the post type's own entry leads and the comments close", () => {
  const rich = model(fixture({ entities: [entity(2)] }), reading());
  assert.deepEqual(readerTabs(rich).map(t => [t.key, t.ai, t.count]), [["overview", false, null], ["split", true, null], ["how", true, 1], ["qa", false, 3], ["link", false, 1], ["raw", false, 4]]);
  assert.deepEqual(readerTabs(model(fixture({ type: "help" }), reading())).map(t => t.key), ["qa", "overview", "split", "how", "raw"]);
  assert.deepEqual(readerTabs(model(fixture({ type: "resource", entities: [entity(2)] }))).map(t => t.key), ["link", "overview", "qa", "raw"]);
  assert.deepEqual(readerTabs(model(fixture({ clusters: false, questions: false }))).map(t => t.key), ["raw"]);
});
test("counts-only removes every AI-written part and keeps the counted ones", () => {
  const full = model(fixture({ entities: [entity(2)] }), reading()), before = JSON.stringify(full);
  assert.equal(full.ai, true);
  assert.equal(model().ai, false);
  const plain = withoutAi(full);
  assert.equal(plain.ai, false);
  assert.equal(plain.headline, null);
  assert.deepEqual(plain.observations.map(o => o.key), ["topic", "link", "qa"]);
  assert.deepEqual(plain.observations.find(o => o.key === "topic"), { key: "topic", ai: false, loud: "2" });
  assert.ok(plain.sectors.every(s => s.aiName === null));
  assert.deepEqual(readerTabs(plain).map(t => t.key), ["overview", "qa", "link", "raw"]);
  // A resource post read for its methods falls back to the topics once the methods are gone.
  assert.equal(model(fixture({ type: "resource" }), reading()).initial, "how");
  assert.equal(withoutAi(model(fixture({ type: "resource" }), reading())).initial, "topic");
  assert.equal(JSON.stringify(full), before);
});
test("overview names the counted finding, its topic and the topic in focus", () => {
  const wheel = model(fixture(), reading()), apart = readerOverview(wheel, null)!;
  assert.deepEqual([apart.state, apart.subject.key, apart.sector.key, apart.members], ["apart", "2", "2", ["b", "c"]]);
  assert.deepEqual([apart.liked, apart.discussed], [true, false]);
  assert.equal(apart.subjectLikes, null, "membership here is not verified, so no like percentage is offered");
  const other = readerOverview(wheel, "1")!;
  assert.deepEqual([other.sector.key, other.subject.key, other.members, other.liked, other.discussed], ["1", "2", ["a", "n"], false, true]);
  assert.equal(readerOverview(wheel, "absent")!.sector.key, "2");
  const source = fixture();
  source.latestCapture!.analysis!.clusters[0].like_share = .1;
  const same = readerOverview(model(source), null)!;
  assert.deepEqual([same.state, same.subject.key, same.liked, same.discussed], ["same", "1", true, true]);
  source.latestCapture!.analysis!.clusters.splice(0, 1);
  const single = readerOverview(model(source), null)!;
  assert.deepEqual([single.state, single.liked, single.discussed], ["single", false, false]);
  assert.equal(readerOverview(model(fixture({ clusters: false })), null), null);
});
test("comments narrow by topic, author replies, markers and links; an unknown filter shows all", () => {
  const wheel = model(fixture(), reading()), all = readerRaw(wheel, "all");
  assert.deepEqual(all.chips.map(c => [c.key, c.n]), [["all", 4], ["topic:1", 2], ["topic:2", 2], ["op", 2], ["noise", 1], ["link", 1]]);
  assert.deepEqual(all.ids, ["b", "a", "c", "n"]);
  assert.deepEqual([all.likeRatios.b, all.likeRatios.a], [1, 10 / 60]);
  assert.deepEqual(readerRaw(wheel, "topic:1").ids, ["a", "n"]);
  assert.equal(readerRaw(wheel, "topic:1").likeRatios.a, 1, "bars are scaled to the list in view");
  assert.deepEqual(readerRaw(wheel, "op").ids, ["o", "o2"]);
  assert.equal(readerRaw(wheel, "op").parents.o, "Invented material a");
  assert.deepEqual(readerRaw(wheel, "noise").ids, ["n"]);
  assert.deepEqual(readerRaw(wheel, "link").ids, ["b"]);
  assert.equal(readerRaw(wheel, "topic:absent").filter, "all");
  // One topic needs no topic filter; a link that has its own entry is not offered again here.
  const source = fixture({ entities: [entity(2)] });
  source.latestCapture!.analysis!.clusters.splice(0, 1);
  assert.deepEqual(readerRaw(model(source), "all").chips.map(c => c.key), ["all", "op", "noise"]);
});
test("missing coverage, zero likes/shares and no sectors remain finite", () => {
  const source = fixture(); source.descriptor.engagement.comments = null;
  for (const c of source.latestCapture!.result!.comments) c.like_count = 0;
  for (const c of source.latestCapture!.analysis!.clusters) { c.size_share = 0; c.like_share = 0; }
  const wheel = model(source);
  assert.equal(wheel.coverage, null);
  assert.deepEqual(wheel.sectors.map(s => s.share), [.5, .5]);
  assert.ok(wheelGeometry(wheel.sectors, { cx: 0, cy: 0, r0: 5, rmin: 10, rmax: 20, pad: 2 }).every(s => s.outerRadius === 10));
  const noSectors = model(fixture({ clusters: false }));
  assert.equal(noSectors.observations.some(o => o.key === "topic"), false);
});
test("geometry ports clockwise arcs, padding, sqrt radius and labels", () => {
  const sectors = [.7, .25, .05].map((share, i) => ({ key: String(i), share, likeShare: [1, .25, 0][i] } as WheelSector));
  const geometry = wheelGeometry(sectors, { cx: 184, cy: 148, r0: 55, rmin: 80, rmax: 130, pad: 2 });
  assert.ok(Math.abs(geometry.reduce((sum, s) => sum + s.endAngle - s.startAngle, 0) - 348) < 1e-9);
  assert.deepEqual(geometry.map(s => s.outerRadius), [130, 105, 80]);
  assert.match(geometry[0].d, /A130 130 0 1 1/);
  assert.match(geometry[1].d, /A105 105 0 0 1/);
  assert.ok(geometry[0].label); assert.equal(geometry[2].label, null);
  assert.deepEqual(wheelGeometry([], { cx: 0, cy: 0, r0: 1, rmin: 2, rmax: 3, pad: 2 }), []);
  const tiny = wheelGeometry([{ ...sectors[0], share: .001 }], { cx: 0, cy: 0, r0: 1, rmin: 2, rmax: 3, pad: 2 })[0];
  assert.ok(Math.abs(tiny.startAngle - .09) < 1e-9);
});

test("no sector can leave the drawing: at its largest, pulled out, with its stroke", () => {
  const w = tokens.panel.wheel, reach = w.rmax + w.shift + w.sectorStroke / 2;
  assert.ok(reach <= Math.min(w.cx, w.cy, w.width - w.cx, w.height - w.cy), `a selected sector reaches ${reach} from the centre`);
  assert.ok(w.plotMaxWidth <= w.width, "the drawing is never scaled up");
  for (const likes of [[1], [0, 0], [5, .2, Number.NaN], [-1, 1], [.9, .05, .03, .01, .005, .005, 0, 0]]) {
    const sectors = likes.map((likeShare, i) => ({ key: String(i), share: 1 / likes.length, likeShare } as WheelSector));
    for (const g of wheelGeometry(sectors, w)) {
      assert.ok(g.outerRadius >= w.rmin && g.outerRadius <= w.rmax, `radius ${g.outerRadius}`);
      const offset = wheelOffset(g.midAngle, w.shift), points = [...g.d.matchAll(/(-?[\d.]+) (-?[\d.]+)(?=[LAZ])/g)];
      assert.equal(points.length, 5);
      for (const [, x, y] of points) assert.ok(Number(x) + offset.x >= 0 && Number(x) + offset.x <= w.width && Number(y) + offset.y >= 0 && Number(y) + offset.y <= w.height, g.d);
    }
  }
});
test("entity mention ids supplement the link's captured sources", () => {
  const source = fixture({ entities: [{ ...entity(2), comment_ids: ["source_c", "source_continuation", "absent"] }] });
  const wheel = model(source);
  const link = wheel.observations.find(o => o.key === "link"); assert.ok(link?.key === "link");
  assert.deepEqual(link.refs, ["b", "c", "continuation"]);
});
test("projections do not mutate inputs and comment hrefs use captured locators", () => {
  const source = fixture();
  source.latestCapture!.result!.comments[0].url = "https://www.threads.net/@user_a/post/ExampleCode1";
  const blocks = buildAnalysisBlocks(source), ai = reading();
  const before = JSON.stringify([source, blocks, ai]);
  const wheel = buildReaderWheel(source, ai, blocks)!;
  assert.equal(wheel.comments.a.href, "https://www.threads.com/@user_a/post/ExampleCode1");
  assert.equal(JSON.stringify([source, blocks, ai]), before);
});
test("collection reader wires the wheel next to unchanged blocks without a stored reading", () => {
  const source = fixture(), sessions = [session("topic", [source], "topic")];
  const post = buildCollectionPosts(sessions)[0];
  const reader = buildCollectionReaderModel(post, sessions, [], [], {}, 0)!;
  assert.deepEqual(reader.blocks, buildAnalysisBlocks(source));
  assert.deepEqual(reader.wheel, model(source));
});

test("entity descriptions yield to captured source rows", () => {
  const wheel = model();
  const row = wheel.raw.links![0];
  assert.equal(wheelEntityDescription(wheel, { ...row, summary: wheel.comments.b.text }), null);
  assert.equal(wheelEntityDescription(wheel, { ...row, summary: "A separate tool description" }), "A separate tool description");
  assert.deepEqual(wheelOffset(90, 9), { x: 9, y: 0 });
});
