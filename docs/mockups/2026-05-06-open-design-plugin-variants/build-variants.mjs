import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outDir = path.dirname(fileURLToPath(import.meta.url));

const productSignals = [
  {
    id: "sig-recrawl",
    title: "把 recurring crawl 包成每日監測 agent",
    category: "技術/workflow",
    verdict: "值得嘗試",
    relevance: 5,
    relevantTo: "capture automation",
    evidenceRefs: ["e1", "e3"],
    quote: "如果可以每天自動抓一次，再只告訴我今天多了什麼，其實就夠用了。",
    why: "這不是 crawler 本身，而是固定時間收集、比對前一天差異、輸出少量可讀 brief 的 workflow。",
    experiment: "先做手動 batch export，再觀察用戶是否把它貼給 agent 做下一步。",
    task: "Build a daily monitor brief for collected Threads posts. Keep original URLs, visible metrics, and quote refs. Output only new or changed signals.",
  },
  {
    id: "sig-pm-doc",
    title: "用 PM 文件生成流程切入非技術團隊",
    category: "學習",
    verdict: "保留觀察",
    relevance: 4,
    relevantTo: "agent handoff",
    evidenceRefs: ["e2"],
    quote: "整理成一頁決策文件，比 prompt 編輯更重要。",
    why: "需求指向文件交付物，不是 dashboard 或 task board。",
    experiment: "在 Saved Signals 的 export mode 加一個短版 Agent Brief，而不是每張卡預設完整 prompt。",
    task: "Convert selected product signals into one concise decision brief for a non-technical PM. Do not invent product context.",
  },
  {
    id: "sig-noise",
    title: "泛泛 AI 熱帖只作資料不足處理",
    category: "資料不足",
    verdict: "前提不符",
    relevance: 2,
    relevantTo: "signal quality",
    evidenceRefs: ["e4"],
    quote: "AI 工具都差不多，最好有一個懂我的就可以。",
    why: "沒有具體工作流、工具、成本或下一步，因此不值得消耗分析 token。",
    experiment: "收進噪音 filter，但不進 batch brief。",
    task: "Ignore generic AI aspiration posts unless they contain a concrete workflow, tool stack, or measurable adoption signal.",
  },
];

const topicItems = [
  {
    id: "topic-wellness",
    title: "Wellness carnival 的公關敘事被分成兩種讀法",
    status: "active",
    sources: 18,
    clusters: [
      { name: "活動體驗派", nick: "打卡/福利視角", share: "42%", quote: "現場動線和贈品比品牌理念更容易被轉貼。" },
      { name: "健康焦慮派", nick: "自我管理視角", share: "31%", quote: "大家反覆講壓力、睡眠、補充品，品牌不是唯一主角。" },
      { name: "花生友", nick: "旁觀玩笑視角", share: "17%", quote: "最有傳播力的是吐槽文案和排隊照片。" },
    ],
    note: "Topic Brief 應先顯示最大群體與語言差異，再進 Pair Lens。不是全域 social listening。",
  },
  {
    id: "topic-agent",
    title: "Agent workflow 討論由工具炫技轉向交付物",
    status: "watching",
    sources: 11,
    clusters: [
      { name: "交付物派", nick: "PM/文件派", share: "48%", quote: "不要給我一堆 prompt，給我可以改的 memo。" },
      { name: "工具派", nick: "MCP/Browser 派", share: "33%", quote: "真正問題是怎樣穩定抓資料和回報差異。" },
      { name: "成本派", nick: "Token 控制派", share: "13%", quote: "每張卡都生成 prompt 會太貴。" },
    ],
    note: "Pair Lens 只在 Topic Detail 內從 source list 選兩篇，結果短版保存到 Pair Insights。",
  },
];

