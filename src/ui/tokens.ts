/* DLens design values: the panel system replaces retired side-panel styles.
 * Threads controls retain their shared palette, geometry and motion values. */

export const tokens = {
  /* Side-panel replacement system. Shared Threads controls retain their existing tokens. */
  panel: {
    bg: "#F1F3F6", surface: "#FFFFFF", surfaceSubtle: "#F4F6F9", surfaceSunken: "#E9EDF2",
    border: "#E3E7EC", borderStrong: "#CBD2DB",
    ink: "#10243B", ink2: "#3C4F66", ink3: "#66778C", ink4: "#9AA7B6",
    accent: "#2952CC", accentHover: "#2246B3", accentSoft: "#E6EDF6", accentInk: "#1E3E9E",
    success: "#17794F", successSoft: "#E1F2E9", warning: "#97580A", warningSoft: "#FBEFD9",
    danger: "#B3261E", dangerSoft: "#FCE9E7", running: "#2952CC", runningSoft: "#E6EDF6",
    focusRing: "0 0 0 2px #FFFFFF, 0 0 0 4px #2952CC",
    /* Audience-group colours for share bars, dots and quote bars; `dataRest` is the unassigned remainder. */
    data: ["#E0533C", "#0E8A8C", "#D79A1E", "#7C8BA1"], dataRest: "#DDE3EA",
    iconStrokeWidth: 1.75,
    reader: { sourceLines: 6, replyClampChars: 180, replyClampLines: 6, refsShown: 3, clusterBar: 3, lensHeight: 44, shareHeight: 8, skeletonWidths: ["92%", "78%", "85%", "60%"], skeletonHeight: 10 },
    list: {
      skeletonCount: 4, skeletonWidths: ["40%", "90%", "60%"], skeletonHeights: [12, 10, 10], emptyTop: 48, emptyIcon: 24,
      card: { padding: 12, columnGap: 12, contentGap: 4, titleLines: 2, metaLine: 17, titleLine: 40, summaryLine: 19, statusLine: 19 }
    },
    /* Wheel geometry shares the existing panel palette, typography and spacing. */
    wheel: {
      width: 368, height: 296, cx: 184, cy: 148, r0: 55, rmin: 80, rmax: 130, pad: 2.2,
      coverageRadius: 142, coverageStroke: 2.5, sectorStroke: 5, dotRadius: 5.5, dotStroke: 1.5,
      shift: 9, dimOpacity: .26, fullOpacity: 1, hubRadius: 49, hubValueY: 146, hubLabelY: 164, hubMetaY: 181,
      observationColumns: "46px minmax(0, 1fr)", sideColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      barHeight: 6, barMin: 3, firstTopic: 4, firstSide: 2, firstRaw: 10, clampLines: 4, menuWidth: 200,
      hairline: 1, leadBar: 3, observationLines: 2
    },
    visuallyHidden: { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 },
    chipCountOn: "rgba(255,255,255,.7)",
    scrollMask: "linear-gradient(to right, #000 calc(100% - 24px), transparent)",
    type: {
      title: { fontSize: 17, lineHeight: "24px", fontWeight: 600 },
      heading: { fontSize: 15, lineHeight: "22px", fontWeight: 600 },
      cardTitle: { fontSize: 14, lineHeight: "20px", fontWeight: 600 },
      body: { fontSize: 14, lineHeight: "22px", fontWeight: 400 },
      bodySm: { fontSize: 13, lineHeight: "19px", fontWeight: 400 },
      meta: { fontSize: 12, lineHeight: "17px", fontWeight: 500 },
      micro: { fontSize: 11, lineHeight: "15px", fontWeight: 500 }
    },
    space: { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 },
    radius: { xs: 6, sm: 8, md: 12, lg: 16, pill: 999 },
    shadow: {
      card: "0 1px 2px rgba(16,36,59,.05), 0 0 0 1px rgba(16,36,59,.05)",
      raised: "0 2px 6px rgba(16,36,59,.07), 0 0 0 1px rgba(16,36,59,.07)",
      popover: "0 12px 32px -8px rgba(16,36,59,.22), 0 0 0 1px rgba(16,36,59,.08)"
    },
    size: {
      menu: 280, header: 44, banner: 52, chip: 28, button: 32, buttonSm: 28, input: 36,
      thumb: 40, avatar: 24, replyAvatar: 20, statusDot: 8, modeDot: 6, icon: 16, chipIcon: 14
    },
    motion: {
      fast: "120ms", base: "180ms", slow: "240ms",
      standard: "cubic-bezier(.2,.8,.2,1)", exit: "cubic-bezier(.4,0,1,1)", press: .98, skeletonMs: 1200
    }
  },

  color: {
    /* text hierarchy — calm editorial workspace */
    ink: "#1b1a17",
    subInk: "#3d3b35",

    /* borders & dividers */
    line: "rgba(27,26,23,0.10)",
    lineHover: "rgba(27,26,23,0.28)",

    /* shared workspace surfaces — glass-white family */
    canvas: "#f2f7f3",
    surface: "#f8fbf8",
    elevated: "#ffffff",

    /* inverse foregrounds & overlays — only for filled accent panels */
    inverse: "#fff",

    /* legacy alias */

    /* accent — indigo core (Post A) */
    accent: "#1a2e4f",
    accentMid: "#2b4a80",
    accentSoft: "rgba(26,46,79,0.09)",
    accentGlow: "rgba(26,46,79,0.18)",

    /* secondary accent — teal (topic mode) */
    cyan: "#3f5a3b",
    cyanSoft: "rgba(63,90,59,0.10)",
    cyanGlow: "rgba(63,90,59,0.16)",

    /* signal glow marks the active PR attention action */
    signalGlow: "rgba(67,214,200,0.36)",

    /* technique accents */
    techniqueRose: "#7a2030",
    failed: "#7a2030",
    runningSoft: "rgba(26,46,79,0.08)",
    runningBorder: "rgba(26,46,79,0.25)",

    /* idle / neutral */

    /* neutral surface — chips, inactive tabs */
    neutralSurface: "#edf2ee",
  },

  radius: {
    button: 12,   /* badge/button pill — not the round 999 used for status dots */
    round: 999,
  },

  /* ─── Elevation ───
   * Layered shadows give a tactile "floating" read instead of one flat blur.
   * Each tier pairs a 1px lit-from-above inset highlight with a tight contact
   * shadow and a wide low-opacity ambient shadow.
   *   card  → tier 1, inner panels resting on a surface
   *   shell → tier 2, workspace surfaces
   *   raised → top tier, active / focused cards
   */
  shadow: {
    cardLiftHover: "0 18px 40px rgba(27,26,23,0.16), 0 3px 10px rgba(27,26,23,0.07)",
    accentButton: "0 8px 18px rgba(26,46,79,0.16)",
  },

  /* Accepted collect-wheel gesture, geometry and material from the owner's v9 mockup.
   * The inner radius is intentionally rounded by buildWheelGeometry, as in v9. */
  collectWheel: {
    hold: 180, radius: 126, flickPx: 12, innerRatio: 0.39, deadRatio: 0.72,
    jitterPx: 4, canvasPadding: 22, edgePadding: 26, stickyMargin: 30,
    topicRing: { innerOffset: 12, outerOffset: 56, hitInnerOffset: 6, hitOuterOffset: 74, gap: 7, smallSpan: 40, largeSpan: 36, labelInset: 18, labelHeight: 30, stroke: 4, tint: 16, labelFont: 11.5, countFont: 9.5, hintWidth: 230, hintTop: -30, hintPadding: "6px 10px", hintRadius: 9 },
    sectorStroke: 6, sectorGap: 11, sectorInset: 3, labelOffset: 1,
    sectorShift: 6, sectorPickedShift: 10, glassMargin: 8, centerInset: 4,
    buttonSize: 36, buttonIconSize: 20, ringMaskOuter: 2.5, ringMaskInner: 2,
    /* Crawl state on the button: a turning arc while crawling, a dim ring while queued, a dot when a result waits unseen. */
    progArc: 24, progTrackTint: 14, progOpacity: 0.9, queuedOpacity: 0.5, queuedTint: 22,
    dotSize: 8, dotInset: 4, dotRing: 2, dotRingColor: "#ffffff",
    labelWidth: 78, labelIconSize: 18, labelFont: 12.5, labelWeight: 650,
    destinationFont: 10, centerTitleFont: 12, centerSubFont: 9.5,
    chipFont: 11.5, chipPadding: "6px 10px", chipMargin: 2, actionGap: 2,
    glass: "rgba(255,255,255,.36)", glassBorder: "rgba(255,255,255,.72)",
    glassFilter: "blur(16px) saturate(1.5)",
    glassShadow: "0 26px 60px -18px rgba(0,0,0,.36), 0 2px 6px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.8)",
    centerShadow: "0 3px 10px rgba(0,0,0,.13), 0 0 0 1px rgba(27,26,23,.06)",
    tintBase: "rgba(255,255,255,.92)", tintPercent: 14,
    selectedDetail: "rgba(255,255,255,.88)", pointerColor: "#9a978c",
    pointerInset: 5, pointerHalfAngle: 26, pointerMask: 3,
    buttonIcon: "#424242", buttonHover: "rgba(0,0,0,.05)", softInk: "#8a877c",
    chipTintPercent: 10, chipHoverPercent: 16,
    toastBottom: 26, toastPadding: "8px 8px 8px 16px", toastFont: 13,
    toastForeground: "#f4f2ec", toastAccent: "#cfe3cb", toastAction: "#cfd8cb",
    toastShadow: "0 12px 30px -8px rgba(0,0,0,.4)", toastHover: "rgba(255,255,255,.1)",
    toastMargin: 24, toastGap: 4, toastWeight: 500, toastLineHeight: 1.3,
    focusWidth: 2, focusOffset: 2, burstInset: 2, burstBorder: 2,
    pillRadius: 999, wheelLayer: 50, toastLayer: 60, glassBorderWidth: 1,
    labelGap: 1, labelTracking: ".01em", destinationLineHeight: 1.2,
    centerPadding: 6, centerTitleWeight: 700, centerTitleLineHeight: 1.25,
    centerSubLineHeight: 1.35, centerSubMargin: 3, chipWeight: 600, maskBlack: "#000",
    font: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif"
  },

  /* Shared topic-picker values still consumed by the Threads wheel and card. */
  discourse: { gap: 8, radius: 14, chipPad: "6px 12px", pickPad: "4px 10px",
    chipBg: "rgba(27,26,23,.05)", soft: "#6c695e", faint: "#a19e93", smallFont: 12,
  },

  /* The card under a saved post, from the owner's v9 mockup: status line, four entries, one answer at a time. */
  collectCard: {
    lineHeightPx: 36, lineGap: 7, linePadding: "0 10px", lineButtonPadding: "3px 4px", lineStatusMax: "65%", arcSize: 12, arcBorder: 1.5,
    wash: "#fbfbfa", hair: "rgba(27,26,23,.08)", sub: "#4a4840", soft: "#8a877c", fail: "#a8462e",
    hover: "rgba(0,0,0,.05)", track: "rgba(27,26,23,.06)", radius: 14, padding: "14px 16px", margin: "10px 0 6px",
    font: 13, lineHeight: 1.55, headFont: 12, headline: 16, entryLabel: 14, entryFinding: 12.5, quoteFont: 13, citeFont: 11.5,
    entryPadding: "10px 10px 12px", entryGap: 4, answerTop: 16, barHeight: 8, barGap: 3, dot: 7, iconSize: 15,
    btnFont: 12, btnRadius: 8, btnPadding: "6px 11px", btnBorder: "rgba(27,26,23,.18)",
    entryColors: { stance: "#35628a", method: "#4d7a3a", split: "#a24a2a", top: "#b0453a", op: "#4a5d6e", ask: "#7b4a8a" },
    sideColors: ["#3f8f86", "#a06a17"],
    clusterColors: ["#5a4a72", "#3f8f86", "#a06a17", "#7a7a8a"],
    askColors: { author: "#3f5a3b", other: "#234f7a", none: "#a06a17" },
    skeleton: ["#eeede9", "#f7f6f3"], skeletonHeight: 9,
    /* 展開證據 reply rows in Threads' shape: no avatar URL is stored, so a handle-tinted initial stands in. */
    avatar: 28, threadLine: "rgba(27,26,23,.14)",
    /* Spam / off-topic clusters stay visible but grey, after every real reaction. */
    noise: "#b9b6ad",

  },

  motion: {
    collectWheel: {
      topicRestMs: 250, topicStaggerMs: 32, topicLabelDelayMs: 50, topicScale: 0.9,
      spring: "cubic-bezier(.3,1.32,.5,1)", flyEasing: "cubic-bezier(.55,0,.8,.25)",
      openMs: 240, opacityMs: 110, sectorMs: 230, sectorOpacityMs: 140,
      staggerMs: 14, settledSectors: 8, pulseMs: 90, landAfterPulseMs: 210,
      closeMs: 130, closeCleanupMs: 140, flyCleanupMs: 250,
      glassOpacityMs: 120, buttonTransformMs: 140, buttonFillMs: 160,
      burstMs: 460, popMs: 420, chipMs: 280, spinMs: 1200,
      toastTransformMs: 260, toastOpacityMs: 160, toastActionMs: 3600, toastMessageMs: 2400, toastLeaveMs: 1800,
      reducedOpacityMs: 90, reducedToastMs: 120,
      openScale: 0.78, closeScale: 0.88, flyScale: 0.14, sectorScale: 0.7,
      labelScale: 0.6, pickedScale: 1.06, chargingScale: 0.86,
      burstStartScale: 0.6, burstEndScale: 2.1, burstOpacity: 0.75,
      popDipAt: 35, popPeakAt: 70, popDipScale: 0.8, popPeakScale: 1.22,
      chipOffset: 8, chipScale: 0.9, toastOffset: 20, progFadeMs: 300, dotMs: 240
    },
    /* The card under a post: enters once, results fade up once, the live dot breathes, the peek shimmers. */
    /* Switching a reading angle: the ink line springs to the tab, the answer rises with a small overshoot. */
    lens: { inkMs: 460, swapMs: 420, risePx: 8, overshootPx: -2, inkFrom: 0.3, inkOver: 1.06 },
    collection: { riseMs: 420, risePx: 8, staggerMs: 28, staggerCap: 10, foldMs: 240, glideMs: 420, fadeMs: 280, clockMs: 60000 },
    collectCard: { returnMs: 1200, returnTint: 16, enterMs: 260, enterOffset: 4, freshMs: 280, freshOffset: 3, breatheMs: 1100, breatheSpread: 4, breatheTint: 14, shimmerMs: 1100 },
    /* Primitive durations — pair with easings to build named transitions. */
    duration: {
      instant: "80ms",
      fast: "140ms",
      base: "180ms",
      slow: "280ms",
      slower: "420ms"
    },
    /* Primitive easings — `standard` is Material's canonical curve.
     * `spring` / `springSoft` overshoot past 1 for a tactile, springy settle. */
    easing: {
      standard: "cubic-bezier(0.4, 0, 0.2, 1)",
      entrance: "cubic-bezier(0.16, 1, 0.3, 1)",
      exit: "cubic-bezier(0.4, 0, 1, 1)",
      spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      springSoft: "cubic-bezier(0.22, 1.12, 0.36, 1)",
      softPop: "cubic-bezier(0.25, 0.46, 0.45, 0.94)"
    },
    transform: {
      cardRest: "translateY(0)",
      cardHover: "translateY(-4px) scale(1.015)",
      cardPress: "translateY(1px) scale(0.994)",
      rowRest: "translateY(0)",
      rowHover: "translateY(-4px)",
      rowPress: "translateY(1px) scale(0.995)",
    },
    /* Product-wide arrival grammar (approved 2026-07-14). Presence is
     * one-shot and opt-in through data-dlens-presence so dense utility rows
     * stay quiet unless a view explicitly assigns them to this hierarchy. */
    presence: {
      cardOpacityFrom: 0.28,
      cardRisePx: 10,
      cardDurationMs: 240,
      cardDelayMs: 70,
      cardStaggerMs: 60,
      rowOpacityFrom: 0.92,
      rowRisePx: 4,
      rowDurationMs: 180,
      staggerMs: 35,
      staggerCap: 6,
      staggerResetMs: 120,
      threshold: 0.08,
      rootMargin: "1000px 0px -96px 0px",
      leadSoftPop: {
        opacityFrom: 0.68,
        risePx: 10,
        overshootPx: -1.5,
        scaleFrom: 0.985,
        scaleOvershoot: 1.003,
        durationMs: 240
      }
    },
    bottomRebound: {
      amplitudePx: 3,
      durationMs: 240,
      hysteresisPx: 30,
      wheelGain: 0.06,
      settleDelayMs: 140,
      cooldownMs: 400,
      bottomTolerancePx: 1
    },
    interactiveTransition: "background-color 180ms cubic-bezier(0.4, 0, 0.2, 1), border-color 180ms cubic-bezier(0.4, 0, 0.2, 1), color 180ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 180ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1), transform 180ms cubic-bezier(0.4, 0, 0.2, 1)",
    interactiveTransitionFast: "background-color 140ms cubic-bezier(0.4, 0, 0.2, 1), border-color 140ms cubic-bezier(0.4, 0, 0.2, 1), color 140ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 140ms cubic-bezier(0.4, 0, 0.2, 1), opacity 140ms cubic-bezier(0.4, 0, 0.2, 1), transform 140ms cubic-bezier(0.4, 0, 0.2, 1)",
    /* Semantic presets — use these for new components.
     * `buttonPress` springs the transform; `cardLift` settles with a soft overshoot. */
    preset: {
      buttonPress: "transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 140ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 160ms cubic-bezier(0.4, 0, 0.2, 1), border-color 140ms cubic-bezier(0.4, 0, 0.2, 1), filter 140ms cubic-bezier(0.4, 0, 0.2, 1)",
      cardLift: "transform 200ms cubic-bezier(0.22, 1.12, 0.36, 1), box-shadow 200ms cubic-bezier(0.22, 1.12, 0.36, 1), border-color 180ms cubic-bezier(0.4, 0, 0.2, 1), background-color 180ms cubic-bezier(0.4, 0, 0.2, 1)",
    },
    /* Loading + one-shot feedback: shorthands for keyframes injected at runtime
     * from the single DLENS_KEYFRAMES_CSS registry (src/ui/motion.ts). */
    keyframes: {
      pulse: "dlens-popup-pulse 1600ms cubic-bezier(0.4, 0, 0.6, 1) infinite",
      indeterminate: "dlens-popup-indeterminate 1100ms cubic-bezier(0.4, 0, 0.2, 1) infinite",
      successPop: "dlens-success-pop 900ms cubic-bezier(0.4, 0, 0.6, 1)"
    }
  },

  font: {
    sans: "'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
  }
} as const;

