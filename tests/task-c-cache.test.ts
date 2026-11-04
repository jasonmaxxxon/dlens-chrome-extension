import assert from 'node:assert/strict';
import test from 'node:test';
import {createTopicReadingRunner} from '../src/state/topic-reading-run';
import {createDefaultSettings,type SessionItem,type Topic} from '../src/state/types';
import {loadTopicReadingRecords} from '../src/compare/topic-reading-storage';
import {buildTopicReadingInput,type TopicReading} from '../src/compare/topic-reading';
import type {StorageAreaLike} from '../src/compare/inline-reading-storage';
import {inlineReadingFinishedAt} from '../src/viewmodel/inline-card';
import {buildInlineReadingInput,inlineReadingInputHash,INLINE_READING_PROMPT_VERSION} from '../src/compare/inline-reading';
import {COMMENT_ELIGIBILITY_VERSION} from '../src/compare/comment-eligibility';

function storage():StorageAreaLike {const data:Record<string,unknown>={};return {async get(k){return {[k]:data[k]};},async set(v){Object.assign(data,v);}};}
function deferred(){let resolve!:(reading:TopicReading)=>void;let reject!:(error:Error)=>void;const promise=new Promise<TopicReading>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const topic={id:'t',name:'合成問題',context:{researchQuestion:'點樣做？'}} as Topic;
const item=(text:string)=>({id:'post',status:'succeeded',descriptor:{author_hint:'op'},latestCapture:{id:'same',result:{canonical_post:{author:'op',text:'合成貼文'},comments:[{comment_id:'r',author:'fan',text,like_count:2}]},analysis:{clusters:[]}}} as unknown as SessionItem);
const answer=(text:string):TopicReading=>({answer:text,points:[{text:'作者原文',refs:['p1']},{text:'觀眾原文',refs:['p1.r1']}],gaps:[]});

test('only a current running reading can hold the finished capture busy',()=>{
 const source=item('有冇教學？');source.completedAt='2026-11-03T00:00:00Z';
 source.latestCapture!.analysis!.status='succeeded';
 const running={status:'running' as const,itemId:source.id,captureId:'same',startedAt:'2026-11-03T00:00:00Z'};
 assert.equal(inlineReadingFinishedAt(source,running,0),source.completedAt);
 const current={...running,promptVersion:INLINE_READING_PROMPT_VERSION,eligibilityVersion:COMMENT_ELIGIBILITY_VERSION,inputHash:inlineReadingInputHash(buildInlineReadingInput(source)!)};
 assert.equal(inlineReadingFinishedAt(source,current,0),null);
 assert.equal(inlineReadingFinishedAt(source,{...current,inputHash:'old'},0),source.completedAt);
});

test('topic same-input calls share a flight, but changed same-capture input supersedes old completion or failure',async()=>{
 for(const lateFails of [false,true]){
  const s=storage(),old=deferred(),fresh=deferred();let calls=0;
  const runner=createTopicReadingRunner(s,async(_provider,_key,input)=>{calls++;return input.posts[0].replies[0].text==='舊原句' ? old.promise : fresh.promise;});
  const settings={...createDefaultSettings(),googleApiKey:'synthetic-key'};
  const a=runner(topic,[item('舊原句')],settings);
  assert.equal(runner(topic,[item('舊原句')],settings),a);
  // Wait until the first generator starts; both packets then remain in flight.
  for(let i=0;i<20 && calls<1;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);
  const b=runner(topic,[item('新原句')],settings);
  assert.notEqual(a,b);
  for(let i=0;i<20 && calls<2;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,2);
  fresh.resolve(answer('新閱讀。仍待驗證。'));await b;
  if(lateFails){old.reject(new Error('old failure'));await assert.rejects(a,/old failure/);}else{old.resolve(answer('舊閱讀。仍待驗證。'));await a;}
  const final=(await loadTopicReadingRecords(s)).t;
  assert.equal(final.status,'complete');assert.equal(final.inputHash,buildTopicReadingInput(topic,[item('新原句')]).inputHash);
  if(final.status==='complete')assert.equal(final.reading.answer,'新閱讀。仍待驗證。');
 }
});
