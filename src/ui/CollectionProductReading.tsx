import { useState, type CSSProperties } from 'react';
import { PRODUCT_VERDICT_LABELS, type ProductReaderModel, type ProductReaderTab } from '../viewmodel/product-reader';
import { ReaderLensBar } from './ReaderLensBar';
import { ReaderReply } from './CollectionAudienceReading';
import { tokens } from './tokens';
const p = tokens.panel;
const button: CSSProperties = { ...p.type.meta, fontFamily: tokens.font.sans, minHeight: p.size.buttonSm, border: 0, borderRadius: p.radius.sm, background: 'transparent', color: p.accent, cursor: 'pointer', padding: `0 ${p.space.sm}px` };
const h: CSSProperties = { ...p.type.heading, margin: `${p.space.lg}px 0 ${p.space.sm}px`, color: p.ink };
export function CollectionProductReading({ model, onLens, onSettings, onAnalyze, onCopy, copyStatus }: { model: ProductReaderModel; onLens: (key: ProductReaderTab) => void; onSettings?: () => void; onAnalyze?: (id: string) => void; onCopy?: (text: string) => void; copyStatus?: string }) {
  const [full, setFull] = useState(false);
  const a = model.analysis;
  const stateTone = model.action === 'retry' ? { color: p.danger, background: p.dangerSoft } : model.stateLine === '分析中' ? { color: p.accentInk, background: p.accentSoft } : { color: p.ink3, background: p.surfaceSubtle };
  return <section data-product-reader="" style={{ ...p.type.body, color: p.ink2, fontFamily: tokens.font.sans, marginTop: p.space.lg, borderTop: `1px solid ${p.border}`, overflowWrap: 'anywhere' }}>
    {a ? <span data-product-verdict="" style={{ ...p.type.meta, display: 'inline-flex', padding: `${p.space.xs}px ${p.space.sm}px`, borderRadius: p.radius.xs, background: p.accentSoft, color: p.accentInk, marginTop: p.space.lg }}>{PRODUCT_VERDICT_LABELS[a.verdict]}</span> : null}
    {!a ? <div role={model.action === 'retry' ? 'alert' : 'status'} data-product-reader-state="" style={{ ...p.type.bodySm, ...stateTone, marginTop: p.space.lg, padding: p.space.sm, borderRadius: p.radius.sm }}>
        {model.stateLine}{model.action === 'settings' ? <button type="button" onClick={onSettings} style={button}>去設定</button> : model.action === 'retry' ? <button type="button" onClick={() => onAnalyze?.(model.sessionId)} style={button}>再分析</button> : null}
        {model.error ? <p style={{ margin: `${p.space.xs}px 0 0` }}>{model.error}</p> : null}
      </div> : null}
    <ReaderLensBar tabs={model.tabs.map(tab => a && tab.key === 'fit' ? { ...tab, mark: '' } : tab)} selected={model.selected} onSelect={onLens} accent={() => p.accent} />
    <div data-reader-answer="" data-reader-answer-swap="" key={model.selected}>
      {model.selected === 'add' ? <><h3 style={h}>留言補充</h3>{model.replies.map((row, i) => <ReaderReply key={i} row={row} />)}{!model.replies.length ? <p style={{ ...p.type.bodySm, color: p.ink3 }}>樣本內未見留言</p> : null}</> : !a ? null : model.selected === 'what' ? <><h3 style={h}>講咩</h3><p>{a.contentSummary}</p>{a.referenceTakeaway ? <p>{a.referenceTakeaway}</p> : null}</> : model.selected === 'fit' ? <>
        <h3 style={h}>啱唔啱你</h3><p>{a.whyRelevant}</p>{a.productReading ? <><h3 style={h}>{a.productReading.headline}</h3><button type="button" aria-expanded={full} onClick={() => setFull(v => !v)} style={button}>{full ? '收起' : '全文'}</button>{full ? <p>{a.productReading.body}</p> : null}</> : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: p.space.sm }}>{model.refs.filter(r => r.url).map(r => <a key={r.ref} href={r.url!} target="_blank" rel="noopener noreferrer" style={{ ...button, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>@{r.author.replace(/^@/, '') || '作者'} ↗</a>)}</div>
      </> : <><h3 style={h}>點試</h3>{model.tryNote ? <p data-product-try-note="">{model.tryNote}</p> : null}{model.tryReason ? <p style={{ ...p.type.bodySm, color: p.ink3 }}>原因：{model.tryReason}</p> : null}{a.experimentHint ? <p>{a.experimentHint}</p> : null}{a.validationMetric ? <p>驗收：{a.validationMetric}</p> : null}{a.blockers?.map((text, i) => <p key={i}>要先解決：{text}</p>)}{model.agentBrief ? <button type="button" data-reader-agent="" onClick={() => onCopy?.(model.agentBrief)} style={{ ...button, width: '100%', border: `1px solid ${p.border}`, background: p.surface, borderRadius: p.radius.sm }}>複製成 agent 任務</button> : null}{copyStatus ? <p role="status" style={{ ...p.type.meta, color: p.ink3 }}>{copyStatus}</p> : null}</>}
    </div>
  </section>;
}
