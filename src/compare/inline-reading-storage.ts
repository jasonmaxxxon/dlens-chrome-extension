import type { InlineReading, InlineReadingQuote } from "./inline-reading.ts";

export const INLINE_READINGS_STORAGE_KEY = "dlens:v1:inline-readings";

/** One record per saved item; a new capture (re-crawl) makes the old record stale by captureId. */
export type InlineReadingRecord =
  | { status: "running"; itemId: string; captureId: string; startedAt: string }
  | { status: "failed"; itemId: string; captureId: string; error: string; at: string }
  | { status: "complete"; itemId: string; captureId: string; reading: InlineReading };

export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const obj = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);

function normalizeQuote(value: unknown): InlineReadingQuote | null {
  const raw = obj(value);
  if (!raw || !str(raw.commentId) || !str(raw.text)) return null;
  return { commentId: str(raw.commentId), text: str(raw.text), author: str(raw.author), likes: typeof raw.likes === "number" ? raw.likes : null };
}

function normalizeReading(value: unknown): InlineReading | null {
  const raw = obj(value);
  const find = obj(raw?.find);
  const split = obj(raw?.split);
  if (!raw || !find || !split || !str(raw.gist) || !str(raw.itemId) || !str(raw.captureId)) return null;
  const names = obj(raw.clusterNames) ?? {};
  return {
    itemId: str(raw.itemId), captureId: str(raw.captureId), promptVersion: str(raw.promptVersion), model: str(raw.model), generatedAt: str(raw.generatedAt),
    gist: str(raw.gist),
    find: { method: str(find.method), split: str(find.split), ask: str(find.ask) },
    clusterNames: Object.fromEntries(Object.entries(names).filter(([, name]) => typeof name === "string" && name)) as Record<string, string>,
    noiseClusters: (Array.isArray(raw.noiseClusters) ? raw.noiseClusters : []).filter((key): key is string => typeof key === "string"),
    methods: (Array.isArray(raw.methods) ? raw.methods : []).flatMap((m) => {
      const entry = obj(m); const quote = normalizeQuote(entry?.quote);
      return entry && quote && str(entry.name) ? [{ name: str(entry.name), fit: str(entry.fit), quote }] : [];
    }),
    split: {
      agree: str(split.agree),
      sides: (Array.isArray(split.sides) ? split.sides : []).flatMap((s) => {
        const entry = obj(s); const quote = normalizeQuote(entry?.quote);
        return entry && quote && str(entry.claim) ? [{ claim: str(entry.claim), why: str(entry.why), quote }] : [];
      })
    }
  };
}

function normalizeRecord(value: unknown): InlineReadingRecord | null {
  const raw = obj(value);
  if (!raw || !str(raw.itemId) || !str(raw.captureId)) return null;
  const base = { itemId: str(raw.itemId), captureId: str(raw.captureId) };
  if (raw.status === "running" && str(raw.startedAt)) return { ...base, status: "running", startedAt: str(raw.startedAt) };
  if (raw.status === "failed") return { ...base, status: "failed", error: str(raw.error) || "原因不明", at: str(raw.at) };
  const reading = raw.status === "complete" ? normalizeReading(raw.reading) : null;
  return reading ? { ...base, status: "complete", reading } : null;
}

/** Shared by the background writer and the content-script reader of the same key. */
export function normalizeInlineReadingRecords(value: unknown): Record<string, InlineReadingRecord> {
  return Object.fromEntries(Object.entries(obj(value) ?? {}).flatMap(([itemId, record]) => {
    const normalized = normalizeRecord(record);
    return normalized && normalized.itemId === itemId ? [[itemId, normalized] as const] : [];
  }));
}

export async function loadInlineReadingRecords(storageArea: StorageAreaLike): Promise<Record<string, InlineReadingRecord>> {
  return normalizeInlineReadingRecords((await storageArea.get(INLINE_READINGS_STORAGE_KEY))[INLINE_READINGS_STORAGE_KEY]);
}

// Readings for different posts finish in any order; serialise read-modify-write so none is lost.
let writes: Promise<unknown> = Promise.resolve();
export function saveInlineReadingRecord(storageArea: StorageAreaLike, record: InlineReadingRecord): Promise<void> {
  const run = writes.then(async () => {
    const records = await loadInlineReadingRecords(storageArea);
    await storageArea.set({ [INLINE_READINGS_STORAGE_KEY]: { ...records, [record.itemId]: record } });
  });
  writes = run.catch(() => undefined);
  return run;
}

/** Check and publish in the same writer queue: an older capture cannot replace a newer run. */
export function saveInlineReadingRecordIfCapture(storageArea:StorageAreaLike,record:InlineReadingRecord,expectedCaptureId:string):Promise<boolean> {
 const run=writes.then(async()=>{
  const records=await loadInlineReadingRecords(storageArea);
  if(records[record.itemId]?.captureId!==expectedCaptureId)return false;
  await storageArea.set({[INLINE_READINGS_STORAGE_KEY]:{...records,[record.itemId]:record}});
  return true;
 });
 writes=run.catch(()=>undefined);
 return run;
}
