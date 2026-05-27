import assert from "node:assert/strict";
import test from "node:test";

import { createAsyncLock } from "../src/state/snapshot-lock.ts";

test("createAsyncLock runs tasks one at a time", async () => {
  const withLock = createAsyncLock();
  const order: string[] = [];
  let releaseFirst: (() => void) | null = null;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = withLock(async () => {
    order.push("first:start");
    await firstGate;
    order.push("first:end");
    return "first";
  });

  const second = withLock(async () => {
    order.push("second:start");
    order.push("second:end");
    return "second";
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, ["first:start"]);

  releaseFirst?.();
  assert.equal(await first, "first");
  assert.equal(await second, "second");
  assert.deepEqual(order, ["first:start", "first:end", "second:start", "second:end"]);
});

test("createAsyncLock keeps the queue alive after a rejection", async () => {
  const withLock = createAsyncLock();
  const order: string[] = [];

  await assert.rejects(
    withLock(async () => {
      order.push("first");
      throw new Error("boom");
    }),
    /boom/
  );

  const second = await withLock(async () => {
    order.push("second");
    return 2;
  });

  assert.equal(second, 2);
  assert.deepEqual(order, ["first", "second"]);
});
