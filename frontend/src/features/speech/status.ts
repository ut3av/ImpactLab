import type { SpeechStatus } from "@/lib/speech/engine"

/** Human-readable playback state for a polite live region. */
export function playbackStatusText(status: SpeechStatus, lang: "en" | "hi"): string {
  if (lang === "hi") return status === "speaking" ? "आवाज़ चल रही है" : status === "paused" ? "आवाज़ रुकी हुई है" : "आवाज़ बंद है"
  return status === "speaking" ? "Narration playing" : status === "paused" ? "Narration paused" : "Narration stopped"
}
