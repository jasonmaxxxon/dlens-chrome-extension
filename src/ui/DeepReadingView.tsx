import {resolveReadingSource} from "../viewmodel/reading-source";
import {ReadingSource} from "./ReadingSource";
import type { CSSProperties } from 'react';
import type { DeepReadingModel, DeepCommand } from '../viewmodel/deep-reading';
import { ReadingHeader, RefLinks, RunButton, sectionKey, type RefLink } from './ReadingParts';
import { tokens } from './tokens';

const p = tokens.panel;
const t = { accent: p.accent, wash: p.accentSoft, status: { agree: p.success, open: p.warning, heated: p.danger }, skeletonWidths: p.reader.skeletonWidths, skeletonHeight: p.reader.skeletonHeight, skeletonBackground: p.surfaceSubtle };
const rd = { cardPadding: p.space.md, sectionGap: p.space.md, definition: p.surfaceSubtle, statusWash: { agree: p.successSoft, open: p.warningSoft, heated: p.dangerSoft }, basis: { experience: p.success, opinion: p.ink3, question: p.accent } };
const r = { body: p.type.body.fontSize, secondary: p.type.bodySm.fontSize, meta: p.type.meta.fontSize, lineHeight: p.type.body.lineHeight };
const card: CSSProperties = { marginTop: p.space.lg, padding: rd.cardPadding, borderRadius: p.radius.md, background: p.surface, boxShadow: p.shadow.card, fontFamily: tokens.font.sans, ...p.type.body, minWidth: 0, overflowWrap: 'anywhere' };
const section: CSSProperties = { marginTop: rd.sectionGap, paddingTop: rd.sectionGap, borderTop: `1px solid ${p.border}` };
const quiet: CSSProperties = { border: 0, background: 'transparent', padding: 0, font: 'inherit', minHeight: p.size.buttonSm, borderRadius: p.radius.sm, cursor: 'pointer', textAlign: 'left', color: 'inherit' };
const STATUS = { agree: '大致同意', open: '未有定論', heated: '有爭議' } as const;
const BASIS = { experience: '有經驗', opinion: '意見', question: '提問' } as const;

