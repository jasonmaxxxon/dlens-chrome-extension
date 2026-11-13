import { createContext, useContext } from "react";

import type { UiLanguage } from "../state/types.ts";

/* ─── UI chrome language ───
 *
 * Scope (2026-07-14): only the shell chrome — mode-header title/deck and the
 * workspace nav rail labels — switches 中/英. Deep view bodies stay 繁中.
 * The provider lives in the popup shell; leaf views read the language through
 * `useUiLang` / `useUiText` so nothing needs prop-drilling. The context default
 * is "zh", so components rendered outside the provider (and existing tests)
 * keep the 繁中 reading.
 */
const LanguageContext = createContext<UiLanguage>("zh");

export const LanguageProvider = LanguageContext.Provider;

export function useUiLang(): UiLanguage {
  return useContext(LanguageContext);
}

/* blocks-v1 reader copy, keyed by the backend `title_key` plus reader-owned keys.
 * `{n}`-style placeholders are filled by `blockText`. Unknown keys return "". */
const BLOCK_TEXT: Record<string, readonly [string, string]> = {
  "wheel.level.observations": ["觀察", "Observations"],
  "wheel.level.evidence": ["理據", "Evidence"],
  "wheel.level.raw": ["原文", "Raw material"],
  "wheel.raw.note": ["未經歸納", "Unabridged"],
  "wheel.react": ["反應", "Reaction"],
  "wheel.split": ["分歧", "Differences"],
  "wheel.topic": ["話題", "Topics"],
  "wheel.how": ["做法", "Methods"],
  "wheel.link": ["連結", "Links"],
  "wheel.qa": ["問題", "Questions"],
  "wheel.ai": ["AI", "AI"],
  "wheel.split.sentence": ["{a}，定{b}？", "{a}, or {b}?"],
  "wheel.topic.named": ["留言帶出 {n} 個話題：{names}。", "Comments raise {n} topics: {names}."],
  "wheel.topic.unnamed": ["留言分 {n} 個話題，最多人講嗰個佔 {share}%。", "Comments form {n} topics; the largest holds {share}%."],
  "wheel.topic.loud": ["最多讚嘅係{name}：{share}% 留言攞咗 {likes}% 讚。", " The most liked is {name}: {share}% of comments got {likes}% of likes."],
  "wheel.how.sentence": ["大家提出 {n} 個做法：{names}。", "People suggest {n} methods: {names}."],
  "wheel.link.sentence": ["留言提到 {n} 個連結，最多人提嘅係 {name}（{m} 人）。", "Comments mention {n} links; {name} leads ({m} people)."],
  "wheel.qa.sentence": ["{n} 條問題，{open}", "{n} questions, {open}"],
  "wheel.qa.open": ["{n} 條冇人答", "{n} unanswered"],
  "wheel.qa.all": ["都有人答", "all have replies"],
  "wheel.qa.unseen": ["，{n} 條睇唔到回覆", ", replies to {n} are not captured"],
  "wheel.legend": ["闊 = 留言佔比 · 長 = 讚數佔比", "Width = comment share · Length = like share"],
  "wheel.wheel.label": ["理據落喺邊：闊度係留言佔比，長度係讚數佔比", "Evidence by topic: width shows comment share, length shows like share"],
  "wheel.sector.label": ["{name}：{share}% 留言，{likes}% 讚", "{name}: {share}% of comments, {likes}% of likes"],
  "wheel.filter": ["只睇 {name} ✕", "Only {name} ✕"],
  "wheel.previous": ["上一個話題", "Previous topic"],
  "wheel.next": ["下一個話題", "Next topic"],
  "wheel.ungrounded": ["未連留言出處", "Not linked to comment sources"],
  "wheel.hub.comments": ["嘅留言", "of comments"],
  "wheel.hub.likeshare": ["讚 {n}%", "Likes {n}%"],
  "wheel.hub.evidence": ["則理據", "evidence comments"],
  "wheel.hub.questions": ["條問題", "questions"],
  "wheel.percent": ["{n}%", "{n}%"],
  "wheel.tiny": ["<1%", "<1%"],
  "wheel.list.separator": ["、", ", "],
  "wheel.quote": ["「{text}」", "“{text}”"],
  "wheel.similar": ["{n} 則類似留言", "{n} similar comments"],
  "wheel.tag": ["話題 {n} 則", "Topic of {n}"],
  "wheel.stats": ["{n} 則留言 · 共 {likes} 讚", "{n} comments · {likes} likes in all"],
  "wheel.verdict.more": ["讚數佔比高於留言佔比", "Like share exceeds comment share"],
  "wheel.verdict.less": ["讚數佔比低於留言佔比", "Like share trails comment share"],
  "wheel.side.none": ["呢個話題入面冇", "None in this topic"],
  "wheel.noise.count": ["當中 {n} 則留名", "Including {n} marker comments"],
  "wheel.fit": ["啱：{text}", "Fits: {text}"],
  "wheel.more": ["再睇 {n} 則", "See {n} more"],
  "wheel.more.all": ["再睇 {n} 則（讚數較少）", "See {n} more (fewer likes)"],
  "wheel.raw.all": ["全部留言", "All comments"],
  "wheel.raw.link": ["連結", "Links"],
  "wheel.raw.op": ["作者回應", "Author replies"],
  "wheel.raw.noise": ["留名", "Markers"],
  "wheel.comment.likes": ["{n} 讚", "{n} likes"],
  "wheel.comment.replies": ["{n} 則回覆", "{n} replies"],
  "wheel.replyto": ["回覆 @{author}", "Reply to @{author}"],
  "wheel.parent": ["回應 @{author}：{text}", "Replying to @{author}: {text}"],
  "wheel.status.answered_by_op": ["樓主答咗", "Answered by author"],
  "wheel.status.answered": ["有答", "Answered"],
  "wheel.status.unanswered": ["未答", "Unanswered"],
  "wheel.status.replies_not_captured": ["睇唔到回覆", "Replies not captured"],
  "wheel.status.unknown": ["未知", "Unknown"],
  "wheel.empty": ["未有可顯示嘅觀察，先睇原文。", "No observations yet; explore the raw material."],

  "blocks.opinion_overview.title": ["大家點睇", "What people think"],
  "blocks.entity_list.title": ["推介工具", "Recommended tools"],
  "blocks.qa_pairs.title": ["大家問咩", "Questions"],
  "blocks.top_comments.title": ["熱門留言", "Top comments"],
  "blocks.noise_summary.title": ["留名、表情等", "Bookmarks, emoji and the like"],
  "blocks.action.evidence": ["睇原留言", "View comment"],
  "blocks.action.export_markdown": ["匯出 Markdown", "Export Markdown"],
  "blocks.action.export_csv": ["匯出 CSV", "Export CSV"],
  "blocks.export.columns": ["名稱,連結,網域,提及人數,讚數,推介人,描述", "Name,URL,Domain,Mentions,Likes,Recommenders,Context"],
  "blocks.sort.label": ["排序推介工具", "Sort tools"],
  "blocks.sort.mentions": ["最多人提", "Most mentioned"],
  "blocks.sort.likes": ["最多讚", "Most liked"],
  "blocks.sort.github": ["有 GitHub", "GitHub only"],
  "blocks.entity.mentions": ["{n} 人提", "{n} mentions"],
  "blocks.entity.likes": ["共 {n} 讚", "{n} likes in all"],
  "blocks.entity.by": ["推介", "By"],
  "blocks.entity.github_empty": ["呢度未有 GitHub 連結。", "No GitHub links here."],
  "blocks.export.mentions": ["人提及", "mentions"],
  "blocks.export.likes": ["讚", "likes"],
  "blocks.noise.flag.bookmark": ["留名", "Bookmarks"],
  "blocks.noise.flag.acknowledgment": ["道謝／收到", "Thanks / acknowledged"],
  "blocks.noise.flag.reaction": ["單純反應", "Plain reactions"],
  "blocks.noise.flag.tag_friend": ["標朋友", "Friend tags"],
  "blocks.noise.flag.emoji_only": ["只有表情", "Emoji only"],
  "blocks.noise.flag.very_short": ["字數太少", "Too short"],
  "blocks.noise.flag.marker": ["留名", "Markers"],
  "blocks.noise.flag.mention_only": ["只係 tag 人", "Mentions only"],
  "blocks.noise.flag.short": ["字數太少", "Too short"],
  "blocks.noise.flag.other": ["其他", "Other"],
  "blocks.error.fallback": ["今次未能整理閱讀區塊，下面用返舊版閱讀；數字分析照常完成。", "Reading blocks failed this time; showing the earlier reading. Numbers are unaffected."],
  "blocks.empty.title": ["呢篇未有可顯示嘅閱讀區塊", "No reading blocks for this post"],
  "blocks.empty.none": ["後端冇回傳任何區塊。", "The backend returned no blocks."],
  "blocks.omitted.item": ["{title}：未有內容", "{title}: nothing to show"],
  "blocks.entity.in_post": ["帖文提及", "Mentioned in the post"],
  "blocks.entity.by_op": ["作者喺留言提過", "Author mentioned it in a comment"],
  "blocks.entity.stars": ["{n} 星", "{n} stars"],
  "blocks.entity.archived": ["已封存", "Archived"],
  "blocks.entity.pushed": ["{date} 更新", "Updated {date}"],
  "blocks.menu.label": ["排序同匯出", "Sort and export"],
  "blocks.export.sent": ["{format}（{n} 項）", "{format} ({n} items)"],
  "blocks.noise.flag.placeholder": ["引用帖佔位", "Quote placeholders"],
  "blocks.omitted.all_duplicate": ["{title}：留言已喺上面顯示，唔重複", "{title}: comments already shown above"],
  "blocks.omitted.noise_only": ["{title}：只有留名類留言，冇內容可引用", "{title}: only bookmark-type comments, nothing to quote"],
  "blocks.post_type.label": ["帖子類型", "Post type"],
  "blocks.post_type.discussion": ["討論", "Discussion"],
  "blocks.post_type.resource": ["資源", "Resource"],
  "blocks.post_type.help": ["求助", "Help"],
  "blocks.post_type.news": ["新聞", "News"],
  "blocks.post_type.entertainment": ["娛樂", "Entertainment"],
  "blocks.post_type.unknown": ["未分類", "Unclassified"],
};

export function blockText(lang: UiLanguage, key: string, vars: Record<string, string | number> = {}): string {
  const entry = BLOCK_TEXT[key];
  if (!entry) return "";
  return (lang === "en" ? entry[1] : entry[0]).replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
}

/** Returns `t(key, vars)` for the blocks-v1 copy in the current language. */
export function useBlockText(): (key: string, vars?: Record<string, string | number>) => string {
  const lang = useUiLang();
  return (key, vars) => blockText(lang, key, vars);
}

/** Returns a picker bound to the current language: `t(繁中, English)`. */
export function useUiText(): (zh: string, en: string) => string {
  const lang = useUiLang();
  return (zh, en) => (lang === "en" ? en : zh);
}
