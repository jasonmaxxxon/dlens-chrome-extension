import React from "react";
import ReactDOM from "react-dom/client";
import { defineContentScript } from "wxt/utils/define-content-script";
import { buildTargetDescriptor, canSubmitDescriptor, findCardCandidate, type CandidateStrength } from "../src/targeting/threads";
import { createLocationChangeChecker, HOVER_INTENT_DELAY_MS } from "../src/targeting/navigation-reset";
import type { ExtensionMessage, ExtensionResponse } from "../src/state/messages";
import type { FolderMode } from "../src/state/types";
import {
  buildSelectionModeMessage,
  resolveSelectionModeFromSnapshot,
  type SelectionModeExitReason
} from "../src/state/selection-mode-messages";
import { InPageCollectorApp } from "../src/ui/InPageCollectorApp";
import { markQaTrace } from "../src/ui/qa-trace";
import { buildWorkspaceCrashMarkup, getWorkspaceCrashMessage, isExtensionRuntimeError } from "../src/ui/runtime-guard";
import { DLENS_MOTION_CSS } from "../src/ui/ProductSignalViews";
import {
  getLiveCollectionTarget,
  HOVER_RECT_EVENT,
  OPTIMISTIC_SAVE_CONFIRMED_EVENT,
  OPTIMISTIC_SAVE_EVENT,
  OPTIMISTIC_SAVE_FAILED_EVENT,
  setLiveHoverDescriptor
} from "../src/ui/inpage-helpers";

const OVERLAY_ID = "__dlens_extension_v0_overlay__";
const ROOT_ID = "__dlens_extension_v0_root__";
const QA_TRACE_VERSION = "run14-url-trace-v1";

let selectionMode = false;
let hoverCard: HTMLElement | null = null;
let hoverStrength: CandidateStrength | null = null;
let hoverDescriptor: ReturnType<typeof buildTargetDescriptor> | null = null;
let hoverIntentHandle: number | null = null;
let previousBodyCursor = "";
let previousDocumentCursor = "";
let removeSpaNavigationReset: (() => void) | null = null;
let activeSelectionMode: FolderMode = "archive";

const SELECTION_MODE_THEMES: Record<FolderMode, {
  accent: string;
  accentMid: string;
  borderStrong: string;
  borderSoft: string;
  surfaceStrong: string;
  surfaceSoft: string;
  shadowStrong: string;
  shadowSoft: string;
}> = {
  archive: {
    accent: "#1a2e4f",
    accentMid: "#2b4a80",
    borderStrong: "rgba(26,46,79,0.55)",
    borderSoft: "rgba(26,46,79,0.26)",
    surfaceStrong: "rgba(26,46,79,0.04)",
    surfaceSoft: "rgba(26,46,79,0.02)",
    shadowStrong: "rgba(26,46,79,0.13)",
    shadowSoft: "rgba(26,46,79,0.07)"
  },
  topic: {
    accent: "#3f5a3b",
    accentMid: "#527648",
    borderStrong: "rgba(63,90,59,0.58)",
    borderSoft: "rgba(63,90,59,0.28)",
    surfaceStrong: "rgba(63,90,59,0.05)",
    surfaceSoft: "rgba(63,90,59,0.025)",
    shadowStrong: "rgba(63,90,59,0.15)",
    shadowSoft: "rgba(63,90,59,0.08)"
  },
  product: {
    accent: "#234f7a",
    accentMid: "#2f6a96",
    borderStrong: "rgba(35,79,122,0.58)",
    borderSoft: "rgba(35,79,122,0.28)",
    surfaceStrong: "rgba(35,79,122,0.045)",
    surfaceSoft: "rgba(35,79,122,0.025)",
    shadowStrong: "rgba(35,79,122,0.14)",
    shadowSoft: "rgba(35,79,122,0.07)"
  },
  "pr-evidence": {
    accent: "#7a2030",
    accentMid: "#9b3a49",
    borderStrong: "rgba(122,32,48,0.56)",
    borderSoft: "rgba(122,32,48,0.26)",
    surfaceStrong: "rgba(122,32,48,0.045)",
    surfaceSoft: "rgba(122,32,48,0.025)",
    shadowStrong: "rgba(122,32,48,0.13)",
    shadowSoft: "rgba(122,32,48,0.07)"
  }
};

