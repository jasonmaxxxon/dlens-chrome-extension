/* ─── DLens Editorial Field Guide Theme ───
 *
 * Design direction: warm paper workspace, deep editorial ink, specimen-style accents.
 * `tokens.ts` remains the sole design spec even while some callers still use legacy
 * alias names such as glass*.
 */

export const tokens = {
  color: {
    /* text hierarchy — calm editorial workspace */
    ink: "#1b1a17",
    subInk: "#3d3b35",
    softInk: "#6c695e",

    /* borders & dividers */
    line: "rgba(27,26,23,0.10)",
    lineStrong: "rgba(27,26,23,0.18)",

    /* shared workspace surfaces */
    canvas: "#f7f4ec",
    surface: "#fbf8f1",
    elevated: "#fdfbf6",
    shellSurface: "rgba(253,251,246,0.96)",
    contentSurface: "#fbf8f1",
    focusedSurface: "#fdfbf6",
    railSurface: "rgba(247,244,236,0.94)",
    contextSurface: "rgba(242,238,226,0.72)",
    utilitySurface: "rgba(253,251,246,0.96)",

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

    /* teal — named alias for design system alignment */
    teal: "#3f5a3b",
    tealMid: "#527648",
    tealSoft: "rgba(63,90,59,0.10)",
    tealGlow: "rgba(63,90,59,0.16)",

    /* product accent — steel blue */
    product: "#234f7a",
    productMid: "#2f6a96",
    productSoft: "rgba(35,79,122,0.10)",
    productGlow: "rgba(35,79,122,0.18)",

    /* technique accents */
    techniqueRose: "#7a2030",
    techniqueAmber: "#a16a17",
    techniqueTeal: "#3f5a3b",
    techniqueBlue: "#1a2e4f",
    techniqueViolet: "#5e4b73",

    /* status */
    success: "#3f5a3b",
    successSoft: "rgba(63,90,59,0.10)",
    queued: "#a16a17",
    queuedSoft: "rgba(161,106,23,0.11)",
    failed: "#7a2030",
    failedSoft: "rgba(122,32,48,0.10)",
    running: "#1a2e4f",
    runningSoft: "rgba(26,46,79,0.08)",

    /* shell aliases kept for existing callers */
    glassBg: "#fbf8f1",
    glassBorder: "rgba(27,26,23,0.10)",

    /* idle / neutral */
    idleBg: "rgba(247,244,236,0.84)",
    idleBorder: "rgba(27,26,23,0.08)",

    /* neutral surface — chips, inactive tabs */
    neutralSurface: "#f1ece0",
    neutralSurfaceSoft: "rgba(241,236,224,0.78)",
    neutralText: "#6c695e",

    /* disabled */
    disabledPrimary: "rgba(149,145,127,0.55)",
    disabledSecondary: "rgba(227,220,204,0.60)"
  },

  radius: {
    lg: 12,
    card: 8,
    pill: 8,   /* badge/button pill — not the round 999 used for status dots */
    round: 999,
    sm: 4
  },

  shadow: {
    shell: "0 14px 34px rgba(27,26,23,0.10), 0 1px 2px rgba(27,26,23,0.06)",
    glass: "0 1px 0 rgba(27,26,23,0.035), 0 8px 18px -10px rgba(27,26,23,0.12), 0 1px 2px rgba(27,26,23,0.05)",
    focus: "0 1px 0 rgba(27,26,23,0.035), 0 8px 18px -10px rgba(27,26,23,0.12), 0 1px 2px rgba(27,26,23,0.05)",
    focusedSurface: "0 1px 0 rgba(27,26,23,0.035), 0 8px 18px -10px rgba(27,26,23,0.12), 0 1px 2px rgba(27,26,23,0.05)",
    accentButton: "0 8px 18px rgba(26,46,79,0.16)",
    activeTab: "0 6px 16px rgba(27,26,23,0.08)",
    previewAvatar: "0 4px 12px rgba(26,46,79,0.12)",
    hudGlow: "0 1px 0 rgba(27,26,23,0.04), 0 8px 16px rgba(27,26,23,0.06)",
    popup: "0 20px 56px rgba(27,26,23,0.16), 0 2px 8px rgba(27,26,23,0.08), 0 0 0 1px rgba(27,26,23,0.08)"
  },

  effect: {
    glassBlur: "none"
  },

  motion: {
    /* Primitive durations — pair with easings to build named transitions. */
    duration: {
      instant: "80ms",
      fast: "140ms",
      base: "180ms",
      slow: "280ms",
      slower: "420ms"
    },
    /* Primitive easings — `standard` is Material's canonical curve. */
    easing: {
      standard: "cubic-bezier(0.4, 0, 0.2, 1)",
      entrance: "cubic-bezier(0.16, 1, 0.3, 1)",
      exit: "cubic-bezier(0.4, 0, 1, 1)"
    },
    transition: "all 180ms cubic-bezier(0.4, 0, 0.2, 1)",
    transitionFast: "all 100ms cubic-bezier(0.4, 0, 0.2, 1)",
    interactiveTransition: "background-color 180ms cubic-bezier(0.4, 0, 0.2, 1), border-color 180ms cubic-bezier(0.4, 0, 0.2, 1), color 180ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 180ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1), transform 180ms cubic-bezier(0.4, 0, 0.2, 1)",
    interactiveTransitionFast: "background-color 140ms cubic-bezier(0.4, 0, 0.2, 1), border-color 140ms cubic-bezier(0.4, 0, 0.2, 1), color 140ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 140ms cubic-bezier(0.4, 0, 0.2, 1), opacity 140ms cubic-bezier(0.4, 0, 0.2, 1), transform 140ms cubic-bezier(0.4, 0, 0.2, 1)",
    /* Semantic presets — use these for new components. */
    preset: {
      buttonPress: "transform 80ms cubic-bezier(0.4, 0, 0.2, 1), background-color 140ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 140ms cubic-bezier(0.4, 0, 0.2, 1)",
      cardLift: "transform 180ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 180ms cubic-bezier(0.16, 1, 0.3, 1), border-color 180ms cubic-bezier(0.4, 0, 0.2, 1)",
      surfaceFade: "opacity 280ms cubic-bezier(0.16, 1, 0.3, 1), transform 280ms cubic-bezier(0.16, 1, 0.3, 1)"
    },
    /* Loading: shorthand for the keyframes injected by usePopupKeyframes. */
    keyframes: {
      shimmer: "dlens-popup-shimmer 1400ms linear infinite",
      pulse: "dlens-popup-pulse 1600ms cubic-bezier(0.4, 0, 0.6, 1) infinite",
      indeterminate: "dlens-popup-indeterminate 1100ms cubic-bezier(0.4, 0, 0.2, 1) infinite",
      spin: "dlens-spin 900ms linear infinite"
    }
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
  h2: { fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontWeight: 700, fontSize: 24, lineHeight: 1.25, letterSpacing: "-0.01em" } as const,
  /** Serif sub-headline — section titles inside views */
  h3: { fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontWeight: 700, fontSize: 18, lineHeight: 1.3, letterSpacing: "-0.005em" } as const,
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
  queuedSoft: tokens.color.queuedSoft,
  failed: tokens.color.failed,
  failedSoft: tokens.color.failedSoft,
  running: tokens.color.running,
  runningSoft: tokens.color.runningSoft,
  glassBg: tokens.color.glassBg,
  glassBorder: tokens.color.glassBorder,
  glassShadow: tokens.shadow.glass,
  glassBlur: tokens.effect.glassBlur,
  hudGlow: tokens.shadow.hudGlow,
  cardRadius: tokens.radius.card,
  lgRadius: tokens.radius.lg,
  pillRadius: tokens.radius.pill,
  transition: tokens.motion.transition,
  transitionFast: tokens.motion.transitionFast,
  interactiveTransition: tokens.motion.interactiveTransition,
  interactiveTransitionFast: tokens.motion.interactiveTransitionFast
} as const;
