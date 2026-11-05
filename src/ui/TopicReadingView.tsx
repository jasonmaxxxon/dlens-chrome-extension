import {resolveReadingSource} from "../viewmodel/reading-source";
import {ReadingSource} from "./ReadingSource";
import type { CSSProperties } from 'react';
import type { TopicReadingModel } from '../viewmodel/topic-reading';
import { ReadingHeader, RefLinks, RunButton, type RefLink } from './ReadingParts';
import { tokens } from './tokens';

const panel = tokens.panel;
const r = { body: panel.type.body.fontSize, secondary: panel.type.bodySm.fontSize, meta: panel.type.meta.fontSize, lineHeight: panel.type.body.lineHeight };
const rd = { cardPadding: panel.space.md, sectionGap: panel.space.md, definition: panel.surfaceSubtle };
const d = { radius: panel.radius.md, card: panel.surface, hair: panel.border, gap: panel.space.sm, soft: panel.ink3 };
const t = { skeletonWidths: panel.reader.skeletonWidths, skeletonHeight: panel.reader.skeletonHeight, accent: panel.accent, status: { open: panel.warning } };
const card: CSSProperties = { marginTop: panel.space.md, padding: rd.cardPadding, borderRadius: d.radius, background: d.card, boxShadow: panel.shadow.card, border: `1px solid ${d.hair}`, fontSize: r.body, fontWeight: panel.type.body.fontWeight, lineHeight: r.lineHeight, minWidth: 0, overflowWrap: 'anywhere' };

/** 話題解讀: refs reveal the exact captured source inside the side panel reader. */
export function TopicReadingView({ model, onRun, onRef }: { model: TopicReadingModel; onRun: () => void; onRef: (itemId: string) => void }) {
  // Deduplicate only the same capture and comment; one author may supply several sources.
  const refs = (ids: string[]): RefLink[] => {
    const seen = new Set<string>();
    return ids.flatMap(id => {
      const ref = model.refs.find(x => x.ref === id);
      const key = ref ? `${ref.itemId}:${ref.captureId}:${ref.commentId ?? "root"}` : '';
      if (!ref || seen.has(key)) return [];
      seen.add(key);
      return [{ key: id, label: ref.author.replace(/^@/, '') || 'unknown', href:resolveReadingSource(model.sourceItems,ref).url,source: () => <ReadingSource source={resolveReadingSource(model.sourceItems, ref)} /> }];
    });
  };
  const run = (label: string) => <RunButton label={label} onClick={onRun} data={{ 'data-topic-reading-run': '' }} />;
  const meta = `${model.postCount} 篇 · ${model.model}${model.state === 'offer' ? ` · ${model.cost}` : ''}`;
  return <section data-topic-reading={model.state} aria-label="話題解讀" aria-busy={model.state === 'reading'} style={card}>
    <ReadingHeader title="話題解讀" sub={model.state === 'offer' ? '按已納入內容答你嘅問題' : '答你嘅問題'} meta={meta} action={model.state === 'offer' ? run('開始讀') : (model.state === 'stale' || model.state === 'done') ? run('重讀') : model.state === 'error' ? run('重試') : undefined} />
    <p data-reading-coverage="" style={{margin:`${panel.space.sm}px 0 0`,fontSize:r.meta, lineHeight: panel.type.meta.lineHeight, fontWeight: panel.type.meta.fontWeight,color:panel.ink3}}>{model.coverageLabel}</p>
    {model.state === 'reading' ? <div role="status" style={{ display: 'grid', gap: d.gap, marginTop: rd.sectionGap }}><span style={{ fontSize: r.secondary, lineHeight: panel.type.bodySm.lineHeight, fontWeight: panel.type.bodySm.fontWeight, color: d.soft }}>讀緊 {model.postCount} 篇</span>{t.skeletonWidths.map((width, i) => <i key={i} aria-hidden="true" data-topic-reading-skeleton="" data-panel-skeleton="" style={{ display: 'block', width, height: t.skeletonHeight, borderRadius: panel.radius.sm, background: panel.surfaceSubtle }} />)}</div> : null}
    {model.state === 'stale' ? <p role="status" style={{ margin: `${panel.space.sm}px 0 0`, fontSize: r.meta, lineHeight: panel.type.meta.lineHeight, fontWeight: panel.type.meta.fontWeight, color: d.soft }}>{model.staleLabel}，下面係上次嘅解讀。</p> : null}
    {model.state === 'error' ? <p role="alert" style={{ margin: `${panel.space.sm}px 0 0`, fontSize: r.secondary, lineHeight: panel.type.bodySm.lineHeight, fontWeight: panel.type.bodySm.fontWeight }}>{model.error}</p> : null}
    {model.reading && (model.state === 'done' || model.state === 'stale') ? <div style={{ marginTop: rd.sectionGap, paddingTop: rd.sectionGap, borderTop: `1px solid ${panel.border}` }}>
      <p style={{ margin: 0, color: panel.ink }}>{model.reading.answer}</p>
      <ul style={{ margin: `${panel.space.md}px 0 0`, padding: 0, listStyle: 'none', display: 'grid', gap: panel.space.md }}>{model.reading.points.map((p, i) => <li key={i} style={{ display: 'grid', gridTemplateColumns: '12px minmax(0,1fr)', gap: panel.space.xs, fontSize: panel.type.bodySm.fontSize, lineHeight: panel.type.bodySm.lineHeight, fontWeight: panel.type.bodySm.fontWeight, color: panel.ink2 }}><span aria-hidden="true" style={{ color: t.accent, lineHeight: panel.type.micro.lineHeight, fontSize: panel.type.micro.fontSize, fontWeight: panel.type.micro.fontWeight }}>●</span><div>{p.text}<RefLinks items={refs(p.refs)} /></div></li>)}</ul>
      {model.reading.gaps.map((g, i) => <p key={i} style={{ margin: `${panel.space.md}px 0 0`, padding: `${panel.space.sm}px ${panel.space.md}px`, borderRadius: panel.radius.md, background: rd.definition, fontSize: r.secondary, lineHeight: panel.type.bodySm.lineHeight, fontWeight: panel.type.bodySm.fontWeight, color: panel.ink2 }}><b style={{ color: t.status.open, fontWeight: panel.type.heading.fontWeight }}>未答到</b> · {g.text}</p>)}
    </div> : null}
    {model.uncapturedCount ? <p style={{ margin: `${panel.space.sm}px 0 0`, fontSize: r.meta, lineHeight: panel.type.meta.lineHeight, fontWeight: panel.type.meta.fontWeight, color: d.soft }}>{model.uncapturedCount ? `${model.uncapturedCount} 篇未有擷取，未納入。` : ''}</p> : null}
  </section>;
}
