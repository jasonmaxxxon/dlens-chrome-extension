/** Remove a known leading Threads toolbar, preserving phrases inside the post. */
export function stripThreadsTranslationChrome(text: string): string {
  return text.trim().replace(
    /^Translated from (?:Chinese(?: \((?:Simplified|Traditional)\))?|English|Japanese|Korean|Spanish|French|German|Portuguese|Arabic)\s*[·•]?\s*See original\s*/i,
    ""
  );
}