/** 深入解讀: offer → reading → result, led by the summary with terms, debates and evidence folded. */
export function DeepReadingView({ model, onCommand }: { model: DeepReadingModel; onCommand: (command: DeepCommand) => void }) {
  const reading = model.reading;
  // Distinct comments remain distinct even when neither has a permalink.
  const refs = (ids: string[]): RefLink[] => {
    const seen = new Set<string>();
    return ids.flatMap(id => {
      const ref = model.refs.find(x => x.ref === id);
      const key = ref ? ref.commentId : '';
      if (!ref || seen.has(key)) return [];
      seen.add(key);
      return [{ key: id, label: ref.author.replace(/^@/, '') || 'unknown', href: ref.url, source: () => <ReadingSource source={resolveReadingSource(model.sourceItems, { itemId: model.itemId, captureId: model.sourceCaptureId ?? '', commentId: ref.commentId })} /> }];
    });
  };
  const meta = `${model.model} · ${model.replyCount} 則 · ${model.cost}`;
  const run = (label: string) => <RunButton label={label} onClick={() => onCommand(model.run)} data={{ 'data-deep-run': '' }} />;
  if (model.state === 'offer') return <section data-deep-reading="offer" aria-label="深入解讀" style={card}><ReadingHeader title="深入解讀" sub="背景、術語、爭論" meta={meta} action={run('開始讀')} /></section>;
  return <section data-deep-reading={model.state} aria-label="深入解讀" aria-busy={model.state === 'reading'} style={card}>
    <ReadingHeader title="深入解讀" sub="背景、術語、爭論" meta={meta} action={(model.state === 'stale' || model.state === 'done') ? run('重讀') : undefined} />
    <p data-reading-coverage="" style={{margin:`${p.space.sm}px 0 0`,...p.type.meta,color:p.ink3}}>{model.coverageLabel}</p>
    {model.state === 'reading' ? <div role="status" style={{ ...section, display: 'grid', gap: p.space.sm }}><span style={{ ...p.type.bodySm, color: p.ink3 }}>讀緊 {model.replyCount} 則留言</span>{t.skeletonWidths.map((width, i) => <i key={i} aria-hidden="true" data-deep-skeleton="" data-panel-skeleton="" style={{ display: 'block', width, height: t.skeletonHeight, borderRadius: p.radius.sm, background: t.skeletonBackground}} />)}</div> : null}
    {model.state === 'error' ? <div role="alert" style={{ ...section, display: 'flex', gap: p.space.md, alignItems: 'center', background: p.dangerSoft, color: p.danger, padding: p.space.sm, borderRadius: p.radius.sm }}><p style={{ margin: 0, flex: 1, ...p.type.bodySm }}>{model.error}</p>{run('重試')}</div> : null}
    {model.state === 'stale' ? <p role="status" style={{ margin: `${p.space.sm}px 0 0`, ...p.type.meta, color: p.ink3 }}>爬到新留言，下面係上次嘅解讀。</p> : null}
    {reading && (model.state === 'done' || model.state === 'stale') ? <>
      <div style={section}>
        <p style={{ margin: 0, color: p.ink2 }}>{reading.background}</p>
        <p style={{ margin: `${p.space.md}px 0 0`, fontFamily: tokens.font.sans, fontSize: r.body, color: p.ink }}><span style={{ display: 'block', fontFamily: tokens.font.sans, ...p.type.meta, fontWeight: 600, color: t.accent }}>你可以點理解</span>{reading.takeaway}</p>
      </div>
      {reading.terms.length ? <div style={section}>{sectionKey('術語')}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: p.space.xs + p.space.xxs }}>{reading.terms.map((term, i) => <button key={i} type="button" data-deep-term={i} aria-expanded={model.disclosure.term === i} onClick={() => onCommand({ type: 'term', index: i })} style={{ ...quiet, minHeight: p.size.chip, padding: `0 ${p.space.sm}px`, borderRadius: p.radius.sm, ...p.type.bodySm, fontWeight: 600, background: model.disclosure.term === i ? t.accent : t.wash, color: model.disclosure.term === i ? p.surface : t.accent }}>{term.term}</button>)}</div>
        {model.disclosure.term !== null && reading.terms[model.disclosure.term] ? <div data-deep-definition="" style={{ marginTop: p.space.sm, padding: `${p.space.sm}px ${p.space.md}px`, borderRadius: p.radius.md, background: rd.definition, ...p.type.bodySm, color: p.ink2 }}><b style={{ fontWeight: 600, color: p.ink }}>{reading.terms[model.disclosure.term].term}</b>：{reading.terms[model.disclosure.term].plain}<RefLinks items={refs(reading.terms[model.disclosure.term].refs)} /></div> : null}
      </div> : null}
      {reading.debates.length ? <div style={section}>{sectionKey(`爭論 · ${reading.debates.length}`)}
        {reading.debates.map((debate, i) => <div key={i} style={{ borderTop: i ? `1px dashed ${p.border}` : undefined, padding: `${p.space.xs + p.space.xxs}px 0` }}>
          <button type="button" data-deep-debate={i} aria-expanded={model.disclosure.debate === i} onClick={() => onCommand({ type: 'debate', index: i })} style={{ ...quiet, display: 'flex', alignItems: 'center', gap: p.space.sm, width: '100%' }}>
            <b style={{ ...p.type.bodySm, fontWeight: 600, flex: 1, minWidth: 0 }}>{debate.question}</b>
            <small style={{ flexShrink: 0, padding: `${p.space.xxs}px ${p.space.xs}px`, borderRadius: p.radius.pill, ...p.type.micro, fontWeight: 600, background: rd.statusWash[debate.status], color: t.status[debate.status] }}>{STATUS[debate.status]}</small>
            <span aria-hidden="true" style={{ flexShrink: 0, ...p.type.meta, color: p.ink3 }}>{model.disclosure.debate === i ? '▴' : '▾'}</span>
          </button>
          {model.disclosure.debate === i ? debate.sides.map((side, j) => <div key={j} data-deep-side="" style={{ marginTop: p.space.sm, paddingLeft: p.space.md, borderLeft: `2px solid ${rd.basis[side.basis]}`, ...p.type.bodySm }}>
            <span style={{ display: 'block', ...p.type.meta, fontWeight: 600, color: p.ink3 }}>{side.who}</span>
            <span style={{ display: 'block', color: p.ink }}>{side.claim}</span>
            <span style={{ display: 'block', marginTop: p.space.xxs, ...p.type.meta, color: p.ink3 }}><b style={{ fontWeight: 600, color: rd.basis[side.basis] }}>{BASIS[side.basis]}</b>{side.note ? ` · ${side.note}` : ''}</span>
            <RefLinks items={refs(side.refs)} />
          </div>) : null}
        </div>)}
      </div> : null}
      <div style={section}>
        <button type="button" data-deep-more="" aria-expanded={model.disclosure.more} onClick={() => onCommand({ type: 'more' })} style={{ ...quiet, ...p.type.bodySm, color: p.ink3 }}>{model.disclosure.more ? '收起 ▴' : '更多：證據強弱 · 冇人答 ▾'}</button>
        {model.disclosure.more ? <div data-deep-evidence="" style={{ display: 'grid', gap: p.space.sm, marginTop: p.space.sm, ...p.type.bodySm, color: p.ink2 }}>
          {(['strong', 'weak'] as const).flatMap(kind => reading.evidence[kind].map((point, i) => <div key={`${kind}${i}`} style={{ display: 'grid', gridTemplateColumns: `${p.size.chipIcon}px minmax(0,1fr)`, gap: p.space.xs }}><span aria-hidden="true" style={{ color: kind === 'strong' ? t.status.agree : t.status.open }}>{kind === 'strong' ? '●' : '○'}</span><div>{point.text}<RefLinks items={refs(point.refs)} /></div></div>))}
          {reading.unanswered.map((point, i) => <div key={`q${i}`} style={{ display: 'grid', gridTemplateColumns: `${p.size.chipIcon}px minmax(0,1fr)`, gap: p.space.xs }}><b aria-hidden="true" style={{ color: t.accent }}>?</b><div>{point.question}<RefLinks items={refs(point.refs)} /></div></div>)}
        </div> : null}
      </div>
      <footer style={{ marginTop: rd.sectionGap, ...p.type.meta, color: p.ink3 }}>每點都連返原留言</footer>
    </> : null}
  </section>;
}
