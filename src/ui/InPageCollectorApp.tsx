import type { CSSProperties } from "react";

import { InPageCollectorOverlays } from "./InPageCollectorOverlays";
import { InPageCollectorPopup } from "./InPageCollectorPopup";
import { useExtensionSnapshot } from "./controller";
import { modeThemeStyle } from "./tokens";
import { useInPageCollectorAppState } from "./useInPageCollectorAppState";

export function InPageCollectorApp() {
  const { snapshot, tabId, sendAndSync } = useExtensionSnapshot(false);
  const app = useInPageCollectorAppState({
    snapshot,
    tabId,
    sendAndSync
  });

  return (
    <div data-dlens-mode-theme={app.activeFolderMode} style={modeThemeStyle(app.activeFolderMode) as CSSProperties}>
      <InPageCollectorOverlays app={app} />
      <InPageCollectorPopup app={app} />
    </div>
  );
}
