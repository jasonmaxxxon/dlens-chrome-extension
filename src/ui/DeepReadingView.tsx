import type { CSSProperties } from 'react';
import type { DeepReadingModel, DeepCommand } from '../viewmodel/deep-reading';
import { ReadingHeader, RefLinks, RunButton, sectionKey, type RefLink } from './ReadingParts';
import { tokens } from './tokens';

const t = tokens.deepReading, rd = tokens.reading, r = tokens.reader;
const card: CSSProperties = { marginTop: tokens.spacing.lg, padding: rd.cardPadding, borderRadius: tokens.radius.cardLg, background: tokens.color.elevated, boxShadow: tokens.shadow.card, fontSize: r.body, lineHeight: r.lineHeight, minWidth: 0, overflowWrap: 'anywhere' };
const section: CSSProperties = { marginTop: rd.sectionGap, paddingTop: rd.sectionGap, borderTop: `1px solid ${tokens.color.line}` };
const quiet: CSSProperties = { border: 0, background: 'transparent', padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left', color: 'inherit' };
const STATUS = { agree: '大致同意', open: '未有定論', heated: '有爭議' } as const;
const BASIS = { experience: '有經驗', opinion: '意見', question: '提問' } as const;

/** 深入解讀: offer → reading → result, led by the summary with terms, debates and evidence folded. */
export function DeepReadingView({ model, onCommand }: { model: DeepReadingModel; onCommand: (command: DeepCommand) => void }) {
  const reading = model.reading;
  // One link per author and destination within a point; replies without their own permalink would repeat.
  const refs = (ids: string[]): RefLink[] => {
    const seen = new Set<string>();
    return ids.flatMap(id => {
      const ref = model.refs.find(x => x.ref === id);
      const key = ref ? `${ref.url ?? ''}:${ref.author}` : '';
      if (!ref || seen.has(key)) return [];
      seen.add(key);
      return [{ key: id, label: ref.author.replace(/^@/, '') || 'unknown', href: ref.url }];
    });
  };
  const meta = `${model.model} · ${model.replyCount} 則 · ${model.cost}`;
  const run = (label: string) => <RunButton label={label} onClick={() => onCommand(model.run)} data={{ 'data-deep-run': '' }} />;
  if (model.state === 'offer') return <section data-deep-reading="offer" aria-label="深入解讀" style={{ ...card, boxShadow: 'none', border: `1px solid ${tokens.color.line}` }}><ReadingHeader title="深入解讀" sub="背景、術語、爭論" meta={meta} action={run('開始讀')} /></section>;
  return <section data-deep-reading={model.state} aria-label="深入解讀" aria-busy={model.state === 'reading'} style={card}>
    <ReadingHeader title="深入解讀" sub="背景、術語、爭論" meta={meta} action={model.state === 'stale' ? run('重讀') : undefined} />
    {model.state === 'reading' ? <div role="status" style={{ ...section, display: 'grid', gap: tokens.spacing.sm }}><span style={{ fontSize: r.secondary, color: tokens.color.softInk }}>讀緊 {model.replyCount} 則留言</span>{t.skeletonWidths.map((width, i) => <i key={i} aria-hidden="true" data-deep-skeleton="" style={{ display: 'block', width, height: t.skeletonHeight, borderRadius: tokens.radius.sm, background: t.skeletonBackground, backgroundSize: t.skeletonBackgroundSize }} />)}</div> : null}
    {model.state === 'error' ? <div role="alert" style={{ ...section, display: 'flex', gap: tokens.spacing.md, alignItems: 'center' }}><p style={{ margin: 0, flex: 1, fontSize: r.secondary }}>{model.error}</p>{run('重試')}</div> : null}
    {model.state === 'stale' ? <p role="status" style={{ margin: `${tokens.spacing.sm}px 0 0`, fontSize: r.meta, color: tokens.color.softInk }}>爬到新留言，下面係上次嘅解讀。</p> : null}
    {reading && (model.state === 'done' || model.state === 'stale') ? <>
      <div style={section}>
        <p style={{ margin: 0, color: tokens.color.subInk }}>{reading.background}</p>
        <p style={{ margin: `${tokens.spacing.md}px 0 0`, fontFamily: tokens.font.serifCjk, fontSize: r.body + 0.5, color: tokens.color.ink }}><span style={{ display: 'block', fontFamily: tokens.font.sans, fontSize: r.meta, fontWeight: 600, color: t.accent }}>你可以點理解</span>{reading.takeaway}</p>
      </div>
      {reading.terms.length ? <div style={section}>{sectionKey('術語')}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: tokens.spacing.xs + 2 }}>{reading.terms.map((term, i) => <button key={i} type="button" data-deep-term={i} aria-expanded={model.disclosure.term === i} onClick={() => onCommand({ type: 'term', index: i })} style={{ ...quiet, padding: '3px 9px', borderRadius: tokens.radius.sm, fontSize: r.secondary, fontWeight: 600, background: model.disclosure.term === i ? t.accent : t.wash, color: model.disclosure.term === i ? tokens.color.inverse : t.accent }}>{term.term}</button>)}</div>
        {model.disclosure.term !== null && reading.terms[model.disclosure.term] ? <div data-deep-definition="" style={{ marginTop: tokens.spacing.sm, padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px`, borderRadius: tokens.radius.card, background: rd.definition, fontSize: r.secondary, color: tokens.color.subInk }}><b style={{ color: tokens.color.ink }}>{reading.terms[model.disclosure.term].term}</b>：{reading.terms[model.disclosure.term].plain}<RefLinks items={refs(reading.terms[model.disclosure.term].refs)} /></div> : null}
      </div> : null}
      {reading.debates.length ? <div style={section}>{sectionKey(`爭論 · ${reading.debates.length}`)}
        {reading.debates.map((debate, i) => <div key={i} style={{ borderTop: i ? `1px dashed ${tokens.color.line}` : undefined, padding: `${tokens.spacing.xs + 2}px 0` }}>
          <button type="button" data-deep-debate={i} aria-expanded={model.disclosure.debate === i} onClick={() => onCommand({ type: 'debate', index: i })} style={{ ...quiet, display: 'flex', alignItems: 'center', gap: tokens.spacing.sm, width: '100%' }}>
            <b style={{ flex: 1, minWidth: 0, fontSize: r.body - 0.5 }}>{debate.question}</b>
            <small style={{ flexShrink: 0, padding: '2px 7px', borderRadius: tokens.radius.pill, fontSize: r.meta - 1, fontWeight: 600, background: rd.statusWash[debate.status], color: t.status[debate.status] }}>{STATUS[debate.status]}</small>
            <span aria-hidden="true" style={{ flexShrink: 0, fontSize: r.meta, color: tokens.color.softInk }}>{model.disclosure.debate === i ? '▴' : '▾'}</span>
          </button>
          {model.disclosure.debate === i ? debate.sides.map((side, j) => <div key={j} data-deep-side="" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: `2px ${tokens.spacing.sm}px`, marginTop: tokens.spacing.sm, fontSize: r.secondary }}>
            <span style={{ color: tokens.color.softInk, whiteSpace: 'nowrap' }}>{side.who}</span>
            <span style={{ color: tokens.color.subInk }}>{side.claim}</span>
            <span style={{ gridColumn: 2, fontSize: r.meta, color: tokens.color.softInk }}><b style={{ color: rd.basis[side.basis] }}>{BASIS[side.basis]}</b>{side.note ? ` · ${side.note}` : ''}<RefLinks items={refs(side.refs)} /></span>
          </div>) : null}
        </div>)}
      </div> : null}
      <div style={section}>
        <button type="button" data-deep-more="" aria-expanded={model.disclosure.more} onClick={() => onCommand({ type: 'more' })} style={{ ...quiet, fontSize: r.secondary, color: tokens.color.softInk }}>{model.disclosure.more ? '收起 ▴' : '更多：證據強弱 · 冇人答 ▾'}</button>
        {model.disclosure.more ? <div data-deep-evidence="" style={{ display: 'grid', gap: tokens.spacing.sm, marginTop: tokens.spacing.sm, fontSize: r.secondary, color: tokens.color.subInk }}>
          {(['strong', 'weak'] as const).flatMap(kind => reading.evidence[kind].map((point, i) => <div key={`${kind}${i}`} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0,1fr)', gap: tokens.spacing.xs }}><span aria-hidden="true" style={{ color: kind === 'strong' ? t.status.agree : t.status.open }}>{kind === 'strong' ? '●' : '○'}</span><span>{point.text}<RefLinks items={refs(point.refs)} /></span></div>))}
          {reading.unanswered.map((point, i) => <div key={`q${i}`} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0,1fr)', gap: tokens.spacing.xs }}><b aria-hidden="true" style={{ color: t.accent }}>?</b><span>{point.question}<RefLinks items={refs(point.refs)} /></span></div>)}
        </div> : null}
      </div>
      <footer style={{ marginTop: rd.sectionGap, fontSize: r.meta, color: tokens.color.softInk }}>每點都連返原留言</footer>
    </> : null}
  </section>;
}
