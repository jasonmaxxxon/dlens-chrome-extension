import { useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Heart, MessageCircle, MoreHorizontal } from "lucide-react";
import type { AnalysisBlocksModel, AnalysisBlockView, BlockEvidenceLink, BlockGist, EntityRow, EntitySort, OpinionRow, PostTypeKey, QaGroup, QaPerson } from "../viewmodel/analysis-blocks";
import { ENTITY_SORTS, QA_GROUPS, blockGist, entityCsv, entityMarkdown, qaGroup, sortEntityRows, type EntityExportLabels } from "../viewmodel/analysis-blocks";
import type { InlineCardAnswer, InlineCardQuote } from "../viewmodel/inline-card";
import { useBlockText } from "./i18n";
import { ReaderReply } from "./ReaderReply";
import { tokens } from "./tokens";

const p = tokens.panel, b = p.blocks, c = tokens.collectCard;
type T = ReturnType<typeof useBlockText>;
const hairline = `${b.hairline}px solid ${p.border}`;
const meta: CSSProperties = { ...p.type.meta, color: p.ink3, fontVariantNumeric: "tabular-nums" };
const clamp: CSSProperties = { display: "-webkit-box", WebkitLineClamp: b.clampLines, WebkitBoxOrient: "vertical", overflow: "hidden" };
const textButton: CSSProperties = { ...p.type.bodySm, fontWeight: 600, fontFamily: tokens.font.sans, minHeight: p.size.buttonSm, border: 0, borderRadius: p.radius.sm, padding: 0, color: p.ink2, background: "transparent", cursor: "pointer", textAlign: "left" };
const iconButton: CSSProperties = { border: 0, background: "transparent", color: p.ink3, cursor: "pointer", display: "inline-grid", placeItems: "center", width: p.size.buttonSm, height: p.size.buttonSm, borderRadius: p.radius.sm, flex: "none" };
const quote = (value: InlineCardQuote) => <ReaderReply row={{ ...value, isAuthor: !!value.isAuthor, replies: null, time: null }} />;
const pct = (share: number) => Math.round(share * 100);
const GROUP_TONE: Record<QaGroup, string> = { answered: p.success, unanswered: p.warning, unseen: p.ink4 };

/** One honest sentence per gist kind; copy lives in i18n. */
function gistText(g: BlockGist | null, t: T): string {
  if (!g) return "";
  if (g.kind === "entity") return t("blocks.gist.entity", { name: g.name, n: g.mentions, total: g.total });
  if (g.kind === "opinion") { const label = g.generic ? t("blocks.opinion.generic") : g.label; return g.pct !== null ? t("blocks.gist.opinion", { label, pct: g.pct }) : t("blocks.gist.opinion_plain", { label }); }
  if (g.kind === "qa") return g.unanswered ? t("blocks.gist.qa_open", { total: g.total, n: g.unanswered }) : t("blocks.gist.qa", { total: g.total });
  if (g.kind === "top") return t(g.author ? "blocks.gist.top" : "blocks.gist.top_anon", { author: g.author, text: g.text });
  return t("blocks.gist.noise", { noise: g.noise, audience: g.audience });
}

/** Keep each full-width parenthetical and its immediate comma on the same line. */
function keepParentheticals(text: string): ReactNode[] {
  return text.split(/(（[^（）]*），?)/g).map((part, i) => /^（[^（）]*），?$/.test(part)
    ? <span key={i} style={{ whiteSpace: "nowrap" }}>{part}</span> : part);
}

