import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProductReaderModel, PRODUCT_VERDICT_LABELS } from '../src/viewmodel/product-reader.ts';
import { createEmptyGlobalState, type ProductSignalAnalysis } from '../src/state/types.ts';
import { item, capture } from './collection-browser.fixtures.ts';
const settings = {...createEmptyGlobalState().settings, oneLinerProvider:'google' as const, googleApiKey:'fixture'};
const source = item('p', {status:'succeeded', latestCapture:capture({text:'root',author:'author'})});
const analysis = {signalId:'s',status:'complete',verdict:'try',contentSummary:'summary',whyRelevant:'why',referenceTakeaway:'take',evidenceRefs:['e1','missing'],agentTaskSpec:{taskPrompt:'task',targetAgent:'codex',requiredContext:[]}} as ProductSignalAnalysis;
test('product reader four tabs, verdict marks, safe refs and default selection', () => {
 const m=buildProductReaderModel(source,'session','s',analysis,settings,true);
 assert.deepEqual(m.tabs.map(t=>t.label),['講咩','啱唔啱你','點試','留言補充']);
 assert.equal(m.selected,'fit'); assert.equal(m.tabs[1].mark,'值得試'); assert.equal(m.tabs[2].mark,'有任務');
 assert.ok(m.refs.every(r=>r.ref!=='missing')); assert.ok(m.agentBrief.includes('task'));
 assert.deepEqual(Object.values(PRODUCT_VERDICT_LABELS),['值得試','觀察','暫放','資料不足']);
});
test('product reader gaps, pending and failure, reply default survives without AI', () => {
 const build=(a:ProductSignalAnalysis|undefined,s=settings,context=true)=>buildProductReaderModel(source,'session','s',a,s,context);
 assert.equal(build(undefined,{...settings,googleApiKey:''}).stateLine,'未接 AI');
 assert.equal(build(undefined,settings,false).stateLine,'未填產品設定，填咗先判斷啱唔啱你');
 assert.equal(build({...analysis,status:'analyzing'}).stateLine,'分析中');
 assert.equal(build({...analysis,status:'error'}).stateLine,'分析失敗');
 assert.equal(build(undefined).selected,'add'); assert.equal(build({...analysis,status:'error'}).action,'retry');
});

