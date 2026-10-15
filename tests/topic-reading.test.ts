import { DEEP_READING_PROMPT_VERSION } from '../src/compare/deep-reading.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopicReadingInput, buildTopicReadingPrompt, topicReadingPacket, TOPIC_READING_CHARACTER_BUDGET, parseTopicReadingResponse, topicReadingSignature } from '../src/compare/topic-reading.ts';
import type { SessionItem } from '../src/state/types.ts';
const deepItem = () => ({id:'post',status:'succeeded',descriptor:{author_hint:'op',text_snippet:'RAG'},latestCapture:{id:'c1',result:{canonical_post:{author:'op',text:'作者講檢索'},comments:[{comment_id:'q',author:'fan',text:'點樣做？',like_count:3},{comment_id:'a',author:'op',text:'用RAG',like_count:1}]},analysis:{clusters:[]}}} as unknown as SessionItem);
import type { Topic } from '../src/state/types.ts';
const topic={id:'t',name:'檢索',context:{researchQuestion:'點樣做？'}} as Topic;
test('topic input preserves parseable budget and top five reply refs',()=>{
 const item=deepItem();item.latestCapture!.result!.comments=Array.from({length:9},(_,i)=>({comment_id:String(i),text:'字'.repeat(5000),author:'fan',like_count:i})) as any;
 const input=buildTopicReadingInput(topic,Array.from({length:5},(_,i)=>({...item,id:String(i)})));
 assert.ok(JSON.stringify(topicReadingPacket(input)).length<=TOPIC_READING_CHARACTER_BUDGET);
 assert.equal(input.posts[0].replies.length,5);assert.equal(input.posts[0].replies[0].commentId,'8');
 assert.equal(input.refs[0].ref,'p1');assert.equal(input.refs[1].ref,'p1.r1');
 assert.equal(topicReadingSignature([item,{...item,id:'a'}]),topicReadingSignature([{...item,id:'a'},item]));
});
test('topic parser drops whole point with unresolved ref and caps text',()=>{
 const input=buildTopicReadingInput(topic,[deepItem()]);
 const r=parseTopicReadingResponse(JSON.stringify({answer:'回答。仍有未明。',points:[{text:'字'.repeat(900),refs:['p1']},{text:'第二點',refs:['p1.r1']},{text:'bad',refs:['p1','p99']}],gaps:[{text:'未驗證'}]}),input)!;
 assert.equal(r.points.length,2);assert.equal(r.points[0].text.length,240);assert.equal(parseTopicReadingResponse('bad',input),null);
});
import { generateTopicReading } from '../src/compare/provider.ts';
import { createTopicReadingRunner } from '../src/state/topic-reading-run.ts';
import { loadTopicReadingRecords, saveTopicReadingRecord, topicReadingStale } from '../src/compare/topic-reading-storage.ts';
import { createDefaultSettings } from '../src/state/types.ts';
const payload={answer:'提供檢索方法。未有驗證。',points:[{text:'作者自述',refs:['p1']},{text:'觀眾提問',refs:['p1.r1']}],gaps:[]};
function storage(){const data:Record<string,unknown>={};return {data,async get(k:string){return {[k]:data[k]};},async set(v:Record<string,unknown>){Object.assign(data,v);}};}
test('topic provider repairs malformed JSON once using stronger model',async()=>{
 const prior=globalThis.fetch;let calls=0;const urls:string[]=[];
 globalThis.fetch=async(u)=>{urls.push(String(u));calls++;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:calls===1 ? 'bad' : JSON.stringify(payload)}]}}]}));};
 try{await generateTopicReading('google','key',buildTopicReadingInput(topic,[deepItem()]));assert.equal(calls,2);assert.match(urls[0],/gemini-3\.8-flash/);}finally{globalThis.fetch=prior;}
});
test('topic runner key gap, empty capture, single flight, completion and staleness',async()=>{
 const s=storage();let calls=0;const runner=createTopicReadingRunner(s,async()=>{calls++;return payload;},()=> '2026-10-14T00:00:00Z');const settings=createDefaultSettings();
 await assert.rejects(runner(topic,[deepItem()],settings),/設定未填 Google API key/);assert.equal(calls,0);
 settings.googleApiKey='key';await assert.rejects(runner(topic,[],settings),/未有讀完嘅貼文/);
 const a=runner(topic,[deepItem()],settings),b=runner(topic,[deepItem()],settings);assert.equal(a,b);const r=await a;assert.equal(calls,1);assert.equal((await loadTopicReadingRecords(s)).t.status,'complete');
 assert.equal(topicReadingStale(r,topicReadingSignature([deepItem()]),'點樣做？'),false);assert.equal(topicReadingStale(r,'changed'),true);assert.equal(topicReadingStale(r,r.signature,'改問題'),true);assert.equal(topicReadingStale({...r,promptVersion:'old'},r.signature),true);
 await Promise.all([saveTopicReadingRecord(s,r),saveTopicReadingRecord(s,{...r,topicId:'other'})]);assert.equal(Object.keys(await loadTopicReadingRecords(s)).length,2);
});
test('topic runner persists failure and releases lock',async()=>{
 const s=storage();const settings={...createDefaultSettings(),googleApiKey:'key'};let fail=true;
 const runner=createTopicReadingRunner(s,async()=>{if(fail)throw new Error('quota');return payload;});
 await assert.rejects(runner(topic,[deepItem()],settings),/quota/);assert.equal((await loadTopicReadingRecords(s)).t.status,'failed');fail=false;assert.equal((await runner(topic,[deepItem()],settings)).status,'complete');
});

