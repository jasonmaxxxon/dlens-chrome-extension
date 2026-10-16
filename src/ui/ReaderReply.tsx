import { useState, type ReactNode } from "react";
import { Heart, MessageCircle } from "lucide-react";
import type { InlineEvidenceRow } from "../viewmodel/inline-card";
import { avatarGradient, tokens } from "./tokens";
const c = tokens.collectCard, rc = tokens.reader.replyCard;
/** A reply as a small Threads card: avatar, handle, text, likes and replies. Long text folds behind 全文. */
export function ReaderReply({ row, threaded = false, footer }: { row: InlineEvidenceRow; threaded?: boolean; footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const long = row.text.length > rc.clampChars;
  const meta = <span style={{ display: "inline-flex", alignItems: "center", gap: tokens.spacing.md, fontSize: tokens.reader.meta, color: c.soft }}>
    {row.likes !== null ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Heart size={rc.icon} aria-hidden="true" />{row.likes}</span> : null}
    {row.replies !== null ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><MessageCircle size={rc.icon} aria-hidden="true" />{row.replies}</span> : null}
  </span>;
  return <article data-reader-reply="" style={{ display: "grid", gridTemplateColumns: `${rc.avatar}px minmax(0,1fr)`, gap: `0 ${rc.gap}px`, marginTop: tokens.spacing.sm, marginLeft: threaded ? tokens.spacing.lg : 0, padding: rc.padding, background: rc.background, border: `1px solid ${rc.border}`, borderRadius: rc.radius, boxShadow: rc.shadow, minWidth: 0 }}>
    <span aria-hidden="true" style={{ width: rc.avatar, height: rc.avatar, borderRadius: tokens.radius.round, background: avatarGradient(row.author || "?"), color: tokens.color.inverse, display: "grid", placeItems: "center", fontSize: tokens.reader.meta }}>{[...(row.author || "?")][0]}</span>
    <div style={{ minWidth: 0 }}>
      {row.author ? <div style={{ fontSize: tokens.reader.secondary, color: c.soft }}><b style={{ color: tokens.color.ink }}>{row.author}</b>{row.isAuthor ? <span style={{ marginLeft: tokens.spacing.xs, padding: "0 5px", borderRadius: tokens.radius.xs, background: c.wash, color: c.askColors.author, fontWeight: 600 }}>作者</span> : null}{row.time ? ` · ${row.time}` : ""}</div> : null}
      <p style={{ fontSize: tokens.reader.body, color: tokens.color.ink, margin: `${tokens.spacing.xs}px 0`, whiteSpace: "pre-wrap", overflowWrap: "anywhere", ...(long && !open ? { display: "-webkit-box", WebkitLineClamp: rc.clampLines, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}) }}>{row.text}</p>
      <div style={{ display: "flex", alignItems: "center", gap: tokens.spacing.md, flexWrap: "wrap" }}>
        {meta}{footer}
        {long ? <button type="button" data-reader-reply-full="" onClick={() => setOpen(v => !v)} style={{ marginLeft: "auto", border: 0, background: "transparent", padding: 0, fontSize: tokens.reader.meta, color: c.soft, cursor: "pointer" }}>{open ? "收起" : "全文"}</button> : null}
      </div>
    </div>
  </article>;
}
