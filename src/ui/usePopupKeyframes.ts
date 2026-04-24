import { useEffect } from "react";

export function buildPopupKeyframeCss(): string {
  return `
      @import url("https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;600;700&family=Noto+Serif+TC:wght@400;600;700&display=swap");

      :root {
        --dlens-canvas-deep: #f7f4ec;
        --dlens-paper-raised: #fdfbf6;
        --dlens-sunken: #f1ece0;
        --dlens-line-hair: rgba(27,26,23,0.10);
        --dlens-oxide: #7a2030;
        --dlens-ink-blue: #1a2e4f;
      }

      [data-paper-grain="true"]::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.12;
        mix-blend-mode: multiply;
        background-image:
          radial-gradient(circle at 20% 20%, rgba(27,26,23,0.08) 0 0.6px, transparent 0.7px),
          radial-gradient(circle at 80% 40%, rgba(27,26,23,0.05) 0 0.7px, transparent 0.8px),
          radial-gradient(circle at 30% 70%, rgba(27,26,23,0.05) 0 0.5px, transparent 0.6px);
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
    `;
}

export function usePopupKeyframes() {
  useEffect(() => {
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
