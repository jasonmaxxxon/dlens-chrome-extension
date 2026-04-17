import type { SelectedClusterDetail } from "../analysis/types.ts";
import type { TechniqueDefinition, TechniqueReadingSnapshot } from "../state/types.ts";

export const TECHNIQUE_READING_STORAGE_KEY = "dlens:v1:technique-readings";

export const STATIC_TECHNIQUE_DEFINITIONS: TechniqueDefinition[] = [
  {
    key: "deflection",
    title: "焦點轉移",
    summary: "可能把討論帶去較安全的旁支話題，而不是直接回應原本的主張。",
    whyItMatters: "這會稀釋原本爭議的焦點，讓讀者更難追住真正的問題。",
    alias: "Deflection"
  },
  {
    key: "fear-framing",
    title: "恐懼框架",
    summary: "可能透過風險、損害或威脅語言，推高讀者對事件的緊張感。",
    whyItMatters: "這類說法容易把判斷重心從證據移向情緒反應。",
    alias: "Fear framing"
  },
  {
    key: "normalization",
    title: "常態化",
    summary: "可能把某種立場說成已經是常識，好像不需要再討論。",
    whyItMatters: "一旦爭議被包裝成理所當然，反對意見就更容易被邊緣化。",
    alias: "Normalization"
  },
  {
    key: "echo",
    title: "回聲放大",
    summary: "這組留言較像在重複同一反應模式，新增論點不多。",
    whyItMatters: "高同質性的回應會營造共識感，但未必代表討論真的變深。",
    alias: "Echo"
  },
  {
    key: "narrative-shift",
    title: "敘事轉向",
    summary: "可能把大家原本在談的事情改寫成另一個更有利的角度。",
    whyItMatters: "當重心被轉走，使用者對事件的理解框架也會跟著變。",
    alias: "Narrative shift"
  }
];

function compactReadingAnchor(detail: SelectedClusterDetail): string {
  const source = detail.audienceEvidence.find((evidence) => evidence.text?.trim())?.text || detail.thesis;
  const value = String(source || "").replace(/\s+/g, " ").trim();
  if (!value) return detail.clusterTitle;
  return value.length > 28 ? `${value.slice(0, 28).trim()}...` : value;
}

function buildTechniqueClusterFit(detail: SelectedClusterDetail, technique: TechniqueDefinition): string {
  const anchor = compactReadingAnchor(detail);

  switch (technique.key) {
    case "deflection":
      return `在這個 cluster，留言把焦點拉到「${anchor}」這種說法，沒有直接回到作者原本的主軸。`;
    case "fear-framing":
      return `在這個 cluster，像「${anchor}」這類表述會把閱讀重心推向風險與不安，而不只是資訊補充。`;
    case "normalization":
      return `在這個 cluster，「${detail.clusterTitle}」被講得像順理成章的反應，爭議感被刻意壓低。`;
    case "echo":
      return `在這個 cluster，多則留言圍繞「${anchor}」重複相近表述，新增資訊有限，但共識感很強。`;
    case "narrative-shift":
      return `在這個 cluster，討論被重寫成「${detail.clusterTitle}」這條敘事線，讓讀者用另一個框架理解原帖。`;
    default:
      return `在這個 cluster，「${anchor}」成了理解 ${detail.clusterTitle} 的主要切口。`;
  }
}

function triggerStrengthForTechnique(detail: SelectedClusterDetail, technique: TechniqueDefinition): number {
  const textPool = [
    detail.clusterTitle,
    detail.thesis,
    ...detail.audienceEvidence.map((evidence) => evidence.text || "")
  ].join(" ").toLowerCase();
  switch (technique.key) {
    case "deflection":
      return /但是|可是|扯到|離題|又在說/.test(textPool) ? 3 : 1;
    case "fear-framing":
      return /危險|風險|可怕|擔心|焦慮|害怕/.test(textPool) ? 3 : 1;
    case "normalization":
      return /本來就|很正常|當然|一直都是|有什麼好/.test(textPool) ? 3 : 1;
    case "echo":
      return detail.audienceEvidence.length >= 2 ? 2 : 1;
    case "narrative-shift":
      return /其實|重點是|不是.*而是|代表|等於/.test(textPool) ? 3 : 1;
    default:
      return 1;
  }
}

function specificityForTechnique(detail: SelectedClusterDetail, technique: TechniqueDefinition): number {
  const fit = buildTechniqueClusterFit(detail, technique);
  if (fit.includes("這種說法") || fit.includes("這類表述")) {
    return 2;
  }
  if (fit.includes(detail.clusterTitle) || fit.includes("「")) {
    return 3;
  }
  return 1;
}

const TECHNIQUE_PRIORITY: Record<string, number> = {
  echo: 5,
  deflection: 4,
  "narrative-shift": 3,
  "fear-framing": 2,
  normalization: 1
};

export function buildClusterSpecificTechniqueNotes(
  detail: SelectedClusterDetail,
  techniques: TechniqueDefinition[] = STATIC_TECHNIQUE_DEFINITIONS
): TechniqueDefinition[] {
  return techniques.map((technique) => {
    const clusterFit = buildTechniqueClusterFit(detail, technique);
    const triggerStrength = triggerStrengthForTechnique(detail, technique);
    const specificity = specificityForTechnique(detail, technique);
    return {
      ...technique,
      clusterFit,
      triggerStrength,
      specificity,
      displayScore: triggerStrength * 100 + specificity * 10 + (TECHNIQUE_PRIORITY[technique.key] ?? 0)
    };
  });
}

export function rankTechniqueNotesForDisplay(notes: TechniqueDefinition[]): TechniqueDefinition[] {
  return [...notes].sort((left, right) => (right.displayScore ?? 0) - (left.displayScore ?? 0));
}

interface BuildTechniqueReadingSnapshotArgs {
  sessionId: string;
  itemId: string;
  side: "A" | "B";
  clusterKey: string;
  detail: SelectedClusterDetail;
  techniques?: TechniqueDefinition[];
  now?: string;
}

export function buildTechniqueReadingSnapshot({
  sessionId,
  itemId,
  side,
  clusterKey,
  detail,
  techniques = STATIC_TECHNIQUE_DEFINITIONS,
  now = new Date().toISOString()
}: BuildTechniqueReadingSnapshotArgs): TechniqueReadingSnapshot {
  const derivedTechniques = buildClusterSpecificTechniqueNotes(detail, techniques);

  return {
    id: `${sessionId}:${itemId}:${clusterKey}:${now}`,
    sessionId,
    itemId,
    side,
    clusterKey,
    clusterTitle: detail.clusterTitle,
    thesis: detail.thesis,
    techniques: derivedTechniques.map((technique) => ({ ...technique })),
    evidence: detail.audienceEvidence.map((evidence) => ({
      commentId: evidence.commentId,
      author: evidence.author,
      text: evidence.text,
      likes: evidence.likes ?? null,
      comments: evidence.comments ?? null,
      reposts: evidence.reposts ?? null,
      forwards: evidence.forwards ?? null
    })),
    savedAt: now
  };
}
