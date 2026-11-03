import type { SessionItem, ExtensionSettings, Topic, SessionRecord, Signal } from './types.ts';
import { aiKeyGap, providerKeyFromSettings } from './ai-key.ts';
import { buildTopicReadingInput, buildTopicReadingPrompt, TOPIC_READING_PROMPT_VERSION, TOPIC_READING_SYSTEM_PROMPT } from '../compare/topic-reading.ts';
import { deepModel, estimateDeepReadingCost } from '../compare/deep-reading.ts';
import { generateTopicReading } from '../compare/provider.ts';
import { saveTopicReadingRecord, saveTopicReadingRecordIfInput, type TopicReadingRecord } from '../compare/topic-reading-storage.ts';
import type { StorageAreaLike, InlineReadingRecord } from '../compare/inline-reading-storage.ts';
import type { DeepReadingRecord } from '../compare/deep-reading-storage.ts';
/** Same membership as discourse VM: topicId is authoritative, bounded to the topic's session. */
export function selectTopicReadingItems(topic:Topic,sessions:SessionRecord[],signals:Signal[]):SessionItem[]{
 const session=sessions.find(s=>s.id===topic.sessionId && s.mode==='topic');
 const ids=new Set(signals.filter(s=>s.topicId===topic.id && s.sessionId===topic.sessionId).flatMap(s=>s.itemId ? [s.itemId] : []));
 return (session?.items ?? []).filter(i=>ids.has(i.id));
}
export function createTopicReadingRunner(storage:StorageAreaLike,generate=generateTopicReading,now=()=>new Date().toISOString()) {
 type Flight={promise:Promise<TopicReadingRecord>;running:Extract<TopicReadingRecord,{status:'running'}>};
 const flights=new Map<string,Flight>();
 const latest=new Map<string,string>();
 function track(flightKey:string,flight:Flight,pending:Promise<TopicReadingRecord>):Promise<TopicReadingRecord>{
  const promise=pending.finally(()=>{if(flights.get(flightKey)===flight && flight.promise===promise)flights.delete(flightKey);});
  flight.promise=promise;return promise;
 }
 return (topic:Topic,items:SessionItem[],settings:ExtensionSettings,inline:Record<string,InlineReadingRecord>={},deep:Record<string,DeepReadingRecord>={}):Promise<TopicReadingRecord>=>{
  const input=buildTopicReadingInput(topic,items,inline,deep);
  const provider=providerKeyFromSettings(settings);
  const model=provider ? deepModel(provider.provider,settings.deepReadingModels) : '';
  const flightKey=JSON.stringify([topic.id,input.inputHash,model]);
  const existing=flights.get(flightKey);
  const alreadyLatest=latest.get(topic.id)===flightKey;
  latest.set(topic.id,flightKey);
  const isCurrent=()=>latest.get(topic.id)===flightKey;
  const validate=()=>{const key=providerKeyFromSettings(settings);if(!key)throw new Error(aiKeyGap(settings) || '設定未選 AI provider');if(!input.posts.length)throw new Error('未有讀完嘅貼文');return key;};
  const publish=(record:TopicReadingRecord)=>saveTopicReadingRecordIfInput(storage,record,input.inputHash,isCurrent);
  if(existing){
   if(alreadyLatest)return existing.promise;
   const settled=existing.promise.then(record=>({record}),error=>({error}));
   // Returning to A while B runs reuses A's generation, but reactivates its storage identity.
   const resumed=Promise.resolve().then(async()=>{
    validate();
    await saveTopicReadingRecord(storage,existing.running,isCurrent);
    try{const result=await settled;if('error' in result)throw result.error;await publish(result.record);return result.record;}
    catch(e){await publish({...existing.running,status:'failed',error:e instanceof Error ? e.message : String(e),at:now()});throw e;}
   });
   return track(flightKey,existing,resumed);
  }
  const at=now();
  const metadata={coverage:input.coverage,topicId:topic.id,signature:input.signature,inputHash:input.inputHash,budgetVersion:input.budgetVersion,question:input.question,promptVersion:TOPIC_READING_PROMPT_VERSION,model,inputPostCount:input.posts.length,omittedPostCount:input.omittedPostCount,estimatedCost:estimateDeepReadingCost(buildTopicReadingPrompt(input).length+TOPIC_READING_SYSTEM_PROMPT.length,model,at)};
  const running:Extract<TopicReadingRecord,{status:'running'}>={...metadata,status:'running',startedAt:at};
  const flight:Flight={running,promise:undefined as unknown as Promise<TopicReadingRecord>};
  const run=Promise.resolve().then(async()=>{
   const key=validate();
   await saveTopicReadingRecord(storage,running,isCurrent);
   try{const reading=await generate(key.provider,key.apiKey,input,model);const record:TopicReadingRecord={...metadata,status:'complete',generatedAt:now(),reading,refs:input.refs};await publish(record);return record;}
   catch(e){await publish({...metadata,status:'failed',error:e instanceof Error ? e.message : String(e),at:now()});throw e;}
  });
  flights.set(flightKey,flight);return track(flightKey,flight,run);
 };
}
