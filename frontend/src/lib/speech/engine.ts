/**
 * One narration engine for the whole app, built on the browser's Web Speech API (SpeechSynthesis).
 *
 * - Only one narration plays at a time. A new request cancels whatever is playing, for any owner.
 * - Every run gets a generation number; callbacks from cancelled utterances are ignored, so a
 *   stale step or explanation can never continue speaking.
 * - Text is split into sentence-sized segments. This avoids Chrome cutting off long utterances and
 *   lets pause/resume work the same everywhere: pause cancels at once and remembers the segment,
 *   resume restarts that sentence (native pause() is unreliable on Android and some Chrome voices).
 * - No microphone, no recording, no network calls of its own.
 */

export type SpeechLang = "en" | "hi"
export type SpeechStatus = "idle" | "speaking" | "paused"
/** unsupported: no SpeechSynthesis · no-voice: no voice for the language · blocked: browser refused · failed: engine error */
export type SpeechErrorCode = "unsupported" | "no-voice" | "blocked" | "failed"

export type SpeechRequest = { owner: string; key: string; text: string; lang: SpeechLang }

export type SpeechSnapshot = Readonly<{
  supported: boolean
  /** True once the browser has reported its voice list (or stopped waiting for it). */
  voicesLoaded: boolean
  voiceAvailable: Readonly<Record<SpeechLang, boolean>>
  status: SpeechStatus
  /** Owner of the narration that is speaking or paused; null when idle. */
  owner: string | null
  key: string | null
  lang: SpeechLang | null
  /** The last narration that played to its end. */
  finished: Readonly<{ owner: string; key: string }> | null
  error: Readonly<{ owner: string; code: SpeechErrorCode; lang: SpeechLang }> | null
}>

type UtteranceCtor = new (text?: string) => SpeechSynthesisUtterance

export type SpeechEnv = {
  synth?: SpeechSynthesis | null
  Utterance?: UtteranceCtor | null
  /** Delay before speaking after a cancel; works around engines that drop speak() right after cancel(). */
  restartDelayMs?: number
  /** How long to wait for an asynchronously loaded voice list before treating it as final. */
  voiceWaitMs?: number
}

export const LANG_TAGS: Record<SpeechLang, string> = { en: "en-IN", hi: "hi-IN" }
const VOICE_PREFERENCES: Record<SpeechLang, string[]> = {
  hi: ["hi-in", "hi"],
  en: ["en-in", "en-gb", "en-us", "en"],
}
const RATES: Record<SpeechLang, number> = { en: 1, hi: 0.95 }

function normTag(tag: string | undefined): string {
  return (tag ?? "").replace(/_/g, "-").toLowerCase()
}

/** Best installed voice for a language, chosen from language metadata (never a hard-coded voice name). */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: SpeechLang): SpeechSynthesisVoice | null {
  const prefs = VOICE_PREFERENCES[lang]
  let best: SpeechSynthesisVoice | null = null
  let bestScore = -1
  for (const v of voices) {
    const tag = normTag(v.lang)
    const rank = prefs.findIndex((p) => tag === p || (p.length === 2 && tag.startsWith(`${p}-`)))
    if (rank < 0) continue
    // Exact regional match first; then voices that advertise natural/neural quality; then local ones.
    const score = (prefs.length - rank) * 10 + (/natural|neural|online/i.test(v.name) ? 3 : 0) + (v.localService ? 1 : 0) + (v.default ? 0.5 : 0)
    if (score > bestScore) {
      best = v
      bestScore = score
    }
  }
  return best
}

