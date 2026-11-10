import { useState, type CSSProperties, type ReactNode } from "react";
import { tokens } from "./tokens";

const p = tokens.panel;

/** The action that spends AI credits stays a compact ink pill. */
export function RunButton({ label, onClick, data }: { label: string; onClick: () => void; data: Record<string, string> }) {
  return <button type="button" {...data} onClick={onClick} style={{ ...p.type.bodySm, fontFamily: tokens.font.sans, fontWeight: 600, alignSelf: "center", flexShrink: 0, height: p.size.button, padding: `0 ${p.space.md}px`, border: 0, borderRadius: p.radius.pill, background: p.ink, color: p.surface, whiteSpace: "nowrap", cursor: "pointer" }}>{label}</button>;
}

export interface RefLink { key: string; label: string; href?: string | null; source?: () => ReactNode }

/** Captured sources stay on their point, with repeated authors numbered. */
export function RefLinks({ items, siteLabel = "原站 ↗" }: { items: RefLink[]; siteLabel?: string }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, p.reader.refsShown);
  const nth = new Map<string, number>();
  const labels = items.map(item => { const n = (nth.get(item.label) ?? 0) + 1; nth.set(item.label, n); return n > 1 ? `@${item.label} #${n}` : `@${item.label}`; });
  const link: CSSProperties = { color: p.accent, textDecoration: "none", border: 0, background: "transparent", padding: `0 ${p.space.xxs}px`, font: "inherit", display: "inline-flex", alignItems: "center", minHeight: p.size.buttonSm, cursor: "pointer", borderRadius: p.radius.xs };
  const opened = items.find(item => item.key === open);
  return <div data-reading-refs="" style={{ ...p.type.meta, marginTop: p.space.xs, color: p.ink3, overflowWrap: "anywhere" }}>
    {shown.map((item, i) => <span key={item.key} style={{ whiteSpace: "nowrap" }}>{i ? " · " : ""}{item.source
      ? <button type="button" data-reading-ref={item.key} aria-expanded={open === item.key} onClick={() => setOpen(item.key)} style={{ ...link, fontWeight: open === item.key ? 600 : undefined }}>{labels[i]}</button>
      : <span data-reading-ref={item.key}>{labels[i]}</span>}{item.href ? <> <a data-reading-ref-site={item.key} href={item.href} target="_blank" rel="noopener noreferrer" style={link}>{siteLabel}</a></> : null}</span>)}
    {items.length > shown.length ? <button type="button" data-reading-refs-more="" onClick={() => setAll(true)} style={{ ...link, marginLeft: p.space.xs }}>+{items.length - shown.length}</button> : null}
    {opened?.source ? <>{opened.source()}<button type="button" data-reading-source-close="" onClick={() => setOpen(null)} style={{ ...link, display: "block", marginTop: p.space.xs }}>收起原文 ▴</button></> : null}
  </div>;
}

/** Model, size and cost stay visible before the command. */
export function ReadingHeader({ title, sub, meta, action }: { title: string; sub: string; meta?: string; action?: ReactNode }) {
  return <header style={{ display: "flex", alignItems: "center", gap: p.space.sm }}>
    <div style={{ minWidth: 0, flex: 1 }}>
      <b style={{ ...p.type.heading, display: "block", color: p.ink }}>{title}</b>
      <small style={{ ...p.type.bodySm, display: "block", color: p.ink3, marginTop: p.space.xxs }}>{sub}</small>
      {meta ? <small data-reading-meta="" style={{ ...p.type.micro, display: "block", color: p.ink3, marginTop: p.space.xxs, fontVariantNumeric: "tabular-nums" }}>{meta.split(" · ").map((part, i) => <span key={i} style={{ whiteSpace: "nowrap" }}>{i ? " · " : ""}{part}</span>)}</small> : null}
    </div>
    {action}
  </header>;
}

export const sectionKey = (label: string) => <p style={{ ...p.type.meta, margin: `0 0 ${p.space.sm}px`, fontWeight: 600, color: p.ink3 }}>{label}</p>;
