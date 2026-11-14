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
  "wheel.overview": ["概覽", "Overview"],
  "wheel.raw": ["原文", "Comments"],
  "wheel.tabs.label": ["閱讀分頁", "Reading sections"],
  "wheel.mode.label": ["解讀層", "Reading layer"],
  "wheel.mode.all": ["綜合", "With AI"],
  "wheel.mode.counted": ["純統計", "Counts only"],
  "wheel.counted": ["由留言數同讚數計出", "From comment and like counts"],
  "wheel.state.apart": ["高讚 ≠ 多數", "Most liked ≠ most discussed"],
  "wheel.state.same": ["集中一個話題", "One topic leads"],
  "wheel.state.single": ["冇分話題", "One topic"],
  "wheel.head.apart": ["最多讚嘅話題只佔 {share}% 留言，卻攞咗 {likes}% 讚。", "The most liked topic holds only {share}% of comments yet {likes}% of likes."],
  "wheel.head.apart.plain": ["最多讚嘅話題唔係最多人講嗰個，只佔 {share}% 留言。", "The most liked topic is not the most discussed: it holds {share}% of comments."],
  "wheel.head.same": ["{share}% 留言同 {likes}% 讚都落喺同一個話題。", "{share}% of comments and {likes}% of likes sit in one topic."],
  "wheel.head.same.plain": ["{share}% 留言落喺同一個話題。", "{share}% of comments sit in one topic."],
  "wheel.head.single": ["{n} 則留言講嘅嘢相近，冇分開話題。", "The {n} comments say similar things and form one topic."],
  "wheel.badge.liked": ["最多讚", "Most liked"],
  "wheel.badge.discussed": ["最多留言", "Most discussed"],
  "wheel.through": ["睇晒呢個話題 {n} 則", "See all {n} in this topic"],
  "wheel.open": ["開原留言", "Open comment"],
  "wheel.expand": ["展開全文", "Show full comment"],
  "wheel.less": ["收起", "Show less"],
  "wheel.split.kicker": ["同一個問題，兩種睇法", "One question, two views"],
  "wheel.split.agree": ["共同前提：{text}", "Shared premise: {text}"],
  "wheel.side.count": ["{n} 則留言", "{n} comments"],
  "wheel.how.head": ["留言提出 {n} 個做法", "Comments suggest {n} methods"],
  "wheel.how.also": ["另有 {n} 則留言提到", "{n} more comments mention it"],
  "wheel.split": ["分歧", "Differences"],
  "wheel.topic": ["話題", "Topics"],
  "wheel.how": ["做法", "Methods"],
  "wheel.link": ["連結", "Links"],
  "wheel.qa": ["問題", "Questions"],
  "wheel.ai": ["AI", "AI"],
  "wheel.link.sentence": ["留言提到 {n} 個連結，最多人提嘅係 {name}（{m} 人）。", "Comments mention {n} links; {name} leads ({m} people)."],
  "wheel.qa.sentence": ["{n} 條問題，{open}", "{n} questions, {open}"],
  "wheel.qa.open": ["{n} 條未見回覆", "{n} without captured replies"],
  "wheel.qa.all": ["都有回覆", "all have replies"],
  "wheel.qa.unseen": ["，{n} 條睇唔到回覆", ", replies to {n} are not captured"],
  "wheel.legend": ["角度＝分群留言佔比 · 長度＝相對獲讚", "Angle = grouped comment share · Length = relative likes"],
  "wheel.wheel.label": ["話題分佈：角度係分群留言佔比，長度係相對獲讚", "Topics: angle shows grouped comment share, length shows relative likes"],
  "wheel.sector.label": ["{name}：{share}% 留言，{likes}% 讚", "{name}: {share}% of comments, {likes}% of likes"],
  "wheel.ungrounded": ["未連留言出處", "Not linked to comment sources"],
  "wheel.hub.comments": ["留言佔比", "comment share"],
  "wheel.percent": ["{n}%", "{n}%"],
  "wheel.tiny": ["<1%", "<1%"],
  "wheel.list.separator": ["、", ", "],
  "wheel.quote": ["「{text}」", "“{text}”"],
  "wheel.similar": ["{n} 則類似留言", "{n} similar comments"],
  "wheel.stats": ["{n} 則留言 · 共 {likes} 讚", "{n} comments · {likes} likes in all"],
  "wheel.stats.verified": ["{n}／{total} 則已讀留言 · {likes}／{likesTotal} 讚", "{n}/{total} analysed comments · {likes}/{likesTotal} likes"],
  "wheel.noise.count": ["當中 {n} 則留名", "Including {n} marker comments"],
  "wheel.fit": ["啱：{text}", "Fits: {text}"],
  "wheel.more": ["再睇 {n} 則", "See {n} more"],
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
