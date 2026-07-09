# DLens 2027 Design Gallery — progress & architecture

**File:** `docs/mockups/2026-06-09-design-gallery.html` (← → or left rail switches design; top pills switch mode)
**Mockup only** — production `src/ui/tokens.ts` untouched.
**Deep-link:** `…design-gallery.html#<design-id>/<mode>` e.g. `#macos-dark/product`.

## 2026-06-10 curation (user feedback: too samey / wants native-Mac-plugin feel)
Removed 12 repetitive template-y designs (arc-sunrise, terminal-phosphor, visionos-glass, aurora, neumorph, swiss, tokyo-night, atelier, holo, sunset-warm, material-you, graphite-metal, mint-porcelain, mercury-dark, cyber-magenta, paper-mono → 16 ids, 12 blocks).

**Current 8:**
1. `macos-light` — native vibrancy panel, push-button gradients, system SF font (default)
2. `macos-dark` — dark vibrancy
3. `macos-graphite` — same bones, mode accents muted to near-graphite (per-mode overrides)
4. `macos-glass` — Control-Center-weight vibrancy
5. `raycast-glass` · 6. `night-desk-pro` · 7. `linear-noir` · 8. `vercel-mono` (kept, distinct)

**Fluidity layer (global):** button hover = 1px float; press = scale(.965) fast; focus-visible accent ring; mode switcher = real segmented control with **sliding thumb** (spring, JS `positionThumb()` re-measures on mode/design change + fonts.ready + resize).

**Mode model unchanged:** design = base language; mode = accent + content (Topic green / Product blue / PR rose / Archive indigo). macOS primary buttons derive from `var(--accent)` so they follow the mode like a macOS accent-color setting.

## Architecture (for extending)
One fixed frame skinned by CSS vars; each design = one `[data-design]` block + one `DESIGNS` array entry. Vars: bg/bg2 panel elevated ink/sub/soft line/line2 accent/accentInk radius/rbtn/rcard/rpill font/fontD/fontM shadow/shadowPop blur glow dur/ease/spring label-tt/h1w/h1ls/btn-weight.

## Next
1. User picks favourite(s) → polish that one (motion chains, type scale, per-mode fine-tuning).
2. Lock winner → map to `src/ui/tokens.ts` (~20-25 values; glass/backdrop-filter is a separate perf decision — tokens currently ship `glassBlur:"none"`).
