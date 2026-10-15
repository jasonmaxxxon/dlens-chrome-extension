import { useState, type CSSProperties, type ReactNode } from "react";
import { tokens } from "./tokens";

const r = tokens.reader;
const rr = tokens.reading;

/** The one action that spends the user's AI credits: a compact pill sized to its label. */
export function RunButton({ label, onClick, data }: { label: string; onClick: () => void; data: Record<string, string> }) {
  return <button type="button" {...data} onClick={onClick} style={{ alignSelf: "center", flexShrink: 0, height: rr.runHeight, padding: `0 ${rr.runPadding}px`, border: 0, borderRadius: tokens.radius.pill, background: tokens.color.ink, color: tokens.color.inverse, font: "inherit", fontSize: r.secondary, fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap", cursor: "pointer" }}>{label}</button>;
}

export interface RefLink { key: string; label: string; href?: string | null; onClick?: () => void }

/** Sources for one point as a quiet line of links: the first few, then +N. Never a wall of chips. */
export function RefLinks({ items }: { items: RefLink[] }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, rr.refsShown);
  const link: CSSProperties = { color: tokens.deepReading.accent, textDecoration: "none", border: 0, background: "transparent", padding: 0, font: "inherit", cursor: "pointer" };
  return <span data-reading-refs="" style={{ display: "block", marginTop: tokens.spacing.xs, fontSize: r.meta, color: tokens.color.softInk, overflowWrap: "anywhere" }}>
    {shown.map((item, i) => <span key={item.key}>{i ? " · " : ""}{item.onClick
      ? <button type="button" data-reading-ref={item.key} onClick={item.onClick} style={link}>@{item.label}</button>
      : <span data-reading-ref={item.key}>@{item.label}</span>}{item.href ? <> <a data-reading-ref-site={item.key} href={item.href} target="_blank" rel="noopener noreferrer" style={link}>原站 ↗</a></> : null}</span>)}
    {items.length > shown.length ? <button type="button" data-reading-refs-more="" onClick={() => setAll(true)} style={{ ...link, color: tokens.color.softInk, marginLeft: tokens.spacing.xs }}>+{items.length - shown.length}</button> : null}
  </span>;
}

/** Header shared by 深入解讀 and 話題解讀: an icon tile, the name, what it covers, and model · size · cost. */
export function ReadingHeader({ title, sub, meta, action }: { title: string; sub: string; meta?: string; action?: ReactNode }) {
  return <header style={{ display: "flex", alignItems: "center", gap: tokens.spacing.sm + 2 }}>
    <span aria-hidden="true" style={{ width: rr.iconTile, height: rr.iconTile, flex: "none", borderRadius: rr.iconRadius, background: tokens.deepReading.wash, color: tokens.deepReading.accent, display: "grid", placeItems: "center" }}>✦</span>
    <div style={{ minWidth: 0, flex: 1 }}>
      <b style={{ display: "block", fontSize: r.body }}>{title}</b>
      <small style={{ display: "block", fontSize: r.meta, color: tokens.color.softInk }}>{sub}</small>
      {/* Model, size and cost on their own line: the cost is what the user weighs before pressing. */}
      {meta ? <small data-reading-meta="" style={{ display: "block", fontSize: r.meta, color: tokens.color.softInk, overflowWrap: "anywhere" }}>{meta}</small> : null}
    </div>
    {action}
  </header>;
}

/** A small uppercase-style section key: 術語, 爭論 · 3. */
export const sectionKey = (label: string) => <p style={{ margin: `0 0 ${tokens.spacing.sm}px`, fontSize: r.meta, fontWeight: 600, letterSpacing: ".04em", color: tokens.color.softInk }}>{label}</p>;
