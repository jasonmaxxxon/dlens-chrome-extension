import { renderInlineCard } from "../src/content/inline-collect-card.ts";
import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildInlineReadingInput, parseInlineReadingResponse } from '../src/compare/inline-reading.ts';
import { buildDeepReadingInput, parseDeepReadingResponse } from '../src/compare/deep-reading.ts';
import { buildInlineCardViewModel } from '../src/viewmodel/inline-card.ts';
import { CollectionAudienceReading } from '../src/ui/CollectionAudienceReading.tsx';
import type { SessionItem } from '../src/state/types.ts';
const item = () => ({ id:'i',status:'succeeded',descriptor:{author_hint:'op',text_snippet:'合成測試正文'},latestCapture:{id:'c',result:{canonical_post:{author:'op',text:'合成測試正文'},comments:Array.from({length:11},(_,i)=>({comment_id:`c${i}`,author:i===0?'@OP':`reader${i}`,text:i===0?'作者解釋用法。':`合成留言${i}。`,like_count:1}))},analysis:{status:'succeeded',clusters:[]}}}) as unknown as SessionItem;
const payload = () => ({gist:'大家一致反對',find:{split:'大家一致反對'},methods:[{name:'作者做法',ref:'e1'}],split:{agree:'大家一致反對',sides:[{claim:'支持',why:'作者補充',ref:'e1'},{claim:'反對',why:'觀眾意見',ref:'e2'}]}});
test('author-only side cannot support an audience split or its consensus headline; genuine audience sides survive',()=>{
 const input=buildInlineReadingInput(item())!;
 const reading=parseInlineReadingResponse(JSON.stringify(payload()),input,'test','now')!;
 assert.deepEqual(reading.split.sides,[]);
 assert.match(reading.find.split,/未見.*觀眾分歧/);
 assert.doesNotMatch([reading.gist,reading.find.split,reading.split.agree].join(' '),/一致/);
 assert.equal(reading.methods[0].quote.author,'@OP');
 const authorOnly=payload();authorOnly.split.sides=authorOnly.split.sides.slice(0,1);
 assert.doesNotMatch(parseInlineReadingResponse(JSON.stringify(authorOnly),input,'test','now')!.gist,/一致/);
 const valid=payload();valid.gist='觀眾意見分成兩邊';valid.find.split='用法有分歧';valid.split.agree='兩邊都關心用法';valid.split.sides[0].ref='e3';
 const parsed=parseInlineReadingResponse(JSON.stringify(valid),input,'test','now')!;
 assert.deepEqual(parsed.split.sides.map(s=>s.quote.commentId),['c2','c1']);
 assert.equal(parsed.gist,valid.gist);
});
test('method reply cards retain the author badge after parser and viewmodel projection',()=>{
 const source=item(),reading=parseInlineReadingResponse(JSON.stringify(payload()),buildInlineReadingInput(source)!,'test','now')!;
 const card=buildInlineCardViewModel(source,'topic','合成話題',{ai:{status:'complete',itemId:'i',captureId:'c',reading}});
 const html=renderToStaticMarkup(<CollectionAudienceReading model={{card,selected:'method',answer:card.answers.method,chips:[],stateLine:null,aiNote:null} as any} onMore={()=>{}} onLens={()=>{}} onAssign={()=>{}}/>);
 assert.match(html,/>作者<\/span>/);
 assert.match(renderInlineCard(card,"method",0),/>作者<\/b>/);
});
test('deep audience debate drops author-only sides and unsupported consensus while retaining author explanations',()=>{
 const source=item(),input=buildDeepReadingInput(source)!;
 const p={background:'作者介紹做法。',takeaway:'大家一致反對。',terms:[],debates:[{question:'觀眾是否支持？',status:'agree',sides:[{who:'作者',claim:'支持',basis:'opinion',note:'',refs:['e1']},{who:'觀眾',claim:'反對',basis:'opinion',note:'',refs:['e2']}]}],evidence:{strong:[{text:'作者解釋方法。',refs:['e1']}],weak:[]},unanswered:[]};
 const parsed=parseDeepReadingResponse(JSON.stringify(p),input)!;
 assert.equal(parsed.debates.length,0);
 assert.doesNotMatch(parsed.takeaway,/一致/);
 assert.equal(parsed.evidence.strong[0].text,'作者解釋方法。');
 p.takeaway='觀眾有不同意見。';p.debates[0].sides[0].refs=['e3'];
 assert.equal(parseDeepReadingResponse(JSON.stringify(p),input)!.debates[0].sides.length,2);
});

