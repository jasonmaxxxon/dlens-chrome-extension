import { ReaderLensBar } from "./ReaderLensBar";
import { DeepReadingView } from "./DeepReadingView";
import type { DeepReadingModel, DeepCommand } from "../viewmodel/deep-reading";
import type { CSSProperties } from "react";
import type { CollectionReaderModel } from "../viewmodel/collection-reader";
import type { InlineCardAnswer, InlineCardEntryKey, InlineEvidenceRow } from "../viewmodel/inline-card";
import { avatarGradient, getModeTheme, tokens, textStyles } from "./tokens";

const c = tokens.collectCard;
const button: CSSProperties = { ...textStyles.meta, border: 0, borderRadius: tokens.radius.pill, padding: c.btnPadding, cursor: "pointer" };
const quote = (text: string, author: string) => <blockquote style={{ margin: `${tokens.spacing.sm}px 0`, color: c.sub }}>{text}<footer style={{ ...textStyles.meta, fontSize:tokens.reader.meta, color: c.soft }}>@{author}</footer></blockquote>;
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
  if (answer.kind === "empty") return <h3 style={{fontSize:tokens.reader.headline}}>{answer.text}</h3>;
  if (answer.kind === "clusters") return <><h3 style={{fontSize:tokens.reader.headline}}>{answer.headline}</h3><ShareBar segments={answer.segments} />{answer.quote ? quote(answer.quote.text, answer.quote.author) : null}</>;
  if (answer.kind === "methods") return <><h3 style={{fontSize:tokens.reader.headline}}>有咩做法</h3>{answer.rows.map(r => <p key={r.name}><b>{r.name}</b> · {r.fit}</p>)}{quote(answer.quote.text, answer.quote.author)}</>;
  if (answer.kind === "split") return <><h3 style={{fontSize:tokens.reader.headline}}>{answer.agree}</h3>{answer.sides.map(s => <div key={s.claim}><b>{s.claim}</b><p>{s.why}</p>{quote(s.quote.text, s.quote.author)}</div>)}{answer.note ? <p>{answer.note}</p> : null}</>;
  if (answer.kind === "ask") return <><h3 style={{fontSize:tokens.reader.headline}}>{answer.headline}</h3>{answer.rows.map((r, i) => <p key={i}>{r.text} · {r.status === "none" ? "樣本內未見回覆" : r.status === "author" ? "作者回覆" : "有人回覆"}</p>)}</>;
  if (answer.kind === "op") return <><h3 style={{fontSize:tokens.reader.headline}}>作者回應</h3>{answer.rows.map((r, i) => <p key={i}>回應「{r.inReplyTo}」：{r.text}</p>)}</>;
  return <><h3 style={{fontSize:tokens.reader.headline}}>樣本內最高讚</h3>{answer.rows.map((r, i) => <div key={i}>{quote(r.text, r.author)}</div>)}</>;
}
export function ReaderReply({ row, threaded = false }: { row: InlineEvidenceRow; threaded?: boolean }) {
  return <div data-reader-reply="" style={{ display: "grid", gridTemplateColumns: `${c.avatar}px minmax(0,1fr)`, gap: tokens.spacing.sm, marginTop: tokens.spacing.md, marginLeft: threaded ? tokens.spacing.lg : 0 }}>
    <span aria-hidden="true" style={{ width: c.avatar, height: c.avatar, borderRadius: tokens.radius.round, background: avatarGradient(row.author), color: tokens.color.inverse, display: "grid", placeItems: "center", fontSize: tokens.reader.meta }}>{[...(row.author || "?")][0]}</span>
    <div style={{ minWidth: 0 }}><div style={{ ...textStyles.meta, fontSize: tokens.reader.secondary }}><b>@{row.author}</b>{row.isAuthor ? " · 作者" : ""}{row.time ? ` · ${row.time}` : ""}</div><p style={{ fontSize: tokens.reader.body, margin: `${tokens.spacing.xs}px 0`, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{row.text}</p><small style={{ fontSize:tokens.reader.meta,color: c.soft }}>{row.likes !== null ? `♡ ${row.likes}` : ""}{row.replies !== null ? ` · 回覆 ${row.replies}` : ""}</small></div>
  </div>;
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
    <div data-reader-answer="" style={{color:tokens.color.subInk}}>{model.answer ? <Answer answer={model.answer}/> : null}</div>
    {model.evidence ? <div data-reader-evidence=""><b style={{fontSize:tokens.reader.secondary}}>證據</b><p style={{fontSize:tokens.reader.meta, color: c.soft }}>{model.evidence.sub}</p>{model.evidence.groups.map((group, i) => {
      const color = group.tone === "noise" ? c.noise : group.tone === "method" ? c.entryColors.method : group.tone === "side" ? c.sideColors[group.index % c.sideColors.length] : c.clusterColors[group.index % c.clusterColors.length];
      return <section key={i} style={{ padding: `${tokens.spacing.md}px 0`, borderTop: `1px solid ${c.hair}` }}>
        <div data-reader-evidence-header="" style={{ display: "grid", gridTemplateColumns: `${c.dot}px minmax(0,1fr) auto`, alignItems: "center", gap: tokens.spacing.sm }}><i aria-hidden="true" style={{ width: c.dot, height: c.dot, borderRadius: tokens.radius.round, background: color }} /><b>{group.title}</b><span style={{ whiteSpace: "nowrap", color: c.soft }}>{group.meta}</span></div>
        {group.context ? <p style={{ color: c.soft }}>{group.context}</p> : null}
        {group.chains.map((chain, index) => <div key={index} style={{ borderLeft: chain.reply ? `1px solid ${c.threadLine}` : undefined }}><ReaderReply row={chain.row} />{chain.reply ? <ReaderReply row={chain.reply} threaded /> : null}{chain.unanswered ? <p style={{ color: c.soft }}>樣本內未見回覆</p> : null}</div>)}
        {group.more && !group.expanded ? <button type="button" data-reader-more={`${group.tone}:${group.index}`} onClick={()=>onMore(`${group.tone}:${group.index}`)} style={{...button,background:"transparent",color:c.soft}}>再睇 {group.more} 則</button> : null}
      </section>;
    })}{!model.evidence.groups.length ? <p>支持原句已喺答案顯示，呢度唔重複。</p> : null}</div> : null}
    {deepReading && onDeepCommand ? <DeepReadingView model={deepReading} onCommand={onDeepCommand} /> : null}
  </section>;
}
