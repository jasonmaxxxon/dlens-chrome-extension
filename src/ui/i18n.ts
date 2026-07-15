import { createContext, useContext } from "react";

import type { UiLanguage } from "../state/types.ts";

/* ─── UI chrome language ───
 *
 * Scope (2026-07-14): only the shell chrome — mode-header title/deck and the
 * workspace nav rail labels — switches 中/英. Deep view bodies stay 繁中.
 * The provider lives in the popup shell; leaf views read the language through
 * `useUiLang` / `useUiText` so nothing needs prop-drilling. The context default
 * is "zh", so components rendered outside the provider (and existing tests)
 * keep the 繁中 reading.
 */
const LanguageContext = createContext<UiLanguage>("zh");

export const LanguageProvider = LanguageContext.Provider;

export function useUiLang(): UiLanguage {
  return useContext(LanguageContext);
}

/** Returns a picker bound to the current language: `t(繁中, English)`. */
export function useUiText(): (zh: string, en: string) => string {
  const lang = useUiLang();
  return (zh, en) => (lang === "en" ? en : zh);
}
