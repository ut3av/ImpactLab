import { useEffect, useState, type ReactNode } from "react"
import { SpeechContext } from "./context"
import { SpeechController } from "./engine"

/** Provides the single narration engine. Speech never starts on its own; only explicit user actions start it. */
export function SpeechProvider({ children, controller }: { children: ReactNode; controller?: SpeechController }) {
  const [c] = useState(() => controller ?? new SpeechController())
  useEffect(() => {
    c.attach()
    return () => c.detach()
  }, [c])
  return <SpeechContext.Provider value={c}>{children}</SpeechContext.Provider>
}
