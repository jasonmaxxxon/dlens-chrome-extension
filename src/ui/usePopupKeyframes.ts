import { useLayoutEffect } from "react";

import { tokens } from "./tokens";

export function buildPopupKeyframeCss(): string {
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

      [data-paper-grain="true"]::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.12;
        mix-blend-mode: multiply;
        background-image:
          radial-gradient(circle at 20% 20%, ${tokens.color.idleBorder} 0 0.6px, transparent 0.7px),
          radial-gradient(circle at 80% 40%, ${tokens.color.cardEdge} 0 0.7px, transparent 0.8px),
          radial-gradient(circle at 30% 70%, ${tokens.color.cardEdge} 0 0.5px, transparent 0.6px);
        background-size: 18px 18px, 24px 24px, 20px 20px;
      }

      @keyframes dlens-popup-pulse {
        0%, 100% { opacity: 0.55; transform: scale(0.92); }
        50% { opacity: 1; transform: scale(1); }
      }
      @keyframes dlens-popup-shimmer {
        0% { background-position: 200% 50%; }
        100% { background-position: -200% 50%; }
      }
      @keyframes dlens-popup-indeterminate {
        0% { transform: translateX(-115%); }
        100% { transform: translateX(240%); }
      }
      @keyframes dlens-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes dlens-success-pulse {
        0% { opacity: 0.75; transform: scale(0.9); }
        50% { opacity: 1; transform: scale(1.14); }
        100% { opacity: 0.9; transform: scale(1); }
      }
    `;
}

export function usePopupKeyframes() {
  // useLayoutEffect (not useEffect) so the :root tokens, paper-grain, and
  // keyframes land in the document head before the popup's first paint —
  // otherwise the overlay paints one unstyled frame ("old UI" flash) while a
  // post-paint effect catches up.
  useLayoutEffect(() => {
    if (document.getElementById("__dlens_popup_keyframes__")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "__dlens_popup_keyframes__";
    style.textContent = buildPopupKeyframeCss();
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);
}
