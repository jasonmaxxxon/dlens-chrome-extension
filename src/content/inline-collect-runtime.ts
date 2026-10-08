import type { ExtensionMessage, ExtensionResponse, QueueItemsAndStartProcessingResponse } from "../state/messages";
import { INLINE_COLLECT_MODES, INLINE_COLLECT_MODE_NAMES, inlineCollectPostKey, projectInlineCollectState, type InlineCollectMessage, type InlineCollectSavedPost, type InlineCollectState } from "../state/inline-collect";
import { buildTargetDescriptor } from "../targeting/threads";
import { createInlineCollectInjection, type InlineCollectEntry } from "./inline-collect-injection";
import { createInlineCollectWheel, INLINE_COLLECT_BUTTON_HTML, updateSavedButton, type InlineCollectPost } from "./inline-collect-wheel";
import { createEmptyGlobalState, type ExtensionGlobalState, type FolderMode } from "../state/types";
import { createPipelineRequestId, emitPipelineEvent } from "../state/pipeline-trace";
import { GLOBAL_STATE_STORAGE_KEY } from "../state/storage-keys";
import { awaitingAnalysis, buildInlineCardEvidence, buildInlineCardViewModel, type InlineCardAiInput, type InlineCardEntryKey, type InlineCardPeekInput } from "../viewmodel/inline-card";
import { aiKeyGap } from "../state/ai-key";
import type { SessionItem } from "../state/types";
import { INLINE_READINGS_STORAGE_KEY, normalizeInlineReadingRecords, type InlineReadingRecord } from "../compare/inline-reading-storage";
import { renderInlineCard, renderInlineEvidenceWindow, formatEta } from "./inline-collect-card";
import { INLINE_READING_PROMPT_VERSION } from "../compare/inline-reading";
import { tokens } from "../ui/tokens";
import { fetchFirstReplies } from "./inline-collect-peek";

const INLINE_CARD_POLL_MS = 4000;

