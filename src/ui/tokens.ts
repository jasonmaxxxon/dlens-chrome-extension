/* ─── DLens Glass Workspace Theme ───
 *
 * Active design contract (Glass unification, 2026-07-10):
 *   全部 surface 收斂到 `material.workspaceGlass` 的白綠玻璃地面；
 *   editorial 的暖墨（ink）與 serif 標題聲音保留，暖紙 cream 面全面退役。
 *
 * English shorthand:
 *   Editorial voice on a shared glass workspace.
 *
 * `tokens.ts` is the single active design source. The surface family below is
 * derived from WORKSPACE_GLASS's canvas stops so opaque cards and the glass
 * shell read as one material. macOS utility patterns extend existing token
 * slots such as shadow.popup, shadow.shell, motion.preset.*, and effect.*;
 * they do not introduce a parallel palette, font stack, or scale.
 * Some callers still use legacy alias names such as glass*.
 */

const WORKSPACE_GLASS = {
  canvas: "linear-gradient(172deg, #ffffff 0%, #f8fbf8 55%, #f2f7f3 100%)",
  panel: "linear-gradient(168deg, rgba(255,255,255,0.84), rgba(255,255,255,0.50))",
  panelStrong: "rgba(255,255,255,0.90)",
  edge: "rgba(255,255,255,0.82)",
  auraTeal: "rgba(67,214,200,0.30)",
  auraAmber: "rgba(233,181,88,0.22)",
  auraViolet: "rgba(111,90,167,0.16)",
  blur: "blur(18px) saturate(1.35)",
  heroShadow: "0 1px 2px rgba(31,38,33,0.03), 0 30px 70px -34px rgba(31,38,33,0.30), inset 0 1px 0 rgba(255,255,255,0.95)",
  panelShadow: "0 1px 2px rgba(31,38,33,0.03), 0 18px 44px -26px rgba(31,38,33,0.24), inset 0 1px 0 rgba(255,255,255,0.92)"
} as const;

