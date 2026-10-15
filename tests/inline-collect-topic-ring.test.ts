import assert from "node:assert/strict";
import test from "node:test";
import { buildTopicRing, hitTopicRing, clampWheelCenter, topicWheelText } from "../src/content/inline-collect-wheel-math.ts";
const R = 126;
for (const count of [1, 2, 3, 4, 5, 9]) test(`topic ring ${count}: centred spans and tangent labels`, () => {
  const segs = buildTopicRing(R, count, count > 5);
  const n = Math.min(5, count), span = n <= 3 ? 40 : 36;
  assert.equal(segs.length, n);
  assert.equal((segs[0].a0 + segs[n - 1].a1) / 2, -90);
  for (const s of segs) {
    assert.equal(s.a1 - s.a0, span);
    assert.equal(s.rotation, (s.a0 + s.a1) / 2 + 90);
    assert.ok(Math.abs(Math.hypot(s.x, s.y) - (R + 34)) < 1e-8);
    assert.equal(s.more, count > 5 && s.index === 4);
  }
});
test("polar hit excludes gaps and radius bounds", () => {
  const segs = buildTopicRing(R, 3, false);
  const hit = (radius: number, angle: number) => hitTopicRing(R, segs, radius * Math.cos(angle * Math.PI / 180), radius * Math.sin(angle * Math.PI / 180));
  assert.equal(hit(R + 6, -90), 1);
  assert.equal(hit(R + 74, -90), 1);
  assert.equal(hit(R + 5.99, -90), null);
  assert.equal(hit(R + 74.01, -90), null);
  assert.equal(hit(R + 34, segs[1].a0), null);
  assert.equal(hit(R + 34, -10), null);
  assert.deepEqual(buildTopicRing(R, 0, false), []);
});
test("audience centre strings", () => {
  assert.deepEqual(topicWheelText(null), { title: "觀眾反應", sub: "入未分流" });
  assert.equal(topicWheelText({ name: "香港拍拖", more: false }).sub, "放入 香港拍拖");
  assert.equal(topicWheelText({ name: "其他話題", more: true }).sub, "放手揀話題");
});
test("ring clamp keeps all geometry and rotated label corners in top-left viewport", () => {
  const segs = buildTopicRing(R, 9, true);
  const center = clampWheelCenter({ x: 2, y: 2 }, { x: 1000, y: 700 }, R, segs);
  for (const s of segs) {
    for (const x of [-s.width / 2, s.width / 2]) for (const y of [-s.labelHeight / 2, s.labelHeight / 2]) {
      const a = s.rotation * Math.PI / 180;
      const px = center.x + s.x + x * Math.cos(a) - y * Math.sin(a);
      const py = center.y + s.y + x * Math.sin(a) + y * Math.cos(a);
      assert.ok(px >= 0 && px <= 1000 && py >= 0 && py <= 700);
    }
  }
  assert.ok(center.y >= R + 56);
  assert.deepEqual(clampWheelCenter({ x: 400, y: 400 }, { x: 1000, y: 700 }, R, []), { x: 400, y: 400 });
});
