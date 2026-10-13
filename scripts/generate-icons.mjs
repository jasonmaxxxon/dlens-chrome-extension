/**
 * Generates the DLens icon (a magnifier with a mint signal dot in the lens) as PNGs.
 * Zero dependencies — a hand-rolled PNG encoder over node:zlib, so no image
 * tooling (ImageMagick / rsvg) is required.
 *
 * Output: public/icon/{16,32,48,96,128}.png  (WXT copies public/ to build root)
 * Re-run after tweaking the design:  node scripts/generate-icons.mjs
 *
 * 16px and 32px use a bolder stroke so the ring, handle and dot still read in
 * the toolbar. Mockup: docs/mockups/2026-10-08-sidepanel-collection-B.html.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "public", "icon");

// Brand palette — see src/ui/tokens.ts (warm-ink tile, paper magnifier, mint signal).
const INK = [0x1b, 0x1a, 0x17];
const PAPER = [0xfb, 0xfb, 0xf9];
const MINT = [0x8f, 0xd6, 0xa8];

const SIZES = [16, 32, 48, 96, 128];
const SS = 4; // supersampling factor for anti-aliasing

// ── PNG encoder ──────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ── Mark renderer ────────────────────────────────────────────────────────
function renderIcon(size) {
  const W = size * SS;
  const bold = size <= 32;
  const pad = W * 0.0234;
  const corner = W * 0.2266;
  const center = W * 0.4414;
  const ring = W * 0.2305; // ring centre-line radius
  const ringHalf = (W * (bold ? 0.1172 : 0.082)) / 2;
  const handleHalf = (W * (bold ? 0.1289 : 0.1016)) / 2;
  const handleStart = center + (ring + ringHalf - W * 0.0078) * Math.SQRT1_2;
  const handleEnd = W * 0.7734;
  const dot = center - W * 0.0605;
  const dotRadius = W * (bold ? 0.0723 : 0.0527);

  const onHandle = (x, y) => {
    // distance to the 45° segment from handleStart to handleEnd, round caps
    const t = Math.min(Math.max(((x - handleStart) + (y - handleStart)) / (2 * (handleEnd - handleStart)), 0), 1);
    const along = handleStart + t * (handleEnd - handleStart);
    return Math.hypot(x - along, y - along) <= handleHalf;
  };

  const insideRoundedSquare = (x, y) => {
    const x0 = pad;
    const x1 = W - pad;
    const y0 = pad;
    const y1 = W - pad;
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const dx = x < x0 + corner ? x0 + corner - x : x > x1 - corner ? x - (x1 - corner) : 0;
    const dy = y < y0 + corner ? y0 + corner - y : y > y1 - corner ? y - (y1 - corner) : 0;
    return dx * dx + dy * dy <= corner * corner;
  };

  const rgba = Buffer.alloc(size * size * 4);
  const total = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x * SS + sx + 0.5;
          const py = y * SS + sy + 0.5;
          if (!insideRoundedSquare(px, py)) continue;
          const isMark = Math.abs(Math.hypot(px - center, py - center) - ring) <= ringHalf || onHandle(px, py);
          const color = isMark ? PAPER : Math.hypot(px - dot, py - dot) <= dotRadius ? MINT : INK;
          r += color[0];
          g += color[1];
          b += color[2];
          covered += 1;
        }
      }
      const i = (y * size + x) * 4;
      if (covered === 0) continue; // leave transparent (already zeroed)
      rgba[i] = Math.round(r / covered);
      rgba[i + 1] = Math.round(g / covered);
      rgba[i + 2] = Math.round(b / covered);
      rgba[i + 3] = Math.round((covered / total) * 255);
    }
  }
  return rgba;
}

mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, renderIcon(size));
  writeFileSync(resolve(outDir, `${size}.png`), png);
  console.log(`wrote public/icon/${size}.png (${png.length} bytes)`);
}
