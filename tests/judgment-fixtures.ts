import type { CompareBrief } from "../src/compare/brief.ts";
import type { JudgmentRecommendedState, ProductProfile } from "../src/state/types.ts";

export interface JudgmentFixture {
  label: string;
  productProfile: ProductProfile;
  brief: CompareBrief;
  expectedRelevanceRange: [min: number, max: number];
  expectedRecommendedState: JudgmentRecommendedState;
}

function buildBrief(label: string, relation: string, whyItMatters: string): CompareBrief {
  return {
    source: "fallback",
    headline: `${label} 的留言主線正在分流`,
    relation,
    supportingObservations: [
      {
        text: `${label} 的 A 端把同一事件讀成產品機會`,
        scope: "left",
        evidenceIds: ["e1"]
      },
      {
        text: `${label} 的 B 端把它讀成品牌風險`,
        scope: "right",
        evidenceIds: ["e2"]
      }
    ],
    aReading: "A 端把事件讀成可產品化的痛點",
    bReading: "B 端更像品牌與溝通風險",
    whyItMatters,
    creatorCue: "先看哪邊更像真需求",
    keywords: ["需求訊號", "品牌風險", "產品機會"],
    audienceAlignmentLeft: "Align",
    audienceAlignmentRight: "Mixed",
    confidence: "medium"
  };
}

function buildFixture(
  label: string,
  profile: ProductProfile,
  range: [number, number],
  state: JudgmentRecommendedState
): JudgmentFixture {
  return {
    label,
    productProfile: profile,
    brief: buildBrief(label, "同一個需求被讀成機會與風險兩種方向", `這跟 ${profile.audience} 的工作流直接相關。`),
    expectedRelevanceRange: range,
    expectedRecommendedState: state
  };
}

export const JUDGMENT_FIXTURES: JudgmentFixture[] = [
  buildFixture("high-1", { name: "DLens", category: "creator analysis", audience: "Threads analysts" }, [4, 5], "act"),
  buildFixture("high-2", { name: "DLens", category: "social listening", audience: "research leads" }, [4, 5], "act"),
  buildFixture("high-3", { name: "DLens", category: "insight workflow", audience: "product strategists" }, [4, 5], "act"),
  buildFixture("high-4", { name: "DLens", category: "community intelligence", audience: "brand teams" }, [4, 5], "act"),
  buildFixture("high-5", { name: "DLens", category: "qual research", audience: "UX researchers" }, [4, 5], "act"),
  buildFixture("high-6", { name: "DLens", category: "trend reading", audience: "market analysts" }, [4, 5], "act"),
  buildFixture("mid-1", { name: "Queue", category: "task tracker", audience: "ops managers" }, [2, 3], "watch"),
  buildFixture("mid-2", { name: "Queue", category: "team planning", audience: "project owners" }, [2, 3], "watch"),
  buildFixture("mid-3", { name: "Queue", category: "workflow ops", audience: "general teams" }, [2, 3], "watch"),
  buildFixture("mid-4", { name: "Queue", category: "internal tooling", audience: "operators" }, [2, 3], "watch"),
  buildFixture("mid-5", { name: "Queue", category: "backoffice", audience: "support leads" }, [2, 3], "watch"),
  buildFixture("mid-6", { name: "Queue", category: "team dashboards", audience: "staff teams" }, [2, 3], "watch"),
  buildFixture("low-1", { name: "Kitchen", category: "recipe planner", audience: "home cooks" }, [1, 2], "park"),
  buildFixture("low-2", { name: "Kitchen", category: "meal prep", audience: "families" }, [1, 2], "park"),
  buildFixture("low-3", { name: "Kitchen", category: "food diary", audience: "nutrition hobbyists" }, [1, 2], "park"),
  buildFixture("low-4", { name: "Kitchen", category: "grocery lists", audience: "students" }, [1, 2], "park"),
  buildFixture("low-5", { name: "Kitchen", category: "cooking club", audience: "home bakers" }, [1, 2], "park"),
  buildFixture("low-6", { name: "Kitchen", category: "pantry tracker", audience: "apartment renters" }, [1, 2], "park")
];
