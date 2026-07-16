// Fixture violation, deliberately placed two directories below the family's
// sibling root (sibling/nested/) so a facade-only scan misses it, while a
// recursive family scan (readSourceFamily) catches it.
export function badDirectMessage() {
  return sendExtensionMessage({ type: "pr/list-campaigns" });
}
