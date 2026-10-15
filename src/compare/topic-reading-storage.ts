import { TOPIC_READING_PROMPT_VERSION, TOPIC_READING_BUDGET_VERSION, parseTopicReadingResponse, type TopicReading, type TopicReadingRef } from './topic-reading.ts';
import type { DeepCost } from './deep-reading.ts';
import type { StorageAreaLike } from './inline-reading-storage.ts';
export const TOPIC_READINGS_STORAGE_KEY='dlens:v1:topic-readings';
interface Metadata {inputHash?:string;budgetVersion?:string;topicId:string;signature:string;question:string;promptVersion:string;model:string;inputPostCount:number;omittedPostCount?:number;estimatedCost:DeepCost|null}
export type TopicReadingRecord=Metadata & ({status:'running';startedAt:string}|{status:'failed';error:string;at:string}|{status:'complete';generatedAt:string;reading:TopicReading;refs:TopicReadingRef[]});
export function topicReadingStale(record:TopicReadingRecord,signature:string,question?:string,inputHash?:string,model?:string):boolean {
 return !record.inputHash || record.budgetVersion!==TOPIC_READING_BUDGET_VERSION || inputHash!==undefined && record.inputHash!==inputHash || model!==undefined && record.model!==model || record.signature!==signature || record.promptVersion!==TOPIC_READING_PROMPT_VERSION || question!==undefined && record.question!==question.trim();
}
export function normalizeTopicReadingRecords(value:unknown):Record<string,TopicReadingRecord> {
 if(!value || typeof value!=='object' || Array.isArray(value))return {};
 return Object.fromEntries(Object.entries(value).flatMap(([id,v]):[string,TopicReadingRecord][]=>{
  if(!v || typeof v!=='object')return [];const r=v as TopicReadingRecord;
  if(r.topicId!==id || typeof r.signature!=='string' || typeof r.question!=='string' || typeof r.promptVersion!=='string' || typeof r.model!=='string' || !Number.isFinite(r.inputPostCount))return [];
  const cost=r.estimatedCost;const estimatedCost=cost && Number.isFinite(cost.usd) && cost.usd>=0 && Number.isFinite(cost.inputTokens) && Number.isFinite(cost.outputTokens) && typeof cost.priceDate==='string' ? cost : null;
  if(r.status==='complete'){
   if(typeof r.generatedAt!=='string' || !Array.isArray(r.refs))return [];
   const refs=r.refs.filter(x=>x && typeof x.ref==='string' && typeof x.itemId==='string' && typeof x.captureId==='string' && typeof x.author==='string' && (x.commentId===undefined || typeof x.commentId==='string'));
   const reading=parseTopicReadingResponse(JSON.stringify(r.reading),{refs});return reading ? [[id,{...r,reading,refs,estimatedCost}]] : [];
  }
  if(r.status==='running' && typeof r.startedAt==='string' || r.status==='failed' && typeof r.error==='string' && typeof r.at==='string')return [[id,{...r,estimatedCost}]];
  return [];
 }));
}
export async function loadTopicReadingRecords(storage:StorageAreaLike):Promise<Record<string,TopicReadingRecord>> {return normalizeTopicReadingRecords((await storage.get(TOPIC_READINGS_STORAGE_KEY))[TOPIC_READINGS_STORAGE_KEY]);}
let writes:Promise<unknown>=Promise.resolve();
export function saveTopicReadingRecord(storage:StorageAreaLike,record:TopicReadingRecord):Promise<void>{
 const run=writes.then(async()=>{const records=await loadTopicReadingRecords(storage);await storage.set({[TOPIC_READINGS_STORAGE_KEY]:{...records,[record.topicId]:record}});});writes=run.catch(()=>undefined);return run;
}