test('large topics preserve every root fairly before resorting to disclosed subset',()=>{
 const item=deepItem();const roots=Array.from({length:150},(_,i)=>({...item,id:String(i)}));
 const input=buildTopicReadingInput({...topic,context:{...topic.context!,researchQuestion:'   '},name:'fallback'},roots);
 assert.equal(input.question,'fallback');assert.equal(input.posts.length,150);assert.equal(input.omittedPostCount,0);assert.ok(JSON.stringify(topicReadingPacket(input)).length<=TOPIC_READING_CHARACTER_BUDGET);assert.ok(!buildTopicReadingPrompt(input).includes('signature'));
 const huge=buildTopicReadingInput(topic,Array.from({length:1000},(_,i)=>({...item,id:'post-'+i})));
 assert.ok(huge.omittedPostCount>0);assert.ok(JSON.stringify(topicReadingPacket(huge)).length<=TOPIC_READING_CHARACTER_BUDGET);assert.equal(huge.posts.length+huge.omittedPostCount,1000);
});

test('topic output cannot invent explicit counts or percentages absent from packet',()=>{
 const input=buildTopicReadingInput(topic,[deepItem()]);
 assert.equal(parseTopicReadingResponse(JSON.stringify({...payload,answer:'99% 觀眾同意。'}),input),null);
 const parsed=parseTopicReadingResponse(JSON.stringify({...payload,points:[...payload.points,{text:'有99人同意',refs:['p1']}]}),input)!;
 assert.equal(parsed.points.length,2);
});
test('topic malformed repair fails after exactly two calls',async()=>{
 const prior=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'bad'}]}}]}));};
 try{await assert.rejects(generateTopicReading('google','key',buildTopicReadingInput(topic,[deepItem()])),/格式無效/);assert.equal(calls,2);}finally{globalThis.fetch=prior;}
});
test('topic packet contains only matching current capture quick/deep readings',()=>{
 const item=deepItem();item.latestCapture!.analysis!.clusters=[{cluster_key:1,size_share:0.25,keywords:['方法']}] as any;
 const inline:any={post:{status:'complete',captureId:'c1',reading:{promptVersion:'v3',gist:'方法',clusterNames:{'1':'方法'},methods:[{name:'檢索',fit:'需求'}],split:{sides:[{claim:'有用',why:'自述'}]},find:{ask:'點樣做？'}}}};
 const deep:any={post:{status:'complete',captureId:'c1',promptVersion:DEEP_READING_PROMPT_VERSION,reading:{takeaway:'先測試'}}};
 const input=buildTopicReadingInput(topic,[item],inline,deep);assert.match(JSON.stringify(input.posts),/方法/);assert.match(JSON.stringify(input.posts),/"pct":25/);assert.equal(input.posts[0].takeaway,'先測試');
 inline.post.captureId='old';deep.post.promptVersion='old';const stale=buildTopicReadingInput(topic,[item],inline,deep);assert.equal(stale.posts[0].audience,null);assert.equal(stale.posts[0].takeaway,'');
});
import { selectTopicReadingItems } from '../src/state/topic-reading-run.ts';
test('quantity guard keeps units and never authorizes percent from refs/id/likes',()=>{
 const input=buildTopicReadingInput(topic,[deepItem()]);
 for(const answer of ['1% 同意','3% 同意','3人同意','三成同意','百分之三十同意'])assert.equal(parseTopicReadingResponse(JSON.stringify({...payload,answer}),input),null);
 input.posts[0].text='作者自述有3人及30%測試；三成並非觀眾共識';
 assert.ok(parseTopicReadingResponse(JSON.stringify({...payload,answer:'作者自述3人。30% 測試。'}),input));
 assert.equal(parseTopicReadingResponse(JSON.stringify({...payload,answer:'3% 同意'}),input),null);
 input.posts[0].audience={clusters:[{name:'方法',pct:25}]};
 assert.ok(parseTopicReadingResponse(JSON.stringify({...payload,answer:'提供的分群為25%。仍未驗證。'}),input));
 assert.ok(parseTopicReadingResponse(JSON.stringify({...payload,answer:'讀了1篇。仍未驗證。'}),input));
});
test('all unresolved points make reading invalid rather than publish ungrounded answer',()=>{
 const input=buildTopicReadingInput(topic,[deepItem()]);
 assert.equal(parseTopicReadingResponse(JSON.stringify({...payload,points:[{text:'推測',refs:['p99']}]}),input),null);
});
test('background selection uses signal topicId and session identity, ignoring stale signalIds',()=>{
 const t={...topic,sessionId:'session',signalIds:['stale']};const item=deepItem();
 const sessions:any=[{id:'session',mode:'topic',items:[item,{...item,id:'other'}]},{id:'wrong',mode:'topic',items:[{...item,id:'foreign'}]}];
 const signals:any=[{id:'real',topicId:'t',sessionId:'session',itemId:'post'},{id:'stale',topicId:'different',sessionId:'session',itemId:'other'},{id:'wrong',topicId:'t',sessionId:'wrong',itemId:'other'}];
 assert.deepEqual(selectTopicReadingItems(t,sessions,signals).map(i=>i.id),['post']);
});
test('budget never retains roots stripped of their source text',()=>{
 const item=deepItem();item.latestCapture!.result!.canonical_post!.text='字'.repeat(280);
 const input=buildTopicReadingInput(topic,Array.from({length:1000},(_,i)=>({...item,id:String(i)})));
 assert.ok(input.omittedPostCount>0);assert.ok(input.posts.every(p=>p.text.length>=120));assert.ok(JSON.stringify(topicReadingPacket(input)).length<=TOPIC_READING_CHARACTER_BUDGET);
});
test('all-invalid grounded points invoke one provider repair',async()=>{
 const prior=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(calls===1 ? {...payload,points:[{text:'bad',refs:['p99']}]} : payload)}]}}]}));};
 try{await generateTopicReading('google','key',buildTopicReadingInput(topic,[deepItem()]));assert.equal(calls,2);}finally{globalThis.fetch=prior;}
});