/** Rewrite symbols and abbreviations so engines pronounce them; the words displayed are unchanged in meaning. */
export function toSpeakable(text: string, lang: SpeechLang): string {
  const en = lang === "en"
  let t = text
  t = t.replace(/≥/g, en ? " at least " : " कम से कम ").replace(/≤/g, en ? " at most " : " अधिकतम ")
  t = t.replace(/(\d)\s*–\s*(\d)/g, en ? "$1 to $2" : "$1 से $2")
  t = t.replace(/(\d)\s*(?:sq\.?\s*m|m²)(?![a-z])/gi, en ? "$1 square metres" : "$1 वर्ग मीटर")
  t = t.replace(/(\d)\s*m(?![a-zA-Z²])/g, en ? "$1 metres" : "$1 मीटर")
  t = en
    ? t.replace(/\bRs\.\s*/g, "rupees ")
    : t.replace(/(?:Rs\.|रु\.)\s*([\d,]+(?:\.\d+)?)/g, "$1 रुपये")
  t = t.replace(/\bPDF p\.\s*(\d)/g, en ? "PDF page $1" : "पीडीएफ पृष्ठ $1")
  t = t.replace(/\bpp?\.\s*(\d)/g, en ? "page $1" : "पृष्ठ $1")
  // Brand names in capitals would otherwise be spelled out letter by letter.
  t = t.replace(/\bMIRA\b/g, en ? "Meera" : "मीरा")
  t = t.replace(/\be\.g\.\s*/gi, en ? "for example, " : "जैसे ")
  t = t.replace(/\bi\.e\.\s*/gi, en ? "that is, " : "यानी ")
  t = t.replace(/\s[—–]\s/g, ", ").replace(/[·•|]/g, ", ")
  t = t.replace(/[“”"«»]/g, "")
  return t.replace(/\s+/g, " ").trim()
}

const NO_BREAK_BEFORE = /(?:^|\s)(?:[A-Za-z]|Rs|No|Nos|Dr|Mr|Mrs|Ms|St|vs|etc|sq|M\.P)$/i

/** Split text into sentence-sized segments (at most ~maxLen characters each). */
export function splitForSpeech(text: string, maxLen = 220): string[] {
  const clean = text.replace(/\s+/g, " ").trim()
  if (!clean) return []
  const sentences: string[] = []
  let start = 0
  const re = /[.!?।](?=\s)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(clean))) {
    const end = m.index + 1
    if (clean[m.index] === "." && NO_BREAK_BEFORE.test(clean.slice(start, m.index))) continue
    sentences.push(clean.slice(start, end).trim())
    start = end
  }
  if (start < clean.length) sentences.push(clean.slice(start).trim())

  const pieces: string[] = []
  for (const s of sentences.filter(Boolean)) {
    if (s.length <= maxLen) {
      pieces.push(s)
      continue
    }
    // Long sentence: break at clause punctuation, then at spaces.
    let rest = s
    while (rest.length > maxLen) {
      const window = rest.slice(0, maxLen)
      let cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(": "))
      if (cut < maxLen * 0.4) cut = window.lastIndexOf(" ")
      if (cut <= 0) cut = maxLen
      pieces.push(rest.slice(0, cut + 1).trim())
      rest = rest.slice(cut + 1).trim()
    }
    if (rest) pieces.push(rest)
  }
  // Merge very short neighbours so narration does not stutter.
  const merged: string[] = []
  for (const p of pieces) {
    const prev = merged[merged.length - 1]
    if (prev !== undefined && prev.length + p.length + 1 <= maxLen && (prev.length < 60 || p.length < 40)) merged[merged.length - 1] = `${prev} ${p}`
    else merged.push(p)
  }
  return merged
}

function browserEnv(): { synth: SpeechSynthesis | null; Utterance: UtteranceCtor | null } {
  const g = globalThis as unknown as { speechSynthesis?: SpeechSynthesis; SpeechSynthesisUtterance?: UtteranceCtor }
  try {
    const synth = g.speechSynthesis ?? null
    const Utterance = g.SpeechSynthesisUtterance ?? null
    return synth && Utterance && typeof synth.speak === "function" ? { synth, Utterance } : { synth: null, Utterance: null }
  } catch {
    return { synth: null, Utterance: null }
  }
}

