import { useState, type CSSProperties, type ReactNode } from "react";
import { tokens } from "./tokens";

const r = tokens.reader;
const rr = tokens.reading;

/** The one action that spends the user's AI credits: a compact pill sized to its label. */
export function RunButton({ label, onClick, data }: { label: string; onClick: () => void; data: Record<string, string> }) {
  return <button type="button" {...data} onClick={onClick} style={{ alignSelf: "center", flexShrink: 0, height: rr.runHeight, padding: `0 ${rr.runPadding}px`, border: 0, borderRadius: tokens.radius.pill, background: tokens.color.ink, color: tokens.color.inverse, font: "inherit", fontSize: r.secondary, fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap", cursor: "pointer" }}>{label}</button>;
}

export interface RefLink { key: string; label: string; href?: string | null; source?: () => ReactNode }

/** Sources for one point as a quiet line of links: the first few, then +N. Never a wall of chips.
 * A second reply by the same author reads `@name #2`; a link opens its captured source right below the line. */
export function RefLinks({ items }: { items: RefLink[] }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, rr.refsShown);
  const nth = new Map<string, number>();
  const labels = items.map(item => { const n = (nth.get(item.label) ?? 0) + 1; nth.set(item.label, n); return n > 1 ? `@${item.label} #${n}` : `@${item.label}`; });
  const link: CSSProperties = { color: tokens.deepReading.accent, textDecoration: "none", border: 0, background: "transparent", padding: 0, font: "inherit", cursor: "pointer" };
  const opened = items.find(item => item.key === open);
  return <div data-reading-refs="" style={{ marginTop: tokens.spacing.xs, fontSize: r.meta, color: tokens.color.softInk, overflowWrap: "anywhere" }}>
    {shown.map((item, i) => <span key={item.key} style={{ whiteSpace: "nowrap" }}>{i ? " · " : ""}{item.source
      ? <button type="button" data-reading-ref={item.key} aria-expanded={open === item.key} onClick={() => setOpen(item.key)} style={{ ...link, fontWeight: open === item.key ? 600 : undefined }}>{labels[i]}</button>
      : <span data-reading-ref={item.key}>{labels[i]}</span>}{item.href ? <> <a data-reading-ref-site={item.key} href={item.href} target="_blank" rel="noopener noreferrer" style={link}>原站 ↗</a></> : null}</span>)}
    {items.length > shown.length ? <button type="button" data-reading-refs-more="" onClick={() => setAll(true)} style={{ ...link, color: tokens.color.softInk, marginLeft: tokens.spacing.xs }}>+{items.length - shown.length}</button> : null}
    {opened?.source ? <>{opened.source()}<button type="button" data-reading-source-close="" onClick={() => setOpen(null)} style={{ ...link, display: "block", marginTop: tokens.spacing.xs, color: tokens.color.softInk }}>收起原文 ▴</button></> : null}
  </div>;
}

/** Header shared by 深入解讀 and 話題解讀: an icon tile, the name, what it covers, and model · size · cost. */
export function ReadingHeader({ title, sub, meta, action }: { title: string; sub: string; meta?: string; action?: ReactNode }) {
  return <header style={{ display: "flex", alignItems: "center", gap: tokens.spacing.sm + 2 }}>
    <span aria-hidden="true" style={{ width: rr.iconTile, height: rr.iconTile, flex: "none", borderRadius: rr.iconRadius, background: tokens.deepReading.wash, color: tokens.deepReading.accent, display: "grid", placeItems: "center" }}>✦</span>
    <div style={{ minWidth: 0, flex: 1 }}>
      <b style={{ display: "block", fontSize: r.body }}>{title}</b>
      <small style={{ display: "block", fontSize: r.meta, color: tokens.color.softInk }}>{sub}</small>
      {/* Model, size and cost on their own line: the cost is what the user weighs before pressing. */}
      {meta ? <small data-reading-meta="" style={{ display: "block", fontSize: r.meta, color: tokens.color.softInk }}>{meta.split(" · ").map((part, i) => <span key={i} style={{ whiteSpace: "nowrap" }}>{i ? " · " : ""}{part}</span>)}</small> : null}
    </div>
    {action}
  </header>;
}

/** A small uppercase-style section key: 術語, 爭論 · 3. */
export const sectionKey = (label: string) => <p style={{ margin: `0 0 ${tokens.spacing.sm}px`, fontSize: r.meta, fontWeight: 600, letterSpacing: ".04em", color: tokens.color.softInk }}>{label}</p>;
