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
  "blocks.opinion_overview.title": ["大家點睇", "What people think"],
  "blocks.entity_list.title": ["推介工具", "Recommended tools"],
  "blocks.qa_pairs.title": ["大家問咩", "Questions"],
  "blocks.top_comments.title": ["熱門留言", "Top comments"],
  "blocks.noise_summary.title": ["留名、表情等", "Bookmarks, emoji and the like"],
  "blocks.action.evidence": ["睇原留言", "View comment"],
  "blocks.action.evidence_post": ["睇原帖", "View original post"],
  "blocks.source.comment": ["原留言", "Comment"],
  "blocks.source.post": ["原帖", "Original post"],
  "blocks.source.substantive": ["{n} 則有內容", "{n} with content"],
  "blocks.unit.opinion_overview": ["{n} 組", "{n} groups"],
  "blocks.unit.entity_list": ["{n} 個", "{n}"],
  "blocks.unit.qa_pairs": ["{n} 條", "{n}"],
  "blocks.unit.top_comments": ["{n} 則", "{n}"],
  "blocks.unit.noise_summary": ["{n} 則", "{n}"],
  "blocks.opinion.similar": ["約 {n} 則類似留言", "~{n} similar comments"],
  "blocks.opinion.similar_plain": ["類似留言", "Similar comments"],
  "blocks.gist.opinion_quote": ["最大一群留言佔 {pct}%", "The largest group is {pct}% of comments"],
  "blocks.fold.top": ["最高 {likes} 讚", "Top: {likes} likes"],
  "blocks.action.evidence_missing": ["原留言連結未有 · ID {id}", "No comment link · ID {id}"],
  "blocks.action.export_markdown": ["匯出 Markdown", "Export Markdown"],
  "blocks.action.export_csv": ["匯出 CSV", "Export CSV"],
  "blocks.action.expand": ["展開", "Expand"],
  "blocks.action.collapse": ["收起", "Collapse"],
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
  "blocks.truncated": ["仲有 {n} 項未列出（共 {total} 項）", "{n} more not listed ({total} total)"],
  "blocks.opinion.count": ["約 {n} 則", "~{n} comments"],
  "blocks.opinion.generic": ["其他留言", "Other comments"],
  "blocks.opinion.substantive": ["{n} 則有內容", "{n} substantive"],
  "blocks.opinion.noise": ["{n} 則留名類", "{n} bookmark-type"],
  "blocks.qa.op": ["作者", "Author"],
  "blocks.qa.post_question": ["原帖提問", "Question in the post"],
  "blocks.qa.answers_more": ["+{n} 則答案未列出", "+{n} more answers not listed"],
  "blocks.top.links": ["留言入面嘅連結", "Links in this comment"],
  "blocks.top.no_text": ["內容未有抓到，可以睇原留言。", "Text not captured; view the comment."],
  "blocks.noise.flag.bookmark": ["留名", "Bookmarks"],
  "blocks.noise.flag.acknowledgment": ["道謝／收到", "Thanks / acknowledged"],
  "blocks.noise.flag.reaction": ["單純反應", "Plain reactions"],
  "blocks.noise.flag.tag_friend": ["標朋友", "Friend tags"],
  "blocks.noise.flag.emoji_only": ["只有表情", "Emoji only"],
  "blocks.noise.flag.very_short": ["字數太少", "Too short"],
  "blocks.noise.flag.other": ["其他", "Other"],
  "blocks.error.fallback": ["今次未能整理閱讀區塊，下面用返舊版閱讀；數字分析照常完成。", "Reading blocks failed this time; showing the earlier reading. Numbers are unaffected."],
  "blocks.empty.title": ["呢篇未有可顯示嘅閱讀區塊", "No reading blocks for this post"],
  "blocks.empty.none": ["後端冇回傳任何區塊。", "The backend returned no blocks."],
  "blocks.omitted.item": ["{title}：未有內容", "{title}: nothing to show"],
  "blocks.supplement.title": ["AI 補充", "AI extra"],
  "blocks.supplement.note": ["做法同分歧", "methods and splits"],
  "blocks.supplement.methods": ["有咩做法", "Methods"],
  "blocks.supplement.split": ["有咩分歧", "Splits"],
  "blocks.entity.in_post": ["帖文提及", "Mentioned in the post"],
  "blocks.entity.by_op": ["作者喺留言提過", "Author mentioned it in a comment"],
  "blocks.entity.stars": ["{n} 星", "{n} stars"],
  "blocks.entity.archived": ["已封存", "Archived"],
  "blocks.entity.pushed": ["{date} 更新", "Updated {date}"],
  "blocks.menu.label": ["排序同匯出", "Sort and export"],
  "blocks.export.sent": ["{format}（{n} 項）", "{format} ({n} items)"],
  "blocks.source.audience": ["{n} 則留言", "{n} comments"],
  "blocks.gist.entity": ["最多人推介「{name}」（{n} 人提），共 {total} 個工具／連結", "Most recommended: {name} ({n} people), {total} tools/links in all"],
  "blocks.gist.opinion": ["最多人講「{label}」，佔 {pct}%", "Most say “{label}”, {pct}%"],
  "blocks.gist.opinion_plain": ["最多人講「{label}」", "Most say “{label}”"],
  "blocks.gist.qa": ["{total} 條問題", "{total} questions"],
  "blocks.gist.qa_open": ["{total} 條問題，{n} 條樣本內未見回覆", "{total} questions, {n} with no reply seen in sample"],
  "blocks.gist.top": ["最高讚：@{author}「{text}」", "Most liked: @{author} “{text}”"],
  "blocks.gist.top_anon": ["最高讚：「{text}」", "Most liked: “{text}”"],
  "blocks.gist.noise": ["{noise} / {audience} 則係留名類", "{noise} of {audience} are bookmark-type"],
  "blocks.fold.more": ["再睇 {what}", "See {what} more"],
  "blocks.fold.less": ["收起", "Show less"],
  "blocks.opinion.low": ["內容較少", "Little content"],
  "blocks.opinion.noise_groups": ["另有 {n} 組只有留名類留言，冇列出。", "{n} more groups hold only bookmark-type comments and are not listed."],
  "blocks.qa.group.answered": ["有答", "Answered"],
  "blocks.qa.group.unanswered": ["未答", "Unanswered"],
  "blocks.qa.group.unseen": ["睇唔到回覆", "Replies not visible"],
  "blocks.qa.structure_unknown": ["今次抓取未有完整回覆結構，「未答」同「睇唔到回覆」只代表樣本內未見。", "This capture has no full reply structure; “unanswered” and “not visible” only mean none was seen in the sample."],
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
