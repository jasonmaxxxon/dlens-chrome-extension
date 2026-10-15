import { defineContentScript } from "wxt/utils/define-content-script";
import { createLocationChangeChecker } from "../src/targeting/navigation-reset";
import type { ExtensionMessage, ExtensionResponse } from "../src/state/messages";
import { appendExternalPipelineTraceEntry, isQaTraceEnabled } from "../src/state/pipeline-trace";
import { DLENS_MOTION_CSS, ensureDlensKeyframes } from "../src/ui/motion";
import { dispatchPageLocationChange } from "../src/ui/inpage-helpers";
import { startInlineCollectRuntime } from "../src/content/inline-collect-runtime";
import { DLENS_INLINE_COLLECT_CSS } from "../src/content/inline-collect-wheel-styles";
import { DLENS_INLINE_CARD_CSS } from "../src/content/inline-collect-card";

const ROOT_ID = "__dlens_extension_v0_root__";
const QA_TRACE_VERSION = "full-live-trace-v2";
let inlineCollect: ReturnType<typeof startInlineCollectRuntime> | null = null;
let removeSpaNavigationReset: (() => void) | null = null;

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
  // Inject the single keyframe registry + reduced-motion safety net once (idempotent,
  // shared guard id across every mount context).
  ensureDlensKeyframes(document);
  if (!document.getElementById("__dlens_inline_collect_style__")) {
    const style = document.createElement("style");
    style.id = "__dlens_inline_collect_style__";
    style.textContent = DLENS_INLINE_COLLECT_CSS + DLENS_INLINE_CARD_CSS;
    document.head.appendChild(style);
  }
  return root;
}


function installSpaNavigationReset() {
  const checkLocationChange = createLocationChangeChecker(window.location.href);
  const handlePotentialNavigation = () => {
    checkLocationChange(window.location.href, (href) => {
      inlineCollect?.reset();
      dispatchPageLocationChange(href);
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


export default defineContentScript({
  matches: ["*://*.threads.net/*", "*://*.threads.com/*"],
  main() {
    const root = ensureRoot();
    // Threads pages carry only the collect button and its card; the workspace lives in Chrome's side panel.
    inlineCollect?.destroy();
    inlineCollect = startInlineCollectRuntime(root);
    removeSpaNavigationReset?.();
    removeSpaNavigationReset = installSpaNavigationReset();
    if (isQaTraceEnabled()) void chrome.runtime.sendMessage({ type: "pipeline-trace/enable-background" } satisfies ExtensionMessage).catch(() => undefined);
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === "pipeline-trace/background-event") {
        appendExternalPipelineTraceEntry(message.event);
        sendResponse({ ok: true } satisfies ExtensionResponse);
      }
      // Retired selection-tab messages intentionally have no click interception.
      return false;
    });
    window.addEventListener("pagehide", () => {
      inlineCollect?.destroy();
      removeSpaNavigationReset?.();
    }, { once: true });
  }
});
