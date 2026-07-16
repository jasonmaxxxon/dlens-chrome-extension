// Fixture violation, deliberately placed two directories below the family's
// sibling root (sibling/nested/) so a first-level-only or facade-only scan
// misses it, while a recursive family scan (readSourceFamily) catches it.
export function BadScrollView(element: { scrollIntoView: (options: ScrollToOptions) => void }) {
  element.scrollIntoView({ behavior: "smooth" });
}
