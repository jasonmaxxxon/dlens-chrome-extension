import { WorkspaceModeIcon } from "./WorkspaceModeIcon";
import { useState, type CSSProperties, type ReactNode } from "react";
import { avatarGradient, modeThemes, tokens } from "./tokens";
import type { DiscourseFinding, DiscourseFrame, DiscoursePost, TopicDiscourseViewModel } from "../viewmodel/topic-discourse";

export type TopicDiscourseCommand =
  | { kind: "select-topic"; topicId: string }
  | { kind: "assign"; signalId: string; topicId: string }
  | { kind: "create-topic"; name: string; researchQuestion: string }
  | { kind: "move-product"; signalId: string }
  | { kind: "open-atlas"; topicId: string }
  | { kind: "delete-topic"; topicId: string };

const d = tokens.discourse;
const acc = modeThemes.topic.accent;

function Avatar({ handle, size = d.avatar }: { handle: string; size?: number }) {
  return (
    <span aria-hidden style={{ width: size, height: size, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", color: tokens.color.inverse, fontSize: size * 0.45, fontWeight: 700, background: avatarGradient(handle), boxShadow: `0 0 0 2px ${d.card}` }}>
      {[...(handle || "?")][0].toUpperCase()}
    </span>
  );
}

const pill = (on: boolean): CSSProperties => ({ border: 0, padding: d.chipPad, borderRadius: 999, background: on ? acc : d.chipBg, color: on ? tokens.color.inverse : tokens.color.subInk, fontSize: 12.5, fontWeight: 500, cursor: "pointer", font: "inherit" });
const card: CSSProperties = { borderRadius: d.radius, background: d.card, border: `1px solid ${d.hair}`, boxShadow: d.cardShadow };
const k = (label: string, note?: string) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: `${d.sectionTop}px 2px ${d.gap}px`, fontSize: d.smallFont, color: d.soft }}>
    <b style={{ color: tokens.color.subInk, fontWeight: 600 }}>{label}</b>{note ? <span style={{ fontSize: 10.5, color: d.faint }}>{note}</span> : null}
  </div>
);

