export type TargetType = "post" | "comment";
export type TargetSurface = "feed" | "post_detail";

export interface EngagementMetrics {
  likes: number | null;
  comments: number | null;
  reposts: number | null;
  forwards: number | null;
  views: number | null;
}

export interface EngagementPresent {
  likes: boolean;
  comments: boolean;
  reposts: boolean;
  forwards: boolean;
  views: boolean;
}

export interface TargetDescriptor {
  target_type: TargetType;
  page_url: string;
  post_url: string;
  author_hint: string;
  text_snippet: string;
  time_token_hint: string;
  dom_anchor: string;
  engagement: EngagementMetrics;
  engagement_present: EngagementPresent;
  captured_at: string;
}

export function inferSurfaceFromUrl(url: string): TargetSurface {
  return /\/post\/[^/?#]+/i.test(url) ? "post_detail" : "feed";
}

export function inferRouteType(url: string): string {
  return inferSurfaceFromUrl(url);
}
