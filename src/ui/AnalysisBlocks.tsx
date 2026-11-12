import { useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp, Heart, MessageCircle, MoreHorizontal } from "lucide-react";
import type { AnalysisBlocksModel, AnalysisBlockView, BlockEvidenceLink, BlockGist, EntityRow, EntitySort, OpinionRow, PostTypeKey, QaGroup, QaPerson } from "../viewmodel/analysis-blocks";
import { ENTITY_SORTS, QA_GROUPS, blockOpensFirst, entityCsv, entityMarkdown, qaGroup, sortEntityRows, type EntityExportLabels } from "../viewmodel/analysis-blocks";
import type { InlineCardAnswer, InlineCardQuote } from "../viewmodel/inline-card";
import { useBlockText } from "./i18n";
import { ReaderReply } from "./ReaderReply";
import { tokens } from "./tokens";

/* Reading-first blocks reader. Three text tiers only: the lead sentence, comment/name text, and one quiet meta line.
 * A comment is shown once, its author handle is the way back to it, and a block with little to say is one line. */
const p = tokens.panel, b = p.blocks, c = tokens.collectCard;
type T = ReturnType<typeof useBlockText>;
type Block<K extends AnalysisBlockView["type"]> = Extract<AnalysisBlockView, { type: K }>;
const hairline = `${b.hairline}px solid ${p.border}`;
const meta: CSSProperties = { ...p.type.meta, color: p.ink3, fontVariantNumeric: "tabular-nums" };
const clamp = (lines: number): CSSProperties => ({ display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" });
const tile: CSSProperties = { background: p.surface, borderRadius: p.radius.lg, boxShadow: p.shadow.card, padding: `${p.space.lg}px ${p.space.lg}px ${p.space.md}px`, minWidth: 0 };
const label: CSSProperties = { ...b.label, color: p.ink3, margin: 0 };
const textButton: CSSProperties = { ...p.type.bodySm, fontWeight: 600, fontFamily: tokens.font.sans, minHeight: p.size.buttonSm, border: 0, borderRadius: p.radius.sm, padding: 0, color: p.ink2, background: "transparent", cursor: "pointer", textAlign: "left" };
const iconButton: CSSProperties = { border: 0, background: "transparent", color: p.ink4, cursor: "pointer", display: "inline-grid", placeItems: "center", width: p.size.buttonSm, height: p.size.buttonSm, borderRadius: p.radius.sm, flex: "none" };
const quote = (value: InlineCardQuote) => <ReaderReply row={{ ...value, isAuthor: !!value.isAuthor, replies: null, time: null }} />;
const dataColour = (i: number) => p.data[i % p.data.length];
const GROUP_TONE: Record<QaGroup, string> = { answered: p.success, unanswered: p.warning, unseen: p.ink4 };
const Chevron = ({ open }: { open: boolean }) => open ? <ChevronUp size={p.size.chipIcon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" /> : <ChevronDown size={p.size.chipIcon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" />;

/** One honest sentence for the lead when no AI gist is stored; copy lives in i18n. */
function gistText(g: BlockGist | null, t: T): string {
  if (!g) return "";
  if (g.kind === "entity") return t("blocks.gist.entity", { name: g.name, n: g.mentions, total: g.total });
  if (g.kind === "opinion") {
    // A label cut from a comment is quoted in full right below: the lead only gives its size.
    if (g.quote) return g.pct !== null ? t("blocks.gist.opinion_quote", { pct: g.pct }) : "";
    const name = g.generic ? t("blocks.opinion.generic") : g.label;
    return g.pct !== null ? t("blocks.gist.opinion", { label: name, pct: g.pct }) : t("blocks.gist.opinion_plain", { label: name });
  }
  if (g.kind === "qa") return g.unanswered ? t("blocks.gist.qa_open", { total: g.total, n: g.unanswered }) : t("blocks.gist.qa", { total: g.total });
  if (g.kind === "top") return t(g.author ? "blocks.gist.top" : "blocks.gist.top_anon", { author: g.author, text: g.text });
  return t("blocks.gist.noise", { noise: g.noise, audience: g.audience });
}

/** Keep each full-width parenthetical and its immediate comma on the same line. */
function keepParentheticals(text: string): ReactNode[] {
  return text.split(/(（[^（）]*），?)/g).map((part, i) => /^（[^（）]*），?$/.test(part)
    ? <span key={i} style={{ whiteSpace: "nowrap" }}>{part}</span> : part);
}

/** The way back to a comment is its author's handle. Without a rebuildable link the plain id is shown instead of a dead control. */
function Source({ link, t, post = false }: { link: BlockEvidenceLink | null; t: T; post?: boolean }) {
  if (!link) return null;
  const name = link.author ? `@${link.author}` : t(post ? "blocks.source.post" : "blocks.source.comment");
  if (!link.href) return <span data-block-evidence-id={link.commentId} style={{ overflowWrap: "anywhere" }}>{link.author ? `@${link.author} · ` : ""}{t("blocks.action.evidence_missing", { id: link.commentId })}</span>;
  const say = t(post ? "blocks.action.evidence_post" : "blocks.action.evidence");
  return <a data-reading-ref-site={link.commentId} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`${say} ${name}`} title={say} style={{ color: p.ink2, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: p.space.xxs, whiteSpace: "nowrap" }}>{name}<ArrowUpRight size={b.sourceIcon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" style={{ color: p.ink4 }} /></a>;
}
const Count = ({ n, icon }: { n: number | null; icon: "likes" | "replies" }) => typeof n === "number" && n > 0
  ? <span data-block-count={icon} style={{ display: "inline-flex", alignItems: "center", gap: p.space.xxs }}>{icon === "likes" ? <Heart size={b.sourceIcon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" /> : <MessageCircle size={b.sourceIcon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" />}{n}</span> : null;
const MetaLine = ({ children }: { children: ReactNode }) => <div style={{ ...meta, display: "flex", alignItems: "center", flexWrap: "wrap", gap: `0 ${p.space.sm}px`, marginTop: p.space.xs, overflowWrap: "anywhere" }}>{children}</div>;
const OpTag = ({ t }: { t: T }) => <span style={{ ...p.type.micro, padding: `0 ${p.space.xs}px`, borderRadius: p.radius.xs, background: p.accentSoft, color: p.accentInk }}>{t("blocks.qa.op")}</span>;

/** One comment, shown the same way everywhere: its words, then who said it (the link back) and how it landed. */
function Comment({ link, text, lines, t, tone = "main", bar, replies = null, post = false, children }: { link: BlockEvidenceLink | null; text: string | null; lines?: number; t: T; tone?: "main" | "aside"; bar?: string; replies?: number | null; post?: boolean; children?: ReactNode }) {
  return <div style={{ minWidth: 0, ...(bar ? { paddingLeft: p.space.md, borderLeft: `${b.quoteBar}px solid ${bar}` } : {}) }}>
    {text ? <p style={{ ...(tone === "main" ? p.type.body : p.type.bodySm), color: tone === "main" ? p.ink : p.ink2, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", ...(lines ? clamp(lines) : {}) }}>{text}</p> : null}
    <MetaLine><Source link={link} t={t} post={post} />{link?.isOp ? <OpTag t={t} /> : null}<Count n={link?.likes ?? null} icon="likes" /><Count n={replies} icon="replies" />{children}</MetaLine>
  </div>;
}

/** The one row grammar: a head line with at most one value on the right, the row's own body, and `detail` opened in place by tapping the row. */
function Row({ first, head, aside, children, detail, label: name, attrs }: { first: boolean; head: (open: boolean) => ReactNode; aside?: ReactNode; children?: (open: boolean) => ReactNode; detail?: ReactNode; label: string; attrs?: Record<string, string | undefined> }) {
  const [open, setOpen] = useState(false);
  const t = useBlockText();
  // A tap anywhere on the row toggles it, except on its own links and buttons.
  const tap = (e: MouseEvent) => { if (detail && !(e.target as HTMLElement).closest("a, button, summary")) setOpen(v => !v); };
  return <li {...attrs} onClick={tap} style={{ listStyle: "none", padding: `${p.space.md}px 0`, borderTop: first ? 0 : hairline, minWidth: 0, cursor: detail ? "pointer" : undefined }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: p.space.sm, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{head(open)}</div>
      {aside ? <span style={{ ...meta, whiteSpace: "nowrap" }}>{aside}</span> : null}
      {detail ? <button type="button" data-block-row-toggle="" aria-expanded={open} aria-label={`${t(open ? "blocks.action.collapse" : "blocks.action.expand")} ${name}`} onClick={() => setOpen(v => !v)} style={{ ...iconButton, alignSelf: "center", margin: `-${p.space.xs}px -${p.space.sm}px -${p.space.xs}px -${p.space.xs}px` }}><Chevron open={open} /></button> : null}
    </div>
    {children?.(open)}
    {open && detail ? <div data-block-detail="" data-block-arrival="" style={{ marginTop: p.space.md, display: "grid", gap: p.space.md, cursor: "auto", minWidth: 0 }}>{detail}</div> : null}
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
    {rows.length > first ? <button type="button" data-block-more="" aria-expanded={all} onClick={() => setAll(v => !v)} style={{ ...textButton, display: "block", width: "100%", borderTop: hairline, borderRadius: 0, paddingTop: p.space.xs }}>{all ? t("blocks.fold.less") : t("blocks.fold.more", { what: t(`blocks.unit.${block.type}`, { n: rows.length - first }) })}</button> : null}
    {(all || rows.length <= first) && rows.length === block.items.length ? <Truncated block={block} t={t} /> : null}
  </>;
}
const arrive = (revealed: boolean) => revealed ? { "data-block-arrival": "" } : {};

export function PostTypeTag({ type }: { type: PostTypeKey }) {
  const t = useBlockText();
  return <span data-post-type={type} aria-label={`${t("blocks.post_type.label")}：${t(`blocks.post_type.${type}`)}`} style={{ ...p.type.micro, fontWeight: 600, display: "inline-flex", alignItems: "center", padding: `${p.space.xxs}px ${p.space.sm}px`, borderRadius: p.radius.pill, background: p.accentSoft, color: p.ink, whiteSpace: "nowrap" }}>{t(`blocks.post_type.${type}`)}</span>;
}

const omittedLine = (t: T, o: { type: string; reason: string }) => t(o.reason === "empty" ? "blocks.omitted.item" : `blocks.omitted.${o.reason}`, { title: t(`blocks.${o.type}.title`) || t("blocks.post_type.unknown") });

/** Non-blocking notices: a failed block build, or blocks present but none to show. */
export function BlocksNotice({ model }: { model: AnalysisBlocksModel }) {
  const t = useBlockText();
  if (model.mode === "empty") return <div data-blocks-empty="" role="status" style={{ ...tile, marginTop: p.space.md }}>
    <b style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink }}>{t("blocks.empty.title")}</b>
    {model.omitted.length ? <ul style={{ margin: `${p.space.xs}px 0 0`, paddingLeft: p.space.lg, ...p.type.bodySm, color: p.ink3 }}>{model.omitted.map((o, i) => <li key={i} data-block-omitted={o.type} data-block-omitted-reason={o.reason}>{omittedLine(t, o)}</li>)}</ul>
      : <p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xs}px 0 0` }}>{t("blocks.empty.none")}</p>}
  </div>;
  if (!model.error) return null;
  return <p data-blocks-error="" role="status" style={{ ...p.type.bodySm, margin: `${p.space.md}px 0 0`, padding: `${p.space.xs}px ${p.space.sm}px`, borderRadius: p.radius.xs, background: p.warningSoft, color: p.warning }}>{t("blocks.error.fallback")}</p>;
}

const personLink = (person: QaPerson): BlockEvidenceLink => ({ commentId: person.commentId ?? "post", author: person.author, likes: person.likes, isOp: person.isOp, href: person.href, text: person.text });

function EntityItem({ row, first, revealed, t }: { row: EntityRow; first: boolean; revealed: boolean; t: T }) {
  // A link only in the post has no comment mentions: say so instead of "0 mentions".
  const postOnly = row.mentions === 0 && row.inPost;
  const facts = row.repo ? [row.repo.stars ? t("blocks.entity.stars", { n: row.repo.stars }) : "", row.repo.language, row.repo.archived ? t("blocks.entity.archived") : ""].filter(Boolean) : row.site ? [row.site] : [];
  const flags = [row.inPost && !postOnly ? t("blocks.entity.in_post") : "", row.byOp ? t("blocks.entity.by_op") : "", row.repo?.pushed ? t("blocks.entity.pushed", { date: row.repo.pushed }) : "", row.likes ? t("blocks.entity.likes", { n: row.likes }) : ""].filter(Boolean);
  const others = row.recommenders.filter(h => h !== row.link?.author);
  return <Row first={first} label={row.name} attrs={{ "data-block-entity": row.key, ...arrive(revealed) }}
    head={() => row.href ? <a data-block-entity-name="" href={row.href} target="_blank" rel="noopener noreferrer" style={{ ...b.rowName, color: p.accent, textDecoration: "none" }}>{row.name}</a> : <span style={{ ...b.rowName, color: p.ink }}>{row.name}</span>}
    aside={postOnly ? t("blocks.entity.in_post") : t("blocks.entity.mentions", { n: row.mentions })}
    detail={<>
      {row.href ? <a data-block-entity-url="" href={row.href} target="_blank" rel="noopener noreferrer" style={{ ...p.type.meta, color: p.accent, textDecoration: "none", overflowWrap: "anywhere", wordBreak: "break-all" }}>{row.url}</a>
        : <span data-block-entity-url="" style={{ ...p.type.meta, color: p.ink2, overflowWrap: "anywhere", wordBreak: "break-all" }}>{row.url}</span>}
      {flags.length ? <span data-block-entity-flags="" style={meta}>{flags.join(" · ")}</span> : null}
      {row.quote ? <Comment link={null} text={row.quote} t={t} tone="aside" bar={p.border} /> : null}
      {row.extra.map(e => <Comment key={e.commentId} link={e} text={e.text} t={t} tone="aside" bar={p.border} />)}
    </>}>
    {open => <>
      {row.summary ? <p style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xxs}px 0 0`, overflowWrap: "anywhere", ...(open ? {} : clamp(b.clampLines)) }}>{row.summary}</p> : null}
      {facts.length || row.link || others.length ? <MetaLine>
        {facts.length ? <span data-block-entity-facts="">{facts.join(" · ")}</span> : null}
        <Source link={row.link} t={t} />
        {others.length ? <span data-block-entity-by="">{row.link ? `+${others.length}` : others.slice(0, 2).map(h => "@" + h).join("、") + (others.length > 2 ? ` +${others.length - 2}` : "")}</span> : null}
      </MetaLine> : null}
    </>}
  </Row>;
}

/** Sort and export live in one small menu at the block heading, not a row of buttons. */
function EntityMenu({ sort, onSort, onExport, t }: { sort: EntitySort; onSort: (s: EntitySort) => void; onExport: (f: "Markdown" | "CSV") => void; t: T }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const item: CSSProperties = { ...p.type.bodySm, fontFamily: tokens.font.sans, display: "flex", alignItems: "center", textAlign: "left", border: 0, borderRadius: p.radius.sm, background: "transparent", minHeight: p.size.buttonSm, padding: `0 ${p.space.sm}px`, color: p.ink, cursor: "pointer", width: "100%" };
  const close = () => { if (ref.current) ref.current.open = false; };
  return <details ref={ref} data-block-menu="" style={{ position: "relative", flex: "none", margin: `-${p.space.xs}px -${p.space.sm}px -${p.space.xs}px 0` }}>
    <summary aria-label={t("blocks.menu.label")} style={{ ...iconButton, color: p.ink3, listStyle: "none" }}><MoreHorizontal size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" /></summary>
    <div role="group" style={{ position: "absolute", right: 0, top: "100%", zIndex: 2, width: b.menuWidth, padding: p.space.xs, background: p.surface, borderRadius: p.radius.md, boxShadow: p.shadow.popover, display: "grid" }} data-block-arrival="">
      <div role="group" aria-label={t("blocks.sort.label")}>{ENTITY_SORTS.map(key => <button key={key} type="button" data-block-entity-sort={key} aria-pressed={sort === key} onClick={() => { onSort(key); close(); }} style={{ ...item, fontWeight: sort === key ? 600 : 400, background: sort === key ? p.surfaceSubtle : "transparent" }}>{t(`blocks.sort.${key}`)}</button>)}</div>
      <div style={{ borderTop: hairline, margin: `${p.space.xs}px 0` }} />
      <button type="button" data-block-export="markdown" onClick={() => { onExport("Markdown"); close(); }} style={item}>{t("blocks.action.export_markdown")}</button>
      <button type="button" data-block-export="csv" onClick={() => { onExport("CSV"); close(); }} style={item}>{t("blocks.action.export_csv")}</button>
    </div>
  </details>;
}

type ExportState = { format: "Markdown" | "CSV"; text: string; n: number };

function EntityBlock({ block, title, t, onCopy, copyStatus }: { block: Block<"entity_list">; title: string; t: T; onCopy?: (text: string) => void; copyStatus?: string }) {
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
    <Heading title={title} aside={t("blocks.unit.entity_list", { n: block.total })} menu={<EntityMenu sort={sort} onSort={setSort} onExport={run} t={t} />} />
    {exported ? <div data-block-export-preview={exported.format.toLowerCase()} style={{ marginTop: p.space.sm, paddingLeft: p.space.md, borderLeft: `${b.quoteBar}px solid ${p.border}` }}>
      <p role="status" data-block-export-status="" style={{ ...meta, margin: `0 0 ${p.space.xs}px` }}>{t("blocks.export.sent", { format: exported.format, n: exported.n })}{copyStatus ? ` · ${copyStatus}` : ""}</p>
      <pre style={{ ...p.type.micro, margin: 0, maxHeight: p.size.menu, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: p.ink2, fontFamily: tokens.font.sans }}>{exported.text}</pre>
    </div> : null}
    <Rows rows={rows} block={block} render={(row, i, revealed) => <EntityItem key={row.key} row={row} first={i === 0} revealed={revealed} t={t} />} />
    {!rows.length ? <p style={{ ...p.type.bodySm, color: p.ink3 }}>{t("blocks.entity.github_empty")}</p> : null}
  </>;
}

/** Share of the audience per group, in the groups' own colours; what no listed group covers stays a quiet remainder. */
function ShareBar({ rows, colour }: { rows: OpinionRow[]; colour: (row: OpinionRow) => string }) {
  const measured = rows.filter(r => !r.lowSignal && r.pct !== null && r.pct > 0);
  const rest = Math.max(0, 100 - measured.reduce((n, r) => n + (r.pct ?? 0), 0));
  if (!measured.length || (measured.length === 1 && !rest)) return null;
  return <div aria-hidden="true" data-block-share="" style={{ display: "flex", gap: p.space.xxs, height: b.shareHeight, marginTop: p.space.md, borderRadius: p.radius.pill, overflow: "hidden" }}>
    {measured.map((r, i) => <i key={i} style={{ flex: r.pct!, background: colour(r) }} />)}
    {rest ? <i style={{ flex: rest, background: p.dataRest }} /> : null}
  </div>;
}

function OpinionBlock({ block, t }: { block: Block<"opinion_overview">; t: T }) {
  // Low-signal groups sit behind 「再睇」 after the rest, dimmed.
  const order = [...block.items.filter(r => !r.lowSignal), ...block.items.filter(r => r.lowSignal)];
  const dots = new Map(block.items.map((r, i) => [r, dataColour(i)]));
  const colour = (row: OpinionRow) => row.lowSignal ? p.ink4 : dots.get(row)!;
  const render = (row: OpinionRow, i: number, revealed: boolean) => {
    // A label cut from a comment is that comment: say how many read alike, then quote it once.
    const name = row.generic ? t("blocks.opinion.generic") : row.quoteLabel ? (row.count !== null ? t("blocks.opinion.similar", { n: row.count }) : t("blocks.opinion.similar_plain")) : row.label;
    const named = !row.generic && !row.quoteLabel && !row.lowSignal;
    const split = [row.count !== null && !row.quoteLabel ? t("blocks.opinion.count", { n: row.count }) : "", row.substantive !== null ? t("blocks.opinion.substantive", { n: row.substantive }) : "", row.noise ? t("blocks.opinion.noise", { n: row.noise }) : ""].filter(Boolean).join(" · ");
    const rest = row.evidence.filter(e => e.commentId !== row.rep?.commentId);
    const kw = row.keywords.join("、");
    return <Row key={i} first={i === 0} label={name} attrs={{ "data-block-opinion": String(i), ...(row.lowSignal ? { "data-block-low-signal": "" } : {}), ...(row.quoteLabel ? { "data-block-opinion-quote": "" } : {}), ...arrive(revealed) }}
      head={() => <span style={{ display: "flex", alignItems: "center", gap: p.space.sm, minWidth: 0 }}>
        <i aria-hidden="true" style={{ width: p.size.statusDot, height: p.size.statusDot, flex: "none", borderRadius: p.radius.xs / 3, background: colour(row) }} />
        <span style={named ? { ...b.rowName, color: p.ink } : { ...p.type.bodySm, fontWeight: 500, color: row.lowSignal ? p.ink3 : p.ink2 }}>{name}</span>
        {row.lowSignal ? <span style={{ ...p.type.micro, color: p.ink3 }}>{t("blocks.opinion.low")}</span> : null}
      </span>}
      aside={row.pct !== null ? `${row.pct}%` : undefined}
      detail={(row.repText && kw) || split || rest.length ? <>
        {split || (row.repText && kw) ? <span style={meta}>{split ? <span data-block-opinion-split="">{split}</span> : null}{split && row.repText && kw ? " · " : ""}{row.repText && kw ? <span data-block-opinion-keywords="">{kw}</span> : null}</span> : null}
        {rest.map(e => <Comment key={e.commentId} link={e} text={e.text} t={t} tone="aside" bar={colour(row)} />)}
      </> : undefined}>
      {open => <div style={{ marginTop: p.space.sm }}>
        {row.repText ? <Comment link={row.rep} text={row.repText} lines={open ? 0 : b.quoteLines} t={t} bar={colour(row)} />
          : <>{kw ? <p data-block-opinion-keywords="" style={{ ...p.type.bodySm, color: p.ink2, margin: 0 }}>{kw}</p> : null}{row.rep ? <MetaLine><Source link={row.rep} t={t} /><Count n={row.rep.likes} icon="likes" /></MetaLine> : null}</>}
      </div>}
    </Row>;
  };
  return <>
    <ShareBar rows={block.items} colour={colour} />
    <Rows rows={order} block={block} render={render} />
    {block.noiseOnlyGroups ? <p data-block-opinion-noise-groups="" style={{ ...meta, margin: `${p.space.sm}px 0 0` }}>{t("blocks.opinion.noise_groups", { n: block.noiseOnlyGroups })}</p> : null}
  </>;
}

/** Counts per reader group, e.g. 「有答 3 · 未答 1」; the data keeps five statuses. */
function qaSummary(block: Block<"qa_pairs">, t: T): string {
  const counts = block.statusCounts ? Object.entries(block.statusCounts) as [string, number][] : block.items.map(i => [i.status, 1] as [string, number]);
  return QA_GROUPS.map(g => [g, counts.filter(([s]) => qaGroup(s as never) === g).reduce((n, [, v]) => n + v, 0)] as const).filter(([, n]) => n > 0).map(([g, n]) => `${t(`blocks.qa.group.${g}`)} ${n}`).join(" · ");
}

function QaBlock({ block, t }: { block: Block<"qa_pairs">; t: T }) {
  return <>
    <Rows rows={block.items} block={block} render={(item, i, revealed) => {
      const group = qaGroup(item.status), q = item.question, first = item.answers[0];
      // An answer shown right under the question is its own status; only open or unseen questions carry a label.
      const status = <span data-block-qa-status={item.status} style={first ? p.visuallyHidden as CSSProperties : { display: "inline-flex", alignItems: "center", gap: p.space.xs }}>{first ? null : <i aria-hidden="true" style={{ width: p.size.modeDot, height: p.size.modeDot, borderRadius: p.radius.pill, background: GROUP_TONE[group] }} />}{t(`blocks.qa.group.${group}`)}</span>;
      return <Row key={i} first={i === 0} label={q.text} attrs={{ "data-block-qa": item.status, ...arrive(revealed) }}
        head={open => <span style={{ ...p.type.body, color: p.ink, overflowWrap: "anywhere", ...(open ? {} : clamp(b.clampLines)) }}>{q.isPost ? <span data-block-qa-post="" style={{ ...p.type.micro, color: p.ink, background: p.accentSoft, borderRadius: p.radius.pill, padding: `${p.space.xxs}px ${p.space.sm}px`, marginRight: p.space.xs, verticalAlign: "middle" }}>{t("blocks.qa.post_question")}</span> : null}{q.text}</span>}
        aside={status}
        detail={item.answers.length ? item.answers.map((a, j) => <div key={j} data-block-qa-person="answer"><Comment link={personLink(a)} text={a.text} t={t} tone="aside" bar={p.border} /></div>) : undefined}>
        {open => <>
          {first && !open ? <p data-block-qa-answer="" style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xs}px 0 0`, paddingLeft: p.space.md, borderLeft: `${b.quoteBar}px solid ${p.border}`, overflowWrap: "anywhere", ...clamp(b.clampLines) }}>{first.author ? `@${first.author}：` : ""}{first.text}</p> : null}
          <MetaLine><Source link={personLink(q)} t={t} post={q.isPost} /><Count n={q.likes} icon="likes" />{item.answerCount > item.answers.length ? <span data-block-qa-more="">{t("blocks.qa.answers_more", { n: item.answerCount - item.answers.length })}</span> : null}</MetaLine>
        </>}
      </Row>;
    }} />
    {block.replyStructureKnown === false ? <p data-block-qa-structure="" style={{ ...p.type.micro, color: p.ink3, margin: `${p.space.sm}px 0 0` }}>{t("blocks.qa.structure_unknown")}</p> : null}
  </>;
}

function TopComment({ item, first, revealed, t }: { item: Block<"top_comments">["items"][number]; first: boolean; revealed: boolean; t: T }) {
  const [open, setOpen] = useState(false);
  const link = item.evidence[0] ?? (item.author ? { commentId: item.id, author: item.author, likes: item.likes, isOp: item.isOp, href: null, text: item.text } : null);
  return <li data-block-top={item.id} {...arrive(revealed)} onClick={e => { if (!(e.target as HTMLElement).closest("a, button")) setOpen(v => !v); }} style={{ listStyle: "none", padding: `${p.space.md}px 0`, borderTop: first ? 0 : hairline, minWidth: 0, cursor: "pointer" }}>
    <Comment link={link ? { ...link, likes: item.likes, isOp: item.isOp } : null} text={item.text ?? t("blocks.top.no_text")} lines={open ? 0 : b.quoteLines} replies={item.replies} t={t} />
    {item.links.length ? <ul data-block-comment-links="" aria-label={t("blocks.top.links")} style={{ listStyle: "none", margin: `${p.space.xs}px 0 0`, padding: 0, ...p.type.meta }}>{item.links.map((l, j) => <li key={j} style={{ overflowWrap: "anywhere", wordBreak: "break-all" }}>{l.href ? <a data-block-comment-link={l.kind || "external"} href={l.href} target="_blank" rel="noopener noreferrer" style={{ color: p.accent, textDecoration: "none" }}>{l.url}</a> : <span data-block-comment-link={l.kind || "external"} style={{ color: p.ink2 }}>{l.url}</span>}</li>)}</ul> : null}
  </li>;
}

const flagName = (t: T, flag: string) => t(`blocks.noise.flag.${flag}`) || t("blocks.noise.flag.other");

/** Small label over an open block: its name, one quiet figure, and the block's own menu if it has one. */
function Heading({ title, aside, menu }: { title: string; aside?: ReactNode; menu?: ReactNode }) {
  return <header style={{ display: "flex", alignItems: "center", gap: p.space.sm, minHeight: b.label.lineHeight }}>
    <h3 style={{ ...label, flex: "none" }}>{title}</h3>
    <span style={{ ...meta, flex: 1, minWidth: 0 }}>{aside}</span>
    {menu}
  </header>;
}

function BlockBody({ block, title, t, onCopy, copyStatus }: { block: Exclude<AnalysisBlockView, { type: "noise_summary" }>; title: string; t: T; onCopy?: (text: string) => void; copyStatus?: string }) {
  if (block.type === "entity_list") return <EntityBlock block={block} title={title} t={t} onCopy={onCopy} copyStatus={copyStatus} />;
  if (block.type === "opinion_overview") return <><Heading title={title} /><OpinionBlock block={block} t={t} /></>;
  if (block.type === "qa_pairs") return <><Heading title={title} aside={<span data-block-qa-summary="">{qaSummary(block, t)}</span>} /><QaBlock block={block} t={t} /></>;
  return <><Heading title={title} aside={t("blocks.unit.top_comments", { n: block.total })} /><Rows rows={block.items} block={block} render={(item, i, revealed) => <TopComment key={item.id || i} item={item} first={i === 0} revealed={revealed} t={t} />} /></>;
}

/** What a folded block holds, in a few words taken from its own rows. */
function foldLine(block: Exclude<AnalysisBlockView, { type: "noise_summary" }>, t: T): string {
  if (block.type === "entity_list") return [...block.items].sort((x, y) => y.mentions - x.mentions || y.likes - x.likes).slice(0, 2).map(r => r.name).join("、");
  if (block.type === "qa_pairs") return qaSummary(block, t);
  if (block.type === "top_comments") { const likes = block.items[0]?.likes; return likes ? t("blocks.fold.top", { likes }) : ""; }
  const top = block.items.find(r => !r.lowSignal) ?? block.items[0];
  if (!top) return "";
  if (top.quoteLabel) return top.pct !== null ? t("blocks.gist.opinion_quote", { pct: top.pct }) : "";
  return `${top.generic ? t("blocks.opinion.generic") : top.label}${top.pct !== null ? ` ${top.pct}%` : ""}`;
}

/** A block with little to say is one line (name, a few words, count) until opened in place. */
function Folded({ block, title, t, children }: { block: Exclude<AnalysisBlockView, { type: "noise_summary" }>; title: string; t: T; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const line = foldLine(block, t);
  return <>
    <button type="button" data-block-fold="" aria-expanded={open} onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: p.space.sm, width: "100%", minHeight: b.foldHeight, padding: 0, border: 0, background: "transparent", textAlign: "left", cursor: "pointer", fontFamily: tokens.font.sans, color: p.ink }}>
      <span style={{ ...p.type.bodySm, fontWeight: 600, flex: "none" }}>{title}</span>
      <span data-block-fold-line="" style={{ ...p.type.bodySm, color: p.ink3, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{open ? "" : line}</span>
      <span style={{ ...meta, flex: "none", display: "inline-flex", alignItems: "center", gap: p.space.xs, color: p.ink3 }}>{t(`blocks.unit.${block.type}`, { n: block.total })}<span style={{ color: p.ink4, display: "inline-grid" }}><Chevron open={open} /></span></span>
    </button>
    {open ? <div data-block-arrival="" style={{ paddingBottom: p.space.sm }}>{children}</div> : null}
  </>;
}

/** Marker comments are only ever numbers: one static line, never rows. */
function NoiseLine({ block, title, t }: { block: Block<"noise_summary">; title: string; t: T }) {
  return <div data-block-noise="" style={{ display: "flex", alignItems: "baseline", gap: p.space.sm, minHeight: b.foldHeight, padding: `${p.space.sm}px 0`, boxSizing: "border-box" }}>
    <span style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink3, flex: "none" }}>{title}</span>
    <span style={{ ...p.type.bodySm, color: p.ink3, flex: 1, minWidth: 0 }}>{block.flags.map((f, i) => <span key={f.flag} data-block-noise-flag={f.flag}>{i ? " · " : ""}{flagName(t, f.flag)} {f.count}</span>)}</span>
    {block.noise !== null ? <span data-block-noise-count="" style={{ ...meta, flex: "none" }}>{t("blocks.unit.noise_summary", { n: block.noise })}</span> : null}
  </div>;
}

/** Backend blocks in their given order. The answer tile holds the lead and the first open block; a block opens only when it is primary
 *  and has something to read (`blockOpensFirst`), every other block is one line, and marker comments stay a single line of numbers. */
export function AnalysisBlocksView({ model, onCopy, copyStatus, supplement }: { model: AnalysisBlocksModel; onCopy?: (text: string) => void; copyStatus?: string; supplement?: ReactNode }) {
  const t = useBlockText();
  const lead = model.lead ? model.lead.ai || gistText(model.lead.main, t) : "";
  const substantive = model.source?.audience != null && model.source.noise ? model.source.audience - model.source.noise : null;
  const source = [model.source?.audience != null ? t("blocks.source.audience", { n: model.source.audience }) : "", substantive !== null && substantive > 0 ? t("blocks.source.substantive", { n: substantive }) : ""].filter(Boolean).join(" · ");
  const notes = model.omitted.filter(o => o.reason !== "empty");
  const titleOf = (block: AnalysisBlockView) => t(block.titleKey) || t(`blocks.${block.type}.title`);
  const section = (block: AnalysisBlockView, open: boolean, divided: boolean) => {
    const title = titleOf(block);
    const attrs = { "data-analysis-block": block.type, "data-block-priority": block.primary ? "primary" : "secondary", "data-block-open": open ? "" : undefined };
    if (block.type === "noise_summary") return <section key={block.id} {...attrs} aria-label={title} style={{ borderTop: divided ? hairline : 0, minWidth: 0 }}><NoiseLine block={block} title={title} t={t} /><Truncated block={block} t={t} /></section>;
    const body = <BlockBody block={block} title={title} t={t} onCopy={onCopy} copyStatus={copyStatus} />;
    return <section key={block.id} {...attrs} aria-label={title} style={{ borderTop: divided ? hairline : 0, minWidth: 0 }}>{open ? body : <Folded block={block} title={title} t={t}>{body}</Folded>}</section>;
  };
  // Consecutive one-line blocks share a tile; each open block gets its own, and the first one joins the lead.
  const groups: { open: boolean; blocks: AnalysisBlockView[] }[] = [];
  for (const block of model.blocks) {
    const open = blockOpensFirst(block), last = groups[groups.length - 1];
    if (!open && last && !last.open) last.blocks.push(block); else groups.push({ open, blocks: [block] });
  }
  const hero = groups[0]?.open ? groups.shift()! : null;
  const lastFolded = groups.length > 0 && !groups[groups.length - 1].open;
  // Notes and the optional AI extra close the last one-line tile, or get a small tile of their own.
  const tailParts = [
    notes.length ? <ul data-block-omitted-notes="" style={{ margin: 0, padding: `${p.space.md}px 0`, listStyle: "none", ...p.type.meta, color: p.ink3 }}>{notes.map((o, i) => <li key={i} data-block-omitted={o.type} data-block-omitted-reason={o.reason}>{omittedLine(t, o)}</li>)}</ul> : null,
    supplement,
  ].filter(Boolean);
  const tail = tailParts.map((part, i) => <div key={i} style={{ borderTop: i > 0 || lastFolded ? hairline : 0 }}>{part}</div>);
  const hasTail = tailParts.length > 0;
  const foldTile: CSSProperties = { ...tile, padding: `${p.space.xs}px ${p.space.lg}px` };
  return <div data-analysis-blocks="" style={{ marginTop: p.space.md, display: "grid", gap: p.space.md, minWidth: 0 }}>
    <div data-block-hero="" style={tile}>
      {model.postType || source ? <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: p.space.sm }}>{model.postType ? <PostTypeTag type={model.postType} /> : null}{source ? <span data-block-source="" style={meta}>{source}</span> : null}</div> : null}
      {lead ? <div data-block-lead="" data-block-arrival="" style={{ marginTop: p.space.sm }}><p style={{ ...b.lead, color: p.ink, margin: 0, overflowWrap: "anywhere", textWrap: "pretty" }}>{keepParentheticals(lead)}</p></div> : null}
      {hero ? <div style={{ marginTop: p.space.lg }}>{section(hero.blocks[0], true, false)}</div> : null}
    </div>
    {groups.map((group, at) => group.open
      ? <div key={at} style={tile}>{section(group.blocks[0], true, false)}</div>
      : <div key={at} data-block-index="" style={foldTile}>{group.blocks.map((block, i) => section(block, false, i > 0))}{hasTail && at === groups.length - 1 ? tail : null}</div>)}
    {hasTail && !lastFolded ? <div data-block-index="" style={foldTile}>{tail}</div> : null}
  </div>;
}

/** The extension's own AI methods/splits, only as a folded, clearly optional extra after the backend blocks. */
const supplementParts = (methods?: InlineCardAnswer, split?: InlineCardAnswer) => ({
  m: methods?.kind === "methods" && methods.rows.length ? methods : null,
  s: split?.kind === "split" && split.sides.length ? split : null,
});
/** Whether there is any AI extra to offer; an empty one must not open a tile of its own. */
export function hasAiSupplement(methods?: InlineCardAnswer, split?: InlineCardAnswer): boolean {
  const { m, s } = supplementParts(methods, split);
  return !!m || !!s;
}
export function AiSupplement({ methods, split }: { methods?: InlineCardAnswer; split?: InlineCardAnswer }) {
  const t = useBlockText();
  const { m, s } = supplementParts(methods, split);
  if (!m && !s) return null;
  return <details data-block-ai-supplement="">
    <summary style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink, cursor: "pointer", minHeight: b.foldHeight, display: "list-item", alignContent: "center" }}>{t("blocks.supplement.title")}<span style={{ fontWeight: 400, color: p.ink3 }}> · {t("blocks.supplement.note")}</span></summary>
    <div style={{ paddingBottom: p.space.md }}>
      {m ? <div><b style={{ ...label }}>{t("blocks.supplement.methods")}</b>
        {m.rows.map((row, i) => <p key={i} style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xs}px 0 0` }}>{row.name}{row.fit ? <span style={{ color: p.ink3 }}> · {row.fit}</span> : null}</p>)}{quote(m.quote)}</div> : null}
      {s ? <div style={{ marginTop: m ? p.space.md : 0 }}><b style={{ ...label }}>{t("blocks.supplement.split")}</b>
        <p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xs}px 0 0` }}>{s.agree}</p>
        {s.sides.map((side, i) => <div key={i} style={{ marginTop: p.space.sm, paddingLeft: p.space.md, borderLeft: `${p.reader.clusterBar}px solid ${c.sideColors[i % c.sideColors.length]}` }}><b style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink }}>{side.claim}</b><p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xxs}px 0 0` }}>{side.why}</p>{quote(side.quote)}</div>)}</div> : null}
    </div>
  </details>;
}
