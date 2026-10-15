import assert from 'node:assert/strict';
import test from 'node:test';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';
import {useCollectionProducts} from '../src/ui/useCollectionProducts.ts';
import {session,item} from './collection-browser.fixtures.ts';
import {PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY} from '../src/compare/product-signal-storage.ts';

test('successful product refresh clears transient read errors while preserving analysis action errors',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://dlens.test'});
 const g=globalThis as any;const keys=['window','document','HTMLElement','chrome','IS_REACT_ACT_ENVIRONMENT'];const prior=keys.map(k=>Object.getOwnPropertyDescriptor(g,k));
 const listeners=new Set<(changes:any,area:string)=>void>();let failRead=true,failAnalyze=false;
 const chrome={runtime:{sendMessage:async(message:any)=>message.type==='product/analyze-signals' ? failAnalyze ? {ok:false,error:'analysis quota'} : {ok:true,productSignalAnalyses:[]} : failRead ? {ok:false,error:'transient read'} : {ok:true,productSignalAnalyses:[],signals:[],productContext:null}},storage:{onChanged:{addListener:(fn:any)=>listeners.add(fn),removeListener:(fn:any)=>listeners.delete(fn)}}};
 Object.assign(g,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,chrome,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root')!);const sessions=[session('product',[item('p')],'product')];let state:ReturnType<typeof useCollectionProducts>;
 function Harness(){state=useCollectionProducts(sessions);return <div>{state.errors.product ?? ''}</div>;}
 const refresh=()=>listeners.forEach(fn=>fn({[PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY]:{}},'local'));
 try {
  await act(async()=>root.render(<Harness/>));assert.equal(state!.errors.product,'transient read');assert.equal(state!.loaded,false);
  failRead=false;await act(async()=>refresh());assert.equal(state!.errors.product,undefined);assert.equal(state!.loaded,true);
  failAnalyze=true;await act(async()=>state!.analyze('product'));assert.equal(state!.errors.product,'analysis quota');
  await act(async()=>refresh());assert.equal(state!.errors.product,'analysis quota','a successful read does not hide an analyze failure');
  failAnalyze=false;await act(async()=>state!.analyze('product'));assert.equal(state!.errors.product,undefined);
 }finally{await act(async()=>root.unmount());dom.window.close();keys.forEach((k,i)=>prior[i] ? Object.defineProperty(g,k,prior[i]!) : Reflect.deleteProperty(g,k));}
});
