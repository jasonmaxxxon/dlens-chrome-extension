import { useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, Heart, MessageCircle, Sparkles } from "lucide-react";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { readerOverview, readerRaw, readerTabs, wheelEntityDescription, wheelGeometry, wheelOffset, withoutAi, type ReaderRawKey, type ReaderTabKey, type ReaderWheelModel, type WheelSector } from "../viewmodel/reader-wheel";
import { ENTITY_SORTS, entityCsv, entityMarkdown, sortEntityRows, type EntityExportLabels, type EntityRow, type EntitySort } from "../viewmodel/analysis-blocks";
import { useBlockText } from "./i18n";
import { tokens } from "./tokens";

const p = tokens.panel, w = p.wheel, m = tokens.motion;
type Text = ReturnType<typeof useBlockText>;
const meta: CSSProperties = { ...p.type.meta, color: p.ink3 };
/** 墨線: controls are words. Nothing in the reader is a filled button, track or card. */
const plain: CSSProperties = { fontFamily: tokens.font.sans, background: "transparent", border: 0, padding: 0, margin: 0, cursor: "pointer", color: "inherit", textAlign: "left" };
const hair = `${w.hairline}px solid ${p.border}`;
/** One white sheet; `clip` keeps the frosted bar inside its corners without stopping the entries from sticking. */
const sheet: CSSProperties = { overflow: "clip", marginTop: p.space.lg, padding: p.space.lg, borderRadius: p.radius.lg, backgroundColor: p.surface, backgroundRepeat: "no-repeat", backgroundSize: `100% ${w.haze.height}px`, boxShadow: p.shadow.card, minWidth: 0 };
const block: CSSProperties = { marginTop: p.space.lg, paddingTop: p.space.lg, borderTop: hair, minWidth: 0 };
const pane: CSSProperties = { padding: p.space.sm, borderRadius: p.radius.md, background: p.surface, boxShadow: p.shadow.popover, minWidth: 0 };
const menuItem: CSSProperties = { ...plain, ...p.type.bodySm, minHeight: p.size.buttonSm, padding: `${p.space.xs}px ${p.space.sm}px`, borderRadius: p.radius.xs };
const title: CSSProperties = { ...p.type.title, margin: 0, color: p.ink, overflowWrap: "anywhere" };
const heading: CSSProperties = { ...p.type.heading, margin: 0, color: p.ink, overflowWrap: "anywhere" };
const link: CSSProperties = { ...plain, ...p.type.meta, display: "inline-flex", alignItems: "center", gap: p.space.xxs, color: p.ink2, textDecoration: "none" };
const count: CSSProperties = { display: "inline-flex", alignItems: "center", gap: p.space.xxs };
const clamp: CSSProperties = { display: "-webkit-box", WebkitLineClamp: w.clampLines, WebkitBoxOrient: "vertical", overflow: "hidden" };
const dot = (background: string): CSSProperties => ({ flex: "none", width: p.size.modeDot, height: p.size.modeDot, borderRadius: p.radius.pill, background });
/** A word that is a choice: the chosen one turns to ink and gets a rule under it. */
const word = (on: boolean, type: CSSProperties, line?: string): CSSProperties => ({ ...plain, ...type, color: on ? p.ink : p.ink3, fontWeight: on ? 600 : 400, ...(line ? { paddingBottom: p.space.xs, boxShadow: on ? `inset 0 -${w.rule}px 0 ${line}` : undefined } : {}) });
const icon = { size: p.size.chipIcon, strokeWidth: p.iconStrokeWidth, "aria-hidden": true } as const;
/** 分歧's two sides: one cool, one warm, each only as a rule and a tint. */
const SIDES = [p.accent, p.data[2]];
const pct = (n: number) => Math.round(n * 100);
const color = (s: WheelSector) => p.data[s.rank % p.data.length];
const name = (s: WheelSector, t: Text) => s.aiName || t("wheel.similar", { n: s.count });
const tint = (base: string, share: number) => `color-mix(in oklch, ${base} ${share}%, transparent)`;
const glass: CSSProperties = { position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none", background: w.glass, backdropFilter: `blur(${w.glassBlur}px) saturate(${w.glassSaturate})`, WebkitBackdropFilter: `blur(${w.glassBlur}px) saturate(${w.glassSaturate})` };
// The workspace shell holds every transition to opacity and transform at the panel's own pace, so the reader moves only those:
// the ink line slides to the chosen entry, what an entry opens comes in from the side it was chosen on, and a new choice inside it rises into place.
const css = `@media (prefers-reduced-motion: no-preference) {
  [data-reader-wheel] :is([data-wheel-sector], [data-wheel-ink], [data-wheel-rule], [data-wheel-pane], [data-wheel-swap], [data-wheel-glass], [data-wheel-chevron], [data-wheel-through] svg) { transition: opacity ${p.motion.base} ${p.motion.standard}, transform ${p.motion.base} ${p.motion.standard}; }
  [data-reader-wheel] [data-wheel-pane][data-starting-style] { opacity: 0; transform: translateY(${m.lens.risePx}px); }
  [data-reader-wheel] [data-wheel-pane][data-starting-style][data-activation-direction="right"] { transform: translateX(${m.lens.risePx}px); }
  [data-reader-wheel] [data-wheel-pane][data-starting-style][data-activation-direction="left"] { transform: translateX(-${m.lens.risePx}px); }
  @starting-style { [data-reader-wheel] [data-wheel-pane]:not([data-wheel-arriving]) [data-wheel-swap] { opacity: 0; transform: translateY(${m.lens.risePx}px); } }
  [data-reader-wheel] [data-wheel-through]:hover svg { transform: translateX(${p.space.xs}px); }
}
/* The bar is clear until it sticks; only then does it frost what scrolls under it. */
@supports (container-type: scroll-state) {
  [data-reader-wheel] [data-wheel-bar] { container-type: scroll-state; }
  [data-reader-wheel] [data-wheel-glass] { opacity: 0; }
  @container scroll-state(stuck: top) { [data-reader-wheel] [data-wheel-glass] { opacity: 1; } }
}
[data-reader-wheel] [data-wheel-pane][data-ending-style] { display: none; }
[data-reader-wheel] [data-wheel-sector] { outline: none; }
[data-reader-wheel] [data-wheel-sector]:focus-visible path { stroke: ${p.ink}; }
[data-reader-wheel] [data-scroll-x]::-webkit-scrollbar { display: none; }
[data-reader-wheel] button:focus-visible, [data-reader-wheel] a:focus-visible, [data-reader-wheel] summary:focus-visible { outline: none; box-shadow: ${p.focusRing}; border-radius: ${p.radius.xs}px; }`;

/** Entity descriptions stay distinct from captured quotes; comment rows below own all source text. */
function Links({ model, rows, onCopy, copyStatus, t }: { model: ReaderWheelModel; rows: EntityRow[]; onCopy?: (text: string) => void; copyStatus?: string; t: Text }) {
  const [sort, setSort] = useState<EntitySort>("mentions");
  const [exported, setExported] = useState<string | null>(null);
  const labels: EntityExportLabels = { mentions: t("blocks.export.mentions"), likes: t("blocks.export.likes"), by: t("blocks.entity.by"), columns: t("blocks.export.columns").split(",") as EntityExportLabels["columns"] };
  const run = (format: "markdown" | "csv") => { onCopy?.(format === "markdown" ? entityMarkdown(rows, t("wheel.link"), labels) : entityCsv(rows, labels)); setExported(format); };
  return <>
    <div style={{ display: "flex", justifyContent: "space-between", gap: p.space.sm }}><h2 style={title}>{t("wheel.link")}</h2>
      <details data-block-menu="" style={{ position: "relative" }}><summary style={{ ...plain, ...meta, listStyle: "none", minHeight: p.size.buttonSm, display: "flex", alignItems: "center" }} aria-label={t("blocks.menu.label")}>{t("blocks.menu.label")}</summary>
        <div style={{ ...pane, position: "absolute", right: 0, width: w.menuWidth, zIndex: 1, display: "grid", gap: p.space.xs }}>
          {ENTITY_SORTS.map(key => <button key={key} type="button" data-block-entity-sort={key} aria-pressed={sort === key} onClick={() => setSort(key)} style={{ ...menuItem, color: sort === key ? p.ink : p.ink2, fontWeight: sort === key ? 600 : 400 }}>{t(`blocks.sort.${key}`)}</button>)}
          {(["markdown", "csv"] as const).map(format => <button key={format} type="button" data-block-export={format} style={menuItem} onClick={() => run(format)}>{t(`blocks.action.export_${format}`)}</button>)}
        </div>
      </details></div>
    {exported ? <p data-block-export-status="" role="status" style={meta}>{t("blocks.export.sent", { format: exported === "csv" ? "CSV" : "Markdown", n: rows.length })}{copyStatus ? ` · ${copyStatus}` : ""}</p> : null}
    {sortEntityRows(rows, sort).map(row => <div key={row.key} data-block-entity={row.key} style={{ marginTop: p.space.lg }}>
      {row.href ? <a href={row.href} target="_blank" rel="noopener noreferrer" style={{ ...p.type.heading, color: p.ink, textDecoration: "none" }}>{row.name} <ArrowUpRight {...icon} style={{ color: p.ink3, verticalAlign: "middle" }} /></a> : <b>{row.name}</b>}
      {wheelEntityDescription(model, row) ? <p style={{ ...p.type.bodySm, margin: `${p.space.xs}px 0` }}>{wheelEntityDescription(model, row)}</p> : null}
      <div style={meta}>{t(row.mentions === 0 && row.inPost ? "blocks.entity.in_post" : "blocks.entity.mentions", { n: row.mentions })}{row.site ? ` · ${row.site}` : ""}{row.byOp ? ` · ${t("blocks.entity.by_op")}` : ""}{row.likes ? ` · ${t("blocks.entity.likes", { n: row.likes })}` : ""}{row.recommenders.length ? ` · ${t("blocks.entity.by")} ${row.recommenders.map(author => `@${author}`).join(t("wheel.list.separator"))}` : ""}{row.repo ? ` · ${row.repo.stars ? t("blocks.entity.stars", { n: row.repo.stars }) : ""} ${row.repo.language}${row.repo.archived ? ` · ${t("blocks.entity.archived")}` : ""}${row.repo.pushed ? ` · ${t("blocks.entity.pushed", { date: row.repo.pushed })}` : ""}` : ""}</div>
    </div>)}
    {!sortEntityRows(rows, sort).length ? <p style={meta}>{t("blocks.entity.github_empty")}</p> : null}
  </>;
}

/** A one-line strip that scrolls sideways when it must: the chosen item is kept in view, a fade shows only while more lies to the right, and the edge leaves room for a focus ring. */
function Strip({ anchor, style, children, ...rest }: { anchor: string } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measure = () => { const box = ref.current; if (box) setMore(box.scrollLeft + box.clientWidth < box.scrollWidth - 1); };
  useEffect(() => {
    const box = ref.current, on = box?.querySelector<HTMLElement>('[aria-selected="true"], [aria-pressed="true"]');
    if (box && on) box.scrollLeft = Math.max(Math.min(box.scrollLeft, on.offsetLeft), on.offsetLeft + on.offsetWidth - box.clientWidth);
  }, [anchor]);
  useEffect(() => { measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); });
  return <div ref={ref} data-scroll-x="" onScroll={measure} style={{ ...style, display: "flex", position: "relative", overflowX: "auto", scrollbarWidth: "none", padding: p.space.xs, margin: -p.space.xs, ...(more ? { maskImage: p.scrollMask, WebkitMaskImage: p.scrollMask } : {}) }} {...rest}>{children}</div>;
}

