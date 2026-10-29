import assert from "node:assert/strict";
import test from "node:test";

import { fetchWorkerStatus } from "../src/ingest/client.ts";
import {
  INGEST_ORIGIN_DENIED_MESSAGE,
  saveIngestSettingsIfPermitted,
  startIngestOriginPermissionRequest
} from "../src/ingest/host-permission.ts";

const REMOTE = "http://100.115.102.41:8000";
const REMOTE_PATTERN = "http://100.115.102.41:8000/*";

type PermissionRequest = { origins?: string[] };

function installPermissions(permissions: {
  request?: (query: PermissionRequest) => Promise<boolean>;
  contains?: (query: PermissionRequest) => Promise<boolean>;
}): void {
  (globalThis as { chrome?: { permissions: typeof permissions } }).chrome = { permissions };
}

function clearChrome(): void {
  delete (globalThis as { chrome?: unknown }).chrome;
}

test("a denied origin permission does not save, and only that origin is requested", async () => {
  const requested: PermissionRequest[] = [];
  let requestedSynchronously = false;
  installPermissions({
    request: (query) => {
      requestedSynchronously = true;
      requested.push(query);
      return Promise.resolve(false);
    }
  });
  let saved = false;
  try {
    const pending = startIngestOriginPermissionRequest(`${REMOTE}/`);
    assert.equal(requestedSynchronously, true);
    const result = await saveIngestSettingsIfPermitted(REMOTE, pending, async () => {
      saved = true;
    });
    assert.equal(saved, false);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, new RegExp(INGEST_ORIGIN_DENIED_MESSAGE));
    assert.deepEqual(requested, [{ origins: [REMOTE_PATTERN] }]);
    assert.equal(requested[0]?.origins?.length, 1);
    assert.equal(requested[0]?.origins?.includes("http://*/*"), false);
  } finally {
    clearChrome();
  }
});

test("an already granted origin still requests only that origin and then saves", async () => {
  const requested: PermissionRequest[] = [];
  installPermissions({
    request: (query) => {
      requested.push(query);
      return Promise.resolve(true);
    }
  });
  let savedUrl = "";
  try {
    const pending = startIngestOriginPermissionRequest(REMOTE);
    const result = await saveIngestSettingsIfPermitted(REMOTE, pending, async (normalized) => {
      savedUrl = normalized;
      return "stored";
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value, "stored");
    assert.equal(savedUrl, REMOTE);
    assert.deepEqual(requested, [{ origins: [REMOTE_PATTERN] }]);
    assert.equal(requested[0]?.origins?.length, 1);
  } finally {
    clearChrome();
  }
});

test("loopback does not request an optional origin", async () => {
  let requests = 0;
  installPermissions({
    request: async () => {
      requests += 1;
      return false;
    }
  });
  let saved = false;
  try {
    const pending = startIngestOriginPermissionRequest("http://127.0.0.1:8000");
    const result = await saveIngestSettingsIfPermitted("http://127.0.0.1:8000", pending, async () => {
      saved = true;
    });
    assert.equal(requests, 0);
    assert.equal(result.ok, true);
    assert.equal(saved, true);
  } finally {
    clearChrome();
  }
});

test("a remote ingest call without Chrome's grant fails before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = (async () => {
    fetches += 1;
    throw new Error("fetch should not run");
  }) as typeof fetch;
  installPermissions({ contains: async () => false });
  try {
    await assert.rejects(
      () => fetchWorkerStatus({ baseUrl: REMOTE, apiToken: "test-token-not-real" }),
      (error: Error) => {
        assert.match(error.message, new RegExp(INGEST_ORIGIN_DENIED_MESSAGE));
        assert.equal(error.message.includes("test-token-not-real"), false);
        return true;
      }
    );
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
    clearChrome();
  }
});

test("a granted remote origin is the only pattern contains is asked for", async () => {
  const originalFetch = globalThis.fetch;
  const checked: PermissionRequest[] = [];
  installPermissions({
    contains: async (query) => {
      checked.push(query);
      return query.origins?.length === 1 && query.origins[0] === REMOTE_PATTERN;
    }
  });
  globalThis.fetch = (async () => new Response(JSON.stringify({ status: "idle" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })) as typeof fetch;
  try {
    const status = await fetchWorkerStatus(REMOTE);
    assert.equal(status.status, "idle");
    assert.deepEqual(checked, [{ origins: [REMOTE_PATTERN] }]);
  } finally {
    globalThis.fetch = originalFetch;
    clearChrome();
  }
});
