// Fixture facade for tests/pr-evidence-readmodel-boundary.test.ts's family-guard
// proof. Deliberately clean — the violation lives in the nested sibling below,
// not here, so a guard that only reads this file never finds it.
export function FacadeView() {
  return null;
}
