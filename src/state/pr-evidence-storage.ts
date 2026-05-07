import type { SessionItem } from "./types.ts";
import type { StorageAreaLike } from "./topic-storage.ts";

export const PR_CAMPAIGNS_STORAGE_KEY = "dlens:v1:pr-campaigns";
export const PR_EVIDENCE_ROWS_STORAGE_KEY = "dlens:v1:pr-evidence-rows";

export type PrCriterionId = "c1" | "c2" | "c3" | "c4" | "c5" | "c6";

export interface PrCriterion {
  id: PrCriterionId;
  label: string;
}

export interface PrCampaign {
  id: string;
  sessionId: string;
  name: string;
  briefText: string;
  criteria: [PrCriterion, PrCriterion, PrCriterion, PrCriterion, PrCriterion, PrCriterion];
  createdAt: string;
  updatedAt: string;
  lastMatchedAt?: string;
}

export type PrCriteriaMatches = Record<PrCriterionId, boolean>;

export interface PrEvidenceRow {
  id: string;
  campaignId: string;
  itemId: string;
  postUrl: string;
  authorHandle: string;
  caption: string;
  metrics: {
    likes?: number;
    comments?: number;
    reposts?: number;
    views?: number;
  };
  expectedEngagement?: string;
  criteriaMatches: PrCriteriaMatches;
  collectedAt: string;
  matchedAt?: string;
}

export const PR_CRITERION_IDS: PrCriterionId[] = ["c1", "c2", "c3", "c4", "c5", "c6"];

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function criterionLabel(value: unknown, index: number): string {
  const label = readString(value).trim();
  return label || `criterion_${index + 1}`;
}

export function normalizePrCriteria(value: unknown): PrCampaign["criteria"] {
  const raw = Array.isArray(value) ? value : [];
  return PR_CRITERION_IDS.map((id, index) => {
    const entry = raw[index] && typeof raw[index] === "object" ? raw[index] as Record<string, unknown> : {};
    return {
      id,
      label: criterionLabel(entry.label, index)
    };
  }) as PrCampaign["criteria"];
}

export function emptyPrCriteriaMatches(): PrCriteriaMatches {
  return {
    c1: false,
    c2: false,
    c3: false,
    c4: false,
    c5: false,
    c6: false
  };
}

export function normalizePrCriteriaMatches(value: unknown): PrCriteriaMatches {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    c1: raw.c1 === true,
    c2: raw.c2 === true,
    c3: raw.c3 === true,
    c4: raw.c4 === true,
    c5: raw.c5 === true,
    c6: raw.c6 === true
  };
}

export function normalizePrCampaign(value: unknown): PrCampaign | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = readString(raw.id).trim();
  const sessionId = readString(raw.sessionId).trim();
  const name = readString(raw.name).trim();
  if (!id || !sessionId || !name) {
    return null;
  }
  const lastMatchedAt = readString(raw.lastMatchedAt).trim();
  return {
    id,
    sessionId,
    name,
    briefText: readString(raw.briefText).trim(),
    criteria: normalizePrCriteria(raw.criteria),
    createdAt: readString(raw.createdAt, "1970-01-01T00:00:00.000Z").trim() || "1970-01-01T00:00:00.000Z",
    updatedAt: readString(raw.updatedAt, "1970-01-01T00:00:00.000Z").trim() || "1970-01-01T00:00:00.000Z",
    ...(lastMatchedAt ? { lastMatchedAt } : {})
  };
}

export function normalizePrEvidenceRow(value: unknown): PrEvidenceRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = readString(raw.id).trim();
  const campaignId = readString(raw.campaignId).trim();
  const itemId = readString(raw.itemId).trim();
  const postUrl = readString(raw.postUrl).trim();
  if (!id || !campaignId || !itemId || !postUrl) {
    return null;
  }
  const rawMetrics = raw.metrics && typeof raw.metrics === "object" ? raw.metrics as Record<string, unknown> : {};
  const metrics = {
    likes: readNumber(rawMetrics.likes),
    comments: readNumber(rawMetrics.comments),
    reposts: readNumber(rawMetrics.reposts),
    views: readNumber(rawMetrics.views)
  };
  const matchedAt = readString(raw.matchedAt).trim();
  return {
    id,
    campaignId,
    itemId,
    postUrl,
    authorHandle: readString(raw.authorHandle).trim(),
    caption: readString(raw.caption).trim(),
    metrics: Object.fromEntries(Object.entries(metrics).filter(([, value]) => value !== undefined)) as PrEvidenceRow["metrics"],
    expectedEngagement: readString(raw.expectedEngagement).trim(),
    criteriaMatches: normalizePrCriteriaMatches(raw.criteriaMatches),
    collectedAt: readString(raw.collectedAt, "1970-01-01T00:00:00.000Z").trim() || "1970-01-01T00:00:00.000Z",
    ...(matchedAt ? { matchedAt } : {})
  };
}

