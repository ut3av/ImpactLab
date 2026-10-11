import { afterEach, describe, expect, it, vi } from "vitest"
import { pickVoice, SpeechController, splitForSpeech, toSpeakable } from "@/lib/speech/engine"
import { fakeController, FakeSpeechSynthesis, FakeUtterance, fakeVoice, installSpeech } from "./mocks/speech"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("voice selection", () => {
  it("prefers hi-IN for Hindi and en-IN for English using language metadata", () => {
    const voices = [fakeVoice("en-US", "US"), fakeVoice("en-IN", "India"), fakeVoice("hi_IN", "Hindi underscore"), fakeVoice("fr-FR", "French")]
    expect(pickVoice(voices, "en")?.name).toBe("India")
    expect(pickVoice(voices, "hi")?.name).toBe("Hindi underscore")
  })

  it("falls back to another English region and returns null when no Hindi voice exists", () => {
    const voices = [fakeVoice("en-GB", "UK"), fakeVoice("en-US", "US")]
    expect(pickVoice(voices, "en")?.name).toBe("UK")
    expect(pickVoice(voices, "hi")).toBeNull()
    expect(pickVoice([], "en")).toBeNull()
  })

  it("prefers natural-quality voices within the same language", () => {
    const voices = [fakeVoice("hi-IN", "Basic Hindi"), fakeVoice("hi-IN", "Microsoft Swara Online (Natural)", { localService: false })]
    expect(pickVoice(voices, "hi")?.name).toContain("Natural")
  })
})

describe("text preparation", () => {
  it("makes symbols and units pronounceable without changing meaning", () => {
    expect(toSpeakable("Front open space ≥ 3.6 m (Rule 56, PDF p. 77).", "en")).toBe("Front open space at least 3.6 metres (Rule 56, PDF page 77).")
    expect(toSpeakable("Fee Rs. 2,000 for 150 sq m", "en")).toBe("Fee rupees 2,000 for 150 square metres")
    expect(toSpeakable("शुल्क रु. 2,000 है", "hi")).toBe("शुल्क 2,000 रुपये है")
    expect(toSpeakable("MIRA shows pp. 80–81", "en")).toBe("Meera shows page 80 to 81")
  })

  it("splits at sentence ends but not inside abbreviations or decimals", () => {
    const parts = splitForSpeech("Leave 3.6 m in front. See Rs. 2,000 under M.P. Bhumi Vikas Rules. Done!", 40)
    expect(parts.join(" ")).toBe("Leave 3.6 m in front. See Rs. 2,000 under M.P. Bhumi Vikas Rules. Done!")
    expect(parts.some((p) => p.endsWith("Rs."))).toBe(false)
    expect(parts.some((p) => p.endsWith("M.P."))).toBe(false)
  })

  it("splits Hindi at the danda and bounds very long sentences", () => {
    expect(splitForSpeech("पहला वाक्य है जो काफी लंबा है और इसे अलग रखना चाहिए। दूसरा वाक्य भी काफी लंबा है ताकि जुड़ न सके।", 60)).toHaveLength(2)
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ")
    const parts = splitForSpeech(long, 100)
    expect(parts.every((p) => p.length <= 100)).toBe(true)
    expect(parts.join(" ")).toBe(long)
  })
})