import { buildProductSaveLine, productReadingFinishedAt } from '../src/viewmodel/product-reader.ts';
import { buildCollectionPosts, buildCollectionArrivalModel, buildCollectionFilters, buildCollectionInView } from '../src/viewmodel/collection-browser.ts';
import { resolveCollectionReaderOpen, collectionReadingSource } from '../src/viewmodel/collection-reader.ts';
import { descriptor, session, savedAt } from './collection-browser.fixtures.ts';
import { buildAgentBrief } from '../src/viewmodel/agent-brief.ts';
test('product reply lens has authors first, then top three audience replies, without duplicated author text',()=>{
 const replies=[{comment_id:'op',author:'author',text:'作者補充',like_count:100},...Array.from({length:5},(_,i)=>({comment_id:`r${i}`,author:`fan${i}`,text:`回覆${i}`,like_count:i}))];
 const post=item('p',{status:'succeeded',latestCapture:capture({author:'author'},{result:{...capture().result!,comments:replies}})});
 const m=buildProductReaderModel(post,'session','s',undefined,settings,true);
 assert.deepEqual(m.replies.map(r=>r.text),['作者補充','回覆4','回覆3','回覆2']);assert.equal(m.replies[0].isAuthor,true);
});
test('captured e1/root refs resolve to handles while unknown codes stay hidden',()=>{
 const post=item('p',{status:'succeeded',latestCapture:capture({author:'author',text:'root'},{result:{...capture({author:'author',text:'root'}).result!,comments:[{comment_id:'a',author:'fan',text:'evidence',like_count:1}]}})});
 const m=buildProductReaderModel(post,'session','s',{...analysis,evidenceRefs:['root','e1','absent']},settings,true);
 assert.deepEqual(m.refs.map(r=>[r.ref,r.author]),[['root','author'],['e1','fan']]);
});
test('product one-line completion, no-analysis completion and failed retry',()=>{
 assert.equal(buildProductSaveLine(source,analysis,0,null).status,'讀完 · 值得試');
 assert.match(buildProductSaveLine(source,undefined,0,null).status,/讀完 · \d+ 則留言/);
 const failed=buildProductSaveLine({...source,status:'failed',lastError:'backend'},undefined,0,null);
 assert.equal(failed.retry,true);assert.equal(failed.rawError,'backend');assert.match(failed.status,/抓取失敗.*處理失敗/);
 assert.equal(productReadingFinishedAt({...source,completedAt:savedAt},undefined,true),null);
 assert.equal(productReadingFinishedAt({...source,completedAt:savedAt},undefined,false),savedAt);
});
test('collection chips count memberships once, reading/finished states, and filter before search',()=>{
 const product=item('p',{status:'succeeded',completedAt:savedAt});
 const queued=item('q',{status:'queued',descriptor:descriptor({post_url:'https://www.threads.com/@b/post/QUEUE'})});
 const archive=item('a',{descriptor:descriptor({post_url:'https://www.threads.com/@c/post/ARCHIVE'})});
 const sessions=[session('product',[product],'product'),session('topic',[queued],'topic'),session('archive',[archive])];
 const posts=buildCollectionPosts(sessions);
 const a=buildCollectionArrivalModel(posts,{}, {},Date.parse(savedAt)+1000,false,{analyses:{s:{...analysis,analyzedAt:savedAt}},signals:[{id:'s',sessionId:'product',itemId:'p'} as any],settings,hasContext:true});
 assert.equal(a.recent[0].summary,'讀完 · 值得試');
 const filtered=buildCollectionFilters(posts,a,'finished');
 assert.deepEqual(filtered.chips.map(c=>c.count),[3,1,1,1,1]);assert.equal(filtered.posts[0].memberships[0].itemId,'p');
 assert.equal(buildCollectionFilters(posts,a,'product').posts.length,1);
});
test('畫面上 matches Threads identity, hides unsaved and currently open posts',()=>{
 const sessions=[session('product',[item('p')],'product')];const posts=buildCollectionPosts(sessions);
 assert.equal(buildCollectionInView(posts,'threads-post:missing',null),null);
 assert.equal(buildCollectionInView(posts,'threads-post:ABC',posts[0].key),null);
 assert.equal(buildCollectionInView(posts,'threads-post:ABC',null)?.key,posts[0].key);
 assert.deepEqual(resolveCollectionReaderOpen(posts,'p','try'),{key:posts[0].key,lens:'try'});
 assert.equal(collectionReadingSource(posts[0],sessions)?.session.mode,'product');
 const dual=[...sessions,session('topic',[item('t')],'topic')];assert.equal(collectionReadingSource(buildCollectionPosts(dual)[0],dual)?.session.mode,'topic');
});
test('moved Agent brief preserves its existing original fixture output exactly',()=>{
 const a={...analysis,signalType:'learning',relevantTo:['technicalLearning'],reason:'reason',referenceTakeaway:'take',referenceType:'technical_learning',referenceLabel:'reference',contentSummary:'summary',whyRelevant:'why',evidenceRefs:[]} as ProductSignalAnalysis;
 assert.equal(buildAgentBrief({mode:'original',selectedSignals:[{id:'s'}],analysesBySignal:new Map([['s',a]]),signalPreviewById:{s:'root  text'},signalUrlById:{s:'https://www.threads.com/@author/post/ABC'}}),[
 '# Product Action Brief - 原文優先',
 '## 使用方式\n- 先處理 `值得嘗試`；這些可以轉成實驗、prototype 或 agent task。\n- `保留觀察` 只作產品學習或後續研究，不應直接排入開發。',
 '## 1. summary\n- 原文訊號: root text\n- 原文連結: https://www.threads.com/@author/post/ABC\n- 產品判斷: 值得嘗試\n- 技術學習: reference\n- 可帶走: take\n- 相關欄位: 技術學習\n- AI 判讀: reason\n\n可複製任務:\n```text\n[SIGNAL]\nroot text\n\ntask\n```'
 ].join('\n\n'));
});

test('product completion waits for prerequisite hydration before acknowledging unread arrivals',()=>{
 const product=item('p',{status:'succeeded',completedAt:savedAt});const posts=buildCollectionPosts([session('product',[product],'product')]);
 assert.equal(buildCollectionArrivalModel(posts,{}, {},Date.parse(savedAt)+1000,false,{loaded:false}).finished.length,0);
 assert.equal(buildCollectionArrivalModel(posts,{}, {},Date.parse(savedAt)+1000,false,{loaded:true,hasContext:false}).finished.length,1);
});
