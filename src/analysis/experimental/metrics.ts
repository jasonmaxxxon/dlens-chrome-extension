export interface ClusterLikeInput {
  cluster_key: number;
  likes: number;
  size: number;
}

export interface ClusterShareMetric {
  cluster_id: number;
  share: number;
}

export interface LikeShareMetrics {
  cluster_like_share: ClusterShareMetric[];
  cluster_size_share: ClusterShareMetric[];
  dominance_ratio_top1: number;
  gini_like_share: number;
}

function normalizeWord(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9#@']{3,}/g) ?? [];
}

function cjkBigrams(text: string): string[] {
  const chars = [...text].filter((char) => char >= "\u4e00" && char <= "\u9fff");
  const grams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.push(chars[index] + chars[index + 1]);
  }
  return grams;
}

function hasCjk(token: string): boolean {
  return [...token].some((char) => char >= "\u4e00" && char <= "\u9fff");
}

export function extractTopKeywords(
  texts: readonly string[],
  topN = 6,
): string[] {
  const counts = new Map<string, number>();

  for (const text of texts) {
    for (const token of [...normalizeWord(text), ...cjkBigrams(text)]) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => {
      const countDelta = right[1] - left[1];
      if (countDelta !== 0) return countDelta;
      const cjkDelta = Number(hasCjk(right[0])) - Number(hasCjk(left[0]));
      if (cjkDelta !== 0) return cjkDelta;
      return left[0].localeCompare(right[0]);
    })
    .slice(0, Math.max(0, topN))
    .map(([token]) => token);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function gini(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;

  let cumulative = 0;
  let cumulativeSum = 0;
  for (const value of sorted) {
    cumulative += value;
    cumulativeSum += cumulative;
  }
  return round((sorted.length + 1 - 2 * (cumulativeSum / cumulative)) / sorted.length);
}

export function computeLikeShareMetrics(
  inputs: readonly ClusterLikeInput[],
): LikeShareMetrics {
  const totalLikes = inputs.reduce((sum, item) => sum + Math.max(0, item.likes), 0);
  const totalSize = inputs.reduce((sum, item) => sum + Math.max(0, item.size), 0);

  const cluster_like_share = inputs
    .map((item) => ({
      cluster_id: item.cluster_key,
      share: totalLikes > 0 ? round(Math.max(0, item.likes) / totalLikes) : 0,
    }))
    .sort((left, right) => right.share - left.share || left.cluster_id - right.cluster_id);

  const cluster_size_share = inputs
    .map((item) => ({
      cluster_id: item.cluster_key,
      share: totalSize > 0 ? round(Math.max(0, item.size) / totalSize) : 0,
    }))
    .sort((left, right) => right.share - left.share || left.cluster_id - right.cluster_id);

  return {
    cluster_like_share,
    cluster_size_share,
    dominance_ratio_top1: cluster_like_share[0]?.share ?? 0,
    gini_like_share: gini(cluster_like_share.map((item) => item.share)),
  };
}