export class SpeechController {
  private readonly synth: SpeechSynthesis | null
  private readonly Utterance: UtteranceCtor | null
  private readonly restartDelayMs: number
  private readonly voiceWaitMs: number
  private readonly listeners = new Set<() => void>()
  private snap: SpeechSnapshot
  private gen = 0
  private current: SpeechRequest | null = null
  private segments: string[] = []
  private index = 0
  private voice: SpeechSynthesisVoice | null = null
  private voices: SpeechSynthesisVoice[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private voiceTimer: ReturnType<typeof setTimeout> | null = null
  /** Chrome drops onend for utterances that get garbage-collected mid-speech; keep a reference. */
  private live: SpeechSynthesisUtterance | null = null
  private attached = false

  constructor(env: SpeechEnv = {}) {
    const auto = env.synth === undefined || env.Utterance === undefined ? browserEnv() : null
    this.synth = env.synth !== undefined ? env.synth : auto!.synth
    this.Utterance = env.Utterance !== undefined ? env.Utterance : auto!.Utterance
    this.restartDelayMs = env.restartDelayMs ?? 60
    this.voiceWaitMs = env.voiceWaitMs ?? 1500
    const supported = !!(this.synth && this.Utterance)
    this.snap = {
      supported,
      voicesLoaded: !supported,
      voiceAvailable: { en: false, hi: false },
      status: "idle",
      owner: null,
      key: null,
      lang: null,
      finished: null,
      error: null,
    }
    this.readVoices()
  }

  // ------------------------------------------------------------------ store
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): SpeechSnapshot => this.snap

  private update(patch: Partial<SpeechSnapshot>) {
    const next = { ...this.snap, ...patch }
    const keys = Object.keys(patch) as (keyof SpeechSnapshot)[]
    if (keys.every((k) => Object.is(next[k], this.snap[k]))) return
    this.snap = next
    for (const l of [...this.listeners]) l()
  }

  // ------------------------------------------------------------------ lifecycle
  /** Start listening for voice-list changes and page exit. Safe to call repeatedly. */
  attach() {
    if (this.attached || !this.synth) return
    this.attached = true
    // Some browsers keep speaking across a reload until told otherwise; never start a page mid-speech.
    this.cancelEngine()
    this.synth.addEventListener?.("voiceschanged", this.onVoicesChanged)
    globalThis.addEventListener?.("pagehide", this.onPageHide)
    if (!this.snap.voicesLoaded) {
      this.voiceTimer = setTimeout(() => this.update({ voicesLoaded: true }), this.voiceWaitMs)
    }
  }

  /** Stop speaking and remove listeners. */
  detach() {
    this.stop()
    if (!this.attached || !this.synth) return
    this.attached = false
    this.synth.removeEventListener?.("voiceschanged", this.onVoicesChanged)
    globalThis.removeEventListener?.("pagehide", this.onPageHide)
    if (this.voiceTimer) clearTimeout(this.voiceTimer)
    this.voiceTimer = null
  }

  private onVoicesChanged = () => {
    this.readVoices()
    this.update({ voicesLoaded: true })
  }

  private onPageHide = () => this.stop()

  private readVoices() {
    if (!this.synth) return
    let list: SpeechSynthesisVoice[] = []
    try {
      list = this.synth.getVoices?.() ?? []
    } catch {
      list = []
    }
    this.voices = list
    this.update({
      voiceAvailable: { en: !!pickVoice(list, "en"), hi: !!pickVoice(list, "hi") },
      ...(list.length > 0 ? { voicesLoaded: true } : {}),
    })
  }

