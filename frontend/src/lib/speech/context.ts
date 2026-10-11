import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react"
import { SpeechController, type SpeechErrorCode, type SpeechLang, type SpeechSnapshot, type SpeechStatus } from "./engine"

export const SpeechContext = createContext<SpeechController | null>(null)

/** Fallback for trees rendered without a provider (isolated component tests): behaves as "unsupported". */
let inertController: SpeechController | null = null
function inert(): SpeechController {
  inertController ??= new SpeechController({ synth: null, Utterance: null })
  return inertController
}

export function useSpeechController(): SpeechController {
  return useContext(SpeechContext) ?? inert()
}

export function useSpeechSnapshot(): SpeechSnapshot {
  const c = useSpeechController()
  return useSyncExternalStore(c.subscribe, c.getSnapshot, c.getSnapshot)
}

export type Narration = {
  supported: boolean
  /** This owner's playback state; "idle" whenever another owner holds the engine. */
  status: SpeechStatus
  /** Key of the content this owner is speaking or has paused. */
  activeKey: string | null
  activeLang: SpeechLang | null
  /** Key of this owner's content that last played to the end. */
  finishedKey: string | null
  error: { code: SpeechErrorCode; lang: SpeechLang } | null
  voicesLoaded: boolean
  voiceAvailable: Readonly<Record<SpeechLang, boolean>>
  /** Owner currently holding the engine (may be someone else). */
  engineOwner: string | null
  speak: (key: string, text: string, lang: SpeechLang) => boolean
  pause: () => void
  resume: () => void
  stop: () => void
  clearError: () => void
}

/**
 * Owner-scoped access to the shared narration engine. Starting speech here cancels any other
 * owner's narration; unmounting the component stops this owner's narration.
 */
export function useNarration(owner: string): Narration {
  const c = useSpeechController()
  const snap = useSpeechSnapshot()
  useEffect(() => () => c.stop(owner), [c, owner])

  const speak = useCallback((key: string, text: string, lang: SpeechLang) => c.speak({ owner, key, text, lang }), [c, owner])
  const pause = useCallback(() => c.pause(owner), [c, owner])
  const resume = useCallback(() => c.resume(owner), [c, owner])
  const stop = useCallback(() => c.stop(owner), [c, owner])
  const clearError = useCallback(() => c.clearError(owner), [c, owner])

  const mine = snap.owner === owner
  return useMemo(
    () => ({
      supported: snap.supported,
      status: mine ? snap.status : "idle",
      activeKey: mine ? snap.key : null,
      activeLang: mine ? snap.lang : null,
      finishedKey: snap.finished?.owner === owner ? snap.finished.key : null,
      error: snap.error?.owner === owner ? { code: snap.error.code, lang: snap.error.lang } : null,
      voicesLoaded: snap.voicesLoaded,
      voiceAvailable: snap.voiceAvailable,
      engineOwner: snap.owner,
      speak,
      pause,
      resume,
      stop,
      clearError,
    }),
    [snap, mine, owner, speak, pause, resume, stop, clearError],
  )
}
