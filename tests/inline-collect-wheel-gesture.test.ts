import assert from "node:assert/strict";
import test from "node:test";
import { COLLECT_WHEEL_LOCK, buildWheelGeometry, idxFrom, selectGesture, releaseGesture, tMid, sectorPath } from "../src/content/inline-collect-wheel-math.ts";
const directions = [[0, -100], [100, -100], [100, 0], [100, 100], [0, 100], [-100, 100], [-100, 0], [-100, -100]];
const v9Idx = (dx: number, dy: number) => Math.hypot(dx, dy) < 35 ? -1 : Math.floor(((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 45 + 720) % 360) / 90);
const origin = { x: 400, y: 400 };
const gesture = (mode: "hold" | "flick" | "key", x: number, y: number, center = origin) => ({ mode, origin, pointer: { x, y }, center });
test("collect wheel locks preserve every v9 gesture primitive and soft spring", () => {
    assert.equal(COLLECT_WHEEL_LOCK.hold, 180);
    assert.equal(COLLECT_WHEEL_LOCK.radius, 126);
    assert.equal(COLLECT_WHEEL_LOCK.flickPx, 12);
    assert.equal(COLLECT_WHEEL_LOCK.innerRatio, 0.39);
    assert.equal(COLLECT_WHEEL_LOCK.deadRatio, 0.72);
    assert.equal(COLLECT_WHEEL_LOCK.spring, "cubic-bezier(.3,1.32,.5,1)");
    assert.deepEqual(buildWheelGeometry(), { R: 126, r0: 49, S: 296, c: 148, dead: 35 });
});
test("idxFrom maps clockwise top/right/bottom/left, diagonals and the strict dead-zone boundary exactly as v9", () => {
    for (const [dx, dy] of [...directions, [0, 0], [0, -34], [0, -35]])
        assert.equal(idxFrom(dx, dy), v9Idx(dx, dy));
    assert.deepEqual([0, 1, 2, 3].map(tMid), [-90, 0, 90, 180]);
});
for (const mode of ["hold", "flick"] as const)
    test(`unclamped ${mode} selection equals v9 for axes and diagonals`, () => {
        for (const [dx, dy] of directions)
            assert.equal(selectGesture(gesture(mode, 400 + dx, 400 + dy)).index, v9Idx(dx, dy));
    });
test("clamped hold and S ignore opening and sub-4px jitter, then aim from the drawn centre", () => {
    for (const mode of ["hold", "key"] as const) {
        const center = { x: 300, y: 300 };
        assert.equal(selectGesture(gesture(mode, 400, 400, center), true).index, -1);
        assert.equal(selectGesture(gesture(mode, 403, 400, center)).index, -1);
        assert.equal(selectGesture(gesture(mode, 404, 400, center)).index, v9Idx(104, 100));
        assert.equal(selectGesture(gesture(mode, 300, 200, center)).index, 0);
    }
});
test("clamped flick keeps the press point including opening", () => {
    for (const [dx, dy] of directions)
        assert.equal(selectGesture(gesture("flick", 400 + dx, 400 + dy, { x: 300, y: 300 }), true).index, v9Idx(dx, dy));
});
test("pointer hold release without movement is sticky, including clamped press and drawn centre", () => {
    assert.equal(releaseGesture(gesture("hold", 400, 400), -1, "pointer"), "sticky");
    assert.equal(releaseGesture(gesture("hold", 400, 400, { x: 300, y: 300 }), -1, "pointer"), "sticky");
    assert.equal(releaseGesture(gesture("hold", 300, 300, { x: 300, y: 300 }), -1, "pointer"), "sticky");
    assert.equal(releaseGesture(gesture("key", 400, 400), -1, "key"), "cancel");
});
test("selected sectors commit; far release cancels; clamped flick never switches release origin", () => {
    assert.equal(releaseGesture(gesture("hold", 500, 400), 1, "pointer"), "commit");
    assert.equal(releaseGesture(gesture("hold", 600, 600), -1, "pointer"), "cancel");
    assert.equal(releaseGesture(gesture("flick", 300, 300, { x: 300, y: 300 }), -1, "pointer"), "cancel");
});
test("sector geometry preserves v9 gap and rounded coordinate string", () => {
    assert.equal(sectorPath(148, 52, 123, -135, -45, 11), "M65.00 57.23A123 123 0 0 1 231.00 57.23L180.68 107.55A52 52 0 0 0 115.32 107.55Z");
});
