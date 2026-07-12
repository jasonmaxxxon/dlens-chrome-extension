import { useLayoutEffect } from "react";

import { ensureDlensKeyframes } from "./motion";
import { tokens } from "./tokens";

export function buildPopupTokenCss(): string {
  return `
      @import url("https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;600;700&family=Noto+Serif+TC:wght@400;600;700&display=swap");

      :root {
        --dlens-canvas-deep: ${tokens.color.canvas};
        --dlens-paper-raised: ${tokens.color.elevated};
        --dlens-sunken: ${tokens.color.neutralSurface};
        --dlens-line-hair: ${tokens.color.line};
        --dlens-oxide: ${tokens.color.failed};
        --dlens-ink-blue: ${tokens.color.accent};
      }
    `;
}

export function usePopupKeyframes() {
  // useLayoutEffect (not useEffect) so the :root tokens and keyframes land
  // in the document head before the popup's first paint —
  // otherwise the overlay paints one unstyled frame ("old UI" flash) while a
  // post-paint effect catches up.
  useLayoutEffect(() => {
    // Keyframes + reduced-motion safety net come from the shared registry (idempotent;
    // the content script may have injected it already). The popup owns only its fonts
    // and :root token bridge.
    ensureDlensKeyframes(document);
    if (document.getElementById("__dlens_popup_tokens__")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "__dlens_popup_tokens__";
    style.textContent = buildPopupTokenCss();
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);
}
