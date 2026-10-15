import { ReaderLensBar } from "./ReaderLensBar";
import { DeepReadingView } from "./DeepReadingView";
import type { DeepReadingModel, DeepCommand } from "../viewmodel/deep-reading";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Heart, MessageCircle } from "lucide-react";
import type { CollectionReaderModel } from "../viewmodel/collection-reader";
import type { InlineCardAnswer, InlineCardEntryKey, InlineEvidenceRow } from "../viewmodel/inline-card";
import { avatarGradient, getModeTheme, tokens, textStyles } from "./tokens";

const c = tokens.collectCard;
const button: CSSProperties = { ...textStyles.meta, border: 0, borderRadius: tokens.radius.pill, padding: c.btnPadding, cursor: "pointer" };
const rc = tokens.reader.replyCard;
const h3: CSSProperties = { fontSize: tokens.reader.headline, color: tokens.color.ink, margin: `${tokens.spacing.md}px 0` };
/** DLens' own words (a side, a method, a status) sit above the quoted reply cards, never inside them. */
const lead = (title: string, note?: string | null, dot?: string) => <div data-reader-lead="" style={{ display: "grid", gridTemplateColumns: dot ? `${c.dot}px minmax(0,1fr)` : "minmax(0,1fr)", gap: `2px ${tokens.spacing.sm}px`, alignItems: "baseline", marginTop: tokens.spacing.md }}>
  {dot ? <i aria-hidden="true" style={{ width: c.dot, height: c.dot, borderRadius: tokens.radius.round, background: dot }} /> : null}
  <b style={{ fontSize: tokens.reader.body, color: tokens.color.ink }}>{title}</b>
  {note ? <span style={{ gridColumn: dot ? 2 : 1, fontSize: tokens.reader.secondary, color: c.soft }}>{note}</span> : null}
