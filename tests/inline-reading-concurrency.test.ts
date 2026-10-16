import assert from 'node:assert/strict';
import test from 'node:test';
import {createInlineReadingRunner} from '../src/state/inline-reading-run';
import {loadInlineReadingRecords,type StorageAreaLike} from '../src/compare/inline-reading-storage';
import {buildInlineReadingInput,INLINE_READING_PROMPT_VERSION,type InlineReading} from '../src/compare/inline-reading';
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
