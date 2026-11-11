import { useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Heart } from "lucide-react";
import type { AnalysisBlocksModel, AnalysisBlockView, BlockEvidenceLink, EntityRow, EntitySort, PostTypeKey, QaPerson } from "../viewmodel/analysis-blocks";
import { ENTITY_SORTS, QA_STATUSES, entityCsv, entityMarkdown, sortEntityRows, type EntityExportLabels } from "../viewmodel/analysis-blocks";
import type { InlineCardAnswer, InlineCardQuote } from "../viewmodel/inline-card";
import { useBlockText } from "./i18n";
import { ReaderReply } from "./ReaderReply";
import { RefLinks } from "./ReadingParts";
import { tokens } from "./tokens";

const p = tokens.panel, c = tokens.collectCard;
type T = ReturnType<typeof useBlockText>;
const h3: CSSProperties = { ...p.type.heading, color: p.ink, margin: 0, flex: 1, minWidth: 0 };
const meta: CSSProperties = { ...p.type.meta, color: p.ink3, fontVariantNumeric: "tabular-nums" };
const textButton: CSSProperties = { ...p.type.meta, fontFamily: tokens.font.sans, minHeight: p.size.buttonSm, border: 0, borderRadius: p.radius.sm, padding: `0 ${p.space.xs}px`, color: p.accent, background: "transparent", cursor: "pointer", whiteSpace: "nowrap" };
const card: CSSProperties = { marginTop: p.space.sm, padding: p.space.md, background: p.surface, border: `1px solid ${p.border}`, borderRadius: p.radius.md, minWidth: 0 };
const pct = (share: number) => Math.round(share * 100);
const quote = (value: InlineCardQuote) => <ReaderReply row={{ ...value, isAuthor: !!value.isAuthor, replies: null, time: null }} />;

/** Every item links back to its own comments; an unrecoverable link shows the plain comment id instead of an empty button. */
function Evidence({ items, t, label = "blocks.action.evidence" }: { items: BlockEvidenceLink[]; t: T; label?: string }) {
  const missing = items.filter(e => !e.href);
  return <>
    <RefLinks siteLabel={t(label)}items={items.filter(e => e.href).map(e => ({ key: e.commentId, label: e.author || e.commentId, href: e.href }))} />
    {missing.map(e => <p key={e.commentId} data-block-evidence-id={e.commentId} style={{ ...p.type.micro, color: p.ink3, margin: `${p.space.xxs}px 0 0`, overflowWrap: "anywhere" }}>{e.author ? `@${e.author} · ` : ""}{t("blocks.action.evidence_missing", { id: e.commentId })}</p>)}
  </>;
}

export function PostTypeTag({ type }: { type: PostTypeKey }) {
  const t = useBlockText();
  return <span data-post-type={type} aria-label={`${t("blocks.post_type.label")}：${t(`blocks.post_type.${type}`)}`} style={{ ...p.type.micro, display: "inline-flex", alignItems: "center", padding: `${p.space.xxs}px ${p.space.sm}px`, borderRadius: p.radius.pill, background: p.accentSoft, color: p.accentInk, whiteSpace: "nowrap" }}>{t(`blocks.post_type.${type}`)}</span>;
}