/** One row per post: avatar, handle · date, the post's first line, likes. Opens the post on Threads. */
function PostRow({ post }: { post: DiscoursePost }) {
  return (
    <a href={post.url} target="_blank" rel="noreferrer" data-discourse-post={post.postKey} style={{ display: "grid", gridTemplateColumns: `${d.avatar}px minmax(0,1fr) auto`, gap: 10, padding: "8px 6px", borderRadius: 8, color: "inherit", textDecoration: "none", background: post.inView ? tokens.color.cyanSoft : "transparent" }}>
      <Avatar handle={post.author} />
      <span style={{ minWidth: 0, fontSize: 12.5, lineHeight: 1.45 }}>
        <b style={{ fontWeight: 600 }}>{post.author}<span style={{ fontWeight: 400, color: d.soft, marginLeft: 6 }}>{post.date}</span></b>
        <em style={{ display: "block", fontStyle: "normal", color: tokens.color.subInk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{post.text}</em>
      </span>
      <span style={{ fontSize: d.tinyFont, color: d.soft, fontVariantNumeric: "tabular-nums" }}>{post.likes === null ? "" : `♡ ${post.likes}`}</span>
    </a>
  );
}

function NewTopic({ onCreate, label = "＋ 新話題", initiallyOpen = false }: { onCreate: (name: string, question: string) => void; label?: string; initiallyOpen?: boolean }) {
  const [editing, setEditing] = useState(initiallyOpen);
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  if (!editing) return <button type="button" data-discourse-new-topic="true" style={pill(false)} onClick={() => setEditing(true)}>{label}</button>;
  const field: CSSProperties = { ...pill(false), border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.card, minWidth: 0, width: "100%", boxSizing: "border-box", cursor: "text" };
  return <form data-discourse-topic-form="" style={{ display: "grid", gap: d.gap, width: "100%" }} onSubmit={event => {
    event.preventDefault(); if (!name.trim()) return; onCreate(name.trim(), question.trim()); setEditing(false); setName(""); setQuestion("");
  }}>
    <label>名稱<input autoFocus required maxLength={80} data-discourse-new-topic-name="" aria-label="新話題名稱" value={name} onChange={e => setName(e.target.value)} style={field} /></label>
    <label>研究問題（可選）<input maxLength={240} data-discourse-research-question="" aria-label="研究問題（可選）" value={question} onChange={e => setQuestion(e.target.value)} style={field} /></label>
    <div><button type="submit" style={pill(true)}>建立</button> <button type="button" style={pill(false)} onClick={() => setEditing(false)}>取消</button></div>
  </form>;
}

function Finding({ finding, onOpenFrame }: { finding: DiscourseFinding; onOpenFrame: (key: string) => void }) {
  const color = finding.kind === "trend" ? d.trend : finding.kind === "like" ? d.like : d.ask;
  const label = finding.kind === "trend" ? "走勢" : finding.kind === "like" ? "共鳴" : "重複問題";
  let shape: ReactNode = null;
  if (finding.kind === "trend") {
    const max = Math.max(1, ...finding.weeks.map((w) => w.count));
    shape = (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 10 }}>
        {finding.weeks.map((week) => (
          <span key={week.label} style={{ display: "grid", gap: 4, fontSize: 10.5, color: d.soft, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
            <i style={{ height: d.weekBar, display: "flex", alignItems: "flex-end", borderRadius: 4, background: d.hair, overflow: "hidden" }}>
              <b style={{ width: "100%", height: `${Math.round((week.count / max) * 100)}%`, borderRadius: 4, background: week.hot ? color : `color-mix(in srgb, ${color} 45%, transparent)` }} />
            </i>{week.label} · {week.count}
          </span>
        ))}
      </div>
    );
  } else if (finding.kind === "like") {
    const max = Math.max(1, ...finding.rows.map((r) => r.avg));
    shape = (
      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
        {finding.rows.map((row) => (
          <div key={row.name} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr) 44px", gap: 8, alignItems: "center", fontSize: d.tinyFont, color: row.hot ? tokens.color.ink : d.soft, fontWeight: row.hot ? 600 : 400 }}>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</span>
            <i style={{ height: 6, borderRadius: 3, background: d.hair, overflow: "hidden" }}><b style={{ display: "block", height: "100%", width: `${Math.round((row.avg / max) * 100)}%`, borderRadius: 3, background: row.hot ? color : `color-mix(in srgb, ${color} 40%, transparent)` }} /></i>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.avg}</span>
          </div>
        ))}
      </div>
    );
  } else {
    shape = (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 10, fontSize: d.tinyFont, color: d.soft }}>
        {finding.where.map((w) => (
          <span key={w.postKey} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <i style={{ width: 8, height: 8, borderRadius: "50%", background: w.replied ? d.replied : "none", boxShadow: w.replied ? "none" : `inset 0 0 0 1.5px ${d.inbox}` }} />@{w.author}
          </span>
        ))}
      </div>
    );
  }
  const frameKey = finding.kind === "ask" ? null : finding.frameKey;
  return (
    <div data-discourse-finding={finding.kind} data-dlens-presence="card" style={{ ...card, marginTop: d.gap, padding: "13px 14px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: d.smallFont, fontWeight: 600, color }}>{label}<span style={{ marginLeft: "auto", fontWeight: 400, fontSize: 10.5, color: d.faint }}>無 AI</span></div>
      <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.6 }}>{finding.text}</p>
      {shape}
      {frameKey ? <button type="button" onClick={() => onOpenFrame(frameKey)} style={{ marginTop: 8, border: 0, background: "none", padding: "3px 0", color, fontSize: d.smallFont, fontWeight: 600, cursor: "pointer" }}>睇呢個講法 ↗</button> : null}
    </div>
  );
}

function FrameRow({ frame, open, onToggle }: { frame: DiscourseFrame; open: boolean; onToggle: () => void }) {
  return (
    <div data-discourse-frame={frame.key} style={{ borderRadius: d.rowRadius, background: frame.inView ? tokens.color.cyanSoft : "transparent" }}>
      <button type="button" aria-expanded={open} onClick={onToggle} style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "7px 12px", padding: "12px 10px 13px", border: 0, background: "none", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", borderRadius: d.rowRadius }}>
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>{frame.name}{frame.isNew ? <i style={{ fontStyle: "normal", fontSize: 11, fontWeight: 700, color: d.inbox, marginLeft: 8 }}>新</i> : null}</span>
        <span style={{ fontSize: 12.5, color: tokens.color.subInk, fontVariantNumeric: "tabular-nums" }}>{frame.posts.length} 篇</span>
        <span style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, fontSize: d.tinyFont, color: d.soft, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ display: "inline-flex" }}>{frame.posts.slice(0, 4).map((p, i) => <span key={p.postKey} style={{ marginLeft: i ? -6 : 0 }}><Avatar handle={p.author} size={d.faceAvatar} /></span>)}</span>
          {frame.first ? `最早 ${frame.first} · ` : ""}本週 +{frame.thisWeek}
          {frame.inView ? <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: acc }}>◉ 畫面上</span> : null}
        </span>
      </button>
      {open ? <div style={{ display: "grid", gap: 2, padding: "0 4px 10px" }}>{frame.posts.map((post) => <PostRow key={post.postKey} post={post} />)}</div> : null}
    </div>
  );
}

