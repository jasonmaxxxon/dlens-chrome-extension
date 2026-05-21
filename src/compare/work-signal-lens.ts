export { readItemSynthesisText } from "./synthesis-text.ts";

export interface WorkSignalBucket {
  id: string;
  label: string;
  markers: string[];
  observation: (count: number) => string;
}

export interface WorkSignalRow {
  signalId: string;
  author: string;
  text: string;
  keywords: string[];
}

export interface WorkSignalHit {
  bucket: WorkSignalBucket;
  signalIds: string[];
  markers: string[];
}

export const WORK_SIGNAL_BUCKETS: WorkSignalBucket[] = [
  {
    id: "entry-anxiety",
    label: "新人入職與適應焦慮",
    markers: [
      "初入職",
      "初入職場",
      "入職",
      "新人",
      "試用",
      "試用期",
      "職場",
      "工作",
      "返工",
      "上班",
      "打工",
      "同事",
      "上司",
      "office",
      "社畜"
    ],
    observation: (count) => `${count} 篇圍繞初入職場、試用期或職場適應，焦點是「進入工作制度後如何自處」。`
  },
  {
    id: "quit-escape",
    label: "想辭職與逃離工作",
    markers: [
      "辭職",
      "裸辭",
      "轉工",
      "離職",
      "跳槽",
      "搵工",
      "見工",
      "想走",
      "唔想返工",
      "唔想做",
      "不想做",
      "quit",
      "resign"
    ],
    observation: (count) => `${count} 篇把辭職、轉工或離開現職放在討論中心，這批貼文的主旋律是「留低是否仍然值得」。`
  },
  {
    id: "burnout-pressure",
    label: "工作焦慮與耗竭",
    markers: [
      "焦慮",
      "壓力",
      "內耗",
      "崩潰",
      "倦怠",
      "工作壓力",
      "工作焦慮",
      "工時",
      "加班",
      "burnout",
      "stress",
      "anxiety",
      "難捱",
      "好攰",
      "頂唔住",
      "頂唔順"
    ],
    observation: (count) => `${count} 篇出現壓力、耗竭或不想面對工作的語氣，情緒底色比單純抱怨更接近焦慮。`
  },
  {
    id: "low-effort-coping",
    label: "低投入自保",
    markers: [
      "薪水小偷",
      "扮工",
      "摸魚",
      "扮忙",
      "偷懶",
      "hea",
      "擺爛",
      "躺平",
      "低投入",
      "生存模式"
    ],
    observation: (count) => `${count} 篇用「薪水小偷、扮工、低投入」這類語言，把工作從成就感改寫成自保策略。`
  },
  {
    id: "class-pay",
    label: "人工、階層與身份比較",
    markers: ["人工", "薪水", "基層", "階層", "成功人士", "交稅", "中產", "收入", "加人工", "salary", "pay"],
    observation: (count) => `${count} 篇把工作焦慮連到人工、稅、階層或身份比較，問題不只是工作量，而是位置感。`
  },
  {
    id: "hk-overseas-work",
    label: "香港/海外職場對照",
    markers: [
      "香港職場",
      "香港打工",
      "外國工作",
      "海外職場",
      "移民後",
      "返港工作",
      "英國打工",
      "加拿大打工",
      "外國返工"
    ],
    observation: (count) => `${count} 篇把香港與海外工作處境並置，討論焦點從個人選擇擴到制度與環境差異。`
  },
  {
    id: "business-risk",
    label: "創業與自僱風險",
    markers: ["創業", "生意", "自僱", "老闆", "開店", "經營", "加盟", "特許", "franchise", "咖啡", "茶飲"],
    observation: (count) => `${count} 篇把創業、自僱或開店放進討論，像是打工以外的出口，但同時暴露另一組風險。`
  },
  {
    id: "generational-work",
    label: "世代工作觀",
    markers: ["90後", "00後", "genz", "gen z", "z世代", "年輕人", "80後"],
    observation: (count) => `${count} 篇用世代身份切入工作，讓職場焦慮變成一種代際語言。`
  }
];

const PHRASE_MARKERS = [
  "初入職場",
  "想辭職",
  "真係好想辭職",
  "裸辭",
  "薪水小偷",
  "返工",
  "返份工",
  "上班",
  "工作壓力",
  "工作焦慮",
  "唔想返工",
  "基層",
  "成功人士",
  "人工",
  "交稅",
  "加班",
  "搵工",
  "創業",
  "生意",
  "加盟",
  "特許",
  "咖啡",
  "生存動力"
];

