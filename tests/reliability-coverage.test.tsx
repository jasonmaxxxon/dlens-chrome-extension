import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildTopicReadingInput} from '../src/compare/topic-reading.ts';
import {buildInlineReadingInput,parseInlineReadingResponse,INLINE_READING_PROMPT_VERSION} from '../src/compare/inline-reading.ts';
import {buildDeepReadingInput} from '../src/compare/deep-reading.ts';
import {buildTopicReadingModel} from '../src/viewmodel/topic-reading.ts';
import {TopicReadingView} from '../src/ui/TopicReadingView.tsx';
import {createDefaultSettings} from '../src/state/types.ts';
const topic:any={id:'t',name:'合成話題'};
const one:any={id:'i',status:'succeeded',descriptor:{author_hint:'op',text_snippet:'合成'},latestCapture:{id:'c',result:{canonical_post:{author:'op',text:'合成正文。'.repeat(200)},comments:Array.from({length:300},(_,i)=>({comment_id:'r'+i,author:'fan'+i,text:'合成測試留言。'.repeat(100)+i,like_count:i}))},analysis:{clusters:[]}}};
const quick:any={status:'complete',captureId:'c',reading:{promptVersion:INLINE_READING_PROMPT_VERSION,gist:'合成概述。',clusterNames:{},methods:[{name:'先測試',fit:'合成場景'}],split:{sides:[]},find:{ask:'怎樣驗證？'}}};
test('oversized topic persists exact loss of replies and summaries and displays it even with zero omitted posts',()=>{
 const items=Array.from({length:100},(_,i)=>({...one,id:'i'+i}));const inline=Object.fromEntries(items.map(i=>[i.id,quick]));
 const input:any=buildTopicReadingInput(topic,items,inline);assert.equal(input.omittedPostCount,0);assert.equal(input.posts[0].replies.length,0);
 assert.ok(input.coverage,'coverage must be captured at input construction');
 assert.deepEqual(input.coverage.replyQuotes,{sent:0,captured:30000});assert.deepEqual(input.coverage.summaries,{sent:0,available:100});
 assert.ok(input.coverage.reductions.some((r:any)=>r.kind==='summaries-cleared'));assert.ok(input.coverage.reductions.some((r:any)=>r.kind==='replies-cleared'));assert.ok(input.coverage.reductions.some((r:any)=>r.kind==='bodies-cut' && r.limit===120));
 assert.equal(input.coverage.bodyCharacters.sent,input.posts.reduce((n:number,p:any)=>n+p.text.length,0));assert.equal(input.coverage.bodyCharacters.captured,items.length*one.latestCapture.result.canonical_post.text.length);
 const record:any={status:'complete',topicId:'t',signature:input.signature,inputHash:input.inputHash,budgetVersion:input.budgetVersion,question:input.question,promptVersion:'v3',model:'gemini-3.8-flash',inputPostCount:input.posts.length,estimatedCost:null,generatedAt:'today',refs:input.refs,coverage:input.coverage,reading:{answer:'合成結論。',points:[{text:'合成觀察。',refs:['p1']},{text:'需要驗證。',refs:['p2']}],gaps:[]}};
 const html=renderToStaticMarkup(<TopicReadingView model={buildTopicReadingModel(topic,items,createDefaultSettings(),record,'2026-10-15',false,null,inline)} onRun={()=>{}} onRef={()=>{}}/>);
 assert.match(html,/0 則留言原句/);assert.match(html,/0 份預分析/);assert.match(html,/留言.*移除|移除.*留言/);assert.match(html,/預分析.*移除|移除.*預分析/);
 delete record.coverage;
 assert.match(renderToStaticMarkup(<TopicReadingView model={buildTopicReadingModel(topic,items,createDefaultSettings(),record,'2026-10-15')} onRun={()=>{}} onRef={()=>{}}/>),/覆蓋：未知/);
});
test('quick and deep persist actual selection coverage rather than all captured replies',()=>{
 const quick:any=buildInlineReadingInput(one),deep:any=buildDeepReadingInput(one);
 for(const input of [quick,deep]){assert.ok(input.coverage);assert.equal(input.coverage.replyQuotes.captured,300);assert.equal(input.coverage.replyQuotes.sent,input.catalog.length);assert.ok(input.catalog.length<300);}
 const parsed:any=parseInlineReadingResponse(JSON.stringify({gist:'合成反應。',find:{},cluster_names:[],methods:[],split:{agree:'',sides:[]}}),quick,'synthetic','today');assert.deepEqual(parsed.coverage,quick.coverage);
});

