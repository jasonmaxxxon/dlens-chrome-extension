import { DEEP_READING_PROMPT_VERSION, parseDeepReadingResponse, threadsReplyUrl, type DeepReading, type DeepRef, type DeepCost } from './deep-reading.ts';
import type { StorageAreaLike } from './inline-reading-storage.ts';
export const DEEP_READINGS_STORAGE_KEY = 'dlens:v1:deep-readings';
interface Metadata { itemId: string; captureId: string; promptVersion: string; model: string; inputReplyCount: number; estimatedCost: DeepCost | null }
export type DeepReadingRecord = Metadata & (
  | { status:'running'; startedAt:string }
  | { status:'failed'; error:string; at:string }
  | { status:'complete'; generatedAt:string; reading:DeepReading; refs:DeepRef[] }
);
export function deepReadingStale(record: DeepReadingRecord, captureId: string | undefined): boolean {
  return record.captureId !== captureId || record.promptVersion !== DEEP_READING_PROMPT_VERSION;
}
export function normalizeDeepReadingRecords(value: unknown): Record<string, DeepReadingRecord> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id,v]): [string, DeepReadingRecord][] =>{
    if (!v || typeof v !== 'object') return [];
    const r=v as DeepReadingRecord;
    if (r.itemId !== id || typeof r.captureId !== 'string' || !r.captureId || typeof r.model !== 'string' || typeof r.promptVersion !== 'string' || !Number.isFinite(r.inputReplyCount)) return [];
    const cost=r.estimatedCost;
    const estimatedCost=cost && Number.isFinite(cost.usd) && cost.usd >=0 && Number.isFinite(cost.inputTokens) && Number.isFinite(cost.outputTokens) && typeof cost.priceDate==='string' ? cost : null;
    if (r.status==='complete') {
      if (typeof r.generatedAt!=='string' || !Array.isArray(r.refs)) return [];
      const refs=r.refs.flatMap(x=>x && typeof x.ref==='string' && typeof x.commentId==='string' && typeof x.author==='string' ? [{...x,url:threadsReplyUrl(x.url)}] : []);
      const reading=parseDeepReadingResponse(JSON.stringify(r.reading),{catalog:refs});
      return reading ? [[id,{...r,reading,refs,estimatedCost}]] : [];
    }
    if (r.status==='running' && typeof r.startedAt==='string' || r.status==='failed' && typeof r.error==='string' && typeof r.at==='string') return [[id,{...r,estimatedCost}]];
    return [];
  }));
}
export async function loadDeepReadingRecords(storage: StorageAreaLike) {
  return normalizeDeepReadingRecords((await storage.get(DEEP_READINGS_STORAGE_KEY))[DEEP_READINGS_STORAGE_KEY]);
}
let writes:Promise<unknown>=Promise.resolve();
export function saveDeepReadingRecord(storage: StorageAreaLike, record: DeepReadingRecord):Promise<void> {
  const run=writes.then(async()=>{const records=await loadDeepReadingRecords(storage); await storage.set({[DEEP_READINGS_STORAGE_KEY]:{...records,[record.itemId]:record}});});
  writes=run.catch(()=>undefined); return run;
}