function selectionTheme() {
  return SELECTION_MODE_THEMES[activeSelectionMode] ?? SELECTION_MODE_THEMES.archive;
}

function isControlSurface(node: EventTarget | Node | null): boolean {
  const element = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
  return Boolean(element?.closest('[data-dlens-control="true"]'));
}

function ensureOverlay(): HTMLDivElement {
  let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (!overlay) {
    const theme = selectionTheme();
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.position = "fixed";
    overlay.style.pointerEvents = "none";
    overlay.style.border = `1.5px solid ${theme.borderStrong}`;
    overlay.style.borderRadius = "16px";
    overlay.style.background = theme.surfaceStrong;
    overlay.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.5), 0 8px 24px ${theme.shadowStrong}`;
    overlay.style.transition = "transform 120ms ease-out, top 120ms ease-out, left 120ms ease-out, width 120ms ease-out, height 120ms ease-out, opacity 120ms ease-out, border-color 120ms ease-out, background-color 120ms ease-out, box-shadow 120ms ease-out";
    overlay.style.zIndex = "2147483645";
    overlay.style.display = "none";
    document.documentElement.appendChild(overlay);
  }
  return overlay;
}

function ensureRoot(): HTMLDivElement {
  let root = document.getElementById(ROOT_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-dlens-control", "true");
    document.documentElement.appendChild(root);
  }
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.width = "100vw";
  root.style.height = "100vh";
  root.style.pointerEvents = "none";
  root.style.zIndex = "2147483639";
  root.setAttribute("data-dlens-qa-trace-version", QA_TRACE_VERSION);
  // Inject the shared motion layer once (must go via document.head to survive Threads CSP)
  if (!document.getElementById("__dlens_product_motion__")) {
    const motionStyle = document.createElement("style");
    motionStyle.id = "__dlens_product_motion__";
    motionStyle.textContent = DLENS_MOTION_CSS;
    document.head.appendChild(motionStyle);
  }
  // Inject animation keyframes once
  if (!document.getElementById("__dlens_keyframes__")) {
    const style = document.createElement("style");
    style.id = "__dlens_keyframes__";
    style.textContent = `
      @keyframes dlens-slide-in {
        from { opacity: 0; transform: translateY(-8px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes dlens-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
      }
      @keyframes dlens-glow-border {
        0%, 100% { border-color: rgba(63,90,59,0.18); }
        50% { border-color: rgba(63,90,59,0.35); }
      }
      @keyframes dlens-scan {
        0% { background-position: 0% 0%; }
        100% { background-position: 0% 100%; }
      }
      @keyframes dlens-bump {
        0% { transform: scale(1); }
        32% { transform: scale(1.34); }
        62% { transform: scale(0.94); }
        100% { transform: scale(1); }
      }
      @keyframes dlens-success-pulse {
        0% { box-shadow: 0 0 0 0 rgba(63,90,59,0); }
        16% { box-shadow: 0 0 0 6px rgba(63,90,59,0.26); }
        40% { box-shadow: 0 0 0 0 rgba(63,90,59,0); }
        58% { box-shadow: 0 0 0 5px rgba(63,90,59,0.18); }
        100% { box-shadow: 0 0 0 0 rgba(63,90,59,0); }
      }
    `;
    document.head.appendChild(style);
  }
  return root;
}

function renderWorkspaceCrashFallback(root: HTMLDivElement, error: unknown) {
  const message = getWorkspaceCrashMessage(error);
  root.innerHTML = buildWorkspaceCrashMarkup(message);
}

function emitHoverRect(card: HTMLElement | null) {
  const detail = card ? card.getBoundingClientRect().toJSON() : null;
  window.dispatchEvent(new CustomEvent(HOVER_RECT_EVENT, { detail }));
}

function renderOverlay(card: HTMLElement | null, strength: CandidateStrength | null) {
  const overlay = ensureOverlay();
  if (!card) {
    overlay.style.display = "none";
    emitHoverRect(null);
    markQaTrace("content.overlay.hide");
    return;
  }

  const rect = card.getBoundingClientRect();
  const theme = selectionTheme();
  overlay.style.display = "block";
  overlay.style.top = `${rect.top - 3}px`;
  overlay.style.left = `${rect.left - 3}px`;
  overlay.style.width = `${rect.width + 6}px`;
  overlay.style.height = `${rect.height + 6}px`;
  overlay.style.borderColor = strength === "soft" ? theme.borderSoft : theme.borderStrong;
  overlay.style.background = strength === "soft" ? theme.surfaceSoft : theme.surfaceStrong;
  overlay.style.boxShadow =
    strength === "soft"
      ? `0 0 0 1px rgba(255,255,255,0.35), 0 6px 16px ${theme.shadowSoft}`
      : `0 0 0 1px rgba(255,255,255,0.5), 0 10px 24px ${theme.shadowStrong}`;
  emitHoverRect(card);
  markQaTrace("content.overlay.render", {
    strength,
    rect: {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }
  });
}

function clearHoverIntent() {
  if (hoverIntentHandle !== null) {
    window.clearTimeout(hoverIntentHandle);
    hoverIntentHandle = null;
  }
}

function setCollectCursor(enabled: boolean) {
  if (enabled) {
    previousBodyCursor = document.body.style.cursor;
    previousDocumentCursor = document.documentElement.style.cursor;
    document.body.style.cursor = "crosshair";
    document.documentElement.style.cursor = "crosshair";
    return;
  }

  document.body.style.cursor = previousBodyCursor;
  document.documentElement.style.cursor = previousDocumentCursor;
}

function publishHoveredDescriptor(descriptor: ReturnType<typeof buildTargetDescriptor> | null) {
  setLiveHoverDescriptor(descriptor);
  markQaTrace("content.hover.publish", {
    hasDescriptor: Boolean(descriptor),
    postUrl: descriptor?.post_url ?? null,
    author: descriptor?.author_hint ?? null,
    strength: hoverStrength
  });
  chrome.runtime
    .sendMessage({ type: "selection/hovered", descriptor, strength: hoverStrength } satisfies ExtensionMessage)
    .catch(() => undefined);
}

function readSubmittableDescriptor(card: HTMLElement): ReturnType<typeof buildTargetDescriptor> | null {
  const descriptor = buildTargetDescriptor(card, window.location.href);
  if (!descriptor || !canSubmitDescriptor(descriptor)) {
    return null;
  }
  return descriptor;
}

/** Fingerprint a card by its permalink to detect SPA-reused DOM nodes */
function cardFingerprint(card: HTMLElement): string {
  const link = card.querySelector<HTMLAnchorElement>('a[href*="/post/"]');
  return link?.getAttribute("href") || "";
}

let lastCardFingerprint = "";

function setHoverCard(card: HTMLElement | null, strength: CandidateStrength | null) {
  const fp = card ? cardFingerprint(card) : "";

  // Same DOM node AND same permalink — just update visual strength
  if (hoverCard === card && fp === lastCardFingerprint) {
    hoverStrength = strength;
    renderOverlay(card, strength);
    return;
  }

  hoverCard = card;
  hoverStrength = strength;
  hoverDescriptor = null;
  lastCardFingerprint = fp;
  renderOverlay(card, strength);
  clearHoverIntent();
  markQaTrace("content.hover.card-change", {
    hasCard: Boolean(card),
    strength,
    fingerprint: fp || null,
    delayMs: card ? strength === "hard" ? 0 : HOVER_INTENT_DELAY_MS : null
  });

  if (!card) {
    publishHoveredDescriptor(null);
    return;
  }

  const delayMs = strength === "hard" ? 0 : HOVER_INTENT_DELAY_MS;
  hoverIntentHandle = window.setTimeout(() => {
    const startedAt = performance.now();
    const descriptor = readSubmittableDescriptor(card);
    hoverDescriptor = descriptor;
    markQaTrace("content.hover.intent-fired", {
      hasDescriptor: Boolean(descriptor),
      postUrl: descriptor?.post_url ?? null,
      readMs: Math.round((performance.now() - startedAt) * 10) / 10
    });
    publishHoveredDescriptor(descriptor);
  }, delayMs);
}

function clearHoverStateForNavigation() {
  lastCardFingerprint = "";
  setHoverCard(null, null);
}

function installSpaNavigationReset() {
  const checkLocationChange = createLocationChangeChecker(window.location.href);
  const handlePotentialNavigation = () => {
    checkLocationChange(window.location.href, () => {
      clearHoverStateForNavigation();
    });
  };

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function pushState(...args) {
    const result = originalPushState(...args);
    handlePotentialNavigation();
    return result;
  };

  history.replaceState = function replaceState(...args) {
    const result = originalReplaceState(...args);
    handlePotentialNavigation();
    return result;
  };

  window.addEventListener("popstate", handlePotentialNavigation, true);
  window.addEventListener("hashchange", handlePotentialNavigation, true);

  const observer = new MutationObserver(() => {
    handlePotentialNavigation();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", handlePotentialNavigation, true);
    window.removeEventListener("hashchange", handlePotentialNavigation, true);
    observer.disconnect();
  };
}

function stopSelectionMode(reason: SelectionModeExitReason = "manual-cancel") {
  selectionMode = false;
  setCollectCursor(false);
  clearHoverIntent();
  setHoverCard(null, null);
  dropKeepAlive();
  const message = buildSelectionModeMessage(false, reason);
  markQaTrace("content.selection.stop", { reason });
  if (!message) {
    return;
  }
  chrome.runtime.sendMessage(message satisfies ExtensionMessage).catch(() => undefined);
}

function startSelectionMode(mode: FolderMode = "archive", notify = true) {
  activeSelectionMode = mode;
  selectionMode = true;
  setCollectCursor(true);
  ensureKeepAlive();
  markQaTrace("content.selection.start", { mode, notify });
  if (!notify) {
    return;
  }
  const message = buildSelectionModeMessage(true);
  if (message) {
    chrome.runtime.sendMessage(message satisfies ExtensionMessage).catch(() => undefined);
  }
}

function syncSelectionModeFromSnapshot() {
  markQaTrace("content.selection.sync.request");
  chrome.runtime
    .sendMessage({ type: "state/get-active-tab" } satisfies ExtensionMessage)
    .then((response: ExtensionResponse) => {
      markQaTrace("content.selection.sync.response", {
        ok: response.ok,
        hasSnapshot: Boolean(response.ok && response.snapshot)
      });
      if (!response.ok || !response.snapshot) {
        return;
      }
      const mode = resolveSelectionModeFromSnapshot(response.snapshot);
      if (mode) {
        startSelectionMode(mode, false);
        return;
      }
      if (selectionMode) {
        stopSelectionMode("remote-sync");
      }
    })
    .catch(() => undefined);
}

function onPointerMove(event: MouseEvent) {
  if (!selectionMode || isControlSurface(event.target)) {
    return;
  }
  const candidate = findCardCandidate(event.target);
  setHoverCard(candidate.root, candidate.strength);
}

function onClick(event: MouseEvent) {
  if (!selectionMode || isControlSurface(event.target)) {
    return;
  }

  const candidate = findCardCandidate(event.target);
  const card = candidate.root;
  if (!card) {
    markQaTrace("content.collect.click.pass-through", { reason: "no-card", strength: candidate.strength });
    return;
  }

  const descriptor = hoverCard === card && hoverDescriptor ? hoverDescriptor : readSubmittableDescriptor(card);
  if (!descriptor) {
    markQaTrace("content.collect.click.pass-through", { reason: "no-descriptor", strength: candidate.strength });
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  markQaTrace("content.collect.click.capture", {
    postUrl: descriptor.post_url,
    author: descriptor.author_hint,
    strength: candidate.strength
  });
  window.dispatchEvent(new CustomEvent(OPTIMISTIC_SAVE_EVENT, { detail: descriptor }));

  // Read the folder/topic the popup is showing right now so the click saves to the
  // intended target instead of whatever the background's activeSessionId happens to be.
  const target = getLiveCollectionTarget();

  void (async () => {
    const saveStartedAt = performance.now();
    await chrome.runtime
      .sendMessage({ type: "selection/hovered", descriptor, strength: candidate.strength } satisfies ExtensionMessage)
      .catch(() => undefined);
    if (!target.sessionId) {
      markQaTrace("content.collect.save.response", {
        ok: false,
        elapsedMs: Math.round((performance.now() - saveStartedAt) * 10) / 10,
        hasSnapshot: false
      });
      window.dispatchEvent(
        new CustomEvent(OPTIMISTIC_SAVE_FAILED_EVENT, {
          detail: descriptor.post_url
        })
      );
      return;
    }
    markQaTrace("content.collect.save.request", {
      postUrl: descriptor.post_url,
      sessionId: target.sessionId,
      topicId: target.topicId
    });
    const response = await chrome.runtime
      .sendMessage({
        type: "session/save-current-preview",
        target: {
          sessionId: target.sessionId,
          topicId: target.topicId
        },
        descriptor
      } satisfies ExtensionMessage)
      .catch(() => null);
    markQaTrace("content.collect.save.response", {
      ok: Boolean(response?.ok),
      elapsedMs: Math.round((performance.now() - saveStartedAt) * 10) / 10,
      hasSnapshot: Boolean(response?.ok && response.snapshot)
    });
    if (response?.ok) {
      window.dispatchEvent(new CustomEvent(OPTIMISTIC_SAVE_CONFIRMED_EVENT, { detail: response.snapshot ?? null }));
      return;
    }
    if (!response || !response.ok) {
      window.dispatchEvent(
        new CustomEvent(OPTIMISTIC_SAVE_FAILED_EVENT, {
          detail: descriptor.post_url
        })
      );
    }
  })();
}

function onKeyDown(event: KeyboardEvent) {
  if (!selectionMode) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    stopSelectionMode("manual-cancel");
  }
}

window.addEventListener("mousemove", onPointerMove, true);
window.addEventListener("click", onClick, true);
window.addEventListener("keydown", onKeyDown, true);

/** Keep MV3 service worker alive while selection mode is active */
let keepAlivePort: chrome.runtime.Port | null = null;

function ensureKeepAlive() {
  if (keepAlivePort) return;
  keepAlivePort = chrome.runtime.connect({ name: "dlens-keepalive" });
  keepAlivePort.onDisconnect.addListener(() => {
    keepAlivePort = null;
    // Reconnect if still in selection mode
    if (selectionMode) {
      setTimeout(ensureKeepAlive, 500);
    }
  });
}

function dropKeepAlive() {
  if (keepAlivePort) {
    keepAlivePort.disconnect();
    keepAlivePort = null;
  }
}

export default defineContentScript({
  matches: ["*://*.threads.net/*", "*://*.threads.com/*"],
  main() {
    ensureOverlay();
    removeSpaNavigationReset?.();
    removeSpaNavigationReset = installSpaNavigationReset();

    const root = ensureRoot();
    const extensionOrigin = chrome.runtime.getURL("");
    const reactRoot = ReactDOM.createRoot(root);

    const onWindowError = (event: ErrorEvent) => {
      const candidate = event.error || event.message || event.filename;
      if (!isExtensionRuntimeError(candidate, extensionOrigin)) {
        return;
      }
      console.error("DLens runtime error", candidate);
      renderWorkspaceCrashFallback(root, candidate);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isExtensionRuntimeError(event.reason, extensionOrigin)) {
        return;
      }
      console.error("DLens unhandled rejection", event.reason);
      renderWorkspaceCrashFallback(root, event.reason);
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    reactRoot.render(React.createElement(InPageCollectorApp));
    syncSelectionModeFromSnapshot();

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      void (async () => {
        switch (message.type) {
          case "selection/start-tab":
            startSelectionMode(message.mode ?? "archive", false);
            sendResponse({ ok: true } satisfies ExtensionResponse);
            return;
          case "selection/cancel-tab":
            stopSelectionMode("remote-sync");
            sendResponse({ ok: true } satisfies ExtensionResponse);
            return;
          default:
            sendResponse({ ok: false, error: "unsupported content message" } satisfies ExtensionResponse);
        }
      })();
      return true;
    });

    window.addEventListener("pagehide", () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    }, { once: true });
  }
});
