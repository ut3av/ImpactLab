import { useCallback, useSyncExternalStore } from "react"
import type { UiLanguage } from "@/types/api"

/** Language chosen for the Voice Guide and explanations. Stored in this browser only (no account, no server). */
export const LANGUAGE_KEY = "mira:guide-language"

const listeners = new Set<() => void>()

function read(): UiLanguage | null {
  try {
    const v = localStorage.getItem(LANGUAGE_KEY)
    return v === "en" || v === "hi" ? v : null
  } catch {
    return null
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => e.key === LANGUAGE_KEY && listener()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function setLanguagePreference(lang: UiLanguage) {
  try {
    localStorage.setItem(LANGUAGE_KEY, lang)
  } catch {
    /* storage unavailable (private mode): the choice still applies until reload via listeners */
  }
  for (const l of [...listeners]) l()
}

/**
 * The explicitly chosen language, or null if the clerk has not chosen one yet
 * (callers then use their own default, e.g. the language of the question).
 */
export function useLanguagePreference(): [UiLanguage | null, (lang: UiLanguage) => void] {
  const value = useSyncExternalStore(subscribe, read, () => null)
  const set = useCallback((lang: UiLanguage) => setLanguagePreference(lang), [])
  return [value, set]
}
