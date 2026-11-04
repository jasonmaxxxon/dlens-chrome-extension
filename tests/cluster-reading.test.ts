import assert from "node:assert/strict";
import test from "node:test";
import { readClusterReadings } from "../src/compare/cluster-reading.ts";
import type { SessionItem } from "../src/state/types.ts";

function fixture(size: number): SessionItem {
  const comments = Array.from({ length: size }, (_, index) => ({ comment_id: `C${index}`, author: `fan${index}`,
    text: index === 0 ? "最受認同的觀眾原句。" : `另一位觀眾的看法 ${index}。`, like_count: size - index, reply_count: 0,
    parent_comment_id: "ROOT" }));
  return { id: "item", status: "succeeded", descriptor: { post_url: "https://www.threads.com/@op/post/ROOT", author_hint: "op" },
    latestCapture: { id: "capture", result: { canonical_post: { post_id: "ROOT", author: "op" }, comments },
      analysis: { status: "succeeded", source_comment_count: size, clusters: [{ cluster_key: 0, size_share: 1,
        like_share: 1, keywords: ["the", "one", "drop"], comment_count: size,
        member_comment_ids: comments.map(comment => comment.comment_id), top_comment_id: "C0" }], evidence: [] } } } as unknown as SessionItem;
}

for (const size of [1, 14, 15, 30]) test(`complete membership size ${size} uses the supported count/share boundary`, () => {
  const [cluster] = readClusterReadings(fixture(size));
  assert.equal(cluster.count, size);
  assert.equal(cluster.membership, "complete");
  assert.equal(cluster.label, "最受認同的觀眾原句。");
  assert.equal(cluster.leader?.id, "C0");
  assert.equal(cluster.measurementLabel, size < 15 ? `約 ${size} 則` : "100%");
  assert.equal(cluster.pct, 100, "the original compatible share remains geometry, not small-N copy");
});

test("frame keywords keep only strong backend words that verified members actually wrote", () => {
  const item = fixture(3);
  item.latestCapture!.result!.comments[1].text = "Hybrid 返工比較好";
  item.latestCapture!.analysis!.clusters[0].keywords = ["the", "hybrid", "覺得", "general", "返工"];
  assert.deepEqual(readClusterReadings(item)[0].keywords, ["hybrid", "返工"]);
});

test("legacy clusters without membership rank by backend size share and carry no name or keywords", () => {
  const item = fixture(4);
  item.latestCapture!.analysis!.clusters = [
    { cluster_key: 0, size_share: 0.3, like_share: 0.3, keywords: ["hybrid"] },
    { cluster_key: 1, size_share: 0.7, like_share: 0.7, keywords: ["office"] },
  ] as never;
  assert.deepEqual(readClusterReadings(item).map(cluster => [cluster.clusterKey, cluster.named, cluster.keywords]), [[1, false, []], [0, false, []]]);
});

test("rank full eligible membership, ignoring a root/OP hint and three partial evidence samples", () => {
  const item = fixture(15), analysis = item.latestCapture!.analysis!;
  item.latestCapture!.result!.comments.push(
    { comment_id: "ROOT", author: "op", text: "原帖", like_count: 999999 },
    { comment_id: "OP1", author: "op", text: "作者續寫", like_count: 888888, parent_comment_id: "ROOT" },
    { comment_id: "OP2", author: "op", text: "作者答覆", like_count: 777777, parent_comment_id: "C0" },
  );
  analysis.clusters[0].member_comment_ids!.push("ROOT", "OP1", "OP2");
  analysis.clusters[0].comment_count = 18;
  analysis.clusters[0].top_comment_id = "ROOT";
  analysis.source_comment_count = 18;
  analysis.evidence = [{ cluster_key: 0, comments: [{ comment_id: "ROOT", author: "op", text: "原帖", like_count: 999999 }] }];
  const [cluster] = readClusterReadings(item);
  assert.equal(cluster.count, 15);
  assert.equal(cluster.leader?.id, "C0");
  assert.equal(cluster.measurementLabel, "約 15 則", "filtering forbids reusing or re-rounding the old denominator");
  assert.equal(cluster.pct, undefined);
  assert.ok(cluster.members.every(member => member.author !== "op"));
});

test("likes, reply count and canonical id resolve ties deterministically", () => {
  const item = fixture(3), rows = item.latestCapture!.result!.comments;
  rows[0].like_count = rows[1].like_count = rows[2].like_count = 7;
  rows[0].reply_count = 1; rows[1].reply_count = rows[2].reply_count = 4;
  assert.equal(readClusterReadings(item)[0].leader?.id, "C1");
  rows.reverse();
  assert.equal(readClusterReadings(item)[0].leader?.id, "C1");
});

test("member source aliases resolve through deduplication without claiming a corrected percentage", () => {
  const item = fixture(2), rows = item.latestCapture!.result!.comments;
  rows[0].source_comment_id = "source0";
  rows.push({ ...rows[0], comment_id: "duplicate", text: " 最受認同的觀眾原句。 " });
  const cluster = item.latestCapture!.analysis!.clusters[0];
  cluster.member_comment_ids = ["source0", "duplicate", "C1"]; cluster.comment_count = 3;
  const result = readClusterReadings(item)[0];
  assert.equal(result.count, 2);
  assert.equal(result.leader?.id, "C0");
  assert.equal(result.measurementLabel, "約 2 則");
  assert.equal(result.pct, undefined);
});

test("case-sensitive ID ties agree with the B3 leader independently of locale", () => {
  const item = fixture(2), rows = item.latestCapture!.result!.comments;
  rows[0].comment_id = "A"; rows[1].comment_id = "a";
  rows[0].like_count = rows[1].like_count = 7;
  rows[0].reply_count = rows[1].reply_count = 1;
  const cluster = item.latestCapture!.analysis!.clusters[0];
  cluster.member_comment_ids = ["a", "A"]; cluster.top_comment_id = "A";
  assert.equal(readClusterReadings(item)[0].leader?.id, "A");
  rows.reverse();
  assert.equal(readClusterReadings(item)[0].leader?.id, "A");
});

test("legacy and missing-member packets expose limited state instead of fabricated leaders", () => {
  const item = fixture(30), analysis = item.latestCapture!.analysis!;
  delete analysis.clusters[0].member_comment_ids;
  analysis.evidence = [{ cluster_key: 0, comments: [{ comment_id: "C0", text: "最受認同的觀眾原句。", author: "fan0", like_count: 30 }] }];
  let result = readClusterReadings(item)[0];
  assert.equal(result.label, "分群資料未完整");
  assert.equal(result.measurementLabel, "未能確認則數");
  assert.equal(result.leader, null);
  assert.deepEqual(result.members, []);
  assert.equal(result.pct, undefined);
  analysis.clusters[0].member_comment_ids = ["C0", "missing"];
  analysis.clusters[0].comment_count = 2;
  result = readClusterReadings(item, { "0": "有效 AI 名稱" })[0];
  assert.equal(result.label, "有效 AI 名稱");
  assert.equal(result.count, null);
  assert.equal(result.leader, null);
});

test("overlapping cluster ownership is limited, not an invented partition", () => {
  const item = fixture(2), analysis = item.latestCapture!.analysis!;
  analysis.clusters.push({ ...analysis.clusters[0], cluster_key: 1 });
  const result = readClusterReadings(item);
  assert.ok(result.every(cluster => cluster.membership === "limited" && cluster.leader === null && cluster.count === null));
});
