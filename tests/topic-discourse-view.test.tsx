import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { TopicDiscourseView, type TopicDiscourseCommand } from '../src/ui/TopicDiscourseView.tsx';
import { buildTopicDiscourseViewModel, EMPTY_DISCOURSE_UI, topicSheetCommand, questionEditCommand, toggleDiscourseFrame, discourseReaderTarget } from '../src/viewmodel/topic-discourse.ts';
import type { SessionItem, Signal, Topic } from '../src/state/types.ts';
const topics=[{id:'t',sessionId:'s',name:'Codex',updatedAt:'2026-10-14',context:{researchQuestion:'點用？'}}] as Topic[];
const item=(id:string)=>({id,status:'succeeded',savedAt:'2026-10-14',descriptor:{author_hint:id,post_url:`https://threads.net/@${id}/post/${id}`,text_snippet:'Codex 好用',captured_at:'2026-10-14'},latestCapture:{id:`c-${id}`,analysis:{status:'succeeded',clusters:[{cluster_key:0,keywords:[id],size_share:1}]},result:{comments:[]}}}) as unknown as SessionItem;
const items=[item('a'),item('b'),item('inbox')];
const signals=items.map(i=>({id:`s-${i.id}`,sessionId:'s',itemId:i.id,topicId:i.id==='inbox'?undefined:'t',inboxStatus:i.id==='inbox'?'unprocessed':'assigned',capturedAt:'2026-10-14'})) as Signal[];
const model=(selectedTopicId:string|null)=>buildTopicDiscourseViewModel({topics,signals,items,selectedTopicId,inViewPostKey:'threads-post:a',now:Date.parse('2026-10-14T10:00:00Z')});

