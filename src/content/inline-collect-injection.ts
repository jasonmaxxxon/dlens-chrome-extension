import type { TargetDescriptor } from "../contracts/target-descriptor";
import { inlineCollectPostKey } from "../state/inline-collect";
import { buildTargetDescriptor, canSubmitDescriptor, findCardCandidate, findPostActionBar, normalizeUrl } from "../targeting/threads";

export interface InlineCollectEntry {
  identity: string;
  card: HTMLElement;
  button: HTMLButtonElement;
  chip: HTMLButtonElement;
  descriptor: TargetDescriptor;
}

type Options = {
  document: Document;
  getPageUrl: () => string;
  onAdd: (entry: InlineCollectEntry) => (() => void);
};

/** Native Threads owns post nodes; only the small marked control is ours. */
export function createInlineCollectInjection(options: Options) {
  const doc = options.document;
  const records = new Map<HTMLElement, { entry: InlineCollectEntry; wrapper: HTMLElement; dispose: () => void }>();
  let frame: number | null = null;
  let destroyed = false;
  let hovered: HTMLElement | null = null;

  function remove(card: HTMLElement) {
    const record = records.get(card);
    if (!record) return;
    record.dispose();
    record.wrapper.remove();
    records.delete(card);
  }

  function scan() {
    if (destroyed) return;
    const seen = new Set<HTMLElement>();
    const identities = new Set<string>();
    for (const link of doc.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]')) {
      if (link.closest('[role="dialog"], blockquote, [data-dlens-control="true"]')) continue;
      const card = findCardCandidate(link).root;
      if (!card || seen.has(card) || card.closest('[role="dialog"]')) continue;
      seen.add(card);
      // On detail pages, sibling posts are replies even if the first article
      // fallback in legacy hover targeting would classify one as a root post.
      const page = normalizeUrl(options.getPageUrl());
      const permalink = normalizeUrl(card.querySelector<HTMLAnchorElement>('a[href*="/post/"]')?.getAttribute("href") || "");
      if (/\/post\//.test(page) && permalink !== page) { remove(card); continue; }
      const ancestorPost = card.parentElement?.closest('article, [role="article"], blockquote');
      if (ancestorPost) { remove(card); continue; }
      const actionBar = findPostActionBar(card);
      if (!actionBar) { remove(card); continue; }
      const previous = records.get(card);
      // Recycled nodes must not retain the former post's listener or saved chip.
      if (previous && (previous.entry.identity !== inlineCollectPostKey({ post_url: permalink }) || previous.wrapper.parentElement !== actionBar)) remove(card);
      const current = records.get(card);
      if (current) { identities.add(current.entry.identity); continue; }
      // React can clone a post together with our DOM, but its old listeners are
      // not cloned. Remove that orphan before binding the new native node.
      actionBar.querySelectorAll('.dlens-collect-inline[data-dlens-control="true"]').forEach((node) => node.remove());
      const descriptor = buildTargetDescriptor(card, options.getPageUrl());
      if (!descriptor || !canSubmitDescriptor(descriptor) || descriptor.target_type !== "post") continue;
      const identity = inlineCollectPostKey(descriptor);
      if (!identity || identities.has(identity)) continue;
      identities.add(identity);
      const wrapper = doc.createElement("span");
      wrapper.className = "dlens-collect-inline";
      wrapper.setAttribute("data-dlens-control", "true");
      wrapper.setAttribute("data-dlens-post-key", identity);
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "dlens-collect-button";
      button.setAttribute("data-dlens-control", "true");
      button.setAttribute("aria-label", "收藏至 DLens；長按選擇工作區");
      const chip = doc.createElement("button");
      chip.type = "button";
      chip.className = "dlens-collect-chip";
      chip.setAttribute("data-dlens-control", "true");
      chip.hidden = true;
      wrapper.append(chip, button);
      actionBar.append(wrapper);
      const entry = { identity, card, button, chip, descriptor };
      records.set(card, { entry, wrapper, dispose: options.onAdd(entry) });
    }
    for (const [card] of records) if (!card.isConnected || !seen.has(card)) remove(card);
  }

  function schedule() {
    if (frame !== null || destroyed) return;
    frame = doc.defaultView!.requestAnimationFrame(() => { frame = null; scan(); });
  }
  const observer = new MutationObserver((mutations) => {
    // Changes inside our button/wheel are never a reason to rescan Threads.
    if (mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      return !target?.closest('[data-dlens-control="true"]');
    })) schedule();
  });
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["href", "role", "data-pressable-container"] });
  const onMove = (event: Event) => {
    const element = event.target instanceof Element ? event.target : null;
    hovered = element ? Array.from(records.keys()).find((card) => card.contains(element)) ?? null : null;
  };
  const clearHovered = () => { hovered = null; };
  doc.addEventListener("pointermove", onMove, true);
  doc.addEventListener("pointerleave", clearHovered);
  doc.defaultView?.addEventListener("blur", clearHovered);
  scan();
  return {
    scan,
    entries: () => Array.from(records.values(), ({ entry }) => entry),
    getHoveredPost: () => hovered?.isConnected ? records.get(hovered)?.entry ?? null : null,
    reset() { hovered = null; for (const [card] of records) remove(card); schedule(); },
    destroy() {
      destroyed = true;
      observer.disconnect();
      if (frame !== null) doc.defaultView!.cancelAnimationFrame(frame);
      doc.removeEventListener("pointermove", onMove, true);
      doc.removeEventListener("pointerleave", clearHovered);
      doc.defaultView?.removeEventListener("blur", clearHovered);
      clearHovered();
      for (const [card] of records) remove(card);
    }
  };
}
