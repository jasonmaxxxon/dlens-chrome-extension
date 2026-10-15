import { readingCoverageLabel } from '../compare/reading-coverage';
import type { ExtensionSettings, SessionItem } from '../state/types';
import { guardDeepAudienceReading, buildDeepReadingInput, buildDeepReadingPrompt, DEEP_READING_SYSTEM_PROMPT, deepModel, estimateDeepReadingCost } from '../compare/deep-reading';
import { deepReadingStale, type DeepReadingRecord } from '../compare/deep-reading-storage';
export interface DeepDisclosure { term: number | null; debate: number | null; more: boolean }
export const EMPTY_DEEP_DISCLOSURE: DeepDisclosure = {term:null,debate:null,more:false};
export type DeepCommand = { type:'run'; itemId:string } | { type:'term'|'debate'; index:number } | {type:'more'};
export function toggleDeepDisclosure(current: DeepDisclosure, command: Exclude<DeepCommand,{type:'run'}>): DeepDisclosure {
  if (command.type==='more') return {...current,more:!current.more};
  return {...current,[command.type]:current[command.type]===command.index ? null : command.index};
}
export function buildDeepReadingModel(item: SessionItem, settings: ExtensionSettings, stored: DeepReadingRecord | undefined, now: string, pending=false, error: string | null=null, disclosure=EMPTY_DEEP_DISCLOSURE) {
  const input=buildDeepReadingInput(item); if (!input) return null;
  const provider=settings.oneLinerProvider || 'google';
  const model=deepModel(provider,settings.deepReadingModels);
  const liveEstimate=estimateDeepReadingCost(buildDeepReadingPrompt(input).length+DEEP_READING_SYSTEM_PROMPT.length,model,now);
  const estimate=stored?.status==='complete' && !deepReadingStale(stored,item.latestCapture?.id) ? stored.estimatedCost : liveEstimate;
  const stale=stored && deepReadingStale(stored,item.latestCapture?.id);
  const dead=stored?.status==='running' && Date.parse(now)-Date.parse(stored.startedAt)>180_000;
  const state = pending ? 'reading' : error ? 'error' : stale ? 'stale' : stored?.status==='complete' ? 'done' : stored?.status==='failed' || dead ? 'error' : stored?.status==='running' ? 'reading' : 'offer';
  const reading=stored?.status==='complete' ? guardDeepAudienceReading(stored.reading,stored.refs,item,stored.captureId) : null;
  return { coverageLabel:readingCoverageLabel(stored?.status==='complete' && !pending?stored.coverage:input.coverage), sourceItems:[item], sourceCaptureId:stored?.captureId, itemId:item.id, state, model:reading && (state==='done' || state==='stale') ? stored!.model : model, replyCount:stored?.status==='complete' && !pending ? stored.inputReplyCount : input.catalog.length,
    cost:estimate ? `約 $${estimate.usd.toFixed(3)}` : '未有價目', error:error || (stored?.status==='failed' ? stored.error : dead ? '上次解讀中斷，請重試' : null),
    reading,refs:stored?.status==='complete' ? stored.refs : [],disclosure,
    run:{type:'run',itemId:item.id} as DeepCommand };
}
export type DeepReadingModel = NonNullable<ReturnType<typeof buildDeepReadingModel>>;
