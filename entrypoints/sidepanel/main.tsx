import React from "react";
import ReactDOM from "react-dom/client";
import { InPageCollectorApp } from "../../src/ui/InPageCollectorApp";
import { requestWorkspaceOpen } from "../../src/ui/inpage-helpers";
import { DLENS_MOTION_CSS, ensureDlensKeyframes } from "../../src/ui/motion";
import type { ExtensionMessage, ExtensionResponse } from "../../src/state/messages";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Sidepanel root element not found");
}

// Same motion layer the workspace had on Threads pages.
const motionStyle = document.createElement("style");
motionStyle.textContent = DLENS_MOTION_CSS;
document.head.appendChild(motionStyle);
ensureDlensKeyframes(document);

// A card's 開啟工作區 names the workspace: live while this panel is open, or handed over once it has loaded.
chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === "sidepanel/open") requestWorkspaceOpen(message.sessionId, window, message.itemId ? {itemId:message.itemId,lens:message.lens} : undefined);
  return false;
});
void (chrome.runtime.sendMessage({ type: "sidepanel/take-workspace-open" } satisfies ExtensionMessage) as Promise<ExtensionResponse>)
  .then((response) => { if (response.ok && response.workspaceSessionId) requestWorkspaceOpen(response.workspaceSessionId, window, response.readerItemId ? {itemId:response.readerItemId,lens:response.readerLens} : undefined); })
  .catch(() => undefined);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <InPageCollectorApp />
  </React.StrictMode>
);