import {normalizeTopicReadingRecords} from '../src/compare/topic-reading-storage.ts';
import {normalizeDeepReadingRecords} from '../src/compare/deep-reading-storage.ts';
import {DEEP_READING_PROMPT_VERSION} from '../src/compare/deep-reading.ts';
test('malformed persisted coverage is treated as unknown without losing a readable result',()=>{
 const input=buildTopicReadingInput(topic,[one]);
 const base:any={status:'complete',topicId:'t',signature:input.signature,question:input.question,promptVersion:'v3',model:'synthetic',inputPostCount:1,estimatedCost:null,generatedAt:'today',refs:input.refs,coverage:{},reading:{answer:'合成結論。',points:[{text:'方法。',refs:['p1']},{text:'未驗證。',refs:['p1']}],gaps:[]}};
 const normalized=normalizeTopicReadingRecords({t:base}).t;
 assert.equal(normalized.status,'complete');assert.equal(normalized.coverage,undefined);
 assert.match(renderToStaticMarkup(<TopicReadingView model={buildTopicReadingModel(topic,[one],createDefaultSettings(),normalized,'2026-10-15')} onRun={()=>{}} onRef={()=>{}}/>),/覆蓋：未知/);
 const deep:any={status:'complete',itemId:'i',captureId:'c',promptVersion:DEEP_READING_PROMPT_VERSION,model:'synthetic',inputReplyCount:1,estimatedCost:null,generatedAt:'today',refs:[],coverage:{},reading:{background:'合成背景。',takeaway:'合成理解。',terms:[],debates:[],evidence:{strong:[],weak:[]},unanswered:[]}};
 assert.equal(normalizeDeepReadingRecords({i:deep}).i.coverage,undefined);
});

import {buildDeepReadingModel} from '../src/viewmodel/deep-reading.ts';
test('stale result headers keep the saved input size instead of claiming the latest capture was read',()=>{
 const input=buildTopicReadingInput(topic,[one]);
 const stored:any={status:'complete',topicId:'t',signature:'old-members',inputHash:'old-input',budgetVersion:input.budgetVersion,question:input.question,promptVersion:'v3',model:'saved-model',inputPostCount:7,omittedPostCount:2,estimatedCost:null,generatedAt:'today',refs:[],reading:{answer:'合成答案。',points:[],gaps:[]}};
 const model=buildTopicReadingModel(topic,[one],createDefaultSettings(),stored,'2026-10-15');
 stored.coverage={...input.coverage,posts:{included:7,omitted:2,captured:9}};
 const shown=buildTopicReadingModel(topic,[one],createDefaultSettings(),stored,'2026-10-15');
 assert.equal((renderToStaticMarkup(<TopicReadingView model={shown} onRun={()=>{}} onRef={()=>{}}/>).match(/2 篇未納入/g) ?? []).length,1);
 assert.equal(model.state,'stale');assert.equal(model.postCount,7);assert.equal(model.omittedPostCount,2);assert.equal(model.model,'saved-model');
 const deep:any={status:'complete',itemId:'i',captureId:'old',promptVersion:DEEP_READING_PROMPT_VERSION,model:'saved-model',inputReplyCount:7,estimatedCost:null,generatedAt:'today',refs:[],reading:{background:'背景。',takeaway:'合成理解。',terms:[],debates:[],evidence:{strong:[],weak:[]},unanswered:[]}};
 const single=buildDeepReadingModel(one,createDefaultSettings(),deep,'2026-10-15')!;
 assert.equal(single.state,'stale');assert.equal(single.replyCount,7);assert.equal(single.model,'saved-model');
 assert.match(buildTopicReadingModel(topic,[one],createDefaultSettings(),stored,'2026-10-15',true).coverageLabel,/送入模型/);
 assert.match(buildDeepReadingModel(one,createDefaultSettings(),deep,'2026-10-15',true)!.coverageLabel,/送入模型/);
});
