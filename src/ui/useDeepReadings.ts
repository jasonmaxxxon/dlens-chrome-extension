import { useEffect, useRef, useState } from 'react';
import { DEEP_READINGS_STORAGE_KEY, normalizeDeepReadingRecords, type DeepReadingRecord } from '../compare/deep-reading-storage';
import type { ExtensionResponse } from '../state/messages';
import { sendExtensionMessage } from './controller';
export function useDeepReadings(enabled:boolean) {
  const [records,setRecords]=useState<Record<string,DeepReadingRecord>>({});
  const [pending,setPending]=useState<Record<string,boolean>>({});
  const [errors,setErrors]=useState<Record<string,string>>({});
  const flights=useRef(new Set<string>());
  useEffect(()=>{
    if (!enabled || typeof chrome==='undefined' || !chrome.storage?.local) return;
    let cancelled=false;
    const receive=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{if(area==='local' && changes[DEEP_READINGS_STORAGE_KEY]) setRecords(normalizeDeepReadingRecords(changes[DEEP_READINGS_STORAGE_KEY].newValue));};
    // Subscribe before loading; prevent a late initial read from overwriting a live update.
    let changed=false;
    const listener=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{ if(area==='local' && changes[DEEP_READINGS_STORAGE_KEY]) changed=true; receive(changes,area); };
    chrome.storage.onChanged.addListener(listener);
    void chrome.storage.local.get(DEEP_READINGS_STORAGE_KEY).then(value=>{if(!cancelled && !changed) setRecords(normalizeDeepReadingRecords(value[DEEP_READINGS_STORAGE_KEY]));}).catch(()=>undefined);
    return ()=>{cancelled=true;chrome.storage.onChanged.removeListener(listener);};
  },[enabled]);
  const run=async(itemId:string)=>{
    if(flights.current.has(itemId)) return;
    flights.current.add(itemId);setPending(p=>({...p,[itemId]:true}));setErrors(e=>({...e,[itemId]:''}));
    try {const response=await sendExtensionMessage<ExtensionResponse>({type:'deep-reading/run',itemId});if(!response.ok) throw new Error(response.error);if(response.deepReading) setRecords(r=>({...r,[itemId]:response.deepReading!}));}
    catch(e){setErrors(v=>({...v,[itemId]:e instanceof Error ? e.message : String(e)}));}
    finally{flights.current.delete(itemId);setPending(p=>({...p,[itemId]:false}));}
  };
  return {records,pending,errors,run};
}
