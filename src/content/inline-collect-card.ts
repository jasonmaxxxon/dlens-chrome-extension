import { modeThemes, tokens } from "../ui/tokens";
import type { FolderMode } from "../state/types";
import type { InlineCardAnswer, InlineCardEntryKey, InlineCardEvidence, InlineCardPeek, InlineCardQuote, InlineCardViewModel, InlineEvidenceGroup, InlineEvidenceRow } from "../viewmodel/inline-card";

const c = tokens.collectCard;
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
const accent = (mode: FolderMode) => (mode === "topic" || mode === "product" || mode === "pr-evidence" ? modeThemes[mode] : modeThemes.archive).accent;
const svg = (d: string) => `<svg viewBox="0 0 24 24" width="${c.iconSize}" height="${c.iconSize}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON: Record<InlineCardEntryKey, string> = {
  stance: svg('<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.4A9 9 0 0 1 20.6 9H15z"/>'),
  method: svg('<path d="m4 7 2 2 3-3M4 15l2 2 3-3M12 8h8M12 16h8"/>'),
  split: svg('<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>'),
  top: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
  op: svg('<path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 6 6v1"/>'),
  ask: svg('<path d="M4 12a8 8 0 1 1 3.4 6.5L4 20l1.1-3.5A8 8 0 0 1 4 12z"/><path d="M10 9.6a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.6M12 15.4v.1"/>')
};

export function formatEta(fromIso: string, seconds: number, now: number): string {
  const left = seconds - Math.floor((now - Date.parse(fromIso)) / 1000);
  if (!Number.isFinite(left) || left < 0) return "比平常久";
  return left < 60 ? `約 ${left} 秒` : `約 ${Math.floor(left / 60)} 分 ${String(left % 60).padStart(2, "0")} 秒`;
}

const cite = (q: InlineCardQuote) => `@${esc(q.author)}${q.likes !== null ? ` · ${q.likes} 讚` : ""}`;
function peekHtml(peek: InlineCardPeek | null): string {
  if (!peek) return "";
  if (peek.state === "loading") return `<div class="sk" aria-label="讀取首批留言"><i></i><i></i></div>`;
  if (!peek.top) return `<p class="note">首批未見留言，等抓取完成。</p>`;
  return `<div class="q1"><q>「${esc(peek.top.text)}」</q><cite>${cite(peek.top)} · 首批 ${peek.total} 則中最高讚</cite></div>`;
}
function answerHtml(a: InlineCardAnswer): string {
  if (a.kind === "empty") return `<p class="hl">${esc(a.text)}</p>`;
  if (a.kind === "clusters") {
    const segs = a.segments.map((s, i) => ({ ...s, color: c.clusterColors[i % c.clusterColors.length] }));
    return `<p class="hl">${esc(a.headline)}</p>
      <div class="stack">${segs.map((s) => `<i style="flex:${Math.max(1, s.pct)} 1 0;background:${s.color}"></i>`).join("")}</div>
      <div class="legend">${segs.map((s) => `<span><i style="background:${s.color}"></i><b>${esc(s.label)}</b><em>${s.pct}%</em></span>`).join("")}</div>
      ${a.quote ? `<div class="q1"><q>「${esc(a.quote.text)}」</q><cite>${cite(a.quote)}</cite></div>` : ""}`;
  }
  if (a.kind === "quotes") return `<div class="rows">${a.rows.map((q) => `<div class="row top"><span class="n">${q.likes ?? 0} 讚</span><span class="t">「${esc(q.text)}」<small>@${esc(q.author)}</small></span></div>`).join("")}</div>`;
  if (a.kind === "methods") {
    return `<div class="rows">${a.rows.map((m, i) => `<div class="row meth${i === 0 ? " main" : ""}"><span class="t"><b>${esc(m.name)}</b>${m.fit ? `<small>${esc(m.fit)}</small>` : ""}</span></div>`).join("")}</div>
      <div class="q1"><q>「${esc(a.quote.text)}」</q><cite>${cite(a.quote)}</cite></div>`;
  }
  if (a.kind === "split") {
    if (!a.sides.length) return `<p class="hl">${esc(a.agree)}</p>${a.note ? `<p class="note">${esc(a.note)}</p>` : ""}`;
    return a.sides.map((s) => `<div class="side"><p class="ctx"><b>${esc(s.claim)}</b> · ${esc(s.why)}</p><div class="q1"><q>「${esc(s.quote.text)}」</q><cite>${cite(s.quote)}</cite></div></div>`).join("");
  }
  if (a.kind === "op") return `<div class="rows">${a.rows.map((r) => `<div class="row"><i class="qd" style="background:${c.askColors.author}"></i><span class="t">${esc(r.text)}</span><span class="n">答「${esc(r.inReplyTo)}」</span></div>`).join("")}</div>`;
  const LAB = { author: "作者回覆", other: "有人回覆", none: "樣本內未見回覆" } as const;
  const dot = (s: keyof typeof LAB) => s === "none" ? `<i class="qd ring" style="border-color:${c.askColors.none}"></i>` : `<i class="qd" style="background:${c.askColors[s]}"></i>`;
  const used = (["none", "author", "other"] as const).filter((s) => a.rows.some((r) => r.status === s));
  return `<p class="hl">${esc(a.headline)}</p><div class="rows">${a.rows.map((r) => `<div class="row">${dot(r.status)}<span class="t">${esc(r.text)}</span></div>`).join("")}</div>
    <div class="key">${used.map((s) => `<span>${dot(s)}${LAB[s]}</span>`).join("")}</div>`;
}

const ICON_SM = (d: string) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const HEART = ICON_SM('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>');
const BUBBLE = ICON_SM('<path d="M4 12a8 8 0 1 1 3.4 6.5L4 20l1.1-3.5A8 8 0 0 1 4 12z"/>');
const hueOf = (handle: string) => [...handle].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
function replyRow(r: InlineEvidenceRow, threaded: boolean): string {
  const name = r.author || "匿名";
  return `<div class="rp"><div class="rp-l${threaded ? " line" : ""}"><span class="rp-av" style="--h:${hueOf(name)}">${esc([...name][0].toUpperCase())}</span></div>
    <div><div class="rp-h"><b>${esc(name)}</b>${r.isAuthor ? `<span class="au">作者</span>` : ""}${r.time ? `<span>${esc(r.time)}</span>` : ""}</div>
    <p>${esc(r.text)}</p><div class="rp-m"><span>${HEART}${r.likes ?? 0}</span>${r.replies !== null ? `<span>${BUBBLE}${r.replies}</span>` : ""}</div></div></div>`;
}
const toneColor = (g: InlineEvidenceGroup) => g.tone === "cluster" ? c.clusterColors[g.index % c.clusterColors.length]
  : g.tone === "method" ? c.entryColors.method : g.tone === "side" ? c.sideColors[g.index % c.sideColors.length] : c.askColors[g.tone];
function evidenceHtml(e: InlineCardEvidence): string {
  const groups = e.groups.map((g) => `<div class="ty" style="--c:${toneColor(g)}"><div class="ty-h"><i></i><b>${esc(g.title)}</b>${g.meta ? `<span>${esc(g.meta)}</span>` : ""}</div>${g.context ? `<p class="xp-ctx">${esc(g.context)}</p>` : ""}${g.chains.map((ch) =>
    replyRow(ch.row, !!ch.reply) + (ch.reply ? replyRow(ch.reply, false) : ch.unanswered ? `<p class="rp-none">樣本內未見回覆</p>` : "")).join("")}</div>`).join("");
  return `<div class="xp"><div class="xp-h">${esc(e.heading)}</div><div class="xp-sub">${esc(e.sub)}</div><div class="xp-k">${esc(e.section)}</div>${groups || `<p class="note">卡片上已列出全部證據。</p>`}</div>`;
}

/** Card markup; actions are data attributes the runtime handles. `evidence` is passed only while 展開證據 is open. */
export function renderInlineCard(vm: InlineCardViewModel, open: InlineCardEntryKey | null, now: number, evidence: InlineCardEvidence | null = null): string {
  const isRead = vm.mode === "topic" || vm.mode === "product";
  let status: string, dot = "";
  if (vm.phase === "failed") { status = `<span class="bad">抓取失敗</span>`; dot = "fail"; }
  else if (vm.phase === "running" || vm.phase === "queued") {
    const eta = vm.eta ? ` · <span data-dlens-eta="${esc(vm.eta.from)}" data-dlens-eta-sec="${vm.eta.seconds}">${formatEta(vm.eta.from, vm.eta.seconds, now)}</span>` : "";
    status = vm.phase === "running" ? `抓取中${eta}` : `排隊${vm.eta?.ahead ? ` · 前面 ${vm.eta.ahead} 篇` : ""}${eta}`;
    dot = vm.phase === "running" ? "live" : "idle";
  }
  else if (vm.phase === "saved") status = isRead ? "未抓取留言" : vm.mode === "archive" ? "已放好" : "已加入";
  else {
    status = vm.countLabel ?? "已抓取";
    if (vm.ai?.state === "running") { status += " · AI 整理中"; dot = "live"; }
  }
  const tag = vm.ai?.state === "no-key" ? `<span class="tag">未接 AI</span>` : "";
  const head = `<div class="head"><span class="dt ${dot}"></span><span class="nm">${esc(vm.sessionName)}</span><span>· ${status}</span>${tag}<button class="x" data-dlens-act="close" aria-label="收起">×</button></div>`;
  let body = peekHtml(vm.peek);
  if (vm.phase === "failed") body += `<p class="note">${esc(vm.error ?? "")}</p><div class="acts"><button class="btn primary" data-dlens-act="crawl">重試</button></div>`;
  else if (vm.phase === "saved" && isRead) body += `<div class="acts"><button class="btn primary" data-dlens-act="crawl">抓取留言</button></div>`;
  else if (vm.phase === "done" && vm.few) body = `<p class="note">只有 ${vm.few.length} 則留言，未夠歸納，全部列出：</p>${vm.few.map((q) => `<div class="reply">${esc(q.text)}<cite>${cite(q)}</cite></div>`).join("")}`;
  else if (vm.phase === "done" && vm.entries.length) {
    body = `<div class="entries" role="tablist">${vm.entries.map((e) => {
      const color = c.entryColors[e.key];
      return `<button class="entry${e.key === open ? " on" : ""}" style="--ec:${color}" role="tab" aria-selected="${e.key === open}" aria-expanded="${e.key === open}" data-dlens-lens="${e.key}"><span class="q"><span class="ei">${ICON[e.key]}</span>${esc(e.label)}</span><span class="f">${e.mark ? `<em>${esc(e.mark)}</em>` : ""}${esc(e.finding)}</span></button>`;
    }).join("")}</div>${open && vm.answers[open] ? `<div class="answer" style="--acc:${c.entryColors[open]}">${answerHtml(vm.answers[open]!)}</div>` : ""}`;
    if (vm.ai?.state === "failed") body += `<p class="note">AI 整理失敗：${esc(vm.ai.error ?? "原因不明")}</p><div class="acts"><button class="btn" data-dlens-act="ai-retry">再整理</button></div>`;
    if (evidence) body += evidenceHtml(evidence);
  }
  const foot = vm.phase === "done" && vm.hasEvidence
    ? `<div class="foot"><button class="ln" data-dlens-act="open">開啟工作區 ↗</button><button class="ln open${evidence ? " on" : ""}" data-dlens-act="evidence" aria-expanded="${!!evidence}">${evidence ? "收起證據" : "展開證據 ↗"}</button></div>`
    : `<div class="foot">${vm.mode === "archive" || vm.mode === "pr-evidence" ? `<button class="ln" data-dlens-act="move">移動</button>` : ""}<button class="ln open" data-dlens-act="open">開啟${vm.mode === "pr-evidence" ? "活動" : "工作區"} ↗</button></div>`;
  return `<div class="dlens-card" style="--acc:${accent(vm.mode)}">${head}${body}${foot}</div>`;
}

export const DLENS_INLINE_CARD_CSS = `
.dlens-card-slot {display:block;pointer-events:auto}
.dlens-card {position:relative;margin:${c.margin};padding:${c.padding};border-radius:${c.radius}px;background:${c.wash};border:1px solid ${c.hair};font:400 ${c.font}px/${c.lineHeight} ${tokens.collectWheel.font};color:${tokens.color.ink};container-type:inline-size;text-align:left}
.dlens-card * {box-sizing:border-box}
.dlens-card .head {display:flex;align-items:center;gap:7px;font-size:${c.headFont}px;line-height:1.3;color:${c.soft};min-height:18px}
.dlens-card .dt {width:${c.dot}px;height:${c.dot}px;border-radius:50%;background:var(--acc);flex:none}
.dlens-card .dt.idle {background:${c.hair}}
.dlens-card .dt.fail {background:${c.fail}}
.dlens-card .nm {font-weight:650;color:var(--acc)}
.dlens-card .bad {color:${c.fail};font-weight:600}
.dlens-card .x {margin-left:auto;border:0;background:none;color:${c.soft};cursor:pointer;font-size:15px;line-height:1;padding:2px 5px;border-radius:6px}
.dlens-card .x:hover {background:${c.hover};color:${tokens.color.ink}}
.dlens-card .note {margin:8px 0 0;font-size:12.5px;color:${c.soft}}
.dlens-card .tag {font-size:10.5px;line-height:1.4;padding:0 6px;border-radius:4px;border:1px solid ${c.hair};color:${c.soft}}
.dlens-card .row.meth {grid-template-columns:minmax(0,1fr)}
.dlens-card .row.meth .t {white-space:normal}
.dlens-card .row.meth .t b {font-weight:600;color:${tokens.color.ink}}
.dlens-card .row.meth .t small {display:block;margin:2px 0 0;font-size:${c.citeFont}px;color:${c.soft}}
.dlens-card .side + .side {margin-top:14px}
.dlens-card .ctx {margin:0;font-size:${c.quoteFont}px;color:${c.sub}}
.dlens-card .ctx b {color:${tokens.color.ink};font-weight:600}
.dlens-card .xp {margin-top:16px;padding-top:12px;border-top:1px solid ${c.hair}}
.dlens-card .xp-h {font-size:13px;font-weight:650}
.dlens-card .xp-sub {margin-top:2px;font-size:${c.citeFont}px;color:${c.soft}}
.dlens-card .xp-k {margin:14px 0 2px;font-size:${c.citeFont}px;font-weight:600;color:${c.sub}}
.dlens-card .ty {margin-top:12px}
.dlens-card .ty-h {display:flex;align-items:center;gap:7px;font-size:12.5px}
.dlens-card .ty-h i {width:7px;height:7px;border-radius:2px;background:var(--c)}
.dlens-card .ty-h b {font-weight:600}
.dlens-card .ty-h span {color:${c.soft}}
.dlens-card .xp-ctx {margin:4px 0 0 14px;font-size:12.5px;color:${c.sub}}
.dlens-card .rp {display:grid;grid-template-columns:${c.avatar}px minmax(0,1fr);gap:10px;padding:10px 0 2px}
.dlens-card .rp-l {position:relative;display:flex;justify-content:center}
.dlens-card .rp-l.line::after {content:'';position:absolute;top:${c.avatar + 4}px;bottom:-14px;left:50%;width:2px;margin-left:-1px;border-radius:1px;background:${c.threadLine}}
.dlens-card .rp-av {width:${c.avatar}px;height:${c.avatar}px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:650;background:hsl(var(--h) ${c.avatarSat}% ${c.avatarLight}%);color:hsl(var(--h) ${c.avatarSat}% ${c.avatarInk}%)}
.dlens-card .rp-h {display:flex;align-items:center;gap:6px;font-size:13px;line-height:1.3}
.dlens-card .rp-h b {font-weight:600}
.dlens-card .rp-h span {font-size:12px;color:${c.soft}}
.dlens-card .rp-h .au {font-size:10.5px;padding:0 5px;border-radius:4px;background:color-mix(in srgb,var(--acc) 12%,transparent);color:var(--acc)}
.dlens-card .rp p {margin:3px 0 0;font-size:${c.quoteFont}px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.dlens-card .rp-m {display:flex;gap:14px;margin-top:6px;font-size:12px;color:${c.soft}}
.dlens-card .rp-m span {display:inline-flex;align-items:center;gap:4px}
.dlens-card .rp-none {margin:4px 0 0 ${c.avatar + 10}px;font-size:12px;color:${c.askColors.none}}
.dlens-card .sk {margin-top:12px}
.dlens-card .sk i {display:block;height:${c.skeletonHeight}px;border-radius:5px;background:linear-gradient(90deg,${c.skeleton[0]} 0,${c.skeleton[1]} 40%,${c.skeleton[0]} 80%);background-size:200% 100%;animation:dlens-card-shimmer 1.1s linear infinite}
.dlens-card .sk i + i {width:58%;margin-top:8px}
@keyframes dlens-card-shimmer {from {background-position:100% 0} to {background-position:-100% 0}}
.dlens-card .acts {display:flex;gap:8px;margin-top:10px}
.dlens-card .btn {font:600 ${c.btnFont}px ${tokens.collectWheel.font};border-radius:${c.btnRadius}px;padding:${c.btnPadding};border:1px solid ${c.hair};background:${tokens.color.inverse};color:${tokens.color.ink};cursor:pointer}
.dlens-card .btn.primary {background:var(--acc);border-color:transparent;color:${tokens.color.inverse}}
.dlens-card .reply {padding:6px 0;font-size:${c.quoteFont}px}
.dlens-card .reply + .reply {border-top:1px solid ${c.hair}}
.dlens-card .reply cite, .dlens-card .q1 cite {display:block;font-style:normal;font-size:${c.citeFont}px;color:${c.soft}}
.dlens-card .entries {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:${c.entryGap}px;margin:12px -6px 0;border-bottom:1px solid ${c.hair}}
@container (max-width:470px) {.dlens-card .entries {grid-template-columns:1fr 1fr}}
.dlens-card .entry {position:relative;display:grid;gap:5px;align-content:start;min-width:0;text-align:left;border:0;background:none;padding:${c.entryPadding};border-radius:8px 8px 0 0;color:${c.sub};cursor:pointer;font:inherit}
.dlens-card .entry:hover {background:color-mix(in srgb,var(--ec) 7%,transparent)}
.dlens-card .entry.on {background:color-mix(in srgb,var(--ec) 6%,transparent)}
.dlens-card .entry.on::after {content:'';position:absolute;left:10px;right:10px;bottom:-1px;height:2px;border-radius:2px;background:var(--ec)}
.dlens-card .entry .q {display:flex;align-items:center;gap:7px;min-width:0;font-size:${c.entryLabel}px;font-weight:600;white-space:nowrap}
.dlens-card .entry .ei {display:grid;color:var(--ec);flex:none}
.dlens-card .entry .f {font-size:${c.entryFinding}px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dlens-card .entry .f em {font-style:normal;font-weight:600;color:var(--ec);margin-right:6px}
.dlens-card .entry.on .q, .dlens-card .entry.on .f {color:${tokens.color.ink}}
.dlens-card .answer {padding-top:${c.answerTop}px}
.dlens-card .hl {margin:0;font-size:${c.headline}px;font-weight:600;line-height:1.5}
.dlens-card .stack {display:flex;gap:${c.barGap}px;height:${c.barHeight}px;margin-top:14px}
.dlens-card .stack i {border-radius:3px}
.dlens-card .legend {display:flex;flex-wrap:wrap;gap:6px 20px;margin-top:9px;font-size:12.5px;color:${c.sub}}
.dlens-card .legend span {display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.dlens-card .legend i {width:7px;height:7px;border-radius:2px}
.dlens-card .legend b {font-weight:600;color:${tokens.color.ink}}
.dlens-card .legend em {font-style:normal;color:${c.soft}}
.dlens-card .q1 {margin-top:14px;padding-left:12px;border-left:2px solid color-mix(in srgb,var(--acc) 28%,transparent);font-size:${c.quoteFont}px;color:${c.sub}}
.dlens-card .q1 q {quotes:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.6}
.dlens-card .rows {display:grid;gap:2px;margin-top:10px}
.dlens-card .row {display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:12px;align-items:baseline;padding:6px 0;font-size:${c.quoteFont}px}
.dlens-card .row.top {grid-template-columns:52px minmax(0,1fr)}
.dlens-card .row .t {white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dlens-card .row .t small {color:${c.soft};font-size:${c.citeFont}px;margin-left:6px}
.dlens-card .row .n {font-size:12px;color:${c.soft};white-space:nowrap}
.dlens-card .row.top .n {text-align:right}
.dlens-card .qd {width:8px;height:8px;border-radius:50%;align-self:center;display:inline-block}
.dlens-card .qd.ring {background:none;border:1.5px solid}
.dlens-card .key {display:flex;gap:14px;margin-top:8px;font-size:${c.citeFont}px;color:${c.soft}}
.dlens-card .key span {display:inline-flex;align-items:center;gap:5px}
.dlens-card .foot {display:flex;align-items:center;gap:2px;margin-top:10px;font-size:12px;color:${c.soft}}
.dlens-card .ln {border:0;background:none;padding:3px 6px;border-radius:6px;color:${c.sub};cursor:pointer;font-size:12px}
.dlens-card .ln:hover {background:${c.hover};color:${tokens.color.ink}}
.dlens-card .ln.open {margin-left:auto;color:var(--acc);font-weight:600}
.dlens-card .ln.open.on {background:${c.hover}}
@media (prefers-reduced-motion: reduce) {.dlens-card * {transition:none !important;animation:none !important}}
`;