export function normalizeSynthesisText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function markerMatches(haystack: string, marker: string): boolean {
  return haystack.includes(marker.toLowerCase());
}

export function collectWorkSignalHits(rows: WorkSignalRow[]): WorkSignalHit[] {
  return WORK_SIGNAL_BUCKETS.map((bucket) => {
    const signalIds: string[] = [];
    const markers = new Set<string>();
    for (const row of rows) {
      const haystack = normalizeSynthesisText(`${row.text} ${row.keywords.join(" ")}`);
      const matched = bucket.markers.filter((marker) => markerMatches(haystack, marker));
      if (matched.length === 0) continue;
      signalIds.push(row.signalId);
      matched.forEach((marker) => markers.add(marker));
    }
    return { bucket, signalIds, markers: [...markers] };
  })
    .filter((hit) => hit.signalIds.length > 0)
    .sort((left, right) =>
      right.signalIds.length - left.signalIds.length
      || left.bucket.label.localeCompare(right.bucket.label));
}

export function extractRepeatedWorkPhrases(rows: WorkSignalRow[], maxCount: number): Array<{ phrase: string; occurrences: number }> {
  const counts = new Map<string, number>();
  for (const phrase of PHRASE_MARKERS) {
    const lower = phrase.toLowerCase();
    const count = rows.filter((row) => normalizeSynthesisText(row.text).includes(lower)).length;
    if (count > 0) counts.set(phrase, count);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, maxCount)
    .map(([phrase, occurrences]) => ({ phrase, occurrences }));
}

export function buildWorkNarrative(rows: WorkSignalRow[], hits: WorkSignalHit[]): string {
  if (rows.length === 0) return "";
  if (hits.length === 0) {
    return `${rows.length} 篇已分析，但未形成清楚的工作/焦慮/辭職主線；需要更多原文或更完整留言分析。`;
  }
  const quit = hits.find((hit) => hit.bucket.id === "quit-escape")?.signalIds.length ?? 0;
  const pressure = hits.find((hit) => hit.bucket.id === "burnout-pressure")?.signalIds.length ?? 0;
  const entry = hits.find((hit) => hit.bucket.id === "entry-anxiety")?.signalIds.length ?? 0;
  const coping = hits.find((hit) => hit.bucket.id === "low-effort-coping")?.signalIds.length ?? 0;
  const topLabels = hits.slice(0, 3).map((hit) => hit.bucket.label).join("、");
  const emphasis: string[] = [];
  if (quit > 0) emphasis.push(`${quit} 篇談離職/轉工`);
  if (pressure > 0) emphasis.push(`${pressure} 篇呈現壓力或耗竭`);
  if (entry > 0) emphasis.push(`${entry} 篇來自入職/適應情境`);
  if (coping > 0) emphasis.push(`${coping} 篇把低投入當成自保`);
  return emphasis.length > 0
    ? `這批 ${rows.length} 篇不是隨機貼文，主線是「工作如何令人想逃離或降低投入」：${emphasis.join("；")}。`
    : `這批 ${rows.length} 篇集中在 ${topLabels}，共同點是把工作處境轉成可被討論、比較或自嘲的生活壓力。`;
}

export function buildWorkTechniqueLabels(hits: WorkSignalHit[]): string[] {
  const labels: string[] = [];
  if (hits.some((hit) => hit.bucket.id === "low-effort-coping")) labels.push("自嘲式命名：用「薪水小偷」降低職場羞恥感");
  if (hits.some((hit) => hit.bucket.id === "quit-escape")) labels.push("逃離想像：把辭職/轉工作為情緒出口");
  if (hits.some((hit) => hit.bucket.id === "class-pay")) labels.push("身份對照：用人工、基層、交稅標示位置感");
  if (hits.some((hit) => hit.bucket.id === "hk-overseas-work")) labels.push("環境比較：用香港/海外對照放大制度感");
  if (hits.some((hit) => hit.bucket.id === "entry-anxiety")) labels.push("日記框架：用新人視角讓焦慮變得可共感");
  return labels.slice(0, 4);
}
