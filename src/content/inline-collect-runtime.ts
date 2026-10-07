import type { ExtensionMessage, ExtensionResponse } from "../state/messages";
import { INLINE_COLLECT_MODES, INLINE_COLLECT_MODE_NAMES, inlineCollectPostKey, projectInlineCollectState, type InlineCollectMessage, type InlineCollectState } from "../state/inline-collect";
import { buildTargetDescriptor } from "../targeting/threads";
import { getModeHomePage } from "../state/processing-state";
import { requestWorkspaceOpen, OPTIMISTIC_SAVE_CONFIRMED_EVENT } from "../ui/inpage-helpers";
import { createInlineCollectInjection, type InlineCollectEntry } from "./inline-collect-injection";
import { createInlineCollectWheel, INLINE_COLLECT_BUTTON_HTML, updateSavedButton, type InlineCollectPost } from "./inline-collect-wheel";
import { createEmptyGlobalState, type ExtensionGlobalState, type FolderMode } from "../state/types";
import { createPipelineRequestId, emitPipelineEvent } from "../state/pipeline-trace";
import { GLOBAL_STATE_STORAGE_KEY } from "../state/storage-keys";
import { buildInlineCardViewModel, type InlineCardEntryKey } from "../viewmodel/inline-card";
import { renderInlineCard, formatWait } from "./inline-collect-card";

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
  const mutations = new Map<string, Promise<void>>();
  const saved = (identity: string) => state.saved.find((item) => item.postKey === identity);
  const send = (message: ExtensionMessage) => chrome.runtime.sendMessage(message) as Promise<ExtensionResponse>;
  // The card under a saved post (v9): shown on save, × hides it, the chip toggles it back.
  let global: ExtensionGlobalState | null = null;
  const cards = new Map<string, { hidden: boolean; lens: InlineCardEntryKey | null }>();
  const slots = new Map<string, HTMLElement>();
  function removeCard(identity: string) { slots.get(identity)?.remove(); slots.delete(identity); }
  function renderCard(post: InlineCollectPost) {
    const destination = pending.has(post.identity) ? null : saved(post.identity);
    const view = cards.get(post.identity);
    const session = destination && global?.sessions.find((entry) => entry.id === destination.sessionId);
    const item = session?.items.find((entry) => entry.id === destination!.itemId);
    if (!destination || !item || view?.hidden) { removeCard(post.identity); return; }
    const bar = post.button.parentElement?.parentElement;
    if (!bar) return;
    let slot = slots.get(post.identity);
    if (!slot || !slot.isConnected || slot.previousElementSibling !== bar) {
      slot?.remove();
      slot = document.createElement("div");
      slot.className = "dlens-card-slot";
      slot.setAttribute("data-dlens-control", "true");
      slot.addEventListener("click", (event) => onCardClick(post, event));
      bar.insertAdjacentElement("afterend", slot);
      slots.set(post.identity, slot);
    }
    const vm = buildInlineCardViewModel(item, destination.mode, destination.sessionName);
    const lens = view?.lens && vm.answers[view.lens] ? view.lens : null;
    slot.innerHTML = renderInlineCard(vm, lens, Date.now());
  }
  function onCardClick(post: InlineCollectPost, event: MouseEvent) {
    // Our card sits inside a Threads post; never let a click reach Threads' own navigation.
    event.preventDefault(); event.stopPropagation();
    const target = event.target instanceof Element ? event.target : null;
    const lens = target?.closest<HTMLElement>("[data-dlens-lens]")?.dataset.dlensLens as InlineCardEntryKey | undefined;
    const view = cards.get(post.identity) ?? { hidden: false, lens: null };
    if (lens) { cards.set(post.identity, { ...view, lens: view.lens === lens ? null : lens }); renderCard(post); return; }
    const act = target?.closest<HTMLElement>("[data-dlens-act]")?.dataset.dlensAct;
    const destination = saved(post.identity);
    if (act === "close") { cards.set(post.identity, { ...view, hidden: true }); renderCard(post); }
    else if (act === "open") void openWorkspace(post.identity);
    else if (act === "move") wheel.openSticky(post);
    else if (act === "crawl" && destination) {
      void send({ type: "session/queue-items-and-start-processing", sessionId: destination.sessionId, itemIds: [destination.itemId] })
        .catch(() => wheel.showToast("未能開始抓取，請檢查 DLens 後端。"));
    }
  }
  const waitTimer = window.setInterval(() => {
    for (const slot of slots.values()) slot.querySelectorAll<HTMLElement>("[data-dlens-wait]").forEach((el) => { el.textContent = formatWait(el.dataset.dlensWait || null, Date.now()); });
  }, 1000);
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
    if (response.snapshot) window.dispatchEvent(new CustomEvent(OPTIMISTIC_SAVE_CONFIRMED_EVENT, { detail: response.snapshot }));
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
    mutations.set(post.identity, next);
    void next.finally(() => { if (mutations.get(post.identity) === next) mutations.delete(post.identity); });
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
  async function openWorkspace(identity: string) {
    await mutations.get(identity);
    const destination = saved(identity);
    if (!destination) return;
    try {
      await request({ type: "session/set-active", sessionId: destination.sessionId });
      await request({ type: "popup/navigate-active-tab", page: getModeHomePage(destination.mode) });
      await request({ type: "popup/open-active-tab" });
      requestWorkspaceOpen(destination.sessionId);
    } catch { wheel.showToast("未能開啟工作區，請再試。"); }
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
        const view = cards.get(post.identity) ?? { hidden: false, lens: null };
        cards.set(post.identity, { ...view, hidden: !view.hidden });
        renderCard(post);
      };
      post.chip.addEventListener("click", onClick);
      paint(post);
      return () => { unbind(); post.chip.removeEventListener("click", onClick); removeCard(post.identity); };
    }
  });
  const storageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || destroyed || !(GLOBAL_STATE_STORAGE_KEY in changes)) return;
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
  chrome.storage.onChanged.addListener(storageListener);
  return {
    reset() { wheel.reset(); injection?.reset(); },
    destroy() { destroyed = true; window.clearInterval(waitTimer); chrome.storage.onChanged.removeListener(storageListener); injection?.destroy(); wheel.destroy(); for (const id of [...slots.keys()]) removeCard(id); }
  };
}