export const modeThemes = {
  archive: {
    accent: tokens.color.accent,
    accentMid: tokens.color.accentMid,
    accentSoft: tokens.color.accentSoft,
    accentGlow: tokens.color.accentGlow,
    accentButtonShadow: tokens.shadow.accentButton,
    hoverBorderStrong: "rgba(26,46,79,0.55)",
    hoverBorderSoft: "rgba(26,46,79,0.26)",
    hoverSurfaceStrong: "rgba(26,46,79,0.04)",
    hoverSurfaceSoft: "rgba(26,46,79,0.02)",
    hoverShadowStrong: "rgba(26,46,79,0.13)",
    hoverShadowSoft: "rgba(26,46,79,0.07)"
  },
  topic: {
    accent: tokens.color.cyan,
    accentMid: "#527648",
    accentSoft: tokens.color.cyanSoft,
    accentGlow: tokens.color.cyanGlow,
    accentButtonShadow: "0 8px 18px rgba(63,90,59,0.18)",
    hoverBorderStrong: "rgba(63,90,59,0.58)",
    hoverBorderSoft: "rgba(63,90,59,0.28)",
    hoverSurfaceStrong: "rgba(63,90,59,0.05)",
    hoverSurfaceSoft: "rgba(63,90,59,0.025)",
    hoverShadowStrong: "rgba(63,90,59,0.15)",
    hoverShadowSoft: "rgba(63,90,59,0.08)"
  },
  product: {
    accent: "#234f7a",
    accentMid: "#2f6a96",
    accentSoft: "rgba(35,79,122,0.10)",
    accentGlow: "rgba(35,79,122,0.18)",
    accentButtonShadow: "0 8px 18px rgba(35,79,122,0.16)",
    hoverBorderStrong: "rgba(35,79,122,0.58)",
    hoverBorderSoft: "rgba(35,79,122,0.28)",
    hoverSurfaceStrong: "rgba(35,79,122,0.045)",
    hoverSurfaceSoft: "rgba(35,79,122,0.025)",
    hoverShadowStrong: "rgba(35,79,122,0.14)",
    hoverShadowSoft: "rgba(35,79,122,0.07)"
  },
  "pr-evidence": {
    accent: tokens.color.techniqueRose,
    accentMid: "#9b3a49",
    accentSoft: "rgba(122,32,48,0.10)",
    accentGlow: "rgba(122,32,48,0.16)",
    accentButtonShadow: "0 8px 18px rgba(122,32,48,0.14)",
    hoverBorderStrong: "rgba(122,32,48,0.56)",
    hoverBorderSoft: "rgba(122,32,48,0.26)",
    hoverSurfaceStrong: "rgba(122,32,48,0.045)",
    hoverSurfaceSoft: "rgba(122,32,48,0.025)",
    hoverShadowStrong: "rgba(122,32,48,0.13)",
    hoverShadowSoft: "rgba(122,32,48,0.07)"
  }
} as const;