export const tokens = {
  deepReading: {
    accent: "#7b4a8a", wash: "rgba(123,74,138,.08)",
    status: { agree: "#3f5a3b", open: "#a06a17", heated: "#a8462e" },
    skeletonWidths: ["92%", "78%", "85%", "60%"], skeletonHeight: 10, skeletonBackground: "linear-gradient(90deg, rgba(123,74,138,.04), rgba(123,74,138,.12), rgba(123,74,138,.04))", skeletonBackgroundSize: "200% 100%"
  },
  reader: { headline: 16, body: 14, secondary: 12.5, meta: 11.5, sourceLines: 3, lineHeight: 1.6 },
  collection: {
    modeTileSize: 34,
    bodySize: 13.5, metaSize: 11.5, lineHeight: 1.5, tileSize: 21,
    headerHeight: 48, logoSize: 21, tabWidth: 54, tabGap: 18, searchHeight: 36,
    thumbnailRadius: 10, previewSize: 26, previewOverlap: 7, previewBorder: 2,
    rowPadding: 10, rowLift: -2, cardPress: .985, indicatorHeight: 2, segmentPadding: 2,
    segmentHeight: 28, segmentRadius: 8, knobRadius: 6, dotSize: 5,
    paper: "#fbfbf9", header: "rgba(251,251,249,.78)", wash: "rgba(27,26,23,.035)",
    hover: "rgba(27,26,23,.04)", hairline: "rgba(27,26,23,.08)",
    mist: "radial-gradient(closest-side, rgba(63,90,59,.09), transparent)",
    headerBlur: "blur(14px) saturate(1.2)",
    mistWidth: 560, mistHeight: 380, mistTop: -200, mistLeft: -60,
    grainOpacity: .5,
    grain: `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.1 0 0 0 0 0.1 0 0 0 0 0.09 0 0 0 .07 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")}")`,
    focusShadow: "0 0 0 1px rgba(27,26,23,.08), 0 4px 14px rgba(27,26,23,.06)",
    knobShadow: "0 1px 2px rgba(27,26,23,.10)"
  },
  material: {
    workspaceGlass: WORKSPACE_GLASS
  },

  topicAccent: {
    primary: "#3f5a3b",
    primaryDeep: "#324a30",
    primaryGlow: "rgba(63,90,59,0.16)",
    tintSage: "#e6ede2",
    tintSageHi: "#dde7d6",
    warm: "#a06a17",
    tintAmber: "#fbe9c8",
    burnt: "#b85a18",
    fail: "#a8462e",
    failBg: "#fbe2d4"
  },

  color: {
    /* text hierarchy — calm editorial workspace */
    ink: "#1b1a17",
    subInk: "#3d3b35",
    softInk: "#6c695e",

    /* borders & dividers */
    line: "rgba(27,26,23,0.10)",
    lineStrong: "rgba(27,26,23,0.18)",
    lineHover: "rgba(27,26,23,0.28)",
    /* near-invisible edge for elevated cards — definition comes from shadow */
    cardEdge: "rgba(27,26,23,0.055)",
    inkWash: "rgba(27,26,23,0.025)",
    inkWashStrong: "rgba(27,26,23,0.06)",

    /* shared workspace surfaces — glass-white family, derived from
     * WORKSPACE_GLASS.canvas stops (#ffffff → #f8fbf8 → #f2f7f3) */
    canvas: "#f2f7f3",
    surface: "#f8fbf8",
    elevated: "#ffffff",
    shellSurface: "rgba(255,255,255,0.96)",
    contentSurface: "#f8fbf8",
    focusedSurface: "#ffffff",
    railSurface: "rgba(248,251,248,0.94)",
    contextSurface: "rgba(242,247,243,0.72)",
    utilitySurface: "rgba(255,255,255,0.96)",

    /* inverse foregrounds & overlays — only for filled accent panels */
    inverse: "#fff",
    inverseStrong: "rgba(255,255,255,0.92)",
    inverseSoft: "rgba(255,255,255,0.76)",
    inverseMuted: "rgba(255,255,255,0.62)",
    inverseTrack: "rgba(255,255,255,0.24)",
    inverseShimmer: "rgba(255,255,255,0.5)",
    inverseWash: "rgba(255,255,255,0.08)",
    inverseBorder: "rgba(255,255,255,0.44)",
    inversePanel: "rgba(255,255,255,0.20)",

    /* legacy alias */
    dark: "#1b1a17",

    /* accent — indigo core (Post A) */
    accent: "#1a2e4f",
    accentMid: "#2b4a80",
    accentSoft: "rgba(26,46,79,0.09)",
    accentGlow: "rgba(26,46,79,0.18)",

    /* secondary accent — teal (topic mode) */
    cyan: "#3f5a3b",
    cyanSoft: "rgba(63,90,59,0.10)",
    cyanGlow: "rgba(63,90,59,0.16)",

    /* signal — electric-cyan evidence highlight, scoped to the Audit atlas surface */
    signal: "#43d6c8",
    signalDeep: "#118c80",
    signalGlow: "rgba(67,214,200,0.36)",
    signalFaint: "rgba(67,214,200,0.12)",

    /* Reading Beam spectrum — the nine light sources of the generating border
     * beam, ported 1:1 from the accepted mockup
     * docs/mockups/2026-07-23-product-action-deep-reading-orb-beam.html.
     * These are LIGHT, not surface colour: they only ever appear inside the
     * beam's conic mask at <=26% opacity, never as text, fill, or edge. They
     * are not a second palette and nothing outside the beam may use them. */
    beamRose: "rgb(255,50,100)",
    beamAzure: "rgb(40,140,255)",
    beamJade: "rgb(50,200,80)",
    beamTeal: "rgb(30,185,170)",
    beamIndigo: "rgb(100,70,255)",
    beamAmber: "rgb(255,120,40)",
    beamMagenta: "rgb(240,50,180)",
    beamViolet: "rgb(180,40,240)",
    beamShade: "rgba(0,0,0,0.14)",

    /* compatibility aliases for the shared workspace glass material */
    atlasPaper: WORKSPACE_GLASS.panel,
    atlasPaperStrong: WORKSPACE_GLASS.panelStrong,
    atlasEdge: WORKSPACE_GLASS.edge,
    /* Atlas aliases keep existing feature code on the same shared canvas and aura values. */
    atlasCanvas: WORKSPACE_GLASS.canvas,
    atlasAuraTeal: WORKSPACE_GLASS.auraTeal,
    atlasAuraAmber: WORKSPACE_GLASS.auraAmber,
    atlasAuraViolet: WORKSPACE_GLASS.auraViolet,
    /* amber-tinted glass for the reliability / absence strip on the atlas canvas */
    atlasWarnPaper: "linear-gradient(165deg, rgba(255,246,224,0.85), rgba(255,246,224,0.48))",

    /* teal — named alias for design system alignment */
    teal: "#3f5a3b",
    tealMid: "#527648",
    tealSoft: "rgba(63,90,59,0.10)",
    tealGlow: "rgba(63,90,59,0.16)",

    /* product accent — steel blue (restored 2026-07-14) */
    product: "#234f7a",
    productMid: "#2f6a96",
    productSoft: "rgba(35,79,122,0.10)",
    productGlow: "rgba(35,79,122,0.18)",
    /* product field canvas — atlasCanvas grammar with a steel-blue lean, for the
     * Product action stage and saved-signals inbox aura fields */
    productCanvas: "linear-gradient(172deg, #ffffff 0%, #f7fafc 55%, #eff4f8 100%)",
    auraProductBlue: "rgba(35,79,122,0.20)",

    /* technique accents */
    techniqueRose: "#7a2030",
    techniqueAmber: "#a16a17",
    techniqueTeal: "#3f5a3b",
    techniqueBlue: "#1a2e4f",
    techniqueViolet: "#5e4b73",
    techniqueVioletSoft: "rgba(94,75,115,0.10)",

    /* status */
    success: "#3f5a3b",
    successSoft: "rgba(63,90,59,0.10)",
    successBorder: "rgba(63,90,59,0.28)",
    successFlashStrong: "rgba(63,90,59,0.26)",
    successFlashSoft: "rgba(63,90,59,0.18)",
    queued: "#a16a17",
    queuedDeep: "#7c4f10",
    queuedWash: "rgba(161,106,23,0.04)",
    queuedSoft: "rgba(161,106,23,0.11)",
    queuedBorder: "rgba(161,106,23,0.24)",
    queuedBorderStrong: "rgba(161,106,23,0.30)",
    failed: "#7a2030",
    failedWash: "rgba(122,32,48,0.04)",
    failedSoft: "rgba(122,32,48,0.10)",
    failedBorder: "rgba(122,32,48,0.24)",
    failedBorderStrong: "rgba(122,32,48,0.30)",
    running: "#1a2e4f",
    runningSoft: "rgba(26,46,79,0.08)",
    runningBorder: "rgba(26,46,79,0.25)",

    /* shell aliases kept for existing callers */
    glassBg: "#f8fbf8",
    glassBorder: "rgba(27,26,23,0.10)",

    /* idle / neutral */
    idleBg: "rgba(248,251,248,0.84)",
    idleBorder: "rgba(27,26,23,0.08)",

    /* neutral surface — chips, inactive tabs */
    neutralSurface: "#edf2ee",
    neutralSurfaceSoft: "rgba(237,242,238,0.78)",
    neutralText: "#6c695e",

    /* disabled */
    disabledPrimary: "rgba(139,150,141,0.55)",
    disabledSecondary: "rgba(223,231,225,0.60)"
  },

  radius: {
    xs: 8,
    lg: 12,
    card: 12,
    cardLg: 20,
    button: 12,
    chip: 14,
    xl: 24,
    pill: 8,   /* badge/button pill — not the round 999 used for status dots */
    round: 999,
    sm: 4
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
    card: "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(27,26,23,0.04), 0 4px 10px -4px rgba(27,26,23,0.06)",
    topicCard: "0 1px 2px rgba(27,26,23,0.04), 0 4px 14px -4px rgba(27,26,23,0.07)",
    topicCardHover: "0 1px 2px rgba(27,26,23,0.05), 0 8px 22px -6px rgba(27,26,23,0.10)",
    topicDrawer: "0 12px 32px -8px rgba(27,26,23,0.14)",
    topicCta: "0 1px 0 rgba(255,255,255,0.08) inset, 0 4px 12px rgba(63,90,59,0.24), 0 1px 2px rgba(63,90,59,0.16)",
    shell: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 2px rgba(27,26,23,0.045), 0 8px 16px -6px rgba(27,26,23,0.08), 0 20px 38px -16px rgba(27,26,23,0.11)",
    raised: "inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 4px rgba(27,26,23,0.05), 0 12px 24px -8px rgba(27,26,23,0.12), 0 30px 54px -20px rgba(27,26,23,0.15)",
    glass: "0 1px 0 rgba(27,26,23,0.035), 0 8px 18px -10px rgba(27,26,23,0.12), 0 1px 2px rgba(27,26,23,0.05)",
    focus: "0 1px 0 rgba(27,26,23,0.035), 0 8px 18px -10px rgba(27,26,23,0.12), 0 1px 2px rgba(27,26,23,0.05)",
    focusedSurface: "inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 4px rgba(27,26,23,0.05), 0 12px 24px -8px rgba(27,26,23,0.12), 0 30px 54px -20px rgba(27,26,23,0.15)",
    cardLiftHover: "0 18px 40px rgba(27,26,23,0.16), 0 3px 10px rgba(27,26,23,0.07)",
    accentButton: "0 8px 18px rgba(26,46,79,0.16)",
    activeTab: "0 6px 16px rgba(27,26,23,0.08)",
    productActionCardHover: "0 12px 28px rgba(27,26,23,0.08), 0 2px 6px rgba(27,26,23,0.04)",
    productActionCardHoverStrong: "0 14px 32px rgba(27,26,23,0.10), 0 2px 6px rgba(27,26,23,0.04)",
    previewAvatar: "0 4px 12px rgba(26,46,79,0.12)",
    hudGlow: "0 1px 0 rgba(27,26,23,0.04), 0 8px 16px rgba(27,26,23,0.06)",
    popup: "0 20px 56px rgba(27,26,23,0.16), 0 2px 8px rgba(27,26,23,0.08), 0 0 0 1px rgba(27,26,23,0.08)",
    atlasGlass: WORKSPACE_GLASS.heroShadow,
    atlasCard: WORKSPACE_GLASS.panelShadow
  },

  effect: {
    glassBlur: "none",
    atlasBlur: WORKSPACE_GLASS.blur
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

  /* 觀眾反應 workspace as a discourse layer (side panel A, 2026-10-08): 話題 chips, 未分流, 講法 rows, 發現 cards. */
  discourse: {
    pad: 16, gap: 8, sectionTop: 22, radius: 14, rowRadius: 10, chipPad: "6px 12px", pickPad: "4px 10px",
    chipBg: "rgba(27,26,23,.05)", chipCountOn: "rgba(255,255,255,.72)", hover: "rgba(27,26,23,.04)", hair: "rgba(27,26,23,.06)", card: "#ffffff",
    cardShadow: "0 1px 2px rgba(27,26,23,.04)", soft: "#6c695e", faint: "#a19e93",
    inbox: "#a06a17", inboxWash: "rgba(160,106,23,.08)", trend: "#3f5a3b", like: "#a06a17", ask: "#7b4a8a", replied: "#234f7a",
    titleFont: 21, bodyFont: 13, smallFont: 12, tinyFont: 11.5, avatar: 22, faceAvatar: 20, weekBar: 34
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
    collection: { riseMs: 420, risePx: 8, staggerMs: 28, staggerCap: 10, foldMs: 240, glideMs: 420, fadeMs: 280, mistMs: 18000, mistX: 24, mistY: 12, clockMs: 60000 },
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
      atlasHover: "scale(1.025)",
      atlasPress: "scale(0.985)"
    },
    /* Product-wide arrival grammar (approved 2026-07-14). Presence is
     * one-shot and opt-in through data-dlens-presence so dense utility rows
     * stay quiet unless a view explicitly assigns them to this hierarchy. */
    presence: {
      cardOpacityFrom: 0.28,
      cardRisePx: 10,
      cardDurationMs: 480,
      cardDelayMs: 70,
      cardStaggerMs: 60,
      rowOpacityFrom: 0.92,
      rowRisePx: 4,
      rowDurationMs: 220,
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
        durationMs: 420
      }
    },
    bottomRebound: {
      amplitudePx: 3,
      durationMs: 280,
      hysteresisPx: 30,
      wheelGain: 0.06,
      settleDelayMs: 140,
      cooldownMs: 400,
      bottomTolerancePx: 1
    },
    cascadeDelay: {
      masthead: "0ms",
      rail: "35ms",
      main: "70ms"
    },
    transition: "all 180ms cubic-bezier(0.4, 0, 0.2, 1)",
    transitionFast: "all 100ms cubic-bezier(0.4, 0, 0.2, 1)",
    interactiveTransition: "background-color 180ms cubic-bezier(0.4, 0, 0.2, 1), border-color 180ms cubic-bezier(0.4, 0, 0.2, 1), color 180ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 180ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1), transform 180ms cubic-bezier(0.4, 0, 0.2, 1)",
    interactiveTransitionFast: "background-color 140ms cubic-bezier(0.4, 0, 0.2, 1), border-color 140ms cubic-bezier(0.4, 0, 0.2, 1), color 140ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 140ms cubic-bezier(0.4, 0, 0.2, 1), opacity 140ms cubic-bezier(0.4, 0, 0.2, 1), transform 140ms cubic-bezier(0.4, 0, 0.2, 1)",
    /* Semantic presets — use these for new components.
     * `buttonPress` springs the transform; `cardLift` settles with a soft overshoot. */
    preset: {
      buttonPress: "transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 140ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 160ms cubic-bezier(0.4, 0, 0.2, 1), border-color 140ms cubic-bezier(0.4, 0, 0.2, 1), filter 140ms cubic-bezier(0.4, 0, 0.2, 1)",
      cardLift: "transform 200ms cubic-bezier(0.22, 1.12, 0.36, 1), box-shadow 200ms cubic-bezier(0.22, 1.12, 0.36, 1), border-color 180ms cubic-bezier(0.4, 0, 0.2, 1), background-color 180ms cubic-bezier(0.4, 0, 0.2, 1)",
      surfaceFade: "opacity 280ms cubic-bezier(0.16, 1, 0.3, 1), transform 280ms cubic-bezier(0.16, 1, 0.3, 1)"
    },
    /* Loading + one-shot feedback: shorthands for keyframes injected at runtime
     * from the single DLENS_KEYFRAMES_CSS registry (src/ui/motion.ts). */
    keyframes: {
      shimmer: "dlens-popup-shimmer 1400ms linear infinite",
      pulse: "dlens-popup-pulse 1600ms cubic-bezier(0.4, 0, 0.6, 1) infinite",
      indeterminate: "dlens-popup-indeterminate 1100ms cubic-bezier(0.4, 0, 0.2, 1) infinite",
      spin: "dlens-spin 900ms linear infinite",
      bump: "dlens-bump 440ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      successRing: "dlens-success-ring 900ms cubic-bezier(0.4, 0, 0.6, 1)",
      successPop: "dlens-success-pop 900ms cubic-bezier(0.4, 0, 0.6, 1)"
    }
  },

  layout: {
    savedPostThumbnailSize: 44,
    collectionMenuWidth: 224,
    collectionThumbnailSize: 52,
    atlasNarrowBreakpointPx: 520,
    workspacePopupHeight: "min(78vh, 780px)"
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 20,
    xl: 28,
    section: 16,
    resultSectionGap: 32,
    resultCardGap: 16
  },

  font: {
    sans: "'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
    serif: "'Instrument Serif', 'Iowan Old Style', 'Times New Roman', Georgia, serif",
    serifCjk: "'Noto Serif TC', 'Songti TC', 'Source Han Serif TC', serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace"
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

/* ─── Semantic text styles ───
 *
 * Weight-driven hierarchy (design system principle):
 *   400 = body  ·  500 = field labels  ·  600 = caption/emphasis
 *   700 = card title / section header  ·  800+ = hero / display
 *
 * Use these instead of ad-hoc { fontSize, fontWeight } in views.
 */
export const textStyles = {
  /** Serif headline — compare hero, mode header title */
  h2: { fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontWeight: 700, fontSize: 24, lineHeight: 1.25, letterSpacing: 0 } as const,
  /** Serif sub-headline — section titles inside views */
  h3: { fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontWeight: 700, fontSize: 18, lineHeight: 1.3, letterSpacing: 0 } as const,
  /** Bold sans — card titles, workflow pattern names */
  cardTitle: { fontFamily: tokens.font.sans, fontWeight: 700, fontSize: 15, lineHeight: 1.35 } as const,
  /** Regular sans — primary reading text */
  body: { fontFamily: tokens.font.sans, fontWeight: 400, fontSize: 14, lineHeight: 1.7 } as const,
  /** Tight body — dense lists, evidence content */
  bodyTight: { fontFamily: tokens.font.sans, fontWeight: 400, fontSize: 13, lineHeight: 1.55 } as const,
  /** Medium sans — metadata, timestamps, counts */
  meta: { fontFamily: tokens.font.sans, fontWeight: 500, fontSize: 12, lineHeight: 1.5 } as const,
  /** Uppercase structural label — section headers, "POST A", kickers */
  label: { fontFamily: tokens.font.sans, fontWeight: 700, fontSize: 10, lineHeight: 1.4, letterSpacing: "0.06em", textTransform: "uppercase" as const } as const,
  /** Semi-bold caption — secondary labels, chip text */
  caption: { fontFamily: tokens.font.sans, fontWeight: 600, fontSize: 11, lineHeight: 1.4 } as const,
  /** Medium field label — "如何照抄", "為什麼可以這樣做" (not bold, not faint) */
  fieldLabel: { fontFamily: tokens.font.sans, fontWeight: 500, fontSize: 11, lineHeight: 1.4, color: tokens.color.softInk } as const,
  /** Monospace — evidence IDs, scores, code snippets */
  mono: { fontFamily: tokens.font.mono, fontVariantNumeric: "tabular-nums" as const } as const,
  /** Monospace metric — compact counts, scores, and ledger numbers */
  metric: { fontFamily: tokens.font.mono, fontWeight: 700, fontSize: 11, lineHeight: 1.4, fontVariantNumeric: "tabular-nums" as const } as const,
  /** Mono display numeral — atlas coverage-ledger KPI counts */
  metricDisplay: { fontFamily: tokens.font.mono, fontWeight: 800, fontSize: 27, lineHeight: 1, fontVariantNumeric: "tabular-nums" as const } as const,
  /** Serif CJK italic pull quote — inside evidence cards */
  quote: { fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontStyle: "italic" as const, fontWeight: 500, fontSize: 15, lineHeight: 1.65 } as const,
} as const;

export type TextStyleKey = keyof typeof textStyles;

/* ─── flat alias export ─── */
export const TOKENS = {
  ink: tokens.color.ink,
  subInk: tokens.color.subInk,
  softInk: tokens.color.softInk,
  line: tokens.color.line,
  canvas: tokens.color.canvas,
  surface: tokens.color.surface,
  elevated: tokens.color.elevated,
  dark: tokens.color.dark,
  accent: tokens.color.accent,
  accentMid: tokens.color.accentMid,
  accentSoft: tokens.color.accentSoft,
  accentGlow: tokens.color.accentGlow,
  cyan: tokens.color.cyan,
  cyanSoft: tokens.color.cyanSoft,
  cyanGlow: tokens.color.cyanGlow,
  signal: tokens.color.signal,
  signalDeep: tokens.color.signalDeep,
  signalGlow: tokens.color.signalGlow,
  signalFaint: tokens.color.signalFaint,
  atlasPaper: tokens.color.atlasPaper,
  atlasPaperStrong: tokens.color.atlasPaperStrong,
  atlasEdge: tokens.color.atlasEdge,
  teal: tokens.color.teal,
  tealMid: tokens.color.tealMid,
  tealSoft: tokens.color.tealSoft,
  tealGlow: tokens.color.tealGlow,
  product: tokens.color.product,
  productMid: tokens.color.productMid,
  productSoft: tokens.color.productSoft,
  productGlow: tokens.color.productGlow,
  success: tokens.color.success,
  successSoft: tokens.color.successSoft,
  queued: tokens.color.queued,
  queuedDeep: tokens.color.queuedDeep,
  queuedSoft: tokens.color.queuedSoft,
  failed: tokens.color.failed,
  failedSoft: tokens.color.failedSoft,
  running: tokens.color.running,
  runningSoft: tokens.color.runningSoft,
  glassBg: tokens.color.glassBg,
  glassBorder: tokens.color.glassBorder,
  glassShadow: tokens.shadow.glass,
  glassBlur: tokens.effect.glassBlur,
  atlasBlur: tokens.effect.atlasBlur,
  atlasGlass: tokens.shadow.atlasGlass,
  hudGlow: tokens.shadow.hudGlow,
  cardRadius: tokens.radius.card,
  lgRadius: tokens.radius.lg,
  pillRadius: tokens.radius.pill,
  transition: tokens.motion.transition,
  transitionFast: tokens.motion.transitionFast,
  interactiveTransition: tokens.motion.interactiveTransition,
  interactiveTransitionFast: tokens.motion.interactiveTransitionFast
} as const;

/** A handle-tinted initial stands in for an avatar (no avatar URL is stored); same hue for the same handle everywhere. */
export function avatarGradient(handle: string): string {
  const hue = [...(handle || "?")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return `linear-gradient(135deg, hsl(${hue} 45% 60%), hsl(${hue + 40} 42% 44%))`;
}


/** Quiet type tiles share one deterministic tint per normalized author handle. */
export function collectionTileTint(handle: string): { background: string; color: string } {
  const hue = [...(handle.trim().replace(/^@/, "").toLowerCase() || "?")].reduce((h, ch) => (h * 31 + ch.codePointAt(0)!) % 360, 7);
  return { background: `hsl(${hue} 38% 93%)`, color: `hsl(${hue} 32% 32%)` };
}
