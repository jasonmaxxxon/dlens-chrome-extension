import {INLINE_READING_PROMPT_VERSION, inlineReadingInputHash, type InlineReadingInput, type InlineReading} from '../compare/inline-reading.ts';
import {COMMENT_ELIGIBILITY_VERSION} from '../compare/comment-eligibility.ts';
import {loadInlineReadingRecords,saveInlineReadingRecord,saveInlineReadingRecordIfCapture,type StorageAreaLike,type InlineReadingRecord} from '../compare/inline-reading-storage.ts';
interface Flight {result:Promise<InlineReadingRecord|null>;resolve:(record:InlineReadingRecord|null)=>void;reject:(error:unknown)=>void;startedAt:string}
function createFlight(startedAt:string):Flight {
 let resolve!:Flight['resolve'],reject!:Flight['reject'];
 const result=new Promise<InlineReadingRecord|null>((a,b)=>{resolve=a;reject=b;});
 void result.catch(()=>undefined);
 return {result,resolve,reject,startedAt};
}
/** Share one generation per input; reactivating a pending input restores its publication identity. */
export function createInlineReadingRunner(storage:StorageAreaLike,now=()=>new Date().toISOString()) {
 const flights=new Map<string,Flight>();
 const latest=new Map<string,string>();
 return async(input:InlineReadingInput,generate:()=>Promise<InlineReading>,retry=false)=>{
  const inputHash=inlineReadingInputHash(input);
  const key=JSON.stringify([input.itemId,input.captureId,inputHash]);
  const pending=flights.get(key);
  if(pending && latest.get(input.itemId)===key)return {status:'exists' as const};
  const flight=pending ?? createFlight(now());
  if(!pending)flights.set(key,flight);
  latest.set(input.itemId,key);
  const isCurrent=()=>latest.get(input.itemId)===key;
  const identity={itemId:input.itemId,captureId:input.captureId,inputHash,promptVersion:INLINE_READING_PROMPT_VERSION,eligibilityVersion:COMMENT_ELIGIBILITY_VERSION};
  let scheduled=false;
  try {
   if(!pending){
    const existing=(await loadInlineReadingRecords(storage))[input.itemId];
    if(!isCurrent())return {status:'exists' as const};
    const stale=existing?.status==='running' && Date.parse(now())-Date.parse(existing.startedAt)>180_000;
    const previousHash=existing?.inputHash ?? (existing?.status==='complete' ? existing.reading.inputHash : undefined);
    const previousVersion=existing?.status==='complete' ? existing.reading.promptVersion : existing?.promptVersion;
    const previousEligibility=existing?.status==='complete' ? existing.reading.eligibilityVersion : existing?.eligibilityVersion;
    const outdated=previousHash!==inputHash || previousVersion!==INLINE_READING_PROMPT_VERSION || previousEligibility!==COMMENT_ELIGIBILITY_VERSION;
    if(existing && existing.captureId===input.captureId && !stale && !outdated && !(retry && existing.status==='failed')){flight.resolve(existing);return {status:'exists' as const};}
   }
   await saveInlineReadingRecord(storage,{...identity,status:'running',startedAt:flight.startedAt},isCurrent);
   if(!isCurrent())return {status:'exists' as const};
   const completion=flight.result.then(record=>record ? saveInlineReadingRecordIfCapture(storage,record,input.captureId,inputHash,isCurrent) : undefined)
    .then(()=>undefined).finally(()=>{if(!pending && flights.get(key)===flight)flights.delete(key);});
   scheduled=true;
   if(!pending)void Promise.resolve().then(generate).then((reading):InlineReadingRecord=>{
    if(reading.itemId!==input.itemId || reading.captureId!==input.captureId || reading.promptVersion!==INLINE_READING_PROMPT_VERSION)throw new Error('閱讀來源或版本已改變');
    return {...identity,status:'complete',reading:{...reading,inputHash,eligibilityVersion:COMMENT_ELIGIBILITY_VERSION}};
   }).catch((error):InlineReadingRecord=>({...identity,status:'failed',error:error instanceof Error?error.message:String(error),at:now()})).then(flight.resolve);
   return {status:'started' as const,completion};
  }catch(error){if(!pending)flight.reject(error);throw error;}
  finally{if(!scheduled && !pending){flight.resolve(null);if(flights.get(key)===flight)flights.delete(key);}}
 };
}