test('one grounded point is invalid; accepted storage records retain two to four',()=>{
 const input=buildTopicReadingInput(topic,[deepItem()]);
 assert.equal(parseTopicReadingResponse(JSON.stringify({...payload,points:payload.points.slice(0,1)}),input),null);
 assert.equal(parseTopicReadingResponse(JSON.stringify(payload),input)!.points.length,2);
});
test('initial storage write failure releases topic flight for a succeeding run',async()=>{
 const data=storage();let fail=true;let generated=0;
 const s={get:data.get,set:async(v:Record<string,unknown>)=>{if(fail)throw new Error('disk');await data.set(v);}};
 const runner=createTopicReadingRunner(s,async()=>{generated++;return payload;});const settings={...createDefaultSettings(),googleApiKey:'key'};
 await assert.rejects(runner(topic,[deepItem()],settings),/disk/);assert.equal(generated,0);
 fail=false;const record=await runner(topic,[deepItem()],settings);assert.equal(record.status,'complete');assert.equal(generated,1);assert.equal((await loadTopicReadingRecords(s)).t.status,'complete');
});
test('blank root content is omitted without granting an evidence ref',()=>{
 const item=deepItem();item.latestCapture!.result!.canonical_post!.text='   ';item.descriptor.text_snippet='';
 const input=buildTopicReadingInput(topic,[item]);assert.equal(input.posts.length,0);assert.equal(input.refs.length,0);assert.equal(input.omittedPostCount,1);
});