  // ------------------------------------------------------------------ commands
  /** Speak text for an owner, replacing any narration in progress. Returns false if nothing could be spoken. */
  speak(req: SpeechRequest): boolean {
    if (!this.synth || !this.Utterance) {
      this.update({ error: { owner: req.owner, code: "unsupported", lang: req.lang } })
      return false
    }
    this.readVoices()
    const voice = pickVoice(this.voices, req.lang)
    if (!voice && req.lang === "hi" && (this.voices.length > 0 || this.snap.voicesLoaded)) {
      // A Hindi request without a Hindi voice would be silent or garbled; say so instead.
      this.stop()
      this.update({ error: { owner: req.owner, code: "no-voice", lang: req.lang } })
      return false
    }
    const segments = splitForSpeech(toSpeakable(req.text, req.lang))
    if (!segments.length) return false

    const busy = this.current !== null || this.isEngineBusy()
    const gen = ++this.gen
    this.clearTimer()
    if (busy) this.cancelEngine()
    this.current = req
    this.segments = segments
    this.index = 0
    this.voice = voice
    this.update({ status: "speaking", owner: req.owner, key: req.key, lang: req.lang, error: null, finished: null })
    // Speak synchronously when possible so the call stays inside the user's click (needed on iOS Safari).
    if (busy && this.restartDelayMs > 0) this.timer = setTimeout(() => this.speakSegment(gen), this.restartDelayMs)
    else this.speakSegment(gen)
    return true
  }

  pause(owner?: string) {
    if (!this.current || this.snap.status !== "speaking" || (owner !== undefined && this.current.owner !== owner)) return
    this.gen++
    this.clearTimer()
    this.release()
    this.cancelEngine()
    this.update({ status: "paused" })
  }

  resume(owner?: string) {
    if (!this.current || this.snap.status !== "paused" || (owner !== undefined && this.current.owner !== owner)) return
    const gen = ++this.gen
    this.update({ status: "speaking" })
    this.speakSegment(gen)
  }

  /** Stop narration. With an owner, only stops if that owner is the one speaking or paused. */
  stop(owner?: string) {
    if (owner !== undefined && this.current?.owner !== owner) {
      if (this.snap.error?.owner === owner) this.update({ error: null })
      return
    }
    this.gen++
    this.clearTimer()
    if (this.current || this.isEngineBusy()) this.cancelEngine()
    this.current = null
    this.segments = []
    this.index = 0
    this.release()
    this.update({ status: "idle", owner: null, key: null, lang: null })
  }

  clearError(owner: string) {
    if (this.snap.error?.owner === owner) this.update({ error: null })
  }

  // ------------------------------------------------------------------ internals
  private speakSegment(gen: number) {
    this.timer = null
    if (gen !== this.gen || !this.current || !this.synth || !this.Utterance) return
    const req = this.current
    let u: SpeechSynthesisUtterance
    try {
      u = new this.Utterance(this.segments[this.index])
    } catch {
      this.fail(req, "failed")
      return
    }
    u.lang = this.voice?.lang || LANG_TAGS[req.lang]
    if (this.voice) u.voice = this.voice
    u.rate = RATES[req.lang]
    u.onend = () => {
      if (gen !== this.gen) return
      if (this.index + 1 < this.segments.length) {
        this.index += 1
        this.speakSegment(gen)
      } else {
        this.current = null
        this.release()
        this.update({ status: "idle", owner: null, key: null, lang: null, finished: { owner: req.owner, key: req.key } })
      }
    }
    u.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (gen !== this.gen) return
      const code = e?.error
      if (code === "interrupted" || code === "canceled") {
        // Cancelled by something outside this app (another tab, the OS). Not an error for the user.
        this.stop()
        return
      }
      this.fail(req, code === "not-allowed" ? "blocked" : code === "language-unavailable" || code === "voice-unavailable" ? "no-voice" : "failed")
    }
    this.release()
    this.live = u
    try {
      this.synth.speak(u)
    } catch {
      this.fail(req, "failed")
    }
  }

  private fail(req: SpeechRequest, code: SpeechErrorCode) {
    this.stop()
    this.update({ error: { owner: req.owner, code, lang: req.lang } })
  }

  /** Detach the previous utterance's handlers so nothing it fires later can reach this controller. */
  private release() {
    const u = this.live
    this.live = null
    if (u) {
      u.onend = null
      u.onerror = null
    }
  }

  private isEngineBusy(): boolean {
    try {
      return !!(this.synth && (this.synth.speaking || this.synth.pending))
    } catch {
      return false
    }
  }

  private cancelEngine() {
    try {
      this.synth?.cancel()
    } catch {
      /* engine already gone */
    }
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
