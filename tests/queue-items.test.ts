import assert from "node:assert/strict";
import test from "node:test";

import { queueItemsSequential } from "../src/state/queue-items.ts";

test("queueItemsSequential queues item ids in order and carries the latest snapshot", async () => {
  const calls: string[] = [];
  const result = await queueItemsSequential({
    initialSnapshot: [] as string[],
    itemIds: ["a", "b", "c"],
    queueOne: async (itemId) => {
      calls.push(itemId);
      return [...calls];
    }
  });

  assert.deepEqual(calls, ["a", "b", "c"]);
  assert.deepEqual(result.snapshot, ["a", "b", "c"]);
  assert.deepEqual(result.queuedItemIds, ["a", "b", "c"]);
  assert.deepEqual(result.failedItemIds, []);
});

test("queueItemsSequential keeps queueing after one item fails", async () => {
  const calls: string[] = [];
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const result = await queueItemsSequential({
      initialSnapshot: [] as string[],
      itemIds: ["a", "b", "c"],
      queueOne: async (itemId) => {
        calls.push(itemId);
        if (itemId === "b") {
          throw new Error("boom");
        }
        return [...calls];
      }
    });

    assert.deepEqual(calls, ["a", "b", "c"]);
    assert.deepEqual(result.snapshot, ["a", "b", "c"]);
    assert.deepEqual(result.queuedItemIds, ["a", "c"]);
    assert.deepEqual(result.failedItemIds, ["b"]);
  } finally {
    console.error = originalError;
  }
});

test("inFlightSubmit reuses the job of a queued or running item and nothing else", async () => {
  const { inFlightSubmit } = await import("../src/state/store-helpers.ts");
  const base = { captureId: "cap-1", jobId: "job-1", canonicalTargetUrl: "https://www.threads.net/@a/post/X" };
  for (const status of ["queued", "running"] as const) {
    const submit = inFlightSubmit({ ...base, status } as never);
    assert.equal(submit?.job_id, "job-1");
    assert.equal(submit?.capture_id, "cap-1");
  }
  for (const status of ["saved", "failed", "succeeded"] as const) {
    assert.equal(inFlightSubmit({ ...base, status } as never), null);
  }
  assert.equal(inFlightSubmit({ ...base, status: "queued", jobId: null } as never), null);
});
