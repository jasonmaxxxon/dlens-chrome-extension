import assert from 'node:assert/strict';
import test from 'node:test';
import {createTopicReadingRunner} from '../src/state/topic-reading-run';
import {buildTopicReadingInput,type TopicReading} from '../src/compare/topic-reading';
import {loadTopicReadingRecords,saveTopicReadingRecord,saveTopicReadingRecordIfInput,type TopicReadingRecord} from '../src/compare/topic-reading-storage';
import type {StorageAreaLike} from '../src/compare/inline-reading-storage';
import {createDefaultSettings,type SessionItem,type Topic} from '../src/state/types';

function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function storage(){
 const data:Record<string,unknown>={};let nextRead:{entered:ReturnType<typeof deferred<void>>;release:ReturnType<typeof deferred<void>>}|null=null;
 const area:StorageAreaLike={async get(key){const paused=nextRead;nextRead=null;if(paused){paused.entered.resolve();await paused.release.promise;}return {[key]:data[key]};},async set(values){Object.assign(data,values);}};
 return {area,pauseNextRead(){const paused={entered:deferred<void>(),release:deferred<void>()};nextRead=paused;return paused;}};
}
const topic={id:'topic',name:'合成話題',context:{researchQuestion:'有甚麼做法？'}} as Topic;
const item=(text:string)=>({id:'item',status:'succeeded',descriptor:{author_hint:'op'},latestCapture:{id:'same-capture',result:{canonical_post:{author:'op',text:'合成原帖。'},comments:[{comment_id:'fan',author:'fan',text,like_count:3}]},analysis:{clusters:[]}}} as unknown as SessionItem);
const payload=(name:string):TopicReading=>({answer:`${name}結論。`,points:[{text:'作者自述。',refs:['p1']},{text:'觀眾原句。',refs:['p1.r1']}],gaps:[]});
function harness(){
 const s=storage(),a=deferred<TopicReading>(),b=deferred<TopicReading>(),startedA=deferred<void>(),startedB=deferred<void>();let generations=0;
 const aItem=item('甲方觀眾原句。'),bItem=item('乙方觀眾原句。');
 const runner=createTopicReadingRunner(s.area,async(_provider,_key,input)=>{generations++;if(input.posts[0].replies[0].text===aItem.latestCapture!.result!.comments![0].text){startedA.resolve();return a.promise;}startedB.resolve();return b.promise;});
 const settings={...createDefaultSettings(),googleApiKey:'synthetic'};
 return {...s,a,b,startedA,startedB,aItem,bItem,runA:()=>runner(topic,[aItem],settings),runB:()=>runner(topic,[bItem],settings),generations:()=>generations};
}
async function assertA(h:ReturnType<typeof harness>){
 const stored=(await loadTopicReadingRecords(h.area))[topic.id];assert.equal(stored.status,'complete');assert.equal(stored.inputHash,buildTopicReadingInput(topic,[h.aItem]).inputHash);if(stored.status==='complete')assert.equal(stored.reading.answer,'甲方結論。');assert.equal(h.generations(),2);
}
for(const order of ['A then B','B then A'] as const)test(`returning A reuses its flight and remains current when ${order} completes`,async()=>{
 const h=harness();const first=h.runA();await h.startedA.promise;const second=h.runB();await h.startedB.promise;const resumed=h.runA();assert.equal(h.runA(),resumed);
 if(order==='A then B'){h.a.resolve(payload('甲方'));await resumed;h.b.resolve(payload('乙方'));await second;}
 else{h.b.resolve(payload('乙方'));await second;h.a.resolve(payload('甲方'));await resumed;}
 await first;await assertA(h);
});
test('late B failure cannot replace reactivated A',async()=>{
 const h=harness();const first=h.runA();await h.startedA.promise;const second=h.runB();await h.startedB.promise;const failed=assert.rejects(second,/B failed/);const resumed=h.runA();h.a.resolve(payload('甲方'));await resumed;h.b.reject(new Error('B failed'));await failed;await first;await assertA(h);
});
test('reactivated A republishes after its original publication saw B storage',async()=>{
 const h=harness();const first=h.runA();await h.startedA.promise;const second=h.runB();await h.startedB.promise;
 const paused=h.pauseNextRead();h.a.resolve(payload('甲方'));await paused.entered.promise;const resumed=h.runA();paused.release.resolve();await resumed;await first;
 h.b.resolve(payload('乙方'));await second;await assertA(h);
});
test('queued activation and completion check latest after their storage read',async()=>{
 const h=harness();const first=h.runA();await h.startedA.promise;h.a.resolve(payload('甲方'));await first;
 const current=(await loadTopicReadingRecords(h.area))[topic.id];let latest=true;
 const activation=h.pauseNextRead();const write=saveTopicReadingRecord(h.area,{...current,status:'running',startedAt:'2026-11-03'},()=>latest);await activation.entered.promise;latest=false;activation.release.resolve();await write;
 assert.equal((await loadTopicReadingRecords(h.area))[topic.id].status,'complete');
 latest=true;const completion=h.pauseNextRead();const replacement:TopicReadingRecord={...current,status:'failed',error:'superseded',at:'2026-11-03'};const publication=saveTopicReadingRecordIfInput(h.area,replacement,current.inputHash!,()=>latest);await completion.entered.promise;latest=false;completion.release.resolve();assert.equal(await publication,false);assert.equal((await loadTopicReadingRecords(h.area))[topic.id].status,'complete');
});
