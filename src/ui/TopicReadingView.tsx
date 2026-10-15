import type { CSSProperties } from 'react';
import type { TopicReadingModel } from '../viewmodel/topic-reading';
import { ReadingHeader, RefLinks, RunButton, type RefLink } from './ReadingParts';
import { tokens } from './tokens';

const r = tokens.reader, rd = tokens.reading, d = tokens.discourse, t = tokens.deepReading;
const card: CSSProperties = { marginTop: tokens.spacing.md, padding: rd.cardPadding, borderRadius: d.radius, background: d.card, border: `1px solid ${d.hair}`, fontSize: r.body, lineHeight: r.lineHeight, minWidth: 0, overflowWrap: 'anywhere' };

/** 話題解讀: the topic's posts read together against its research question; refs open the post in the reader. */
export function TopicReadingView({ model, onRun, onRef }: { model: TopicReadingModel; onRun: () => void; onRef: (itemId: string) => void }) {
  // One link per author and post within a point; a post and its author's reply would otherwise repeat.
  const refs = (ids: string[]): RefLink[] => {
    const seen = new Set<string>();
    return ids.flatMap(id => {
      const ref = model.refs.find(x => x.ref === id);
      const key = ref ? `${ref.itemId}:${ref.author}` : '';
      if (!ref || seen.has(key)) return [];
      seen.add(key);
      return [{ key: id, label: ref.author.replace(/^@/, '') || 'unknown', onClick: () => onRef(ref.itemId) }];
    });
  };
  const run = (label: string) => <RunButton label={label} onClick={onRun} data={{ 'data-topic-reading-run': '' }} />;
  const meta = `${model.postCount} 篇 · ${model.model}${model.state === 'offer' ? ` · ${model.cost}` : ''}`;
  return <section data-topic-reading={model.state} aria-label="話題解讀" aria-busy={model.state === 'reading'} style={card}>
    <ReadingHeader title="話題解讀" sub={model.state === 'offer' ? '讀晒啲帖答你嘅問題' : '答你嘅問題'} meta={meta} action={model.state === 'offer' ? run('開始讀') : model.state === 'stale' ? run('重讀') : model.state === 'error' ? run('重試') : undefined} />
    {model.state === 'reading' ? <div role="status" style={{ display: 'grid', gap: d.gap, marginTop: rd.sectionGap }}><span style={{ fontSize: r.secondary, color: d.soft }}>讀緊 {model.postCount} 篇</span>{t.skeletonWidths.map((width, i) => <i key={i} aria-hidden="true" data-topic-reading-skeleton="" style={{ display: 'block', width, height: t.skeletonHeight, borderRadius: tokens.radius.sm, background: t.skeletonBackground, backgroundSize: t.skeletonBackgroundSize }} />)}</div> : null}
    {model.state === 'stale' ? <p role="status" style={{ margin: `${tokens.spacing.sm}px 0 0`, fontSize: r.meta, color: d.soft }}>{model.staleLabel}，下面係上次嘅解讀。</p> : null}
    {model.state === 'error' ? <p role="alert" style={{ margin: `${tokens.spacing.sm}px 0 0`, fontSize: r.secondary }}>{model.error}</p> : null}
    {model.reading && (model.state === 'done' || model.state === 'stale') ? <div style={{ marginTop: rd.sectionGap, paddingTop: rd.sectionGap, borderTop: `1px solid ${tokens.color.line}` }}>
      <p style={{ margin: 0, color: tokens.color.ink }}>{model.reading.answer}</p>
      <ul style={{ margin: `${tokens.spacing.md}px 0 0`, padding: 0, listStyle: 'none', display: 'grid', gap: tokens.spacing.md }}>{model.reading.points.map((p, i) => <li key={i} style={{ display: 'grid', gridTemplateColumns: '12px minmax(0,1fr)', gap: tokens.spacing.xs, fontSize: r.secondary + 0.5, color: tokens.color.subInk }}><span aria-hidden="true" style={{ color: t.accent, lineHeight: 1.9, fontSize: 8 }}>●</span><span>{p.text}<RefLinks items={refs(p.refs)} /></span></li>)}</ul>
      {model.reading.gaps.map((g, i) => <p key={i} style={{ margin: `${tokens.spacing.md}px 0 0`, padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px`, borderRadius: tokens.radius.card, background: rd.definition, fontSize: r.secondary, color: tokens.color.subInk }}><b style={{ color: t.status.open }}>未答到</b> · {g.text}</p>)}
    </div> : null}
    {model.omittedPostCount || model.uncapturedCount ? <p style={{ margin: `${tokens.spacing.sm}px 0 0`, fontSize: r.meta, color: d.soft }}>{model.omittedPostCount ? `輸入字數上限，${model.omittedPostCount} 篇未納入。` : ''}{model.uncapturedCount ? `${model.uncapturedCount} 篇未有擷取，未納入。` : ''}</p> : null}
  </section>;
}
