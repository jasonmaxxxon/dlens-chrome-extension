import { ChevronRight } from "lucide-react";
import { ReaderReply } from "./ReaderReply";
export { ReaderReply } from "./ReaderReply";
import { ReaderLensBar } from "./ReaderLensBar";
import { DeepReadingView } from "./DeepReadingView";
import { BlocksNotice, PostTypeTag } from "./AnalysisBlocks";
import { ReaderWheel } from "./ReaderWheel";
import type { DeepReadingModel, DeepCommand } from "../viewmodel/deep-reading";
import { type CSSProperties, type ReactNode } from "react";
import type { CollectionReaderModel } from "../viewmodel/collection-reader";
import type { AnalysisBlocksModel } from "../viewmodel/analysis-blocks";
import type { InlineCardAnswer, InlineCardEntryKey, InlineCardQuote, InlineEvidenceGroup } from "../viewmodel/inline-card";
import { tokens } from "./tokens";

const c = tokens.collectCard, p = tokens.panel;
const button: CSSProperties = { ...p.type.meta, fontFamily: tokens.font.sans, minHeight: p.size.buttonSm, border: 0, borderRadius: p.radius.sm, padding: `0 ${p.space.sm}px`, color: p.accent, background: "transparent", cursor: "pointer" };
const h3: CSSProperties = { ...p.type.heading, color: p.ink, margin: `${p.space.lg}px 0 ${p.space.md}px` };
const quote = (value: InlineCardQuote, footer?: ReactNode) => <ReaderReply row={{ ...value, isAuthor: !!value.isAuthor, replies: null, time: null }} footer={footer} />;