/** 工作區 › 觀眾反應: 話題 → 講法 → 發現, with the 未分流 posts sorted by hand. */
export function TopicDiscourseView({ viewModel: vm, onCommand }: { viewModel: TopicDiscourseViewModel; onCommand: (command: TopicDiscourseCommand) => void }) {
  const [inboxOpen, setInboxOpen] = useState(!vm.topicCount);
  const [openFrame, setOpenFrame] = useState<string | null>(null);
  const topic = vm.topic;
  const picks = (signalId: string, suggestion = vm.inbox.find(row => row.signalId === signalId)?.suggestion) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0 0 32px" }}>
      {suggestion ? <button type="button" data-discourse-suggestion={suggestion.topicId} onClick={() => onCommand({ kind: "assign", signalId, topicId: suggestion.topicId })} style={pill(false)}>建議：〈{suggestion.name}〉✓</button> : null}
      {vm.picks.filter(p => p.id !== suggestion?.topicId).map((p) => <button type="button" key={p.id} data-discourse-assign={p.id} onClick={() => onCommand({ kind: "assign", signalId, topicId: p.id })} style={{ border: 0, padding: d.pickPad, borderRadius: 999, fontSize: 12, cursor: "pointer", background: tokens.color.cyanSoft, color: acc }}>{p.name}</button>)}
      <button type="button" data-discourse-move={signalId} style={pill(false)} onClick={() => onCommand({ kind: "move-product", signalId })}>移去 個人應用</button>
      {suggestion ? <small style={{ color: d.soft }}>{suggestion.reason} · 字詞重疊，無 AI</small> : null}
    </div>
  );
  return (
    <div data-topic-discourse="true" style={{ padding: `4px ${d.pad - 4}px 28px`, fontFamily: tokens.font.sans, fontSize: d.bodyFont, color: tokens.color.ink }}>
      <header style={{ display: "flex", alignItems: "center", gap: d.gap }}><WorkspaceModeIcon mode="topic" /><b>觀眾反應</b></header>
      {!vm.topicCount ? <div data-discourse-guide="" style={{ ...card, padding: d.pad, marginTop: d.gap }}>
        <p>① 建話題：名稱 + 你想答嘅問題（研究問題，可選）</p>
        <p>② 放帖子入去：轉盤外圈，或者下面未分流</p>
        <p>③ 睇講法同發現</p>
      </div> : null}
      <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 6 }}>
        {vm.chips.map((chip) => (
          <button type="button" role="tab" aria-selected={chip.selected} key={chip.id} data-discourse-topic={chip.id} onClick={() => onCommand({ kind: "select-topic", topicId: chip.id })} style={pill(chip.selected)}>
            {chip.name}<em style={{ fontStyle: "normal", marginLeft: 6, color: chip.selected ? d.chipCountOn : d.soft, fontVariantNumeric: "tabular-nums" }}>{chip.count}</em>
          </button>
        ))}
        <NewTopic initiallyOpen={!vm.topicCount} onCreate={(name, researchQuestion) => onCommand({ kind: "create-topic", name, researchQuestion })} />
      </div>

      {vm.inbox.length ? (
        <div data-discourse-inbox="true" data-dlens-presence="card" style={{ ...card, marginTop: 14 }}>
          <button type="button" aria-expanded={inboxOpen} onClick={() => setInboxOpen(!inboxOpen)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", border: 0, background: "none", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}>
            <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, background: d.inboxWash, color: d.inbox, fontSize: 11.5, fontWeight: 700, display: "grid", placeItems: "center" }}>{vm.inbox.length}</span>
            <b style={{ fontWeight: 600 }}>未分流</b><span style={{ color: d.soft, fontSize: d.smallFont }}>放入話題先計入講法</span>
            <i style={{ marginLeft: "auto", fontStyle: "normal", color: d.soft }}>{inboxOpen ? "⌃" : "⌄"}</i>
          </button>
          {inboxOpen ? vm.inbox.map((row) => (
            <div key={row.signalId} data-discourse-inbox-row={row.signalId} style={{ padding: "10px 14px 12px", borderTop: `1px solid ${d.hair}`, background: row.inView ? tokens.color.cyanSoft : "transparent" }}>
              <div style={{ display: "grid", gridTemplateColumns: `${d.avatar}px minmax(0,1fr)`, gap: 10 }}>
                <Avatar handle={row.author} />
                <div style={{ minWidth: 0, fontSize: 12.5, lineHeight: 1.45 }}>
                  <b style={{ fontWeight: 600 }}>{row.author}<span style={{ fontWeight: 400, color: d.soft, marginLeft: 6 }}>{row.meta}</span></b>
                  <em style={{ display: "block", fontStyle: "normal", color: tokens.color.subInk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.text}</em>
                </div>
              </div>
              {picks(row.signalId)}
            </div>
          )) : null}
        </div>
      ) : null}

      {topic ? (
        <>
          <div style={{ marginTop: 20 }}>
            <h2 style={{ margin: 0, font: `700 ${d.titleFont}px/1.3 ${tokens.font.serifCjk}`, letterSpacing: ".01em" }}>{topic.name}</h2>
            {topic.researchQuestion ? <p data-discourse-question="" style={{ fontSize: d.smallFont, color: d.soft }}>研究問題：{topic.researchQuestion}</p> : null}
            <div style={{ marginTop: 4, fontSize: d.smallFont, color: d.soft, fontVariantNumeric: "tabular-nums" }}>{topic.coverage}</div>
          </div>
          {topic.inView ? (
            <div data-discourse-in-view={topic.inView.kind} style={{ marginTop: 14, display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: "4px 10px", padding: "10px 12px", borderRadius: 12, fontSize: 12.5, lineHeight: 1.5, color: tokens.color.subInk, background: topic.inView.kind === "here" ? tokens.color.cyanSoft : "none", boxShadow: topic.inView.kind === "here" ? "none" : `inset 0 0 0 1px ${tokens.color.line}` }}>
              <span style={{ width: 9, height: 9, marginTop: 5, borderRadius: "50%", boxShadow: `0 0 0 2px ${topic.inView.kind === "here" ? acc : d.faint}` }} />
              {topic.inView.kind === "here" ? (
                <div><b style={{ color: tokens.color.ink, fontWeight: 600 }}>畫面上：@{topic.inView.author}</b>{topic.inView.frameName ? ` 屬〈${topic.inView.frameName}〉` : " 未有留言分群"}<small style={{ display: "block", fontSize: d.tinyFont, color: d.soft }}>{topic.inView.text}</small></div>
              ) : topic.inView.kind === "elsewhere" ? (
                <div>畫面上 @{topic.inView.author} 屬另一個話題〈{topic.inView.topicName}〉</div>
              ) : (
                <div>畫面上 @{topic.inView.author} 未放入話題{picks(topic.inView.signalId)}</div>
              )}
            </div>
          ) : null}
          {topic.findings.length ? (
            <>
              {k("發現", "跨帖先見到；每句由規則 + 數字組成")}
              {topic.findings.map((finding) => <Finding key={finding.kind} finding={finding} onOpenFrame={(key) => setOpenFrame(key)} />)}
            </>
          ) : null}
          {topic.frames ? (
            <>
              {k("講法", "按留言字詞分組 · 篇")}
              {topic.frames.map((frame) => <FrameRow key={frame.key} frame={frame} open={openFrame === frame.key} onToggle={() => setOpenFrame(openFrame === frame.key ? null : frame.key)} />)}
            </>
          ) : (
            <p style={{ margin: "16px 2px 4px", fontSize: 12.5, color: d.soft }}>{topic.loose.length} 篇貼文；放夠 3 篇並抓完留言先分講法。</p>
          )}
          {topic.loose.length ? (
            <>
              {topic.frames ? k("未有留言分群", "抓完留言後自動分") : null}
              <div style={{ display: "grid", gap: 2 }}>{topic.loose.map((post) => <PostRow key={post.postKey} post={post} />)}</div>
            </>
          ) : null}
          {topic.meme ? (
            <>
              {k("重複用語", "無 AI")}
              <div data-dlens-presence="card" style={{ ...card, padding: "12px 14px", fontSize: 13, color: tokens.color.subInk }}>「<b style={{ color: tokens.color.ink }}>{topic.meme.phrase}</b>」喺 {topic.meme.posts} 篇貼文嘅留言分群出現。</div>
            </>
          ) : null}
          <div data-dlens-presence="card" style={{ marginTop: 18, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: d.radius, border: `1px dashed ${tokens.color.line}`, fontSize: 12.5, color: d.soft }}>
            <span>想睇成個話題嘅深入分析？</span>
            <span style={{ display: "flex", gap: 4, marginLeft: "auto", whiteSpace: "nowrap" }}>
              <button type="button" data-discourse-delete={topic.id} onClick={() => onCommand({ kind: "delete-topic", topicId: topic.id })} style={{ border: 0, background: "none", color: d.soft, cursor: "pointer", fontSize: 12.5 }}>移除話題</button>
              <button type="button" data-discourse-atlas={topic.id} onClick={() => onCommand({ kind: "open-atlas", topicId: topic.id })} style={{ border: 0, background: "none", color: acc, fontWeight: 600, cursor: "pointer", fontSize: 12.5 }}>完整分析（Atlas）↗</button>
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
