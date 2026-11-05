import { awaitingAnalysis, readInlineCardThread } from "../viewmodel/inline-card";
import { DeepReadingView } from "./DeepReadingView";
import { CollectionProductReading } from "./CollectionProductReading";
import { buildProductReaderModel } from "../viewmodel/product-reader";
import type { ProductSignalAnalysis } from "../state/types";
import { buildDeepReadingModel, toggleDeepDisclosure, EMPTY_DEEP_DISCLOSURE, type DeepCommand } from "../viewmodel/deep-reading";
import { collectionReadingSource, expandReaderEvidenceGroup } from "../viewmodel/collection-reader";
import type { DeepReadingRecord } from "../compare/deep-reading-storage";
import type { ExtensionSettings } from "../state/types";
import type { OpenedReadings } from "../state/opened-readings-storage";
import { buildCollectionReaderModel } from "../viewmodel/collection-reader";
import type { InlineCardEntryKey } from "../viewmodel/inline-card";
import type { InlineReadingRecord } from "../compare/inline-reading-storage";
import type { Topic, Signal } from "../state/types";
import { CollectionAudienceReading } from "./CollectionAudienceReading";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";

import type { SessionRecord } from "../state/types";
import { buildCollectionRowStatus, buildCollectionArrivalModel, buildCollectionPosts, buildCollectionBrowserModel, collectionSavedTime, COLLECTION_SORTS, buildCollectionFilters, type CollectionFilter, type CollectionSort, type CollectionPost } from "../viewmodel/collection-browser";
import { CollectionPostCard } from "./CollectionPostCard";
import { WorkspaceModeIcon } from "./WorkspaceModeIcon";
export { CollectionThumbnail } from "./CollectionThumbnail";
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
  /** 重新抓取留言 for the reader's 觀眾反應 post: resolves with an optional note, rejects with the reason. */
  onRecrawl?: (sessionId: string, itemId: string) => Promise<string | null>;
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
  filter?: CollectionFilter;
  onFilterChange?: (filter: CollectionFilter) => void;
  exportRow?: ReactNode;
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