</div>;
const quote = (text: string, author: string, likes: number | null = null, footer?: ReactNode, isAuthor = false) => <ReaderReply row={{ author, text, likes, replies: null, time: null, isAuthor }} footer={footer} />;
/** The card's stacked share bar and legend, in the same colours as the evidence groups below. */
function ShareBar({ segments }: { segments: { label: string; pct: number; noise: boolean }[] }) {
  const colour = (s: { noise: boolean }, i: number) => s.noise ? c.noise : c.clusterColors[i % c.clusterColors.length];
  return <div data-reader-share="">
    <div style={{ display: "flex", gap: c.barGap, height: c.barHeight }}>{segments.map((s, i) => <i key={s.label} style={{ flex: Math.max(s.pct, 1), borderRadius: c.barHeight / 2, background: colour(s, i) }} />)}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: `${tokens.spacing.xs}px ${tokens.spacing.md}px`, marginTop: tokens.spacing.sm, fontSize: tokens.reader.meta, color: c.soft }}>
      {segments.map((s, i) => <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: tokens.spacing.xs }}><i aria-hidden="true" style={{ width: c.dot, height: c.dot, borderRadius: tokens.radius.xs, background: colour(s, i) }} />{s.label} {s.pct}%</span>)}
    </div>
  </div>;
}
function Answer({ answer }: { answer: InlineCardAnswer }) {
  if (answer.kind === "empty") return <h3 style={h3}>{answer.text}</h3>;
  if (answer.kind === "clusters") return <><h3 style={h3}>{answer.headline}</h3><ShareBar segments={answer.segments} />{answer.quote ? quote(answer.quote.text, answer.quote.author, answer.quote.likes) : null}</>;
  if (answer.kind === "methods") return <><h3 style={h3}>有咩做法</h3>{answer.rows.map(r => <div key={r.name}>{lead(r.name, r.fit, c.entryColors.method)}</div>)}{quote(answer.quote.text, answer.quote.author, answer.quote.likes)}</>;
  if (answer.kind === "split") return <><h3 style={h3}>{answer.agree}</h3>{answer.sides.map((s, i) => <div key={s.claim}>{lead(s.claim, s.why, c.sideColors[i % c.sideColors.length])}{quote(s.quote.text, s.quote.author, s.quote.likes)}</div>)}{answer.note ? <p style={{ color: c.soft }}>{answer.note}</p> : null}</>;
  // The questions themselves appear once, below, grouped by who answered them and with the answers attached.
  if (answer.kind === "ask") return <h3 style={h3}>{answer.headline}</h3>;
  if (answer.kind === "op") return <><h3 style={h3}>作者回應</h3>{answer.rows.map((r, i) => <div key={i}><p style={{ fontSize: tokens.reader.secondary, color: c.soft, margin: `${tokens.spacing.md}px 0 0` }}>回應「{r.inReplyTo}」</p>{quote(r.text, r.author ?? "", r.likes ?? null, undefined, true)}</div>)}</>;
  return <><h3 style={h3}>樣本內最高讚</h3>{answer.rows.map((r, i) => <div key={i}>{quote(r.text, r.author, r.likes)}</div>)}</>;
}
function AskStatus({ status }: { status: "none" | "author" | "other" }) {
  const label = status === "none" ? "樣本內未見回覆" : status === "author" ? "作者回覆咗" : "有人回覆咗";
  return <span style={{ fontSize: tokens.reader.meta, fontWeight: 600, color: c.askColors[status] }}>{label}</span>;
}
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
export function CollectionAudienceReading({ model, onMore, onLens, onAssign, assignmentPending, deepReading, onDeepCommand }: {
  deepReading?: DeepReadingModel | null; onDeepCommand?: (command: DeepCommand) => void;
  assignmentPending?: boolean; model: CollectionReaderModel; onMore: (key: string) => void; onLens: (key: InlineCardEntryKey) => void;
  onAssign: (signalId: string, topicId: string | null) => void;
}) {
  const theme = getModeTheme("topic");
  return <section data-collection-reading="" style={{ marginTop: tokens.spacing.lg, fontSize: tokens.reader.body, lineHeight: tokens.reader.lineHeight, overflowWrap: "anywhere" }}>
    <div role="group" aria-label={`話題 · ${model.sessionName}`} style={{ display: "flex", overflowX: "auto", flexWrap: "nowrap", gap: tokens.spacing.sm }}>
      {model.chips.map(chip => <button key={chip.id ?? "inbox"} type="button" data-reader-topic={chip.id ?? ""} aria-pressed={chip.selected} disabled={!model.signalId || assignmentPending} onClick={() => model.signalId && onAssign(model.signalId, chip.id)} style={{ ...button, whiteSpace: "nowrap", flexShrink: 0, background: chip.selected ? theme.accent : theme.accentSoft, color: chip.selected ? tokens.color.inverse : theme.accent }}>{chip.name} <small>{chip.count}</small></button>)}
    </div>
    {model.stateLine ? <p role="status" data-reader-state="" style={{ color: model.card.phase === "failed" ? c.fail : c.soft }}>{model.stateLine}</p> : null}
    {model.aiNote ? <p style={{ color: c.soft }}>{model.aiNote}</p> : null}

    <ReaderLensBar tabs={model.card.entries} selected={model.selected} onSelect={onLens} accent={key=>c.entryColors[key]} />
    <div data-reader-answer="" data-reader-answer-swap="" key={model.selected ?? "none"} style={{color:tokens.color.subInk}}>{model.answer ? <Answer answer={model.answer}/> : null}</div>
    {model.evidence ? <div data-reader-evidence="" style={{ marginTop: tokens.spacing.lg }}><b style={{fontSize:tokens.reader.secondary}}>證據</b><p style={{fontSize:tokens.reader.meta, color: c.soft }}>{model.evidence.sub}</p>{model.evidence.groups.filter(group => group.chains.length || group.more).map((group, i) => {
      const color = group.tone === "noise" ? c.noise : group.tone === "method" ? c.entryColors.method : group.tone === "side" ? c.sideColors[group.index % c.sideColors.length] : c.clusterColors[group.index % c.clusterColors.length];
      return <section key={i} data-reader-evidence-group="" style={{ marginTop: tokens.reader.group.gap, padding: tokens.reader.group.padding, borderRadius: tokens.reader.group.radius, background: tokens.reader.group.background }}>
        <div data-reader-evidence-header="" style={{ display: "grid", gridTemplateColumns: `${c.dot}px minmax(0,1fr) auto`, alignItems: "center", gap: tokens.spacing.sm }}><i aria-hidden="true" style={{ width: c.dot, height: c.dot, borderRadius: tokens.radius.round, background: color }} /><b>{group.title}</b><span style={{ whiteSpace: "nowrap", color: c.soft }}>{group.meta}</span></div>
        {group.context ? <p style={{ color: c.soft }}>{group.context}</p> : null}
        {group.chains.map((chain, index) => <div key={index}><ReaderReply row={chain.row} footer={chain.unanswered ? <AskStatus status="none" /> : undefined} />{chain.reply ? <ReaderReply row={chain.reply} threaded /> : null}</div>)}
        {group.more && !group.expanded ? <button type="button" data-reader-more={`${group.tone}:${group.index}`} onClick={()=>onMore(`${group.tone}:${group.index}`)} style={{...button,background:"transparent",color:c.soft}}>再睇 {group.more} 則</button> : null}
      </section>;
    })}{!model.evidence.groups.some(group => group.chains.length || group.more) ? <p style={{ fontSize: tokens.reader.secondary, color: c.soft }}>支持原句已喺上面顯示，呢度唔重複。</p> : null}</div> : null}
    {deepReading && onDeepCommand ? <DeepReadingView model={deepReading} onCommand={onDeepCommand} /> : null}
  </section>;
}