/** Shares retain the captured cluster colours; labels and measurements stay together. */
function ShareBar({ segments }: { segments: { label: string; measurementLabel: string; pct?: number; noise: boolean }[] }) {
  const colour = (s: { noise: boolean }, i: number) => s.noise ? p.ink4 : p.data[i % p.data.length];
  return <div data-reader-share="">
    <div aria-hidden="true" style={{ display: "flex", gap: p.space.xxs, height: p.reader.shareHeight }}>{segments.map((s, i) => <i key={i} style={{ flex: Math.max(s.pct ?? 1, 1), borderRadius: p.radius.xs, background: colour(s, i) }} />)}</div>
    <div style={{ ...p.type.micro, display: "flex", flexWrap: "wrap", gap: `${p.space.xs}px ${p.space.md}px`, marginTop: p.space.sm, color: p.ink3, fontVariantNumeric: "tabular-nums" }}>
      {segments.map((s, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: p.space.xs }}><i aria-hidden="true" style={{ width: p.size.modeDot, height: p.size.modeDot, borderRadius: p.radius.xs, background: colour(s, i) }} />{s.label} {s.measurementLabel}</span>)}
    </div>
  </div>;
}
function onlyNoiseClusters(answer: InlineCardAnswer | undefined): boolean {
  return answer?.kind === "clusters" && answer.segments.length > 0 && answer.segments.every(segment => segment.noise);
}
function Answer({ answer }: { answer: InlineCardAnswer }) {
  if (answer.kind === "empty") return <h3 style={h3}>{answer.text}</h3>;
  if (answer.kind === "clusters") return onlyNoiseClusters(answer)
    ? <><h3 style={h3}>未有可用觀眾講法</h3><p style={{ ...p.type.bodySm, color: p.ink3 }}>分群均被 AI 標示為雜訊，可展開原句核對。</p></>
    : <><h3 style={h3}>{answer.headline}</h3><ShareBar segments={answer.segments} /></>;
  if (answer.kind === "methods") return <h3 style={h3}>有咩做法</h3>;
  if (answer.kind === "split") return <><h3 style={h3}>{answer.agree}</h3>{answer.note ? <p style={{ ...p.type.bodySm, color: p.ink3 }}>{answer.note}</p> : null}</>;
  // Questions appear once in the evidence chains, with the captured answers attached.
  if (answer.kind === "ask") return <h3 style={h3}>{answer.headline}</h3>;
  if (answer.kind === "op") return <><h3 style={h3}>作者回應</h3>{answer.rows.map((r, i) => <div key={i}><p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.md}px 0 0` }}>回應「{r.inReplyTo}」</p>{quote({ ...r, author: r.author ?? "", likes: r.likes ?? null, isAuthor: true })}</div>)}</>;
  return <><h3 style={h3}>樣本內最高讚</h3>{answer.rows.map((r, i) => <div key={i}>{quote(r)}</div>)}</>;
}
function AskStatus({ status }: { status: "none" | "author" | "other" | "unknown" }) {
  const label = status === "unknown" ? "未能確認回覆" : status === "none" ? "樣本內未見回覆" : status === "author" ? "作者回覆咗" : "有人回覆咗";
  return <span style={{ ...p.type.micro, color: status === "none" ? p.warning : status === "unknown" ? p.ink3 : p.success }}>{label}</span>;
}

const LEGACY_BLOCKS: AnalysisBlocksModel = { mode: "legacy", postType: null, error: false, blocks: [], omitted: [], skipped: [] };
type PresentedGroup = InlineEvidenceGroup & { representative?: InlineCardQuote | null };
/** Reposition current presentation data only. The stored reading and evidence limits do not change. */
function readingGroups(model: CollectionReaderModel): PresentedGroup[] {
  const groups: PresentedGroup[] = (model.evidence?.groups ?? []).map(group => ({ ...group }));
  const empty = (index: number, title: string, tone: InlineEvidenceGroup["tone"], context: string | null = null): PresentedGroup => ({ index, title, tone, context, meta: "", chains: [], more: 0 });
  const answer = model.answer;
  if (answer?.kind === "clusters" && answer.quote) {
    const segment = answer.segments[0];
    const index = groups.findIndex(group => group.title === segment?.label && group.tone === (segment?.noise ? "noise" : "cluster"));
    if (index >= 0) groups[index].representative = answer.quote;
    else if (segment) groups.unshift({ ...empty(0, segment.label, segment.noise ? "noise" : "cluster"), meta: segment.measurementLabel, representative: answer.quote });
  } else if (answer?.kind === "methods") {
    return answer.rows.map((row, index) => ({ ...(groups.find(group => group.tone === "method" && group.index === index) ?? empty(index, row.name, "method", row.fit)), representative: index === 0 ? answer.quote : null }));
  } else if (answer?.kind === "split") {
    return answer.sides.map((side, index) => ({ ...(groups.find(group => group.tone === "side" && group.index === index) ?? empty(index, side.claim, "side", side.why)), representative: side.quote }));
  }
  return groups.filter(group => group.representative || group.chains.length || group.more || group.context).sort((a, b) => Number(a.tone === "noise") - Number(b.tone === "noise"));
}

export function CollectionAudienceReading({ model, onMore, onLens, onAssign, assignmentPending, deepReading, onDeepCommand, onCopy, copyStatus }: {
  deepReading?: DeepReadingModel | null; onDeepCommand?: (command: DeepCommand) => void;
  onCopy?: (text: string) => void; copyStatus?: string;
  assignmentPending?: boolean; model: CollectionReaderModel; onMore: (key: string) => void; onLens: (key: InlineCardEntryKey) => void;
  onAssign: (signalId: string, topicId: string | null) => void;
}) {
  // A model built before blocks-v1 (no `blocks`) reads as the legacy four-cell layout.
  const blocks = model.blocks ?? LEGACY_BLOCKS;
  const few = model.selected === "stance" ? model.card.few : null;
  const groups = few ? [] : readingGroups(model);
  const tabs = onlyNoiseClusters(model.card.answers.stance)
    ? model.card.entries.map(entry => entry.key === "stance" ? { ...entry, mark: "—" } : entry) : model.card.entries;
  const stateLine = (model.stateLine ?? "").replace(/^排隊(?= ·|$)/, "排隊中");
  const stateTone = model.card.phase === "failed" ? { color: p.danger, background: p.dangerSoft }
    : model.card.phase === "queued" || stateLine.includes("比平常久") ? { color: p.warning, background: p.warningSoft }
    : { color: p.accentInk, background: p.accentSoft };
  return <section data-collection-reading="" style={{ marginTop: p.space.lg, borderTop: blocks.mode === "blocks" ? 0 : `1px solid ${p.border}`, ...p.type.body, fontFamily: tokens.font.sans, overflowWrap: "anywhere" }}>
    {model.stateLine ? <p role="status" data-reader-state="" style={{ ...p.type.meta, ...stateTone, borderRadius: p.radius.xs, padding: `${p.space.xs}px ${p.space.sm}px`, margin: `${p.space.lg}px 0 0` }}>{stateLine}</p> : null}
    {blocks.postType && blocks.mode !== "blocks" ? <div style={{ marginTop: p.space.md }}><PostTypeTag type={blocks.postType} /></div> : null}
    <BlocksNotice model={blocks} />
    {blocks.mode === "blocks" && model.wheel ? <ReaderWheel key={model.wheelKey} model={model.wheel} onCopy={onCopy} copyStatus={copyStatus} /> : null}
    {blocks.mode === "legacy" ? <>
    <ReaderLensBar tabs={tabs} selected={model.selected} onSelect={onLens} accent={() => p.accent} />
    <div data-reader-answer="" data-reader-answer-swap="" key={model.selected ?? "none"} style={{ color: p.ink2 }}>{model.card.phase !== "done" ? null : few ? <div data-reader-few=""><h3 style={h3}>留言未夠歸納，先睇原句。</h3>{model.answer?.kind === "clusters" && model.answer.segments[0]?.measurementLabel && model.answer.segments[0].measurementLabel !== "未能確認則數" ? <p style={{ ...p.type.meta, color: p.ink3 }}>{model.answer.segments[0].measurementLabel}</p> : null}{few.map((row, i) => <div key={i}>{quote(row)}</div>)}</div> : model.answer ? <Answer answer={model.answer} /> : null}</div>
    {!few && (model.evidence || groups.length) ? <div data-reader-evidence="" style={{ marginTop: p.space.md }}>
      {groups.map(group => {
        const color = group.tone === "noise" ? p.borderStrong : group.tone === "side" ? c.sideColors[group.index % c.sideColors.length] : p.data[group.index % p.data.length];
        const header = <span data-reader-evidence-header="" data-reader-lead={group.tone === "method" || group.tone === "side" ? "" : undefined} style={{ display: "grid", flex: 1, gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "baseline", gap: `0 ${p.space.sm}px`, minWidth: 0 }}><b style={{ ...p.type.bodySm, fontWeight: 600, color: group.tone === "noise" ? p.ink3 : p.ink }}>{group.title}</b><span style={{ ...p.type.meta, whiteSpace: "nowrap", color: p.ink3, fontVariantNumeric: "tabular-nums" }}>{group.meta}</span></span>;
        const body = <>
          {group.context ? <p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xs}px 0` }}>{group.context}</p> : null}
          {group.representative ? <div data-reader-representative="">{quote(group.representative)}</div> : null}
          {group.chains.map((chain, index) => <div key={index}><ReaderReply row={chain.row} footer={chain.unanswered ? <AskStatus status="none" /> : undefined} />{chain.reply ? <ReaderReply row={chain.reply} threaded /> : null}</div>)}
          {group.more && !group.expanded ? <button type="button" data-reader-more={`${group.tone}:${group.index}`} onClick={() => onMore(`${group.tone}:${group.index}`)} style={{ ...button, marginTop: p.space.xs }}>展開 {group.more} 則 ›</button> : null}
        </>;
        return <section key={`${group.tone}:${group.index}`} data-reader-evidence-group="" style={{ marginTop: p.space.md, paddingLeft: p.space.md, borderLeft: `${p.reader.clusterBar}px solid ${color}`, minWidth: 0 }}>
          {group.tone === "noise" ? <details data-reader-noise=""><summary style={{ cursor: "pointer", minHeight: p.size.buttonSm, display: "flex", alignItems: "center", gap: p.space.sm, listStyle: "none" }}><ChevronRight data-reader-noise-chevron="" size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" style={{ color: p.ink3, flexShrink: 0 }} />{header}</summary>{body}</details> : <>{header}{body}</>}
        </section>;
      })}
      {!groups.length ? <p style={{ ...p.type.bodySm, color: p.ink3 }}>支持原句已喺上面顯示，呢度唔重複。</p> : null}
    </div> : null}
    </> : null}
    <p data-reading-coverage="" style={{ ...p.type.micro, margin: `${p.space.md}px 0 0`, color: p.ink3 }}>{model.coverageLabel}</p>
    {model.aiNote ? <p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.sm}px 0 0` }}>{model.aiNote}</p> : null}
    {deepReading && onDeepCommand ? <DeepReadingView model={deepReading} onCommand={onDeepCommand} /> : null}
    <div role="group" aria-label={`話題 · ${model.sessionName}`} style={{ display: "flex", overflowX: "auto", flexWrap: "nowrap", gap: p.space.xs, marginTop: p.space.lg, padding: `${p.space.xs}px 0`, scrollbarWidth: "none" }}>
      {model.chips.map(chip => <button key={chip.id ?? "inbox"} type="button" data-reader-topic={chip.id ?? ""} aria-pressed={chip.selected} disabled={!model.signalId || assignmentPending} onClick={() => model.signalId && onAssign(model.signalId, chip.id)} style={{ ...button, height: p.size.chip, whiteSpace: "nowrap", flex: "none", borderRadius: p.radius.pill, background: chip.selected ? p.ink : p.surfaceSubtle, color: chip.selected ? p.surface : p.ink2 }}>{chip.name} <small style={{ ...p.type.micro, color: chip.selected ? p.chipCountOn : p.ink3 }}>{chip.count}</small></button>)}
    </div>
  </section>;
}
