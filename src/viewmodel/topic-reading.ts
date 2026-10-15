import type { ExtensionSettings, SessionItem, Topic } from '../state/types';
import type { InlineReadingRecord } from '../compare/inline-reading-storage';
import type { DeepReadingRecord } from '../compare/deep-reading-storage';
import { buildTopicReadingInput, buildTopicReadingPrompt, TOPIC_READING_SYSTEM_PROMPT } from '../compare/topic-reading';
import { topicReadingStale, type TopicReadingRecord } from '../compare/topic-reading-storage';
import { deepModel, estimateDeepReadingCost } from '../compare/deep-reading';
export function buildTopicReadingModel(topic:Topic,items:SessionItem[],settings:ExtensionSettings,stored:TopicReadingRecord|undefined,now:string,pending=false,error:string|null=null,inline:Record<string,InlineReadingRecord>={},deep:Record<string,DeepReadingRecord>={}) {
 const input=buildTopicReadingInput(topic,items,inline,deep);
 const model=deepModel(settings.oneLinerProvider || 'google',settings.deepReadingModels);
 const stale=stored ? topicReadingStale(stored,input.signature,input.question) : false;
 const dead=stored?.status==='running' && Date.parse(now)-Date.parse(stored.startedAt)>180_000;
 const state=pending ? 'reading' : error ? 'error' : stale ? 'stale' : stored?.status==='complete' ? 'done' : stored?.status==='failed'||dead ? 'error' : stored?.status==='running' ? 'reading' : 'offer';
 const estimate=stored && !stale ? stored.estimatedCost : estimateDeepReadingCost(buildTopicReadingPrompt(input).length+TOPIC_READING_SYSTEM_PROMPT.length,model,now);
 const complete=stored?.status==='complete' ? stored : null;
 return {sourceItems:items,topicId:topic.id,state,staleLabel:stored?.signature!==input.signature?"有新貼文":"研究問題或解讀方式已更新",model:state==='done' && stored ? stored.model : model,postCount:pending||stale||!stored?input.posts.length:stored.inputPostCount,
  omittedPostCount:pending||stale||!stored?input.omittedPostCount:(stored.omittedPostCount ?? 0),uncapturedCount:items.filter(i=>!i.latestCapture?.id).length,
  cost:estimate?`約 $${estimate.usd.toFixed(3)}`:'未有價目',reading:complete?.reading ?? null,refs:complete?.refs ?? [],
  error:error || (stored?.status==='failed'?stored.error:dead?'上次解讀中斷，請重試':null)};
}
export type TopicReadingModel=ReturnType<typeof buildTopicReadingModel>;
