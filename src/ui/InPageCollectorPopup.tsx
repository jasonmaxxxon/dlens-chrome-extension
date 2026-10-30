import {
useEffect,
useLayoutEffect,
useRef,
useState,
type CSSProperties,
type Dispatch,
type RefObject,
type SetStateAction
} from "react";
import { IS_PR_ONLY_BUILD } from "../build-variant";
import { isProductContextSourceReady } from "../compare/product-context";
import { getProcessingFailureMessage } from "../state/processing-errors";
import { getModeHomePage } from "../state/processing-state";
import type { FolderMode,PopupPage } from "../state/types";
import type { CollectionFilter,CollectionSort } from "../viewmodel/collection-browser";
import { buildCollectionInView,buildCollectionPosts } from "../viewmodel/collection-browser";
import { collectionReadingSource,resolveCollectionReaderOpen } from "../viewmodel/collection-reader";
import type { PrEvidenceCommand } from "../viewmodel/pr-evidence";
import { EMPTY_DISCOURSE_UI,buildTopicDiscourseViewModel,type DiscourseUiState } from "../viewmodel/topic-discourse";
import { buildTopicReadingModel } from "../viewmodel/topic-reading";
import { workspaceCollectionDestination } from "../viewmodel/workspace-destination";
import { CollectionBrowser } from "./CollectionBrowser";
import { CollectionSignalPacketExport } from "./CollectionSignalPacketExport";
import { CollectionWorkspaceShell,type CollectionTab } from "./CollectionWorkspaceShell";
import { PrEvidenceView } from "./PrEvidenceViews";
import { SettingsView } from "./SettingsView";
import { TopicDiscourseView,type TopicDiscourseCommand } from "./TopicDiscourseView";
import { WorkspaceHomeView } from "./WorkspaceHomeView";
import { DLENS_BUTTON_CSS,StatusRail,WorkspaceSurface } from "./components";
import { LanguageProvider } from "./i18n";
import { OPEN_WORKSPACE_EVENT,consumeAiSettingsOpen,consumeReaderOpen,consumeWorkspaceOpen } from "./inpage-helpers";
import {
buildPrEvidenceUiReadyEvent,
usePipelineUiReadyTrace
} from "./pipeline-ui-ready";
import { tokens } from "./tokens";
import { discourseQuestionPatch,restoreDiscourseReaderOrigin } from "./topic-discourse-controller";
import { useCollectionClock } from "./useCollectionMotion";
import { useCollectionProducts } from "./useCollectionProducts";
import { useCollectionReaderLive,useCollectionReaderTopics } from "./useCollectionReaderTopics";
import { useDeepReadings } from "./useDeepReadings";
import { useDiscourseFeeds } from "./useDiscourseFeeds";
import type { InPageCollectorAppModel } from "./useInPageCollectorAppState";
import { useOpenedReadings } from "./useOpenedReadings";
import { useTopicReadings } from "./useTopicReadings";
import { useWorkspaceScrollMotion } from "./useWorkspaceScrollMotion";

interface ReadingNavigation {
  tab: CollectionTab;
  workspaceOpen: boolean;
  settingsOpen: boolean;
  query: string;
  sort: CollectionSort;
  filter: CollectionFilter;
  selectedKey: string | null;
  requestedLens?: string | null;
  readerRequest?: number;
  discourseReturn?: { topicId: string | null; label: string; sessionId: string };
  returnPage?: PopupPage;
  workspaceSessionId?: string;
  workspacePage?: PopupPage;
}

const SETTINGS_WORKSPACE_SURFACE_STYLE: CSSProperties = {
  padding: 0,
  background: "transparent",
  boxShadow: "none",
  border: "none",
  overflow: "visible"
};