export function CollectionReader({ productAnalyses = {}, productSignals = [], productHasContext = false, productLoaded, productPending, productErrors, onProductAnalyze, onSettings, onCopy, copyStatus, requestedLens, readerBackLabel = "收藏", post, onBack, onOpenWorkspace, sessions, topics = [], signals = [], readings = {}, nowMs = 0, onAssignTopic, assignmentPending, settings, deepReadings, deepPending, deepErrors, onDeepRun, onRecrawl }: Pick<CollectionBrowserProps, "readerBackLabel" | "productAnalyses" | "productSignals" | "productHasContext" | "productLoaded" | "productPending" | "productErrors" | "onProductAnalyze" | "onSettings" | "onCopy" | "copyStatus" | "requestedLens" | "settings" | "deepReadings" | "deepPending" | "deepErrors" | "onDeepRun" | "onRecrawl" | "sessions" | "topics" | "signals" | "readings" | "nowMs" | "onAssignTopic" | "assignmentPending"> & {
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
  // 重新抓取留言: only this click crawls a finished 觀眾反應 post again, since it costs a crawl and then AI readings.
  const audience = source?.session.mode === "topic" ? source : null;
  const [recrawl, setRecrawl] = useState<{ pending: boolean; from: string | null; note: string | null; failed: boolean }>({ pending: false, from: null, note: null, failed: false });
  // The panel may see the queued item only at its next sync; until then the old capture must not offer a second crawl.
  const recrawlSent = !!audience && recrawl.from !== null && recrawl.from === audience.item.captureId;
  const canRecrawl = !!onRecrawl && !!audience && audience.item.status === "succeeded" && !awaitingAnalysis(audience.item, nowMs);
  const startRecrawl = () => {
    if (!audience || !onRecrawl || recrawl.pending) return;
    const from = audience.item.captureId;
    setRecrawl({ pending: true, from: null, note: null, failed: false });
    onRecrawl(audience.session.id, audience.item.id).then(
      (note) => setRecrawl({ pending: false, from, note, failed: false }),
      (error: unknown) => setRecrawl({ pending: false, from: null, note: error instanceof Error ? error.message : String(error), failed: true }));
  };
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
              {post.capturedAt ? <div>原文擷取：<time dateTime={post.capturedAt}>{collectionSavedTime(post.capturedAt)}</time></div> : null}
              <div>最新收藏擷取狀態：{statusText[post.status]}</div>
            </div>
            {canRecrawl ? <button type="button" data-collection-action="recrawl" disabled={recrawl.pending || recrawlSent} onClick={startRecrawl} title="再抓一次呢篇嘅留言，完成後按新留言重新整理閱讀（會用一次抓取同 AI）" style={{ ...quietButton, justifySelf: "start" }}>{recrawl.pending ? "排緊隊…" : recrawlSent ? "已排隊" : "重新抓取留言"}</button> : null}
            {recrawl.note ? <p role={recrawl.failed ? "alert" : "status"} style={{ ...textStyles.meta, color: tokens.color.softInk, margin: 0 }}>{recrawl.note}</p> : null}
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

export function CollectionBrowser({ opened = NO_OPENED, openedError, sessions, query, onQueryChange, sort = "saved", onSortChange, nowMs = 0, selectedKey, onSelect, filter: controlledFilter, onFilterChange, exportRow, onOpenWorkspace, isLoading = false, topics, signals, readings, onAssignTopic, assignmentPending, settings, deepReadings, deepPending, deepErrors, onDeepRun, onRecrawl, productAnalyses, productSignals, productHasContext, productLoaded, productPending, productErrors, onProductAnalyze, onSettings, onCopy, copyStatus, requestedLens, readerRequest, readerBackLabel, onReaderBack }: CollectionBrowserProps) {
  const posts = useMemo(() => buildCollectionPosts(sessions), [sessions]);
  const [localFilter,setLocalFilter]=useState<CollectionFilter>("all");
  const filter = controlledFilter ?? localFilter;
  const setFilter = onFilterChange ?? setLocalFilter;
  const arrival = useMemo(() => buildCollectionArrivalModel(posts, readings ?? {}, opened, nowMs, false,{analyses:productAnalyses,signals:productSignals,settings,hasContext:productHasContext,loaded:productLoaded}), [posts, readings, opened, nowMs, productAnalyses,productSignals,settings,productHasContext,productLoaded]);
  const filtered=buildCollectionFilters(posts,arrival,filter,sessions);
  const selected = selectedKey ? posts.find((post) => post.key === selectedKey) : undefined;
  const model = useMemo(() => buildCollectionBrowserModel(filtered.posts, query, sort, nowMs), [posts,arrival,filter, query, sort, nowMs]);
  const motion = useCollectionMotion(model.rows);
  const rowStatuses = useMemo(() => Object.fromEntries(posts.map(post => [post.key, buildCollectionRowStatus(post, sessions, readings ?? {}, { analyses: productAnalyses, signals: productSignals, settings, hasContext: productHasContext, loaded: productLoaded }, nowMs)])), [posts, sessions, readings, productAnalyses, productSignals, settings, productHasContext, productLoaded, nowMs]);
  const filterRef = useRef<HTMLDivElement>(null);
  const [filterOverflow, setFilterOverflow] = useState(false);
  const updateFilterOverflow = () => {
    const element = filterRef.current;
    setFilterOverflow(!!element && element.scrollWidth - element.clientWidth - element.scrollLeft > 1);
  };
  useLayoutEffect(() => {
    updateFilterOverflow();
    const element = filterRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateFilterOverflow);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selectedKey, sessions, filter]);
  if (selected) return <>{openedError ? <p role="alert" style={{ ...textStyles.meta, color: tokens.color.softInk }}>{openedError}</p> : null}<CollectionReader readerBackLabel={readerBackLabel} productAnalyses={productAnalyses} productSignals={productSignals} productHasContext={productHasContext} productLoaded={productLoaded} productPending={productPending} productErrors={productErrors} onProductAnalyze={onProductAnalyze} onSettings={onSettings} onCopy={onCopy} copyStatus={copyStatus} requestedLens={requestedLens} settings={settings} deepReadings={deepReadings} deepPending={deepPending} deepErrors={deepErrors} onDeepRun={onDeepRun} onRecrawl={onRecrawl} assignmentPending={assignmentPending} sessions={sessions} topics={topics} signals={signals} readings={readings} nowMs={nowMs} onAssignTopic={onAssignTopic} key={`${selected.key}:${requestedLens ?? ""}:${readerRequest ?? 0}`} post={selected} onBack={onReaderBack ?? (() => onSelect(null))} onOpenWorkspace={onOpenWorkspace} /></>;
  const panel = tokens.panel;
  const metaStyle: CSSProperties = { ...panel.type.meta, color: panel.ink3, fontVariantNumeric: "tabular-nums" };
  const buttonStyle: CSSProperties = { ...panel.type.bodySm, minHeight: panel.size.buttonSm, border: 0, padding: `0 ${panel.space.sm}px`, borderRadius: panel.radius.sm, color: panel.accentInk, background: "transparent", cursor: "pointer", fontFamily: tokens.font.sans };
  return (
    <section data-collection-browser="list" aria-label="收藏" aria-busy={isLoading} style={{ ...rootStyle, color: panel.ink, fontFamily: tokens.font.sans }}>
      <header style={{ display: "grid", gap: panel.space.sm }}>
        <label data-collection-search="" style={{ display: "flex", alignItems: "center", gap: panel.space.sm, height: panel.size.input, width: "100%", minWidth: 0,
          boxSizing: "border-box", background: panel.surface, border: `1px solid ${panel.border}`, borderRadius: panel.radius.sm, padding: `0 ${panel.space.md}px` }}>
          <Search size={panel.size.icon} strokeWidth={1.75} aria-hidden="true" style={{ color: panel.ink3, flexShrink: 0 }} />
          <input type="search" aria-label="搜尋收藏" placeholder="搜尋內容或作者" value={query} onChange={event => onQueryChange(event.target.value)}
            style={{ ...panel.type.bodySm, fontFamily: tokens.font.sans, width: "100%", minWidth: 0, border: 0, background: "transparent", color: panel.ink }} />
        </label>
        <div ref={filterRef} data-collection-filter-scroll="" role="group" aria-label="收藏篩選" onScroll={updateFilterOverflow}
          style={{ display: "flex", flexWrap: "nowrap", overflowX: "auto", minWidth: 0, gap: panel.space.xs + panel.space.xxs, scrollbarWidth: "none", scrollSnapType: "x proximity", maskImage: filterOverflow ? panel.scrollMask : undefined }}>
          {filtered.chips.map(chip => <button type="button" key={chip.key} data-collection-filter={chip.key} aria-pressed={chip.selected} onClick={() => setFilter(chip.key)}
            style={{ ...panel.type.meta, fontFamily: tokens.font.sans, display: "inline-flex", alignItems: "center", gap: panel.space.xs, height: panel.size.chip,
              padding: `0 ${panel.space.sm + panel.space.xxs}px`, flex: "none", whiteSpace: "nowrap", border: 0, borderRadius: panel.radius.pill,
              background: chip.selected ? panel.ink : panel.surfaceSubtle, color: chip.selected ? panel.surface : panel.ink2, cursor: "pointer" }}>
            {chip.label}<span style={{ ...panel.type.micro, color: chip.selected ? panel.chipCountOn : panel.ink3, fontVariantNumeric: "tabular-nums" }}>{chip.count}</span>
          </button>)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: panel.space.sm, minWidth: 0 }}>
          <span data-collection-count="" style={metaStyle}>{model.count} 篇</span>
          <div role="group" aria-label="收藏排序" style={{ display: "flex", position: "relative", background: panel.surfaceSunken, borderRadius: panel.radius.sm }}>
            <span aria-hidden="true" data-collection-sort-knob="" style={{ position: "absolute", left: panel.space.xxs, top: panel.space.xxs, bottom: panel.space.xxs,
              width: `calc((100% - ${panel.space.xs}px) / 3)`, transform: `translateX(${COLLECTION_SORTS.findIndex(entry => entry.key === sort) * 100}%)`, background: panel.surface, borderRadius: panel.radius.xs, boxShadow: panel.shadow.card }} />
            {COLLECTION_SORTS.map(entry => <button key={entry.key} type="button" data-collection-sort={entry.key} aria-pressed={entry.key === sort} onClick={() => onSortChange?.(entry.key)}
              style={{ ...panel.type.micro, fontFamily: tokens.font.sans, position: "relative", zIndex: 1, flex: 1, whiteSpace: "nowrap", height: panel.size.buttonSm,
                padding: `0 ${panel.space.sm}px`, border: 0, background: "transparent", color: sort === entry.key ? panel.ink : panel.ink3, cursor: "pointer" }}>{entry.label}</button>)}
          </div>
        </div>
      </header>
      {filter === "product" ? exportRow : null}
      {!query.trim() && arrival.recent.length > 0 ? <div data-reading-strip="" style={{ display: "grid", gap: panel.space.xxs, marginTop: panel.space.md }}>
        <span style={{ ...panel.type.micro, color: panel.ink3, fontWeight: 600 }}>啱啱讀完</span>
        {arrival.recent.slice(0, 2).map(row => <button type="button" key={row.itemId + row.at} data-reading-arrival="" onClick={() => onSelect(row.post.key)}
          style={{ ...buttonStyle, display: "flex", alignItems: "center", gap: panel.space.sm, minHeight: panel.size.input, textAlign: "left", width: "100%", minWidth: 0, padding: `0 ${panel.space.sm}px`, color: panel.ink2 }}>
          <WorkspaceModeIcon mode={row.mode} /><span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{row.post.author.replace(/^@/, "") || "匿名"} · 讀完 <time dateTime={row.at}>{row.ago}</time></span><span style={{ color: panel.accentInk, flexShrink: 0 }}>打開 ›</span>
        </button>)}
      </div> : null}
      {openedError ? <p role="alert" style={{ ...metaStyle, color: panel.danger, background: panel.dangerSoft, margin: `${panel.space.sm}px 0 0`, padding: panel.space.sm, borderRadius: panel.radius.sm }}>{openedError}</p> : null}
      <div style={{ minWidth: 0, paddingTop: panel.space.md }}>
        <ul ref={motion.listRef} style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
          {motion.rows.map(({ post, dayLabel, postedRelative, comments, exiting }) => (
            <li key={post.key} data-collection-row={post.key} data-collection-exiting={exiting ? "true" : undefined}
              style={{ position: "relative", display: "grid", gridTemplateRows: "1fr", marginBottom: panel.space.sm, pointerEvents: exiting ? "none" : undefined }} inert={exiting || undefined}>
              <div style={{ minHeight: 0 }}>
                {dayLabel ? <div data-collection-day="" style={{ ...panel.type.micro, color: panel.ink3, fontWeight: 600, paddingTop: panel.space.lg, paddingBottom: panel.space.xs }}>{dayLabel}</div> : null}
                <CollectionPostCard post={post} status={rowStatuses[post.key]} postedRelative={postedRelative} comments={comments} arrival={arrival.states[post.key]} onOpen={() => onSelect(post.key)} />
              </div>
            </li>
          ))}
        </ul>
        {!model.count ? <p role="status" style={{ ...panel.type.bodySm, color: panel.ink3, padding: `${panel.space.xxl}px 0`, margin: 0 }}>
          {isLoading ? "正在載入收藏…" : posts.length ? "找不到符合搜尋的收藏。" : "尚未收藏貼文。從 Threads 收集感興趣的內容後，便可在這裡閱讀。"}
        </p> : null}
      </div>
    </section>
  );
}