/** Non-blocking notices: a failed block build, or blocks present but none to show. */
export function BlocksNotice({ model }: { model: AnalysisBlocksModel }) {
  const t = useBlockText();
  if (model.mode === "empty") return <div data-blocks-empty="" role="status" style={{ ...card, background: p.surfaceSubtle, border: 0 }}>
    <b style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink }}>{t("blocks.empty.title")}</b>
    {model.omitted.length ? <ul style={{ margin: `${p.space.xs}px 0 0`, paddingLeft: p.space.lg, ...p.type.bodySm, color: p.ink3 }}>{model.omitted.map((o, i) => <li key={i} data-block-omitted={o.type} data-block-omitted-reason={o.reason}>{t("blocks.omitted.item", { title: t(`blocks.${o.type}.title`) || t("blocks.post_type.unknown") })}</li>)}</ul>
      : <p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xs}px 0 0` }}>{t("blocks.empty.none")}</p>}
  </div>;
  if (!model.error) return null;
  return <p data-blocks-error="" role="status" style={{ ...p.type.bodySm, margin: `${p.space.md}px 0 0`, padding: `${p.space.xs}px ${p.space.sm}px`, borderRadius: p.radius.xs, background: p.warningSoft, color: p.warning }}>{t("blocks.error.fallback")}</p>;
}

/** A qa question or answer. The post itself is labelled as the original post, never as a comment. */
function Person({ person, t, role }: { person: QaPerson; t: T; role: "question" | "answer" }) {
  const evidence: BlockEvidenceLink = { commentId: person.commentId ?? "post", author: person.author, likes: person.likes, isOp: person.isOp, href: person.href, text: person.text };
  return <div data-block-qa-person={role} {...(person.isPost ? { "data-block-qa-post": "" } : {})} style={role === "answer" ? { marginTop: p.space.sm, paddingLeft: p.space.sm, borderLeft: `2px solid ${p.border}`, minWidth: 0 } : { minWidth: 0 }}>
    <div style={{ ...p.type.meta, color: p.ink3, display: "flex", alignItems: "center", gap: p.space.xs, flexWrap: "wrap" }}>
      {person.isPost ? <b style={{ color: p.accentInk, fontWeight: 600 }}>{t("blocks.qa.post_question")}</b> : null}
      {person.author ? <b style={{ color: p.ink, fontWeight: 600 }}>@{person.author}</b> : null}
      {person.isOp ? <span style={{ ...p.type.micro, padding: `0 ${p.space.xs}px`, borderRadius: p.radius.xs, background: p.accentSoft, color: p.accentInk }}>{t("blocks.qa.op")}</span> : null}
      {person.likes !== null ? <span style={{ display: "inline-flex", alignItems: "center", gap: p.space.xxs, fontVariantNumeric: "tabular-nums" }}><Heart size={p.size.chipIcon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" />{person.likes}</span> : null}
    </div>
    <p style={{ ...p.type.bodySm, color: role === "question" ? p.ink : p.ink2, margin: `${p.space.xxs}px 0 0`, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{person.text}</p>
    <Evidence items={[evidence]} t={t} label={person.isPost ? "blocks.action.evidence_post" : "blocks.action.evidence"} />
  </div>;
}

function EntityCard({ row, t }: { row: EntityRow; t: T }) {
  const [open, setOpen] = useState(false);
  // A link only in the post has no comment mentions: say so instead of "0 mentions".
  const postOnly = row.mentions === 0 && row.inPost;
  const flags = [row.inPost && !postOnly ? t("blocks.entity.in_post") : "", row.byOp ? t("blocks.entity.by_op") : ""].filter(Boolean);
  return <li data-block-entity={row.key} style={{ ...card, listStyle: "none" }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: p.space.sm, minWidth: 0 }}>
      <b style={{ ...p.type.cardTitle, color: p.ink, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{row.name}</b>
      <span style={{ ...meta, whiteSpace: "nowrap" }}>{postOnly ? t("blocks.entity.in_post") : t("blocks.entity.mentions", { n: row.mentions })}</span>
      {row.evidence.length ? <button type="button" data-block-entity-toggle={row.key} aria-expanded={open} aria-label={`${t(open ? "blocks.action.collapse" : "blocks.action.expand")} ${row.name}`} onClick={() => setOpen(v => !v)} style={{ ...textButton, alignSelf: "center", display: "inline-grid", placeItems: "center", minWidth: p.size.buttonSm, color: p.ink3 }}>
        {open ? <ChevronUp size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" /> : <ChevronDown size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" />}
      </button> : null}
    </div>
    {row.context ? <p style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xxs}px 0 0` }}>{row.context}</p> : null}
    {row.href ? <a data-block-entity-url="" href={row.href} target="_blank" rel="noopener noreferrer" style={{ ...p.type.bodySm, display: "block", marginTop: p.space.xxs, color: p.accent, textDecoration: "none", overflowWrap: "anywhere", wordBreak: "break-all" }}>{row.url}</a>
      : <span data-block-entity-url="" style={{ ...p.type.bodySm, display: "block", marginTop: p.space.xxs, color: p.ink2, overflowWrap: "anywhere", wordBreak: "break-all" }}>{row.url}</span>}
    <p style={{ ...meta, margin: `${p.space.xs}px 0 0` }}>{[t("blocks.entity.likes", { n: row.likes }), ...flags].join(" · ")}</p>
    {row.recommenders.length ? <p style={{ ...p.type.micro, color: p.ink3, margin: `${p.space.xxs}px 0 0`, overflowWrap: "anywhere" }}>{t("blocks.entity.by")} {row.recommenders.map(h => "@" + h).join("、")}</p> : null}
    {open ? <div data-block-entity-detail="" style={{ marginTop: p.space.sm, paddingTop: p.space.sm, borderTop: `1px solid ${p.border}`, display: "grid", gap: p.space.sm }}>
      {row.evidence.map(e => <div key={e.commentId} style={{ minWidth: 0 }}>
        <div style={{ ...p.type.meta, color: p.ink3, display: "flex", alignItems: "center", gap: p.space.xs, flexWrap: "wrap" }}><b style={{ color: p.ink, fontWeight: 600 }}>@{e.author || "?"}</b>{e.likes !== null ? <span style={{ display: "inline-flex", alignItems: "center", gap: p.space.xxs, fontVariantNumeric: "tabular-nums" }}><Heart size={p.size.chipIcon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" />{e.likes}</span> : null}</div>
        {e.text ? <p style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xxs}px 0 0`, overflowWrap: "anywhere" }}>{e.text}</p> : null}
        <Evidence items={[e]} t={t} />
      </div>)}
    </div> : <Evidence items={row.evidence} t={t} />}
  </li>;
}

function EntityBlock({ block, title, t, onCopy, copyStatus }: { block: Extract<AnalysisBlockView, { type: "entity_list" }>; title: string; t: T; onCopy?: (text: string) => void; copyStatus?: string }) {
  const [sort, setSort] = useState<EntitySort>("mentions");
  const [exported, setExported] = useState<{ format: "Markdown" | "CSV"; text: string } | null>(null);
  const rows = sortEntityRows(block.items, sort);
  const labels: EntityExportLabels = { mentions: t("blocks.export.mentions"), likes: t("blocks.export.likes"), by: t("blocks.entity.by"), columns: t("blocks.export.columns").split(",") as EntityExportLabels["columns"] };
  const run = (format: "Markdown" | "CSV") => {
    const text = format === "Markdown" ? entityMarkdown(block.items, title, labels) : entityCsv(block.items, labels);
    setExported({ format, text });
    onCopy?.(text);
  };
  return <>
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: `0 ${p.space.sm}px`, marginTop: p.space.xs }}>
      <span style={{ ...meta, flex: 1, minWidth: 0 }}>{t("blocks.entity.summary", { n: block.total })}</span>
      <button type="button" data-block-export="markdown" onClick={() => run("Markdown")} style={textButton}>{t("blocks.action.export_markdown")}</button>
      <button type="button" data-block-export="csv" onClick={() => run("CSV")} style={textButton}>{t("blocks.action.export_csv")}</button>
    </div>
    {exported ? <div data-block-export-preview={exported.format.toLowerCase()} style={{ ...card, background: p.surfaceSubtle, border: 0 }}>
      {copyStatus ? <p role="status" style={{ ...p.type.meta, margin: `0 0 ${p.space.xs}px`, color: copyStatus === "已複製" ? p.success : p.warning }}>{copyStatus === "已複製" ? t("blocks.export.copied", { format: exported.format, n: block.items.length }) : t("blocks.export.failed")}</p> : null}
      <pre style={{ ...p.type.micro, margin: 0, maxHeight: p.size.menu, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: p.ink2, fontFamily: tokens.font.sans }}>{exported.text}</pre>
    </div> : null}
    <div role="group" aria-label={t("blocks.sort.label")} style={{ display: "flex", gap: p.space.xs, marginTop: p.space.sm, overflowX: "auto", scrollbarWidth: "none" }}>
      {ENTITY_SORTS.map(key => <button key={key} type="button" data-block-entity-sort={key} aria-pressed={sort === key} onClick={() => setSort(key)} style={{ ...p.type.meta, fontFamily: tokens.font.sans, flex: "none", height: p.size.chip, padding: `0 ${p.space.sm + p.space.xxs}px`, border: 0, borderRadius: p.radius.pill, cursor: "pointer", whiteSpace: "nowrap", background: sort === key ? p.ink : p.surfaceSubtle, color: sort === key ? p.surface : p.ink2 }}>{t(`blocks.sort.${key}`)}</button>)}
    </div>
    <ul style={{ margin: 0, padding: 0 }}>{rows.map(row => <EntityCard key={row.key} row={row} t={t} />)}</ul>
    {!rows.length ? <p style={{ ...p.type.bodySm, color: p.ink3 }}>{t("blocks.entity.github_empty")}</p> : null}
  </>;
}

const QA_TONE = { answered_by_op: { color: p.success, background: p.successSoft }, answered: { color: p.success, background: p.successSoft }, unanswered: { color: p.warning, background: p.warningSoft }, replies_not_captured: { color: p.ink3, background: p.surfaceSubtle }, unknown: { color: p.ink3, background: p.surfaceSubtle } } as const;

function BlockBody({ block, title, t, onCopy, copyStatus }: { block: AnalysisBlockView; title: string; t: T; onCopy?: (text: string) => void; copyStatus?: string }) {
  if (block.type === "entity_list") return <EntityBlock block={block} title={title} t={t} onCopy={onCopy} copyStatus={copyStatus} />;
  if (block.type === "opinion_overview") return <>{block.items.map((item, i) => <div key={i} data-block-opinion={i} style={{ marginTop: p.space.md, paddingLeft: p.space.md, borderLeft: `${p.reader.clusterBar}px solid ${c.clusterColors[i % c.clusterColors.length]}`, minWidth: 0 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: p.space.sm }}><b style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink, flex: 1, minWidth: 0 }}>{item.generic ? t("blocks.opinion.generic") : item.label}</b><span style={{ ...meta, whiteSpace: "nowrap" }}>{[item.count !== null ? t("blocks.opinion.count", { n: item.count }) : "", item.pct !== null ? `${item.pct}%` : ""].filter(Boolean).join(" · ")}</span></div>
    {item.substantive !== null || item.noise ? <p data-block-opinion-split="" style={{ ...meta, margin: `${p.space.xxs}px 0 0` }}>{[item.substantive !== null ? t("blocks.opinion.substantive", { n: item.substantive }) : "", item.noise ? t("blocks.opinion.noise", { n: item.noise }) : ""].filter(Boolean).join(" · ")}</p> : null}
    {item.noiseOnly ? <p data-block-opinion-noise-only="" style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xxs}px 0 0` }}>{t("blocks.opinion.noise_only")}</p> : null}
    {item.evidence[0]?.text ? <p style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xxs}px 0 0`, overflowWrap: "anywhere" }}>「{item.evidence[0].text}」</p> : null}
    <Evidence items={item.evidence} t={t} />
  </div>)}</>;
  if (block.type === "qa_pairs") return <>
    {block.statusCounts ? <p data-block-qa-summary="" style={{ ...meta, margin: `${p.space.xs}px 0 0` }}>{QA_STATUSES.filter(s => block.statusCounts![s] > 0).map(s => `${t(`blocks.qa.status.${s}`)} ${block.statusCounts![s]}`).join(" · ")}</p> : null}
    {block.items.map((item, i) => <div key={i} data-block-qa={item.status} style={card}>
      <Person person={item.question} t={t} role="question" />
      <span data-block-qa-status={item.status} style={{ ...p.type.micro, display: "inline-block", marginTop: p.space.xs, padding: `0 ${p.space.xs}px`, borderRadius: p.radius.xs, ...QA_TONE[item.status] }}>{t(`blocks.qa.status.${item.status}`)}</span>
      {item.answers.map((answer, j) => <Person key={j} person={answer} t={t} role="answer" />)}
      {item.answerCount > item.answers.length ? <p data-block-qa-more="" style={{ ...meta, margin: `${p.space.xs}px 0 0` }}>{t("blocks.qa.answers_more", { n: item.answerCount - item.answers.length })}</p> : null}
    </div>)}</>;
  if (block.type === "top_comments") return <>{block.items.map((item, i) => <ReaderReply key={i} row={{ text: item.text ?? t("blocks.top.no_text"), author: item.author, likes: item.likes, isAuthor: item.isOp, replies: item.replies, time: null }} footer={<>
    {item.links.length ? <ul data-block-comment-links="" aria-label={t("blocks.top.links")} style={{ flexBasis: "100%", listStyle: "none", margin: 0, padding: 0, ...p.type.bodySm }}>{item.links.map((link, j) => <li key={j} style={{ overflowWrap: "anywhere", wordBreak: "break-all" }}>{link.href ? <a data-block-comment-link={link.kind || "external"} href={link.href} target="_blank" rel="noopener noreferrer" style={{ color: p.accent, textDecoration: "none" }}>{link.url}</a> : <span data-block-comment-link={link.kind || "external"} style={{ color: p.ink2 }}>{link.url}</span>}</li>)}</ul> : null}
    <Evidence items={item.evidence} t={t} />
  </>} />)}</>;
  // noise_summary: numbers only.
  return <div data-block-noise="" style={{ marginTop: p.space.xs }}>
    {block.noise !== null && block.audience ? <p style={{ ...p.type.bodySm, color: p.ink3, margin: 0 }}>{t("blocks.noise.summary", { noise: block.noise, audience: block.audience, pct: pct(block.share ?? block.noise / block.audience) })}</p> : null}
    <ul style={{ listStyle: "none", margin: `${p.space.xs}px 0 0`, padding: 0, display: "flex", flexWrap: "wrap", gap: p.space.xs }}>{block.flags.map(f => <li key={f.flag} data-block-noise-flag={f.flag} style={{ ...p.type.micro, padding: `${p.space.xxs}px ${p.space.sm}px`, borderRadius: p.radius.pill, background: p.surfaceSubtle, color: p.ink2, fontVariantNumeric: "tabular-nums" }}>{t(`blocks.noise.flag.${f.flag}`) || t("blocks.noise.flag.other")} {f.share !== null ? t("blocks.noise.flag_count", { n: f.count, pct: pct(f.share) }) : t("blocks.noise.flag_count_plain", { n: f.count })}</li>)}</ul>
  </div>;
}

/** Backend blocks in their given order, one renderer per type. */
export function AnalysisBlocksView({ model, onCopy, copyStatus, supplement }: { model: AnalysisBlocksModel; onCopy?: (text: string) => void; copyStatus?: string; supplement?: ReactNode }) {
  const t = useBlockText();
  return <div data-analysis-blocks="">
    {model.blocks.map(block => {
      const title = t(block.titleKey) || t(`blocks.${block.type}.title`);
      return <section key={block.id} data-analysis-block={block.type} data-block-priority={block.primary ? "primary" : "secondary"} aria-label={title} style={{ marginTop: p.space.xl, minWidth: 0 }}>
        <header style={{ display: "flex", alignItems: "baseline", gap: p.space.sm }}><h3 style={h3}>{title}</h3>{block.type !== "noise_summary" && block.type !== "entity_list" ? <span style={meta}>{block.total}</span> : null}</header>
        <BlockBody block={block} title={title} t={t} onCopy={onCopy} copyStatus={copyStatus} />
        {block.truncated ? <p data-block-truncated="" style={{ ...meta, margin: `${p.space.sm}px 0 0`, textAlign: "center" }}>{t("blocks.truncated", { n: block.total - block.shown, total: block.total })}</p> : null}
      </section>;
    })}
    {supplement}
  </div>;
}

/** The extension's own AI methods/splits, only as a folded, clearly optional extra after the backend blocks. */
export function AiSupplement({ methods, split }: { methods?: InlineCardAnswer; split?: InlineCardAnswer }) {
  const t = useBlockText();
  const m = methods?.kind === "methods" && methods.rows.length ? methods : null;
  const s = split?.kind === "split" && split.sides.length ? split : null;
  if (!m && !s) return null;
  return <details data-block-ai-supplement="" style={{ marginTop: p.space.xl, borderTop: `1px dashed ${p.borderStrong}`, paddingTop: p.space.sm }}>
    <summary style={{ ...p.type.meta, fontWeight: 600, color: p.ink3, cursor: "pointer", minHeight: p.size.buttonSm, display: "list-item", alignContent: "center" }}>{t("blocks.supplement.title")}</summary>
    <p style={{ ...p.type.micro, color: p.ink3, margin: `${p.space.xxs}px 0 0` }}>{t("blocks.supplement.note")}</p>
    {m ? <div style={{ marginTop: p.space.sm }}><b style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink2 }}>{t("blocks.supplement.methods")}</b>
      {m.rows.map((row, i) => <p key={i} style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xs}px 0 0` }}>{row.name}{row.fit ? <span style={{ color: p.ink3 }}> · {row.fit}</span> : null}</p>)}{quote(m.quote)}</div> : null}
    {s ? <div style={{ marginTop: p.space.md }}><b style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink2 }}>{t("blocks.supplement.split")}</b>
      <p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xs}px 0 0` }}>{s.agree}</p>
      {s.sides.map((side, i) => <div key={i} style={{ marginTop: p.space.sm, paddingLeft: p.space.md, borderLeft: `${p.reader.clusterBar}px solid ${c.sideColors[i % c.sideColors.length]}` }}><b style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink }}>{side.claim}</b><p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xxs}px 0 0` }}>{side.why}</p>{quote(side.quote)}</div>)}</div> : null}
  </details>;
}
