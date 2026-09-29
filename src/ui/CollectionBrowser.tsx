import { useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";

import type { SessionRecord } from "../state/types";
import { buildCollectionPosts, searchCollectionPosts, type CollectionPost } from "../viewmodel/collection-browser";
import { PrimaryButton } from "./components";
import { SavedPostMetrics } from "./SavedPostPreview";
import { textStyles, tokens } from "./tokens";

export interface CollectionBrowserProps {
  sessions: SessionRecord[];
  query: string;
  onQueryChange: (value: string) => void;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onCollect: () => void;
  onOpenWorkspace: (sessionId: string) => void;
  isLoading?: boolean;
}

const rootStyle: CSSProperties = {
  display: "flex", flexDirection: "column", minWidth: 0,
  width: "100%", boxSizing: "border-box", color: tokens.color.ink
};
const quietButton: CSSProperties = {
  ...textStyles.meta, display: "inline-flex", alignItems: "center", gap: tokens.spacing.sm,
  border: 0, padding: tokens.spacing.sm, borderRadius: tokens.radius.xs,
  background: "transparent", color: tokens.color.accent, cursor: "pointer"
};
const statusText: Record<CollectionPost["status"], string> = {
  saved: "尚未擷取", queued: "等候擷取", running: "擷取中", succeeded: "擷取完成", failed: "擷取未完成"
};

function savedTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-HK", { dateStyle: "medium", timeStyle: "short" }) : value;
}

function OriginalImage({ url, index }: { url: string; index: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <div data-collection-reader-image="" style={{ minWidth: 0 }}>
      {failed ? (
        <p style={{ ...textStyles.meta, color: tokens.color.softInk, margin: 0, padding: tokens.spacing.md }}>
          圖片暫時無法載入，可查看原帖。
        </p>
      ) : (
        <img src={url} alt={`原帖圖片 ${index + 1}`} loading="lazy" decoding="async" referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{ display: "block", width: "100%", height: "auto", objectFit: "contain", borderRadius: tokens.radius.lg }} />
      )}
    </div>
  );
}

