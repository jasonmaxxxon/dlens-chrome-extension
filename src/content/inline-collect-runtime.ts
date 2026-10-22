import { buildProductSaveLine } from "../viewmodel/product-reader";
import { loadProductSignalAnalysisMap, PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY, normalizeProductSignalAnalysisRecord } from "../compare/product-signal-storage";
import type { ProductSignalAnalysis } from "../state/types";
import { markReadingOpened } from "../state/opened-readings-storage";
import type { ExtensionMessage, ExtensionResponse, QueueItemsAndStartProcessingResponse } from "../state/messages";
import { INLINE_COLLECT_MODES, INLINE_COLLECT_MODE_NAMES, inlineCollectPostKey, projectInlineCollectState, type InlineCollectMessage, type InlineCollectSavedPost, type InlineCollectState } from "../state/inline-collect";
import { buildTargetDescriptor } from "../targeting/threads";
import { createInlineCollectInjection, type InlineCollectEntry } from "./inline-collect-injection";
import { createInlineCollectWheel, INLINE_COLLECT_BUTTON_HTML, updateSavedButton, type InlineCollectPost } from "./inline-collect-wheel";
import { createEmptyGlobalState, type ExtensionGlobalState, type FolderMode } from "../state/types";
import { createPipelineRequestId, emitPipelineEvent } from "../state/pipeline-trace";
import { GLOBAL_STATE_STORAGE_KEY } from "../state/storage-keys";
import { awaitingAnalysis, buildInlineSaveLine, nextInlineDisclosure, nextReturnGlow, type InlineReturnGlow, buildInlineCardViewModel, type InlineCardAiInput, type InlineCardEntryKey, type InlineCardPeekInput } from "../viewmodel/inline-card";
import { aiKeyGap } from "../state/ai-key";
import type { SessionItem, Signal, Topic } from "../state/types";
import { normalizeSignal, normalizeTopic, SIGNALS_STORAGE_KEY, TOPICS_STORAGE_KEY } from "../state/topic-storage";
import { buildCardTopicLine } from "../viewmodel/topic-discourse";
import { INLINE_READINGS_STORAGE_KEY, normalizeInlineReadingRecords, type InlineReadingRecord } from "../compare/inline-reading-storage";
import { renderInlineTopicPicker, renderInlineSaveLine, renderInlineCard, formatEta } from "./inline-collect-card";
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
  // Posts whose next render follows a lens click: only that render plays the switch animation, not the 4 s refreshes.
  const swapping = new Set<string>();
  const cards = new Map<string, { hidden: boolean; lens: InlineCardEntryKey | null; expanded?: boolean }>();
  const closedView: { hidden: boolean; lens: InlineCardEntryKey | null; expanded?: boolean } = { hidden: false, lens: null };
  let readings:Record<string,InlineReadingRecord>={};
  let productRevision=0;
  let productAnalyses:Record<string,ProductSignalAnalysis>={};
  const productAnalysis=(sessionId:string,itemId:string)=>productAnalyses[signals.find(s=>s.sessionId===sessionId && s.itemId===itemId)?.id ?? ""];
  const savedClocks = new Map<string, number>();
  const returnGlows = new Map<string, InlineReturnGlow>();
  const glowTimers = new Map<string, number>();
  const visibility = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const identity = (entry.target as HTMLElement).dataset.dlensIdentity;
      if (identity && returnGlows.get(identity)?.pending) repaintCard(identity);
    }
  });
  const slots = new Map<string, HTMLElement>();
  function removeCard(identity: string) {
    const slot = slots.get(identity);
    if (slot) visibility.unobserve(slot);
    slot?.remove(); slots.delete(identity);
    const timer = glowTimers.get(identity);
    if (timer) window.clearTimeout(timer);
    glowTimers.delete(identity);
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
        // The job exists, so this is not a failed crawl; nothing here retries the worker start, so the copy promises nothing.
        else if (response.processingError) wheel.showToast("已排隊，但未能確認後端開始處理。請勿重複建單。");
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
    const audience=saved(post.identity)?.mode === "topic";
    const live = reads && !!item && (item.status === "queued" || item.status === "running" || (audience && awaitingAnalysis(item, Date.now()))
      || (audience && readings[item.id]?.status === "running" && readings[item.id]?.captureId === item.latestCapture?.id));
    post.button.classList.toggle("busy", live);
    post.button.classList.toggle("queued", live && item?.status === "queued");
    post.button.classList.toggle("failed", reads && !!item && (item.status === "failed" || startErrors.has(post.identity)));
    post.button.classList.toggle("ready", unseen.has(post.identity));
    return arrived;
  }
  function trackOffscreenReadings() {
    for (const destination of state.saved) {
      if (destination.mode !== "topic") continue;
      const item = itemOf(destination);
      if (!item) continue;
      const post = injection?.entries().find(p => p.identity === destination.postKey);
      const rect = post?.card.getBoundingClientRect();
      const vm = buildInlineCardViewModel(item, "topic", destination.sessionName, { ai: aiOf(item), now: Date.now() });
      if (vm.phase === "done" && vm.entries.length && !vm.ai && !vm.analysisPending) ensureReading(destination, item.id, item.latestCapture?.id ?? "", false);
      if (rect && rect.bottom > 0 && rect.top < window.innerHeight) continue;
      const ready = buildInlineSaveLine(vm, Date.now(), null, null).ready;
      returnGlows.set(destination.postKey, nextReturnGlow(returnGlows.get(destination.postKey), ready, false));
    }
  }
  function renderCard(post: InlineCollectPost) {
    const destination = pending.has(post.identity) ? null : saved(post.identity);
    const view = cards.get(post.identity);
    const item = destination && itemOf(destination);
    const arrived = paintCrawlState(post, item ?? null, destination?.mode === "topic" || destination?.mode === "product", destination?.mode === "topic" ? !view?.expanded : !!view?.hidden);
    if (!destination || !item || view?.hidden) { removeCard(post.identity); return; }
    const bar = post.button.parentElement?.parentElement;
    if (!bar) return;
    const existing = slots.get(post.identity);
    const enter = !existing || !existing.isConnected || existing.previousElementSibling !== bar;
    let slot = existing;
    if (!slot || enter) {
      if (slot) { visibility.unobserve(slot); slot.remove(); }
      slot = document.createElement("div");
      slot.className = "dlens-card-slot";
      slot.dataset.dlensIdentity = post.identity;
      visibility.observe(slot);
      slot.setAttribute("data-dlens-control", "true");
      slot.addEventListener("click", (event) => onCardClick(post, event));
      slot.addEventListener("keydown", (event) => onCardKey(post, event));
      bar.insertAdjacentElement("afterend", slot);
      slots.set(post.identity, slot);
    }
    // Never repaint under the user's cursor while they type a new 話題 name.
    if (!enter && document.activeElement?.tagName === "INPUT" && slot.contains(document.activeElement)) return;
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
    const line = destination.mode === "product" ? buildProductSaveLine(item,productAnalysis(destination.sessionId,item.id),Date.now(),savedClocks.get(post.identity) ?? null,peeks.get(post.identity),startErrors.get(post.identity)) : buildInlineSaveLine(vm, Date.now(), savedClocks.get(post.identity) ?? null, topicNameOf(item.id));
    const rect = slot.getBoundingClientRect();
    const returned = nextReturnGlow(returnGlows.get(post.identity), line.ready, rect.bottom > 0 && rect.top < window.innerHeight);
    returnGlows.set(post.identity, returned);
    if (destination.mode === "topic" && returned.glow) {
      slot.classList.add("return-glow");
      const oldTimer = glowTimers.get(post.identity);
      if (oldTimer) window.clearTimeout(oldTimer);
      glowTimers.set(post.identity, window.setTimeout(() => { slot?.classList.remove("return-glow"); glowTimers.delete(post.identity); }, tokens.motion.collectCard.returnMs));
    }
    const lens = view?.lens && vm.answers[view.lens] ? view.lens : null;
    const topicLine = destination.mode === "topic"
      ? buildCardTopicLine(item.id, topics, signals, global?.sessions.flatMap((session) => session.items) ?? [], readings)
      : null;
    const pickingTopic = destination.mode === "topic" && topicPickers.has(post.identity);
    const pickerTopics = recentTopics(destination.sessionId);
    const pickerSignal = signals.find(s => s.itemId === item.id && s.sessionId === destination.sessionId);
    const full = destination.mode === "topic" ? view?.expanded : destination.mode !== "product";
    const html = (reads ? renderInlineSaveLine(line, !!view?.expanded, false, destination.mode as "topic" | "product") : "")
      + (pickingTopic ? renderInlineTopicPicker(pickerTopics, pickerSignal?.id ?? null) : "")
      + (full ? renderInlineCard(vm, lens, Date.now(), { enter, fresh: arrived, swap: swapping.has(post.identity), topicLine: pickingTopic ? null : topicLine, naming: naming === post.identity }) : "");
    if (slot.innerHTML !== html) slot.innerHTML = html;
    if (naming === post.identity) slot.querySelector<HTMLInputElement>("[data-dlens-topic-name]")?.focus();
  }

  // 話題 the user sorts posts into by hand; read straight from storage so the card line stays current.
  let topics: Topic[] = [];
  let signals: Signal[] = [];
  let signalInventoryRevision = 0, topicInventoryRevision = 0;
  let naming: string | null = null;
  const topicPickers = new Set<string>();
  const pendingTopics = new Map<string, { post: InlineCollectPost; itemId: string; sessionId: string; topicId: string }>();
  function recentTopics(sessionId: string | null) {
    return topics.filter(t => t.sessionId === sessionId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  function flushTopicAssignments() {
    for (const [identity, intent] of pendingTopics) {
      const destination = saved(identity);
      if (!destination || destination.itemId !== intent.itemId || destination.sessionId !== intent.sessionId) { pendingTopics.delete(identity); continue; }
      const signal = signals.find(s => s.itemId === intent.itemId && s.sessionId === intent.sessionId);
      if (!signal) continue;
      pendingTopics.delete(identity); // retire before dispatch, including concurrent storage events
      if (!topics.some(t => t.id === intent.topicId && t.sessionId === intent.sessionId)) { wheel.showToast("話題已變更，貼文保留喺未分流。"); continue; }
      triage(intent.post, signal.id, { kind: "assign", topicId: intent.topicId });
    }
  }
  function topicNameOf(itemId: string) {
    const signal = signals.find(s => s.itemId === itemId);
    return topics.find(t => t.id === signal?.topicId)?.name ?? null;
  }
  const readTopics = (value: unknown) => (Array.isArray(value) ? value.map(normalizeTopic).filter((t): t is Topic => !!t) : []);
  const readSignals = (value: unknown) => (Array.isArray(value) ? value.map(normalizeSignal).filter((s): s is Signal => !!s) : []);
  function triage(post: InlineCollectPost, signalId: string, action: { kind: "assign"; topicId: string } | { kind: "create-topic"; name: string }) {
    void send({ type: "signal/triage", signalId, action })
      .then((response) => { if (!response.ok) wheel.showToast("未能放入話題，請再試。"); })
      .catch(() => wheel.showToast("未能放入話題，請再試。"))
      .finally(() => repaintCard(post.identity));
  }
  function onCardKey(post: InlineCollectPost, event: KeyboardEvent) {
    const input = (event.target as Element | null)?.matches?.("input[data-dlens-topic-name]") ? event.target as HTMLInputElement : null;
    if (!input) return;
    event.stopPropagation();
    if (event.key === "Escape") { naming = null; input.blur(); repaintCard(post.identity); return; }
    if (event.key !== "Enter") return;
    const name = input.value.trim();
    const signalId = input.dataset.signalId;
    naming = null;
    input.blur();
    if (name && signalId) triage(post, signalId, { kind: "create-topic", name });
    else repaintCard(post.identity);
  }
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
    if (lens) { cards.set(post.identity, { ...view, lens: view.lens === lens ? null : lens }); swapping.add(post.identity); renderCard(post); swapping.delete(post.identity); return; }
    const act = target?.closest<HTMLElement>("[data-dlens-act]")?.dataset.dlensAct;
    const destination = saved(post.identity);
    if (act === "toggle-card" && destination) {
      const item = itemOf(destination);
      if (!item) return;
      const vm = buildInlineCardViewModel(item, destination.mode, destination.sessionName, { ai: aiOf(item), now: Date.now() });
      const line = buildInlineSaveLine(vm, Date.now(), null, topicNameOf(item.id));
      const next = nextInlineDisclosure(!!view.expanded, line.ready);
      cards.set(post.identity, { ...view, expanded: next.expanded });
      if (next.markOpened) void markReadingOpened(chrome.storage.local, item.id, new Date().toISOString()).catch(() => wheel.showToast("未能記錄已讀，請再試。"));
      renderCard(post);
    }
    else if (act === "close") { cards.set(post.identity, { ...view, ...(destination?.mode === "topic" ? { expanded: false } : { hidden: true }) }); renderCard(post); }
    else if (act === "open") openWorkspace(post.identity);
    else if (act === "reader") openReader(post.identity);
    else if (act === "move") wheel.openSticky(post);
    else if (act === "crawl" && destination) crawl(destination);
    else if (act === "topic-pick") {
      const button = target!.closest<HTMLElement>("[data-dlens-act]")!;
      if (button.dataset.signalId && button.dataset.topicId) {
        topicPickers.delete(post.identity);
        triage(post, button.dataset.signalId, { kind: "assign", topicId: button.dataset.topicId });
        repaintCard(post.identity);
      }
    }
    else if (act === "topic-later") { topicPickers.delete(post.identity); repaintCard(post.identity); }
    else if (act === "topic-new") { naming = post.identity; renderCard(post); }
    else if (act === "topic-side" && destination) {
      // The panel follows the post in view; name this one so it opens on its 話題.
      void send({ type: "inline/in-view", postKey: post.identity }).catch(() => undefined);
      openReader(post.identity);
    }
    else if (act === "ai-key") wheel.showToast(`${keyGap() ?? "背景判斷未有可用的 AI key"}。到 DLens 側欄 ⋯ → 設定 填好並儲存後，這張卡會自動整理。`);
    else if (act === "ai-retry" && destination) {
      const item = itemOf(destination);
      if (item) ensureReading(destination, item.id, item.latestCapture?.id ?? "", true);
    }
  }
  const waitTimer = window.setInterval(() => {
    for (const entry of injection?.entries() ?? []) {
      if (saved(entry.identity)?.mode === "topic") renderCard(entry);
    }
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
  // Keep unfinished saved posts polling after Threads recycles their DOM; the panel still needs the arriving reading.
  const refreshing = new Set<string>();
  const pollTimer = window.setInterval(() => {
    // After the extension reloads, this script stays on the page cut off from it (Chrome injects the new build only on a
    // page load). Remove its controls so the old build's button, wheel and card do not linger, and say how to get the new one.
    if (!globalThis.chrome?.runtime?.id) { teardown(); showReloadNotice(); return; }
    for (const destination of state.saved) {
      const item = itemOf(destination);
      const settling = !!item && (item.status === "queued" || item.status === "running" || (destination.mode === "topic" && awaitingAnalysis(item, Date.now())));
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
  async function save(post: InlineCollectPost, mode?: FolderMode, topicOptions: { topicId?: string; topicSessionId?: string | null; pickTopic?: boolean } = {}) {
    if (destroyed) return;
    const message: InlineCollectMessage = { type: "session/inline-collect", action: "save", descriptor: post.descriptor, ...(mode ? { mode } : {}) };
    topicPickers.delete(post.identity); pendingTopics.delete(post.identity);
    cards.set(post.identity, { ...closedView });
    returnGlows.delete(post.identity);
    peeks.delete(post.identity);
    savedClocks.set(post.identity, Date.now());
    await request(message);
    // v9: saving into a reading workspace starts the reply crawl at once; the card then shows its progress.
    const destination = saved(post.identity);
    if (destination && (destination.mode === "topic" || destination.mode === "product") && itemOf(destination)?.status === "saved") crawl(destination);
    if (destination?.mode === "topic") {
      if (topicOptions.pickTopic) { topicPickers.add(post.identity); repaintCard(post.identity); }
      if (topicOptions.topicId) {
        if (destination.sessionId !== topicOptions.topicSessionId) wheel.showToast("工作區已變更，貼文保留喺未分流。");
        else {
          pendingTopics.set(post.identity, { post, itemId: destination.itemId, sessionId: destination.sessionId, topicId: topicOptions.topicId });
          flushTopicAssignments();
          // Save and its storage events may arrive in either order. Refresh signal inventory after acknowledgement.
          if (pendingTopics.has(post.identity)) {
            const issuedAt = signalInventoryRevision;
            try {
              const stored = await chrome.storage.local.get(SIGNALS_STORAGE_KEY);
              if (!destroyed && issuedAt === signalInventoryRevision && pendingTopics.has(post.identity)) {
                signals = readSignals(stored[SIGNALS_STORAGE_KEY]); flushTopicAssignments();
              }
            } catch { if (!destroyed) wheel.showToast("已收藏，話題指派等候資料更新。"); }
          }
        }
      }
    }
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
  function openReader(identity:string) {
    const destination=saved(identity); if (!destination) return;
    const lens=cards.get(identity)?.lens ?? undefined;
    void send({type:"sidepanel/open",sessionId:destination.sessionId,itemId:destination.itemId,...(lens ? {lens} : {})}).catch(()=>wheel.showToast("未能開啟閱讀頁，請再試。"));
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
    getTopics: () => {
      const sessionId = state.destinations.find(d => d.mode === "topic")?.sessionId ?? null;
      const items = global?.sessions.find(s => s.id === sessionId)?.items ?? [];
      return recentTopics(sessionId).map(t => ({ id: t.id, name: t.name, count: signals.filter(s => s.sessionId === sessionId && s.topicId === t.id && items.some(i => i.id === s.itemId)).length }));
    },
    getLastMode: () => optimisticLastMode ?? state.lastMode,
    getSavedMode: (identity) => optimistic.has(identity) ? optimistic.get(identity)?.mode ?? null : saved(identity)?.mode ?? null,
    getHoveredPost: () => injection?.getHoveredPost() ?? null,
    onSave: (post, mode, options) => {
      const descriptor = captureDescriptor(post);
      if (!descriptor) { injection?.scan(); return; }
      const mutationPost = { ...post, descriptor };
      acknowledge(post, mode, options.popDelay);
      enqueue(post, () => save(mutationPost, mode, options));
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
        if (saved(post.identity)?.mode === "topic") {
          const destination = saved(post.identity)!;
          const item = itemOf(destination);
          if (!item) return;
          const vm = buildInlineCardViewModel(item, "topic", destination.sessionName, { ai: aiOf(item), now: Date.now() });
          const next = nextInlineDisclosure(!!view.expanded, buildInlineSaveLine(vm, Date.now(), null, topicNameOf(item.id)).ready);
          cards.set(post.identity, { ...view, hidden: false, expanded: next.expanded });
          if (next.markOpened) void markReadingOpened(chrome.storage.local, item.id, new Date().toISOString()).catch(() => wheel.showToast("未能記錄已讀，請再試。"));
        } else cards.set(post.identity, { ...view, hidden: !view.hidden });
        renderCard(post);
      };
      post.chip.addEventListener("click", onClick);
      paint(post);
      return () => { unbind(); post.chip.removeEventListener("click", onClick); removeCard(post.identity); };
    }
  });
  const storageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || destroyed) return;
    if (PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY in changes) {
      productRevision++;
      const raw=changes[PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY].newValue;
      productAnalyses=Object.fromEntries(Object.entries(raw && typeof raw === "object" ? raw : {}).flatMap(([id,value])=>{const a=normalizeProductSignalAnalysisRecord(value); return a ? [[id,a]] : [];}));
      injection?.entries().forEach(renderCard);
    }
    if (INLINE_READINGS_STORAGE_KEY in changes || TOPICS_STORAGE_KEY in changes || SIGNALS_STORAGE_KEY in changes) {
      if (INLINE_READINGS_STORAGE_KEY in changes) readings = normalizeInlineReadingRecords(changes[INLINE_READINGS_STORAGE_KEY].newValue);
      if (TOPICS_STORAGE_KEY in changes) { topicInventoryRevision++; topics = readTopics(changes[TOPICS_STORAGE_KEY].newValue); }
      if (SIGNALS_STORAGE_KEY in changes) { signalInventoryRevision++; signals = readSignals(changes[SIGNALS_STORAGE_KEY].newValue); }
      flushTopicAssignments(); wheel.refreshTopics();
      trackOffscreenReadings();
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
    flushTopicAssignments(); wheel.refreshTopics();
    trackOffscreenReadings();
    injection?.entries().forEach(paint);
  };
  function latestGlobal(next: ExtensionGlobalState | null) { global = next; }
  void Promise.resolve(chrome.storage.local?.get?.(GLOBAL_STATE_STORAGE_KEY)).then((stored) => {
    if (destroyed) return;
    const next = stored?.[GLOBAL_STATE_STORAGE_KEY] as ExtensionGlobalState | undefined;
    if (next && Array.isArray(next.sessions)) { global = next; injection?.entries().forEach(paint); }
  }).catch(() => undefined);
  const initialProductRevision=productRevision;
  void loadProductSignalAnalysisMap(chrome.storage.local).then(records=>{if(!destroyed && productRevision===initialProductRevision){productAnalyses=records;injection?.entries().forEach(renderCard);}}).catch(()=>undefined);
  const initialSignalRevision = signalInventoryRevision, initialTopicRevision = topicInventoryRevision;
  void Promise.resolve(chrome.storage.local?.get?.([INLINE_READINGS_STORAGE_KEY, TOPICS_STORAGE_KEY, SIGNALS_STORAGE_KEY])).then((stored) => {
    if (destroyed || !stored) return;
    readings = normalizeInlineReadingRecords(stored[INLINE_READINGS_STORAGE_KEY]);
    if (initialTopicRevision === topicInventoryRevision) topics = readTopics(stored[TOPICS_STORAGE_KEY]);
    if (initialSignalRevision === signalInventoryRevision) signals = readSignals(stored[SIGNALS_STORAGE_KEY]);
    flushTopicAssignments(); wheel.refreshTopics();
    injection?.entries().forEach(renderCard);
  }).catch(() => undefined);
  // The side panel follows the feed: report the post crossing the middle of the viewport whenever it changes.
  let inView: string | null = null;
  let inViewFrame = 0;
  let inViewTimer = 0;
  // force: report even when unchanged, so a panel that just switched to this tab hears it.
  const reportInView = (force = false) => {
    if (inViewFrame) return;
    inViewFrame = window.requestAnimationFrame(() => {
      inViewFrame = 0;
      const middle = window.innerHeight * 0.45;
      const entry = injection?.entries().find((candidate) => { const rect = candidate.card.getBoundingClientRect(); return rect.top <= middle && rect.bottom >= middle; });
      const next = entry?.identity ?? null;
      if (next === inView && !force) return;
      inView = next;
      void send({ type: "inline/in-view", postKey: next }).catch(() => undefined);
    });
  };
  const onScroll = () => reportInView();
  // Cards render after the snapshot and after SPA navigation; look again once they have had time to mount.
  const reportSoon = () => { window.clearTimeout(inViewTimer); inViewTimer = window.setTimeout(() => reportInView(true), 800); };
  const onVisibility = () => { if (document.visibilityState === "visible") reportInView(true); };
  document.addEventListener("scroll", onScroll, { passive: true, capture: true });
  document.addEventListener("visibilitychange", onVisibility);
  void ready.then(reportSoon);
  chrome.storage.onChanged.addListener(storageListener);
  function teardown() {
    destroyed = true; visibility.disconnect(); for (const timer of glowTimers.values()) window.clearTimeout(timer); glowTimers.clear();
    document.removeEventListener("scroll", onScroll, { capture: true }); document.removeEventListener("visibilitychange", onVisibility); window.clearTimeout(inViewTimer); if (inViewFrame) window.cancelAnimationFrame(inViewFrame); window.clearInterval(waitTimer); window.clearInterval(pollTimer);
    try { chrome.storage.onChanged.removeListener(storageListener); } catch { /* the extension context may already be gone */ }
    injection?.destroy(); wheel.destroy(); for (const id of [...slots.keys()]) removeCard(id);
  }
  return {
    reset() {
      wheel.reset(); injection?.reset();
      // A new page: the old post is no longer in view.
      inView = null; void send({ type: "inline/in-view", postKey: null }).catch(() => undefined); reportSoon();
    },
    destroy: teardown
  };
}
