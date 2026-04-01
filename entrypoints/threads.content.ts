import React from "react";
import ReactDOM from "react-dom/client";
import { defineContentScript } from "wxt/utils/define-content-script";
import { buildTargetDescriptor, findCardCandidate, type CandidateStrength } from "../src/targeting/threads";
import type { ExtensionMessage, ExtensionResponse } from "../src/state/messages";
import { buildSelectionModeMessage, type SelectionModeExitReason } from "../src/state/selection-mode-messages";
import { InPageCollectorApp } from "../src/ui/InPageCollectorApp";

const OVERLAY_ID = "__dlens_extension_v0_overlay__";
const ROOT_ID = "__dlens_extension_v0_root__";
const HOVER_RECT_EVENT = "dlens:hover-rect";
const OPTIMISTIC_SAVE_EVENT = "dlens:optimistic-save";
const OPTIMISTIC_SAVE_FAILED_EVENT = "dlens:optimistic-save-failed";

let selectionMode = false;
let hoverCard: HTMLElement | null = null;
let hoverStrength: CandidateStrength | null = null;
let hoverDescriptor: ReturnType<typeof buildTargetDescriptor> | null = null;
let hoverIntentHandle: number | null = null;
let previousBodyCursor = "";
let previousDocumentCursor = "";

function isControlSurface(node: EventTarget | Node | null): boolean {
  const element = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
  return Boolean(element?.closest('[data-dlens-control="true"]'));
}

function ensureOverlay(): HTMLDivElement {
  let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.position = "fixed";
    overlay.style.pointerEvents = "none";
    overlay.style.border = "1.5px solid rgba(99, 102, 241, 0.5)";
    overlay.style.borderRadius = "16px";
    overlay.style.background = "rgba(99, 102, 241, 0.03)";
    overlay.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.5), 0 8px 24px rgba(99,102,241,0.1)";
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
        50% { opacity: 0.4; }
      }
    `;
    document.head.appendChild(style);
  }
  return root;
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
    return;
  }

  const rect = card.getBoundingClientRect();
  overlay.style.display = "block";
  overlay.style.top = `${rect.top - 3}px`;
  overlay.style.left = `${rect.left - 3}px`;
  overlay.style.width = `${rect.width + 6}px`;
  overlay.style.height = `${rect.height + 6}px`;
  overlay.style.borderColor = strength === "soft" ? "rgba(99, 102, 241, 0.25)" : "rgba(99, 102, 241, 0.55)";
  overlay.style.background = strength === "soft" ? "rgba(99, 102, 241, 0.02)" : "rgba(99, 102, 241, 0.04)";
  overlay.style.boxShadow =
    strength === "soft"
      ? "0 0 0 1px rgba(255,255,255,0.35), 0 6px 16px rgba(99,102,241,0.06)"
      : "0 0 0 1px rgba(255,255,255,0.5), 0 10px 24px rgba(99,102,241,0.12)";
  emitHoverRect(card);
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
  chrome.runtime
    .sendMessage({ type: "selection/hovered", descriptor, strength: hoverStrength } satisfies ExtensionMessage)
    .catch(() => undefined);
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

  if (!card) {
    publishHoveredDescriptor(null);
    return;
  }

  hoverIntentHandle = window.setTimeout(() => {
    const descriptor = buildTargetDescriptor(card, window.location.href);
    hoverDescriptor = descriptor;
    publishHoveredDescriptor(descriptor);
  }, 120);
}

function stopSelectionMode(reason: SelectionModeExitReason = "manual-cancel") {
  selectionMode = false;
  setCollectCursor(false);
  clearHoverIntent();
  setHoverCard(null, null);
  dropKeepAlive();
  const message = buildSelectionModeMessage(false, reason);
  if (!message) {
    return;
  }
  chrome.runtime.sendMessage(message satisfies ExtensionMessage).catch(() => undefined);
}

function startSelectionMode() {
  selectionMode = true;
  setCollectCursor(true);
  ensureKeepAlive();
  const message = buildSelectionModeMessage(true);
  if (message) {
    chrome.runtime.sendMessage(message satisfies ExtensionMessage).catch(() => undefined);
  }
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
  event.preventDefault();
  event.stopPropagation();

  const candidate = findCardCandidate(event.target);
  const card = candidate.root;
  if (!card) {
    return;
  }

  const descriptor = hoverCard === card && hoverDescriptor ? hoverDescriptor : buildTargetDescriptor(card, window.location.href);
  if (!descriptor) {
    return;
  }

  window.dispatchEvent(new CustomEvent(OPTIMISTIC_SAVE_EVENT, { detail: descriptor }));

  void (async () => {
    await chrome.runtime
      .sendMessage({ type: "selection/hovered", descriptor, strength: candidate.strength } satisfies ExtensionMessage)
      .catch(() => undefined);
    const response = await chrome.runtime.sendMessage({ type: "session/save-current-preview" } satisfies ExtensionMessage).catch(() => null);
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

    const root = ensureRoot();
    ReactDOM.createRoot(root).render(React.createElement(InPageCollectorApp));

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      void (async () => {
        switch (message.type) {
          case "selection/start-tab":
            startSelectionMode();
            sendResponse({ ok: true } satisfies ExtensionResponse);
            return;
          case "selection/cancel-tab":
            stopSelectionMode();
            sendResponse({ ok: true } satisfies ExtensionResponse);
            return;
          default:
            sendResponse({ ok: false, error: "unsupported content message" } satisfies ExtensionResponse);
        }
      })();
      return true;
    });
  }
});
