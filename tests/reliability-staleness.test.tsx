import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readerNeedsReading } from '../src/viewmodel/collection-reader.ts';
import { buildTopicReadingInput, TOPIC_READING_PROMPT_VERSION } from '../src/compare/topic-reading.ts';
import { buildTopicReadingModel } from '../src/viewmodel/topic-reading.ts';
import { normalizeTopicReadingRecords } from '../src/compare/topic-reading-storage.ts';
import { TopicReadingView } from '../src/ui/TopicReadingView.tsx';
import { DeepReadingView } from '../src/ui/DeepReadingView.tsx';
import { buildDeepReadingModel } from '../src/viewmodel/deep-reading.ts';
import { createDefaultSettings } from '../src/state/types.ts';
import { INLINE_READING_PROMPT_VERSION } from '../src/compare/inline-reading.ts';
import { DEEP_READING_PROMPT_VERSION } from '../src/compare/deep-reading.ts';
const item:any={id:'i',status:'succeeded',descriptor:{text_snippet:'合成正文',author_hint:'op'},latestCapture:{id:'new',analysis:{status:'succeeded',clusters:[]},result:{canonical_post:{text:'合成正文',author:'op'},comments:[{comment_id:'r',author:'fan',text:'點樣測試？',like_count:1}]}}};
const topic:any={id:'t',name:'合成話題',context:{researchQuestion:'點做？'}};
const settings=createDefaultSettings();
const quick=(gist:string,generatedAt='today'):any=>({i:{status:'complete',itemId:'i',captureId:'new',reading:{promptVersion:INLINE_READING_PROMPT_VERSION,model:'quick',generatedAt,gist,clusterNames:{},methods:[],split:{sides:[]},find:{ask:'點測試？'}}}});
function oldRecord():any {return {topicId:'t',signature:buildTopicReadingInput(topic,[item]).signature,question:'點做？',promptVersion:TOPIC_READING_PROMPT_VERSION,model:'gemini-3.8-flash',inputPostCount:1,estimatedCost:null,status:'complete',generatedAt:'today',reading:{answer:'合成答案。',points:[{text:'有方法。',refs:['p1']},{text:'仍未驗證。',refs:['p1.r1']}],gaps:[]},refs:buildTopicReadingInput(topic,[item]).refs};}
test('same-prompt stored reading for previous capture requires new reading in the standalone reader',()=>{
 for(const status of ['complete','running','failed']) assert.equal(readerNeedsReading(item,{status,itemId:'i',captureId:'old',reading:{promptVersion:INLINE_READING_PROMPT_VERSION}} as any),true);
});
test('topic input identity changes with pre-analysis content and ignores regeneration time and item ordering',()=>{
 const first:any=buildTopicReadingInput(topic,[item],quick('先測試。'));
 const changed:any=buildTopicReadingInput(topic,[item],quick('先訪問用戶。'));
 assert.notEqual(first.inputHash,changed.inputHash);
 const regenerated:any=buildTopicReadingInput(topic,[item],quick('先測試。','tomorrow'));
 assert.equal(first.inputHash,regenerated.inputHash);
 const other={...item,id:'a'};
 assert.equal((buildTopicReadingInput(topic,[item,other],quick('先測試。')) as any).inputHash,(buildTopicReadingInput(topic,[other,item],quick('先測試。')) as any).inputHash);
});
test('legacy topic results remain readable and explicitly offer rereading after method update',()=>{
 const old=oldRecord();const normalized=normalizeTopicReadingRecords({t:old});
 assert.equal(normalized.t.status,'complete');
 const model=buildTopicReadingModel(topic,[item],settings,normalized.t,'2026-10-15');
 assert.equal(model.state,'stale');assert.equal(model.reading?.answer,old.reading.answer);
 assert.match(renderToStaticMarkup(<TopicReadingView model={model} onRun={()=>{}} onRef={()=>{}}/>),/解讀方式已更新.*重讀|重讀.*解讀方式已更新/);
});
test('completed deep and topic readings always expose reread',()=>{
 const input:any=buildTopicReadingInput(topic,[item]);const stored={...oldRecord(),inputHash:input.inputHash,budgetVersion:input.budgetVersion};
 const model=buildTopicReadingModel(topic,[item],settings,stored,'2026-10-15');
 assert.match(renderToStaticMarkup(<TopicReadingView model={model} onRun={()=>{}} onRef={()=>{}}/>),/重讀/);
 const deep:any={status:'complete',itemId:'i',captureId:'new',promptVersion:DEEP_READING_PROMPT_VERSION,model:'gemini-3.8-flash',inputReplyCount:1,estimatedCost:null,generatedAt:'today',refs:[],reading:{background:'背景。',takeaway:'理解。',terms:[],debates:[],evidence:{strong:[],weak:[]},unanswered:[]}};
 assert.match(renderToStaticMarkup(<DeepReadingView model={buildDeepReadingModel(item,settings,deep,'2026-10-15')!} onCommand={()=>{}}/>),/重讀/);
});

import {act} from 'react';
import {JSDOM} from 'jsdom';
import {useCollectionReaderLive} from '../src/ui/useCollectionReaderTopics.ts';
test('standalone panel ensures one reading per item/capture with no Threads card mounted',async()=>{
 const dom=new JSDOM('<div id="root"></div>');const g=globalThis as any;
 const keys=['window','document','HTMLElement','chrome','IS_REACT_ACT_ENVIRONMENT'];const previous=keys.map(k=>Object.getOwnPropertyDescriptor(g,k));const calls:any[]=[];
 Object.assign(g,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,chrome:{runtime:{sendMessage:async(m:any)=>{calls.push(m);return {ok:true};}}}});
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root')!);
 const old:any={status:'complete',itemId:'i',captureId:'old',reading:{promptVersion:INLINE_READING_PROMPT_VERSION}};
 function Harness({capture}:{capture:string}){useCollectionReaderLive({session:{id:'s',mode:'topic'},item:{...item,latestCapture:{...item.latestCapture,id:capture}}} as any,old);return null;}
 try{
  await act(async()=>root.render(<Harness capture="new"/>));await act(async()=>root.render(<Harness capture="new"/>));
  assert.equal(calls.filter(c=>c.type==='inline-reading/ensure').length,1);
  await act(async()=>root.render(<Harness capture="newer"/>));assert.equal(calls.filter(c=>c.type==='inline-reading/ensure').length,2);
  assert.ok(calls.every(c=>c.itemId==='i' && c.sessionId==='s'));
 }finally{await act(async()=>root.unmount());keys.forEach((k,i)=>previous[i]?Object.defineProperty(g,k,previous[i]!):delete g[k]);dom.window.close();}
});

test('topic result becomes stale on changed pre-analysis or configured model, but identical regenerated input stays fresh',()=>{
 const inline=quick('先測試。');const input:any=buildTopicReadingInput(topic,[item],inline);
 const stored={...oldRecord(),inputHash:input.inputHash,budgetVersion:input.budgetVersion};
 const make=(readings:any,config=settings)=>buildTopicReadingModel(topic,[item],config,stored,'2026-10-15',false,null,readings);
 assert.equal(make(inline).state,'done');
 assert.equal(make(quick('先訪問用戶。')).state,'stale');
 assert.equal(make(quick('先測試。','tomorrow')).state,'done');
 assert.equal(make(inline,{...settings,deepReadingModels:{google:'different-model'}}).state,'stale');
});
