import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY,
  buildProductAgentTaskPromptHash,
  listProductAgentTaskFeedback,
  saveProductAgentTaskFeedback
} from "../src/compare/product-agent-task-feedback.ts";
import type { ProductAgentTaskFeedback } from "../src/state/types.ts";

function makeStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(values: Record<string, unknown>) {
      Object.assign(data, values);
    }
  };
}

test("buildProductAgentTaskPromptHash is stable for identical task prompts", () => {
  const prompt = "You are helping prototype a share URL intake.";

  assert.equal(buildProductAgentTaskPromptHash(prompt), buildProductAgentTaskPromptHash(prompt));
  assert.notEqual(buildProductAgentTaskPromptHash(prompt), buildProductAgentTaskPromptHash(`${prompt}\nAdd tests.`));
  assert.match(buildProductAgentTaskPromptHash(prompt), /^task_[a-z0-9]+$/);
});

test("saveProductAgentTaskFeedback appends normalized feedback entries", async () => {
  const storage = makeStorage();
  const baseFeedback: ProductAgentTaskFeedback = {
    signalId: "signal_1",
    taskPromptHash: "task_abc",
    feedback: "needs_rewrite",
    note: "改成 TypeScript，並補 repo context。",
    createdAt: "2026-04-28T10:00:00.000Z"
  };

  await saveProductAgentTaskFeedback(storage, baseFeedback);
  await saveProductAgentTaskFeedback(storage, {
    ...baseFeedback,
    feedback: "adopted",
    note: "this note should not be stored",
    createdAt: "2026-04-28T10:01:00.000Z"
  });

  assert.deepEqual(storage.data[PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY], [
    baseFeedback,
    {
      signalId: "signal_1",
      taskPromptHash: "task_abc",
      feedback: "adopted",
      createdAt: "2026-04-28T10:01:00.000Z"
    }
  ]);
});

test("listProductAgentTaskFeedback filters malformed legacy records", async () => {
  const storage = makeStorage({
    [PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY]: [
      {
        signalId: "signal_1",
        taskPromptHash: "task_abc",
        feedback: "irrelevant",
        note: "超出目前 non-goals。",
        createdAt: "2026-04-28T10:00:00.000Z"
      },
      {
        signalId: "signal_2",
        taskPromptHash: "task_def",
        feedback: "not-valid",
        createdAt: "2026-04-28T10:00:00.000Z"
      },
      null
    ]
  });

  assert.deepEqual(await listProductAgentTaskFeedback(storage), [
    {
      signalId: "signal_1",
      taskPromptHash: "task_abc",
      feedback: "irrelevant",
      note: "超出目前 non-goals。",
      createdAt: "2026-04-28T10:00:00.000Z"
    }
  ]);
});
