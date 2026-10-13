import { useState } from 'react';
import type { ProductReaderModel, ProductReaderTab } from '../viewmodel/product-reader';
import { ReaderLensBar } from './ReaderLensBar';
import { ReaderReply } from './CollectionAudienceReading';
import { tokens } from './tokens';
export function CollectionProductReading({model,onLens,onSettings,onAnalyze,onCopy,copyStatus}:{model:ProductReaderModel;onLens:(key:ProductReaderTab)=>void;onSettings?:()=>void;onAnalyze?:(id:string)=>void;onCopy?:(text:string)=>void;copyStatus?:string}) {
 const [full,setFull]=useState(false);
 const a=model.analysis;
 const button={border:0,background:'transparent',color:tokens.color.product,cursor:'pointer',padding:tokens.spacing.sm,fontSize:tokens.reader.secondary};
 const h={fontSize:tokens.reader.headline,lineHeight:tokens.reader.lineHeight,margin:`${tokens.spacing.md}px 0`,fontWeight:600};
 return <section data-product-reader="" style={{fontSize:tokens.reader.body,lineHeight:tokens.reader.lineHeight,overflowWrap:'anywhere'}}>
 <ReaderLensBar tabs={model.tabs} selected={model.selected} onSelect={onLens} accent={()=>tokens.color.product}/>
 <div data-reader-answer="">
 {model.selected==='add' ? <><h3 style={h}>留言補充</h3>{model.replies.map((row,i)=><ReaderReply key={i} row={row}/>)}{!model.replies.length ? <p>樣本內未見留言</p> : null}</> : !a ? <p role="status" data-product-reader-state="">{model.stateLine}{model.action==='settings' ? <button type="button" onClick={onSettings} style={button}>設定 ›</button> : model.action==='retry' ? <button type="button" onClick={()=>onAnalyze?.(model.sessionId)} style={button}>再分析</button> : null}</p> : model.selected==='what' ? <><h3 style={h}>講咩</h3><p>{a.contentSummary}</p>{a.referenceTakeaway ? <p>{a.referenceTakeaway}</p> : null}</> : model.selected==='fit' ? <><h3 style={{...h,color:tokens.color.product}}>{model.tabs[1].mark}</h3><p>{a.whyRelevant}</p>{a.productReading ? <><h3 style={h}>{a.productReading.headline}</h3><button type="button" aria-expanded={full} onClick={()=>setFull(v=>!v)} style={button}>{full ? '收起' : '全文'}</button>{full ? <p>{a.productReading.body}</p> : null}</> : null}<div style={{display:'flex',flexWrap:'wrap',gap:tokens.spacing.sm}}>{model.refs.filter(r=>r.url).map(r=><a key={r.ref} href={r.url!} target="_blank" rel="noopener noreferrer" style={{...button,background:tokens.color.productSoft,borderRadius:tokens.radius.sm,textDecoration:'none',fontSize:tokens.reader.meta}}>@{r.author.replace(/^@/,'') || '作者'} ↗</a>)}</div></> : <><h3 style={h}>點試</h3>{a.experimentHint ? <p>{a.experimentHint}</p> : null}{a.validationMetric ? <p>驗收：{a.validationMetric}</p> : null}{a.blockers?.map((text,i)=><p key={i}>要先解決：{text}</p>)}{model.agentBrief ? <button type="button" data-reader-agent="" onClick={()=>onCopy?.(model.agentBrief)} style={{...button,width:'100%',border:`1px dashed ${tokens.color.line}`,borderRadius:tokens.radius.card}}>複製成 agent 任務</button> : null}{copyStatus ? <p role="status" style={{fontSize:tokens.reader.meta}}>{copyStatus}</p> : null}</>}
 </div></section>;
}
