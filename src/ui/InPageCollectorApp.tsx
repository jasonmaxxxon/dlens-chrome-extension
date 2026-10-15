import type { CSSProperties } from "react";

import { InPageCollectorPopup } from "./InPageCollectorPopup";
import { WorkspaceErrorBoundary } from "./WorkspaceErrorBoundary";
import { usePopupKeyframes } from "./usePopupKeyframes";
import { useExtensionSnapshot } from "./controller";
import { modeThemeStyle } from "./tokens";
import { useInPageCollectorAppState } from "./useInPageCollectorAppState";

export function InPageCollectorApp() {
  usePopupKeyframes();
  const { snapshot, tabId, sendAndSync } = useExtensionSnapshot(false);
  const app = useInPageCollectorAppState({
    snapshot,
    tabId,
    sendAndSync
  });

  return (
    <div data-dlens-mode-theme={app.activeFolderMode} style={modeThemeStyle(app.activeFolderMode) as CSSProperties}>
      <WorkspaceErrorBoundary>
        <InPageCollectorPopup app={app} />
      </WorkspaceErrorBoundary>
    </div>
  );
}
