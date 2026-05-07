import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const root = "/Users/tung/Desktop/dlens-product-latest/docs/mockups/2026-05-06-open-design-three-modes";
const skillScript = "/Users/tung/.agents/skills/open-design-landing-deck/scripts/compose.ts";
const examplePath = "/Users/tung/.agents/skills/open-design-landing-deck/example.html";

const { renderDeck } = await import(pathToFileURL(skillScript).href);
const inputs = JSON.parse(await readFile(`${root}/inputs.json`, "utf8"));
const example = await readFile(examplePath, "utf8");
const baseCss = example.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";

let html = renderDeck(inputs, baseCss);
const extraCss = `
<style>
.s-cover .art {
  background:
    radial-gradient(circle at 18% 22%, rgba(237,111,92,.28), transparent 24%),
    radial-gradient(circle at 72% 34%, rgba(110,116,72,.24), transparent 26%),
    linear-gradient(135deg, var(--bone), var(--paper-dark));
}
.s-cover .art::before,
.s-content .art::before {
  content: '';
  position: absolute;
  inset: 10%;
  border: 1px solid rgba(21,20,15,.18);
  transform: rotate(-8deg);
  background: linear-gradient(135deg, rgba(237,111,92,.22), rgba(233,185,74,.18));
}
.s-cover .art::after,
.s-content .art::after {
  content: 'MODE / EVIDENCE / EXPORT';
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: 14%;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .18em;
  color: var(--ink-mute);
  border-top: 1px solid var(--line);
  padding-top: 14px;
}
.s-content.no-art .slide-inner { max-width: 1120px; }
.s-content.no-art .body { max-width: 72ch; }
.s-content.no-art ul {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 34px;
  margin-top: 8px;
}
@media (max-width: 820px) {
  .s-content.no-art ul { grid-template-columns: 1fr; }
}
</style>`;

html = html.replace("</head>", `${extraCss}\n</head>`);
await mkdir(dirname(`${root}/index.html`), { recursive: true });
await writeFile(`${root}/index.html`, html, "utf8");
console.log(`wrote ${root}/index.html (${inputs.slides.length} slides)`);
