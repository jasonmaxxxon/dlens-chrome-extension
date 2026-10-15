import { DEEP_READING_PROMPT_VERSION } from '../src/compare/deep-reading.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeepReadingInput, buildDeepReadingPrompt, parseDeepReadingResponse, DEEP_REPLY_CHARACTER_BUDGET, estimateDeepReadingCost } from '../src/compare/deep-reading.ts';
import { renderReplyThreads } from '../src/compare/reply-thread.ts';
import type { SessionItem } from '../src/state/types.ts';
export const deepItem = () => ({ id:'deep-item', status:'succeeded', descriptor:{ author_hint:'op',text_snippet:'RAG embedding ontology' }, latestCapture:{ id:'c1', result:{ canonical_post:{ author:'op',text:'RAG embedding ontology' }, comments:[{comment_id:'q',author:'fan',text:'RAG 點樣做？',like_count:2,url:'https://www.threads.net/@fan/post/abc'}, {comment_id:'a',parent_comment_id:'q',author:'op',text:'我用 embedding 做檢索',like_count:1}] }, analysis:{clusters:[]} } } as unknown as SessionItem);
export const deepPayload = () => ({background:'呢篇討論檢索。作者講實作。',takeaway:'先定場景。',terms:[{term:'RAG',plain:'先檢索再生成。',refs:['e1']}],debates:[{question:'點樣做？',status:'open',sides:[{who:'作者',claim:'用 embedding',basis:'experience',note:'自述',refs:['e2']}]}],evidence:{strong:[{text:'自述實作',refs:['e2']}],weak:[]},unanswered:[]});
test('deep input keeps stable roles and pairs under a larger rendered budget',()=>{
 const item=deepItem(); const input=buildDeepReadingInput(item)!;
 assert.deepEqual(input.catalog.map(c=>c.role),['reply','op']);
 assert.match(buildDeepReadingPrompt(input),/↳.*e2.*作者/);
 assert.match(buildDeepReadingPrompt(input),/術語.*\n.*RAG/is);
 assert.match(buildDeepReadingPrompt(input),/不是觀眾/);
 item.latestCapture!.result!.comments = Array.from({length:250},(_,i)=>({comment_id:String(i),author:'fan',text:'RAG?'+ '字'.repeat(1800)})) as any;
 assert.ok(renderReplyThreads(buildDeepReadingInput(item)!.catalog).length<=DEEP_REPLY_CHARACTER_BUDGET);
 assert.ok(DEEP_REPLY_CHARACTER_BUDGET>=96000);
});
test('parser drops whole entries with unresolved refs and caps text',()=>{
 const payload=deepPayload(); payload.terms.push({term:'bad',plain:'bad',refs:['e1','e99']}); payload.terms[0].plain='字'.repeat(900);
 const parsed=parseDeepReadingResponse(JSON.stringify(payload),buildDeepReadingInput(deepItem())!)!;
 assert.equal(parsed.terms.length,1); assert.ok(parsed.terms[0].plain.length<=160);
 assert.equal(parseDeepReadingResponse('bad',buildDeepReadingInput(deepItem())!),null);
});
test('cost uses prompt characters, output cap, dated rates and unknown models honestly',()=>{
 assert.equal(estimateDeepReadingCost(2000,'gemini-3.8-flash','2026-10-13')!.usd, (1000*.75+4000*3.75)/1e6);
 assert.equal(estimateDeepReadingCost(2000,'gemini-3.8-flash','2027-01-01')!.usd, (1000*1.5+4000*7.5)/1e6);
 assert.equal(estimateDeepReadingCost(2000,'custom','2026-10-13'),null);
});