export function InPageCollectorPopup({ app }: { app: InPageCollectorAppModel }) {
  const popupOpen = app.popupOpen;
  const [readingNavigation, setReadingNavigation] = useState<ReadingNavigation>({
    tab: IS_PR_ONLY_BUILD ? "workspaces" : "collection", workspaceOpen: IS_PR_ONLY_BUILD,
    settingsOpen: false, query: "", sort: "saved", filter: "all", selectedKey: null
  });
  const navigationPending = useRef(false);
  const [navigationBusy, setNavigationBusy] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const scrollPositions = useRef(new Map<string, number>());
  // The motion hook also stays facade-owned so its same-route presence history
  // survives the DOM unmount. With active=false it returns before touching the
  // empty route key, so closing does not consume a second lead soft-pop.
  const scrollRef = useRef<HTMLDivElement>(null);
  const motionRouteKey = popupOpen
    ? [
        app.activeFolder?.mode ?? "archive",
        app.page,
        app.activeFolder?.id ?? "",
        app.activePrCampaign?.id ?? ""
      ].join(":")
    : "";
  const scrollTrackRef = useWorkspaceScrollMotion(scrollRef, {
    active: popupOpen,
    routeKey: motionRouteKey
  });

  if (!popupOpen) {
    return null;
  }

  return (
    <OpenInPageCollectorPopup
      app={app}
      scrollRef={scrollRef}
      scrollTrackRef={scrollTrackRef}
      scrollPositions={scrollPositions.current}
      navigationControl={{ pending: navigationPending, busy: navigationBusy, setBusy: setNavigationBusy, error: navigationError, setError: setNavigationError }}
      readingNavigation={readingNavigation}
      setReadingNavigation={setReadingNavigation}
    />
  );
}

