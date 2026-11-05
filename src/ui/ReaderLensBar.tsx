import { tokens } from './tokens';

const p = tokens.panel;

/** One stable underline tracks the chosen reading angle. Motion belongs to motion.ts. */
export function ReaderLensBar<K extends string>({ tabs, selected, onSelect, accent: _accent }: { tabs: readonly { key: K; label: string; mark: string }[]; selected: K | null; onSelect: (key: K) => void; accent: (key: K) => string }) {
  const index = Math.max(0, tabs.findIndex(tab => tab.key === selected));
  return <div data-reader-entries="" role="group" aria-label="閱讀角度" style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${tabs.length},minmax(0,1fr))`, borderBottom: `1px solid ${p.border}`, marginTop: p.space.lg }}>
    {tabs.map(tab => <button type="button" key={tab.key} data-reader-entry={tab.key} aria-pressed={selected === tab.key} onClick={() => onSelect(tab.key)} style={{ border: 0, background: 'transparent', height: p.reader.lensHeight, padding: `0 ${p.space.xs}px`, minWidth: 0, cursor: 'pointer', color: p.ink, fontFamily: tokens.font.sans, display: 'grid', gap: 0, alignContent: 'center', justifyItems: 'center' }}>
      <b style={{ ...p.type.meta, display: 'block', fontWeight: 600, color: selected === tab.key ? p.ink : p.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{tab.label}</b>
      <small style={{ ...p.type.micro, display: 'block', color: selected === tab.key && tab.mark ? p.accentInk : p.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', fontVariantNumeric: 'tabular-nums' }}>{tab.mark || '—'}</small>
    </button>)}
    {selected !== null ? <i aria-hidden="true" data-reader-ink="" style={{ position: 'absolute', left: 0, bottom: -1, width: `${100 / tabs.length}%`, height: p.space.xxs, transform: `translateX(${index * 100}%)`, pointerEvents: 'none' }}><span style={{ display: 'block', height: '100%', margin: `0 ${p.space.sm}px`, borderRadius: p.radius.xs, background: p.accent }} /></i> : null}
  </div>;
}
