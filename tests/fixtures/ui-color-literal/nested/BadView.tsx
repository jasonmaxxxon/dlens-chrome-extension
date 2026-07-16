// Fixture for tests/color-literal-guard.test.ts.
// Deliberately hardcodes a color literal one directory below the fixture
// root so a first-level-only `readdirSync` scan misses it, while a
// recursive scan (readSourceTree) catches it.
export function BadView() {
  return <div style={{ color: "#ff0000" }}>bad</div>;
}