import { generateDeepReading, generateInlineReading } from '../src/compare/provider.ts';
import { buildInlineReadingInput } from '../src/compare/inline-reading.ts';
import { DEEP_READINGS_STORAGE_KEY, loadDeepReadingRecords, saveDeepReadingRecord, deepReadingStale, type DeepReadingRecord } from '../src/compare/deep-reading-storage.ts';
import { createDeepReadingRunner } from '../src/state/deep-reading-run.ts';
import { createDefaultSettings } from '../src/state/types.ts';
import { buildDeepReadingModel, EMPTY_DEEP_DISCLOSURE, toggleDeepDisclosure } from '../src/viewmodel/deep-reading.ts';
import { mergeOneLinerSettings } from '../src/state/settings-storage.ts';
function storage() {const data:Record<string,unknown>={};return {data,async get(key:string){return {[key]:data[key]};},async set(v:Record<string,unknown>){Object.assign(data,v);}};}
const at='2026-10-13T00:00:00Z';
function complete():DeepReadingRecord { const input=buildDeepReadingInput(deepItem())!;return {status:'complete',itemId:input.itemId,captureId:input.captureId,promptVersion:DEEP_READING_PROMPT_VERSION,model:'gemini-3.8-flash',inputReplyCount:2,estimatedCost:null,generatedAt:at,reading:parseDeepReadingResponse(JSON.stringify(deepPayload()),input)!,refs:input.refs}; }
test('Google deep override and one repair preserve the quick model',async()=>{
 const prior=globalThis.fetch; const calls:{url:string;body:any}[]=[];
 globalThis.fetch=async(url,init)=>{ calls.push({url:String(url),body:JSON.parse(String(init?.body))});const text=calls.length===1 ? 'bad JSON' : calls.length===2 ? JSON.stringify(deepPayload()) : JSON.stringify({gist:'大家討論檢索',find:{},cluster_names:[],methods:[],split:{sides:[]}});return new Response(JSON.stringify({candidates:[{content:{parts:[{text}]},finishReason:'STOP'}]}));};
 try {await generateDeepReading('google','key',buildDeepReadingInput(deepItem())!);await generateInlineReading('google','key',buildInlineReadingInput(deepItem())!);
 assert.equal(calls.length,3);assert.match(calls[0].url,/gemini-3\.8-flash:generateContent/);assert.match(calls[1].url,/gemini-3\.8-flash/);assert.match(calls[1].body.contents[0].parts[0].text,/修復/);assert.match(calls[2].url,/gemini-3\.1-flash-lite/);
 }finally{globalThis.fetch=prior;}
});
test('Claude override follows body rules and OpenAI keeps its model/output cap',async()=>{
 const prior=globalThis.fetch;const bodies:any[]=[];
 globalThis.fetch=async(url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify(String(url).includes('anthropic') ? {content:[{type:'text',text:JSON.stringify(deepPayload())}]} : {choices:[{message:{content:JSON.stringify(deepPayload())}}]}));};
 try{await generateDeepReading('claude','key',buildDeepReadingInput(deepItem())!);await generateDeepReading('openai','key',buildDeepReadingInput(deepItem())!);assert.equal(bodies[0].model,'claude-sonnet-5-5');assert.equal(bodies[0].temperature,undefined);assert.deepEqual(bodies[0].thinking,{type:'disabled'});assert.equal(bodies[1].model,'gpt-4.1-mini');assert.equal(bodies[1].max_tokens,4000);}finally{globalThis.fetch=prior;}
});
test('malformed repair fails after exactly two generation calls',async()=>{
 const prior=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'bad'}]}}]}));};
 try{await assert.rejects(generateDeepReading('google','key',buildDeepReadingInput(deepItem())!),/格式無效/);assert.equal(calls,2);}finally{globalThis.fetch=prior;}
});
test('storage round trip serializes posts and staleness follows capture/prompt',async()=>{
 const s=storage();const r=complete();await Promise.all([saveDeepReadingRecord(s,r),saveDeepReadingRecord(s,{...r,itemId:'other'})]);
 const records=await loadDeepReadingRecords(s);assert.deepEqual(records[r.itemId],r);assert.equal(Object.keys(records).length,2);assert.ok(s.data[DEEP_READINGS_STORAGE_KEY]);assert.equal(deepReadingStale(r,'c1'),false);assert.equal(deepReadingStale(r,'c2'),true);assert.equal(deepReadingStale({...r,promptVersion:'old'},'c1'),true);
});
test('background runner refuses key gaps, shares concurrent work and persists completion',async()=>{
 const s=storage();let count=0;const runner=createDeepReadingRunner(s,async()=>{count++;return complete().reading;},()=>at);const settings=createDefaultSettings();
 await assert.rejects(runner(deepItem(),settings),/設定未填 Google API key/);assert.equal(count,0);
 settings.oneLinerProvider='google';settings.googleApiKey='key';settings.deepReadingModels={google:'custom'};
 const a=runner(deepItem(),settings),b=runner(deepItem(),settings);assert.equal(a,b);const r=await a;assert.equal(count,1);assert.equal(r.model,'custom');assert.equal((await loadDeepReadingRecords(s))[r.itemId].status,'complete');
});
test('runner records failure and releases lock after initial storage failure',async()=>{
 const settings={...createDefaultSettings(),oneLinerProvider:'google' as const,googleApiKey:'key'};const s=storage();const runner=createDeepReadingRunner(s,async()=>{throw new Error('quota');},()=>at);
 await assert.rejects(runner(deepItem(),settings),/quota/);assert.equal((await loadDeepReadingRecords(s))['deep-item'].status,'failed');
 let fail=true;const s2={get:s.get,set:async(v:Record<string,unknown>)=>{if(fail)throw new Error('disk');await s.set(v);}};const runner2=createDeepReadingRunner(s2,async()=>complete().reading,()=>at);
 await assert.rejects(runner2(deepItem(),settings),/disk/);fail=false;assert.equal((await runner2(deepItem(),settings)).status,'complete');
});
test('reader projects offer, reading, done, stale and error with closed disclosures',()=>{
 const item=deepItem(),settings=createDefaultSettings(),r=complete();
 assert.equal(buildDeepReadingModel(item,settings,undefined,at)!.state,'offer');assert.equal(buildDeepReadingModel(item,settings,undefined,at,true)!.state,'reading');assert.equal(buildDeepReadingModel(item,settings,r,at)!.state,'done');
 item.latestCapture!.id='c2';assert.equal(buildDeepReadingModel(item,settings,r,at)!.state,'stale');assert.equal(buildDeepReadingModel(item,settings,r,at,false,'quota')!.state,'error');
 assert.deepEqual(buildDeepReadingModel(item,settings,r,at)!.disclosure,{term:null,debate:null,more:false});
 let d=toggleDeepDisclosure(EMPTY_DEEP_DISCLOSURE,{type:'term',index:0});assert.equal(d.term,0);d=toggleDeepDisclosure(d,{type:'term',index:0});assert.equal(d.term,null);
 d=toggleDeepDisclosure(d,{type:'debate',index:0});d=toggleDeepDisclosure(d,{type:'debate',index:1});assert.equal(d.debate,1);assert.equal(d.more,false);
});
test('settings preserve provider models and trim edits',()=>{
 const settings={...createDefaultSettings(),deepReadingModels:{google:'custom'}};const patch={provider:'google' as const,openaiApiKey:'',claudeApiKey:'',googleApiKey:''};assert.equal(mergeOneLinerSettings(settings,patch).deepReadingModels!.google,'custom');assert.equal(mergeOneLinerSettings(settings,{...patch,deepReadingModels:{claude:' claude-sonnet-5-5 '}}).deepReadingModels!.claude,'claude-sonnet-5-5');
});