function OpenInPageCollectorPopup({
  app,
  scrollRef,
  scrollTrackRef,
  scrollPositions,
  readingNavigation,
  setReadingNavigation,
  navigationControl
}: {
  app: InPageCollectorAppModel;
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollTrackRef: RefObject<HTMLDivElement | null>;
  scrollPositions: Map<string, number>;
  readingNavigation: ReadingNavigation;
  setReadingNavigation: Dispatch<SetStateAction<ReadingNavigation>>;
  navigationControl: { pending: RefObject<boolean>; busy: boolean; setBusy: Dispatch<SetStateAction<boolean>>; error: string | null; setError: Dispatch<SetStateAction<string | null>> };
}) {
  const { snapshot, page, activeFolder } = app;
  const { pending: navigationPending, busy: navigationBusy, setBusy: setNavigationBusy, error: navigationError, setError: setNavigationError } = navigationControl;
  const workspaceAllowed = !IS_PR_ONLY_BUILD || (activeFolder?.mode === "pr-evidence" && (page === "pr-evidence" || page === "settings"));
  const nowMs = useCollectionClock();
  const domainPage = readingNavigation.settingsOpen ? "settings"
    : readingNavigation.tab === "workspaces" && readingNavigation.workspaceOpen && workspaceAllowed ? page : null;
  const guardedPage = page as PopupPage;
  const activeFolderMode = activeFolder?.mode ?? "archive";
  const uiLang = snapshot?.global.settings.layoutPreferences.language ?? "zh";
  // Explicit home/topic selection; feed visibility is owned by F1's collection bar.
  const [discourseSelection, setDiscourseSelection] = useState<Record<string,string|null>>({});
  const discourseTopicId = discourseSelection[activeFolder?.id ?? ""] ?? null;
  const setDiscourseTopicId = (topicId:string|null) => setDiscourseSelection(current=>({...current,[activeFolder?.id ?? ""]:topicId}));
  const [discourseUi, setDiscourseUi] = useState<Record<string,DiscourseUiState>>({});
  const discourseUiKey = `${activeFolder?.id ?? ""}:${discourseTopicId ?? "home"}`;
  const topicReadings = useTopicReadings(true);
  const deepReadings = useDeepReadings(true);
  const discourseFeeds = useDiscourseFeeds(true);
  const products=useCollectionProducts(snapshot?.global.sessions ?? []);
  const productHasContext=products.hasContext || isProductContextSourceReady(snapshot?.global.settings.productProfile);
  const [copyStatus,setCopyStatus]=useState<string>('');
  useEffect(()=>setCopyStatus(''),[readingNavigation.selectedKey]);
  const collectionPosts=buildCollectionPosts(snapshot?.global.sessions ?? []);
  const inView=IS_PR_ONLY_BUILD ? null : buildCollectionInView(collectionPosts,discourseFeeds.inViewPostKey,readingNavigation.tab==='collection' && !domainPage ? readingNavigation.selectedKey : null);
  const openedReadings = useOpenedReadings(true, !domainPage && readingNavigation.tab === "collection" ? readingNavigation.selectedKey : null, snapshot?.global.sessions ?? [], discourseFeeds.readings,{analyses:products.analyses,signals:products.signals,settings:snapshot?.global.settings,hasContext:productHasContext,loaded:products.loaded});
  const readerSource = !domainPage && readingNavigation.tab === "collection"
    ? collectionReadingSource(buildCollectionPosts(snapshot?.global.sessions ?? []).find(p => p.key === readingNavigation.selectedKey), snapshot?.global.sessions ?? []) : null;
  const readerSessionId = readerSource?.session.mode === "topic" ? readerSource.session.id : null;
  useCollectionReaderLive(readerSource, readerSource ? discourseFeeds.readings[readerSource.item.id] : undefined);
  const readerTopics = useCollectionReaderTopics(readerSessionId);
  const discourseViewModel = domainPage === "topics"
    ? buildTopicDiscourseViewModel({
        topics: app.topics,
        signals: app.signals,
        items: activeFolder?.items ?? [],
        readings: discourseFeeds.readings,
        selectedTopicId: discourseTopicId,
        inViewPostKey: null,
        opened: openedReadings.opened,
        now: app.readWallClockNowMs()
      })
    : null;
  const selectedDiscourseTopic = domainPage === "topics" ? app.topics.find(t=>t.id===discourseTopicId) : undefined;
  const discourseItems = domainPage === "topics" ? (activeFolder?.items ?? []).filter(item=>app.signals.some(signal=>signal.itemId===item.id && signal.topicId===discourseTopicId)) : [];
  const topicReadingModel = selectedDiscourseTopic && snapshot ? buildTopicReadingModel(selectedDiscourseTopic,discourseItems,snapshot.global.settings,topicReadings.records[selectedDiscourseTopic.id],new Date(nowMs).toISOString(),topicReadings.pending[selectedDiscourseTopic.id],topicReadings.errors[selectedDiscourseTopic.id] || null,discourseFeeds.readings,deepReadings.records) : null;
  function onDiscourseCommand(command: TopicDiscourseCommand) {
    const fail = (e:unknown) => setNavigationError(e instanceof Error ? e.message : "操作失敗");
    if (command.kind === "select-topic") setDiscourseTopicId(command.topicId);
    else if (command.kind === "assign") void app.onSignalTriaged(command.signalId, { kind: "assign", topicId: command.topicId }).catch(fail);
    else if (command.kind === "create-topic") void app.onCreateTopicNamed(command.name, command.researchQuestion,command.signalId).catch(fail);
    else if (command.kind === "move-product") {
      const signal = app.signals.find(s => s.id === command.signalId);
      if (signal?.itemId) void app.onMoveAudienceItem(signal.sessionId, signal.itemId).catch(fail);
    } else if (command.kind === "delete-signal") void app.onSignalDeleted(command.signalId).catch(fail);
    else if (command.kind === "update-question") {
      const topic=app.topics.find(t=>t.id===command.topicId);
      if(topic) {const update=discourseQuestionPatch(topic,command.researchQuestion);void app.onUpdateTopic(update.patch,update.id).catch(fail);}
    } else if (command.kind === "run-reading") void topicReadings.run(command.topicId);
    else if (command.kind === "open-reader") {
      const target=resolveCollectionReaderOpen(collectionPosts,command.itemId);
      if(target && activeFolder) setReadingNavigation(current=>({...current,tab:'collection',settingsOpen:false,selectedKey:target.key,requestedLens:null,readerRequest:(current.readerRequest ?? 0)+1,discourseReturn:{...command.returnTo,sessionId:activeFolder.id}}));
    } else void app.onDeleteTopic(command.topicId).catch(fail);
  }
  const readerBack = async () => {
    const origin=readingNavigation.discourseReturn;
    if(!origin) {setReadingNavigation(current=>({...current,selectedKey:null}));return;}
    if(navigationPending.current)return;
    navigationPending.current=true;setNavigationBusy(true);setNavigationError(null);
    try {
      await restoreDiscourseReaderOrigin(origin,activeFolder?.id,page,async id=>{
        const result=await app.onSetActiveSession(id);
        if(result && !result.ok)throw new Error("未能返回觀眾反應");
      },app.onNavigate);
      setDiscourseSelection(current=>({...current,[origin.sessionId]:origin.topicId}));
      setReadingNavigation(current=>({...current,tab:'workspaces',workspaceOpen:true,workspaceSessionId:origin.sessionId,workspacePage:'topics',selectedKey:null,discourseReturn:undefined,requestedLens:null}));
    } catch(e) {setNavigationError(e instanceof Error ? e.message : "未能返回觀眾反應");}
    finally {navigationPending.current=false;setNavigationBusy(false);}
  };
  usePipelineUiReadyTrace(domainPage === "pr-evidence" ? buildPrEvidenceUiReadyEvent(app.prEvidenceViewModel) : null);

  const prBriefInputRef = useRef<HTMLInputElement>(null);

  const scrollKey = readingNavigation.settingsOpen ? "settings"
    : readingNavigation.tab === "collection" ? JSON.stringify(["collection", readingNavigation.selectedKey ?? "list"])
    : !readingNavigation.workspaceOpen || !workspaceAllowed ? "workspace-list"
    : JSON.stringify(["workspace", activeFolder?.id, guardedPage, guardedPage === "topics" ? discourseTopicId ?? "home" : ""]);

  // Save on scroll, before a shorter route can clamp the viewport during DOM
  // replacement. The facade map survives closing the popup and unmounting this view.
  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const target = scrollPositions.get(scrollKey) ?? 0;
    let restoring = true;
    let observer: ResizeObserver | undefined;
    const stopRestoring = () => {
      restoring = false;
      observer?.disconnect();
    };
    const restore = () => {
      if (!restoring) return;
      viewport.scrollTop = target;
      if (viewport.scrollTop >= target) stopRestoring();
    };
    const rememberScroll = () => {
      // A clamped programmatic scroll must not overwrite the requested offset.
      if (!restoring) scrollPositions.set(scrollKey, viewport.scrollTop);
    };
    const cancelRestoration = () => { stopRestoring(); rememberScroll(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) cancelRestoration();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === viewport) cancelRestoration();
    };
    restore();
    // Images can be shorter before load. Retry on real size changes only, and
    // yield immediately to user scrolling instead of pulling them back later.
    const ResizeObserverClass = viewport.ownerDocument.defaultView?.ResizeObserver;
    if (restoring && ResizeObserverClass && scrollTrackRef.current) {
      observer = new ResizeObserverClass(restore);
      observer.observe(scrollTrackRef.current);
    }
    viewport.addEventListener("scroll", rememberScroll, { passive: true });
    viewport.addEventListener("load", restore, true);
    viewport.addEventListener("wheel", cancelRestoration, { passive: true });
    viewport.addEventListener("touchstart", cancelRestoration, { passive: true });
    viewport.addEventListener("keydown", onKeyDown);
    viewport.addEventListener("pointerdown", onPointerDown);
    return () => {
      stopRestoring();
      viewport.removeEventListener("scroll", rememberScroll);
      viewport.removeEventListener("load", restore, true);
      viewport.removeEventListener("wheel", cancelRestoration);
      viewport.removeEventListener("touchstart", cancelRestoration);
      viewport.removeEventListener("keydown", onKeyDown);
      viewport.removeEventListener("pointerdown", onPointerDown);
    };
  }, [scrollKey, scrollPositions, scrollRef, scrollTrackRef]);

  useEffect(() => {
    if (navigationPending.current || !activeFolder || !workspaceAllowed || readingNavigation.tab !== "workspaces" || !readingNavigation.workspaceOpen || readingNavigation.settingsOpen || page === "settings") return;
    setReadingNavigation((current) => {
      if (current.workspaceSessionId === activeFolder.id && current.workspacePage === page) return current;
      return { ...current, workspaceSessionId: activeFolder.id, workspacePage: page };
    });
  }, [activeFolder?.id, page, readingNavigation.tab, readingNavigation.workspaceOpen, readingNavigation.settingsOpen, workspaceAllowed]);

  async function selectPrimaryTab(tab: CollectionTab) {
    if (navigationPending.current) return;
    setNavigationError(null);
    if (tab === "workspaces" && readingNavigation.workspaceOpen && readingNavigation.workspaceSessionId) {
      navigationPending.current = true;
      setNavigationBusy(true);
      try {
        if (activeFolder?.id !== readingNavigation.workspaceSessionId) {
          const result = await app.onSetActiveSession(readingNavigation.workspaceSessionId);
          if (result && !result.ok) throw new Error("workspace unavailable");
        }
        await app.onNavigate(readingNavigation.workspacePage ?? readingNavigation.returnPage ?? getModeHomePage(activeFolderMode));
      } catch { setNavigationError("未能返回工作區，請再試。"); return; }
      finally { navigationPending.current = false; setNavigationBusy(false); }
    }
    setReadingNavigation((current) => ({ ...current, tab,  settingsOpen: false, discourseReturn: undefined }));
  }

  async function openWorkspace(sessionId: string) {
    const session = snapshot?.global.sessions.find((item) => item.id === sessionId);
    if (!session || navigationPending.current || (IS_PR_ONLY_BUILD && session.mode !== "pr-evidence")) return;
    navigationPending.current = true;
    setNavigationBusy(true);
    setNavigationError(null);
    try {
      const result = await app.onSetActiveSession(sessionId);
      if (result && !result.ok) throw new Error("workspace unavailable");
      await app.onNavigate(getModeHomePage(session.mode));
      setReadingNavigation((current) => ({ ...current, ...workspaceCollectionDestination(session.mode), selectedKey: null, requestedLens: null, discourseReturn: undefined, settingsOpen: false, workspaceSessionId: sessionId, workspacePage: getModeHomePage(session.mode) }));
    } catch {
      setNavigationError("未能開啟工作區，請再試。");
    } finally { navigationPending.current = false; setNavigationBusy(false); }
  }

  useEffect(() => {
    const listener = () => {
      if (navigationPending.current) return;
      if (consumeAiSettingsOpen()) {
        scrollPositions.set("settings", 0);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        setReadingNavigation(current => ({...current, settingsOpen:true}));
        void app.onNavigate("settings");
        return;
      }
      const reader=consumeReaderOpen(snapshot?.global.sessions.flatMap(s=>s.items.map(i=>i.id)) ?? []);
      if (reader) {
        const target=resolveCollectionReaderOpen(collectionPosts,reader.itemId,reader.lens);
        if (target && !IS_PR_ONLY_BUILD) setReadingNavigation(current=>({...current,tab:'collection',workspaceOpen:false,settingsOpen:false,selectedKey:target.key,requestedLens:target.lens,discourseReturn:undefined,readerRequest:(current.readerRequest ?? 0)+1}));
        return;
      }
      const sessionId = consumeWorkspaceOpen(snapshot?.global.sessions.map((session) => session.id) ?? []);
      if (sessionId) void openWorkspace(sessionId);
    };
    window.addEventListener(OPEN_WORKSPACE_EVENT, listener);
    listener();
    return () => window.removeEventListener(OPEN_WORKSPACE_EVENT, listener);
  });

  useEffect(()=>{
    if (!readingNavigation.readerRequest || domainPage || readingNavigation.tab!=='collection') return;
    const frame=window.requestAnimationFrame(()=>scrollRef.current?.querySelector('[data-reader-answer]')?.scrollIntoView?.({block:'start'}));
    return ()=>window.cancelAnimationFrame(frame);
  },[readingNavigation.readerRequest,readingNavigation.selectedKey,domainPage]);

  async function createWorkspace(name: string, mode: FolderMode) {
    if (navigationPending.current || (IS_PR_ONLY_BUILD && mode !== "pr-evidence")) return { ok: false };
    navigationPending.current = true;
    setNavigationBusy(true);
    try {
      const result = await app.onCreateWorkspace(name, mode);
      if (!result.ok) return result;
      await app.onNavigate(getModeHomePage(mode));
      setReadingNavigation((current) => ({ ...current, ...workspaceCollectionDestination(mode), selectedKey: null, settingsOpen: false, workspaceSessionId: result.snapshot?.global.activeSessionId ?? undefined, workspacePage: getModeHomePage(mode) }));
      return result;
    } finally { navigationPending.current = false; setNavigationBusy(false); }
  }

  async function manageWorkspace(sessionId: string, action: "rename" | "delete", name = "") {
    const session = snapshot?.global.sessions.find((item) => item.id === sessionId);
    if (navigationPending.current || !session || (IS_PR_ONLY_BUILD && session.mode !== "pr-evidence")) return { ok: false as const };
    navigationPending.current = true;
    setNavigationBusy(true);
    setNavigationError(null);
    try {
      const response = action === "rename"
        ? await app.onRenameWorkspace(sessionId, name)
        : await app.onDeleteWorkspace(sessionId);
      if (!response.ok) throw new Error("workspace mutation failed");
      return response;
    } catch {
      setNavigationError(action === "rename" ? "未能重新命名工作區，請再試一次。" : "未能刪除工作區，請再試一次。");
      return { ok: false as const };
    } finally {
      navigationPending.current = false;
      setNavigationBusy(false);
    }
  }

  function handlePrEvidenceCommand(command: PrEvidenceCommand) {
    if (command.kind === "requestBriefUpload") {
      prBriefInputRef.current?.click();
      return;
    }
    return app.onPrEvidenceCommand(command);
  }

  return (
    <LanguageProvider value={uiLang}>
    <div
      data-dlens-control="true"
      data-workspace-popup="shell"
      style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden", color: tokens.color.ink, fontFamily: tokens.font.sans }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <style>{DLENS_BUTTON_CSS}</style>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: tokens.collection.paper, pointerEvents: "none" }} />
      <div aria-hidden="true" data-collection-mist="" style={{ position: "absolute", width: tokens.collection.mistWidth, height: tokens.collection.mistHeight, top: tokens.collection.mistTop, left: tokens.collection.mistLeft, borderRadius: tokens.radius.round, background: tokens.collection.mist, pointerEvents: "none" }} />
      <div aria-hidden="true" data-collection-grain="" style={{ position: "absolute", inset: 0, opacity: tokens.collection.grainOpacity, backgroundImage: tokens.collection.grain, pointerEvents: "none" }} />
      <div
        ref={scrollRef}
        data-workspace-popup-scroll="viewport"
        style={{
          position: "relative",
          zIndex: 1,
          boxSizing: "border-box",
          height: "100%",
          maxHeight: "none",
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehaviorY: "contain",
          borderRadius: 0,
          padding: `0 ${tokens.spacing.section}px`,
          paddingBottom: 0,
          display: "flex",
          flexDirection: "column",
          // In the side panel a reserved gutter shows as an empty strip beside the header.
          scrollbarGutter: "auto"
        }}
      >
        <div
          ref={scrollTrackRef}
          data-workspace-popup-scroll-track="true"
          style={{
            width: "100%",
            minWidth: 0,
            minHeight: "100%",
            flex: "1 0 auto",
            display: "flex",
            flexDirection: "column",
            gap: tokens.spacing.md
          }}
        >
          <CollectionWorkspaceShell
            tab={readingNavigation.tab}
            allowCollection={!IS_PR_ONLY_BUILD}
            busy={navigationBusy}
            onTabChange={selectPrimaryTab}
            onSettings={() => {
              if (navigationPending.current) return;
              setReadingNavigation((current) => ({ ...current, settingsOpen: true,  returnPage: page }));
              void app.onNavigate("settings");
            }}
            inView={inView}
            onInView={()=>inView && setReadingNavigation(current=>({...current,tab:'collection',workspaceOpen:false,settingsOpen:false,selectedKey:inView.key,requestedLens:null,discourseReturn:undefined}))}
            diagnostics={<StatusRail scopeLabel="資料夾" backendReachability={app.backendReachability} backendWorkUiState={app.backendWorkUiState} workerStatus={app.workerStatus} ready={app.processingSummary.ready} total={app.processingSummary.total} />}
          >
            {readerSource?.session.mode === "topic" && readerTopics.error && !domainPage && readingNavigation.tab === "collection" ? <p role="alert" style={{ color: tokens.color.failed }}>{readerTopics.error}</p> : null}
            {navigationError && (domainPage || readingNavigation.tab !== "workspaces") ? <p role="alert" style={{ color: tokens.color.failed }}>{navigationError}</p> : null}
            {!domainPage && readingNavigation.tab === "collection" ? (
              <CollectionBrowser filter={readingNavigation.filter} onFilterChange={filter => setReadingNavigation(current => ({ ...current, filter }))} exportRow={readingNavigation.filter === "product" ? <CollectionSignalPacketExport key={activeFolder?.id} sessions={snapshot?.global.sessions ?? []} defaultSessionId={activeFolder?.id} onExport={app.onExportSignalPackets} /> : undefined} readerBackLabel={readingNavigation.discourseReturn?.label} onReaderBack={()=>void readerBack()} productAnalyses={products.analyses} productSignals={products.signals} productHasContext={productHasContext} productLoaded={products.loaded} productPending={products.pending} productErrors={products.errors} onProductAnalyze={id=>void products.analyze(id)} requestedLens={readingNavigation.requestedLens} readerRequest={readingNavigation.readerRequest} onSettings={()=>{setReadingNavigation(current=>({...current,settingsOpen:true}));void app.onNavigate("settings");}} onCopy={text=>{setCopyStatus('');if(!navigator.clipboard){setCopyStatus('未能複製，請再試。');return;}void navigator.clipboard.writeText(text).then(()=>setCopyStatus('已複製'),()=>setCopyStatus('未能複製，請再試。'));}} copyStatus={copyStatus} settings={snapshot?.global.settings} deepReadings={deepReadings.records} deepPending={deepReadings.pending} deepErrors={deepReadings.errors} onDeepRun={(id) => void deepReadings.run(id)} opened={openedReadings.opened} openedError={openedReadings.error} assignmentPending={readerTopics.pending} topics={readerTopics.topics} signals={readerTopics.signals} readings={discourseFeeds.readings} onAssignTopic={(id, topicId) => void readerTopics.onAssign(id, topicId)} nowMs={nowMs} sort={readingNavigation.sort} onSortChange={(sort) => setReadingNavigation((current) => ({ ...current, sort }))} sessions={snapshot?.global.sessions ?? []} query={readingNavigation.query}
                onQueryChange={(query) => setReadingNavigation((current) => ({ ...current, query }))}
                selectedKey={readingNavigation.selectedKey}
                onSelect={(selectedKey) => setReadingNavigation((current) => ({ ...current, selectedKey, requestedLens:null, discourseReturn:undefined }))}
                onOpenWorkspace={(id) => void openWorkspace(id)}
                isLoading={!snapshot} />
            ) : null}
            {!domainPage && readingNavigation.tab === "workspaces" ? (
              <WorkspaceHomeView nowMs={nowMs} sessions={IS_PR_ONLY_BUILD ? (snapshot?.global.sessions ?? []).filter((session) => session.mode === "pr-evidence") : snapshot?.global.sessions ?? []} activeSessionId={activeFolder?.id ?? null}
                onOpen={openWorkspace} onCreate={createWorkspace} onRename={(id, name) => manageWorkspace(id, "rename", name)} onDelete={(id) => manageWorkspace(id, "delete")} externalError={navigationError} busy={navigationBusy} allowedCreationModes={IS_PR_ONLY_BUILD ? ["pr-evidence"] : undefined} />
            ) : null}
            {domainPage && !readingNavigation.settingsOpen && !discourseViewModel?.topic ? <button type="button" onClick={() => setReadingNavigation(current => ({ ...current, workspaceOpen: false }))} style={{ border: 0, background: "transparent", color: tokens.color.subInk, cursor: "pointer", padding: tokens.spacing.sm }}>← 工作區</button> : null}
          {domainPage === "topics" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              {discourseViewModel ? <TopicDiscourseView viewModel={discourseViewModel} onCommand={onDiscourseCommand} readingModel={topicReadingModel} uiState={discourseUi[discourseUiKey] ?? EMPTY_DISCOURSE_UI} onUiStateChange={next=>setDiscourseUi(current=>({...current,[discourseUiKey]:next}))} /> : null}
            </WorkspaceSurface>
          ) : null}

          {domainPage === "pr-evidence" ? (
            <WorkspaceSurface style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none", overflow: "visible" }}>
              <input
                ref={prBriefInputRef}
                type="file"
                accept=".pdf,.txt,.md,.markdown,.text,application/pdf,text/plain,text/markdown"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void app.onPrEvidenceBriefFileSelected(file);
                  event.currentTarget.value = "";
                }}
              />
              <PrEvidenceView
                viewModel={app.prEvidenceViewModel}
                onCommand={handlePrEvidenceCommand}
              />
            </WorkspaceSurface>
          ) : null}

          {domainPage === "settings" ? (
            <WorkspaceSurface style={SETTINGS_WORKSPACE_SURFACE_STYLE}>
              <SettingsView
                sessionMode={IS_PR_ONLY_BUILD ? "pr-evidence" : activeFolder?.mode ?? "topic"}
                draftBaseUrl={app.draftBaseUrl}
                draftIngestApiToken={app.draftIngestApiToken}
                hasIngestApiToken={app.hasIngestApiToken}
                onDraftIngestApiTokenChange={app.onDraftIngestApiTokenChange}
                onClearIngestApiToken={app.onClearIngestApiToken}
                draftProvider={app.draftProvider}
                draftOpenAiKey={app.draftOpenAiKey}
                draftClaudeKey={app.draftClaudeKey}
                draftGoogleKey={app.draftGoogleKey}
                draftDeepReadingModels={app.draftDeepReadingModels}
                onDraftDeepReadingModelsChange={(provider, model) => app.setDraftDeepReadingModels(current => ({ ...current, [provider]: model }))}
                hasOpenAiKey={app.hasOpenAiKey}
                hasClaudeKey={app.hasClaudeKey}
                hasGoogleKey={app.hasGoogleKey}
                draftLayoutPreferences={app.draftLayoutPreferences}
                draftProductProfile={app.draftProductProfile}
                compiledProductContext={app.compiledProductContext}
                storageUsage={app.storageUsage}
                settingsSaveStatus={app.settingsSaveStatus}
                isSavingSettings={app.isSavingSettings}
                productProfileSeedText={app.productProfileSeedText}
                isInitializingProductProfile={app.isInitializingProductProfile}
                onDraftBaseUrlChange={app.setDraftBaseUrl}
                onDraftProviderChange={app.setDraftProvider}
                onDraftOpenAiKeyChange={app.setDraftOpenAiKey}
                onDraftClaudeKeyChange={app.setDraftClaudeKey}
                onDraftGoogleKeyChange={app.setDraftGoogleKey}
                onDraftLayoutPreferencesChange={app.onDraftLayoutPreferencesChange}
                onDraftProductProfileChange={app.onDraftProductProfileChange}
                onProductProfileSeedTextChange={app.setProductProfileSeedText}
                onInitProductProfile={() => void app.onInitProductProfile()}
                onClearProductCache={() => void app.onClearProductCache()}
                createContextFileId={app.createContextFileId}
                onBeginSettingsSave={app.beginIngestOriginPermissionRequest}
                onSaveSettings={(pendingPermission) => void app.onSaveSettings(pendingPermission)}
                onSaveAndTestAi={(pendingPermission) => void app.onSaveAndTestAi(pendingPermission)}
                aiKeyStatus={app.aiKeyStatus}
              />
            </WorkspaceSurface>
          ) : null}
          </CollectionWorkspaceShell>

          {domainPage && snapshot?.tab.error ? (
            <div style={{ marginTop: 12, color: tokens.color.failed, fontSize: 12 }}>
              <strong>Error:</strong> {getProcessingFailureMessage(snapshot.tab.error)}
            </div>
          ) : null}

          <div aria-hidden="true" style={{ height: tokens.spacing.xl, flexShrink: 0 }} />
        </div>
      </div>
    </div>
    </LanguageProvider>
  );
}

export const inPageCollectorPopupTestables = { settingsWorkspaceSurfaceStyle: SETTINGS_WORKSPACE_SURFACE_STYLE };
