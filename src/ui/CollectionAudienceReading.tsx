import { DeepReadingView } from "./DeepReadingView";
import type { DeepReadingModel, DeepCommand } from "../viewmodel/deep-reading";
import type { CSSProperties } from "react";
import type { CollectionReaderModel } from "../viewmodel/collection-reader";
import type { InlineCardAnswer, InlineCardEntryKey, InlineEvidenceRow } from "../viewmodel/inline-card";
import { avatarGradient, getModeTheme, tokens, textStyles } from "./tokens";

const c = tokens.collectCard;
const button: CSSProperties = { ...textStyles.meta, border: 0, borderRadius: tokens.radius.pill, padding: c.btnPadding, cursor: "pointer" };
const quote = (text: string, author: string) => <blockquote style={{ margin: `${tokens.spacing.sm}px 0`, color: c.sub }}>{text}<footer style={{ ...textStyles.meta, color: c.soft }}>@{author}</footer></blockquote>;
function Answer({ answer }: { answer: InlineCardAnswer }) {
  if (answer.kind === "empty") return <p>{answer.text}</p>;
  if (answer.kind === "clusters") return <><p>{answer.headline}</p><div style={{ display: "flex", flexWrap: "wrap", gap: tokens.spacing.sm }}>{answer.segments.map(s => <span key={s.label}>{s.label} {s.pct}%</span>)}</div>{answer.quote ? quote(answer.quote.text, answer.quote.author) : null}</>;
  if (answer.kind === "methods") return <>{answer.rows.map(r => <p key={r.name}><b>{r.name}</b> · {r.fit}</p>)}{quote(answer.quote.text, answer.quote.author)}</>;
  if (answer.kind === "split") return <><p>{answer.agree}</p>{answer.sides.map(s => <div key={s.claim}><b>{s.claim}</b><p>{s.why}</p>{quote(s.quote.text, s.quote.author)}</div>)}{answer.note ? <p>{answer.note}</p> : null}</>;
  if (answer.kind === "ask") return <><p>{answer.headline}</p>{answer.rows.map((r, i) => <p key={i}>{r.text} · {r.status === "none" ? "樣本內未見回覆" : r.status === "author" ? "作者回覆" : "有人回覆"}</p>)}</>;
  if (answer.kind === "op") return <>{answer.rows.map((r, i) => <p key={i}>回應「{r.inReplyTo}」：{r.text}</p>)}</>;
  return <>{answer.rows.map((r, i) => <div key={i}>{quote(r.text, r.author)}</div>)}</>;
}
function Reply({ row, threaded = false }: { row: InlineEvidenceRow; threaded?: boolean }) {
  return <div data-reader-reply="" style={{ display: "grid", gridTemplateColumns: `${c.avatar}px minmax(0,1fr)`, gap: tokens.spacing.sm, marginTop: tokens.spacing.md, marginLeft: threaded ? tokens.spacing.lg : 0 }}>
    <span aria-hidden="true" style={{ width: c.avatar, height: c.avatar, borderRadius: tokens.radius.round, background: avatarGradient(row.author), color: tokens.color.inverse, display: "grid", placeItems: "center", fontSize: c.citeFont }}>{[...(row.author || "?")][0]}</span>
    <div style={{ minWidth: 0 }}><div style={{ ...textStyles.meta }}><b>@{row.author}</b>{row.isAuthor ? " · 作者" : ""}{row.time ? ` · ${row.time}` : ""}</div><p style={{ margin: `${tokens.spacing.xs}px 0`, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{row.text}</p><small style={{ color: c.soft }}>{row.likes !== null ? `♡ ${row.likes}` : ""}{row.replies !== null ? ` · 回覆 ${row.replies}` : ""}</small></div>
  </div>;
}
export function CollectionAudienceReading({ model, evidenceOpen, onEvidence, onLens, onAssign, assignmentPending, deepReading, onDeepCommand }: {
  deepReading?: DeepReadingModel | null; onDeepCommand?: (command: DeepCommand) => void;
  assignmentPending?: boolean; model: CollectionReaderModel; evidenceOpen: boolean; onEvidence: () => void; onLens: (key: InlineCardEntryKey) => void;
  onAssign: (signalId: string, topicId: string | null) => void;
}) {
  const theme = getModeTheme("topic");
  return <section data-collection-reading="" style={{ marginTop: tokens.spacing.lg, fontSize: c.font, lineHeight: c.lineHeight, overflowWrap: "anywhere" }}>
    <div role="group" aria-label={`話題 · ${model.sessionName}`} style={{ display: "flex", flexWrap: "wrap", gap: tokens.spacing.sm }}>
      {model.chips.map(chip => <button key={chip.id ?? "inbox"} type="button" data-reader-topic={chip.id ?? ""} aria-pressed={chip.selected} disabled={!model.signalId || assignmentPending} onClick={() => model.signalId && onAssign(model.signalId, chip.id)} style={{ ...button, background: chip.selected ? theme.accent : theme.accentSoft, color: chip.selected ? tokens.color.inverse : theme.accent }}>{chip.name} <small>{chip.count}</small></button>)}
    </div>
    <p role="status" data-reader-state="" style={{ color: model.card.phase === "failed" ? c.fail : c.soft }}>{model.stateLine}</p>
    {model.aiNote ? <p style={{ color: c.soft }}>{model.aiNote}</p> : null}
    {model.card.few ? <><p>只有 {model.card.few.length} 則留言，未夠歸納，全部列出：</p>{model.card.few.map((q, i) => <div key={i}>{quote(q.text, q.author)}</div>)}</> : null}
    <div data-reader-entries="" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: tokens.spacing.sm }}>
      {model.card.entries.map(entry => <button key={entry.key} type="button" data-reader-entry={entry.key} aria-pressed={model.selected === entry.key} onClick={() => onLens(entry.key)} style={{ ...button, textAlign: "left", minWidth: 0, borderRadius: c.btnRadius, background: c.wash, color: c.entryColors[entry.key], padding: c.entryPadding, boxShadow: model.selected === entry.key ? `inset 0 0 0 1px ${c.entryColors[entry.key]}` : "none" }}><b>{entry.label}</b> <span>{entry.mark}</span><span style={{ display: "block", fontSize: c.entryFinding }}>{entry.finding}</span></button>)}
    </div>
    {deepReading && onDeepCommand ? <DeepReadingView model={deepReading} onCommand={onDeepCommand} /> : null}
    {model.answer ? <div data-reader-answer="" style={{ color: model.selected ? c.entryColors[model.selected] : c.sub }}><Answer answer={model.answer} /></div> : null}
    {model.card.hasEvidence ? <button type="button" data-reader-evidence-toggle="" aria-expanded={evidenceOpen} onClick={onEvidence} style={{ ...button, background: "transparent", color: theme.accent }}>{evidenceOpen ? "收起證據" : "展開證據"}</button> : null}
    {evidenceOpen && model.evidence ? <div data-reader-evidence=""><p style={{ color: c.soft }}>{model.evidence.sub}</p>{model.evidence.groups.map((group, i) => {
      const color = group.tone === "noise" ? c.noise : group.tone === "method" ? c.entryColors.method : group.tone === "side" ? c.sideColors[group.index % c.sideColors.length] : c.clusterColors[group.index % c.clusterColors.length];
      return <section key={i} style={{ padding: `${tokens.spacing.md}px 0`, borderTop: `1px solid ${c.hair}` }}>
        <div data-reader-evidence-header="" style={{ display: "grid", gridTemplateColumns: `${c.dot}px minmax(0,1fr) auto`, alignItems: "center", gap: tokens.spacing.sm }}><i aria-hidden="true" style={{ width: c.dot, height: c.dot, borderRadius: tokens.radius.round, background: color }} /><b>{group.title}</b><span style={{ whiteSpace: "nowrap", color: c.soft }}>{group.meta}</span></div>
        {group.context ? <p style={{ color: c.soft }}>{group.context}</p> : null}
        {group.chains.map((chain, index) => <div key={index} style={{ borderLeft: chain.reply ? `1px solid ${c.threadLine}` : undefined }}><Reply row={chain.row} />{chain.reply ? <Reply row={chain.reply} threaded /> : null}{chain.unanswered ? <p style={{ color: c.soft }}>樣本內未見回覆</p> : null}</div>)}
        {group.more ? <small style={{ color: c.soft }}>另有 {group.more} 則未列出</small> : null}
      </section>;
    })}{!model.evidence.groups.length ? <p>支持原句已喺答案顯示，呢度唔重複。</p> : null}</div> : null}
  </section>;
}