const prRows = [
  {
    url: "threads.com/@kathy/post/1",
    author: "@wellness.daily",
    caption: "今次 carnival 最多人講的是體驗動線和試飲區，品牌 message 反而藏在細節。",
    likes: 1280,
    comments: 91,
    reposts: 64,
    views: 22100,
    ticks: [1, 1, 0, 1, 0, 0],
  },
  {
    url: "threads.com/@healthbeat/post/2",
    author: "@healthbeat.hk",
    caption: "BoostUP 把 inside-out wellness 講成日常習慣，比單次活動更容易被 media quote。",
    likes: 884,
    comments: 44,
    reposts: 38,
    views: 14700,
    ticks: [1, 0, 1, 0, 1, 0],
  },
  {
    url: "threads.com/@citykol/post/3",
    author: "@citykol",
    caption: "排隊人龍比產品介紹更搶眼，這種 KOL post 適合算 reported coverage。",
    likes: 2400,
    comments: 203,
    reposts: 112,
    views: 53000,
    ticks: [0, 1, 0, 1, 1, 0],
  },
  {
    url: "threads.com/@reporter/post/4",
    author: "@reporter.alice",
    caption: "活動現場設計清楚，但真正可引用的是 brand angle 和參與人數。",
    likes: 421,
    comments: 12,
    reposts: 17,
    views: 6800,
    ticks: [1, 0, 1, 0, 0, 1],
  },
];

const prCriteria = [
  "Inside-out wellness",
  "Event experience",
  "Brand message",
  "KOL amplification",
  "Media quote ready",
  "Logistics detail",
];

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function ticks(row) {
  return row.ticks.map((v) => (v ? "✓" : "")).join(",");
}

function csvPreview() {
  const header = [
    "post_url",
    "author_handle",
    "post_caption",
    "likes",
    "comments",
    "reposts",
    "views",
    "expected_engagement",
    ...prCriteria,
    "manual_notes",
    "collected_at",
  ];
  return [header.join(","), ...prRows.map((row) => [
    row.url,
    row.author,
    `"${row.caption}"`,
    row.likes,
    row.comments,
    row.reposts,
    row.views,
    "",
    ticks(row),
    "",
    "2026-05-06",
  ].join(","))].join("\n");
}

const summaryCopy = `Mannings BoostUP Wellness Carnival - Topline PR Performance Audit Summary

1. Overall Campaign Evidence
• Observed Social Coverage: DLens collected ${prRows.length} opened Threads posts for this campaign batch, with visible engagement fields preserved per row.
• Strongest Pull-Through: Inside-out wellness and Event experience appear most frequently across the collected posts.
• Operator Note: Reach, EAV, and duplicate policy are intentionally not estimated in V1 unless the PR team supplies a rubric.

2. Brand Message Pull-Through
• Inside-out wellness: appears in 3 of 4 collected examples.
• Event experience: appears in 2 of 4 collected examples.
• KOL amplification: visible in high-engagement KOL-style posts, but remains an observed field rather than a guaranteed reach claim.`;

