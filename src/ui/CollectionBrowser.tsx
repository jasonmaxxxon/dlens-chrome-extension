import { readInlineCardThread } from "../viewmodel/inline-card";
import { DeepReadingView } from "./DeepReadingView";
import { CollectionProductReading } from "./CollectionProductReading";
import { buildProductReaderModel } from "../viewmodel/product-reader";
import type { ProductSignalAnalysis } from "../state/types";
import { buildDeepReadingModel, toggleDeepDisclosure, EMPTY_DEEP_DISCLOSURE, type DeepCommand } from "../viewmodel/deep-reading";
import { collectionReadingSource, expandReaderEvidenceGroup } from "../viewmodel/collection-reader";
import type { DeepReadingRecord } from "../compare/deep-reading-storage";
import type { ExtensionSettings } from "../state/types";
import type { OpenedReadings } from "../state/opened-readings-storage";
import { WorkspaceModeIcon } from "./WorkspaceModeIcon";
import { buildCollectionReaderModel } from "../viewmodel/collection-reader";
import type { InlineCardEntryKey } from "../viewmodel/inline-card";
import type { InlineReadingRecord } from "../compare/inline-reading-storage";
import type { Topic, Signal } from "../state/types";
import { CollectionAudienceReading } from "./CollectionAudienceReading";
import { useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";

import type { SessionRecord } from "../state/types";
import { buildCollectionArrivalModel, buildCollectionPosts, buildCollectionBrowserModel, collectionSavedTime, COLLECTION_SORTS, buildCollectionFilters, type CollectionFilter, type CollectionSort, type CollectionPost } from "../viewmodel/collection-browser";
import { useCollectionMotion } from "./useCollectionMotion";
import { SavedPostMetrics } from "./SavedPostPreview";
import { collectionTileTint, getModeTheme, textStyles, tokens } from "./tokens";

export interface CollectionBrowserProps {
  sessions: SessionRecord[];
  productAnalyses?: Record<string,ProductSignalAnalysis>;
  productSignals?: Signal[];
  productHasContext?: boolean;
  productLoaded?: boolean;
  productPending?: Record<string,boolean>;
  productErrors?: Record<string,string>;
  onProductAnalyze?: (sessionId:string)=>void;
  onSettings?: ()=>void;
  onCopy?: (text:string)=>void;
  copyStatus?: string;
  readerBackLabel?: string;
  onReaderBack?: () => void;
  requestedLens?: string | null;
  readerRequest?: number;

  settings?: ExtensionSettings;
  deepReadings?: Record<string, DeepReadingRecord>;
  deepPending?: Record<string, boolean>;
  deepErrors?: Record<string, string>;
  onDeepRun?: (itemId: string) => void;
  opened?: OpenedReadings;
  openedError?: string | null;
  assignmentPending?: boolean;
  topics?: Topic[];
  signals?: Signal[];
  readings?: Record<string, InlineReadingRecord>;
  onAssignTopic?: (signalId: string, topicId: string | null) => void;
  query: string;
  sort?: CollectionSort;
  onSortChange?: (sort: CollectionSort) => void;
  nowMs?: number;
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

export function CollectionThumbnail({ post, miniature = false }: { post: CollectionPost; miniature?: boolean }) {
  const url = post.imageUrls[0];
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const size = miniature ? tokens.collection.previewSize : tokens.layout.collectionThumbnailSize;
  const style: CSSProperties = { display: "grid", placeItems: "center", position: "relative", overflow: "hidden",
    width: size, height: size, borderRadius: miniature ? tokens.radius.pill : tokens.collection.thumbnailRadius, flexShrink: 0,
    ...collectionTileTint(post.author), fontFamily: tokens.font.serifCjk, fontSize: miniature ? tokens.collection.metaSize : tokens.collection.tileSize };
  return <span data-collection-thumbnail="" aria-hidden="true" style={style}>
    <span data-collection-type-tile="">{post.tileCharacter}</span>
    {url && failedUrl !== url ? <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
      data-collection-image-loaded={loadedUrl === url ? "true" : "false"} onLoad={() => setLoadedUrl(url)} onError={() => setFailedUrl(url)}
      style={{ display: "block", position: "absolute", inset: 0, width: size, height: size, objectFit: "cover" }} /> : null}
  </span>;
}

export function CollectionReader({ productAnalyses = {}, productSignals = [], productHasContext = false, productLoaded, productPending, productErrors, onProductAnalyze, onSettings, onCopy, copyStatus, requestedLens, readerBackLabel = "收藏", post, onBack, onOpenWorkspace, sessions, topics = [], signals = [], readings = {}, nowMs = 0, onAssignTopic, assignmentPending, settings, deepReadings, deepPending, deepErrors, onDeepRun }: Pick<CollectionBrowserProps, "readerBackLabel" | "productAnalyses" | "productSignals" | "productHasContext" | "productLoaded" | "productPending" | "productErrors" | "onProductAnalyze" | "onSettings" | "onCopy" | "copyStatus" | "requestedLens" | "settings" | "deepReadings" | "deepPending" | "deepErrors" | "onDeepRun" | "sessions" | "topics" | "signals" | "readings" | "nowMs" | "onAssignTopic" | "assignmentPending"> & {
  post: CollectionPost; onBack: () => void; onOpenWorkspace: CollectionBrowserProps["onOpenWorkspace"];
}) {
  const [disclosure, setDisclosure] = useState(EMPTY_DEEP_DISCLOSURE);
  const source = collectionReadingSource(post, sessions);
  const deepReading = source && settings ? buildDeepReadingModel(source.item, settings, deepReadings?.[source.item.id], new Date(nowMs).toISOString(), deepPending?.[source.item.id], deepErrors?.[source.item.id] || null, disclosure) : null;
  const onDeepCommand = (command: DeepCommand) => { if (command.type === "run") { setDisclosure(EMPTY_DEEP_DISCLOSURE); onDeepRun?.(command.itemId); } else setDisclosure(current => toggleDeepDisclosure(current, command)); };
  const [lens, setLens] = useState<string | null>(requestedLens ?? null);
  const [fullText,setFullText]=useState(false);
  const [groupLimits,setGroupLimits]=useState<Record<string,number>>({});
  const reading = buildCollectionReaderModel(post, sessions, topics, signals, readings, nowMs, lens as InlineCardEntryKey | null, groupLimits);
  const productSignal=source?.session.mode === "product" ? productSignals.find(s=>s.sessionId===source.session.id && s.itemId===source.item.id) : null;
  const product=source?.session.mode === "product" && settings ? buildProductReaderModel(source.item,source.session.id,productSignal?.id ?? null,productAnalyses[productSignal?.id ?? ""],settings,productHasContext,lens,((productLoaded === false && !productErrors?.[source.session.id]) || productPending?.[source.session.id]),productErrors?.[source.session.id]) : null;
  const workspaces = [...new Map(post.memberships.map((membership) => [membership.sessionId, membership])).values()];
  return (
    <section data-collection-browser="reader" aria-label="收藏原文" style={rootStyle}>
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0, justifyContent: "space-between", marginTop: -tokens.spacing.md }}>
        <button type="button" data-collection-action="back" onClick={onBack} style={quietButton}>
          ‹ {readerBackLabel}
        </button>
        {post.postUrl ? <a href={post.postUrl} target="_blank" rel="noopener noreferrer" style={{...quietButton,textDecoration:"none"}}>原帖 ↗</a> : null}
      </div>
      <article style={{ minWidth: 0, padding: `${tokens.spacing.sm}px 0 ${tokens.spacing.lg}px` }}>
        <header style={{ display: "flex", alignItems: "center", flexWrap: "nowrap", gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg }}>
          <span aria-hidden="true" style={{...collectionTileTint(post.author),width:tokens.collection.previewSize,height:tokens.collection.previewSize,borderRadius:tokens.radius.round,display:"grid",placeItems:"center",fontSize:tokens.reader.meta}}>{[...post.author][0] || "？"}</span><span style={{ ...textStyles.meta, fontSize: tokens.reader.secondary, color: tokens.color.softInk }}>{post.author ? `@${post.author.replace(/^@/, "")}` : "作者未記錄"}</span><small style={{fontSize:tokens.reader.meta,color:tokens.color.softInk}}>{post.descriptor.time_token_hint}</small>

        </header>
        <div data-collection-reader-body="" style={{ ...textStyles.body, fontSize:tokens.reader.body,lineHeight:tokens.reader.lineHeight,display:"-webkit-box",WebkitLineClamp:fullText ? undefined : tokens.reader.sourceLines,WebkitBoxOrient:"vertical",overflow:"hidden", whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: tokens.color.ink }}>
          {post.body || "沒有已保存的原文文字。"}
        </div>
        {post.imageUrls.length ? (
          <div style={{ display: "grid", gridTemplateColumns: post.imageUrls.length > 1 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)", gap: tokens.spacing.md, alignItems: "start", marginBottom: tokens.spacing.lg }}>
            {post.imageUrls.map((url, index) => <OriginalImage key={url} url={url} index={index} />)}
          </div>
        ) : null}

        <div data-reader-source-meta="" style={{fontSize:tokens.reader.meta,color:tokens.color.softInk,display:"flex",alignItems:"center",gap:tokens.spacing.sm}}>♡ {post.descriptor.engagement.likes ?? "—"} · {post.descriptor.engagement.comments ?? "—"} 則留言 · 讀咗 {source ? readInlineCardThread(source.item).comments.length : 0}<button type="button" onClick={()=>setFullText(v=>!v)} aria-expanded={fullText} style={{...quietButton,fontSize:tokens.reader.meta,marginLeft:"auto"}}>{fullText ? "收起" : "全文"}</button></div>
        {reading ? <CollectionAudienceReading deepReading={deepReading} onDeepCommand={onDeepCommand} assignmentPending={assignmentPending} model={reading} onMore={key=>setGroupLimits(current=>expandReaderEvidenceGroup(current,key))} onLens={setLens} onAssign={(id, topicId) => onAssignTopic?.(id, topicId)} /> : null}
        {product ? <CollectionProductReading model={product} onLens={setLens} onSettings={onSettings} onAnalyze={onProductAnalyze} onCopy={onCopy} copyStatus={copyStatus}/> : null}
        {!reading && deepReading ? <DeepReadingView model={deepReading} onCommand={onDeepCommand}/> : null}
        {post.captureLimit ? <p style={{ ...textStyles.meta, color: tokens.color.softInk, marginTop: tokens.spacing.lg }}>{post.captureLimit}</p> : null}
        <details style={{ borderTop: `1px solid ${tokens.color.line}`, marginTop: tokens.spacing.xl, paddingTop: tokens.spacing.md }}>
          <summary style={{ ...textStyles.meta, color: tokens.color.softInk, cursor: "pointer", padding: tokens.spacing.sm }}>詳情</summary>
          <div style={{ display: "grid", gap: tokens.spacing.md, padding: tokens.spacing.sm, minWidth: 0 }}>
            <SavedPostMetrics descriptor={post.descriptor} />
            <div style={{ ...textStyles.meta, color: tokens.color.softInk }}>
              收藏時間：<time dateTime={post.savedAt}>{collectionSavedTime(post.savedAt)}</time>
              {post.descriptor.time_token_hint ? <div>原帖時間：{post.descriptor.time_token_hint}</div> : null}
              {post.capturedAt ? <div>原文擷取：<time dateTime={post.capturedAt}>{collectionSavedTime(post.capturedAt)}</time></div> : null}
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
// A stable empty default: a fresh {} per render would recompute the rows and loop the motion hook.
const NO_OPENED: OpenedReadings = {};

export function CollectionBrowser({ opened = NO_OPENED, openedError, sessions, query, onQueryChange, sort = "saved", onSortChange, nowMs = 0, selectedKey, onSelect, onCollect, onOpenWorkspace, isLoading = false, topics, signals, readings, onAssignTopic, assignmentPending, settings, deepReadings, deepPending, deepErrors, onDeepRun, productAnalyses, productSignals, productHasContext, productLoaded, productPending, productErrors, onProductAnalyze, onSettings, onCopy, copyStatus, requestedLens, readerRequest, readerBackLabel, onReaderBack }: CollectionBrowserProps) {
  const posts = useMemo(() => buildCollectionPosts(sessions), [sessions]);
  const [filter,setFilter]=useState<CollectionFilter>("all");
  const arrival = useMemo(() => buildCollectionArrivalModel(posts, readings ?? {}, opened, nowMs, false,{analyses:productAnalyses,signals:productSignals,settings,hasContext:productHasContext,loaded:productLoaded}), [posts, readings, opened, nowMs, productAnalyses,productSignals,settings,productHasContext,productLoaded]);
  const filtered=buildCollectionFilters(posts,arrival,filter);
  const selected = selectedKey ? posts.find((post) => post.key === selectedKey) : undefined;
  const model = useMemo(() => buildCollectionBrowserModel(filtered.posts, query, sort, nowMs), [posts,arrival,filter, query, sort, nowMs]);
  const motion = useCollectionMotion(model.rows);
  if (selected) return <>{openedError ? <p role="alert" style={{ ...textStyles.meta, color: tokens.color.softInk }}>{openedError}</p> : null}<CollectionReader readerBackLabel={readerBackLabel} productAnalyses={productAnalyses} productSignals={productSignals} productHasContext={productHasContext} productLoaded={productLoaded} productPending={productPending} productErrors={productErrors} onProductAnalyze={onProductAnalyze} onSettings={onSettings} onCopy={onCopy} copyStatus={copyStatus} requestedLens={requestedLens} settings={settings} deepReadings={deepReadings} deepPending={deepPending} deepErrors={deepErrors} onDeepRun={onDeepRun} assignmentPending={assignmentPending} sessions={sessions} topics={topics} signals={signals} readings={readings} nowMs={nowMs} onAssignTopic={onAssignTopic} key={`${selected.key}:${requestedLens ?? ""}:${readerRequest ?? 0}`} post={selected} onBack={onReaderBack ?? (() => onSelect(null))} onOpenWorkspace={onOpenWorkspace} /></>;
  const metaStyle: CSSProperties = { ...textStyles.meta, fontSize: tokens.collection.metaSize, color: tokens.color.softInk };
  return (
    <section data-collection-browser="list" aria-label="收藏" aria-busy={isLoading} style={rootStyle}>
      <div data-reading-strip="" style={{ display: "grid", gap: tokens.spacing.sm, padding: tokens.spacing.sm }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={metaStyle}>剛讀完</span>
        </div>
        {arrival.recent.length ? arrival.recent.map(row => <button type="button" key={row.itemId + row.at} data-reading-arrival="" onClick={() => onSelect(row.post.key)} style={{ ...quietButton, color: tokens.color.ink, textAlign: "left", width: "100%" }}>
          <WorkspaceModeIcon mode={row.mode} /><span style={{ display: "grid", gap: tokens.spacing.xs, flex: 1, minWidth: 0 }}><b>@{row.post.author.replace(/^@/, "") || "匿名"}</b><span style={metaStyle}>{row.summary}</span></span><time style={metaStyle} dateTime={row.at}>{row.ago}</time>
        </button>) : <p style={{ ...metaStyle, margin: 0 }}>讀完會喺呢度出現，唔使留喺原帖等。</p>}
        {openedError ? <p role="alert" style={{ ...metaStyle, margin: 0 }}>{openedError}</p> : null}
      </div>
      <header style={{ display: "grid", gap: tokens.spacing.md, paddingBottom: tokens.spacing.sm }}>
        <div role="group" aria-label="收藏篩選" style={{display:"flex",overflowX:"auto",gap:tokens.spacing.sm}}>{filtered.chips.map(chip=><button type="button" key={chip.key} data-collection-filter={chip.key} aria-pressed={chip.selected} onClick={()=>setFilter(chip.key)} style={{...quietButton,whiteSpace:"nowrap",flexShrink:0,borderRadius:tokens.radius.pill,background:chip.selected ? tokens.color.ink : tokens.collection.wash,color:chip.selected ? tokens.color.inverse : tokens.color.subInk}}>{chip.label} <small>{chip.count}</small></button>)}</div>
        <label data-collection-search="" style={{ display: "flex", alignItems: "center", gap: tokens.spacing.sm, height: tokens.collection.searchHeight, width: "100%", minWidth: 0, boxSizing: "border-box", borderRadius: tokens.collection.thumbnailRadius, padding: `0 ${tokens.spacing.md}px` }}>
          <Search size={tokens.spacing.section} aria-hidden="true" style={{ color: tokens.color.softInk, flexShrink: 0 }} />
          <input type="search" aria-label="搜尋收藏" placeholder="搜尋收藏的內容或作者" value={query} onChange={(event) => onQueryChange(event.target.value)}
            style={{ ...textStyles.bodyTight, width: "100%", minWidth: 0, border: 0, outline: "none", background: "transparent", color: tokens.color.ink }} />
        </label>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: tokens.spacing.sm, flexWrap: "wrap" }}>
          <span data-collection-count="" style={metaStyle}>{model.count} 篇</span>
          <div role="group" aria-label="收藏排序" style={{ display: "flex", position: "relative", padding: tokens.collection.segmentPadding, background: tokens.collection.wash, borderRadius: tokens.collection.segmentRadius }}>
            <span aria-hidden="true" data-collection-sort-knob="" style={{ position: "absolute", left: tokens.collection.segmentPadding, top: tokens.collection.segmentPadding, bottom: tokens.collection.segmentPadding, width: `calc((100% - ${tokens.collection.segmentPadding * 2}px) / 3)`, transform: `translateX(${COLLECTION_SORTS.findIndex(entry => entry.key === sort) * 100}%)`, background: tokens.color.elevated, borderRadius: tokens.collection.knobRadius, boxShadow: tokens.collection.knobShadow }} />
            {COLLECTION_SORTS.map(entry => <button key={entry.key} type="button" data-collection-sort={entry.key} aria-pressed={entry.key === sort} onClick={() => onSortChange?.(entry.key)}
              style={{ ...metaStyle, position: "relative", zIndex: 1, flex: 1, whiteSpace: "nowrap", height: tokens.collection.segmentHeight, padding: `0 ${tokens.spacing.sm}px`, border: 0, background: "transparent", color: sort === entry.key ? tokens.color.ink : tokens.color.softInk, cursor: "pointer" }}>{entry.label}</button>)}
          </div>
        </div>
      </header>
      <div style={{ minWidth: 0 }}>
        <ul ref={motion.listRef} style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
          {motion.rows.map(({ post, dayLabel, postedRelative, comments, exiting }, index) => (
            <li key={post.key} data-collection-row={post.key} data-collection-exiting={exiting ? "true" : undefined} style={{ position: "relative", display: "grid", gridTemplateRows: "1fr", pointerEvents: exiting ? "none" : undefined }} inert={exiting || undefined}>
              <div style={{ minHeight: 0, overflow: "hidden" }}>
                {dayLabel ? <div data-collection-day="" style={{ ...metaStyle, fontWeight: 600, paddingTop: tokens.spacing.section, paddingBottom: tokens.spacing.xs }}>{dayLabel}</div> : null}
                <button type="button" data-collection-post={post.key} data-collection-arrival="" onClick={() => onSelect(post.key)}
                  style={{ "--collection-delay": `${Math.min(index, tokens.motion.collection.staggerCap) * tokens.motion.collection.staggerMs}ms`, display: "flex", position: "relative", alignItems: "center", gap: tokens.spacing.md, width: "100%", minWidth: 0, textAlign: "left", boxSizing: "border-box", padding: `${tokens.collection.rowPadding}px ${tokens.spacing.sm}px`, border: 0, borderRadius: tokens.radius.card, background: "transparent", cursor: "pointer", color: tokens.color.ink } as CSSProperties}>
                  <CollectionThumbnail post={post} />
                  <span style={{ display: "grid", gap: tokens.spacing.xs, flex: 1, minWidth: 0 }}>
                    <span style={{ ...textStyles.bodyTight, fontSize: tokens.collection.bodySize, lineHeight: tokens.collection.lineHeight, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{post.body || "沒有已保存的原文文字"}</span>
                    <span style={{ ...metaStyle, display: "flex", alignItems: "center", gap: tokens.spacing.xs, overflow: "hidden", whiteSpace: "nowrap" }}>
                      <span title={post.memberships[0]?.sessionName} style={{ width: tokens.collection.dotSize, height: tokens.collection.dotSize, flexShrink: 0, borderRadius: tokens.radius.round, background: getModeTheme(post.memberships[0]?.mode ?? "archive").accent }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{post.author ? `@${post.author.replace(/^@/, "")}` : "作者未記錄"}</span>
                      {postedRelative ? <span>· {postedRelative}</span> : null}<span>· 留言 {comments ?? "—"}</span>
                    </span>
                  </span>
                  {arrival.states[post.key] !== "none" ? <span data-collection-state={arrival.states[post.key]} role="img" aria-label={arrival.states[post.key] === "arc" ? "讀緊留言" : "未打開結果"} style={{ flexShrink: 0, width: arrival.states[post.key] === "arc" ? tokens.collectCard.arcSize : tokens.collection.dotSize, height: arrival.states[post.key] === "arc" ? tokens.collectCard.arcSize : tokens.collection.dotSize, borderRadius: tokens.radius.round, background: arrival.states[post.key] === "dot" ? getModeTheme(post.memberships[0]?.mode ?? "archive").accent : "transparent", border: arrival.states[post.key] === "arc" ? `${tokens.collectCard.arcBorder}px solid ${tokens.color.line}` : undefined, borderTopColor: getModeTheme(post.memberships[0]?.mode ?? "archive").accent, boxSizing: "border-box" }} /> : null}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {!model.count ? <p role="status" style={{ ...textStyles.bodyTight, color: tokens.color.softInk, padding: `${tokens.spacing.xl}px 0`, margin: 0 }}>
          {isLoading ? "正在載入收藏…" : posts.length ? "找不到符合搜尋的收藏。" : "尚未收藏貼文。從 Threads 收集感興趣的內容後，便可在這裡閱讀。"}
        </p> : null}
        <button type="button" data-collection-action="collect" onClick={onCollect} style={{ ...quietButton, marginTop: tokens.spacing.md }}>收集貼文</button>
      </div>
    </section>
  );
}
