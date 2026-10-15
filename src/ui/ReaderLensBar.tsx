import { tokens } from './tokens';

const r = tokens.reader;

/** Four reading angles as equal tabs. One ink line slides to the chosen tab (motion lives in motion.ts). */
export function ReaderLensBar<K extends string>({ tabs, selected, onSelect, accent }: { tabs: readonly { key: K; label: string; mark: string }[]; selected: K | null; onSelect: (key: K) => void; accent: (key: K) => string }) {
  const index = Math.max(0, tabs.findIndex(tab => tab.key === selected));
  return <div data-reader-entries="" role="group" aria-label="閱讀角度" style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${tabs.length},minmax(0,1fr))`, borderBottom: `1px solid ${tokens.color.line}`, marginTop: tokens.spacing.lg }}>
    {tabs.map(tab => <button type="button" key={tab.key} data-reader-entry={tab.key} aria-pressed={selected === tab.key} onClick={() => onSelect(tab.key)} style={{ border: 0, background: 'transparent', padding: `${r.lensPadY}px ${tokens.spacing.xs}px`, minWidth: 0, cursor: 'pointer', color: tokens.color.ink, fontFamily: tokens.font.sans, display: 'grid', gap: r.lensGap, justifyItems: 'center' }}>
      <b style={{ display: 'block', fontSize: r.lensLabel, fontWeight: selected === tab.key ? 700 : 500, color: selected === tab.key ? tokens.color.ink : tokens.color.subInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{tab.label}</b>
      <small style={{ display: 'block', fontSize: r.meta, color: tab.mark ? accent(tab.key) : tokens.color.line, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{tab.mark || '—'}</small>
    </button>)}
    {selected !== null ? <i aria-hidden="true" data-reader-ink="" style={{ position: 'absolute', left: 0, bottom: -1, width: `${100 / tabs.length}%`, height: tokens.collection.indicatorHeight, transform: `translateX(${index * 100}%)`, pointerEvents: 'none' }}><span style={{ display: 'block', height: '100%', margin: `0 ${r.lensInkInset}px`, borderRadius: tokens.collection.indicatorHeight, background: accent(selected) }} /></i> : null}
  </div>;
}
