import assert from 'node:assert/strict';
import test from 'node:test';
import {createInlineReadingRunner} from '../src/state/inline-reading-run';
import {loadInlineReadingRecords,saveInlineReadingRecord,type StorageAreaLike} from '../src/compare/inline-reading-storage';
import {buildInlineReadingInput,inlineReadingInputHash,INLINE_READING_PROMPT_VERSION,type InlineReading} from '../src/compare/inline-reading';
import {COMMENT_ELIGIBILITY_VERSION} from '../src/compare/comment-eligibility';
function storage():StorageAreaLike {const data:Record<string,unknown>={};return {async get(k){return {[k]:data[k]};},async set(v){Object.assign(data,v);}};}
function input(capture:string){return buildInlineReadingInput({id:'i',descriptor:{author_hint:'op'},latestCapture:{id:capture,result:{canonical_post:{text:'合成帖子'},comments:[{comment_id:'r',author:'fan',text:'合成留言。'}]},analysis:{clusters:[]}}} as any)!;}
function deferred(){let resolve!:(reading:InlineReading)=>void;const promise=new Promise<InlineReading>(r=>{resolve=r;});return {promise,resolve};}
function reading(captureId:string):InlineReading{return {itemId:'i',captureId,promptVersion:INLINE_READING_PROMPT_VERSION,model:'synthetic',generatedAt:'2026-10-15',gist:'合成結論。',find:{method:'方法。',split:'未見分歧。',ask:'問題。'},clusterNames:{},noiseClusters:[],methods:[],split:{agree:'',sides:[]}};}
test('two captures of one item can generate concurrently and an older completion cannot replace the new result',async()=>{
 const s=storage(),a=deferred(),b=deferred();const calls:string[]=[];
 const ensure=createInlineReadingRunner(s);const run=(x:ReturnType<typeof input>)=>ensure(x,async()=>{calls.push(x.captureId);return x.captureId==='a'?a.promise:b.promise;});
 const first=await run(input('a'));const second=await run(input('b'));
 assert.equal(first.status,'started');assert.equal(second.status,'started');assert.deepEqual(calls,['a','b']);
 b.resolve(reading('b'));if('completion' in second)await second.completion;
 a.resolve(reading('a'));if('completion' in first)await first.completion;
 assert.equal((await loadInlineReadingRecords(s)).i.captureId,'b');
});
test('same capture requests deduplicate before storage reads complete and initial write failures release the lock',async()=>{
 const s=storage(),d=deferred();let calls=0;const ensure=createInlineReadingRunner(s);const run=(x:ReturnType<typeof input>)=>ensure(x,async()=>{calls++;return d.promise;});
 const [a,b]=await Promise.all([run(input('a')),run(input('a'))]);assert.deepEqual([a.status,b.status].sort(),['exists','started']);assert.equal(calls,1);
 d.resolve(reading('a'));for(const result of [a,b])if('completion' in result)await result.completion;
 let fail=true;const broken:StorageAreaLike={get:s.get,set:async v=>{if(fail)throw new Error('disk');await s.set(v);}};
 const ensureRetry=createInlineReadingRunner(broken);const retry=(x:ReturnType<typeof input>)=>ensureRetry(x,async()=>reading('b'));
 await assert.rejects(retry(input('b')),/disk/);fail=false;const recovered=await retry(input('b'));assert.equal(recovered.status,'started');if('completion' in recovered)await recovered.completion;
});

test('legacy prompt or absent eligibility identity regenerates the same capture; current identity is reused',async()=>{
 for(const old of [{promptVersion:'v4'}, {promptVersion:INLINE_READING_PROMPT_VERSION}, {promptVersion:INLINE_READING_PROMPT_VERSION,inputHash:inlineReadingInputHash(input('a'))}]){
  const s=storage();let calls=0;
  await saveInlineReadingRecord(s,{status:'complete',itemId:'i',captureId:'a',reading:{...reading('a'),...old}});
  const ensure=createInlineReadingRunner(s);
  const run=await ensure(input('a'),async()=>{calls++;return reading('a');});
  assert.equal(run.status,'started');if('completion' in run)await run.completion;
  const current=(await loadInlineReadingRecords(s)).i;
  assert.equal(current.inputHash,inlineReadingInputHash(input('a')));
  assert.equal(current.eligibilityVersion,COMMENT_ELIGIBILITY_VERSION);
  assert.equal((await ensure(input('a'),async()=>{calls++;return reading('a');})).status,'exists');
  assert.equal(calls,1);
 }
});

test('changed eligible input in one capture supersedes an earlier completion and failure',async()=>{
 for(const lateFails of [false,true]){
  const s=storage(),newer=deferred();let finishOld!:(value:InlineReading)=>void;let failOld!:(reason:Error)=>void;
  const older=new Promise<InlineReading>((resolve,reject)=>{finishOld=resolve;failOld=reject;});
  const ensure=createInlineReadingRunner(s);
  const first=await ensure(input('a'),()=>older);
  const changed=input('a');changed.catalog[0].text='更新後觀眾原句。';
  const second=await ensure(changed,()=>newer.promise);
  assert.equal(first.status,'started');assert.equal(second.status,'started');
  newer.resolve({...reading('a'),gist:'新輸入結論。'});if('completion' in second)await second.completion;
  if(lateFails)failOld(new Error('old request'));else finishOld(reading('a'));
  if('completion' in first)await first.completion;
  const final=(await loadInlineReadingRecords(s)).i;
  assert.equal(final.status,'complete');
  assert.equal(final.inputHash,inlineReadingInputHash(changed));
  if(final.status==='complete')assert.equal(final.reading.gist,'新輸入結論。');
 }
});

test('returning to an in-flight input restores its identity without a third generation',async()=>{
 for(const aFirst of [false,true])for(const bFails of [false,true]){
  const s=storage(),a=deferred();let resolveB!:(reading:InlineReading)=>void,rejectB!:(error:Error)=>void;
  const b=new Promise<InlineReading>((resolve,reject)=>{resolveB=resolve;rejectB=reject;});
  const ensure=createInlineReadingRunner(s);let calls=0;
  const original=input('same'),changed=input('same');changed.catalog[0].text='另一個輸入B';
  const runA=()=>ensure(original,()=>{calls++;return a.promise;});
  const first=await runA();const second=await ensure(changed,()=>{calls++;return b;});const third=await runA();
  assert.equal(calls,2);
  const finishA=async()=>{a.resolve({...reading('same'),gist:'A結論'});if('completion' in first)await first.completion;};
  const finishB=async()=>{if(bFails)rejectB(new Error('B failure'));else resolveB({...reading('same'),gist:'B結論'});if('completion' in second)await second.completion;};
  if(aFirst){await finishA();await finishB();}else{await finishB();await finishA();}
  if('completion' in third)await third.completion;
  const final=(await loadInlineReadingRecords(s)).i;
  assert.equal(final.status,'complete');assert.equal(final.inputHash,inlineReadingInputHash(original));
  if(final.status==='complete')assert.equal(final.reading.gist,'A結論');
 }
});
