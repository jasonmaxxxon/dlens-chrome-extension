import type { SessionItem, ExtensionSettings, Topic, SessionRecord, Signal } from './types.ts';
import { aiKeyGap, providerKeyFromSettings } from './ai-key.ts';
import { buildTopicReadingInput, buildTopicReadingPrompt, TOPIC_READING_PROMPT_VERSION, TOPIC_READING_SYSTEM_PROMPT } from '../compare/topic-reading.ts';
import { deepModel, estimateDeepReadingCost } from '../compare/deep-reading.ts';
import { generateTopicReading } from '../compare/provider.ts';
import { saveTopicReadingRecord, type TopicReadingRecord } from '../compare/topic-reading-storage.ts';
import type { StorageAreaLike, InlineReadingRecord } from '../compare/inline-reading-storage.ts';
import type { DeepReadingRecord } from '../compare/deep-reading-storage.ts';
/** Same membership as discourse VM: topicId is authoritative, bounded to the topic's session. */
export function selectTopicReadingItems(topic:Topic,sessions:SessionRecord[],signals:Signal[]):SessionItem[]{
 const session=sessions.find(s=>s.id===topic.sessionId && s.mode==='topic');
 const ids=new Set(signals.filter(s=>s.topicId===topic.id && s.sessionId===topic.sessionId).flatMap(s=>s.itemId ? [s.itemId] : []));
 return (session?.items ?? []).filter(i=>ids.has(i.id));
}
export function createTopicReadingRunner(storage:StorageAreaLike,generate=generateTopicReading,now=()=>new Date().toISOString()) {
 const flights=new Map<string,Promise<TopicReadingRecord>>();
 return (topic:Topic,items:SessionItem[],settings:ExtensionSettings,inline:Record<string,InlineReadingRecord>={},deep:Record<string,DeepReadingRecord>={}):Promise<TopicReadingRecord>=>{
  const existing=flights.get(topic.id);if(existing)return existing;
  const run=Promise.resolve().then(async()=>{
   const key=providerKeyFromSettings(settings);if(!key)throw new Error(aiKeyGap(settings) || '設定未選 AI provider');
   const input=buildTopicReadingInput(topic,items,inline,deep);if(!input.posts.length)throw new Error('未有讀完嘅貼文');
   const model=deepModel(key.provider,settings.deepReadingModels),at=now();
   const metadata={topicId:topic.id,signature:input.signature,question:input.question,promptVersion:TOPIC_READING_PROMPT_VERSION,model,inputPostCount:input.posts.length,omittedPostCount:input.omittedPostCount,estimatedCost:estimateDeepReadingCost(buildTopicReadingPrompt(input).length+TOPIC_READING_SYSTEM_PROMPT.length,model,at)};
   await saveTopicReadingRecord(storage,{...metadata,status:'running',startedAt:at});
   try{const reading=await generate(key.provider,key.apiKey,input,model);const record:TopicReadingRecord={...metadata,status:'complete',generatedAt:now(),reading,refs:input.refs};await saveTopicReadingRecord(storage,record);return record;}
   catch(e){await saveTopicReadingRecord(storage,{...metadata,status:'failed',error:e instanceof Error ? e.message : String(e),at:now()});throw e;}
  }).finally(()=>flights.delete(topic.id));flights.set(topic.id,run);return run;
 };
}