test('a lone author explanation cannot carry an agree audience label',()=>{
 const input=buildDeepReadingInput(item())!;
 const p={background:'作者介紹方法。',takeaway:'作者提出用法。',terms:[],debates:[{question:'作者點樣做？',status:'agree',sides:[{who:'作者',claim:'先測試',basis:'experience',note:'自述',refs:['e1']}]}],evidence:{strong:[],weak:[]},unanswered:[]};
 const reading=parseDeepReadingResponse(JSON.stringify(p),input)!;
 assert.notEqual(reading.debates[0]?.status,'agree');
});

import { normalizeInlineReadingRecords } from '../src/compare/inline-reading-storage.ts';
import { normalizeDeepReadingRecords } from '../src/compare/deep-reading-storage.ts';
import { buildDeepReadingModel } from '../src/viewmodel/deep-reading.ts';
import { createDefaultSettings } from '../src/state/types.ts';
import { INLINE_READING_PROMPT_VERSION } from '../src/compare/inline-reading.ts';
import { DEEP_READING_PROMPT_VERSION } from '../src/compare/deep-reading.ts';
test('persisted inline author split is guarded after storage normalization for old and current prompts',()=>{
 const source=item();
 source.latestCapture!.analysis!.clusters=[{cluster_key:1,size_share:1,keywords:['用法']}] as any;
 for(const promptVersion of ['v3',INLINE_READING_PROMPT_VERSION]){
  const input=buildInlineReadingInput(source)!;
  const reading={...parseInlineReadingResponse(JSON.stringify(payload()),input,'test','now')!,promptVersion,gist:'大家一致反對',find:{method:'作者做法',split:'大家一致反對',ask:'未見提問'},split:{agree:'大家一致反對',sides:payload().split.sides.map((s,i)=>({claim:s.claim,why:s.why,quote:{commentId:`c${i}`,author:i===0?'@OP':'reader1',text:'合成原句。',likes:1}}))}};
  const normalized=normalizeInlineReadingRecords({i:{status:'complete',itemId:'i',captureId:'c',reading}});
  const card=buildInlineCardViewModel(source,'topic','合成',{forReader:true,ai:normalized.i});
  assert.ok(card.answers.split?.kind==='split');assert.deepEqual(card.answers.split.sides,[]);
  assert.doesNotMatch(JSON.stringify(card.entries)+JSON.stringify(card.answers),/一致/);
  assert.ok(card.answers.method?.kind==='methods');assert.equal(card.answers.method.quote.isAuthor,true);
 }
});
test('persisted deep author split is guarded using stored comment identity for every prompt and stale captures',()=>{
 const source=item();
 for(const promptVersion of ['v2',DEEP_READING_PROMPT_VERSION]){
  const reading={background:'作者介紹做法。',takeaway:'大家一致反對。',terms:[],debates:[{question:'觀眾點睇？',status:'agree',sides:[{who:'作者',claim:'支持',basis:'opinion',note:'',refs:['saved-op']},{who:'觀眾',claim:'反對',basis:'opinion',note:'',refs:['saved-reader']}]}],evidence:{strong:[{text:'作者解釋方法。',refs:['saved-op']}],weak:[]},unanswered:[]};
  const stored:any={status:'complete',itemId:'i',captureId:'c',promptVersion,model:'gpt-4.1-mini',inputReplyCount:11,estimatedCost:null,generatedAt:'now',reading,refs:[{ref:'saved-op',commentId:'c0',author:'@OP',url:null},{ref:'saved-reader',commentId:'c1',author:'reader1',url:null}]};
  const normalized=normalizeDeepReadingRecords({i:stored}).i;
  const model=buildDeepReadingModel(source,createDefaultSettings(),normalized,'2026-10-15')!;
  assert.deepEqual(model.reading!.debates,[]);assert.doesNotMatch(model.reading!.takeaway,/一致/);
  assert.equal(model.reading!.evidence.strong[0].text,'作者解釋方法。');
  // The same comment id in another capture cannot supply a new audience role to the old quote.
  const newer=structuredClone(source);newer.latestCapture!.id='new';newer.latestCapture!.result!.comments![0].author='other-reader';
  const stale=buildDeepReadingModel(newer,createDefaultSettings(),normalized,'2026-10-15')!;
  assert.deepEqual(stale.reading!.debates,[]);assert.doesNotMatch(stale.reading!.takeaway,/一致/);
 }
});
