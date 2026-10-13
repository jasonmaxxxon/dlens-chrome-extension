import { useEffect, useRef, useState } from 'react';
import type { ProductSignalAnalysis, Signal, SessionRecord } from '../state/types';
import type { ExtensionResponse } from '../state/messages';
import { PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY } from '../compare/product-signal-storage';
import { PRODUCT_CONTEXT_STORAGE_KEY } from '../compare/product-context';
import { SIGNALS_STORAGE_KEY } from '../state/topic-storage';
import { sendExtensionMessage } from './controller';
export function useCollectionProducts(sessions:SessionRecord[]) {
 const ids=sessions.filter(s=>s.mode==='product').map(s=>s.id).sort().join('\n');
 const [data,setData]=useState<{analyses:Record<string,ProductSignalAnalysis>;signals:Signal[];hasContext:boolean;loaded:boolean}>({analyses:{},signals:[],hasContext:false,loaded:false});
 const [pending,setPending]=useState<Record<string,boolean>>({});
 const [analysisErrors,setAnalysisErrors]=useState<Record<string,string>>({});
 const [loadErrors,setLoadErrors]=useState<Record<string,string>>({});
 const running=useRef(new Set<string>());
 useEffect(()=>{
  let cancelled=false, generation=0;
  const refresh=async()=>{
   const request=++generation;
   try {
    const responses=await Promise.all([sendExtensionMessage<ExtensionResponse>({type:'product/list-signal-analyses'}),sendExtensionMessage<ExtensionResponse>({type:'product/get-context'}),...ids.split('\n').filter(Boolean).map(sessionId=>sendExtensionMessage<ExtensionResponse>({type:'signal/list',sessionId}))]);
    if (cancelled || request!==generation) return;
    const success=responses.map(r=>{if(!r.ok) throw new Error(r.error);return r;});
    setLoadErrors({});
    setData({loaded:true,analyses:Object.fromEntries((success[0].productSignalAnalyses ?? []).map(a=>[a.signalId,a])),hasContext:!!success[1].productContext,signals:success.slice(2).flatMap(r=>r.signals ?? [])});
   } catch(e) {if (!cancelled && request===generation) setLoadErrors(Object.fromEntries(ids.split('\n').filter(Boolean).map(id=>[id,e instanceof Error ? e.message : '分析失敗'])));}
  };
  const onChanged=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{if(area==='local' && [PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY,PRODUCT_CONTEXT_STORAGE_KEY,SIGNALS_STORAGE_KEY].some(k=>k in changes)) void refresh();};
  void refresh(); if(typeof chrome!=='undefined') chrome.storage?.onChanged?.addListener(onChanged);
  return ()=>{cancelled=true;if(typeof chrome!=='undefined') chrome.storage?.onChanged?.removeListener(onChanged);};
 },[ids]);
 async function analyze(sessionId:string) {
  if(running.current.has(sessionId)) return;
  running.current.add(sessionId);setPending(p=>({...p,[sessionId]:true}));setAnalysisErrors(e=>{const next={...e};delete next[sessionId];return next;});
  try {const r=await sendExtensionMessage<ExtensionResponse>({type:'product/analyze-signals',sessionId});if(!r.ok) throw new Error(r.error);if(r.productSignalAnalyses) setData(d=>({...d,analyses:{...d.analyses,...Object.fromEntries(r.productSignalAnalyses!.map(a=>[a.signalId,a]))}}));}
  catch(e){setAnalysisErrors(current=>({...current,[sessionId]:e instanceof Error ? e.message : '分析失敗'}));}
  finally{running.current.delete(sessionId);setPending(p=>({...p,[sessionId]:false}));}
 }
 return {...data,pending,errors:{...loadErrors,...analysisErrors},analyze};
}
