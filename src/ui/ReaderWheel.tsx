import { useState, type CSSProperties, type ReactNode } from "react";
import { dotsBySector, wheelEntityDescription, wheelGeometry, wheelOffset, wheelSelection, type ReaderWheelModel, type WheelObservation, type WheelRawKey, type WheelSector } from "../viewmodel/reader-wheel";
import { ENTITY_SORTS, entityCsv, entityMarkdown, sortEntityRows, type EntityExportLabels, type EntityRow, type EntitySort } from "../viewmodel/analysis-blocks";
import { useBlockText } from "./i18n";
import { tokens } from "./tokens";

const p = tokens.panel, w = p.wheel;
type Text = ReturnType<typeof useBlockText>;
const meta: CSSProperties = { ...p.type.meta, color: p.ink3 };
const button: CSSProperties = { ...p.type.bodySm, fontFamily: tokens.font.sans, color: p.ink2, background: p.surfaceSubtle, border: 0, borderRadius: p.radius.md, minHeight: p.size.button, padding: `${p.space.xs}px ${p.space.md}px`, cursor: "pointer" };
const pane: CSSProperties = { padding: p.space.lg, borderRadius: p.radius.lg, background: p.surface, boxShadow: p.shadow.card, minWidth: 0 };
const heading: CSSProperties = { ...p.type.title, margin: 0, color: p.ink };
const pct = (n: number) => Math.round(n * 100);
const color = (s: WheelSector) => p.data[s.rank % p.data.length];
const name = (s: WheelSector, t: Text) => s.aiName || t("wheel.similar", { n: s.count });
const share = (n: number, t: Text) => t(n > 0 && n < .005 ? "wheel.tiny" : "wheel.percent", { n: pct(n) });
const motion = `@media (prefers-reduced-motion: no-preference) { [data-reader-wheel] [data-wheel-sector] { transition: transform ${p.motion.slow} ${p.motion.standard}, opacity ${p.motion.base} ${p.motion.standard}; } }
[data-reader-wheel] [data-wheel-sector]:focus-visible { outline: ${w.hairline}px solid ${p.accent}; }
[data-reader-wheel] button:focus-visible, [data-reader-wheel] a:focus-visible { box-shadow: ${p.focusRing}; }`;

function sentence(o: WheelObservation, model: ReaderWheelModel, t: Text): string {
  const selection = wheelSelection(model, o.key, null);
  if (o.key === "react") return t(`wheel.react.${o.kind}`, { n: model.audience.length, share: pct(selection.loud!.share), likes: pct(selection.loud!.likeShare) });
  if (o.key === "split") return t("wheel.split.sentence", { a: o.sides[0].claim, b: o.sides[1].claim });
  if (o.key === "topic") return t(o.ai ? "wheel.topic.named" : "wheel.topic.unnamed", { n: model.sectors.length, names: model.sectors.map(s => name(s, t)).join(t("wheel.list.separator")), share: pct(model.sectors[0].share) });
  if (o.key === "how") return t("wheel.how.sentence", { n: o.methods.length, names: o.methods.map(m => m.name).join(t("wheel.list.separator")) });
  if (o.key === "link") return t("wheel.link.sentence", { n: o.entities.length, name: selection.link?.name ?? "", m: selection.link?.mentions ?? 0 });
  return t("wheel.qa.sentence", { n: o.total, open: o.unanswered ? t("wheel.qa.open", { n: o.unanswered }) : t("wheel.qa.all") }) + (o.unseen ? t("wheel.qa.unseen", { n: o.unseen }) : "");
}

