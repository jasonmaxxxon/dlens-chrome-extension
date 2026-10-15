export type TargetType = "post" | "comment";
export type TargetSurface = "feed" | "post_detail";

export interface EngagementMetrics {
  likes: number | null;
  comments: number | null;
  reposts: number | null;
  forwards: number | null;
  views: number | null;
  followers?: number | null;
}

export interface EngagementPresent {
  likes: boolean;
  comments: boolean;
  reposts: boolean;
  forwards: boolean;
  views: boolean;
  followers?: boolean;
}

export type EngagementSource = "card" | "page_fallback" | "missing";

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
  /**
   * Audit F1 telemetry: tracks where the engagement numbers came from.
   * - "card": at least one metric resolved from the hovered card's
   *   own SVG/text and no body fallback was used.
   * - "page_fallback": views/followers were inferred from
   *   document.body.innerText because the card itself didn't expose
   *   them. This is the F1 risk class — those numbers may belong to
   *   unrelated profile/recommendation chrome.
   * - "missing": no engagement signals found at all.
   * The field is optional in the contract so older saved descriptors
   * stay valid through MIGRATE.
   */
  engagement_source?: EngagementSource;
  /**
   * Absolute URL of the post's own attachment image (photo, video poster, or
   * link-preview card), or null when the post has none we can trust.
   *
   * Only the URL is stored, never the bytes: a Threads CDN URL costs ~500
   * bytes, while a base64 thumbnail would cost ~13KB per saved record and the
   * whole global state is one JSON blob that is re-serialized on every save.
   *
   * Consequence the UI must handle: these URLs are signed and carry an `oe=`
   * expiry, so a stored URL eventually stops resolving. A saved record with a
   * dead URL is the same render path as a record that never had an image, and
   * as a pre-MIGRATE record where the field is absent. All three must show the
   * no-image state rather than a broken image.
   *
   * Optional in the contract so descriptors built before the v3 storage
   * migration stay valid; the migration stamps an explicit null on them.
   */
  image_url?: string | null;
  captured_at: string;
}

export function inferSurfaceFromUrl(url: string): TargetSurface {
  return /\/post\/[^/?#]+/i.test(url) ? "post_detail" : "feed";
}

export function inferRouteType(url: string): string {
  return inferSurfaceFromUrl(url);
}
