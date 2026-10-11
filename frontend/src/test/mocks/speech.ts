import { vi } from "vitest"
import { SpeechController } from "@/lib/speech/engine"

/**
 * In-memory SpeechSynthesis for tests. Mirrors browser behaviour that matters to the app:
 * cancel() fires "interrupted" errors on dropped utterances (as Chrome does), voices can load
 * late via "voiceschanged", and utterances finish only when a test says so.
 */
export class FakeUtterance {
  text: string
  lang = ""
  voice: SpeechSynthesisVoice | null = null
  rate = 1
  pitch = 1
  volume = 1
  onstart: ((e: unknown) => void) | null = null
  onend: ((e: unknown) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onpause: ((e: unknown) => void) | null = null
  onresume: ((e: unknown) => void) | null = null
  onboundary: ((e: unknown) => void) | null = null
  onmark: ((e: unknown) => void) | null = null
  constructor(text = "") {
    this.text = text
  }
  addEventListener() {}
  removeEventListener() {}
}

export function fakeVoice(lang: string, name = `Voice ${lang}`, extra: Partial<SpeechSynthesisVoice> = {}): SpeechSynthesisVoice {
  return { lang, name, voiceURI: name, localService: true, default: false, ...extra } as SpeechSynthesisVoice
}

export const DEFAULT_VOICES = [fakeVoice("en-IN", "English (India)"), fakeVoice("en-US", "English (US)"), fakeVoice("hi-IN", "Hindi (India)")]

export class FakeSpeechSynthesis {
  queue: FakeUtterance[] = []
  /** Every utterance ever passed to speak(). */
  spoken: FakeUtterance[] = []
  cancelCount = 0
  paused = false
  voices: SpeechSynthesisVoice[]
  private voiceListeners = new Set<() => void>()

  constructor(voices: SpeechSynthesisVoice[] = DEFAULT_VOICES) {
    this.voices = voices
  }

  get speaking() {
    return this.queue.length > 0
  }
  get pending() {
    return this.queue.length > 1
  }
  /** The utterance being "spoken" right now. */
  get current(): FakeUtterance | null {
    return this.queue[0] ?? null
  }

  speak = vi.fn((u: FakeUtterance) => {
    this.spoken.push(u)
    this.queue.push(u)
    if (this.queue.length === 1) u.onstart?.({})
  })
  cancel = vi.fn(() => {
    this.cancelCount++
    const dropped = this.queue
    this.queue = []
    dropped.forEach((u, i) => u.onerror?.({ error: i === 0 ? "interrupted" : "canceled" }))
  })
  pause = vi.fn(() => {
    this.paused = true
  })
  resume = vi.fn(() => {
    this.paused = false
  })
  getVoices = () => this.voices
  addEventListener = (type: string, l: () => void) => {
    if (type === "voiceschanged") this.voiceListeners.add(l)
  }
  removeEventListener = (type: string, l: () => void) => {
    if (type === "voiceschanged") this.voiceListeners.delete(l)
  }

  // ---- test helpers
  setVoices(v: SpeechSynthesisVoice[]) {
    this.voices = v
    this.voiceListeners.forEach((l) => l())
  }
  /** Finish the current utterance (fires onend; the engine then queues the next segment). */
  finishCurrent() {
    const u = this.queue.shift()
    u?.onend?.({})
    this.queue[0]?.onstart?.({})
  }
  /** Finish utterances until nothing is queued (bounded to avoid infinite loops). */
  finishAll(max = 50) {
    for (let i = 0; i < max && this.queue.length; i++) this.finishCurrent()
  }
  failCurrent(error = "synthesis-failed") {
    const u = this.queue.shift()
    u?.onerror?.({ error })
  }
  /** Text of every utterance spoken after index `from`, joined. */
  textSince(from = 0) {
    return this.spoken
      .slice(from)
      .map((u) => u.text)
      .join(" ")
  }
}

/** Install a fake speech engine as the browser globals; vi.unstubAllGlobals() removes it. */
export function installSpeech(voices?: SpeechSynthesisVoice[]) {
  const synth = new FakeSpeechSynthesis(voices)
  vi.stubGlobal("speechSynthesis", synth)
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance)
  return synth
}

/** A controller bound to a fake engine with no artificial delays. */
export function fakeController(synth = new FakeSpeechSynthesis()) {
  const controller = new SpeechController({
    synth: synth as unknown as SpeechSynthesis,
    Utterance: FakeUtterance as unknown as new (text?: string) => SpeechSynthesisUtterance,
    restartDelayMs: 0,
    voiceWaitMs: 0,
  })
  return { synth, controller }
}
