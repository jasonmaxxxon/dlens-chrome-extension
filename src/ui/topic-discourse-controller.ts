import type { ExtensionMessage, ExtensionResponse } from '../state/messages';
import type { Topic } from '../state/types';
type Send=(message:ExtensionMessage)=>Promise<ExtensionResponse>;
/** Use the existing triage path for a row-owned sheet; a question is added through topic/update. */
export async function createDiscourseTopic(send:Send,sessionId:string,name:string,researchQuestion:string,signalId?:string) {
 const response=await send(signalId?{type:'signal/triage',signalId,action:{kind:'create-topic',name:name.trim()}}:{type:'topic/create',sessionId,name:name.trim(),context:{researchQuestion:researchQuestion.trim()}});
 if(!response.ok)throw new Error(response.error);
 let topics=response.topics;
 const created=signalId?topics?.find(t=>t.signalIds.includes(signalId)):null;
 if(created && researchQuestion.trim()){
  const updated=await send({type:'topic/update',id:created.id,patch:{context:{...created.context,researchQuestion:researchQuestion.trim()}}});
  if(!updated.ok)throw new Error(updated.error);
  topics=updated.topics ?? topics;
 }
 return {topics,signals:response.signals};
}
export function discourseQuestionPatch(topic:Topic,researchQuestion:string):Extract<ExtensionMessage,{type:"topic/update"}> {
 return {type:'topic/update',id:topic.id,patch:{context:{...topic.context,researchQuestion:researchQuestion.trim()}}};
}
/** The origin is independent of the workspace the reader may have opened afterwards. */
export async function restoreDiscourseReaderOrigin(origin:{sessionId:string;topicId:string|null},activeSessionId:string|undefined,page:string,
 setSession:(id:string)=>Promise<unknown>,navigate:(page:'topics')=>Promise<unknown>) {
 if(activeSessionId!==origin.sessionId)await setSession(origin.sessionId);
 if(activeSessionId!==origin.sessionId || page!=='topics')await navigate('topics');
 return origin;
}