function CollectionThumbnail({ url }: { url?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const style: CSSProperties = {
    display: "block", width: tokens.layout.collectionThumbnailWidth, height: tokens.layout.collectionThumbnailHeight,
    borderRadius: tokens.radius.xs, flexShrink: 0
  };
  return (
    <span data-collection-thumbnail="" aria-hidden="true" style={style}>
      {url && failedUrl !== url ? <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onError={() => setFailedUrl(url)} style={{ ...style, objectFit: "cover" }} /> : null}
    </span>
  );
}

function CollectionReader({ post, onBack, onOpenWorkspace }: {
  post: CollectionPost; onBack: () => void; onOpenWorkspace: CollectionBrowserProps["onOpenWorkspace"];
}) {
  const workspaces = [...new Map(post.memberships.map((membership) => [membership.sessionId, membership])).values()];
  return (
    <section data-collection-browser="reader" aria-label="收藏原文" style={rootStyle}>
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0, padding: tokens.spacing.md, borderBottom: `1px solid ${tokens.color.line}` }}>
        <button type="button" data-collection-action="back" onClick={onBack} style={quietButton}>
          <ArrowLeft size={tokens.spacing.section} aria-hidden="true" />返回收藏
        </button>
      </div>
      <article style={{ minWidth: 0, padding: tokens.spacing.lg }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg }}>
          <span style={{ ...textStyles.meta, color: tokens.color.softInk }}>{post.author ? `@${post.author.replace(/^@/, "")}` : "作者未記錄"}</span>
          {post.postUrl ? (
            <a href={post.postUrl} target="_blank" rel="noopener noreferrer" style={{ ...quietButton, textDecoration: "none" }}>
              原帖<ExternalLink size={tokens.spacing.section} aria-hidden="true" />
            </a>
          ) : null}
        </header>
        {post.imageUrls.length ? (
          <div style={{ display: "grid", gridTemplateColumns: post.imageUrls.length > 1 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)", gap: tokens.spacing.md, alignItems: "start", marginBottom: tokens.spacing.lg }}>
            {post.imageUrls.map((url, index) => <OriginalImage key={url} url={url} index={index} />)}
          </div>
        ) : null}
        <div data-collection-reader-body="" style={{ ...textStyles.body, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: tokens.color.ink }}>
          {post.body || "沒有已保存的原文文字。"}
        </div>
        {post.captureLimit ? <p style={{ ...textStyles.meta, color: tokens.color.softInk, marginTop: tokens.spacing.lg }}>{post.captureLimit}</p> : null}
        <details style={{ borderTop: `1px solid ${tokens.color.line}`, marginTop: tokens.spacing.xl, paddingTop: tokens.spacing.md }}>
          <summary style={{ ...textStyles.meta, color: tokens.color.softInk, cursor: "pointer", padding: tokens.spacing.sm }}>詳情</summary>
          <div style={{ display: "grid", gap: tokens.spacing.md, padding: tokens.spacing.sm, minWidth: 0 }}>
            <SavedPostMetrics descriptor={post.descriptor} />
            <div style={{ ...textStyles.meta, color: tokens.color.softInk }}>
              收藏時間：<time dateTime={post.savedAt}>{savedTime(post.savedAt)}</time>
              {post.descriptor.time_token_hint ? <div>原帖時間：{post.descriptor.time_token_hint}</div> : null}
              {post.capturedAt ? <div>原文擷取：<time dateTime={post.capturedAt}>{savedTime(post.capturedAt)}</time></div> : null}
              <div>最新收藏擷取狀態：{statusText[post.status]}</div>
            </div>
            <ul aria-label="所屬工作區" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {workspaces.map((membership) => (
                <li key={membership.sessionId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: tokens.spacing.sm }}>
                  <span style={{ ...textStyles.meta, color: tokens.color.softInk, overflowWrap: "anywhere" }}>{membership.sessionName}</span>
                  <button type="button" data-collection-workspace={membership.sessionId} onClick={() => onOpenWorkspace(membership.sessionId)} style={quietButton}>開啟工作區</button>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </article>
    </section>
  );
}

/** Controlled source browsing: the shell owns query/selection across close and tab changes. */
export function CollectionBrowser({ sessions, query, onQueryChange, selectedKey, onSelect, onCollect, onOpenWorkspace, isLoading = false }: CollectionBrowserProps) {
  const posts = useMemo(() => buildCollectionPosts(sessions), [sessions]);
  const selected = selectedKey ? posts.find((post) => post.key === selectedKey) : undefined;
  const visible = useMemo(() => searchCollectionPosts(posts, query), [posts, query]);
  if (selected) return <CollectionReader key={selected.key} post={selected} onBack={() => onSelect(null)} onOpenWorkspace={onOpenWorkspace} />;

  return (
    <section data-collection-browser="list" aria-label="收藏" aria-busy={isLoading} style={rootStyle}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: tokens.spacing.md, padding: tokens.spacing.lg, flexShrink: 0 }}>
        <h2 style={{ ...textStyles.h3, margin: 0 }}>最近收藏</h2>
        <PrimaryButton onClick={onCollect} dataAttrs={{ "data-collection-action": "collect" }}>收集貼文</PrimaryButton>
        <label style={{ display: "flex", alignItems: "center", gap: tokens.spacing.sm, width: "100%", minWidth: 0, boxSizing: "border-box", border: `1px solid ${tokens.color.lineStrong}`, borderRadius: tokens.radius.round, background: tokens.color.elevated, padding: tokens.spacing.md }}>
          <Search size={tokens.spacing.section} aria-hidden="true" style={{ color: tokens.color.softInk, flexShrink: 0 }} />
          <input type="search" aria-label="搜尋收藏" placeholder="搜尋收藏的內容或作者…" value={query} onChange={(event) => onQueryChange(event.target.value)}
            style={{ ...textStyles.bodyTight, width: "100%", minWidth: 0, border: 0, background: "transparent", color: tokens.color.ink }} />
        </label>
      </header>
      <div style={{ minWidth: 0, padding: `0 ${tokens.spacing.lg}px ${tokens.spacing.lg}px` }}>
        {visible.length ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {visible.map((post) => (
              <li key={post.key} style={{ borderBottom: `1px solid ${tokens.color.line}` }}>
                <button type="button" data-collection-post={post.key} onClick={() => onSelect(post.key)}
                  style={{ display: "flex", alignItems: "center", gap: tokens.spacing.md, width: "100%", minWidth: 0, textAlign: "left", boxSizing: "border-box", padding: `${tokens.spacing.section}px 0`, border: 0, background: "transparent", cursor: "pointer", color: tokens.color.ink }}>
                  <CollectionThumbnail url={post.imageUrls[0]} />
                  <span style={{ display: "grid", gap: tokens.spacing.xs, flex: 1, minWidth: 0 }}>
                    <span style={{ ...textStyles.body, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{post.body || "沒有已保存的原文文字"}</span>
                    <span style={{ ...textStyles.meta, color: tokens.color.softInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.author ? `@${post.author.replace(/^@/, "")}` : "作者未記錄"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" style={{ ...textStyles.body, color: tokens.color.softInk, padding: `${tokens.spacing.xl}px 0`, margin: 0 }}>
            {isLoading ? "正在載入收藏…" : posts.length ? "找不到符合搜尋的收藏。" : "尚未收藏貼文。從 Threads 收集感興趣的內容後，便可在這裡閱讀。"}
          </p>
        )}
      </div>
    </section>
  );
}