/** Entity descriptions stay distinct from captured quotes; comment rows below own all source text. */
function Links({ model, rows, onCopy, copyStatus, t }: { model: ReaderWheelModel; rows: EntityRow[]; onCopy?: (text: string) => void; copyStatus?: string; t: Text }) {
  const [sort, setSort] = useState<EntitySort>("mentions");
  const [exported, setExported] = useState<string | null>(null);
  const labels: EntityExportLabels = { mentions: t("blocks.export.mentions"), likes: t("blocks.export.likes"), by: t("blocks.entity.by"), columns: t("blocks.export.columns").split(",") as EntityExportLabels["columns"] };
  const run = (format: "markdown" | "csv") => { onCopy?.(format === "markdown" ? entityMarkdown(rows, t("wheel.link"), labels) : entityCsv(rows, labels)); setExported(format); };
  return <>
    <div style={{ display: "flex", justifyContent: "space-between", gap: p.space.sm }}><h2 style={heading}>{t("wheel.link")}</h2>
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

export function ReaderWheel({ model, onCopy, copyStatus }: { model: ReaderWheelModel; onCopy?: (text: string) => void; copyStatus?: string }) {
  const t = useBlockText();
  const [current, setCurrent] = useState(model.initial);
  const [selected, setSelected] = useState<string | null>(model.initial === "topic" ? model.sectors[0]?.key ?? null : null);
  const [raw, setRaw] = useState<WheelRawKey | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const view = wheelSelection(model, current, selected), o = view.observation;
  // 反應 and 話題 read the sectors themselves (labels, one lit sector); evidence dots are for the observations that cite comments.
  const geometry = wheelGeometry(model.sectors, w), dots = current && current !== "react" && current !== "topic" ? dotsBySector(model, current) : {};
  // A raw pane temporarily takes over the comment surface, preserving the selected observation.
  // This makes overlap between raw audience, questions, author replies and evidence impossible.
  const seen = new Set<string>();
  const comment = (id: string, options: { lead?: boolean; all?: boolean; op?: boolean; extra?: ReactNode; tags?: boolean; bar?: string } = {}) => {
    const c = model.comments[id]; if (!c || seen.has(id)) return null;
    // The first row of a plain list sits directly under the pane edge: no divider above it.
    const first = !seen.size && (!!raw || current === "qa"); seen.add(id);
    const sector = model.sectors.find(s => s.key === c.sector);
    // A bar in the topic's colour marks the comment that stands for that topic; other rows are divided by a hairline.
    return <article key={id} data-wheel-comment={id} style={{ marginTop: first ? 0 : p.space.md, minWidth: 0, ...(options.bar ? { paddingLeft: p.space.md, borderLeft: `${w.leadBar}px solid ${options.bar}` } : first ? {} : { paddingTop: p.space.md, borderTop: `${w.hairline}px solid ${p.border}` }) }}>
      {options.op && view.parents[id] ? <p style={{ ...meta, margin: `0 0 ${p.space.sm}px`, padding: p.space.sm, borderRadius: p.radius.sm, background: p.surfaceSubtle }}>{t("wheel.parent", { author: c.replyTo ?? "", text: view.parents[id]! })}</p> : null}
      {options.all ? <div style={{ display: "flex", alignItems: "center", gap: p.space.sm, ...meta }}><span>{c.likes}</span><i aria-hidden="true" style={{ display: "block", height: w.barHeight, minWidth: w.barMin, width: `${(view.likeRatios[id] ?? 0) * 100}%`, background: sector ? color(sector) : p.dataRest, borderRadius: p.radius.pill }} /></div> : null}
      <p style={{ ...p.type.body, margin: 0, color: p.ink, overflowWrap: "anywhere", whiteSpace: "pre-wrap", ...(options.lead || options.op ? {} : { display: "-webkit-box", WebkitLineClamp: w.clampLines, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>{c.text}</p>
      <div style={{ ...meta, display: "flex", flexWrap: "wrap", alignItems: "center", gap: p.space.sm, marginTop: p.space.xs }}>
        {c.href ? <a href={c.href} target="_blank" rel="noopener noreferrer" aria-label={`${t("blocks.action.evidence")} @${c.author}`} style={{ color: p.ink2, textDecoration: "none", fontWeight: p.type.heading.fontWeight }}>@{c.author}</a> : <span>@{c.author}</span>}
        {!options.all && c.likes > 0 ? <span>{t("wheel.comment.likes", { n: c.likes })}</span> : null}
        {c.replies > 0 ? <span>{t("wheel.comment.replies", { n: c.replies })}</span> : null}
        {c.replyTo && !options.op ? <span>{t("wheel.replyto", { author: c.replyTo })}</span> : null}
        {c.qa ? <span style={{ color: c.qa.startsWith("answered") ? p.success : p.warning }}>{t(`wheel.status.${c.qa}`)}</span> : null}
        {raw === "noise" && c.noiseFlag ? <span>{t(`blocks.noise.flag.${c.noiseFlag}`) || t("blocks.noise.flag.other")}</span> : null}
        {options.extra}
        {options.tags && view.spread && !selected && sector ? <span style={{ display: "inline-flex", alignItems: "center", gap: p.space.xs }}><i aria-hidden="true" style={{ width: p.size.modeDot, height: p.size.modeDot, borderRadius: p.radius.pill, background: color(sector) }} />{sector.aiName ?? t("wheel.tag", { n: sector.count })}</span> : null}
      </div>
    </article>;
  };
  const list = (ids: string[], key: string, first: number, options: Parameters<typeof comment>[1] = {}) => <>
    {(expanded.has(key) ? ids : ids.slice(0, first)).map((id, i) => { const lead = current === "topic" && !raw && i === 0; return comment(id, { ...options, lead, bar: lead && view.sector ? color(view.sector) : undefined }); })}
    {!expanded.has(key) && ids.length > first ? <button type="button" data-wheel-more={key} style={{ ...button, marginTop: p.space.md, width: "100%" }} onClick={() => setExpanded(old => new Set(old).add(key))}>{t(key === "all" ? "wheel.more.all" : "wheel.more", { n: ids.length - first })}</button> : null}
  </>;
  const pickSector = (key: string) => { if (current === "topic") setSelected(key); else if (dots[key]) setSelected(old => old === key ? null : key); };
  const level = (key: string, aside?: string) => <div style={{ ...meta, display: "flex", justifyContent: "space-between", gap: p.space.sm, margin: `${p.space.lg}px 0 ${p.space.sm}px` }}><span>{t(`wheel.level.${key}`)}</span>{aside ? <span>{aside}</span> : null}</div>;
  const hubSector = current === "topic" ? view.sector : current === "react" ? view.loud : null;
  const hubValue = hubSector ? t("wheel.percent", { n: pct(current === "topic" ? hubSector.share : hubSector.likeShare) }) : String(current === "qa" ? view.questionCount : view.refs.length);
  const hubLabel = t(current === "topic" ? "wheel.hub.comments" : current === "react" ? "wheel.hub.likes" : current === "qa" ? "wheel.hub.questions" : "wheel.hub.evidence");
  return <div data-reader-wheel="" style={{ fontFamily: tokens.font.sans, color: p.ink, minWidth: 0, fontVariantNumeric: "tabular-nums" }}>
    <style>{motion}</style>
    {level("observations")}
    <div style={{ display: "grid", gap: p.space.xxs }}>{model.observations.map(observation => <button key={observation.key} type="button" data-wheel-observation={observation.key} aria-pressed={current === observation.key} onClick={() => { setCurrent(observation.key); setSelected(observation.key === "topic" ? model.sectors[0]?.key ?? null : null); setRaw(null); }} style={{ ...button, display: "grid", gridTemplateColumns: w.observationColumns, gap: p.space.sm, textAlign: "left", background: current === observation.key ? p.surface : "transparent", boxShadow: current === observation.key ? p.shadow.card : undefined, padding: p.space.md }}>
      <span style={p.type.micro}>{t(`wheel.${observation.key}`)}{observation.ai ? <sup style={p.type.micro}>{t("wheel.ai")}</sup> : null}</span>
      <span style={{ ...(current === observation.key ? p.type.title : p.type.body), color: current === observation.key ? p.ink : p.ink2, ...(current === observation.key ? {} : { display: "-webkit-box", WebkitLineClamp: w.observationLines, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>{sentence(observation, model, t)}</span>
    </button>)}</div>
    {o ? <>
      {level("evidence", t("wheel.legend"))}
      <svg viewBox={`0 0 ${w.width} ${w.height}`} aria-label={t("wheel.wheel.label")} style={{ display: "block", width: "100%", overflow: "visible" }}>
        {view.coverage !== null ? <><circle cx={w.cx} cy={w.cy} r={w.coverageRadius} fill="none" stroke={p.border} strokeWidth={w.coverageStroke} /><circle cx={w.cx} cy={w.cy} r={w.coverageRadius} pathLength={1} strokeDasharray={`${view.coverage} 1`} transform={`rotate(-90 ${w.cx} ${w.cy})`} fill="none" stroke={p.ink} strokeWidth={w.coverageStroke} /></> : null}
        <circle cx={w.cx} cy={w.cy} r={w.rmin} fill="none" stroke={p.border} strokeWidth={w.hairline} />
        {geometry.map(g => { const sector = model.sectors.find(s => s.key === g.key)!, on = selected === g.key;
          const offset = wheelOffset(g.midAngle, on ? w.shift : 0), dim = selected ? !on : current === "react" ? view.loud?.key !== g.key : !dots[g.key];
          return <g key={g.key} data-wheel-sector={g.key} role="button" tabIndex={0} aria-pressed={on} aria-label={t("wheel.sector.label", { name: name(sector, t), share: pct(sector.share), likes: pct(sector.likeShare) })} onClick={() => pickSector(g.key)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pickSector(g.key); } }} style={{ cursor: "pointer", opacity: dim ? w.dimOpacity : w.fullOpacity, transform: `translate(${offset.x}px, ${offset.y}px)` }}>
            <path d={g.d} fill={color(sector)} stroke={color(sector)} strokeWidth={w.sectorStroke} strokeLinejoin="round" />
            {(current === "topic" || current === "react") && g.label ? <text x={g.label.x} y={g.label.y} fill={p.surface} textAnchor="middle" dominantBaseline="central" style={{ ...p.type.meta, pointerEvents: "none" }}>{share(sector.share, t)}</text> : null}
            {g.dots(dots[g.key] ?? 0).map((dot, i) => <circle key={i} cx={dot.x} cy={dot.y} r={w.dotRadius} fill={p.surface} stroke={p.ink} strokeWidth={w.dotStroke} style={{ pointerEvents: "none" }} />)}
          </g>; })}
        <g style={{ pointerEvents: "none" }}><circle cx={w.cx} cy={w.cy} r={w.hubRadius} fill={p.surface} style={{ filter: `drop-shadow(0 ${p.space.xxs}px ${p.space.xs}px ${p.borderStrong})` }} /><text x={w.cx} y={w.hubValueY} textAnchor="middle" fill={p.ink} style={p.type.title}>{hubValue}</text><text x={w.cx} y={w.hubLabelY} textAnchor="middle" fill={p.ink3} style={p.type.micro}>{hubLabel}</text>{hubSector ? <text x={w.cx} y={w.hubMetaY} textAnchor="middle" fill={p.ink2} style={p.type.micro}>{t(current === "topic" ? "wheel.hub.likeshare" : "wheel.hub.commentshare", { n: pct(current === "topic" ? hubSector.likeShare : hubSector.share) })}</text> : null}</g>
      </svg>
      {!raw ? <section data-wheel-evidence="" style={pane}>
        {selected && current !== "topic" ? <button type="button" data-wheel-clear="" style={button} onClick={() => setSelected(null)}>{t("wheel.filter", { name: name(view.sector!, t) })}</button> : null}
        {o.key === "react" ? <><p style={{ ...meta, marginTop: 0 }}>{t("wheel.counted")}</p>{o.aiGist ? <p style={p.type.bodySm}><b>{t("wheel.ai")}</b> {o.aiGist} <small style={p.type.micro}>{t("wheel.ungrounded")}</small></p> : null}
          {view.react.map(row => <div key={row.sector.key} style={{ marginTop: p.space.lg }}>
            <div style={{ display: "grid", gridTemplateColumns: w.barColumns, alignItems: "center", gap: p.space.xs, ...meta }}>{(["comments", "likes"] as const).map((kind, i) => { const n = i ? row.sector.likeShare : row.sector.share; return <div key={kind} style={{ display: "contents" }}><span>{t(`wheel.${kind}`)}</span><span style={{ height: w.barHeight, background: p.surfaceSubtle, borderRadius: p.radius.pill }}><i style={{ display: "block", width: `${n * 100}%`, minWidth: n ? w.barMin : 0, height: "100%", background: color(row.sector), borderRadius: p.radius.pill }} /></span><b>{share(n, t)}</b></div>; })}</div>
            {row.top ? comment(row.top, { bar: color(row.sector), extra:row.sector.key === o.loud && o.loudTopLikeShare !== null ? <span>{t("wheel.topshare", { n: pct(o.loudTopLikeShare) })}</span> : null }) : null}
          </div>)}</> : null}
        {o.key === "topic" && view.sector ? <><div style={{ display: "flex", justifyContent: "space-between", gap: p.space.sm }}><h2 style={heading}><i aria-hidden="true" style={{ display: "inline-block", width: p.size.modeDot, height: p.size.modeDot, borderRadius: p.radius.pill, background: color(view.sector), marginRight: p.space.sm }} />{view.sector.aiName || t("wheel.similar", { n: view.sector.count })}</h2><div style={{ display: "flex", gap: p.space.xs }}>{([-1, 1] as const).map(step => <button key={step} type="button" data-wheel-step={step} aria-label={t(step < 0 ? "wheel.previous" : "wheel.next")} style={button} onClick={() => setSelected(model.sectors[(view.sector!.rank + step + model.sectors.length) % model.sectors.length].key)}>{step < 0 ? "‹" : "›"}</button>)}</div></div>
          <p style={meta}>{t("wheel.stats", { share: pct(view.sector.share), likes: pct(view.sector.likeShare) })} · {t(`wheel.verdict.${view.verdict}`)}{view.sector.noise ? ` · ${t("wheel.noise.count", { n: view.sector.noise })}` : ""}</p>
          {list(view.topic, `topic:${view.sector.key}`, w.firstTopic)}</> : null}
        {o.key === "split" || o.key === "how" ? <>{o.key === "split" ? <p style={p.type.bodySm}>{o.agree}</p> : null}{view.groups.map((group, i) => group.refs.length ? <div key={i} style={{ marginTop: p.space.lg }}><h2 style={heading}>{group.title}</h2><p style={meta}>{o.key === "how" ? t("wheel.fit", { text: group.detail }) : group.detail}</p>{group.refs.map(id => comment(id, { tags: true }))}</div> : null)}</> : null}
        {o.key === "qa" ? view.questions.map((q, i) => <div key={i}>{q.showQuestion ? q.id ? comment(q.id, { tags: true }) : <div><p style={p.type.body}>{q.question.text}</p><span style={meta}>{t(`wheel.status.${q.status}`)}</span></div> : null}{q.answers.map(id => comment(id, { tags: true }))}</div>) : null}
        {o.key === "link" ? <><Links model={model} rows={o.entities} onCopy={onCopy} copyStatus={copyStatus} t={t} />{list(view.refs, "link", w.firstTopic, { tags: true })}</> : null}
      </section> : null}
    </> : <p style={meta}>{t("wheel.empty")}</p>}
    {level("raw", t("wheel.raw.note"))}
    <div style={{ display: "flex", gap: p.space.xs, overflowX: "auto", padding: p.space.xxs }}>{view.rawChips.map(chip => <button key={chip.key} type="button" data-wheel-raw={chip.key} aria-pressed={raw === chip.key} style={{ ...button, borderRadius: p.radius.pill, flex: "none", background: raw === chip.key ? p.ink : p.surfaceSubtle, color: raw === chip.key ? p.surface : p.ink2 }} onClick={() => setRaw(old => old === chip.key ? null : chip.key)}>{t(`wheel.raw.${chip.key}`)} {chip.n}</button>)}</div>
    {raw ? <section data-wheel-rawpane="" style={{ ...pane, marginTop: p.space.md }}>{raw === "link" ? <><Links model={model} rows={model.raw.links ?? []} onCopy={onCopy} copyStatus={copyStatus} t={t} />{view.rawLinkRefs.map(id => comment(id))}</> : list(view.raw[raw], raw, w.firstRaw, { all: raw === "all", op: raw === "op" })}</section> : null}
  </div>;
}
