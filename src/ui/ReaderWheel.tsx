import { useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { readerOverview, readerRaw, readerTabs, wheelEntityDescription, wheelGeometry, wheelOffset, withoutAi, type ReaderRawKey, type ReaderTabKey, type ReaderWheelModel, type WheelSector } from "../viewmodel/reader-wheel";
import { ENTITY_SORTS, entityCsv, entityMarkdown, sortEntityRows, type EntityExportLabels, type EntityRow, type EntitySort } from "../viewmodel/analysis-blocks";
import { PostTypeTag } from "./AnalysisBlocks";
import { useBlockText } from "./i18n";
import { tokens } from "./tokens";

const p = tokens.panel, w = p.wheel;
type Text = ReturnType<typeof useBlockText>;
const meta: CSSProperties = { ...p.type.meta, color: p.ink3 };
const button: CSSProperties = { ...p.type.bodySm, fontFamily: tokens.font.sans, color: p.ink2, background: p.surfaceSubtle, border: 0, borderRadius: p.radius.md, minHeight: p.size.button, padding: `${p.space.xs}px ${p.space.md}px`, cursor: "pointer" };
/** The whole reading sits on one white sheet; cards inside it are tinted, never white on white. */
const sheet: CSSProperties = { marginTop: p.space.lg, padding: p.space.md, borderRadius: p.radius.lg, background: p.surface, boxShadow: p.shadow.card, minWidth: 0 };
const card: CSSProperties = { padding: p.space.md, borderRadius: p.radius.md, background: p.surfaceSubtle, minWidth: 0 };
const pane: CSSProperties = { padding: p.space.md, borderRadius: p.radius.md, background: p.surface, boxShadow: p.shadow.popover, minWidth: 0 };
const title: CSSProperties = { ...p.type.title, margin: 0, color: p.ink, overflowWrap: "anywhere" };
const heading: CSSProperties = { ...p.type.heading, margin: 0, color: p.ink, overflowWrap: "anywhere" };
const link: CSSProperties = { ...p.type.meta, fontFamily: tokens.font.sans, color: p.accent, background: "transparent", border: 0, padding: 0, cursor: "pointer", textDecoration: "none" };
const track: CSSProperties = { display: "inline-flex", gap: p.space.xxs, padding: p.space.xxs, borderRadius: p.radius.md, background: p.surfaceSunken, minWidth: 0, maxWidth: "100%", boxSizing: "border-box" };
const segment = (on: boolean, type: CSSProperties): CSSProperties => ({ ...type, fontFamily: tokens.font.sans, border: 0, cursor: "pointer", padding: `${p.space.xs}px ${p.space.md}px`, borderRadius: p.radius.sm, minHeight: p.size.buttonSm,
  background: on ? p.surface : "transparent", color: on ? p.ink : p.ink3, fontWeight: on ? 600 : 500, boxShadow: on ? p.shadow.card : undefined });
const clamp: CSSProperties = { display: "-webkit-box", WebkitLineClamp: w.clampLines, WebkitBoxOrient: "vertical", overflow: "hidden" };
const dot = (background: string): CSSProperties => ({ flex: "none", width: p.size.modeDot, height: p.size.modeDot, borderRadius: p.radius.pill, background });
/** 分歧's two sides: one cool, one warm, so neither reads as the default. */
const SIDES = [{ solid: p.accent, soft: p.accentSoft, ink: p.accentInk }, { solid: p.warning, soft: p.warningSoft, ink: p.warning }];
const pct = (n: number) => Math.round(n * 100);
const color = (s: WheelSector) => p.data[s.rank % p.data.length];
const name = (s: WheelSector, t: Text) => s.aiName || t("wheel.similar", { n: s.count });
const css = `@media (prefers-reduced-motion: no-preference) { [data-reader-wheel] [data-wheel-sector] { transition: transform ${p.motion.slow} ${p.motion.standard}, opacity ${p.motion.base} ${p.motion.standard}; } }
[data-reader-wheel] [data-wheel-sector] { outline: none; }
[data-reader-wheel] [data-wheel-sector]:focus-visible path { stroke: ${p.ink}; }
[data-reader-wheel] [data-scroll-x]::-webkit-scrollbar { display: none; }
[data-reader-wheel] button:focus-visible, [data-reader-wheel] a:focus-visible { box-shadow: ${p.focusRing}; }`;

/** Entity descriptions stay distinct from captured quotes; comment rows below own all source text. */
function Links({ model, rows, onCopy, copyStatus, t }: { model: ReaderWheelModel; rows: EntityRow[]; onCopy?: (text: string) => void; copyStatus?: string; t: Text }) {
  const [sort, setSort] = useState<EntitySort>("mentions");
  const [exported, setExported] = useState<string | null>(null);
  const labels: EntityExportLabels = { mentions: t("blocks.export.mentions"), likes: t("blocks.export.likes"), by: t("blocks.entity.by"), columns: t("blocks.export.columns").split(",") as EntityExportLabels["columns"] };
  const run = (format: "markdown" | "csv") => { onCopy?.(format === "markdown" ? entityMarkdown(rows, t("wheel.link"), labels) : entityCsv(rows, labels)); setExported(format); };
  return <>
    <div style={{ display: "flex", justifyContent: "space-between", gap: p.space.sm }}><h2 style={title}>{t("wheel.link")}</h2>
      <details data-block-menu="" style={{ position: "relative" }}><summary style={{ ...button, listStyle: "none" }} aria-label={t("blocks.menu.label")}>{t("blocks.menu.label")}</summary>
        <div style={{ ...pane, position: "absolute", right: 0, width: w.menuWidth, zIndex: 1, display: "grid", gap: p.space.xs }}>
          {ENTITY_SORTS.map(key => <button key={key} type="button" data-block-entity-sort={key} aria-pressed={sort === key} onClick={() => setSort(key)} style={button}>{t(`blocks.sort.${key}`)}</button>)}
          {(["markdown", "csv"] as const).map(format => <button key={format} type="button" data-block-export={format} style={button} onClick={() => run(format)}>{t(`blocks.action.export_${format}`)}</button>)}
        </div>
      </details></div>
    {exported ? <p data-block-export-status="" role="status" style={meta}>{t("blocks.export.sent", { format: exported === "csv" ? "CSV" : "Markdown", n: rows.length })}{copyStatus ? ` · ${copyStatus}` : ""}</p> : null}
    {sortEntityRows(rows, sort).map(row => <div key={row.key} data-block-entity={row.key} style={{ marginTop: p.space.md }}>
      {row.href ? <a href={row.href} target="_blank" rel="noopener noreferrer" style={{ ...p.type.heading, color: p.accent, textDecoration: "none" }}>{row.name}</a> : <b>{row.name}</b>}
      {wheelEntityDescription(model, row) ? <p style={{ ...p.type.bodySm, margin: `${p.space.xs}px 0` }}>{wheelEntityDescription(model, row)}</p> : null}
      <div style={meta}>{t(row.mentions === 0 && row.inPost ? "blocks.entity.in_post" : "blocks.entity.mentions", { n: row.mentions })}{row.site ? ` · ${row.site}` : ""}{row.byOp ? ` · ${t("blocks.entity.by_op")}` : ""}{row.likes ? ` · ${t("blocks.entity.likes", { n: row.likes })}` : ""}{row.recommenders.length ? ` · ${t("blocks.entity.by")} ${row.recommenders.map(author => `@${author}`).join(t("wheel.list.separator"))}` : ""}{row.repo ? ` · ${row.repo.stars ? t("blocks.entity.stars", { n: row.repo.stars }) : ""} ${row.repo.language}${row.repo.archived ? ` · ${t("blocks.entity.archived")}` : ""}${row.repo.pushed ? ` · ${t("blocks.entity.pushed", { date: row.repo.pushed })}` : ""}` : ""}</div>
    </div>)}
    {!sortEntityRows(rows, sort).length ? <p style={meta}>{t("blocks.entity.github_empty")}</p> : null}
  </>;
}

/** A one-line strip that scrolls sideways when it must: the chosen item is kept in view, and a fade shows only while more lies to the right. */
function Strip({ anchor, style, children, ...rest }: { anchor: string } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measure = () => { const box = ref.current; if (box) setMore(box.scrollLeft + box.clientWidth < box.scrollWidth - 1); };
  useEffect(() => {
    const box = ref.current, on = box?.querySelector<HTMLElement>('[aria-selected="true"], [aria-pressed="true"]');
    if (box && on) box.scrollLeft = Math.max(Math.min(box.scrollLeft, on.offsetLeft), on.offsetLeft + on.offsetWidth - box.clientWidth);
  }, [anchor]);
  useEffect(() => { measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); });
  return <div ref={ref} data-scroll-x="" onScroll={measure} style={{ ...style, display: "flex", position: "relative", overflowX: "auto", scrollbarWidth: "none", ...(more ? { maskImage: p.scrollMask, WebkitMaskImage: p.scrollMask } : {}) }} {...rest}>{children}</div>;
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
  // A link that lands on another entry brings the sheet's top back into view.
  useEffect(() => { if (jump.current) { jump.current = false; root.current?.scrollIntoView?.({ block: "start" }); } }, [tab, filter]);
  const raw = readerRaw(model, filter);
  // One comment is drawn once per entry, wherever it is cited first.
  const seen = new Set<string>();
  const fresh = (ids: string[]) => ids.filter((id, i) => model.comments[id] && !seen.has(id) && ids.indexOf(id) === i);
  const comment = (id: string, o: { first?: boolean; bar?: boolean; op?: boolean; open?: boolean; tag?: boolean; noise?: boolean } = {}) => {
    const c = model.comments[id]; if (!c || seen.has(id)) return null;
    seen.add(id);
    const sector = model.sectors.find(s => s.key === c.sector), full = open.has(`text:${id}`);
    // Only a long comment is cut, and a cut comment can always be opened in place.
    const long = c.text.length > w.clampChars || c.text.split("\n").length > w.clampLines;
    return <article key={id} data-wheel-comment={id} style={{ minWidth: 0, ...(o.first ? {} : { marginTop: p.space.md, paddingTop: p.space.md, borderTop: `${w.hairline}px solid ${p.border}` }) }}>
      {o.op && raw.parents[id] ? <p style={{ ...meta, margin: `0 0 ${p.space.sm}px`, padding: p.space.sm, borderRadius: p.radius.sm, background: p.surfaceSubtle, overflowWrap: "anywhere" }}>{t("wheel.parent", { author: c.replyTo ?? "", text: raw.parents[id]! })}</p> : null}
      {o.bar ? <div style={{ display: "flex", alignItems: "center", gap: p.space.sm, marginBottom: p.space.xs, ...meta }}><span style={{ flex: "none" }}>{t("wheel.comment.likes", { n: c.likes })}</span><i aria-hidden="true" style={{ display: "block", flex: "none", height: w.barHeight, minWidth: w.barMin, width: `${(raw.likeRatios[id] ?? 0) * 60}%`, background: sector ? color(sector) : p.dataRest, borderRadius: p.radius.pill }} /></div> : null}
      <p style={{ ...p.type.body, margin: 0, color: p.ink, overflowWrap: "anywhere", whiteSpace: "pre-wrap", ...(long && !full ? clamp : {}) }}>{c.text}</p>
      <div style={{ ...meta, display: "flex", flexWrap: "wrap", alignItems: "center", gap: `${p.space.xxs}px ${p.space.sm}px`, marginTop: p.space.xs, minWidth: 0 }}>
        {c.href ? <a href={c.href} target="_blank" rel="noopener noreferrer" aria-label={`${t("blocks.action.evidence")} @${c.author}`} style={{ color: p.ink2, textDecoration: "none", fontWeight: p.type.heading.fontWeight, overflowWrap: "anywhere", minWidth: 0 }}>@{c.author}</a> : <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>@{c.author}</span>}
        {!o.bar && c.likes > 0 ? <span>{t("wheel.comment.likes", { n: c.likes })}</span> : null}
        {c.replies > 0 ? <span>{t("wheel.comment.replies", { n: c.replies })}</span> : null}
        {c.replyTo && !o.op ? <span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{t("wheel.replyto", { author: c.replyTo })}</span> : null}
        {c.qa ? <span style={{ color: c.qa.startsWith("answered") ? p.success : p.warning }}>{t(`wheel.status.${c.qa}`)}</span> : null}
        {o.noise && c.noiseFlag ? <span>{t(`blocks.noise.flag.${c.noiseFlag}`) || t("blocks.noise.flag.other")}</span> : null}
        {o.tag && sector && model.sectors.length > 1 ? <span style={{ display: "inline-flex", alignItems: "center", gap: p.space.xs, minWidth: 0 }}><i aria-hidden="true" style={dot(color(sector))} /><span style={{ overflowWrap: "anywhere", minWidth: 0 }}>{name(sector, t)}</span></span> : null}
        {long ? <button type="button" data-wheel-expand={id} aria-expanded={full} style={link} onClick={() => toggle(`text:${id}`)}>{t(full ? "wheel.less" : "wheel.expand")}</button> : null}
        {o.open && c.href ? <a href={c.href} target="_blank" rel="noopener noreferrer" data-wheel-open="" style={{ ...link, marginLeft: "auto" }}>{t("wheel.open")} ↗</a> : null}
      </div>
    </article>;
  };
  const list = (ids: string[], key: string, first: number, o: Parameters<typeof comment>[1] = {}) => {
    const rows = fresh(ids), all = open.has(key);
    return <>{(all ? rows : rows.slice(0, first)).map((id, i) => comment(id, { ...o, first: i === 0 }))}
      {rows.length > first ? <button type="button" data-wheel-more={key} aria-expanded={all} style={{ ...button, marginTop: p.space.md, width: "100%" }} onClick={() => toggle(key)}>{all ? t("wheel.less") : t("wheel.more", { n: rows.length - first })}</button> : null}</>;
  };
  const ai = <span style={{ ...p.type.micro, fontWeight: 600, color: p.ink3, background: p.surfaceSunken, borderRadius: p.radius.xs, padding: `0 ${p.space.xs}px`, marginRight: p.space.sm }}>{t("wheel.ai")}</span>;
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
      <div data-wheel-kicker="" style={{ ...p.type.meta, display: "flex", flexWrap: "wrap", alignItems: "center", gap: `0 ${p.space.xs}px`, color: p.ink }}>
        <i aria-hidden="true" style={dot(color(subject))} /><b style={{ fontWeight: 600 }}>{t(`wheel.state.${view.state}`)}</b><span style={{ marginLeft: "auto", color: p.ink3 }}>{t("wheel.counted")}</span>
      </div>
      <h2 data-wheel-headline="" style={{ ...title, marginTop: p.space.xs }}>{head}</h2>
      {model.headline ? <p data-wheel-gist="" style={{ ...p.type.body, color: p.ink2, margin: `${p.space.sm}px 0 0`, overflowWrap: "anywhere" }}>{ai}{model.headline.text}{model.headline.grounded ? null : <small style={{ ...p.type.micro, color: p.ink3 }}> · {t("wheel.ungrounded")}</small>}</p> : null}
      <figure data-wheel-plot="" style={{ maxWidth: w.plotMaxWidth, margin: `${p.space.sm}px auto 0` }}>
        <div style={{ position: "relative" }}>
          {/* Every sector stays inside the drawing at its largest and when pulled out, so nothing is cut or spills. */}
          <svg viewBox={`0 0 ${w.width} ${w.height}`} aria-label={t("wheel.wheel.label")} style={{ display: "block", width: "100%", overflow: "hidden" }}>
            <circle cx={w.cx} cy={w.cy} r={w.rmin} fill="none" stroke={p.border} strokeWidth={w.hairline} />
            {wheelGeometry(model.sectors, w).map(g => { const s = model.sectors.find(x => x.key === g.key)!, on = sector.key === g.key, offset = wheelOffset(g.midAngle, on ? w.shift : 0);
              // Mouse presses do not take focus, so a click never leaves a focus box; keyboard focus outlines the sector itself.
              return <g key={g.key} data-wheel-sector={g.key} role="button" tabIndex={0} aria-pressed={on} aria-label={t("wheel.sector.label", { name: name(s, t), share: pct(s.share), likes: pct(s.likeShare) })} onClick={() => setTopic(g.key)} onMouseDown={event => event.preventDefault()} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setTopic(g.key); } }} style={{ cursor: "pointer", opacity: on ? w.fullOpacity : w.dimOpacity, transform: `translate(${offset.x}px, ${offset.y}px)` }}>
                <path d={g.d} fill={color(s)} stroke={color(s)} strokeWidth={w.sectorStroke} strokeLinejoin="round" /></g>; })}
            <circle cx={w.cx} cy={w.cy} r={w.hubRadius} fill={p.surface} style={{ pointerEvents: "none", filter: `drop-shadow(0 ${p.space.xxs}px ${p.space.xs}px ${p.borderStrong})` }} />
          </svg>
          {/* The centre always reads the same measure: the chosen topic's share of comments. */}
          <div data-wheel-hub="" data-bounded="" aria-live="polite" aria-atomic="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none", textAlign: "center", whiteSpace: "nowrap" }}><div style={p.type.title}>{t("wheel.percent", { n: pct(sector.share) })}</div><div style={{ ...p.type.micro, color: p.ink3 }}>{t("wheel.hub.comments")}</div></div>
        </div>
        <figcaption style={{ ...p.type.micro, color: p.ink3, textAlign: "center", marginTop: p.space.xs }}>{t("wheel.legend")}</figcaption>
      </figure>
      {model.sectors.length > 1 ? <div data-wheel-pills="" role="group" aria-label={t("wheel.topic")} style={{ display: "flex", flexWrap: "wrap", gap: p.space.xs, marginTop: p.space.md }}>
        {model.sectors.map(s => { const on = s.key === sector.key; return <button key={s.key} type="button" data-wheel-pill={s.key} aria-pressed={on} onClick={() => setTopic(s.key)} style={{ ...button, ...p.type.meta, flex: "1 1 auto", minWidth: 0, maxWidth: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: p.space.xs, textAlign: "left", background: on ? p.ink : p.surfaceSubtle, color: on ? p.surface : p.ink2 }}><i aria-hidden="true" style={dot(color(s))} /><span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{name(s, t)}</span></button>; })}
      </div> : null}
      <section data-wheel-evidence="" style={{ ...card, marginTop: p.space.sm }}>
        {facts || badges.length ? <div style={{ ...meta, display: "flex", flexWrap: "wrap", alignItems: "center", gap: `${p.space.xxs}px ${p.space.sm}px`, marginBottom: p.space.sm }}>
          {facts ? <span>{facts}</span> : null}{badges.map(key => <span key={key} data-wheel-badge={key} style={{ ...p.type.micro, fontWeight: 600, color: p.ink, background: p.surface, boxShadow: p.shadow.card, borderRadius: p.radius.xs, padding: `0 ${p.space.xs}px` }}>{t(`wheel.badge.${key}`)}</span>)}
        </div> : null}
        {view.members[0] ? comment(view.members[0], { first: true, open: true }) : null}
        {view.members.length > 1 ? <button type="button" data-wheel-through={sector.key} onClick={() => { jump.current = true; setFilter(model.sectors.length > 1 ? `topic:${sector.key}` : "all"); setTab("raw"); }} style={{ ...link, display: "flex", justifyContent: "space-between", gap: p.space.sm, width: "100%", marginTop: p.space.md, paddingTop: p.space.sm, borderTop: `${w.hairline}px solid ${p.border}`, textAlign: "left", fontWeight: 600 }}><span>{t("wheel.through", { n: view.members.length })}</span><span aria-hidden="true">→</span></button> : null}
      </section>
    </>;
  };

  /** 分歧: the two claims sit next to each other in large type; the chosen side's comments get the full width below. */
  const split = () => {
    const o = find("split"); if (!o) return null;
    const at = Math.min(side, o.sides.length - 1);
    return <>
      <div style={meta}>{ai}{t("wheel.split.kicker")}</div>
      {o.agree ? <p style={{ ...p.type.body, color: p.ink2, margin: `${p.space.sm}px 0 0`, overflowWrap: "anywhere" }}>{t("wheel.split.agree", { text: o.agree })}</p> : null}
      <div data-wheel-sides="" role="group" aria-label={t("wheel.split")} style={{ display: "grid", gridTemplateColumns: w.sideColumns, gap: p.space.sm, marginTop: p.space.md }}>
        {o.sides.map((s, i) => { const tone = SIDES[i % SIDES.length], on = i === at; return <button key={i} type="button" data-wheel-side={i} aria-pressed={on} onClick={() => setSide(i)} style={{ fontFamily: tokens.font.sans, textAlign: "left", border: 0, cursor: "pointer", minWidth: 0, padding: p.space.md, borderRadius: p.radius.md, display: "grid", alignContent: "start", gap: p.space.xs, background: on ? tone.solid : tone.soft, color: on ? p.surface : tone.ink }}>
          <span style={{ ...p.type.heading, overflowWrap: "anywhere" }}>{s.claim}</span>
          {s.why ? <span style={{ ...p.type.body, color: on ? p.surface : p.ink2, overflowWrap: "anywhere" }}>{s.why}</span> : null}
          <span style={p.type.meta}>{t("wheel.side.count", { n: s.refs.length })}</span>
        </button>; })}
      </div>
      <section data-wheel-evidence="" style={{ ...card, marginTop: p.space.sm, boxShadow: `inset 0 ${w.leadBar}px 0 ${SIDES[at % SIDES.length].solid}` }}>{fresh(o.sides[at].refs).map((id, i) => comment(id, { first: i === 0, open: true }))}</section>
    </>;
  };

  const how = () => {
    const o = find("how"); if (!o) return null;
    return <>
      <h2 style={title}>{ai}{t("wheel.how.head", { n: o.methods.length })}</h2>
      {o.methods.map((m, i) => { const [lead, ...rest] = fresh(m.refs), more = open.has(`how:${i}`);
        return <section key={i} data-wheel-method={i} style={{ ...card, marginTop: p.space.sm }}>
          <h3 style={heading}>{m.name}</h3>
          {m.fit ? <p style={{ ...p.type.bodySm, color: p.ink2, margin: `${p.space.xxs}px 0 0`, overflowWrap: "anywhere" }}>{t("wheel.fit", { text: m.fit })}</p> : null}
          {lead ? <div style={{ marginTop: p.space.sm }}>{comment(lead, { first: true, open: true })}</div> : null}
          {more ? rest.map(id => comment(id)) : null}
          {rest.length ? <button type="button" data-wheel-more={`how:${i}`} aria-expanded={more} style={{ ...link, marginTop: p.space.sm, fontWeight: 600 }} onClick={() => toggle(`how:${i}`)}>{more ? t("wheel.less") : t("wheel.how.also", { n: rest.length })}</button> : null}
        </section>; })}
    </>;
  };

  const qa = () => {
    const o = find("qa"); if (!o) return null;
    return <>
      <h2 style={title}>{t("wheel.qa.sentence", { n: o.total, open: o.unanswered ? t("wheel.qa.open", { n: o.unanswered }) : t("wheel.qa.all") }) + (o.unseen ? t("wheel.qa.unseen", { n: o.unseen }) : "")}</h2>
      {o.items.map((q, i) => { const asked = q.id ? comment(q.id, { first: true, open: true, tag: true }) : <div><p style={{ ...p.type.body, margin: 0, overflowWrap: "anywhere" }}>{q.question.text}</p><span style={meta}>{t(`wheel.status.${q.status}`)}</span></div>;
        const answers = fresh(q.answers);
        return asked || answers.length ? <section key={i} data-wheel-question={i} style={{ ...card, marginTop: p.space.sm }}>{asked}
          {answers.map(id => <div key={id} style={{ marginTop: p.space.sm, paddingLeft: p.space.md, borderLeft: `${w.leadBar}px solid ${p.border}` }}>{comment(id, { first: true })}</div>)}</section> : null; })}
    </>;
  };

  const links = () => {
    const o = find("link"); if (!o) return null;
    return <><Links model={model} rows={o.entities} onCopy={onCopy} copyStatus={copyStatus} t={t} /><div style={{ marginTop: p.space.lg }}>{list(o.refs, "link", w.firstLink, { tag: true })}</div></>;
  };

  const comments = () => <>
    {tabs.length === 1 ? <p style={{ ...meta, margin: `0 0 ${p.space.sm}px` }}>{t("wheel.empty")}</p> : null}
    <Strip anchor={raw.filter} data-wheel-chips="" role="group" aria-label={t("wheel.raw")} style={{ gap: p.space.xs, padding: p.space.xxs, margin: -p.space.xxs }}>
      {raw.chips.map(chip => { const on = raw.filter === chip.key; return <button key={chip.key} type="button" data-wheel-raw={chip.key} aria-pressed={on} onClick={() => setFilter(chip.key)} style={{ ...button, ...p.type.meta, borderRadius: p.radius.pill, flex: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: p.space.xs, background: on ? p.ink : p.surfaceSubtle, color: on ? p.surface : p.ink2 }}>
        {chip.sector ? <><i aria-hidden="true" style={dot(color(chip.sector))} />{name(chip.sector, t)}{chip.sector.aiName ? ` ${chip.n}` : ""}</> : `${t(`wheel.raw.${chip.key}`)} ${chip.n}`}</button>; })}
    </Strip>
    <div data-wheel-rawpane="" style={{ marginTop: p.space.md, minWidth: 0 }}>
      {raw.filter === "link" ? <><Links model={model} rows={model.raw.links ?? []} onCopy={onCopy} copyStatus={copyStatus} t={t} /><div style={{ marginTop: p.space.lg }}>{fresh(raw.ids).map((id, i) => comment(id, { first: i === 0 }))}</div></>
        : list(raw.ids, `raw:${raw.filter}`, w.firstRaw, { bar: raw.filter !== "op", op: raw.filter === "op", noise: raw.filter === "noise", tag: raw.filter === "all" })}
    </div>
  </>;

  const panes: Record<ReaderTabKey, () => ReactNode> = { overview, split, how, qa, link: links, raw: comments };
  return <div ref={root} data-reader-wheel="" style={{ ...sheet, fontFamily: tokens.font.sans, color: p.ink, fontVariantNumeric: "tabular-nums", scrollMarginTop: p.size.header + p.size.banner }}>
    <style>{css}</style>
    {full.postType || full.ai ? <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: p.space.sm, marginBottom: p.space.sm }}>
      {full.postType ? <PostTypeTag type={full.postType} /> : null}
      {/* 純統計 removes every AI-written part; the switch exists only when there is AI text to remove. */}
      {full.ai ? <div role="group" aria-label={t("wheel.mode.label")} style={{ ...track, marginLeft: "auto" }}>{[false, true].map(value => <button key={String(value)} type="button" data-wheel-mode={value ? "counted" : "all"} aria-pressed={counted === value} onClick={() => setCounted(value)} style={segment(counted === value, p.type.micro)}>{t(value ? "wheel.mode.counted" : "wheel.mode.all")}</button>)}</div> : null}
    </div> : null}
    <Strip anchor={tab} data-wheel-tabs="" role="tablist" aria-label={t("wheel.tabs.label")} style={track}>
      {tabs.map(x => <button key={x.key} type="button" role="tab" data-wheel-tab={x.key} aria-selected={x.key === tab} onClick={() => setTab(x.key)} style={{ ...segment(x.key === tab, p.type.meta), flex: "1 0 auto", whiteSpace: "nowrap" }}>{t(`wheel.${x.key}`)}{x.count !== null ? <small style={{ ...p.type.micro, marginLeft: p.space.xs }}>{x.count}</small> : null}</button>)}
    </Strip>
    <div data-wheel-pane={tab} role="tabpanel" style={{ marginTop: p.space.lg, minWidth: 0 }}>{panes[tab]()}</div>
  </div>;
}