/** Each row links back to its comment; when no link can be rebuilt it shows the plain comment id instead of a dead button. */
function Source({ link, t, label = "blocks.action.evidence" }: { link: BlockEvidenceLink | null; t: T; label?: string }) {
  if (!link) return null;
  if (!link.href) return <span data-block-evidence-id={link.commentId} style={{ ...p.type.micro, color: p.ink3, overflowWrap: "anywhere" }}>{t("blocks.action.evidence_missing", { id: link.commentId })}</span>;
  return <a data-reading-ref-site={link.commentId} href={link.href} target="_blank" rel="noopener noreferrer" style={{ ...p.type.meta, color: p.accent, textDecoration: "none", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{t(label)}</a>;
}
const Likes = ({ n }: { n: number | null }) => n === null ? null : <span style={{ display: "inline-flex", alignItems: "center", gap: p.space.xxs, fontVariantNumeric: "tabular-nums" }}><Heart size={p.size.chipIcon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" />{n}</span>;
const MetaLine = ({ children }: { children: ReactNode }) => <div style={{ ...meta, display: "flex", alignItems: "center", flexWrap: "wrap", gap: `0 ${p.space.sm}px`, marginTop: p.space.xxs, overflowWrap: "anywhere" }}>{children}</div>;

/** The one row grammar: primary line, grey secondary (2-line clamp), quiet meta line; tapping the row opens `detail` in place. */
function Row({ first, name, aside, secondary, meta: metaLine, detail, label, attrs }: { first: boolean; name: ReactNode; aside?: ReactNode; secondary?: string; meta?: ReactNode; detail?: ReactNode; label: string; attrs?: Record<string, string | undefined> }) {
  const [open, setOpen] = useState(false);
  const t = useBlockText();
  // A tap anywhere on the row toggles it, except on its own links and buttons.
  const tap = (e: MouseEvent) => { if (detail && !(e.target as HTMLElement).closest("a, button, summary")) setOpen(v => !v); };
  return <li {...attrs} onClick={tap} style={{ listStyle: "none", padding: `${p.space.md}px 0`, borderTop: first ? 0 : hairline, minWidth: 0, cursor: detail ? "pointer" : undefined }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: p.space.sm, minWidth: 0 }}>
      <div style={{ ...b.rowName, color: p.ink, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{name}</div>
      {aside ? <span style={{ ...meta, whiteSpace: "nowrap" }}>{aside}</span> : null}
      {detail ? <button type="button" data-block-row-toggle="" aria-expanded={open} aria-label={`${t(open ? "blocks.action.collapse" : "blocks.action.expand")} ${label}`} onClick={() => setOpen(v => !v)} style={{ ...iconButton, alignSelf: "center", marginRight: -p.space.xs }}>
        {open ? <ChevronUp size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" /> : <ChevronDown size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" />}
      </button> : null}
    </div>
    {secondary ? <p style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xxs}px 0 0`, overflowWrap: "anywhere", ...(open ? {} : clamp) }}>{secondary}</p> : null}
    {metaLine}
    {open && detail ? <div data-block-detail="" data-block-arrival="" style={{ marginTop: p.space.sm, paddingLeft: p.space.md, borderLeft: `${b.quoteBar}px solid ${p.border}`, display: "grid", gap: p.space.sm, cursor: "auto", minWidth: 0 }}>{detail}</div> : null}
  </li>;
}

function Truncated({ block, t }: { block: AnalysisBlockView; t: T }) {
  return block.truncated ? <p data-block-truncated="" style={{ ...meta, margin: `${p.space.sm}px 0 0` }}>{t("blocks.truncated", { n: block.total - block.shown, total: block.total })}</p> : null;
}

/** First few rows own the local hidden count; backend omissions appear only after all received rows are visible. */
function Rows<R>({ rows, render, block, first = b.firstItems }: { rows: R[]; render: (row: R, index: number, revealed: boolean) => ReactNode; block: Exclude<AnalysisBlockView, { type: "noise_summary" }>; first?: number }) {
  const [all, setAll] = useState(false);
  const t = useBlockText();
  const shown = all ? rows : rows.slice(0, first);
  return <>
    <ul style={{ margin: 0, padding: 0 }}>{shown.map((row, i) => render(row, i, all && i >= first))}</ul>
    {rows.length > first ? <button type="button" data-block-more="" aria-expanded={all} onClick={() => setAll(v => !v)} style={{ ...textButton, display: "block", width: "100%", borderTop: hairline, borderRadius: 0, paddingTop: p.space.xs }}>{all ? t("blocks.fold.less") : t("blocks.fold.more", { n: rows.length - first })}</button> : null}
    {(all || rows.length <= first) && rows.length === block.items.length ? <Truncated block={block} t={t} /> : null}
  </>;
}
const arrive = (revealed: boolean) => revealed ? { "data-block-arrival": "" } : {};

export function PostTypeTag({ type }: { type: PostTypeKey }) {
  const t = useBlockText();
  return <span data-post-type={type} aria-label={`${t("blocks.post_type.label")}：${t(`blocks.post_type.${type}`)}`} style={{ ...p.type.micro, display: "inline-flex", alignItems: "center", padding: `${p.space.xxs}px ${p.space.sm}px`, borderRadius: p.radius.pill, background: p.accentSoft, color: p.accentInk, whiteSpace: "nowrap" }}>{t(`blocks.post_type.${type}`)}</span>;
}

const omittedLine = (t: T, o: { type: string; reason: string }) => t(o.reason === "empty" ? "blocks.omitted.item" : `blocks.omitted.${o.reason}`, { title: t(`blocks.${o.type}.title`) || t("blocks.post_type.unknown") });

/** Non-blocking notices: a failed block build, or blocks present but none to show. */
export function BlocksNotice({ model }: { model: AnalysisBlocksModel }) {
  const t = useBlockText();
  if (model.mode === "empty") return <div data-blocks-empty="" role="status" style={{ marginTop: p.space.lg, paddingTop: p.space.md, borderTop: hairline }}>
    <b style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink }}>{t("blocks.empty.title")}</b>
    {model.omitted.length ? <ul style={{ margin: `${p.space.xs}px 0 0`, paddingLeft: p.space.lg, ...p.type.bodySm, color: p.ink3 }}>{model.omitted.map((o, i) => <li key={i} data-block-omitted={o.type} data-block-omitted-reason={o.reason}>{omittedLine(t, o)}</li>)}</ul>
      : <p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xs}px 0 0` }}>{t("blocks.empty.none")}</p>}
  </div>;
  if (!model.error) return null;
  return <p data-blocks-error="" role="status" style={{ ...p.type.bodySm, margin: `${p.space.md}px 0 0`, padding: `${p.space.xs}px ${p.space.sm}px`, borderRadius: p.radius.xs, background: p.warningSoft, color: p.warning }}>{t("blocks.error.fallback")}</p>;
}

/** A qa question or answer. The post itself is labelled as the original post, never as a comment. */
function Person({ person, t, role }: { person: QaPerson; t: T; role: "question" | "answer" }) {
  const link: BlockEvidenceLink = { commentId: person.commentId ?? "post", author: person.author, likes: person.likes, isOp: person.isOp, href: person.href, text: person.text };
  return <div data-block-qa-person={role} {...(person.isPost ? { "data-block-qa-post": "" } : {})} style={{ minWidth: 0 }}>
    <div style={{ ...meta, display: "flex", alignItems: "center", gap: p.space.xs, flexWrap: "wrap" }}>
      {person.isPost ? <b style={{ color: p.accentInk, fontWeight: 600 }}>{t("blocks.qa.post_question")}</b> : null}
      {person.author ? <b style={{ color: p.ink, fontWeight: 600 }}>@{person.author}</b> : null}
      {person.isOp ? <span style={{ ...p.type.micro, padding: `0 ${p.space.xs}px`, borderRadius: p.radius.xs, background: p.accentSoft, color: p.accentInk }}>{t("blocks.qa.op")}</span> : null}
      <Likes n={person.likes} />
    </div>
    <p style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xxs}px 0 0`, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{person.text}</p>
    <Source link={link} t={t} label={person.isPost ? "blocks.action.evidence_post" : "blocks.action.evidence"} />
  </div>;
}

/** Quoted comments (tools' extra mentions, opinion evidence): author, text, link. */
function Quoted({ e, t }: { e: BlockEvidenceLink; t: T }) {
  return <div style={{ minWidth: 0 }}>
    <div style={{ ...meta, display: "flex", alignItems: "center", gap: p.space.xs, flexWrap: "wrap" }}><b style={{ color: p.ink, fontWeight: 600 }}>@{e.author || "?"}</b><Likes n={e.likes} /></div>
    {e.text ? <p style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xxs}px 0 0`, overflowWrap: "anywhere" }}>{e.text}</p> : null}
    <Source link={e} t={t} />
  </div>;
}

