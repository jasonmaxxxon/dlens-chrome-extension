import { useState, type ReactNode } from "react";
import { Heart, MessageCircle } from "lucide-react";
import type { InlineEvidenceRow } from "../viewmodel/inline-card";
import { commentQualityLabel } from "../compare/comment-quality";
import { collectionPanelRelativeTime } from "../viewmodel/collection-browser";
import { collectionTileTint, tokens } from "./tokens";
const p = tokens.panel;
/** Captured replies keep their own author, text and metadata apart from DLens interpretation. */
export function ReaderReply({ row, threaded = false, footer }: { row: InlineEvidenceRow; threaded?: boolean; footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const long = row.text.length > p.reader.replyClampChars;
  const qualityLabel = commentQualityLabel(row.quality?.flag ?? null);
  return <article data-reader-reply="" style={{ display: "grid", gridTemplateColumns: `${p.size.replyAvatar}px minmax(0,1fr)`, gap: p.space.sm, marginTop: p.space.sm, marginLeft: threaded ? p.space.lg : 0, padding: p.space.md, background: p.surface, border: `1px solid ${p.border}`, borderRadius: p.radius.md, boxShadow: p.shadow.card, minWidth: 0 }}>
    <span aria-hidden="true" style={{ ...collectionTileTint(row.author || "?"), width: p.size.replyAvatar, height: p.size.replyAvatar, borderRadius: p.radius.pill, display: "grid", placeItems: "center", ...p.type.micro }}>{[...(row.author || "?").replace(/^@/, "")][0]?.toUpperCase()}</span>
    <div style={{ minWidth: 0 }}>
      {row.author ? <div style={{ ...p.type.meta, color: p.ink3, overflowWrap: "anywhere" }}><b style={{ color: p.ink, fontWeight: 600 }}>{row.author}</b>{row.isAuthor ? <span style={{ marginLeft: p.space.xs, padding: `0 ${p.space.xs}px`, borderRadius: p.radius.xs, background: p.accentSoft, color: p.accentInk, ...p.type.micro }}>作者</span> : null}{row.time ? ` · ${collectionPanelRelativeTime(row.time)}` : ""}</div> : null}
      <p style={{ ...p.type.body, color: p.ink, margin: `${p.space.xs}px 0`, whiteSpace: "pre-wrap", overflowWrap: "anywhere", ...(long && !open ? { display: "-webkit-box", WebkitLineClamp: p.reader.replyClampLines, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}) }}>{row.text}</p>
      <div style={{ ...p.type.micro, color: p.ink3, display: "flex", alignItems: "center", gap: p.space.sm, flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
        {row.likes !== null ? <span style={{ display: "inline-flex", alignItems: "center", gap: p.space.xs }}><Heart size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" />{row.likes}</span> : null}
        {row.replies !== null ? <span style={{ display: "inline-flex", alignItems: "center", gap: p.space.xs }}><MessageCircle size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" />{row.replies}</span> : null}
        {footer}
        {qualityLabel ? <span data-reader-comment-quality={row.quality?.flag}>{qualityLabel}</span> : null}
        {long ? <button type="button" data-reader-reply-full="" aria-expanded={open} onClick={() => setOpen(v => !v)} style={{ ...p.type.meta, marginLeft: "auto", minHeight: p.size.buttonSm, border: 0, background: "transparent", padding: `0 ${p.space.xs}px`, color: p.accent, cursor: "pointer", fontFamily: tokens.font.sans }}>{open ? "收起" : "全文"}</button> : null}
      </div>
    </div>
  </article>;
}