function baseStyle(extra = "") {
  return `
    :root {
      --ink: #171615;
      --muted: #706b62;
      --faint: #a79f92;
      --paper: #f6efe2;
      --panel: #fffaf1;
      --line: #ded3c3;
      --line-dark: #b9aa97;
      --coral: #e8553f;
      --blue: #244f7a;
      --olive: #596d45;
      --gold: #b48626;
      --rose: #b64c64;
      --shadow: 0 18px 54px rgba(45, 36, 25, .14);
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --serif: "Iowan Old Style", "Noto Serif TC", Georgia, serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at 20% 0%, #fff8eb 0, #f6efe2 34%, #efe5d6 100%);
      color: var(--ink);
      font-family: var(--sans);
      -webkit-font-smoothing: antialiased;
    }
    button, input, textarea { font: inherit; }
    button {
      border: 1px solid var(--line-dark);
      background: #fffaf4;
      color: var(--ink);
      min-height: 34px;
      padding: 7px 11px;
      border-radius: 999px;
      cursor: pointer;
    }
    button.primary { background: var(--ink); color: #fffaf1; border-color: var(--ink); }
    button.ghost { background: transparent; }
    button.mode-active { border-color: var(--ink); background: var(--ink); color: var(--panel); }
    .mono { font-family: var(--mono); }
    .serif { font-family: var(--serif); }
    .muted { color: var(--muted); }
    .tiny { font: 11px/1.2 var(--mono); letter-spacing: .03em; text-transform: uppercase; color: var(--muted); }
    .tag { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: rgba(255,255,255,.48); font-size: 12px; }
    .tag.blue { color: var(--blue); border-color: color-mix(in srgb, var(--blue), white 60%); }
    .tag.olive { color: var(--olive); border-color: color-mix(in srgb, var(--olive), white 60%); }
    .tag.gold { color: #7a520e; border-color: color-mix(in srgb, var(--gold), white 50%); }
    .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--coral); display: inline-block; }
    .metric { font-variant-numeric: tabular-nums; font-family: var(--mono); }
    .hidden { display: none !important; }
    .output {
      white-space: pre-wrap;
      background: #181614;
      color: #f9f0df;
      padding: 14px;
      border-radius: 16px;
      font: 12px/1.55 var(--mono);
      max-height: 260px;
      overflow: auto;
    }
    .modal {
      position: fixed;
      inset: 0;
      background: rgba(21, 18, 13, .34);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      z-index: 99;
    }
    .modal.open { display: flex; }
    .modal-card {
      width: min(760px, 100%);
      max-height: 88vh;
      overflow: auto;
      background: var(--panel);
      border: 1px solid var(--line-dark);
      border-radius: 24px;
      box-shadow: var(--shadow);
      padding: 22px;
    }
    ${extra}
  `;
}

function shell({ title, variant, css, body, script }) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>${baseStyle(css)}</style>
</head>
<body data-variant="${esc(variant)}">
${body}
<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="modal-card">
    <div style="display:flex;justify-content:space-between;gap:16px;align-items:start;margin-bottom:12px">
      <div>
        <div class="tiny">Generated output</div>
        <h2 class="serif" id="modal-title" style="margin:4px 0 0;font-size:28px;line-height:1.05">Output</h2>
      </div>
      <button class="ghost" data-close>Close</button>
    </div>
    <div class="output" data-output>${esc(summaryCopy)}</div>
  </div>
