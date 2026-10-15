import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildTopicReadingModel} from '../src/viewmodel/topic-reading.ts';
import {TopicReadingView} from '../src/ui/TopicReadingView.tsx';
import {TOPIC_READING_PROMPT_VERSION,topicReadingSignature} from '../src/compare/topic-reading.ts';
import type {TopicReadingRecord} from '../src/compare/topic-reading-storage.ts';
import type {Topic,SessionItem,ExtensionSettings} from '../src/state/types.ts';
const topic={id:'t',name:'Codex',context:{researchQuestion:'點用？'}} as Topic;
const items=[{id:'i',status:'succeeded',descriptor:{text_snippet:'Codex',author_hint:'a'},latestCapture:{id:'c',result:{comments:[],canonical_post:{text:'Codex'}}}}] as unknown as SessionItem[];
const settings={oneLinerProvider:'openai'} as ExtensionSettings;
const base={topicId:'t',signature:topicReadingSignature(items),question:'點用？',promptVersion:TOPIC_READING_PROMPT_VERSION,model:'gpt-4.1-mini',inputPostCount:1,estimatedCost:null};
const record={...base,status:'complete',generatedAt:'2026-10-14',reading:{answer:'帖文未回答問題。需要更多例子。',points:[{text:'只見主張。',refs:['p1']},{text:'需要實測。',refs:['p1']}],gaps:[]},refs:[{ref:'p1',itemId:'i',captureId:'c',author:'a'}]} as TopicReadingRecord;
test('話題解讀 projects offer → reading → done → stale → error, retaining refs',()=>{
 const make=(stored?:TopicReadingRecord,pending=false,error:string|null=null)=>buildTopicReadingModel(topic,items,settings,stored,'2026-10-14T12:00:00Z',pending,error);
 assert.equal(make().state,'offer');assert.equal(make(record,true).state,'reading');assert.equal(make(record).state,'done');
 const stale=make({...record,signature:'old'});assert.equal(stale.state,'stale');assert.equal(stale.reading?.answer,record.status==='complete'?record.reading.answer:'');
 assert.equal(make(record,false,'key gap').state,'error');
 for(const m of [make(),make(record,true),make(record),stale,make(record,false,'key gap')]) {
  const html=renderToStaticMarkup(<TopicReadingView model={m} onRun={()=>{}} onRef={()=>{}}/>);
  assert.match(html,new RegExp(`data-topic-reading="${m.state}"`));assert.match(html,/話題解讀/);
 }
 const html=renderToStaticMarkup(<TopicReadingView model={make(record)} onRun={()=>{}} onRef={()=>{}}/>);
 assert.match(html,/@a/);assert.match(html,/data-reading-ref="p1"/);assert.doesNotMatch(html,/href=/);
});
test('interrupted runs allow retry and question edits mark old readings stale',()=>{
 const failed=buildTopicReadingModel(topic,items,settings,{...base,status:'running',startedAt:'2026-10-13'},'2026-10-14');assert.equal(failed.state,'error');
 const changed=buildTopicReadingModel({...topic,context:{researchQuestion:'新問題'}},items,settings,record,'2026-10-14');assert.equal(changed.state,'stale');
});