/** Tabbed reading: 概覽 (one counted finding, the wheel, one topic in focus), then an entry per kind of content the post has, then 原文. */
export function ReaderWheel({ model: full, onCopy, copyStatus }: { model: ReaderWheelModel; onCopy?: (text: string) => void; copyStatus?: string }) {
  const t = useBlockText();
  const [counted, setCounted] = useState(false);
  const model = useMemo(() => counted ? withoutAi(full) : full, [counted, full]);
  const tabs = readerTabs(model);
  const [wanted, setTab] = useState<ReaderTabKey | null>(null);
  const tab = tabs.find(x => x.key === wanted)?.key ?? tabs[0].key;
  const [topic, setTopic] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReaderRawKey>("all");
  const [side, setSide] = useState(0);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) => setOpen(old => { const next = new Set(old); if (!next.delete(key)) next.add(key); return next; });
  const root = useRef<HTMLDivElement>(null), jump = useRef(false);
  // An entry arrives as one piece; only a later choice inside it rises on its own.
  const [settled, setSettled] = useState<ReaderTabKey | null>(null);
  useEffect(() => setSettled(tab), [tab]);
  // A link that lands on another entry brings the sheet's top back into view.
  useEffect(() => { if (jump.current) { jump.current = false; root.current?.scrollIntoView?.({ block: "start" }); } }, [tab, filter]);
  const raw = readerRaw(model, filter);
  // One comment is drawn once per entry, wherever it is cited first.
  const seen = new Set<string>();
  const fresh = (ids: string[]) => ids.filter((id, i) => model.comments[id] && !seen.has(id) && ids.indexOf(id) === i);
  const chevron = (up: boolean) => <ChevronDown {...icon} data-wheel-chevron="" style={{ transform: up ? "rotate(180deg)" : undefined }} />;
  const comment = (id: string, o: { first?: boolean; bar?: boolean; op?: boolean; open?: boolean; tag?: boolean; noise?: boolean; quote?: string } = {}) => {
    const c = model.comments[id]; if (!c || seen.has(id)) return null;
    seen.add(id);
    const sector = model.sectors.find(s => s.key === c.sector), full = open.has(`text:${id}`);
    // Only a long comment is cut, and a cut comment can always be opened in place.
    const long = c.text.length > w.clampChars || c.text.split("\n").length > w.clampLines;
    const likes = t("wheel.comment.likes", { n: c.likes }), replies = t("wheel.comment.replies", { n: c.replies });
    // Comments are parted by a hairline; a quoted comment carries its side's tint as a rule instead.
    return <article key={id} data-wheel-comment={id} style={{ minWidth: 0, ...(o.first ? {} : { marginTop: p.space.lg, ...(o.quote ? {} : { paddingTop: p.space.lg, borderTop: hair }) }), ...(o.quote ? { paddingLeft: p.space.md, boxShadow: `inset ${w.rule}px 0 0 ${o.quote}` } : {}) }}>
      {o.op && raw.parents[id] ? <p style={{ ...meta, margin: `0 0 ${p.space.sm}px`, paddingLeft: p.space.sm, boxShadow: `inset ${w.rule}px 0 0 ${p.border}`, overflowWrap: "anywhere" }}>{t("wheel.parent", { author: c.replyTo ?? "", text: raw.parents[id]! })}</p> : null}
      {o.bar ? <div style={{ display: "flex", alignItems: "center", gap: p.space.sm, marginBottom: p.space.xs, ...meta }}><span role="img" aria-label={likes} style={{ ...count, flex: "none" }}><Heart {...icon} />{c.likes}</span><i aria-hidden="true" style={{ display: "block", flex: "none", height: w.rule, minWidth: w.barMin, width: `${(raw.likeRatios[id] ?? 0) * 60}%`, background: sector ? color(sector) : p.borderStrong, borderRadius: p.radius.pill }} /></div> : null}
      <p style={{ ...p.type.body, margin: 0, color: p.ink, overflowWrap: "anywhere", whiteSpace: "pre-wrap", ...(long && !full ? clamp : {}) }}>{c.text}</p>
      <div style={{ ...meta, display: "flex", flexWrap: "wrap", alignItems: "center", gap: `${p.space.xxs}px ${p.space.md}px`, marginTop: p.space.sm, minWidth: 0 }}>
        {c.href ? <a href={c.href} target="_blank" rel="noopener noreferrer" aria-label={`${t("blocks.action.evidence")} @${c.author}`} style={{ color: p.ink2, textDecoration: "none", fontWeight: p.type.heading.fontWeight, overflowWrap: "anywhere", minWidth: 0 }}>@{c.author}</a> : <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>@{c.author}</span>}
        {!o.bar && c.likes > 0 ? <span role="img" aria-label={likes} style={count}><Heart {...icon} />{c.likes}</span> : null}
        {c.replies > 0 ? <span role="img" aria-label={replies} style={count}><MessageCircle {...icon} />{c.replies}</span> : null}
        {c.replyTo && !o.op ? <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{t("wheel.replyto", { author: c.replyTo })}</span> : null}
        {c.qa ? <span style={{ color: c.qa.startsWith("answered") ? p.success : p.warning }}>{t(`wheel.status.${c.qa}`)}</span> : null}
        {o.noise && c.noiseFlag ? <span>{t(`blocks.noise.flag.${c.noiseFlag}`) || t("blocks.noise.flag.other")}</span> : null}
        {o.tag && sector && model.sectors.length > 1 ? <span style={{ display: "inline-flex", alignItems: "center", gap: p.space.xs, minWidth: 0 }}><i aria-hidden="true" style={dot(color(sector))} /><span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{name(sector, t)}</span></span> : null}
        {long ? <button type="button" data-wheel-expand={id} aria-expanded={full} style={link} onClick={() => toggle(`text:${id}`)}>{t(full ? "wheel.less" : "wheel.expand")}{chevron(full)}</button> : null}
        {o.open && c.href ? <a href={c.href} target="_blank" rel="noopener noreferrer" data-wheel-open="" style={{ ...link, marginLeft: "auto" }}>{t("wheel.open")}<ArrowUpRight {...icon} /></a> : null}
      </div>
    </article>;
  };
  const list = (ids: string[], key: string, first: number, o: Parameters<typeof comment>[1] = {}) => {
    const rows = fresh(ids), all = open.has(key);
    return <>{(all ? rows : rows.slice(0, first)).map((id, i) => comment(id, { ...o, first: i === 0 }))}
      {rows.length > first ? <button type="button" data-wheel-more={key} aria-expanded={all} style={{ ...link, ...p.type.bodySm, justifyContent: "center", width: "100%", marginTop: p.space.lg, paddingTop: p.space.md, borderTop: hair }} onClick={() => toggle(key)}>{all ? t("wheel.less") : t("wheel.more", { n: rows.length - first })}{chevron(all)}</button> : null}</>;
  };
  const ai = <span data-wheel-ai="" style={{ ...p.type.micro, fontWeight: 600, color: p.ink3, display: "inline-flex", alignItems: "center", gap: p.space.xxs, marginRight: p.space.sm, verticalAlign: "baseline" }}><Sparkles {...icon} size={p.type.micro.fontSize} />{t("wheel.ai")}</span>;
  const find = <K extends ReaderWheelModel["observations"][number]["key"]>(key: K) => model.observations.find((o): o is Extract<ReaderWheelModel["observations"][number], { key: K }> => o.key === key);

  const overview = () => {
    const view = readerOverview(model, topic); if (!view) return null;
    const { sector, subject } = view, share = pct(subject.share);
    const head = view.state === "single" ? t("wheel.head.single", { n: model.audience.length })
      : t(`wheel.head.${view.state}${view.subjectLikes === null ? ".plain" : ""}`, { share, likes: pct(view.subjectLikes ?? 0) });
    const stats = sector.likeTotal === null ? "" : model.totals && model.totals.likes !== null
      ? t("wheel.stats.verified", { n: sector.count, total: model.totals.comments, likes: sector.likeTotal, likesTotal: model.totals.likes })
      : t("wheel.stats", { n: sector.count, likes: sector.likeTotal });
    const facts = [stats, sector.noise ? t("wheel.noise.count", { n: sector.noise }) : ""].filter(Boolean).join(" · ");
    const badges = [view.liked ? "liked" : "", view.discussed ? "discussed" : ""].filter(Boolean);
    return <>
      <div data-wheel-kicker="" title={t("wheel.counted")} style={{ ...p.type.meta, display: "flex", alignItems: "center", gap: p.space.xs, color: p.ink }}>
        <i aria-hidden="true" style={dot(color(subject))} /><b style={{ fontWeight: 600 }}>{t(`wheel.state.${view.state}`)}</b>
      </div>
      <h2 data-wheel-headline="" style={{ ...p.type.display, margin: `${p.space.xs}px 0 0`, color: p.ink, overflowWrap: "anywhere", textWrap: "pretty" }}>{head}</h2>
      {model.headline ? <p data-wheel-gist="" style={{ ...p.type.body, color: p.ink2, margin: `${p.space.sm}px 0 0`, overflowWrap: "anywhere", textWrap: "pretty" }}>{ai}{model.headline.text}{model.headline.grounded ? null : <small style={{ ...p.type.micro, color: p.ink3 }}> · {t("wheel.ungrounded")}</small>}</p> : null}
      <figure data-wheel-plot="" style={{ maxWidth: w.plotMaxWidth, margin: `${p.space.md}px auto 0` }}>
        <div style={{ position: "relative" }}>
          {/* Every sector stays inside the drawing at its largest and when pulled out; only the chosen sector's soft glow may fall past it. */}
          <svg viewBox={`0 0 ${w.width} ${w.height}`} aria-label={t("wheel.wheel.label")} style={{ display: "block", width: "100%", overflow: "visible" }}>
            <circle cx={w.cx} cy={w.cy} r={w.rmax} fill="none" stroke={p.border} strokeWidth={w.hairline} />
            {wheelGeometry(model.sectors, w).map(g => { const s = model.sectors.find(x => x.key === g.key)!, on = sector.key === g.key, offset = wheelOffset(g.midAngle, on ? w.shift : 0);
              // Mouse presses do not take focus, so a click never leaves a focus box; keyboard focus outlines the sector itself.
              return <g key={g.key} data-wheel-sector={g.key} role="button" tabIndex={0} aria-pressed={on} aria-label={t("wheel.sector.label", { name: name(s, t), share: pct(s.share), likes: pct(s.likeShare) })} onClick={() => setTopic(g.key)} onMouseDown={event => event.preventDefault()} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setTopic(g.key); } }}
                style={{ cursor: "pointer", opacity: on ? w.fullOpacity : w.dimOpacity, transform: `translate(${offset.x}px, ${offset.y}px)`, filter: on ? `drop-shadow(0 ${w.glow.y}px ${w.glow.blur}px ${tint(color(s), w.glow.alpha)})` : undefined }}>
                <path d={g.d} fill={color(s)} stroke={color(s)} strokeWidth={w.sectorStroke} strokeLinejoin="round" /></g>; })}
          </svg>
          {/* The centre always reads the same measure: the chosen topic's share of comments. */}
          <div data-wheel-hub="" data-bounded="" aria-live="polite" aria-atomic="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none", textAlign: "center", whiteSpace: "nowrap" }}><div data-wheel-swap="" key={sector.key}><div style={{ ...w.hubType, color: p.ink }}>{t("wheel.percent", { n: pct(sector.share) })}</div><div style={{ ...p.type.micro, color: p.ink3 }}>{t("wheel.hub.comments")}</div></div></div>
        </div>
        <figcaption style={{ ...p.type.micro, color: p.ink3, textAlign: "center", marginTop: p.space.sm }}>{t("wheel.legend")}</figcaption>
      </figure>
      {model.sectors.length > 1 ? <div data-wheel-pills="" role="group" aria-label={t("wheel.topic")} style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `${p.space.xs}px ${p.space.xl}px`, marginTop: p.space.lg }}>
        {model.sectors.map(s => { const on = s.key === sector.key; return <button key={s.key} type="button" data-wheel-pill={s.key} aria-pressed={on} onClick={() => setTopic(s.key)} style={{ ...word(on, p.type.bodySm, color(s)), display: "inline-flex", alignItems: "center", gap: p.space.xs, minWidth: 0, maxWidth: "100%" }}><i aria-hidden="true" style={dot(color(s))} /><span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{name(s, t)}</span></button>; })}
      </div> : null}
      <section data-wheel-evidence="" data-wheel-swap="" key={sector.key} style={block}>
        {facts || badges.length ? <div style={{ ...meta, display: "flex", flexWrap: "wrap", alignItems: "center", gap: `${p.space.xxs}px ${p.space.md}px`, marginBottom: p.space.sm }}>
          {facts ? <span>{facts}</span> : null}{badges.map(key => <b key={key} data-wheel-badge={key} style={{ fontWeight: 600, color: p.ink2 }}>{t(`wheel.badge.${key}`)}</b>)}
        </div> : null}
        {view.members[0] ? comment(view.members[0], { first: true, open: true }) : null}
        {view.members.length > 1 ? <button type="button" data-wheel-through={sector.key} onClick={() => { jump.current = true; setFilter(model.sectors.length > 1 ? `topic:${sector.key}` : "all"); setTab("raw"); }} style={{ ...link, ...p.type.bodySm, color: p.ink, fontWeight: 600, justifyContent: "space-between", width: "100%", marginTop: p.space.lg, paddingTop: p.space.md, borderTop: hair }}><span>{t("wheel.through", { n: view.members.length })}</span><ArrowRight {...icon} size={p.size.icon} /></button> : null}
      </section>
    </>;
  };

  /** 分歧: the two claims sit next to each other in large type, parted by a hairline; the chosen side draws its rule across and its comments take the full width below. */
  const split = () => {
    const o = find("split"); if (!o) return null;
    const at = Math.min(side, o.sides.length - 1);
    return <>
      <div style={meta}>{ai}{t("wheel.split.kicker")}</div>
      {o.agree ? <p style={{ ...p.type.body, color: p.ink2, margin: `${p.space.sm}px 0 0`, overflowWrap: "anywhere" }}>{t("wheel.split.agree", { text: o.agree })}</p> : null}
      <div data-wheel-sides="" role="group" aria-label={t("wheel.split")} style={{ display: "grid", gridTemplateColumns: w.sideColumns, marginTop: p.space.lg }}>
        {o.sides.map((s, i) => { const on = i === at; return <button key={i} type="button" data-wheel-side={i} aria-pressed={on} onClick={() => setSide(i)} style={{ ...plain, display: "grid", alignContent: "start", gap: p.space.xs, minWidth: 0, padding: i ? `0 0 0 ${p.space.md}px` : `0 ${p.space.md}px 0 0`, boxShadow: i ? `inset ${w.hairline}px 0 0 ${p.border}` : undefined, color: on ? p.ink2 : p.ink3 }}>
          <i data-wheel-rule="" aria-hidden="true" style={{ display: "block", height: w.rule, borderRadius: w.rule, background: SIDES[i % SIDES.length], marginBottom: p.space.xs, transformOrigin: "left", transform: on ? "none" : `scaleX(${w.ruleRest})` }} />
          <span style={{ ...p.type.heading, color: on ? p.ink : p.ink3, overflowWrap: "anywhere" }}>{s.claim}</span>
          {s.why ? <span style={{ ...p.type.body, overflowWrap: "anywhere" }}>{s.why}</span> : null}
          <span style={p.type.meta}>{t("wheel.side.count", { n: s.refs.length })}</span>
        </button>; })}
      </div>
      <section data-wheel-evidence="" data-wheel-swap="" key={at} style={{ marginTop: p.space.xl, minWidth: 0 }}>{fresh(o.sides[at].refs).map((id, i) => comment(id, { first: i === 0, open: true, quote: `color-mix(in oklch, ${SIDES[at % SIDES.length]} ${w.sideTint}%, ${p.surface})` }))}</section>
    </>;
  };

  const how = () => {
    const o = find("how"); if (!o) return null;
    return <>
      <h2 style={title}>{ai}{t("wheel.how.head", { n: o.methods.length })}</h2>
      {o.methods.map((x, i) => { const [lead, ...rest] = fresh(x.refs), more = open.has(`how:${i}`);
        return <section key={i} data-wheel-method={i} style={block}>
          <h3 style={heading}>{x.name}</h3>
          {x.fit ? <p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xxs}px 0 0`, overflowWrap: "anywhere" }}>{t("wheel.fit", { text: x.fit })}</p> : null}
          {lead ? <div style={{ marginTop: p.space.sm }}>{comment(lead, { first: true, open: true })}</div> : null}
          {more ? rest.map(id => comment(id)) : null}
          {rest.length ? <button type="button" data-wheel-more={`how:${i}`} aria-expanded={more} style={{ ...link, marginTop: p.space.md, fontWeight: 600 }} onClick={() => toggle(`how:${i}`)}>{more ? t("wheel.less") : t("wheel.how.also", { n: rest.length })}{chevron(more)}</button> : null}
        </section>; })}
    </>;
  };

  const qa = () => {
    const o = find("qa"); if (!o) return null;
    return <>
      <h2 style={title}>{t("wheel.qa.sentence", { n: o.total, open: o.unanswered ? t("wheel.qa.open", { n: o.unanswered }) : t("wheel.qa.all") }) + (o.unseen ? t("wheel.qa.unseen", { n: o.unseen }) : "")}</h2>
      {o.items.map((q, i) => { const asked = q.id ? comment(q.id, { first: true, open: true, tag: true }) : <div><p style={{ ...p.type.body, margin: 0, overflowWrap: "anywhere" }}>{q.question.text}</p><span style={meta}>{t(`wheel.status.${q.status}`)}</span></div>;
        const answers = fresh(q.answers);
        return asked || answers.length ? <section key={i} data-wheel-question={i} style={block}>{asked}
          {answers.map(id => <div key={id} style={{ marginTop: p.space.md }}>{comment(id, { first: true, quote: p.border })}</div>)}</section> : null; })}
    </>;
  };

  const links = () => {
    const o = find("link"); if (!o) return null;
    return <><Links model={model} rows={o.entities} onCopy={onCopy} copyStatus={copyStatus} t={t} /><div style={block}>{list(o.refs, "link", w.firstLink, { tag: true })}</div></>;
  };

  const comments = () => <>
    {tabs.length === 1 ? <p style={{ ...meta, margin: `0 0 ${p.space.md}px` }}>{t("wheel.empty")}</p> : null}
    <Strip anchor={raw.filter} data-wheel-chips="" role="group" aria-label={t("wheel.raw")} style={{ gap: p.space.xl }}>
      {raw.chips.map(chip => { const on = raw.filter === chip.key; return <button key={chip.key} type="button" data-wheel-raw={chip.key} aria-pressed={on} onClick={() => setFilter(chip.key)} style={{ ...word(on, p.type.bodySm, chip.sector ? color(chip.sector) : p.ink), flex: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: p.space.xs }}>
        {chip.sector ? <><i aria-hidden="true" style={dot(color(chip.sector))} />{name(chip.sector, t)}</> : t(`wheel.raw.${chip.key}`)}{chip.sector && !chip.sector.aiName ? null : <small style={{ ...p.type.micro, fontWeight: 400, color: p.ink3 }}>{chip.n}</small>}</button>; })}
    </Strip>
    <div data-wheel-rawpane="" data-wheel-swap="" key={raw.filter} style={{ marginTop: p.space.lg, minWidth: 0 }}>
      {raw.filter === "link" ? <><Links model={model} rows={model.raw.links ?? []} onCopy={onCopy} copyStatus={copyStatus} t={t} /><div style={block}>{fresh(raw.ids).map((id, i) => comment(id, { first: i === 0 }))}</div></>
        : list(raw.ids, `raw:${raw.filter}`, w.firstRaw, { bar: raw.filter !== "op", op: raw.filter === "op", noise: raw.filter === "noise", tag: raw.filter === "all" })}
    </div>
  </>;

  const panes: Record<ReaderTabKey, () => ReactNode> = { overview, split, how, qa, link: links, raw: comments };
  // A little light behind the top of the sheet, in the post's own topic colours; the clear bar lets it through.
  const glow = model.sectors.length ? w.haze.spots.map((spot, i) => `radial-gradient(${spot}, ${tint(color(model.sectors[[1, 0, 2][i] % model.sectors.length]), w.haze.alpha)}, transparent ${w.haze.fade}%)`).join(", ") : undefined;
  return <Tabs ref={root} data-reader-wheel="" value={tab} onValueChange={(value, details) => { if (value && details.reason !== "item-removed") setTab(value); }} style={{ ...sheet, backgroundImage: glow, fontFamily: tokens.font.sans, color: p.ink, fontVariantNumeric: "tabular-nums", scrollMarginTop: p.size.header + p.size.banner }}>
    <style>{css}</style>
    {full.postType || full.ai ? <div style={{ ...meta, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: `${p.space.xs}px ${p.space.md}px`, marginBottom: p.space.xs }}>
      {full.postType ? <span data-post-type={full.postType} aria-label={`${t("blocks.post_type.label")}：${t(`blocks.post_type.${full.postType}`)}`}>{t(`blocks.post_type.${full.postType}`)}</span> : <span />}
      {/* 純統計 removes every AI-written part; the switch exists only when there is AI text to remove. */}
      {full.ai ? <div role="group" aria-label={t("wheel.mode.label")} style={{ display: "inline-flex", gap: p.space.md }}>{[false, true].map(value => <button key={String(value)} type="button" data-wheel-mode={value ? "counted" : "all"} aria-pressed={counted === value} onClick={() => setCounted(value)} style={word(counted === value, p.type.meta)}>{t(value ? "wheel.mode.counted" : "wheel.mode.all")}</button>)}</div> : null}
    </div> : null}
    {/* The entries stay within reach while a long list scrolls under them. Arrow keys move between them. */}
    <div data-wheel-bar="" style={{ position: "sticky", top: "var(--dlens-sticky-top, 0px)", zIndex: 1, margin: `0 -${p.space.lg}px`, padding: `0 ${p.space.lg}px`, boxShadow: `inset 0 -${w.hairline}px 0 ${p.border}` }}>
      <i data-wheel-glass="" aria-hidden="true" style={glass} />
      <Strip anchor={tab}>
        <TabsList data-wheel-tabs="" aria-label={t("wheel.tabs.label")} style={{ position: "relative", display: "flex", flex: "none", gap: p.space.xl }}>
          {tabs.map(x => <TabsTab key={x.key} value={x.key} data-wheel-tab={x.key} style={{ ...word(x.key === tab, p.type.body), flex: "none", whiteSpace: "nowrap", padding: `${p.space.sm}px 0 ${p.space.md}px` }}>
            {t(`wheel.${x.key}`)}{x.count !== null ? <small style={{ ...p.type.micro, fontWeight: 400, color: p.ink3, marginLeft: p.space.xxs, verticalAlign: "top" }}>{x.count}</small> : null}
          </TabsTab>)}
          <TabsIndicator data-wheel-ink="" style={{ position: "absolute", left: 0, bottom: 0, width: "var(--active-tab-width)", height: w.rule, borderRadius: w.rule, background: p.ink, transform: "translateX(var(--active-tab-left))" }} />
        </TabsList>
      </Strip>
    </div>
    {tabs.map(x => <TabsPanel key={x.key} value={x.key} data-wheel-pane={x.key} data-wheel-arriving={settled === x.key ? undefined : ""} style={{ marginTop: p.space.xl, minWidth: 0 }}>{x.key === tab ? panes[tab]() : null}</TabsPanel>)}
  </Tabs>;
}
