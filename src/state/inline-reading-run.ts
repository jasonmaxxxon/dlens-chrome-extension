import {INLINE_READING_PROMPT_VERSION, type InlineReadingInput, type InlineReading} from '../compare/inline-reading.ts';
import {loadInlineReadingRecords,saveInlineReadingRecord,saveInlineReadingRecordIfCapture,type StorageAreaLike} from '../compare/inline-reading-storage.ts';
/** Per-capture work shares one generation; old captures cannot publish over a newer capture. */
export function createInlineReadingRunner(storage:StorageAreaLike,now=()=>new Date().toISOString()) {
 const flights=new Set<string>();
 return async(input:InlineReadingInput,generate:()=>Promise<InlineReading>,retry=false)=>{
  const key=JSON.stringify([input.itemId,input.captureId]);
  if(flights.has(key))return {status:'exists' as const};
  // Acquire before storage awaits so concurrent requests cannot both schedule the same capture.
  flights.add(key);
  try {
   const existing=(await loadInlineReadingRecords(storage))[input.itemId];
   const stale=existing?.status==='running' && Date.parse(now())-Date.parse(existing.startedAt)>180_000;
   const outdated=existing?.status==='complete' && existing.reading.promptVersion!==INLINE_READING_PROMPT_VERSION;
   if(existing && existing.captureId===input.captureId && !stale && !outdated && !(retry && existing.status==='failed')){flights.delete(key);return {status:'exists' as const};}
   await saveInlineReadingRecord(storage,{status:'running',itemId:input.itemId,captureId:input.captureId,startedAt:now()});
   const completion=Promise.resolve().then(()=>generate()).then(
    reading=>saveInlineReadingRecordIfCapture(storage,{status:'complete',itemId:input.itemId,captureId:input.captureId,reading},input.captureId),
    error=>saveInlineReadingRecordIfCapture(storage,{status:'failed',itemId:input.itemId,captureId:input.captureId,error:error instanceof Error?error.message:String(error),at:now()},input.captureId)
   ).then(()=>undefined).finally(()=>flights.delete(key));
   return {status:'started' as const,completion};
  }catch(error){flights.delete(key);throw error;}
 };
}
