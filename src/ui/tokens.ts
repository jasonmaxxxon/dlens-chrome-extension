export const tokens = {
  color: {
    ink: "#0f172a",
    subInk: "#475569",
    softInk: "#64748b",
    line: "#e2e8f0",
    surface: "rgba(255,255,255,0.82)",
    elevated: "rgba(255,255,255,0.72)",
    dark: "#0f172a",
    accent: "#6366f1",
    accentSoft: "rgba(99,102,241,0.12)",
    accentGlow: "rgba(99,102,241,0.25)",
    success: "#059669",
    successSoft: "rgba(5,150,105,0.12)",
    queued: "#d97706",
    queuedSoft: "rgba(217,119,6,0.12)",
    failed: "#dc2626",
    failedSoft: "rgba(220,38,38,0.10)",
    running: "#2563eb",
    runningSoft: "rgba(37,99,235,0.12)",
    glassBg: "rgba(255,255,255,0.72)",
    glassBorder: "rgba(255,255,255,0.45)",
    idleBg: "rgba(226,232,240,0.9)",
    idleBorder: "rgba(100,116,139,0.3)",
    neutralSurface: "#f1f5f9",
    neutralSurfaceSoft: "rgba(241,245,249,0.8)",
    neutralText: "#334155",
    disabledPrimary: "#cbd5e1",
    disabledSecondary: "#f8fafc"
  },
  radius: {
    card: 20,
    pill: 12
  },
  shadow: {
    glass: "0 8px 32px rgba(15,23,42,0.12)",
    accentButton: "0 4px 14px rgba(99,102,241,0.25)",
    activeTab: "0 2px 8px rgba(99,102,241,0.25)",
    previewAvatar: "0 4px 12px rgba(99,102,241,0.25)"
  },
  effect: {
    glassBlur: "blur(20px) saturate(180%)"
  },
  motion: {
    transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)"
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 10,
    lg: 16
  }
} as const;

export const TOKENS = {
  ink: tokens.color.ink,
  subInk: tokens.color.subInk,
  softInk: tokens.color.softInk,
  line: tokens.color.line,
  surface: tokens.color.surface,
  elevated: tokens.color.elevated,
  dark: tokens.color.dark,
  accent: tokens.color.accent,
  accentSoft: tokens.color.accentSoft,
  accentGlow: tokens.color.accentGlow,
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
  cardRadius: tokens.radius.card,
  pillRadius: tokens.radius.pill,
  transition: tokens.motion.transition
} as const;
