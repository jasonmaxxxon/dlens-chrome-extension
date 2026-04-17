/* ─── DLens Soft White Glass Theme ───
 *
 * Design direction: Editorial analysis product — calm zinc canvas, subtle glass cards.
 * Key principles:
 *   1. Calm neutral canvas — no warm fog tint
 *   2. Glass cards — near-white surfaces with very light separation
 *   3. Soft drop shadows — no heavy glow
 *   4. Color as accent only — A = indigo tint, B = amber tint, never full-card tint
 *   5. Dark text hierarchy — ink on light, clear reading weight
 */

export const tokens = {
  color: {
    /* text hierarchy — calm editorial workspace */
    ink: "#172033",
    subInk: "#4b5563",
    softInk: "#7c8798",

    /* borders & dividers */
    line: "rgba(15,23,42,0.09)",
    lineStrong: "rgba(15,23,42,0.14)",

    /* shared workspace surfaces */
    canvas: "#f4f4f5",
    surface: "#fcfcfd",
    elevated: "#ffffff",
    shellSurface: "rgba(248,250,252,0.92)",
    contentSurface: "#fcfcfd",
    focusedSurface: "#ffffff",
    railSurface: "rgba(248,250,252,0.92)",
    contextSurface: "rgba(248,250,252,0.88)",
    utilitySurface: "rgba(255,255,255,0.92)",

    /* legacy alias */
    dark: "#172033",

    /* accent — indigo core (Post A) */
    accent: "#4f46e5",
    accentMid: "#6366f1",
    accentSoft: "rgba(79,70,229,0.07)",
    accentGlow: "rgba(79,70,229,0.18)",

    /* secondary accent — teal */
    cyan: "#0891b2",
    cyanSoft: "rgba(8,145,178,0.10)",
    cyanGlow: "rgba(8,145,178,0.15)",

    /* technique accents */
    techniqueRose: "#e11d48",
    techniqueAmber: "#d97706",
    techniqueTeal: "#0f766e",
    techniqueBlue: "#2563eb",
    techniqueViolet: "#7c3aed",

    /* status */
    success: "#059669",
    successSoft: "rgba(5,150,105,0.08)",
    queued: "#d97706",
    queuedSoft: "rgba(217,119,6,0.08)",
    failed: "#dc2626",
    failedSoft: "rgba(220,38,38,0.07)",
    running: "#2563eb",
    runningSoft: "rgba(37,99,235,0.08)",

    /* shell aliases kept for existing callers */
    glassBg: "#fcfcfd",
    glassBorder: "rgba(15,23,42,0.09)",

    /* idle / neutral */
    idleBg: "rgba(248,250,252,0.92)",
    idleBorder: "rgba(15,23,42,0.08)",

    /* neutral surface — chips, inactive tabs */
    neutralSurface: "#f8fafc",
    neutralSurfaceSoft: "rgba(248,250,252,0.82)",
    neutralText: "#6b7280",

    /* disabled */
    disabledPrimary: "rgba(156,163,175,0.50)",
    disabledSecondary: "rgba(243,244,246,0.50)"
  },

  radius: {
    lg: 18,
    card: 14,
    pill: 10,
    sm: 6
  },

  shadow: {
    shell: "0 12px 36px rgba(15,23,42,0.10)",
    glass: "0 12px 36px rgba(15,23,42,0.10)",
    focus: "0 10px 24px rgba(15,23,42,0.08)",
    focusedSurface: "0 10px 24px rgba(15,23,42,0.08)",
    accentButton: "0 8px 18px rgba(79,70,229,0.20)",
    activeTab: "0 8px 18px rgba(15,23,42,0.08)",
    previewAvatar: "0 4px 12px rgba(79,70,229,0.16)",
    hudGlow: "0 1px 3px rgba(255,255,255,0.7), 0 10px 24px rgba(15,23,42,0.04)",
    popup: "0 18px 52px rgba(15,23,42,0.14), 0 0 0 1px rgba(255,255,255,0.92)"
  },

  effect: {
    glassBlur: "blur(18px) saturate(120%)"
  },

  motion: {
    transition: "all 180ms cubic-bezier(0.4, 0, 0.2, 1)",
    transitionFast: "all 100ms cubic-bezier(0.4, 0, 0.2, 1)",
    interactiveTransition: "background-color 180ms cubic-bezier(0.4, 0, 0.2, 1), border-color 180ms cubic-bezier(0.4, 0, 0.2, 1), color 180ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 180ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1), transform 180ms cubic-bezier(0.4, 0, 0.2, 1)",
    interactiveTransitionFast: "background-color 140ms cubic-bezier(0.4, 0, 0.2, 1), border-color 140ms cubic-bezier(0.4, 0, 0.2, 1), color 140ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 140ms cubic-bezier(0.4, 0, 0.2, 1), opacity 140ms cubic-bezier(0.4, 0, 0.2, 1), transform 140ms cubic-bezier(0.4, 0, 0.2, 1)"
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
    mono: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace"
  }
} as const;

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