function EntityItem({ row, first, revealed, t }: { row: EntityRow; first: boolean; revealed: boolean; t: T }) {
  // A link only in the post has no comment mentions: say so instead of "0 mentions".
  const postOnly = row.mentions === 0 && row.inPost;
  const facts = row.repo ? [row.repo.stars ? t("blocks.entity.stars", { n: row.repo.stars }) : "", row.repo.language, row.repo.archived ? t("blocks.entity.archived") : "", row.repo.pushed ? t("blocks.entity.pushed", { date: row.repo.pushed }) : ""].filter(Boolean) : row.site ? [row.site] : [];
  const name = row.href ? <a data-block-entity-name="" href={row.href} target="_blank" rel="noopener noreferrer" style={{ color: p.accent, textDecoration: "none" }}>{row.name}</a> : row.name;
  const flags = [row.inPost && !postOnly ? t("blocks.entity.in_post") : "", row.byOp ? t("blocks.entity.by_op") : ""].filter(Boolean);
  return <Row first={first} label={row.name} attrs={{ "data-block-entity": row.key, ...arrive(revealed) }} name={name} aside={postOnly ? t("blocks.entity.in_post") : t("blocks.entity.mentions", { n: row.mentions })} secondary={row.summary}
    meta={<>
      {facts.length ? <div data-block-entity-facts="" style={{ ...meta, marginTop: p.space.xxs }}>{facts.join(" · ")}</div> : null}
      <MetaLine>
        {row.recommenders.length ? <span>{row.recommenders.slice(0, 2).map(h => "@" + h).join("、")}{row.recommenders.length > 2 ? ` +${row.recommenders.length - 2}` : ""}</span> : null}
        {row.likes ? <Likes n={row.likes} /> : null}
        <Source link={row.link} t={t} />
      </MetaLine>
    </>}
    detail={<>
      {row.href ? <a data-block-entity-url="" href={row.href} target="_blank" rel="noopener noreferrer" style={{ ...p.type.bodySm, color: p.accent, textDecoration: "none", overflowWrap: "anywhere", wordBreak: "break-all" }}>{row.url}</a>
        : <span data-block-entity-url="" style={{ ...p.type.bodySm, color: p.ink2, overflowWrap: "anywhere", wordBreak: "break-all" }}>{row.url}</span>}
      {flags.length ? <span style={meta}>{flags.join(" · ")}</span> : null}
      {row.quote ? <div><div style={{ ...p.type.micro, color: p.ink3 }}>{t("blocks.entity.quote")}</div><p style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xxs}px 0 0`, overflowWrap: "anywhere" }}>{row.quote}</p></div> : null}
      {row.extra.map(e => <Quoted key={e.commentId} e={e} t={t} />)}
    </>} />;
}

/** Sort and export live in one small menu at the block heading, not a row of buttons. */
function EntityMenu({ sort, onSort, onExport, t }: { sort: EntitySort; onSort: (s: EntitySort) => void; onExport: (f: "Markdown" | "CSV") => void; t: T }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const item: CSSProperties = { ...p.type.bodySm, fontFamily: tokens.font.sans, display: "flex", alignItems: "center", textAlign: "left", border: 0, borderRadius: p.radius.sm, background: "transparent", minHeight: p.size.buttonSm, padding: `0 ${p.space.sm}px`, color: p.ink, cursor: "pointer", width: "100%" };
  const close = () => { if (ref.current) ref.current.open = false; };
  return <details ref={ref} data-block-menu="" style={{ position: "relative", flex: "none" }}>
    <summary aria-label={t("blocks.menu.label")} style={{ ...iconButton, listStyle: "none" }}><MoreHorizontal size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" /></summary>
    <div role="group" style={{ position: "absolute", right: 0, top: "100%", zIndex: 2, width: b.menuWidth, padding: p.space.xs, background: p.surface, borderRadius: p.radius.md, boxShadow: p.shadow.popover, display: "grid" }} data-block-arrival="">
      <div role="group" aria-label={t("blocks.sort.label")}>{ENTITY_SORTS.map(key => <button key={key} type="button" data-block-entity-sort={key} aria-pressed={sort === key} onClick={() => { onSort(key); close(); }} style={{ ...item, fontWeight: sort === key ? 600 : 400, background: sort === key ? p.surfaceSubtle : "transparent" }}>{t(`blocks.sort.${key}`)}</button>)}</div>
      <div style={{ borderTop: hairline, margin: `${p.space.xs}px 0` }} />
      <button type="button" data-block-export="markdown" onClick={() => { onExport("Markdown"); close(); }} style={item}>{t("blocks.action.export_markdown")}</button>
      <button type="button" data-block-export="csv" onClick={() => { onExport("CSV"); close(); }} style={item}>{t("blocks.action.export_csv")}</button>
    </div>
  </details>;
}

type ExportState = { format: "Markdown" | "CSV"; text: string; n: number };

function EntityBlock({ block, title, heading, t, onCopy, copyStatus }: { block: Extract<AnalysisBlockView, { type: "entity_list" }>; title: string; heading: boolean; t: T; onCopy?: (text: string) => void; copyStatus?: string }) {
  const [sort, setSort] = useState<EntitySort>("mentions");
  const [exported, setExported] = useState<ExportState | null>(null);
  const rows = sortEntityRows(block.items, sort);
  const labels: EntityExportLabels = { mentions: t("blocks.export.mentions"), likes: t("blocks.export.likes"), by: t("blocks.entity.by"), columns: t("blocks.export.columns").split(",") as EntityExportLabels["columns"] };
  const run = (format: ExportState["format"]) => {
    const text = format === "Markdown" ? entityMarkdown(block.items, title, labels) : entityCsv(block.items, labels);
    setExported({ format, text, n: block.items.length });
    onCopy?.(text);
  };
  return <>
    <header style={{ display: "flex", alignItems: "center", gap: p.space.sm }}>
      {heading ? <h3 style={{ ...p.type.heading, color: p.ink, margin: 0, flex: 1, minWidth: 0 }}>{title}</h3> : <span style={{ ...meta, flex: 1, minWidth: 0 }}>{t("blocks.entity.count", { n: block.total })}</span>}
      <EntityMenu sort={sort} onSort={setSort} onExport={run} t={t} />
    </header>
    {heading ? <p style={{ ...meta, margin: 0 }}>{t("blocks.entity.count", { n: block.total })}</p> : null}
    {exported ? <div data-block-export-preview={exported.format.toLowerCase()} style={{ marginTop: p.space.sm, paddingLeft: p.space.md, borderLeft: `${b.quoteBar}px solid ${p.border}` }}>
      <p role="status" data-block-export-status="" style={{ ...meta, margin: `0 0 ${p.space.xs}px` }}>{t("blocks.export.sent", { format: exported.format, n: exported.n })}{copyStatus ? ` · ${copyStatus}` : ""}</p>
      <pre style={{ ...p.type.micro, margin: 0, maxHeight: p.size.menu, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: p.ink2, fontFamily: tokens.font.sans }}>{exported.text}</pre>
    </div> : null}
    <Rows rows={rows} block={block} render={(row, i, revealed) => <EntityItem key={row.key} row={row} first={i === 0} revealed={revealed} t={t} />} />
    {!rows.length ? <p style={{ ...p.type.bodySm, color: p.ink3 }}>{t("blocks.entity.github_empty")}</p> : null}
  </>;
}

function OpinionBlock({ block, t }: { block: Extract<AnalysisBlockView, { type: "opinion_overview" }>; t: T }) {
  const colour = (i: number) => c.clusterColors[i % c.clusterColors.length];
  // Low-signal groups sit behind 「再睇」 after the rest, dimmed.
  const order = [...block.items.filter(r => !r.lowSignal), ...block.items.filter(r => r.lowSignal)];
  const dots = new Map(block.items.map((r, i) => [r, colour(i)]));
  const bar = block.items.filter(r => !r.lowSignal && r.pct !== null);
  const render = (row: OpinionRow, i: number, revealed: boolean) => {
    const label = row.generic ? t("blocks.opinion.generic") : row.label;
    const split = [row.substantive !== null ? t("blocks.opinion.substantive", { n: row.substantive }) : "", row.noise ? t("blocks.opinion.noise", { n: row.noise }) : ""].filter(Boolean).join(" · ");
    const rest = row.evidence.filter(e => e.commentId !== row.rep?.commentId);
    const kw = row.keywords.join("、");
    return <Row key={i} first={i === 0} label={label} attrs={{ "data-block-opinion": String(i), ...(row.lowSignal ? { "data-block-low-signal": "" } : {}), ...arrive(revealed) }}
      name={<span style={{ display: "flex", alignItems: "baseline", gap: p.space.sm }}><i aria-hidden="true" style={{ width: p.size.modeDot, height: p.size.modeDot, flex: "none", borderRadius: p.radius.pill, background: row.lowSignal ? p.ink4 : dots.get(row) }} /><span style={{ ...(row.lowSignal ? { color: p.ink3, fontWeight: 500 } : {}) }}>{label}</span>{row.lowSignal ? <span style={{ ...p.type.micro, color: p.ink3, fontWeight: 500 }}>{t("blocks.opinion.low")}</span> : null}</span>}
      aside={[row.pct !== null ? `${row.pct}%` : "", row.count !== null ? t("blocks.opinion.count", { n: row.count }) : ""].filter(Boolean).join(" · ")}
      secondary={row.repText ? `「${row.repText}」` : kw}
      meta={row.rep ? <MetaLine>{row.rep.author ? <span>@{row.rep.author}</span> : null}<Likes n={row.rep.likes} /><Source link={row.rep} t={t} /></MetaLine> : undefined}
      detail={(row.repText && kw) || split || rest.length ? <>
        {row.repText && kw ? <span data-block-opinion-keywords="" style={meta}>{kw}</span> : null}
        {split ? <span data-block-opinion-split="" style={meta}>{split}</span> : null}
        {rest.map(e => <Quoted key={e.commentId} e={e} t={t} />)}
      </> : undefined} />;
  };
  return <>
    {bar.length > 1 ? <div aria-hidden="true" data-block-share="" style={{ display: "flex", gap: p.space.xxs, height: p.reader.shareHeight, marginTop: p.space.sm }}>{bar.map((r, i) => <i key={i} style={{ flex: Math.max(r.pct ?? 1, 1), borderRadius: p.radius.xs, background: dots.get(r) }} />)}</div> : null}
    <Rows rows={order} block={block} render={render} />
    {block.noiseOnlyGroups ? <p data-block-opinion-noise-groups="" style={{ ...meta, margin: `${p.space.sm}px 0 0` }}>{t("blocks.opinion.noise_groups", { n: block.noiseOnlyGroups })}</p> : null}
  </>;
}

function QaBlock({ block, t }: { block: Extract<AnalysisBlockView, { type: "qa_pairs" }>; t: T }) {
  const counts = block.statusCounts ? QA_GROUPS.map(g => [g, (Object.entries(block.statusCounts!) as [string, number][]).filter(([s]) => qaGroup(s as never) === g).reduce((n, [, v]) => n + v, 0)] as const).filter(([, n]) => n > 0) : [];
  return <>
    {counts.length ? <p data-block-qa-summary="" style={{ ...meta, margin: `${p.space.xxs}px 0 0` }}>{counts.map(([g, n]) => `${t(`blocks.qa.group.${g}`)} ${n}`).join(" · ")}</p> : null}
    {block.replyStructureKnown === false ? <p data-block-qa-structure="" style={{ ...meta, margin: `${p.space.xxs}px 0 0` }}>{t("blocks.qa.structure_unknown")}</p> : null}
    <Rows rows={block.items} block={block} render={(item, i, revealed) => {
      const group = qaGroup(item.status), q = item.question;
      const link: BlockEvidenceLink = { commentId: q.commentId ?? "post", author: q.author, likes: q.likes, isOp: q.isOp, href: q.href, text: q.text };
      const first = item.answers[0];
      return <Row key={i} first={i === 0} label={q.text} attrs={{ "data-block-qa": item.status, ...arrive(revealed) }}
        name={<span style={{ ...p.type.cardTitle, overflowWrap: "anywhere" }}>{q.isPost ? <span data-block-qa-post="" style={{ ...p.type.micro, color: p.accentInk, background: p.accentSoft, borderRadius: p.radius.pill, padding: `0 ${p.space.sm}px`, marginRight: p.space.xs, verticalAlign: "middle" }}>{t("blocks.qa.post_question")}</span> : null}{q.text}</span>}
        aside={<span data-block-qa-status={item.status} style={{ display: "inline-flex", alignItems: "center", gap: p.space.xs }}><i aria-hidden="true" style={{ width: p.size.modeDot, height: p.size.modeDot, borderRadius: p.radius.pill, background: GROUP_TONE[group] }} />{t(`blocks.qa.group.${group}`)}</span>}
        secondary={first ? `${first.author ? `@${first.author}：` : ""}${first.text}` : undefined}
        meta={<MetaLine>{q.author ? <span>@{q.author}</span> : null}<Likes n={q.likes} />{item.answerCount > item.answers.length ? <span data-block-qa-more="">{t("blocks.qa.answers_more", { n: item.answerCount - item.answers.length })}</span> : null}<Source link={link} t={t} label={q.isPost ? "blocks.action.evidence_post" : "blocks.action.evidence"} /></MetaLine>}
        detail={item.answers.length ? item.answers.map((a, j) => <Person key={j} person={a} t={t} role="answer" />) : undefined} />;
    }} />
  </>;
}

function TopComment({ item, first, revealed, t }: { item: Extract<AnalysisBlockView, { type: "top_comments" }>["items"][number]; first: boolean; revealed: boolean; t: T }) {
  const [open, setOpen] = useState(false);
  return <li data-block-top={item.id} {...arrive(revealed)} onClick={e => { if (!(e.target as HTMLElement).closest("a, button")) setOpen(v => !v); }} style={{ listStyle: "none", padding: `${p.space.md}px 0`, borderTop: first ? 0 : hairline, minWidth: 0, cursor: "pointer" }}>
    <p style={{ ...p.type.bodySm, color: p.ink, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", ...(open ? {} : clamp) }}>{item.text ?? t("blocks.top.no_text")}</p>
    <MetaLine>
      {item.author ? <b style={{ color: p.ink2, fontWeight: 600 }}>@{item.author}</b> : null}
      {item.isOp ? <span style={{ ...p.type.micro, padding: `0 ${p.space.xs}px`, borderRadius: p.radius.xs, background: p.accentSoft, color: p.accentInk }}>{t("blocks.qa.op")}</span> : null}
      <Likes n={item.likes} />
      {item.replies !== null ? <span style={{ display: "inline-flex", alignItems: "center", gap: p.space.xxs }}><MessageCircle size={p.size.chipIcon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" />{item.replies}</span> : null}
      <Source link={item.evidence[0] ?? null} t={t} />
    </MetaLine>
    {item.links.length ? <ul data-block-comment-links="" aria-label={t("blocks.top.links")} style={{ listStyle: "none", margin: `${p.space.xs}px 0 0`, padding: 0, ...p.type.bodySm }}>{item.links.map((link, j) => <li key={j} style={{ overflowWrap: "anywhere", wordBreak: "break-all" }}>{link.href ? <a data-block-comment-link={link.kind || "external"} href={link.href} target="_blank" rel="noopener noreferrer" style={{ color: p.accent, textDecoration: "none" }}>{link.url}</a> : <span data-block-comment-link={link.kind || "external"} style={{ color: p.ink2 }}>{link.url}</span>}</li>)}</ul> : null}
  </li>;
}

function NoiseBlock({ block, t }: { block: Extract<AnalysisBlockView, { type: "noise_summary" }>; t: T }) {
  return <div data-block-noise="" style={{ marginTop: p.space.xs }}>
    {block.noise !== null && block.audience ? <p style={{ ...p.type.bodySm, color: p.ink3, margin: 0 }}>{t("blocks.noise.summary", { noise: block.noise, audience: block.audience, pct: pct(block.share ?? block.noise / block.audience) })}</p> : null}
    <ul style={{ ...meta, listStyle: "none", margin: `${p.space.xs}px 0 0`, padding: 0, display: "flex", flexWrap: "wrap", gap: `${p.space.xxs}px ${p.space.md}px` }}>{block.flags.map(f => <li key={f.flag} data-block-noise-flag={f.flag}>{t(`blocks.noise.flag.${f.flag}`) || t("blocks.noise.flag.other")} {f.share !== null ? t("blocks.noise.flag_count", { n: f.count, pct: pct(f.share) }) : t("blocks.noise.flag_count_plain", { n: f.count })}</li>)}</ul>
  </div>;
}

function BlockBody({ block, title, heading, t, onCopy, copyStatus }: { block: AnalysisBlockView; title: string; heading: boolean; t: T; onCopy?: (text: string) => void; copyStatus?: string }) {
  if (block.type === "entity_list") return <EntityBlock block={block} title={title} heading={heading} t={t} onCopy={onCopy} copyStatus={copyStatus} />;
  if (block.type === "opinion_overview") return <OpinionBlock block={block} t={t} />;
  if (block.type === "qa_pairs") return <QaBlock block={block} t={t} />;
  if (block.type === "top_comments") return <Rows rows={block.items} block={block} render={(item, i, revealed) => <TopComment key={item.id || i} item={item} first={i === 0} revealed={revealed} t={t} />} />;
  return <NoiseBlock block={block} t={t} />;
}

const blockCount = (block: AnalysisBlockView) => block.type === "noise_summary" ? block.noise : block.total;

/** A secondary block is one line (heading, gist, count) until opened in place. */
function Folded({ block, title, t, children }: { block: AnalysisBlockView; title: string; t: T; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const line = block.type === "noise_summary" && block.flags.length ? block.flags.map(f => `${t(`blocks.noise.flag.${f.flag}`) || t("blocks.noise.flag.other")} ${f.count}`).join(" · ") : gistText(blockGist(block), t);
  return <>
    <button type="button" data-block-fold="" aria-expanded={open} onClick={() => setOpen(v => !v)} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: `${p.space.xxs}px ${p.space.sm}px`, width: "100%", padding: `${p.space.md}px 0`, border: 0, background: "transparent", textAlign: "left", cursor: "pointer", fontFamily: tokens.font.sans, color: p.ink }}>
      <span style={{ ...p.type.heading }}>{title}</span>
      <span style={{ ...meta, display: "inline-flex", alignItems: "center", gap: p.space.xs }}>{blockCount(block) ?? ""}{open ? <ChevronUp size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" /> : <ChevronDown size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" />}</span>
      {!open && line ? <span data-block-fold-line="" style={{ ...p.type.bodySm, color: p.ink2, gridColumn: "1 / 3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 400 }}>{line}</span> : null}
    </button>
    {open ? <div data-block-arrival="" style={{ paddingBottom: p.space.md }}>{children}</div> : null}
  </>;
}

/** Backend blocks in their given order: lead sentence, primary blocks open, secondary folded, noise last. One sheet, hairlines, no per-item boxes. */
export function AnalysisBlocksView({ model, onCopy, copyStatus, supplement }: { model: AnalysisBlocksModel; onCopy?: (text: string) => void; copyStatus?: string; supplement?: ReactNode }) {
  const t = useBlockText();
  const lead = model.lead ? model.lead.ai || gistText(model.lead.main, t) : "";
  const sub = model.lead ? gistText(model.lead.sub, t) : "";
  const source = [model.source?.audience != null ? t("blocks.source.audience", { n: model.source.audience }) : "", model.source?.noiseShare ? t("blocks.source.noise", { pct: pct(model.source.noiseShare) }) : ""].filter(Boolean).join(" · ");
  const notes = model.omitted.filter(o => o.reason !== "empty");
  return <div data-analysis-blocks="" style={{ marginTop: p.space.md, padding: `${p.space.lg}px ${p.space.lg}px ${p.space.xs}px`, background: p.surface, border: hairline, borderRadius: p.radius.md, minWidth: 0 }}>
    {model.postType || source ? <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: p.space.sm }}>{model.postType ? <PostTypeTag type={model.postType} /> : null}{source ? <span data-block-source="" style={{ ...p.type.micro, color: p.ink3, fontVariantNumeric: "tabular-nums" }}>{source}</span> : null}</div> : null}
    {lead ? <div data-block-lead="" data-block-arrival="" style={{ marginTop: p.space.md }}>
      <p style={{ ...b.lead, color: p.ink, margin: 0, overflowWrap: "anywhere", textWrap: "pretty" }}>{keepParentheticals(lead)}</p>
      {sub ? <p data-block-lead-sub="" style={{ ...b.leadSub, color: p.ink3, margin: `${p.space.xs}px 0 0`, overflowWrap: "anywhere" }}>{keepParentheticals(sub)}</p> : null}
    </div> : null}
    {model.blocks.map(block => {
      const title = t(block.titleKey) || t(`blocks.${block.type}.title`);
      const attrs = { "data-analysis-block": block.type, "data-block-priority": block.primary ? "primary" : "secondary" };
      const body = <><BlockBody block={block} title={title} heading={block.primary} t={t} onCopy={onCopy} copyStatus={copyStatus} />
        {block.type === "noise_summary" ? <Truncated block={block} t={t} /> : null}</>;
      if (!block.primary) return <section key={block.id} {...attrs} aria-label={title} style={{ marginTop: p.space.md, borderTop: hairline, minWidth: 0 }}><Folded block={block} title={title} t={t}>{body}</Folded></section>;
      return <section key={block.id} {...attrs} aria-label={title} style={{ marginTop: p.space.xl, minWidth: 0 }}>
        {block.type !== "entity_list" ? <header style={{ display: "flex", alignItems: "baseline", gap: p.space.sm }}><h3 style={{ ...p.type.heading, color: p.ink, margin: 0, flex: 1, minWidth: 0 }}>{title}</h3><span style={meta}>{block.total}</span></header> : null}
        {body}
      </section>;
    })}
    {notes.length ? <ul data-block-omitted-notes="" style={{ margin: `${p.space.md}px 0 0`, padding: `${p.space.md}px 0 0`, borderTop: hairline, listStyle: "none", ...p.type.meta, color: p.ink3 }}>{notes.map((o, i) => <li key={i} data-block-omitted={o.type} data-block-omitted-reason={o.reason}>{omittedLine(t, o)}</li>)}</ul> : null}
    {supplement}
  </div>;
}

/** The extension's own AI methods/splits, only as a folded, clearly optional extra after the backend blocks. */
export function AiSupplement({ methods, split }: { methods?: InlineCardAnswer; split?: InlineCardAnswer }) {
  const t = useBlockText();
  const m = methods?.kind === "methods" && methods.rows.length ? methods : null;
  const s = split?.kind === "split" && split.sides.length ? split : null;
  if (!m && !s) return null;
  return <details data-block-ai-supplement="" style={{ marginTop: p.space.md, borderTop: hairline, padding: `${p.space.xs}px 0 ${p.space.md}px` }}>
    <summary style={{ ...p.type.meta, fontWeight: 600, color: p.ink3, cursor: "pointer", minHeight: p.size.buttonSm, display: "list-item", alignContent: "center" }}>{t("blocks.supplement.title")}</summary>
    <p style={{ ...p.type.micro, color: p.ink3, margin: `${p.space.xxs}px 0 0` }}>{t("blocks.supplement.note")}</p>
    {m ? <div style={{ marginTop: p.space.sm }}><b style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink2 }}>{t("blocks.supplement.methods")}</b>
      {m.rows.map((row, i) => <p key={i} style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xs}px 0 0` }}>{row.name}{row.fit ? <span style={{ color: p.ink3 }}> · {row.fit}</span> : null}</p>)}{quote(m.quote)}</div> : null}
    {s ? <div style={{ marginTop: p.space.md }}><b style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink2 }}>{t("blocks.supplement.split")}</b>
      <p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xs}px 0 0` }}>{s.agree}</p>
      {s.sides.map((side, i) => <div key={i} style={{ marginTop: p.space.sm, paddingLeft: p.space.md, borderLeft: `${p.reader.clusterBar}px solid ${c.sideColors[i % c.sideColors.length]}` }}><b style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink }}>{side.claim}</b><p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xxs}px 0 0` }}>{side.why}</p>{quote(side.quote)}</div>)}</div> : null}
  </details>;
}
