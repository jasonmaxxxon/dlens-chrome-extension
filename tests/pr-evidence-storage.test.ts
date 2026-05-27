import assert from "node:assert/strict";
import test from "node:test";

import type { SessionItem } from "../src/state/types.ts";
import { createSessionItem } from "../src/state/store-helpers.ts";
import {
  loadActivePrCampaign,
  loadPrCampaigns,
  loadPrEvidenceRows,
  normalizePrCampaign,
  normalizePrEvidenceRow,
  PR_CAMPAIGNS_STORAGE_KEY,
  PR_EVIDENCE_ROWS_STORAGE_KEY,
  savePrCampaign,
  savePrEvidenceRow,
  toPrEvidenceRowFromSessionItem
} from "../src/state/pr-evidence-storage.ts";

function createStorageArea(bucket: Record<string, unknown> = {}) {
  return {
    async get(key?: string | string[] | Record<string, unknown> | null) {
      if (typeof key === "string") {
        return { [key]: bucket[key] };
      }
      return bucket;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(bucket, items);
    }
  };
}

function buildItem(): SessionItem {
  return createSessionItem(
    {
      target_type: "post",
      page_url: "https://www.threads.net/@kol/post/abc",
      post_url: "https://www.threads.net/@kol/post/abc",
      author_hint: "@kol",
      text_snippet: "BoostUP event recap with wellness vouchers.",
      time_token_hint: "1h",
      dom_anchor: "card-1",
      engagement: { likes: 1200, comments: 38, reposts: 4, forwards: 0, views: 9000, followers: 756 },
      engagement_present: { likes: true, comments: true, reposts: true, forwards: true, views: true, followers: true },
      captured_at: "2026-05-06T12:00:00.000Z"
    },
    "2026-05-06T12:00:00.000Z"
  );
}

test("normalizePrCampaign enforces exactly six criteria without inventing placeholder labels", () => {
  assert.equal(normalizePrCampaign(null), null);
  assert.equal(normalizePrCampaign({ id: "campaign-1", sessionId: "session-1" }), null);

  const normalized = normalizePrCampaign({
    id: "campaign-1",
    sessionId: "session-1",
    name: "BoostUP",
    briefText: "Wellness campaign",
    criteria: [
      { id: "c1", label: "Brand named" },
      { id: "c2", label: "Event mentioned" }
    ],
    createdAt: "2026-05-06T10:00:00.000Z",
    updatedAt: "2026-05-06T10:00:00.000Z"
  });

  assert.equal(normalized?.criteria.length, 6);
  assert.deepEqual(normalized?.criteria.map((criterion) => criterion.id), ["c1", "c2", "c3", "c4", "c5", "c6"]);
  assert.equal(normalized?.criteria[0]?.label, "Brand named");
  assert.equal(normalized?.criteria[2]?.label, "");
});

test("savePrCampaign keeps one active campaign per session", async () => {
  const storage = createStorageArea({
    [PR_CAMPAIGNS_STORAGE_KEY]: [
      {
        id: "old",
        sessionId: "session-1",
        name: "Old",
        briefText: "",
        criteria: [],
        createdAt: "2026-05-05T10:00:00.000Z",
        updatedAt: "2026-05-05T10:00:00.000Z"
      },
      {
        id: "other",
        sessionId: "session-2",
        name: "Other",
        briefText: "",
        criteria: [],
        createdAt: "2026-05-05T10:00:00.000Z",
        updatedAt: "2026-05-05T10:00:00.000Z"
      }
    ]
  });

  await savePrCampaign(storage, {
    id: "new",
    sessionId: "session-1",
    name: "New",
    briefText: "Brief",
    criteria: [
      { id: "c1", label: "A" },
      { id: "c2", label: "B" },
      { id: "c3", label: "C" },
      { id: "c4", label: "D" },
      { id: "c5", label: "E" },
      { id: "c6", label: "F" }
    ],
    createdAt: "2026-05-06T10:00:00.000Z",
    updatedAt: "2026-05-06T10:00:00.000Z"
  });

  assert.deepEqual((await loadPrCampaigns(storage, "session-1")).map((campaign) => campaign.id), ["new"]);
  assert.equal((await loadActivePrCampaign(storage, "session-1"))?.id, "new");
  assert.deepEqual((await loadPrCampaigns(storage, "session-2")).map((campaign) => campaign.id), ["other"]);
});

test("normalizePrEvidenceRow defaults all criteria matches to false", () => {
  const normalized = normalizePrEvidenceRow({
    id: "row-1",
    campaignId: "campaign-1",
    itemId: "item-1",
    postUrl: "https://threads.net/post/1",
    authorHandle: "@kol",
    caption: "Campaign mention",
    criteriaMatches: { c1: true },
    collectedAt: "2026-05-06T12:00:00.000Z",
    advancedMetricsFetchedAt: "2026-05-26T03:00:00.000Z",
    advancedMetricsError: "temporary failure"
  });

  assert.deepEqual(normalized?.criteriaMatches, {
    c1: true,
    c2: false,
    c3: false,
    c4: false,
    c5: false,
    c6: false
  });
  assert.equal(normalized?.advancedMetricsFetchedAt, "2026-05-26T03:00:00.000Z");
  assert.equal(normalized?.advancedMetricsError, "temporary failure");
});

test("toPrEvidenceRowFromSessionItem maps visible collect fields without AI data", () => {
  const row = toPrEvidenceRowFromSessionItem("campaign-1", buildItem(), "2026-05-06T12:05:00.000Z");

  assert.equal(row.campaignId, "campaign-1");
  assert.equal(row.authorHandle, "@kol");
  assert.match(row.caption, /BoostUP/);
  assert.deepEqual(row.metrics, { likes: 1200, comments: 38, reposts: 4, views: 9000, followers: 756 });
  assert.equal(row.expectedEngagement, "");
  assert.deepEqual(row.criteriaMatches, {
    c1: false,
    c2: false,
    c3: false,
    c4: false,
    c5: false,
    c6: false
  });
});

test("toPrEvidenceRowFromSessionItem fills backend-visible metrics after crawl", () => {
  const item = buildItem();
  item.descriptor.engagement.views = null;
  item.descriptor.engagement.followers = null;
  item.latestCapture = {
    result: {
      canonical_post: {
        metrics: {
          views: 9100,
          followers: 802
        }
      }
    }
  } as SessionItem["latestCapture"];

  const row = toPrEvidenceRowFromSessionItem("campaign-1", item, "2026-05-06T12:05:00.000Z");

  assert.equal(row.metrics.views, 9100);
  assert.equal(row.metrics.followers, 802);
});

test("savePrEvidenceRow upserts by campaign and item id", async () => {
  const storage = createStorageArea({
    [PR_EVIDENCE_ROWS_STORAGE_KEY]: []
  });
  const row = toPrEvidenceRowFromSessionItem("campaign-1", buildItem(), "2026-05-06T12:05:00.000Z");

  await savePrEvidenceRow(storage, row);
  await savePrEvidenceRow(storage, { ...row, caption: "Updated caption" });

  const rows = await loadPrEvidenceRows(storage, "campaign-1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.caption, "Updated caption");
});
