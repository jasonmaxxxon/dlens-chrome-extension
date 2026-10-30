import type { ExtensionSettings, ProductSignalAnalysis, SessionItem } from '../state/types';
import { providerKeyFromSettings } from '../state/ai-key';
import { buildProductSignalEvidenceCatalogFromCapture, PRODUCT_SIGNAL_ROOT_REF } from '../compare/product-signal-analysis';
import { readInlineCardThread, inlineReplyRow, buildInlineCardViewModel, buildInlineSaveLine, type InlineCardContext, type InlineSaveLine, type InlineCardPeekInput } from './inline-card';
import { projectCapturedPost } from '../state/captured-post';
import { buildAgentBrief } from './agent-brief';
export const PRODUCT_VERDICT_LABELS = {try:'值得試',watch:'觀察',park:'暫放',insufficient_data:'資料不足'} as const;
export type ProductReaderTab = 'what' | 'fit' | 'try' | 'add';
export function productReadingFinishedAt(item: SessionItem, analysis: ProductSignalAnalysis | undefined, canAnalyze: boolean): string | null {
 if (item.status !== 'succeeded') return null;
 if (analysis?.status === 'complete') return analysis.analyzedAt;
 if (canAnalyze) return null;
 return item.completedAt ?? item.latestCapture?.result?.fetched_at ?? item.latestCapture?.captured_at ?? null;
}
export function buildProductReaderModel(item: SessionItem, sessionId: string, signalId: string | null, stored: ProductSignalAnalysis | undefined, settings: ExtensionSettings, hasContext: boolean, lens: string | null = null, pending=false, error: string | null=null) {
 const analysis=stored?.status==='complete' ? stored : null;
 const thread=readInlineCardThread(item);
 const authors=thread.comments.filter(c=>inlineReplyRow(c,thread.op).isAuthor);
 const seen=new Set(authors.map(c=>c.text));
 const top=thread.ranked.filter(c=>!seen.has(c.text)).slice(0,3);
 const replies=[...authors,...top].map(c=>inlineReplyRow(c,thread.op));
 const evidence=buildProductSignalEvidenceCatalogFromCapture(item.latestCapture);
 const projection=projectCapturedPost(item);
 const rootText=projection.text;
 const preview=rootText || item.descriptor.text_snippet?.trim() || '';
 const url=projection.sourceUrl || item.descriptor.post_url || item.descriptor.page_url || '';
 const refs=(analysis?.productReading?.supportRefs ?? analysis?.evidenceRefs ?? []).flatMap(ref=> {
  const entry=evidence.find(e=>e.ref===ref && e.text.trim());
  if (ref===PRODUCT_SIGNAL_ROOT_REF && rootText.trim()) return [{ref,author:thread.op,url}];
  return entry ? [{ref,author:entry.author || '',url:url}] : [];
 });
 const agentBrief=analysis?.agentTaskSpec?.taskPrompt.trim() && signalId ? buildAgentBrief({mode:'original',selectedSignals:[{id:signalId}],analysesBySignal:new Map([[signalId,analysis]]),signalPreviewById:{[signalId]:preview},signalUrlById:{[signalId]:url},evidenceBySignalId:{[signalId]:evidence}}) : '';
 const stateLine = pending ? '分析中' : error ? '分析失敗' : analysis ? null : !providerKeyFromSettings(settings) ? '未接 AI' : !hasContext ? '未填產品設定，填咗先判斷啱唔啱你' : stored?.status==='error' ? '分析失敗' : '分析中';
 const action=stateLine==='未接 AI' || stateLine?.startsWith('未填') ? 'settings' : stateLine==='分析失敗' ? 'retry' : null;
 const tabs=[{key:'what',label:'講咩',mark:''},{key:'fit',label:'啱唔啱你',mark:analysis ? PRODUCT_VERDICT_LABELS[analysis.verdict] : ''},{key:'try',label:'點試',mark:agentBrief ? '有任務' : ''},{key:'add',label:'留言補充',mark:`${replies.length} 則`}] as const;
 const selected=tabs.find(t=>t.key===lens)?.key ?? (analysis ? 'fit' : 'add');
 // 點試 never renders as a bare heading: without a step, metric, blocker or task it says why, from the verdict.
 const tryEmpty=!!analysis && !analysis.experimentHint?.trim() && !analysis.validationMetric?.trim() && !analysis.blockers?.length && !agentBrief;
 const tryNote=!tryEmpty || !analysis ? null : analysis.verdict==='watch' ? '判斷係「觀察」，暫時未有可以即刻試嘅步驟。' : analysis.verdict==='try' ? '判斷係「值得試」，但分析未寫具體步驟。' : `判斷係「${PRODUCT_VERDICT_LABELS[analysis.verdict]}」，暫時唔建議試。`;
 const tryReason=tryNote ? (analysis?.whyNow?.trim() || analysis?.reason?.trim() || null) : null;
 return {sessionId,itemId:item.id,signalId,tabs,selected,analysis,refs,replies,agentBrief,stateLine,action,tryNote,tryReason,error:error ?? stored?.error};
}
export type ProductReaderModel=ReturnType<typeof buildProductReaderModel>;
export function buildProductSaveLine(item:SessionItem, analysis:ProductSignalAnalysis|undefined, now:number, savedAt:number|null, peek?:InlineCardPeekInput, startError?:string|null, context:InlineCardContext={}):InlineSaveLine {
 const vm = buildInlineCardViewModel(item, 'product', '', { ...context, peek, startError });
 const line = buildInlineSaveLine(vm, now, savedAt, null);
 if (item.status==='succeeded') line.status=`讀完 · ${analysis?.status==='complete' ? PRODUCT_VERDICT_LABELS[analysis.verdict] : `${readInlineCardThread(item).comments.length} 則留言`}`;
 return {...line, destination:'已存入 個人應用', ready:item.status==='succeeded'};
}
