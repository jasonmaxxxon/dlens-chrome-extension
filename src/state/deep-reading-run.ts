import type { SessionItem, ExtensionSettings } from './types.ts';
import { aiKeyGap, providerKeyFromSettings } from './ai-key.ts';
import { buildDeepReadingInput, buildDeepReadingPrompt, deepModel, estimateDeepReadingCost, DEEP_READING_PROMPT_VERSION, DEEP_READING_SYSTEM_PROMPT } from '../compare/deep-reading.ts';
import { generateDeepReading } from '../compare/provider.ts';
import { saveDeepReadingRecord, type DeepReadingRecord } from '../compare/deep-reading-storage.ts';
import type { StorageAreaLike } from '../compare/inline-reading-storage.ts';
/** Lock before the first await; failures of the initial storage write also release the lock. */
export function createDeepReadingRunner(storage: StorageAreaLike, generate = generateDeepReading, now = () => new Date().toISOString()) {
  const flights = new Map<string, Promise<DeepReadingRecord>>();
  return (item: SessionItem, settings: ExtensionSettings): Promise<DeepReadingRecord> => {
    const existing=flights.get(item.id); if (existing) return existing;
    const run=Promise.resolve().then(async()=>{
      const key=providerKeyFromSettings(settings);
      if (!key) throw new Error(aiKeyGap(settings) || '設定未選 AI provider');
      const input=buildDeepReadingInput(item); if (!input || item.status!=='succeeded') throw new Error('尚未有已抓取留言');
      const model=deepModel(key.provider,settings.deepReadingModels);
      const at=now();
      const metadata={itemId:item.id,captureId:input.captureId,promptVersion:DEEP_READING_PROMPT_VERSION,model,inputReplyCount:input.catalog.length,estimatedCost:estimateDeepReadingCost(buildDeepReadingPrompt(input).length+DEEP_READING_SYSTEM_PROMPT.length,model,at)};
      await saveDeepReadingRecord(storage,{...metadata,status:'running',startedAt:at});
      try {
        const reading=await generate(key.provider,key.apiKey,input,model);
        const record:DeepReadingRecord={...metadata,status:'complete',generatedAt:now(),reading,refs:input.refs};
        await saveDeepReadingRecord(storage,record); return record;
      } catch (e) {
        const error=e instanceof Error ? e.message : String(e);
        await saveDeepReadingRecord(storage,{...metadata,status:'failed',error,at:now()}); throw e;
      }
    }).finally(()=>flights.delete(item.id));
    flights.set(item.id,run); return run;
  };
}