async function readPrCampaigns(storageArea: StorageAreaLike): Promise<PrCampaign[]> {
  const raw = await storageArea.get(PR_CAMPAIGNS_STORAGE_KEY);
  const entries = Array.isArray(raw[PR_CAMPAIGNS_STORAGE_KEY]) ? raw[PR_CAMPAIGNS_STORAGE_KEY] : [];
  return entries
    .map((entry) => normalizePrCampaign(entry))
    .filter((entry): entry is PrCampaign => entry !== null);
}

async function writePrCampaigns(storageArea: StorageAreaLike, campaigns: PrCampaign[]): Promise<PrCampaign[]> {
  await storageArea.set({ [PR_CAMPAIGNS_STORAGE_KEY]: campaigns });
  return campaigns;
}

async function readPrEvidenceRows(storageArea: StorageAreaLike): Promise<PrEvidenceRow[]> {
  const raw = await storageArea.get(PR_EVIDENCE_ROWS_STORAGE_KEY);
  const entries = Array.isArray(raw[PR_EVIDENCE_ROWS_STORAGE_KEY]) ? raw[PR_EVIDENCE_ROWS_STORAGE_KEY] : [];
  return entries
    .map((entry) => normalizePrEvidenceRow(entry))
    .filter((entry): entry is PrEvidenceRow => entry !== null);
}

async function writePrEvidenceRows(storageArea: StorageAreaLike, rows: PrEvidenceRow[]): Promise<PrEvidenceRow[]> {
  await storageArea.set({ [PR_EVIDENCE_ROWS_STORAGE_KEY]: rows });
  return rows;
}

export async function loadPrCampaigns(storageArea: StorageAreaLike, sessionId: string): Promise<PrCampaign[]> {
  const campaigns = await readPrCampaigns(storageArea);
  return campaigns.filter((campaign) => campaign.sessionId === sessionId);
}

export async function loadActivePrCampaign(storageArea: StorageAreaLike, sessionId: string): Promise<PrCampaign | null> {
  const campaigns = await loadPrCampaigns(storageArea, sessionId);
  return campaigns.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
}

export async function savePrCampaign(storageArea: StorageAreaLike, campaign: PrCampaign): Promise<PrCampaign[]> {
  const normalized = normalizePrCampaign(campaign);
  if (!normalized) {
    throw new Error("Invalid PR campaign");
  }
  const campaigns = await readPrCampaigns(storageArea);
  const next = [normalized, ...campaigns.filter((entry) => entry.sessionId !== normalized.sessionId)];
  return writePrCampaigns(storageArea, next);
}

export async function loadPrEvidenceRows(storageArea: StorageAreaLike, campaignId: string): Promise<PrEvidenceRow[]> {
  const rows = await readPrEvidenceRows(storageArea);
  return rows.filter((row) => row.campaignId === campaignId);
}

export async function savePrEvidenceRow(storageArea: StorageAreaLike, row: PrEvidenceRow): Promise<PrEvidenceRow[]> {
  const normalized = normalizePrEvidenceRow(row);
  if (!normalized) {
    throw new Error("Invalid PR evidence row");
  }
  const rows = await readPrEvidenceRows(storageArea);
  const next = [
    normalized,
    ...rows.filter((entry) => !(entry.campaignId === normalized.campaignId && entry.itemId === normalized.itemId))
  ];
  return writePrEvidenceRows(storageArea, next);
}

export function toPrEvidenceRowFromSessionItem(campaignId: string, item: SessionItem, now = new Date().toISOString()): PrEvidenceRow {
  const descriptor = item.descriptor;
  const engagement = descriptor.engagement || {};
  return {
    id: createId("prrow"),
    campaignId,
    itemId: item.id,
    postUrl: descriptor.post_url || descriptor.page_url || "",
    authorHandle: descriptor.author_hint || "",
    caption: descriptor.text_snippet || "",
    metrics: {
      ...(typeof engagement.likes === "number" ? { likes: engagement.likes } : {}),
      ...(typeof engagement.comments === "number" ? { comments: engagement.comments } : {}),
      ...(typeof engagement.reposts === "number" ? { reposts: engagement.reposts } : {}),
      ...(typeof engagement.views === "number" ? { views: engagement.views } : {})
    },
    expectedEngagement: "",
    criteriaMatches: emptyPrCriteriaMatches(),
    collectedAt: now
  };
}
