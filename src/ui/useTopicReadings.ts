import { useEffect, useRef, useState } from 'react';
import { TOPIC_READINGS_STORAGE_KEY, normalizeTopicReadingRecords, type TopicReadingRecord } from '../compare/topic-reading-storage';
import type { ExtensionResponse } from '../state/messages';
import { sendExtensionMessage } from './controller';
export function useTopicReadings(enabled:boolean) {
  const [records,setRecords]=useState<Record<string,TopicReadingRecord>>({});
  const [pending,setPending]=useState<Record<string,boolean>>({});
  const [errors,setErrors]=useState<Record<string,string>>({});
  const flights=useRef(new Set<string>());
  useEffect(()=>{
    if (!enabled || typeof chrome==='undefined' || !chrome.storage?.local) return;
    let cancelled=false;
    const receive=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{if(area==='local' && changes[TOPIC_READINGS_STORAGE_KEY]) setRecords(normalizeTopicReadingRecords(changes[TOPIC_READINGS_STORAGE_KEY].newValue));};
    // Subscribe before loading; prevent a late initial read from overwriting a live update.
    let changed=false;
    const listener=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{ if(area==='local' && changes[TOPIC_READINGS_STORAGE_KEY]) changed=true; receive(changes,area); };
    chrome.storage.onChanged.addListener(listener);
    void chrome.storage.local.get(TOPIC_READINGS_STORAGE_KEY).then(value=>{if(!cancelled && !changed) setRecords(normalizeTopicReadingRecords(value[TOPIC_READINGS_STORAGE_KEY]));}).catch(()=>undefined);
    return ()=>{cancelled=true;chrome.storage.onChanged.removeListener(listener);};
  },[enabled]);
  const run=async(topicId:string)=>{
    if(flights.current.has(topicId)) return;
    flights.current.add(topicId);setPending(p=>({...p,[topicId]:true}));setErrors(e=>({...e,[topicId]:''}));
    try {const response=await sendExtensionMessage<ExtensionResponse>({type:'topic-reading/run',topicId});if(!response.ok) throw new Error(response.error);if(response.topicReading) setRecords(r=>({...r,[topicId]:response.topicReading!}));}
    catch(e){setErrors(v=>({...v,[topicId]:e instanceof Error ? e.message : String(e)}));}
    finally{flights.current.delete(topicId);setPending(p=>({...p,[topicId]:false}));}
  };
  return {records,pending,errors,run};
}
