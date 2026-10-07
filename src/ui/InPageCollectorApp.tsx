import type { CSSProperties } from "react";

import { InPageCollectorOverlays } from "./InPageCollectorOverlays";
import { InPageCollectorPopup } from "./InPageCollectorPopup";
import { WorkspaceErrorBoundary } from "./WorkspaceErrorBoundary";
import { useExtensionSnapshot } from "./controller";
import { modeThemeStyle } from "./tokens";
import { useInPageCollectorAppState } from "./useInPageCollectorAppState";

export function InPageCollectorApp({ embedded = false }: { embedded?: boolean }) {
  const { snapshot, tabId, sendAndSync } = useExtensionSnapshot(false);
  const app = useInPageCollectorAppState({
    snapshot,
    tabId,
    sendAndSync,
    embedded
  });

  return (
    <div data-dlens-mode-theme={app.activeFolderMode} style={modeThemeStyle(app.activeFolderMode) as CSSProperties}>
      <WorkspaceErrorBoundary>
        {embedded ? null : <InPageCollectorOverlays app={app} />}
        <InPageCollectorPopup app={app} embedded={embedded} />
      </WorkspaceErrorBoundary>
    </div>
  );
}