/** Side effects live here; the wheel only consumes typed callbacks and data. */
export function startInlineCollectRuntime(overlayRoot: HTMLElement) {
  let state: InlineCollectState = {
    lastMode: "topic",
    destinations: INLINE_COLLECT_MODES.map((mode) => ({ mode, sessionId: null, sessionName: INLINE_COLLECT_MODE_NAMES[mode] })),
    saved: [], changed: false
  };
  let destroyed = false;
  let injection: ReturnType<typeof createInlineCollectInjection> | null = null;
  const pending = new Map<string, number>();
  const optimistic = new Map<string, { mode: FolderMode; name: string } | null>();
  let revision = 0;
  let storageRevision = 0;
  let optimisticLastMode: FolderMode | null = null;
  let mutationQueue: Promise<void> = Promise.resolve();
  const latestMutation = new Map<string, number>();
  const saved = (identity: string) => state.saved.find((item) => item.postKey === identity);
  const send = (message: ExtensionMessage) => chrome.runtime.sendMessage(message) as Promise<ExtensionResponse>;
  // The card under a saved post (v9): shown on save, × hides it, the chip toggles it back.
  let global: ExtensionGlobalState | null = null;
  const cards = new Map<string, { hidden: boolean; lens: InlineCardEntryKey | null; evidence: boolean }>();
  const closedView = { hidden: false, lens: null, evidence: false };
  const slots = new Map<string, HTMLElement>();
  function removeCard(identity: string) {
    slots.get(identity)?.remove(); slots.delete(identity);
    if (evidenceWindow?.dataset.dlensFor === identity) closeEvidenceWindow();
  }
  const itemOf = (destination: InlineCollectSavedPost) =>
    global?.sessions.find((entry) => entry.id === destination.sessionId)?.items.find((entry) => entry.id === destination.itemId) ?? null;
  const repaintCard = (identity: string) => injection?.entries().filter((entry) => entry.identity === identity).forEach(renderCard);
  // A crawl request that never reached a job leaves the item 「saved」; the card says why instead of staying silent.
  const startErrors = new Map<string, string>();
  function crawl(destination: InlineCollectSavedPost) {
    const fail = (reason: string) => {
      startErrors.set(destination.postKey, reason);
      repaintCard(destination.postKey);
      wheel.showToast("未能開始抓取，請檢查 DLens 後端。");
    };
    startErrors.delete(destination.postKey);
    repaintCard(destination.postKey);
    void (send({ type: "session/queue-items-and-start-processing", sessionId: destination.sessionId, itemIds: [destination.itemId] }) as Promise<QueueItemsAndStartProcessingResponse>)
      .then((response) => {
        if (!response.ok) fail(response.error || "後端拒絕了抓取請求。");
        else if (!response.queuedItemIds.length) fail("後端未能建立抓取工作，請確認後端和資料庫已連上。");
        else if (response.processingError) fail(`已排隊，但後端未開始處理：${response.processingError}`);
      }, () => fail("未能連上 DLens 背景程式。"));
  }
  // 1-second peek: the post page's own first replies, fetched once per post while its crawl is pending.
  const peeks = new Map<string, InlineCardPeekInput>();
  function startPeek(identity: string, postUrl: string) {
    peeks.set(identity, { state: "loading" });
    // Fetch through the page's own origin: saved URLs are normalized to threads.net, and a cross-origin fetch from threads.com is blocked.
    void fetchFirstReplies(postUrl, window.location.origin).then(
      (replies) => peeks.set(identity, replies ? { state: "ready", replies } : { state: "unavailable" }),
      () => peeks.set(identity, { state: "unavailable" })
    ).then(() => { if (!destroyed) repaintCard(identity); });
  }
  // Mockup motion: the card enters once, results fade up once, and the button carries the crawl state.
  const lastStatus = new Map<string, SessionItem["status"]>();
  const unseen = new Set<string>();
  function paintCrawlState(post: InlineCollectPost, item: SessionItem | null, reads: boolean, hidden: boolean): boolean {
    const previous = lastStatus.get(post.identity);
    const status = item?.status;
    if (status) lastStatus.set(post.identity, status); else lastStatus.delete(post.identity);
    const arrived = !!previous && previous !== "succeeded" && status === "succeeded";
    if (arrived && hidden) unseen.add(post.identity);
    if (!hidden || !item) unseen.delete(post.identity);
    const live = reads && !!item && (item.status === "queued" || item.status === "running" || awaitingAnalysis(item, Date.now())
      || (readings[item.id]?.status === "running" && readings[item.id]?.captureId === item.latestCapture?.id));
    post.button.classList.toggle("busy", live);
    post.button.classList.toggle("queued", live && item?.status === "queued");
    post.button.classList.toggle("failed", reads && !!item && (item.status === "failed" || startErrors.has(post.identity)));
    post.button.classList.toggle("ready", unseen.has(post.identity));
    return arrived;
  }
  function renderCard(post: InlineCollectPost) {
    const destination = pending.has(post.identity) ? null : saved(post.identity);
    const view = cards.get(post.identity);
    const item = destination && itemOf(destination);
    const arrived = paintCrawlState(post, item ?? null, destination?.mode === "topic" || destination?.mode === "product", !!view?.hidden);
    if (!destination || !item || view?.hidden) { removeCard(post.identity); return; }
    const bar = post.button.parentElement?.parentElement;
    if (!bar) return;
    const existing = slots.get(post.identity);
    const enter = !existing || !existing.isConnected || existing.previousElementSibling !== bar;
    let slot = existing;
    if (!slot || enter) {
      slot?.remove();
      slot = document.createElement("div");
      slot.className = "dlens-card-slot";
      slot.setAttribute("data-dlens-control", "true");
      slot.addEventListener("click", (event) => onCardClick(post, event));
      bar.insertAdjacentElement("afterend", slot);
      slots.set(post.identity, slot);
    }
    const reads = destination.mode === "topic" || destination.mode === "product";
    if (reads && item.status !== "succeeded" && !peeks.has(post.identity) && item.descriptor.post_url) startPeek(post.identity, item.descriptor.post_url);
    const vm = buildInlineCardViewModel(item, destination.mode, destination.sessionName, {
      queue: global?.sessions.flatMap((session) => session.items) ?? [],
      peek: peeks.get(post.identity),
      startError: startErrors.get(post.identity) ?? null,
      ai: aiOf(item),
      now: Date.now()
    });
    // A read 觀眾反應 card asks the background for its AI pass once per capture (after the quant clusters land); the result arrives through storage.
    if (vm.phase === "done" && vm.mode === "topic" && vm.entries.length && !vm.ai && !vm.analysisPending) ensureReading(destination, item.id, item.latestCapture?.id ?? "", false);
    const lens = view?.lens && vm.answers[view.lens] ? view.lens : null;
    const evidence = view?.evidence ? buildInlineCardEvidence(item, vm, lens, aiOf(item)) : null;
    // 展開證據 opens beside the feed when there is room (mockup v12), else below the card.
    const card = (post as InlineCollectEntry).card ?? bar;
    const right = card.getBoundingClientRect().right;
    const floating = !!evidence && window.innerWidth - right - tokens.collectCard.windowGap >= tokens.collectCard.windowMinRoom;
    slot.innerHTML = renderInlineCard(vm, lens, Date.now(), floating ? null : evidence, { enter, fresh: arrived, evidenceOpen: !!evidence });
    if (evidence && floating) showEvidenceWindow(post.identity, (enter: boolean) => renderInlineEvidenceWindow(evidence, destination.mode, enter), right, slot.getBoundingClientRect().top);
    else if (evidenceWindow?.dataset.dlensFor === post.identity) closeEvidenceWindow();
  }
  // One evidence window at a time, in page coordinates so it scrolls with its card.
  let evidenceWindow: HTMLElement | null = null;
  function showEvidenceWindow(identity: string, html: (enter: boolean) => string, feedRight: number, cardTop: number) {
    if (!evidenceWindow) {
      evidenceWindow = document.createElement("div");
      evidenceWindow.setAttribute("data-dlens-control", "true");
      evidenceWindow.addEventListener("click", (event) => {
        const owner = injection?.entries().find((entry) => entry.identity === evidenceWindow?.dataset.dlensFor);
        if (owner) onCardClick(owner, event);
      });
      document.body.appendChild(evidenceWindow);
    }
    const enter = evidenceWindow.dataset.dlensFor !== identity;
    evidenceWindow.dataset.dlensFor = identity;
    evidenceWindow.innerHTML = html(enter);
    const box = evidenceWindow.firstElementChild as HTMLElement | null;
    if (box) {
      box.style.left = `${feedRight + tokens.collectCard.windowGap + window.scrollX}px`;
      box.style.top = `${Math.max(cardTop - tokens.collectCard.windowTopOffset, tokens.collectCard.windowTopMin) + window.scrollY}px`;
    }
  }
  function closeEvidenceWindow() { evidenceWindow?.remove(); evidenceWindow = null; }
  let readings: Record<string, InlineReadingRecord> = {};
  // Background said no key although local settings looked usable; cleared on the next settings/global change.
  const noKey = new Set<string>();
  const ensured = new Set<string>();
  const keyGap = () => (global ? aiKeyGap(global.settings ?? {}) : null);
  function aiOf(item: SessionItem): InlineCardAiInput | null {
    const record = readings[item.id];
    // A reading from an older prompt is stale like one from an older capture: ask again.
    const current = record && record.captureId === item.latestCapture?.id && (record.status !== "complete" || record.reading.promptVersion === INLINE_READING_PROMPT_VERSION);
    if (record && current) return record;
    const gap = keyGap();
    if (gap) return { status: "no-key", reason: gap };
    if (noKey.has(item.id)) return { status: "no-key", reason: "背景判斷未有可用的 AI key" };
    return null;
  }
  function ensureReading(destination: InlineCollectSavedPost, itemId: string, captureId: string, retry: boolean) {
    const key = `${itemId}:${captureId}`;
    if (!retry && ensured.has(key)) return;
    ensured.add(key);
    void send({ type: "inline-reading/ensure", sessionId: destination.sessionId, itemId, retry }).then((response) => {
      if (!response.ok || response.inlineReadingStatus === "not-ready") { ensured.delete(key); return; }
      if (response.inlineReadingStatus === "no-key") { ensured.delete(key); noKey.add(itemId); repaintCard(destination.postKey); }
    }).catch(() => ensured.delete(key));
  }
  function onCardClick(post: InlineCollectPost, event: MouseEvent) {
    // Our card sits inside a Threads post; never let a click reach Threads' own navigation.
    event.preventDefault(); event.stopPropagation();
    const target = event.target instanceof Element ? event.target : null;
    const lens = target?.closest<HTMLElement>("[data-dlens-lens]")?.dataset.dlensLens as InlineCardEntryKey | undefined;
    const view = cards.get(post.identity) ?? closedView;
    if (lens) { cards.set(post.identity, { ...view, lens: view.lens === lens ? null : lens }); renderCard(post); return; }
    const act = target?.closest<HTMLElement>("[data-dlens-act]")?.dataset.dlensAct;
    const destination = saved(post.identity);
    if (act === "close") { cards.set(post.identity, { ...view, hidden: true }); renderCard(post); }
    else if (act === "open") openWorkspace(post.identity);
    else if (act === "move") wheel.openSticky(post);
    else if (act === "crawl" && destination) crawl(destination);
    else if (act === "evidence") {
      // Opening one post's evidence closes any other.
      if (!view.evidence) for (const [identity, other] of cards) if (identity !== post.identity && other.evidence) { cards.set(identity, { ...other, evidence: false }); repaintCard(identity); }
      cards.set(post.identity, { ...view, evidence: !view.evidence });
      renderCard(post);
    }
    else if (act === "ai-key") wheel.showToast(`${keyGap() ?? "背景判斷未有可用的 AI key"}。到 DLens 側欄 ⋯ → 設定 填好並儲存後，這張卡會自動整理。`);
    else if (act === "ai-retry" && destination) {
      const item = itemOf(destination);
      if (item) ensureReading(destination, item.id, item.latestCapture?.id ?? "", true);
    }
  }
  const waitTimer = window.setInterval(() => {
    for (const slot of slots.values()) slot.querySelectorAll<HTMLElement>("[data-dlens-eta]").forEach((el) => { el.textContent = formatEta(el.dataset.dlensEta ?? "", Number(el.dataset.dlensEtaSec), Date.now()); });
  }, 1000);
  function showReloadNotice() {
    const notice = document.createElement("div");
    notice.className = "dlens-collect-toast on";
    notice.setAttribute("data-dlens-control", "true");
    notice.setAttribute("role", "status");
    notice.innerHTML = "<span>DLens 已更新，重新整理此頁即可使用新版本。</span>";
    document.body.appendChild(notice);
    window.setTimeout(() => notice.remove(), tokens.motion.collectWheel.toastActionMs * 2);
  }
  // The workspace popup only refreshes jobs while it is open, so a card polls its own crawl, then the quant analysis, until both settle.
  const refreshing = new Set<string>();
  const pollTimer = window.setInterval(() => {
    // After the extension reloads, this script stays on the page cut off from it (Chrome injects the new build only on a
    // page load). Remove its controls so the old build's button, wheel and card do not linger, and say how to get the new one.
    if (!globalThis.chrome?.runtime?.id) { teardown(); showReloadNotice(); return; }
    for (const identity of slots.keys()) {
      const destination = saved(identity);
      const item = destination && itemOf(destination);
      const settling = !!item && (item.status === "queued" || item.status === "running" || awaitingAnalysis(item, Date.now()));
      if (!destination || !item || !settling || refreshing.has(item.id)) continue;
      refreshing.add(item.id);
      void send({ type: "session/refresh-item", sessionId: destination.sessionId, itemId: destination.itemId })
        .catch(() => undefined).finally(() => refreshing.delete(item.id));
    }
  }, INLINE_CARD_POLL_MS);
  const paint = (post: InlineCollectPost) => {
    paintButton(post);
    renderCard(post);
  };
  const paintButton = (post: InlineCollectPost) => {
    if (pending.has(post.identity)) {
      const destination = optimistic.get(post.identity);
      if (optimistic.has(post.identity)) updateSavedButton(post, destination?.mode ?? null, destination?.name, { quiet: true });
      return;
    }
    const destination = saved(post.identity);
    updateSavedButton(post, destination?.mode ?? null, destination?.sessionName, { quiet: true });
  };
  function accept(response: ExtensionResponse, issuedAt: number) {
    if (!response.ok) throw new Error(response.error || "未能更新收藏");
    // A later storage event is authoritative even if an earlier request responds last.
    if (response.inlineCollect && issuedAt === storageRevision) state = response.inlineCollect;
    if (response.snapshot && issuedAt === storageRevision) global = response.snapshot.global;
    injection?.entries().forEach(paint);
    return response.inlineCollect;
  }
  async function request(message: ExtensionMessage) {
    const issuedAt = storageRevision;
    if (message.type !== "session/inline-collect" || message.action === "snapshot") {
      return accept(await send(message), issuedAt);
    }
    const action = message.action;
    const requestId = message.requestId ?? createPipelineRequestId(`inline-collect-${action}`);
    const target = message.action === "remove" ? { sessionId: message.sessionId, itemId: message.itemId }
      : message.action === "save" ? { sessionId: state.destinations.find((entry) => entry.mode === (message.mode ?? state.lastMode))?.sessionId ?? undefined }
      : {};
    emitPipelineEvent({
      phase: "signal.saved", step: "content.inline-collect.request", target: { ...target },
      result: "pending", requestId, detail: { action }
    });
    try {
      const result = accept(await send({ ...message, requestId }), issuedAt);
      emitPipelineEvent({
        phase: "signal.saved", step: "content.inline-collect.response", target: { ...target },
        result: "ok", requestId, detail: { action, changed: result?.changed ?? false }
      });
      return result;
    } catch (error) {
      emitPipelineEvent({
        phase: "signal.saved", step: "content.inline-collect.failure", target: { ...target },
        result: "error", requestId, detail: { action, error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }
  function captureDescriptor(post: InlineCollectPost) {
    const entry = post as InlineCollectEntry;
    const wrapper = post.button.parentElement;
    const parent = wrapper?.parentElement;
    const next = wrapper?.nextSibling ?? null;
    // Capture fresh native text/metrics without our chip contaminating the source.
    if (wrapper && parent) wrapper.remove();
    try {
      const descriptor = buildTargetDescriptor(entry.card, window.location.href) ?? post.descriptor;
      return inlineCollectPostKey(descriptor) === post.identity ? descriptor : null;
    }
    finally { if (wrapper && parent) parent.insertBefore(wrapper, next); }
  }
  function enqueue(post: InlineCollectPost, work: (version: number) => Promise<void>) {
    const version = ++revision;
    pending.set(post.identity, version);
    latestMutation.set(post.identity, version);
    const next = mutationQueue.catch(() => undefined).then(() => ready).then(() => work(version)).catch(() => {
      if (!destroyed) wheel.showToast("未能更新收藏，請再試。");
    }).finally(() => {
      if (pending.get(post.identity) !== version) return;
      pending.delete(post.identity);
      optimistic.delete(post.identity);
      if (pending.size === 0) optimisticLastMode = null;
      injection?.entries().filter((entry) => entry.identity === post.identity).forEach(paint);
    });
    mutationQueue = next;
  }
  function acknowledge(post: InlineCollectPost, mode: FolderMode | null, popDelay = 0) {
    wheel.hideToast();
    const name = state.destinations.find((entry) => entry.mode === mode)?.sessionName ?? "";
    optimistic.set(post.identity, mode ? { mode, name } : null);
    updateSavedButton(post, mode, name, { popDelay });
    if (mode) optimisticLastMode = mode;
  }
  function undo(post: InlineCollectPost, token: string, mode: FolderMode) {
    acknowledge(post, mode);
    enqueue(post, async () => {
      const result = await request({ type: "session/inline-collect", action: "undo", token });
      wheel.showToast(result?.changed ? "已復原" : "已有較新的操作");
    });
  }
  async function save(post: InlineCollectPost, mode?: FolderMode) {
    if (destroyed) return;
    const message: InlineCollectMessage = { type: "session/inline-collect", action: "save", descriptor: post.descriptor, ...(mode ? { mode } : {}) };
    await request(message);
    // v9: saving into a reading workspace starts the reply crawl at once; the card then shows its progress.
    const destination = saved(post.identity);
    if (destination && (destination.mode === "topic" || destination.mode === "product") && itemOf(destination)?.status === "saved") crawl(destination);
  }
  async function tap(post: InlineCollectPost, version: number) {
    const destination = saved(post.identity);
    if (!destination) { await save(post); return; }
    const result = await request({ type: "session/inline-collect", action: "remove", descriptor: post.descriptor, sessionId: destination.sessionId, itemId: destination.itemId });
    if (latestMutation.get(post.identity) !== version) return;
    wheel.showToast("已移除收藏", result?.undoToken ? () => {
      if (latestMutation.get(post.identity) === version) undo(post, result.undoToken!, destination.mode);
    } : undefined);
  }
  function openWorkspace(identity: string) {
    const destination = saved(identity);
    if (!destination) return;
    // Sent straight from the click, since Chrome opens the side panel only inside the user gesture; the panel opens the workspace itself.
    void send({ type: "sidepanel/open", sessionId: destination.sessionId }).catch(() => wheel.showToast("未能開啟工作區，請再試。"));
  }
  const wheel = createInlineCollectWheel({
    overlayRoot,
    getDestinations: () => state.destinations,
    getLastMode: () => optimisticLastMode ?? state.lastMode,
    getSavedMode: (identity) => optimistic.has(identity) ? optimistic.get(identity)?.mode ?? null : saved(identity)?.mode ?? null,
    getHoveredPost: () => injection?.getHoveredPost() ?? null,
    onSave: (post, mode, options) => {
      const descriptor = captureDescriptor(post);
      if (!descriptor) { injection?.scan(); return; }
      const mutationPost = { ...post, descriptor };
      acknowledge(post, mode, options.popDelay);
      enqueue(post, () => save(mutationPost, mode));
    },
    onTap: (post) => {
      const descriptor = captureDescriptor(post);
      if (!descriptor) { injection?.scan(); return; }
      const mutationPost = { ...post, descriptor };
      const isSaved = optimistic.has(post.identity) ? optimistic.get(post.identity) !== null : Boolean(saved(post.identity));
      acknowledge(post, isSaved ? null : optimisticLastMode ?? state.lastMode);
      enqueue(post, (version) => tap(mutationPost, version));
    }
  });
  const ready = request({ type: "session/inline-collect", action: "snapshot" }).then(() => undefined).catch(() => undefined);
  injection = createInlineCollectInjection({
    document: overlayRoot.ownerDocument,
    getPageUrl: () => window.location.href,
    onAdd(post) {
      post.button.innerHTML = INLINE_COLLECT_BUTTON_HTML;
      const unbind = wheel.bindButton(post);
      const onClick = (event: MouseEvent) => {
        event.preventDefault(); event.stopPropagation();
        const view = cards.get(post.identity) ?? closedView;
        cards.set(post.identity, { ...view, hidden: !view.hidden });
        renderCard(post);
      };
      post.chip.addEventListener("click", onClick);
      paint(post);
      return () => { unbind(); post.chip.removeEventListener("click", onClick); removeCard(post.identity); };
    }
  });
  const storageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || destroyed) return;
    if (INLINE_READINGS_STORAGE_KEY in changes) {
      readings = normalizeInlineReadingRecords(changes[INLINE_READINGS_STORAGE_KEY].newValue);
      injection?.entries().forEach(renderCard);
    }
    if (!(GLOBAL_STATE_STORAGE_KEY in changes)) return;
    noKey.clear();
    const global = changes[GLOBAL_STATE_STORAGE_KEY].newValue as ExtensionGlobalState | undefined;
    if (global && !Array.isArray(global.sessions)) return;
    storageRevision++;
    // Every Threads tab observes the shared membership and last mode. Never apply
    // another tab's navigation state or dispatch its snapshot into this popup.
    state = projectInlineCollectState(global ?? createEmptyGlobalState());
    latestGlobal(global ?? null);
    injection?.entries().forEach(paint);
  };
  function latestGlobal(next: ExtensionGlobalState | null) { global = next; }
  void Promise.resolve(chrome.storage.local?.get?.(GLOBAL_STATE_STORAGE_KEY)).then((stored) => {
    if (destroyed) return;
    const next = stored?.[GLOBAL_STATE_STORAGE_KEY] as ExtensionGlobalState | undefined;
    if (next && Array.isArray(next.sessions)) { global = next; injection?.entries().forEach(paint); }
  }).catch(() => undefined);
  void Promise.resolve(chrome.storage.local?.get?.(INLINE_READINGS_STORAGE_KEY)).then((stored) => {
    if (destroyed || !stored) return;
    readings = normalizeInlineReadingRecords(stored[INLINE_READINGS_STORAGE_KEY]);
    injection?.entries().forEach(renderCard);
  }).catch(() => undefined);
  chrome.storage.onChanged.addListener(storageListener);
  const onResize = () => { const identity = evidenceWindow?.dataset.dlensFor; if (identity) repaintCard(identity); };
  window.addEventListener("resize", onResize);
  function teardown() {
    destroyed = true; closeEvidenceWindow(); window.removeEventListener("resize", onResize); window.clearInterval(waitTimer); window.clearInterval(pollTimer);
    try { chrome.storage.onChanged.removeListener(storageListener); } catch { /* the extension context may already be gone */ }
    injection?.destroy(); wheel.destroy(); for (const id of [...slots.keys()]) removeCard(id);
  }
  return {
    reset() { wheel.reset(); injection?.reset(); },
    destroy: teardown
  };
}