export type ModeThemeName = keyof typeof modeThemes;

export function getModeTheme(mode: string | null | undefined) {
  return mode === "topic" || mode === "product" || mode === "pr-evidence" ? modeThemes[mode] : modeThemes.archive;
}

export function modeThemeStyle(mode: string | null | undefined) {
  const theme = getModeTheme(mode);
  return {
    "--dlens-mode-accent": theme.accent,
    "--dlens-mode-accent-mid": theme.accentMid,
    "--dlens-mode-accent-soft": theme.accentSoft,
    "--dlens-mode-accent-glow": theme.accentGlow,
    "--dlens-mode-accent-button-shadow": theme.accentButtonShadow,
    "--dlens-mode-hover-border-strong": theme.hoverBorderStrong,
    "--dlens-mode-hover-border-soft": theme.hoverBorderSoft,
    "--dlens-mode-hover-surface-strong": theme.hoverSurfaceStrong,
    "--dlens-mode-hover-surface-soft": theme.hoverSurfaceSoft,
    "--dlens-mode-hover-shadow-strong": theme.hoverShadowStrong,
    "--dlens-mode-hover-shadow-soft": theme.hoverShadowSoft
  } as const;
}

/** Quiet type tiles share one deterministic tint per normalized author handle. */
export function collectionTileTint(handle: string): { background: string; color: string } {
  const hue = [...(handle.trim().replace(/^@/, "").toLowerCase() || "?")].reduce((h, ch) => (h * 31 + ch.codePointAt(0)!) % 360, 7);
  return { background: `hsl(${hue} 38% 93%)`, color: `hsl(${hue} 32% 32%)` };
}
