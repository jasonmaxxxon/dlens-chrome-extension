import type { CSSProperties } from 'react';
import type { TopicReadingModel } from '../viewmodel/topic-reading';
import { tokens } from './tokens';
const r=tokens.reader,d=tokens.discourse,t=tokens.deepReading;
const button:CSSProperties={border:0,borderRadius:tokens.radius.pill,padding:d.pickPad,font:'inherit',fontSize:r.secondary,background:tokens.color.ink,color:tokens.color.inverse,cursor:'pointer',flexShrink:0};
export function TopicReadingView({model,onRun,onRef}:{model:TopicReadingModel;onRun:()=>void;onRef:(itemId:string)=>void}) {
 const refs=(ids:string[])=>ids.map(id=>{const ref=model.refs.find(x=>x.ref===id);return ref?<button type="button" key={id} data-topic-reading-ref={id} onClick={()=>onRef(ref.itemId)} style={{...button,background:t.wash,color:t.accent,fontSize:r.meta,marginLeft:tokens.spacing.xs,marginTop:tokens.spacing.xs}}>@{ref.author.replace(/^@/,'') || 'unknown'} ↗</button>:null;});
 return <section data-topic-reading={model.state} aria-label="話題解讀" aria-busy={model.state==='reading'} style={{marginTop:tokens.spacing.md,padding:tokens.spacing.md,borderRadius:d.radius,background:d.card,border:`1px solid ${d.hair}`,fontSize:r.body,lineHeight:r.lineHeight,minWidth:0,overflowWrap:'anywhere'}}>
  <header style={{display:'flex',gap:d.gap,alignItems:'center'}}><span aria-hidden="true" style={{color:t.accent}}>✦</span><b style={{fontSize:r.secondary}}>話題解讀</b></header>
  {model.state==='offer'?<div style={{display:'flex',gap:d.gap,alignItems:'center',marginTop:tokens.spacing.sm}}><small style={{flex:1,fontSize:r.meta,color:d.soft}}>讀晒 {model.postCount} 篇答你嘅問題 · {model.model} · {model.cost}</small><button type="button" data-topic-reading-run="" style={button} onClick={onRun}>讀</button></div>:null}
  {model.state==='reading'?<div role="status" style={{display:'grid',gap:d.gap,marginTop:tokens.spacing.md}}><span>讀緊 {model.postCount} 篇</span>{t.skeletonWidths.map((width,i)=><i key={i} aria-hidden="true" data-topic-reading-skeleton="" style={{display:'block',width,height:t.skeletonHeight,borderRadius:tokens.radius.sm,background:t.skeletonBackground,backgroundSize:t.skeletonBackgroundSize}}/>)}</div>:null}
  {model.state==='stale'?<div role="status" style={{marginTop:tokens.spacing.sm}}>{model.staleLabel} · <button type="button" data-topic-reading-run="" onClick={onRun} style={button}>重讀</button></div>:null}
  {model.state==='error'?<div role="alert"><p>{model.error}</p><button type="button" data-topic-reading-run="" onClick={onRun} style={button}>重試</button></div>:null}
  {model.reading && (model.state==='done'||model.state==='stale')?<><p style={{color:tokens.color.subInk}}>{model.reading.answer}</p><ul style={{paddingLeft:tokens.spacing.lg,display:'grid',gap:d.gap,fontSize:r.secondary}}>{model.reading.points.map((p,i)=><li key={i}>{p.text}<span>{refs(p.refs)}</span></li>)}</ul>{model.reading.gaps.map((g,i)=><p key={i} style={{fontSize:r.secondary,color:d.soft}}>未答到：{g.text}</p>)}</>:null}
  {model.omittedPostCount || model.uncapturedCount?<p style={{fontSize:r.meta,color:d.soft,marginBottom:0}}>{model.omittedPostCount?`輸入字數上限，${model.omittedPostCount} 篇未納入。`:''}{model.uncapturedCount?`${model.uncapturedCount} 篇未有擷取，未納入。`:''}</p>:null}
 </section>;
}
