import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalysisBlocks } from "../src/viewmodel/analysis-blocks.ts";
import { buildReaderWheel, observationRefs, dotsBySector, wheelGeometry, type WheelSector } from "../src/viewmodel/reader-wheel.ts";
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
  assert.equal(wheel.likeTotal, 75);
});
test("react is counted, picks biggest and loudest and most-liked audience evidence", () => {
  const wheel = model(fixture(), reading()), react = wheel.observations[0];
  assert.equal(react.key, "react");
  assert.ok(react.key === "react");
  assert.deepEqual(react, { key: "react", ai: false, kind: "apart", big: "1", loud: "2", rows: [{ sector: "1", top: "a" }, { sector: "2", top: "b" }], loudTopLikeShare: .8, aiGist: "Invented gist" });
  const source = fixture();
  source.latestCapture!.analysis!.clusters[0].like_share = .1;
  const same = model(source).observations[0]; assert.ok(same.key === "react");
  assert.equal(same.kind, "same");
  source.latestCapture!.analysis!.clusters.splice(0, 1);
  const single = model(source).observations[0]; assert.ok(single.key === "react");
  assert.equal(single.kind, "single");
});
test("AI observations resolve source/internal ids and drop missing quotes, with fixed observation order", () => {
  const wheel = model(fixture({ entities: [entity(2)] }), reading());
  assert.deepEqual(wheel.observations.map(o => o.key), ["react", "split", "topic", "how", "link", "qa"]);
  const split = wheel.observations.find(o => o.key === "split")!;
  assert.ok(split.key === "split");
  assert.deepEqual(split.sides.map(s => s.refs), [["a"], ["b"]]);
  const how = wheel.observations.find(o => o.key === "how")!;
  assert.ok(how.key === "how");
  assert.deepEqual(how.methods.map(m => m.refs), [["b"]]);
  assert.deepEqual(wheel.observations.find(o => o.key === "topic"), { key: "topic", ai: true });
  const ai = reading(); ai.split.sides.splice(1); ai.methods = [ai.methods[1]];
  assert.deepEqual(model(fixture(), ai).observations.map(o => o.key), ["react", "topic", "qa"]);
  assert.deepEqual(model().observations.find(o => o.key === "topic"), { key: "topic", ai: false });
});
test("links switch between observation and raw by substance, including an unenriched repo", () => {
  assert.equal(model().raw.links?.length, 1);
  for (const entities of [[entity(2)], [entity(), { ...entity(), key: "other" }], [entity(1, "github_repo")]]) {
    const wheel = model(fixture({ entities }));
    assert.equal(wheel.raw.links, null);
    assert.deepEqual(observationRefs(wheel, "link"), ["b"]);
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
test("initial respects help, resource link then how, other types react and first-existing fallback", () => {
  assert.equal(model(fixture({ type: "help" })).initial, "qa");
  assert.equal(model(fixture({ type: "resource", entities: [entity(2)] })).initial, "link");
  assert.equal(model(fixture({ type: "resource" }), reading()).initial, "how");
  for (const type of ["discussion", "news", "entertainment", "unknown"]) assert.equal(model(fixture({ type })).initial, "react");
  assert.equal(model(fixture({ type: "help", questions: false })).initial, "react");
  assert.equal(model(fixture({ clusters: false })).initial, "qa");
  const empty = model(fixture({ clusters: false, questions: false }));
  assert.deepEqual(empty.observations, []);
  assert.equal(empty.initial, null);
});
test("refs are unique in evidence display order, dots count captured evidence by sector", () => {
  const wheel = model(fixture({ entities: [entity(2)] }), reading());
  assert.deepEqual(observationRefs(wheel, "react"), ["a", "b"]);
  assert.deepEqual(observationRefs(wheel, "topic"), ["a", "n", "b", "c"]);
  assert.deepEqual(observationRefs(wheel, "split"), ["a", "b"]);
  assert.deepEqual(observationRefs(wheel, "how"), ["b"]);
  assert.deepEqual(observationRefs(wheel, "qa"), ["a", "o", "b", "c"]);
  assert.deepEqual(dotsBySector(wheel, "qa"), { "1": 1, "2": 3 });
  assert.deepEqual(observationRefs(model(), "split"), []);
  assert.deepEqual(dotsBySector(model(), "split"), {});
});
test("missing coverage, zero likes/shares and no sectors remain finite", () => {
  const source = fixture(); source.descriptor.engagement.comments = null;
  for (const c of source.latestCapture!.result!.comments) c.like_count = 0;
  for (const c of source.latestCapture!.analysis!.clusters) { c.size_share = 0; c.like_share = 0; }
  const wheel = model(source);
  assert.equal(wheel.coverage, null);
  assert.equal(wheel.likeTotal, 0);
  const react = wheel.observations[0]; assert.ok(react.key === "react");
  assert.equal(react.loudTopLikeShare, null);
  assert.deepEqual(wheel.sectors.map(s => s.share), [.5, .5]);
  assert.ok(wheelGeometry(wheel.sectors, { cx: 0, cy: 0, r0: 5, rmin: 10, rmax: 20, pad: 2 }).every(s => s.outerRadius === 10));
  const noSectors = model(fixture({ clusters: false }));
  assert.equal(noSectors.observations.some(o => o.key === "react" || o.key === "topic"), false);
});
test("geometry ports clockwise arcs, padding, sqrt radius, labels and up to seven interior dots", () => {
  const sectors = [.7, .25, .05].map((share, i) => ({ key: String(i), share, likeShare: [1, .25, 0][i] } as WheelSector));
  const geometry = wheelGeometry(sectors, { cx: 184, cy: 148, r0: 55, rmin: 80, rmax: 130, pad: 2 });
  assert.ok(Math.abs(geometry.reduce((sum, s) => sum + s.endAngle - s.startAngle, 0) - 348) < 1e-9);
  assert.deepEqual(geometry.map(s => s.outerRadius), [130, 105, 80]);
  assert.match(geometry[0].d, /A130 130 0 1 1/);
  assert.match(geometry[1].d, /A105 105 0 0 1/);
  assert.ok(geometry[0].label); assert.equal(geometry[2].label, null);
  for (const s of geometry) for (const n of [0, 1, 4, 7, 12]) {
    const points = s.dots(n); assert.equal(points.length, Math.min(n, 7));
    for (const p of points) {
      const dx = p.x - 184, dy = p.y - 148, angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
      assert.ok(angle > s.startAngle && angle < s.endAngle);
      assert.ok(Math.hypot(dx, dy) > 55 && Math.hypot(dx, dy) < s.outerRadius);
    }
  }
  assert.deepEqual(wheelGeometry([], { cx: 0, cy: 0, r0: 1, rmin: 2, rmax: 3, pad: 2 }), []);
  const tiny = wheelGeometry([{ ...sectors[0], share: .001 }], { cx: 0, cy: 0, r0: 1, rmin: 2, rmax: 3, pad: 2 })[0];
  assert.ok(Math.abs(tiny.startAngle - .09) < 1e-9);
});

test("entity mention ids supplement evidence and unsectorised refs do not create dots", () => {
  const source = fixture({ entities: [{ ...entity(2), comment_ids: ["source_c", "source_continuation", "absent"] }] });
  const wheel = model(source);
  assert.deepEqual(observationRefs(wheel, "link"), ["b", "c", "continuation"]);
  assert.deepEqual(dotsBySector(wheel, "link"), { "2": 2 });
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

test("wheel selection projects filters, repeated refs, verdicts, raw counts and parent context", async () => {
  const { wheelSelection, wheelOffset } = await import("../src/viewmodel/reader-wheel.ts");
  const wheel = model(fixture(), reading());
  const selected = wheelSelection(wheel, "split", "2");
  assert.deepEqual(selected.refs, ["b"]);
  assert.deepEqual(selected.groups.map(g => g.refs), [[], ["b"]]);
  assert.equal(selected.spread, false);
  assert.equal(selected.parents.o, "Invented material a");
  assert.equal(selected.verdict, "more");
  assert.deepEqual(selected.rawChips.map(c => c.key), ["all", "link", "op", "noise"]);
  assert.deepEqual(wheelSelection(wheel, "topic", "1").topic, ["a", "n"]);
  assert.equal(wheelSelection(wheel, "qa", "1").questions.length, 1);
  assert.deepEqual(wheelOffset(90, 9), { x: 9, y: 0 });
});

test("entity descriptions yield to captured source rows and raw link sources resolve aliases", async () => {
  const { wheelEntityDescription, wheelSelection } = await import("../src/viewmodel/reader-wheel.ts");
  const wheel = model();
  const row = wheel.raw.links![0];
  assert.equal(wheelEntityDescription(wheel, { ...row, summary: wheel.comments.b.text }), null);
  assert.equal(wheelEntityDescription(wheel, { ...row, summary: "A separate tool description" }), "A separate tool description");
  assert.deepEqual(wheelSelection(wheel, null, null).rawLinkRefs, ["b"]);
});
