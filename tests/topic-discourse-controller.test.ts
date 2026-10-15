import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscourseTopic,discourseQuestionPatch,restoreDiscourseReaderOrigin} from '../src/ui/topic-discourse-controller.ts';
import type {ExtensionMessage,ExtensionResponse} from '../src/state/messages.ts';
import type {Topic} from '../src/state/types.ts';
test('home creates with and without a question; row sheet triages its post then updates question',async()=>{
 const sent:ExtensionMessage[]=[];const created={id:'t',signalIds:['s'],context:{intent:'keep'}} as unknown as Topic;
 const send=async(message:ExtensionMessage):Promise<ExtensionResponse>=>{sent.push(message);return {ok:true,topics:[created],signals:[]};};
 await createDiscourseTopic(send,'folder',' Name ','');assert.deepEqual(sent.pop(),{type:'topic/create',sessionId:'folder',name:'Name',context:{researchQuestion:''}});
 await createDiscourseTopic(send,'folder','Name','Q');assert.deepEqual(sent.pop(),{type:'topic/create',sessionId:'folder',name:'Name',context:{researchQuestion:'Q'}});
 await createDiscourseTopic(send,'folder','Name','Q','s');assert.deepEqual(sent,[{type:'signal/triage',signalId:'s',action:{kind:'create-topic',name:'Name'}},{type:'topic/update',id:'t',patch:{context:{intent:'keep',researchQuestion:'Q'}}}]);
 assert.deepEqual(discourseQuestionPatch(created,' Q '),{type:'topic/update',id:'t',patch:{context:{intent:'keep',researchQuestion:'Q'}}});
});
test('reader restores original folder and topics route after opening another workspace',async()=>{
 const actions:string[]=[];const origin={sessionId:'a',topicId:'t'};
 const result=await restoreDiscourseReaderOrigin(origin,'b','signals',async id=>actions.push(id),async page=>actions.push(page));
 assert.deepEqual(actions,['a','topics']);assert.deepEqual(result,origin);
 actions.length=0;await restoreDiscourseReaderOrigin(origin,'a','topics',async id=>actions.push(id),async page=>actions.push(page));assert.deepEqual(actions,[]);
 await assert.rejects(restoreDiscourseReaderOrigin(origin,'b','signals',async()=>{throw new Error('failed');},async page=>actions.push(page)),/failed/);
 assert.deepEqual(actions,[],'failed folder restoration must not proceed to topics');
});