describe("SpeechController", () => {
  it("speaks segments in order and reports finished", () => {
    const { synth, controller } = fakeController()
    controller.speak({ owner: "guide", key: "s1", text: "First sentence is here. Second sentence follows it.", lang: "en" })
    expect(controller.getSnapshot()).toMatchObject({ status: "speaking", owner: "guide", key: "s1" })
    expect(synth.current?.lang).toBe("en-IN")
    synth.finishAll()
    expect(synth.spoken.map((u) => u.text).join(" ")).toBe("First sentence is here. Second sentence follows it.")
    expect(controller.getSnapshot()).toMatchObject({ status: "idle", owner: null, finished: { owner: "guide", key: "s1" } })
  })

  it("never overlaps: a new request cancels the previous one and stale callbacks are ignored", () => {
    const { synth, controller } = fakeController()
    controller.speak({ owner: "guide", key: "step-1", text: "Step one text. More of step one.", lang: "en" })
    const stale = synth.current!
    controller.speak({ owner: "explain", key: "e1", text: "Explanation text.", lang: "en" })
    expect(synth.cancel).toHaveBeenCalled()
    expect(synth.queue).toHaveLength(1)
    expect(synth.current?.text).toBe("Explanation text.")
    // A late onend from the cancelled utterance must not advance or resurrect the old narration.
    stale.onend?.({})
    expect(controller.getSnapshot()).toMatchObject({ status: "speaking", owner: "explain", key: "e1" })
    expect(synth.queue).toHaveLength(1)
  })

  it("pauses at once and resumes from the interrupted sentence", () => {
    const { synth, controller } = fakeController()
    controller.speak({ owner: "guide", key: "k", text: "The first sentence is deliberately long so it stays a separate segment. The second sentence is also long so that it is spoken on its own.", lang: "en" })
    synth.finishCurrent()
    const second = synth.current!.text
    controller.pause("guide")
    expect(controller.getSnapshot().status).toBe("paused")
    expect(synth.queue).toHaveLength(0)
    controller.resume("guide")
    expect(controller.getSnapshot().status).toBe("speaking")
    expect(synth.current?.text).toBe(second)
  })

  it("stop with an owner only stops that owner's narration", () => {
    const { synth, controller } = fakeController()
    controller.speak({ owner: "explain", key: "e", text: "Explanation.", lang: "en" })
    controller.stop("guide")
    expect(controller.getSnapshot().status).toBe("speaking")
    controller.stop("explain")
    expect(controller.getSnapshot()).toMatchObject({ status: "idle", owner: null })
    expect(synth.queue).toHaveLength(0)
  })

  it("refuses Hindi when no Hindi voice is installed and reports it to the requesting owner", () => {
    const { synth, controller } = fakeController(new FakeSpeechSynthesis([fakeVoice("en-US")]))
    expect(controller.speak({ owner: "guide", key: "k", text: "नमस्ते।", lang: "hi" })).toBe(false)
    expect(synth.speak).not.toHaveBeenCalled()
    expect(controller.getSnapshot().error).toEqual({ owner: "guide", code: "no-voice", lang: "hi" })
    expect(controller.getSnapshot().voiceAvailable).toEqual({ en: true, hi: false })
    // English still works.
    expect(controller.speak({ owner: "guide", key: "k2", text: "Hello.", lang: "en" })).toBe(true)
    expect(controller.getSnapshot().error).toBeNull()
  })

  it("handles voices that load asynchronously", () => {
    const synth = new FakeSpeechSynthesis([])
    const { controller } = fakeController(synth)
    controller.attach()
    expect(controller.getSnapshot().voiceAvailable.hi).toBe(false)
    synth.setVoices([fakeVoice("hi-IN", "Hindi")])
    expect(controller.getSnapshot()).toMatchObject({ voicesLoaded: true, voiceAvailable: { hi: true } })
    expect(controller.speak({ owner: "g", key: "k", text: "नमस्ते।", lang: "hi" })).toBe(true)
    expect(synth.current?.voice?.name).toBe("Hindi")
    controller.detach()
  })

  it("reports engine errors and treats outside interruptions as a stop", () => {
    const { synth, controller } = fakeController()
    controller.speak({ owner: "g", key: "k", text: "Hello there.", lang: "en" })
    synth.failCurrent("synthesis-failed")
    expect(controller.getSnapshot()).toMatchObject({ status: "idle", error: { owner: "g", code: "failed" } })
    controller.speak({ owner: "g", key: "k", text: "Hello there.", lang: "en" })
    synth.failCurrent("interrupted")
    expect(controller.getSnapshot()).toMatchObject({ status: "idle", error: null })
  })

  it("is inert and does not throw when SpeechSynthesis is absent", () => {
    const controller = new SpeechController({ synth: null, Utterance: null })
    expect(controller.getSnapshot().supported).toBe(false)
    expect(controller.speak({ owner: "g", key: "k", text: "Hello.", lang: "en" })).toBe(false)
    expect(controller.getSnapshot().error?.code).toBe("unsupported")
    expect(() => {
      controller.pause()
      controller.resume()
      controller.stop()
      controller.attach()
      controller.detach()
    }).not.toThrow()
  })

  it("reads the browser globals and cancels leftover speech when attached", () => {
    const synth = installSpeech()
    const controller = new SpeechController({ restartDelayMs: 0 })
    expect(controller.getSnapshot().supported).toBe(true)
    controller.attach()
    expect(synth.cancel).toHaveBeenCalledTimes(1)
    expect(synth.speak).not.toHaveBeenCalled() // never speaks on its own
    controller.detach()
  })

  it("delays speaking after a cancel (engine workaround) and drops the delayed start if stopped meanwhile", () => {
    vi.useFakeTimers()
    const synth = new FakeSpeechSynthesis()
    const controller = new SpeechController({
      synth: synth as unknown as SpeechSynthesis,
      Utterance: FakeUtterance as unknown as new (text?: string) => SpeechSynthesisUtterance,
      restartDelayMs: 50,
    })
    controller.speak({ owner: "a", key: "1", text: "One.", lang: "en" })
    expect(synth.current?.text).toBe("One.") // first start is synchronous (inside the click)
    controller.speak({ owner: "b", key: "2", text: "Two.", lang: "en" })
    expect(synth.queue).toHaveLength(0)
    vi.advanceTimersByTime(60)
    expect(synth.current?.text).toBe("Two.")

    controller.speak({ owner: "a", key: "3", text: "Three.", lang: "en" })
    controller.stop()
    vi.advanceTimersByTime(100)
    expect(synth.queue).toHaveLength(0)
    expect(synth.spoken.map((u) => u.text)).toEqual(["One.", "Two."])
  })
})