test('sheet validity trims name, permits no question and carries the inbox signal',()=>{
 assert.equal(topicSheetCommand({...EMPTY_DISCOURSE_UI,sheet:{}}),null);
 assert.deepEqual(topicSheetCommand({...EMPTY_DISCOURSE_UI,sheet:{},name:' Codex '}),{kind:'create-topic',name:'Codex',researchQuestion:''});
 assert.deepEqual(topicSheetCommand({...EMPTY_DISCOURSE_UI,sheet:{signalId:'s'},name:'Codex',question:' 點用？ '}),{kind:'create-topic',name:'Codex',researchQuestion:'點用？',signalId:'s'});
});
test('question enter/blur command saves changed text; escape cancels; frames are exclusive',()=>{
 assert.deepEqual(questionEditCommand('t','old',' new '),{kind:'update-question',topicId:'t',researchQuestion:'new'});
 assert.equal(questionEditCommand('t','old','new',true),null);
 assert.equal(questionEditCommand('t','old','old'),null);
 let state=toggleDiscourseFrame(EMPTY_DISCOURSE_UI,'a'); state=toggleDiscourseFrame(state,'b');assert.equal(state.openFrame,'b');
 assert.equal(toggleDiscourseFrame(state,'b').openFrame,null);
});
test('empty home is a quiet line; topic page omits Atlas and in-view and folds findings',()=>{
 const empty=buildTopicDiscourseViewModel({topics:[],signals:[],items:[],selectedTopicId:null,inViewPostKey:null,now:0});
 const html=renderToStaticMarkup(<TopicDiscourseView viewModel={empty} onCommand={()=>{}} />);
 assert.match(html,/話題＝你想答嘅問題/);assert.doesNotMatch(html,/①|②|③/);assert.match(html,/＋ 新話題/);
 const page=renderToStaticMarkup(<TopicDiscourseView viewModel={model('t')} onCommand={()=>{}} />);
 assert.match(page,/更多：走勢/);assert.doesNotMatch(page,/Atlas|畫面上|data-discourse-finding=/);assert.match(page,/data-discourse-question/);
 assert.equal(discourseReaderTarget('a',null).returnTo.label,'觀眾反應');assert.equal(discourseReaderTarget('a',{id:'t',name:'Codex'}).returnTo.label,'Codex');
});
test('home row body opens reader, menu owns move/delete and chips assign; topic post opens reader',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://dlens.test'});
 const previous={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import('react-dom/client');const host=dom.window.document.getElementById('root')!;const root=createRoot(host);const commands:TopicDiscourseCommand[]=[];
 try{
  await act(async()=>root.render(<TopicDiscourseView viewModel={model(null)} onCommand={c=>commands.push(c)}/>));
  assert.equal(host.querySelector('[data-discourse-move]'),null);
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-discourse-inbox-open]')!.click());
  assert.deepEqual(commands.at(-1),discourseReaderTarget('inbox',null));
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-discourse-menu]')!.click());
  assert.equal(host.querySelector('[data-discourse-move]')!.textContent,'移去 個人應用');
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-discourse-move]')!.click());assert.deepEqual(commands.at(-1),{kind:'move-product',signalId:'s-inbox'});
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-discourse-suggestion]')!.click());assert.deepEqual(commands.at(-1),{kind:'assign',signalId:'s-inbox',topicId:'t'});
  await act(async()=>root.render(<TopicDiscourseView viewModel={model('t')} onCommand={c=>commands.push(c)}/>));
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-discourse-post]')!.click());assert.deepEqual(commands.at(-1),discourseReaderTarget('a',{id:'t',name:'Codex'}));
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-discourse-frame="a"] button')!.click());
  assert.equal(host.querySelector('[data-discourse-frame="a"] button')!.getAttribute('aria-expanded'),'true');
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-discourse-frame="b"] button')!.click());
  assert.equal(host.querySelector('[data-discourse-frame="a"] button')!.getAttribute('aria-expanded'),'false');
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-discourse-question-edit]')!.click());
  assert.ok(host.querySelector('input[data-discourse-question-input]'));
  const input=host.querySelector<HTMLInputElement>('[data-discourse-question-input]')!;
  await act(async()=>{
   Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'新問題');
   input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  });
  const before=commands.length;
  await act(async()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  assert.deepEqual(commands.at(-1),{kind:'update-question',topicId:'t',researchQuestion:'新問題'});
  assert.equal(commands.length,before+1,'enter saves once even though the field unmounts/blurs');
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-discourse-question-edit]')!.click());
  const beforeEscape=commands.length;
  await act(async()=>host.querySelector<HTMLInputElement>('[data-discourse-question-input]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(host.querySelector('[data-discourse-question-input]'),null);assert.equal(commands.length,beforeEscape);
 }finally{await act(async()=>root.unmount());Object.assign(globalThis,previous);dom.window.close();}
});

test('controlled topic disclosures survive replacing the page with a reader',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://dlens.test'});const prior={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import('react-dom/client');const host=dom.window.document.getElementById('root')!;const root=createRoot(host);
 function Harness(){const [state,setState]=React.useState(EMPTY_DISCOURSE_UI),[reader,setReader]=React.useState(false);return reader?<button data-reader-return onClick={()=>setReader(false)}>‹ Codex</button>:<TopicDiscourseView viewModel={model('t')} uiState={state} onUiStateChange={setState} onCommand={c=>{if(c.kind==='open-reader')setReader(true);}}/>;}
 try{
  await act(async()=>root.render(<Harness/>));
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-discourse-frame="a"] button')!.click());
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-discourse-more]')!.click());
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-discourse-post]')!.click());
  assert.ok(host.querySelector('[data-reader-return]'));
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-reader-return]')!.click());
  assert.equal(host.querySelector('[data-discourse-frame="a"] button')!.getAttribute('aria-expanded'),'true');
  assert.equal(host.querySelector('[data-discourse-more]')!.getAttribute('aria-expanded'),'true');
 }finally{await act(async()=>root.unmount());Object.assign(globalThis,prior);dom.window.close();}
});