</div>
<script>
${script}
</script>
</body>
</html>`;
}

function commonScript(extra = "") {
  return `
    const outputs = {
      agent: ${JSON.stringify(productSignals[0].task)},
      pair: ${JSON.stringify("Pair Insight｜成對洞察\\nA「活動體驗派」把證據放在現場可感知的動線與福利；B「健康焦慮派」把同一活動讀成日常自我管理焦慮。這個差異應短版保存到 Topic Note，完整 compare 留在 detail。")},
      csv: ${JSON.stringify(csvPreview())},
      summary: ${JSON.stringify(summaryCopy)},
      collect: ${JSON.stringify("Collect route result\\n同一篇 Threads post 已保存。\\nProduct: creates Signal for product analysis.\\nTopic: creates Signal in Inbox for triage.\\nPR Evidence: creates EvidenceRow with visible metrics only; no AI runs on collect.")}
    };
    function showOutput(kind, title) {
      document.querySelector("[data-output]").textContent = outputs[kind] || "";
      document.querySelector("#modal-title").textContent = title || "Output";
      document.querySelector("#modal").classList.add("open");
    }
    document.addEventListener("click", (event) => {
      const close = event.target.closest("[data-close]");
      if (close) document.querySelector("#modal").classList.remove("open");
      const action = event.target.closest("[data-action]");
      if (!action) return;
      const kind = action.dataset.action;
      if (kind === "agent-brief") showOutput("agent", "Agent Brief");
      if (kind === "pair-lens") showOutput("pair", "Pair Lens Result");
      if (kind === "csv-preview") showOutput("csv", "CSV Preview");
      if (kind === "summary") showOutput("summary", "Client Summary");
      if (kind === "collect-route") showOutput("collect", "Save routing");
      if (kind === "match-criteria") {
        document.body.classList.add("matched");
        const badge = document.querySelector("[data-match-state]");
        if (badge) badge.textContent = "matched · 4 rows · explicit batch action";
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") document.querySelector("#modal").classList.remove("open");
    });
    ${extra}
  `;
}

function modeButtons(active = "Product") {
  return ["Product", "Topic", "PR Evidence"].map((mode) => `<button class="${mode === active ? "mode-active" : ""}" data-mode="${mode.toLowerCase().replaceAll(" ", "-")}">${mode}</button>`).join("");
}

function variantA() {
  const css = `
    .app { width: min(1180px, calc(100vw - 32px)); min-height: 760px; margin: 28px auto; background: rgba(255,250,241,.82); border: 1px solid var(--line-dark); border-radius: 32px; box-shadow: var(--shadow); display: grid; grid-template-columns: 184px 1fr 328px; overflow: hidden; }
    .rail { background: rgba(247,239,226,.76); border-right: 1px solid var(--line); padding: 22px 16px; }
    .brand { font: 28px/1 var(--serif); margin-bottom: 4px; }
    .rail button { width: 100%; justify-content: flex-start; display: flex; margin: 8px 0; border-radius: 14px; }
    .main { padding: 22px 24px; overflow: auto; }
    .aside { border-left: 1px solid var(--line); background: #fffbf4; padding: 22px; display: flex; flex-direction: column; gap: 14px; }
    .mast { display:flex; justify-content:space-between; align-items:start; gap:20px; margin-bottom: 18px; }
    h1 { font: 42px/1.02 var(--serif); margin: 4px 0 8px; letter-spacing: -.01em; }
    .filter-col { display:grid; gap:8px; margin: 16px 0 20px; grid-template-columns: repeat(4, minmax(0,1fr)); }
    .row { display:grid; grid-template-columns: 5px 1fr auto; gap: 14px; align-items:start; padding: 16px 0; border-bottom: 1px solid var(--line); }
    .row:hover { background: rgba(232,85,63,.045); }
    .bar { width: 5px; height: 100%; border-radius: 10px; background: var(--blue); }
    .row.topic .bar { background: var(--olive); }
    .row.pr .bar { background: var(--gold); }
    .row h3 { margin:0 0 8px; font-size: 19px; line-height: 1.25; }
    .quote { border-left: 3px solid var(--line-dark); padding: 9px 0 9px 12px; color: var(--muted); background: rgba(246,239,226,.44); margin-top: 10px; }
    .aside h2 { font: 29px/1.05 var(--serif); margin: 0; }
    .callout { border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(246,239,226,.56); }
    .criteria { display:grid; grid-template-columns: 1fr auto; gap: 8px; align-items:center; }
    .bottom-actions { margin-top:auto; display:grid; gap:8px; }
    @media (max-width: 920px) { .app { grid-template-columns: 1fr; } .rail, .aside { border: 0; } }
  `;
  const rows = productSignals.map((s, i) => `
    <article class="row" data-row="product-signal-${i}">
      <span class="bar"></span>
      <div>
        <h3>${esc(s.title)}</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="tag blue">${esc(s.category)}</span><span class="tag">${esc(s.verdict)}</span><span class="tag">${esc(s.relevantTo)}</span></div>
        <p class="muted">${esc(s.why)}</p>
        <div class="quote">“${esc(s.quote)}” <span class="mono">${esc(s.evidenceRefs.join(" · "))}</span></div>
      </div>
      <div class="metric">${s.relevance}/5</div>
    </article>`).join("");
  const topicRows = topicItems.map((t) => `
    <article class="row topic" data-row="topic">
      <span class="bar"></span>
      <div>
        <h3>${esc(t.title)}</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="tag olive">${esc(t.status)}</span><span class="tag">${t.sources} sources</span><span class="tag">Topic Brief</span></div>
        <p class="muted">${esc(t.note)}</p>
      </div>
      <div class="metric">${t.clusters[0].share}</div>
    </article>`).join("");
  const prTable = prRows.map((row) => `
    <article class="row pr" data-row="pr-evidence">
      <span class="bar"></span>
      <div>
        <h3>${esc(row.author)}</h3>
        <p class="muted">${esc(row.caption)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="tag gold">likes ${row.likes}</span><span class="tag">views ${row.views}</span><span class="tag">expected engagement blank</span></div>
      </div>
      <div class="metric">${row.ticks.filter(Boolean).length}/6</div>
    </article>`).join("");
  const body = `
    <div class="app">
      <aside class="rail">
        <div class="brand">DLens</div>
        <div class="tiny">Margin Ledger · Plugin UI A</div>
        <div style="height:22px"></div>
        ${modeButtons("Product")}
        <button class="ghost" data-action="collect-route">Collect route</button>
        <button class="ghost">Settings</button>
        <div style="margin-top:24px" class="callout">
          <div class="tiny">README contract</div>
          <p style="margin:8px 0 0;color:var(--muted);font-size:13px;line-height:1.45">Collect 共用；保存後按 mode 轉成 Signal / Topic Signal / EvidenceRow。</p>
        </div>
      </aside>
      <main class="main">
        <div class="mast">
          <div>
            <div class="tiny">ProductContext compiled · no cluster dashboard</div>
            <h1>可行性過濾，而不是卡片牆<span class="dot"></span></h1>
            <p class="muted" style="max-width:670px">Product 先回答這條 signal 值不值得試；Topic 讀群體現象；PR Evidence 只做 campaign rows、criteria match、CSV。</p>
          </div>
          <button class="primary" data-action="agent-brief">Copy Agent Brief</button>
        </div>
        <div class="filter-col">
          <span class="tag blue">值得嘗試</span><span class="tag">保留觀察</span><span class="tag">前提不符</span><span class="tag">資料不足</span>
        </div>
        ${rows}
        <div style="height:22px"></div>
        <div class="tiny">Topic mode cross-check</div>
        ${topicRows}
        <div style="height:22px"></div>
        <div class="tiny">PR Evidence cross-check</div>
        ${prTable}
      </main>
      <aside class="aside">
        <div>
          <div class="tiny">Inspector · selected signal</div>
          <h2>${esc(productSignals[0].title)}</h2>
          <p class="muted">${esc(productSignals[0].experiment)}</p>
        </div>
        <div class="callout">
          <div class="tiny">Evidence refs</div>
          <p>e1: ${esc(productSignals[0].quote)}</p>
          <p class="muted">e3: recurring crawl + monitoring + handoff</p>
        </div>
        <div class="callout">
          <div class="tiny">PR criteria preview</div>
          ${prCriteria.map((c, i) => `<div class="criteria"><span>${esc(c)}</span><span class="metric">${i < 4 ? "✓" : ""}</span></div>`).join("")}
        </div>
        <div class="bottom-actions">
          <button data-action="pair-lens">Run Pair Lens</button>
          <button data-action="match-criteria">Match criteria</button>
          <button data-action="csv-preview">Preview CSV</button>
          <button class="primary" data-action="summary">Generate Summary</button>
          <span class="tiny" data-match-state>not matched · explicit actions only</span>
        </div>
      </aside>
    </div>`;
  return shell({ title: "DLens Plugin UI A - Margin Ledger", variant: "margin-ledger", css, body, script: commonScript() });
}

function variantB() {
  const css = `
    .bench { width:min(1240px, calc(100vw - 28px)); margin: 24px auto; min-height: 760px; border:1px solid #2a2721; background:#fdf8ef; box-shadow: 14px 14px 0 rgba(23,22,21,.10); display:grid; grid-template-rows:auto auto 1fr auto; }
    .top { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:16px 18px; border-bottom:1px solid #2a2721; background:#fffaf1; }
    .brandline { display:flex; gap:14px; align-items:baseline; }
    .tabs { display:flex; gap:8px; flex-wrap:wrap; }
    .setup { display:grid; grid-template-columns: 1.1fr .9fr 1fr; gap:0; border-bottom:1px solid #2a2721; }
    .setup > div { padding:16px 18px; border-right:1px solid var(--line-dark); min-height:112px; }
    .setup > div:last-child { border-right:0; }
    .setup h3 { margin:0 0 8px; font-size:16px; }
    .table-wrap { overflow:auto; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    th { position:sticky; top:0; background:#ebe2d3; z-index:1; text-align:left; font:11px/1.2 var(--mono); letter-spacing:.03em; text-transform:uppercase; color:#5f584e; border-bottom:1px solid #2a2721; padding:10px; }
    td { border-bottom:1px solid var(--line); padding:11px 10px; vertical-align:top; }
    tr:hover td { background:#fff4e7; }
    td.title { font-weight:720; min-width:260px; }
    .criteria-cell { text-align:center; font:18px/1 var(--serif); color:#5a6d43; }
    .dock { border-top:1px solid #2a2721; background:#171615; color:#fff8ea; padding:14px 18px; display:grid; grid-template-columns:1fr auto; gap:18px; align-items:center; }
    .dock button { border-color:#fff8ea; color:#fff8ea; background:transparent; }
    .dock button.primary { background:#fff8ea; color:#171615; }
    .switch-note { color:#f0dfbf; font-size:13px; line-height:1.45; }
    @media (max-width: 900px) { .setup { grid-template-columns: 1fr; } .setup > div { border-right:0; border-bottom:1px solid var(--line); } .dock { grid-template-columns:1fr; } }
  `;
  const productRows = productSignals.map((s) => `<tr data-ledger-row="product">
    <td class="title">${esc(s.title)}<br><span class="muted">${esc(s.why)}</span></td>
    <td>${esc(s.verdict)}</td><td class="metric">${s.relevance}/5</td><td>${esc(s.relevantTo)}</td><td>${esc(s.evidenceRefs.join(", "))}</td><td>${esc(s.task.slice(0, 72))}...</td>
  </tr>`).join("");
  const topicRows = topicItems.flatMap((t) => t.clusters.map((c) => `<tr data-ledger-row="topic">
    <td class="title">${esc(t.title)}<br><span class="muted">${esc(c.quote)}</span></td>
    <td>${esc(c.name)}</td><td class="metric">${esc(c.share)}</td><td>${esc(c.nick)}</td><td>${t.sources} sources</td><td>Topic Note / Pair Insight</td>
  </tr>`)).join("");
  const prTable = prRows.map((row) => `<tr data-ledger-row="pr">
    <td class="title">${esc(row.author)}<br><span class="muted">${esc(row.caption)}</span></td>
    <td class="metric">${row.likes}</td><td class="metric">${row.comments}</td><td class="metric">${row.reposts}</td><td class="metric">${row.views}</td><td></td>
    ${row.ticks.map((v) => `<td class="criteria-cell">${v ? "✓" : ""}</td>`).join("")}
  </tr>`).join("");
  const body = `
    <section class="bench">
      <header class="top">
        <div class="brandline"><strong class="serif" style="font-size:30px">DLens Proof Bench</strong><span class="tiny">Plugin UI B · table-first</span></div>
        <div class="tabs">${modeButtons("PR Evidence")}<button data-action="collect-route">Collect</button><button>Settings</button></div>
      </header>
      <section class="setup">
        <div><h3>Product contract</h3><p class="muted">ProductContext → ProductSignalAnalysis → evidenceRefs / experimentHint / agentTaskSpec。沒有 cluster dashboard。</p></div>
        <div><h3>Topic contract</h3><p class="muted">Inbox triage → Casebook → Topic Detail → Pair Lens。Pair 只在同一 Topic 內有效。</p></div>
        <div><h3>PR Evidence contract</h3><p class="muted">Campaign first · Collect visible fields · Batch match · CSV primary · facts-first summary。</p></div>
      </section>
      <div class="table-wrap" data-table="proof-bench">
        <table>
          <thead><tr><th>Object / source</th><th>Signal / metric</th><th>Value</th><th>Context</th><th>Trace</th><th>Output</th>${prCriteria.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>
            ${productRows}
            ${topicRows}
            ${prTable}
          </tbody>
        </table>
      </div>
      <footer class="dock">
        <div>
          <div class="tiny" data-match-state>operator dock · 0 hidden actions</div>
          <div class="switch-note">這個版本把三個 mode 的資料都當 proof ledger 處理；PR rows 最強，Product/Topic 仍保留 evidence trace，不靠裝飾卡片。</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button data-action="agent-brief">Agent Brief</button>
          <button data-action="pair-lens">Pair Lens</button>
          <button data-action="match-criteria">Match criteria</button>
          <button data-action="csv-preview">Preview CSV</button>
          <button class="primary" data-action="summary">Generate Summary</button>
        </div>
      </footer>
    </section>`;
  return shell({ title: "DLens Plugin UI B - Proof Bench", variant: "proof-bench", css, body, script: commonScript() });
}

function variantC() {
  const css = `
    .folio { width:min(820px, calc(100vw - 26px)); margin: 24px auto 48px; }
    .chrome { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:12px 14px; border:1px solid var(--line-dark); border-radius:24px; background:rgba(255,250,241,.92); box-shadow:0 8px 28px rgba(45,36,25,.10); }
    .sheet { margin-top:14px; background:#fffaf1; border:1px solid var(--line-dark); border-radius:30px; padding:24px; box-shadow:0 10px 30px rgba(45,36,25,.08); }
    .sheet.subtle { background:#f9f1e5; box-shadow:none; }
    .sheet h1 { font:44px/1.02 var(--serif); margin:6px 0 10px; }
    .sheet h2 { font:30px/1.08 var(--serif); margin:0 0 10px; }
    .steps { display:grid; grid-template-columns: repeat(5, 1fr); gap:8px; margin-top:18px; }
    .step { border-top:4px solid var(--line-dark); padding-top:8px; min-height:58px; }
    .step.done { border-color:var(--olive); }
    .step.live { border-color:var(--coral); }
    .objects { display:grid; gap:10px; }
    .object-row { display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:start; padding:12px 0; border-top:1px solid var(--line); }
    .badge { width:34px;height:34px;border:1px solid var(--line-dark);border-radius:50%;display:grid;place-items:center;font-family:var(--mono);font-size:12px;background:#fff; }
    .evidence { border-left:4px solid var(--blue); padding:10px 0 10px 14px; background:rgba(36,79,122,.045); }
    .pair-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .mini-card { border:1px solid var(--line); border-radius:20px; padding:14px; background:rgba(255,255,255,.48); }
    .actions { display:flex;gap:8px;flex-wrap:wrap;margin-top:16px; }
    @media (max-width:760px) { .steps, .pair-grid { grid-template-columns:1fr; } .chrome { position:static; flex-direction:column; align-items:stretch; } }
  `;
  const productSheet = `
    <section class="sheet" data-sheet="product">
      <div class="tiny">Product mode · Signal → decision → agent brief</div>
      <h1>先問：這條 signal 值不值得理<span class="dot"></span></h1>
      <p class="muted">Product mode 的主角是 ProductSignalAnalysis，不是 Topic cluster。重成本只在明確要求 Agent Brief 或 batch export 時發生。</p>
      <div class="steps">
        <div class="step done"><strong>Settings</strong><br><span class="muted">ProductContext</span></div>
        <div class="step done"><strong>Collect</strong><br><span class="muted">save as Signal</span></div>
        <div class="step live"><strong>Filter</strong><br><span class="muted">verdict/relevance</span></div>
        <div class="step"><strong>Evidence</strong><br><span class="muted">refs e1..eN</span></div>
        <div class="step"><strong>Agent</strong><br><span class="muted">optional prompt</span></div>
      </div>
    </section>
    <section class="sheet subtle">
      <h2>${esc(productSignals[0].title)}</h2>
      <div class="evidence">“${esc(productSignals[0].quote)}” <span class="mono">${esc(productSignals[0].evidenceRefs.join(" · "))}</span></div>
      <p>${esc(productSignals[0].why)}</p>
      <div class="actions"><button data-action="agent-brief" class="primary">Generate single-card Agent Brief</button><button data-action="collect-route">Show save routing</button></div>
    </section>`;
  const topicSheet = `
    <section class="sheet" data-sheet="topic">
      <div class="tiny">Topic mode · Topic first, Cluster second</div>
      <h2>Topic Detail 是 reading workspace，不是 KPI dashboard</h2>
      <div class="objects">
        ${topicItems[0].clusters.map((c, i) => `<div class="object-row"><span class="badge">C${i + 1}</span><div><strong>${esc(c.name)}</strong> <span class="tag olive">${esc(c.nick)}</span><p class="muted">${esc(c.quote)}</p></div><span class="metric">${esc(c.share)}</span></div>`).join("")}
      </div>
      <div class="pair-grid">
        <div class="mini-card"><div class="tiny">Pair slot A</div><strong>活動體驗派</strong><p class="muted">現場可感知 evidence。</p></div>
        <div class="mini-card"><div class="tiny">Pair slot B</div><strong>健康焦慮派</strong><p class="muted">自我管理 narrative。</p></div>
      </div>
      <div class="actions"><button data-action="pair-lens" class="primary">Run Pair Lens</button><button>Save to Pair Insights</button></div>
    </section>`;
  const prSheet = `
    <section class="sheet" data-sheet="pr">
      <div class="tiny">PR Evidence mode · Campaign rows</div>
      <h2>像 PR audit summary，但底層先是 CSV</h2>
      <p class="muted">V1 不估算 EAV，不承諾 coverage，不在 collect 偷跑 AI。用戶手動按 Batch match，再看 CSV preview 和 facts-first summary。</p>
      <div class="objects">
        ${prRows.map((row) => `<div class="object-row"><span class="badge">${row.ticks.filter(Boolean).length}/6</span><div><strong>${esc(row.author)}</strong><p class="muted">${esc(row.caption)}</p></div><span class="metric">${row.views}</span></div>`).join("")}
      </div>
      <div class="actions"><button data-action="match-criteria">Batch match</button><button data-action="csv-preview">Preview CSV</button><button class="primary" data-action="summary">Generate Summary</button><span class="tag gold" data-match-state>not matched</span></div>
    </section>`;
  const body = `
    <main class="folio">
      <nav class="chrome">
        <div><strong class="serif" style="font-size:26px">DLens Folio Workflow</strong><div class="tiny">Plugin UI C · progressive sheets</div></div>
        <div class="tabs">${modeButtons("Product")}</div>
      </nav>
      ${productSheet}
      ${topicSheet}
      ${prSheet}
    </main>`;
  return shell({ title: "DLens Plugin UI C - Folio Workflow", variant: "folio-workflow", css, body, script: commonScript() });
}

const files = [
  ["variant-a-margin-ledger.html", variantA()],
  ["variant-b-proof-bench.html", variantB()],
  ["variant-c-folio-workflow.html", variantC()],
];

for (const [name, html] of files) {
  fs.writeFileSync(path.join(outDir, name), html);
}

fs.writeFileSync(path.join(outDir, "README.md"), `# DLens Open Design Plugin UI Variants

Generated from README/current-state/PR Evidence brief alignment.

- variant-a-margin-ledger.html: 3-column editorial workbench with fixed inspector.
- variant-b-proof-bench.html: table-first operator ledger with bottom action dock.
- variant-c-folio-workflow.html: progressive sheet workflow for plugin-size reading and action.

These are prototype artifacts, not production design specs. Production tokens still live in src/ui/tokens.ts.
`);

console.log(`Wrote ${files.length} variants to ${outDir}`);
