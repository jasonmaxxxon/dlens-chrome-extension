// Theme layer — renders a <style> tag that remaps the design's color/type/spacing
// based on tweak values. Works by overriding inline style values via attribute
// selectors with !important, so we don't have to rewrite every view.

function buildThemeCSS({ palette, density, voice }) {
  // ─── Palette tokens ───────────────────────────────────────────────
  const palettes = {
    warm: {
      bg1: '#faf9f5',    // main content bg
      bg2: '#f2f0e7',    // section/rail bg
      border1: '#ebe9e0',
      border2: '#e5e3d8',
      border3: '#d8d6cc',
      card: '#fff',
      primary: '#2f4a3a',      // forest green
      primaryInk: '#fff',
      ink: '#1a2332',          // deep navy text
      muted: '#8a8880',
      bodyBg: '#e8e6df',
      shellBorder: '#d8d6cc',
      accentWarm: '#c2550a',   // orange counter
    },
    cool: {
      bg1: '#ffffff',
      bg2: '#f1f4f8',
      border1: '#dde3ec',
      border2: '#e3e8ef',
      border3: '#c9d1dc',
      card: '#ffffff',
      primary: '#1f3a8a',      // indigo
      primaryInk: '#fff',
      ink: '#0f172a',
      muted: '#64748b',
      bodyBg: '#dbe2ec',
      shellBorder: '#c9d1dc',
      accentWarm: '#0891b2',   // cyan counter
    },
    editorial: {
      bg1: '#fbf5ea',          // ivory paper
      bg2: '#f4ecd8',
      border1: '#e8dcbf',
      border2: '#ded0ab',
      border3: '#c9b787',
      card: '#fffcf4',
      primary: '#8a3a1c',      // sienna
      primaryInk: '#fbf5ea',
      ink: '#2a1a0f',
      muted: '#8a7855',
      bodyBg: '#e6dbc0',
      shellBorder: '#c9b787',
      accentWarm: '#b08030',
    },
    midnight: {
      bg1: '#1a1d24',
      bg2: '#232832',
      border1: '#2f3644',
      border2: '#374052',
      border3: '#455068',
      card: '#242936',
      primary: '#7fb88a',      // muted sage
      primaryInk: '#0f1115',
      ink: '#e8ecf2',
      muted: '#8994a6',
      bodyBg: '#0f1115',
      shellBorder: '#2f3644',
      accentWarm: '#e89a5d',
    },
  };

  const p = palettes[palette] || palettes.warm;

  // ─── Density scale ────────────────────────────────────────────────
  const densities = {
    spacious:    { pad: 1.2, gap: 1.25, radius: 1.1, cardPad: 1.2 },
    comfortable: { pad: 1.0, gap: 1.0,  radius: 1.0, cardPad: 1.0 },
    compact:     { pad: 0.75, gap: 0.75, radius: 0.85, cardPad: 0.75 },
  };
  const d = densities[density] || densities.comfortable;

  // ─── Voice / Type ─────────────────────────────────────────────────
  const voices = {
    editorial: {
      heading: '"Noto Serif TC", "Songti TC", Georgia, serif',
      body:    '"Noto Serif TC", "PingFang TC", Georgia, serif',
      tracking: '-0.015em',
      headingWeight: 900,
      italic: 'italic',
    },
    humanist: {
      heading: '"Noto Serif TC", "PingFang TC", serif',
      body:    '"Noto Sans TC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      tracking: '-0.01em',
      headingWeight: 700,
      italic: 'normal',
    },
    technical: {
      heading: '"JetBrains Mono", "SF Mono", ui-monospace, "Noto Sans TC", monospace',
      body:    '"Noto Sans TC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      tracking: '0em',
      headingWeight: 600,
      italic: 'normal',
    },
  };
  const v = voices[voice] || voices.humanist;

  // Helper: hex substring matcher
  const mapBg  = (from, to) => `[style*="background: ${from}"],[style*="background:${from}"]{background:${to} !important}`;
  const mapBgc = (from, to) => `[style*="background-color: ${from}"],[style*="background-color:${from}"]{background-color:${to} !important}`;
  const mapCol = (from, to) => `[style*="color: ${from}"],[style*="color:${from}"]{color:${to} !important}`;
  const mapBdr = (from, to) => `[style*="border: 1px solid ${from}"]{border-color:${to} !important}
    [style*="border: 1.5px solid ${from}"]{border-color:${to} !important}
    [style*="border: 2px solid ${from}"]{border-color:${to} !important}
    [style*="borderColor: ${from}"]{border-color:${to} !important}
    [style*="solid ${from}"]{border-color:${to} !important}`;
  const mapStroke = (from, to) => `[stroke="${from}"]{stroke:${to} !important}
    [fill="${from}"]{fill:${to} !important}`;

  return `
    /* ─── Voice / Type ─── */
    body { font-family: ${v.body} !important; color: ${p.ink} !important; background: ${p.bodyBg} !important; }
    h1, h2, h3 { font-family: ${v.heading} !important; letter-spacing: ${v.tracking} !important; font-weight: ${v.headingWeight} !important; }
    ${voice === 'editorial' ? `h2 { font-style: ${v.italic}; }` : ''}
    ${voice === 'technical' ? `h2, h3 { text-transform: uppercase; letter-spacing: 0.04em !important; font-size: 0.92em !important; }` : ''}

    /* ─── Palette remap (bg) ─── */
    ${mapBg('#faf9f5', p.bg1)}
    ${mapBg('#f2f0e7', p.bg2)}
    ${mapBg('#ebe9e0', p.bg2)}
    ${mapBg('#fff', p.card)}
    ${mapBg('#ffffff', p.card)}
    ${mapBg('#f8f8f6', p.bg2)}
    ${mapBg('#f5f5f3', p.bg2)}
    ${mapBg('#2f4a3a', p.primary)}
    ${mapBg('#1a2332', p.primary)}
    ${mapBg('#eef2f7', palette === 'midnight' ? '#2f3644' : p.bg2)}
    ${mapBg('#fef2e8', palette === 'midnight' ? '#3a2f28' : '#fbe9d6')}
    ${mapBgc('#fff', p.card)}

    /* ─── Palette remap (text) ─── */
    ${mapCol('#1a2332', p.ink)}
    ${mapCol('#222', p.ink)}
    ${mapCol('#2f4a3a', p.primary)}
    ${mapCol('#444', p.ink)}
    ${mapCol('#555', palette === 'midnight' ? '#c0c6d0' : '#555')}
    ${mapCol('#666', p.muted)}
    ${mapCol('#888', p.muted)}
    ${mapCol('#8a8880', p.muted)}
    ${mapCol('#aaa', p.muted)}
    ${mapCol('#c2550a', p.accentWarm)}
    ${mapCol('#4a7c59', p.primary)}
    ${mapCol('#86bc90', palette === 'midnight' ? '#7fb88a' : '#86bc90')}

    /* ─── Palette remap (border) ─── */
    ${mapBdr('#e5e3d8', p.border2)}
    ${mapBdr('#ebe9e0', p.border1)}
    ${mapBdr('#d8d6cc', p.border3)}
    ${mapBdr('#e8e8e4', p.border2)}
    ${mapBdr('#e0e0dc', p.border2)}
    ${mapBdr('#ddd', p.border3)}
    ${mapBdr('#eee', p.border1)}
    ${mapBdr('#1a2332', p.primary)}
    ${mapBdr('#2f4a3a', p.primary)}

    /* SVG icons in the rail */
    ${mapStroke('#2f4a3a', p.primary)}
    ${mapStroke('#8a8880', p.muted)}

    /* ─── Density: shell & card padding ─── */
    [style*="padding: '20px 24px'"]{padding:${Math.round(20 * d.pad)}px ${Math.round(24 * d.pad)}px !important}
    [style*="padding: 14"]:not([style*="padding: 140"]){padding:${Math.round(14 * d.cardPad)}px !important}
    [style*="padding: 16"]:not([style*="padding: 160"]){padding:${Math.round(16 * d.cardPad)}px !important}
    [style*="padding: 12"]:not([style*="padding: 120"]){padding:${Math.round(12 * d.cardPad)}px !important}
    [style*="padding: 10"]:not([style*="padding: 100"]){padding:${Math.round(10 * d.cardPad)}px !important}
    [style*="marginBottom: 14"]{margin-bottom:${Math.round(14 * d.gap)}px !important}
    [style*="marginBottom: 12"]:not([style*="marginBottom: 120"]){margin-bottom:${Math.round(12 * d.gap)}px !important}
    [style*="marginBottom: 10"]:not([style*="marginBottom: 100"]){margin-bottom:${Math.round(10 * d.gap)}px !important}
    [style*="marginBottom: 8"]{margin-bottom:${Math.round(8 * d.gap)}px !important}
    [style*="gap: 14"]{gap:${Math.round(14 * d.gap)}px !important}
    [style*="gap: 12"]{gap:${Math.round(12 * d.gap)}px !important}
    [style*="gap: 10"]{gap:${Math.round(10 * d.gap)}px !important}

    /* ─── Card style per palette ─── */
    ${palette === 'midnight' ? `
      [style*="boxShadow"]{box-shadow:0 1px 2px rgba(0,0,0,0.4) !important}
    ` : ''}
    ${palette === 'editorial' ? `
      [style*="borderRadius: 12"]:not([style*="borderRadius: 120"]){border-radius:${Math.round(4 * d.radius)}px !important}
      [style*="borderRadius: 10"]:not([style*="borderRadius: 100"]){border-radius:${Math.round(3 * d.radius)}px !important}
    ` : ''}

    /* ─── Scrollbar ─── */
    ::-webkit-scrollbar-thumb{background:${p.border3} !important}
  `;
}

function ThemeLayer({ palette, density, voice }) {
  const css = React.useMemo(
    () => buildThemeCSS({ palette, density, voice }),
    [palette, density, voice]
  );
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

window.ThemeLayer = ThemeLayer;
