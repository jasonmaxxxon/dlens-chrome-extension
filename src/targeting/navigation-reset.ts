export const HOVER_INTENT_DELAY_MS = 120;

export function createLocationChangeChecker(initialHref: string) {
  let currentHref = initialHref;

  return (nextHref: string, onChange: (href: string) => void): boolean => {
    if (nextHref === currentHref) {
      return false;
    }

    currentHref = nextHref;
    onChange(nextHref);
    return true;
  };
}
