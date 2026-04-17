import { InPageCollectorOverlays } from "./InPageCollectorOverlays";
import { InPageCollectorPopup } from "./InPageCollectorPopup";
import { useExtensionSnapshot } from "./controller";
import { useInPageCollectorAppState } from "./useInPageCollectorAppState";

export function InPageCollectorApp() {
  const { snapshot, tabId, sendAndSync } = useExtensionSnapshot(false);
  const app = useInPageCollectorAppState({
    snapshot,
    tabId,
    sendAndSync
  });

  return (
    <>
      <InPageCollectorOverlays app={app} />
      <InPageCollectorPopup app={app} />
    </>
  );
}
