import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppRoutes } from "@/App"
import { disclosuresFor, displayedSections, fallbackReason, HINDI_DISCLOSURE, isTransient, narrationText } from "@/features/explain/copy"
import { buildExplainRequest, explainCacheKey, focusFromSelection, pickInputs, recordIdentity } from "@/features/explain/payload"
import { explanationCache } from "@/features/explain/useExplanation"
import { RegulationInspector } from "@/features/inspector/RegulationInspector"
import { LANGUAGE_KEY } from "@/lib/language"
import { fromAnswer, fromEvaluation, type InspectionRecord } from "@/lib/record"
import { SpeechController, splitForSpeech, toSpeakable } from "@/lib/speech/engine"
import { AnswerResponseSchema, CalcResultSchema, ExplainResponseSchema, type ExplainRequest, type ExplainResponse } from "@/types/api"
import answerQ1 from "./fixtures/answer-q1.json"
import notFound from "./fixtures/answer-notfound.json"
import calcSite from "./fixtures/calc-site.json"
import health from "./fixtures/health.json"
import { fakeController, FakeSpeechSynthesis, fakeVoice } from "./mocks/speech"

// ---------------------------------------------------------------------- fixtures (shape of POST /api/explain)

const SOURCE = answerQ1.citations[0]
const PASSAGE_START = "Every Residential Building having height up to 12.5 meters"

const aiEn = ExplainResponseSchema.parse({
  language: "en",
  detail: "brief",
  source: "ai",
  model: "gpt-oss-120b",
  fallback_reason: null,
  target: { kind: "result", label: "Front open space for this house", status: "CALCULATION_COMPLETED" },
  summary: "Leave at least 3.6 m open at the front of the plot.",
  sections: [
    // Deliberately out of order, with blank sections: the panel shows canonical order and skips blanks.
    { key: "next_step", text: "Confirm the street width on the site plan." },
    { key: "meaning", text: "The strip between the street and the house must stay open." },
    { key: "why_it_applies", text: "The house is residential and 9 m tall, so the Rule 56(1)(a) table applies." },
    { key: "evidence", text: "   " },
    { key: "calculation", text: "A 10 m street falls in the row for streets more than 9 m and up to 12 m." },
    { key: "building_impact", text: "" },
    { key: "uncertainty", text: "Amendments after 6 March 2025 are not included in the supplied rulebook." },
  ],
  primary_status: "CALCULATION_COMPLETED",
  statuses: ["CALCULATION_COMPLETED", "VERIFIED"],
  citations: [SOURCE],
  warnings: [],
  missing_inputs: [],
  disclosures: ["AI wording. The quoted rule text below is the authority."],
  generated_at: "2026-10-11T08:00:00+00:00",
})

const aiEnDetailed: ExplainResponse = { ...aiEn, detail: "detailed", summary: "In detail: the front open space for this house is at least 3.6 m." }

const basicNotConfigured: ExplainResponse = {
  ...aiEn,
  source: "basic",
  model: null,
  fallback_reason: "not_configured",
  summary: "Basic explanation from the verified data: the front open space is at least 3.6 m.",
  disclosures: [],
}

const basicRateLimited: ExplainResponse = { ...basicNotConfigured, fallback_reason: "rate_limited" }

const notFoundResp = ExplainResponseSchema.parse({
  language: "en",
  detail: "brief",
  source: "basic",
  model: null,
  fallback_reason: "not_found",
  target: { kind: "result", label: "Paying property tax online", status: "NOT_FOUND" },
  summary: "The supplied rules do not cover paying property tax, so there is no rule to explain.",
  sections: [{ key: "next_step", text: "Ask the revenue section about property tax." }],
  primary_status: "NOT_FOUND",
  statuses: ["NOT_FOUND"],
  citations: [],
  warnings: [],
  missing_inputs: [],
  disclosures: [],
  generated_at: "2026-10-11T08:00:00+00:00",
})

const hiResp = ExplainResponseSchema.parse({
  ...aiEn,
  language: "hi",
  target: { kind: "result", label: "इस मकान के सामने का खुला स्थान", status: "CALCULATION_COMPLETED" },
  summary: "प्लॉट के सामने कम से कम 3.6 मीटर खुला स्थान छोड़ना होगा।",
  sections: [
    { key: "meaning", text: "सड़क और मकान के बीच की पट्टी खुली रहनी चाहिए।" },
    { key: "calculation", text: "10 मीटर चौड़ी सड़क 9 से 12 मीटर वाली पंक्ति में आती है।" },
  ],
  disclosures: [],
})

// ---------------------------------------------------------------------- harness

type Reply = { status?: number; body: unknown }
type Handler = (url: string, init?: RequestInit) => Reply | Promise<Reply>

/** fetch stub that honours AbortSignal like the browser does. */
function mockFetch(handler: Handler) {
  const fn = vi.fn(
    (url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal
        const aborted = () => reject(new DOMException("The operation was aborted.", "AbortError"))
        if (signal?.aborted) return aborted()
        signal?.addEventListener("abort", aborted)
        Promise.resolve()
          .then(() => handler(url, init))
          .then((r) => resolve(new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } })), reject)
      }),
  )
  vi.stubGlobal("fetch", fn)
  return fn
}

const defaultExplain = (req: ExplainRequest): Reply => ({ body: req.language === "hi" ? hiResp : req.detail === "detailed" ? aiEnDetailed : aiEn })

function setup(opts: { explain?: (req: ExplainRequest, init?: RequestInit) => Reply | Promise<Reply>; answer?: unknown; speech?: SpeechController } = {}) {
  const fetch = mockFetch((url, init) => {
    if (url.endsWith("/api/health")) return { body: health }
    if (url.endsWith("/api/calculate")) return { body: calcSite }
    if (url.endsWith("/api/explain")) return (opts.explain ?? defaultExplain)(JSON.parse(String(init!.body)), init)
    return { body: opts.answer ?? answerQ1 }
  })
  const speech = opts.speech ?? fakeController().controller
  render(
    <MemoryRouter>
      <AppRoutes speech={speech} />
    </MemoryRouter>,
  )
  return { fetch, user: userEvent.setup() }
}

function explainCalls(fetch: ReturnType<typeof mockFetch>) {
  return fetch.mock.calls.filter(([u]) => String(u).endsWith("/api/explain")).map(([, init]) => ({ raw: String(init!.body), body: JSON.parse(String(init!.body)) as ExplainRequest, init: init! }))
}

const inspector = () => screen.getByRole("complementary", { name: "Regulation inspector" })
const panel = () => screen.getByRole("region", { name: "Explanation" })
const liveRegion = () => inspector().querySelector<HTMLElement>("[data-explain-panel] > [aria-live]")!

async function ask(user: ReturnType<typeof userEvent.setup>, text = "front open space 10 m street 9 m tall house") {
  await user.type(screen.getByLabelText("Question in English or Hindi"), `${text}{Enter}`)
  return within(inspector()).findByRole("button", { name: "Explain with AI: this result" })
}

async function evaluateExample(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Example/ }))
  await user.click(screen.getByRole("button", { name: /Evaluate requirement/ }))
  await within(inspector()).findByText("Rule-to-geometry results")
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

/** What Read Aloud should say, rebuilt from what the panel actually displays (label, summary, section headings and text). */
function narrationFromDom(lang: "en" | "hi") {
  const p = panel()
  const body = p.querySelector<HTMLElement>(`div[lang="${lang}"]`)!
  const pieces = [p.querySelector("h3")!.nextElementSibling!.textContent!, body.querySelector(":scope > p")!.textContent!]
  for (const s of body.querySelectorAll("section")) pieces.push(s.querySelector("h4")!.textContent!, s.querySelector("p")!.textContent!)
  const text = pieces.map((t) => (/[.!?।:;]$/.test(t) ? t : `${t}${lang === "hi" ? "।" : "."}`)).join(" ")
  return splitForSpeech(toSpeakable(text, lang)).join(" ")
}

beforeEach(() => {
  ;(window as unknown as { __wide?: boolean }).__wide = true
  explanationCache.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------- requests

describe("Explain with AI: requests", () => {
  it("sends only identifiers and context for the whole result, never rule text, answer text or statuses", async () => {
    const { fetch, user } = setup()
    await user.click(await ask(user))
    await within(panel()).findByText(aiEn.summary)
    const [call] = explainCalls(fetch)
    expect(Object.keys(call.body).sort()).toEqual(["calc_types", "citation_ids", "detail", "focus", "inputs", "language", "question"])
    expect(call.body).toEqual({
      language: "en",
      detail: "brief",
      question: answerQ1.question,
      inputs: { road_width_m: 10, building_height_m: 9, building_use: "residential" },
      calc_types: ["front_open_space"],
      citation_ids: ["verified:56_1_front", "56#1", "56#19"],
      focus: null,
    })
    expect(call.raw).not.toContain(PASSAGE_START)
    expect(call.raw).not.toContain(answerQ1.answer.text)
    expect(call.raw).not.toMatch(/passage|CALCULATION_COMPLETED|VERIFIED|Deterministic/)
  })

  it("shows a loading state, keeps the inspector usable and ignores repeated clicks", async () => {
    const d = deferred<Reply>()
    const { fetch, user } = setup({ explain: () => d.promise })
    const btn = await ask(user)
    await user.click(btn)
    expect(btn).toHaveTextContent("Explaining…")
    expect(btn).toHaveAttribute("aria-busy", "true")
    expect(btn).toHaveAttribute("aria-disabled", "true")
    expect(btn).toBeEnabled() // aria-disabled only, so focus stays on it
    expect(btn).toHaveFocus()
    expect(liveRegion()).toHaveTextContent("Generating explanation…")
    expect(within(panel()).getByText("Current result")).toBeInTheDocument()
    await user.click(btn)
    await user.click(btn)
    expect(explainCalls(fetch)).toHaveLength(1)
    // The original answer and the rest of the inspector stay in place.
    expect(within(inspector()).getByText(answerQ1.answer.text)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Counter Receipt/ })).toBeEnabled()

    d.resolve({ body: aiEn })
    await within(panel()).findByText(aiEn.summary)
    expect(btn).toHaveTextContent("Explain with AI")
    expect(btn).not.toHaveAttribute("aria-busy")
    expect(liveRegion()).toHaveTextContent("Explanation ready: Front open space for this house")
  })

  it("sends the selected plan-view constraint as focus and scrolls the panel into view without moving focus", async () => {
    const { fetch, user } = setup()
    await evaluateExample(user)
    await user.click(await screen.findByRole("button", { name: "Front open space ≥ 3 m, rule 56(1)(a)" }))
    const insp = within(inspector())
    expect(insp.getByText("Front open space ≥ 3 m — Rule 56(1)(a)")).toBeInTheDocument()
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
    const btn = insp.getByRole("button", { name: "Explain with AI: selected constraint" })
    expect(btn).toHaveTextContent("Explain with AI")
    await user.click(btn)
    await within(panel()).findByText(aiEn.summary)
    const [{ body }] = explainCalls(fetch)
    expect(body.focus).toEqual({ calc_type: "front_open_space", side: "front" })
    expect(body.question).toBeNull()
    expect(body.calc_types).toEqual(["front_open_space", "rear_open_space", "side_open_space"])
    expect(body.citation_ids).toEqual(["verified:56_1_front", "verified:56_2_rear", "verified:56_3_side"])
    expect(body.inputs).toMatchObject({ plot_width_m: 10, road_width_m: 9, storeys: 2, building_use: "residential", building_type: "detached", front_gap_m: 3 })
    const panelEl = inspector().querySelector("[data-explain-panel]")
    const call = scroll.mock.calls.findIndex((_, i) => scroll.mock.contexts[i] === panelEl)
    expect(call).toBeGreaterThanOrEqual(0)
    expect(scroll.mock.calls[call][0]).toMatchObject({ block: "nearest" })
    expect(btn).toHaveFocus()
  })

  it("explains one calculation from its card; a new request aborts the previous one without an error", async () => {
    const first = deferred<Reply>()
    const { fetch, user } = setup({ explain: (req) => (req.focus ? { body: { ...aiEn, target: { kind: "calculation", label: "Rear open space explained", status: "VERIFIED" } } } : first.promise) })
    await evaluateExample(user)
    const insp = within(inspector())
    await user.click(insp.getByRole("button", { name: "Explain with AI: this result" }))
    const calcBtn = insp.getByRole("button", { name: "Explain this calculation: Minimum rear open space" })
    expect(calcBtn).toHaveTextContent("Explain this calculation")
    await user.click(calcBtn)
    await within(panel()).findByText("Rear open space explained")
    const calls = explainCalls(fetch)
    expect(calls).toHaveLength(2)
    expect(calls[0].init.signal!.aborted).toBe(true)
    expect(calls[1].body.focus).toEqual({ calc_type: "rear_open_space" })
    first.resolve({ body: aiEn }) // a late reply to the aborted request is ignored
    await new Promise((r) => setTimeout(r, 20))
    expect(within(panel()).getByText("Rear open space explained")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("caches AI explanations: brief, detailed, brief again makes two requests", async () => {
    const { fetch, user } = setup()
    await user.click(await ask(user))
    await within(panel()).findByText(aiEn.summary)
    await user.click(within(panel()).getByRole("button", { name: "Show more detail" }))
    await within(panel()).findByText(aiEnDetailed.summary)
    expect(explainCalls(fetch).map((c) => c.body.detail)).toEqual(["brief", "detailed"])
    await user.click(within(panel()).getByRole("button", { name: "Show brief explanation" }))
    expect(within(panel()).getByText(aiEn.summary)).toBeInTheDocument() // instant, from the cache
    await user.click(within(panel()).getByRole("button", { name: "Show more detail" }))
    expect(within(panel()).getByText(aiEnDetailed.summary)).toBeInTheDocument()
    expect(explainCalls(fetch)).toHaveLength(2)
  })

  it("closing aborts the request in flight and returns focus to the main button; a new record resets the panel", async () => {
    const d = deferred<Reply>()
    let n = 0
    const { fetch, user } = setup({ explain: () => (++n === 1 ? d.promise : { body: aiEn }) })
    const btn = await ask(user)
    await user.click(btn)
    await user.click(within(panel()).getByRole("button", { name: "Close explanation" }))
    expect(explainCalls(fetch)[0].init.signal!.aborted).toBe(true)
    expect(screen.queryByRole("region", { name: "Explanation" })).toBeNull()
    expect(btn).toHaveFocus()
    expect(screen.queryByRole("alert")).toBeNull()

    await user.click(btn)
    await within(panel()).findByText(aiEn.summary)
    await ask(user, " again")
    await waitFor(() => expect(screen.queryByRole("region", { name: "Explanation" })).toBeNull())
  })
})

// ---------------------------------------------------------------------- responses

describe("Explain with AI: responses", () => {
  it("shows an AI explanation with provenance, canonical non-empty sections, the server status and official source text", async () => {
    const { user } = setup()
    await user.click(await ask(user))
    const p = within(await screen.findByRole("region", { name: "Explanation" }))
    await p.findByText(aiEn.summary)
    expect(p.getByText("Front open space for this house")).toBeInTheDocument()
    expect(p.getByText("AI explanation · gpt-oss-120b")).toBeInTheDocument()
    expect(p.getByText("Generated by AI from the quoted rules. It is not the official text; check it against the source.")).toBeInTheDocument()
    expect(p.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual([
      "Plain-language meaning",
      "Why it applies to these inputs",
      "How the result was obtained",
      "What remains uncertain",
      "What to verify next",
      "Official source text used for this explanation",
    ])
    expect(p.queryByText("What the source establishes")).toBeNull()
    expect(p.queryByText("Effect on the proposed building")).toBeNull()
    expect(panel().querySelector("[data-status=CALCULATION_COMPLETED]")).not.toBeNull()
    expect(p.getByText(aiEn.summary).closest("[lang]")).toHaveAttribute("lang", "en")
    expect(p.getByText("Official source text · English consolidated copy · not translated")).toBeInTheDocument()
    expect(p.getByText("Rule 56(1)(a) · PDF p. 77")).toBeInTheDocument()
    expect(p.getByText(new RegExp(PASSAGE_START)).tagName).toBe("BLOCKQUOTE")
    expect(p.getByText(aiEn.disclosures[0])).toBeInTheDocument()
    expect(p.getByText(/Informational explanation\. Not an official approval or legal opinion/)).toBeInTheDocument()
    expect(p.queryByRole("button", { name: "Try again" })).toBeNull()
    // The original answer and evidence stay visible above and below.
    expect(within(inspector()).getByText("Deterministic summary")).toBeInTheDocument()
    expect(within(inspector()).getByText("Evidence from the supplied rules")).toBeInTheDocument()
  })

  it("labels a basic explanation and explains why AI was not used", async () => {
    const { user } = setup({ explain: () => ({ body: basicNotConfigured }) })
    await user.click(await ask(user))
    const p = within(panel())
    await p.findByText(basicNotConfigured.summary)
    expect(p.getByText("Basic explanation · not live AI")).toBeInTheDocument()
    expect(p.getByText("Live AI is not configured on this server.")).toBeInTheDocument()
    expect(p.queryByText(/^AI explanation/)).toBeNull()
    expect(p.queryByRole("button", { name: "Try again" })).toBeNull() // not transient
  })

  it("offers Try again for a transient fallback and does not cache basic results", async () => {
    let n = 0
    const { fetch, user } = setup({ explain: () => ({ body: ++n === 1 ? basicRateLimited : aiEn }) })
    await user.click(await ask(user))
    const p = within(panel())
    await p.findByText("The AI service is busy (rate limit). Try again in a moment.")
    await user.click(p.getByRole("button", { name: "Try again" }))
    await p.findByText("AI explanation · gpt-oss-120b")
    expect(explainCalls(fetch)).toHaveLength(2)
  })

  it.each([
    ["an HTTP 500", () => ({ status: 500, body: { detail: "Explanation service failed." } }), "Explanation service failed."],
    ["a network error", () => Promise.reject(new TypeError("Failed to fetch")), "Cannot reach the MIRA server."],
  ])("shows %s as an error with Try again, and the retry succeeds", async (_, fail, message) => {
    let n = 0
    const { fetch, user } = setup({ explain: () => (++n === 1 ? fail() : { body: aiEn }) })
    await user.click(await ask(user))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("The explanation could not be generated.")
    expect(alert).toHaveTextContent(message)
    await user.click(within(panel()).getByRole("button", { name: "Try again" }))
    await within(panel()).findByText(aiEn.summary)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(explainCalls(fetch)).toHaveLength(2)
  })

  it("explains a not-found result without quoting any source", async () => {
    const { fetch, user } = setup({ answer: notFound, explain: () => ({ body: notFoundResp }) })
    await user.click(await ask(user, "property tax"))
    const p = within(panel())
    await p.findByText(notFoundResp.summary)
    expect(p.getByText("The supplied rules do not answer this question, so AI was not used.")).toBeInTheDocument()
    expect(p.queryByText("Official source text used for this explanation")).toBeNull()
    expect(p.getByText("No rule passage supports this explanation, so no source text is quoted.")).toBeInTheDocument()
    expect(panel().querySelector("[data-status=NOT_FOUND]")).not.toBeNull()
    expect(p.queryByRole("button", { name: "Try again" })).toBeNull()
    expect(explainCalls(fetch)[0].body).toMatchObject({ question: notFound.question, calc_types: [], citation_ids: [] })
  })

  it("shows server warnings and missing inputs from the response", async () => {
    const withExtras: ExplainResponse = {
      ...aiEn,
      warnings: [{ code: "amend_2026", title: "Later amendment not included", detail: "Rule 2(5)(c) was amended on 28 August 2026; that change is not in the supplied rulebook." }],
      missing_inputs: [{ field: "plot_area_sqm", label: "Plot area (sq m)", reason: "Needed for the rear open space." }],
    }
    const { user } = setup({ explain: () => ({ body: withExtras }) })
    await user.click(await ask(user))
    const p = within(panel())
    await p.findByText("Later amendment not included")
    expect(p.getByText(/amended on 28 August 2026/)).toBeInTheDocument()
    expect(p.getByText("Inputs still needed")).toBeInTheDocument()
    expect(p.getByText("Plot area (sq m)")).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------- language and read aloud

describe("Explain with AI: language and Read Aloud", () => {
  it("reads aloud exactly the displayed explanation and never the citations", async () => {
    const { synth, controller } = fakeController()
    const { user } = setup({ speech: controller })
    await user.click(await ask(user))
    await within(panel()).findByText(aiEn.summary)
    const controls = within(screen.getByRole("group", { name: "Read aloud controls" }))
    expect(synth.speak).not.toHaveBeenCalled() // never auto-speaks
    await user.click(controls.getByRole("button", { name: "Read Aloud" }))
    expect(synth.current?.lang).toBe("en-IN")
    act(() => synth.finishAll())
    const spoken = synth.textSince(0)
    expect(spoken).toBe(narrationFromDom("en"))
    expect(spoken).toBe(splitForSpeech(toSpeakable(narrationText(aiEn), "en")).join(" "))
    expect(spoken).not.toContain("Every Residential Building")
    expect(spoken).not.toContain("What the source establishes")
    expect(controls.getByRole("button", { name: "Replay" })).toBeInTheDocument()
  })

  it("pauses, resumes, replays and stops", async () => {
    const { synth, controller } = fakeController()
    const { user } = setup({ speech: controller })
    await user.click(await ask(user))
    await within(panel()).findByText(aiEn.summary)
    const controls = within(screen.getByRole("group", { name: "Read aloud controls" }))
    const segments = splitForSpeech(toSpeakable(narrationText(aiEn), "en"))
    expect(segments.length).toBeGreaterThan(1)

    await user.click(controls.getByRole("button", { name: "Read Aloud" }))
    act(() => synth.finishCurrent())
    expect(synth.current?.text).toBe(segments[1])
    await user.click(controls.getByRole("button", { name: "Pause" }))
    expect(controller.getSnapshot().status).toBe("paused")
    expect(synth.queue).toHaveLength(0)
    expect(within(panel()).getByText("Narration paused")).toBeInTheDocument()

    await user.click(controls.getByRole("button", { name: "Resume" }))
    expect(controller.getSnapshot().status).toBe("speaking")
    expect(synth.current?.text).toBe(segments[1]) // restarts the interrupted sentence

    await user.click(controls.getByRole("button", { name: "Replay" }))
    expect(synth.current?.text).toBe(segments[0])

    await user.click(controls.getByRole("button", { name: "Stop" }))
    expect(controller.getSnapshot().status).toBe("idle")
    expect(synth.queue).toHaveLength(0)
    expect(controls.getByRole("button", { name: "Stop" })).toHaveAttribute("aria-disabled", "true")
    expect(controls.getByRole("button", { name: "Read Aloud" })).toBeInTheDocument()
  })

  it("switching to Hindi stops the narration, requests again in Hindi and does not auto-speak", async () => {
    const { synth, controller } = fakeController()
    const { fetch, user } = setup({ speech: controller })
    await user.click(await ask(user))
    await within(panel()).findByText(aiEn.summary)
    await user.click(within(screen.getByRole("group", { name: "Read aloud controls" })).getByRole("button", { name: "Read Aloud" }))
    expect(controller.getSnapshot().status).toBe("speaking")
    const cancels = synth.cancel.mock.calls.length
    const speaks = synth.speak.mock.calls.length

    const langs = within(screen.getByRole("group", { name: "Explanation language" }))
    await user.click(langs.getByRole("button", { name: "Hindi (हिन्दी)" }))
    expect(synth.cancel.mock.calls.length).toBeGreaterThan(cancels)
    expect(controller.getSnapshot().status).toBe("idle")
    const p = within(panel())
    await p.findByText(hiResp.summary)
    expect(synth.speak.mock.calls.length).toBe(speaks)
    expect(explainCalls(fetch).at(-1)!.body).toMatchObject({ language: "hi", detail: "brief", focus: null })
    expect(langs.getByRole("button", { name: "Hindi (हिन्दी)" })).toHaveAttribute("aria-pressed", "true")
    expect(langs.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "false")
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe("hi")
    expect(p.getByText(hiResp.summary).closest("[lang]")).toHaveAttribute("lang", "hi")
    expect(p.getByText("सरल भाषा में अर्थ")).toBeInTheDocument()
    expect(p.getByText("परिणाम कैसे निकाला गया")).toBeInTheDocument()
    expect(p.getByText(HINDI_DISCLOSURE)).toBeInTheDocument()
    // The quoted rule text stays the English original.
    expect(p.getByText(new RegExp(PASSAGE_START)).closest("[lang]")).toHaveAttribute("lang", "en")

    await user.click(within(screen.getByRole("group", { name: "Read aloud controls" })).getByRole("button", { name: "Read Aloud" }))
    expect(synth.current?.lang).toBe("hi-IN")
    expect(synth.current?.voice?.name).toBe("Hindi (India)")
    act(() => synth.finishAll())
    expect(synth.textSince(speaks)).toBe(narrationFromDom("hi"))
  })

  it("keeps the text and marks Read Aloud unavailable without speech synthesis", async () => {
    const { user } = setup({ speech: new SpeechController({ synth: null, Utterance: null }) })
    await user.click(await ask(user))
    const p = within(panel())
    await p.findByText(aiEn.summary)
    const read = within(screen.getByRole("group", { name: "Read aloud controls" })).getByRole("button", { name: "Read Aloud" })
    expect(read).toHaveAttribute("aria-disabled", "true")
    expect(p.getByText("Audio is not available in this browser; the explanation remains available as text.")).toBeInTheDocument()
    await user.click(read)
    expect(p.getByText(aiEn.summary)).toBeVisible()
  })

  it("explains how to add a Hindi voice when none is installed", async () => {
    const { synth, controller } = fakeController(new FakeSpeechSynthesis([fakeVoice("en-IN", "English (India)")]))
    localStorage.setItem(LANGUAGE_KEY, "hi")
    const { user } = setup({ speech: controller })
    await user.click(await ask(user))
    const p = within(panel())
    await p.findByText(hiResp.summary)
    const read = within(screen.getByRole("group", { name: "Read aloud controls" })).getByRole("button", { name: "Read Aloud" })
    expect(read).toHaveAttribute("aria-disabled", "true")
    expect(p.getByText(/add a Hindi \(India\) voice/i)).toBeInTheDocument()
    expect(p.getByText(/Microsoft Edge or Google Chrome/)).toBeInTheDocument()
    await user.click(read)
    expect(synth.speak).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------- placement

describe("Explain with AI: placement", () => {
  it("shows a disabled Explain with AI with guidance when there is no result", async () => {
    const { fetch, user } = setup()
    const btn = within(inspector()).getByRole("button", { name: "Explain with AI" })
    expect(btn).toHaveAttribute("aria-disabled", "true")
    const guidance = screen.getByText("Ask a question or evaluate a requirement first. Explain with AI then explains that result in plain language.")
    expect(btn).toHaveAttribute("aria-describedby", guidance.id)
    await user.click(btn)
    expect(explainCalls(fetch)).toHaveLength(0)
    expect(inspector().querySelector('[data-guide="explain"]')).not.toBeNull()
  })

  it("exposes guide anchors on the inspector sections", async () => {
    const { user } = setup()
    await ask(user)
    const insp = inspector()
    for (const a of ["status", "answer", "explain", "calculations", "evidence", "receipt"]) expect(insp.querySelector(`[data-guide="${a}"]`), a).not.toBeNull()
    expect(insp.querySelector('[data-guide="warnings"]')).toBeNull() // only when there are warnings
    expect(insp.querySelector('[data-guide="receipt"]')).toHaveTextContent("Counter Receipt")
  })

  it("notes up front when live AI is not configured, and anchors warnings and missing inputs", () => {
    const base = fromAnswer(AnswerResponseSchema.parse(answerQ1), {})
    const record: InspectionRecord = {
      ...base,
      warnings: [{ code: "w", title: "Later amendment", detail: "Not in the supplied rulebook." }],
      missing: [{ field: "plot_area_sqm", label: "Plot area", reason: "Needed." }],
    }
    const props = { record, selected: null, onSelect: () => {}, onReceipt: () => {}, error: null, loading: false }
    const { rerender, container } = render(<RegulationInspector {...props} aiConfigured={false} />)
    const note = screen.getByText("Live AI is not configured on this server; a basic explanation from the verified data is shown.")
    expect(screen.getByRole("button", { name: "Explain with AI: this result" })).toHaveAttribute("aria-describedby", note.id)
    expect(container.querySelector('[data-guide="warnings"]')).not.toBeNull()
    expect(container.querySelector('[data-guide="missing"]')).not.toBeNull()
    rerender(<RegulationInspector {...props} aiConfigured />)
    expect(screen.queryByText(/Live AI is not configured on this server; a basic/)).toBeNull()
  })
})

// ---------------------------------------------------------------------- pure helpers

describe("explain payload helpers", () => {
  it("maps inspector selections to a focus only for valid pairs", () => {
    expect(focusFromSelection("front_open_space:front")).toEqual({ calc_type: "front_open_space", side: "front" })
    expect(focusFromSelection("rear_open_space:rear")).toEqual({ calc_type: "rear_open_space", side: "rear" })
    expect(focusFromSelection("side_open_space:left")).toEqual({ calc_type: "side_open_space", side: "left" })
    expect(focusFromSelection("side_open_space:right")).toEqual({ calc_type: "side_open_space", side: "right" })
    expect(focusFromSelection("building")).toEqual({ element: "building" })
    expect(focusFromSelection("plot")).toEqual({ element: "plot" })
    expect(focusFromSelection("road")).toEqual({ element: "road" })
    for (const bad of ["front_open_space:rear", "side_open_space:front", "site_open_spaces:front", "front_open_space", "front_open_space:front:x", "bogus:front", "", null, undefined, "tree"]) {
      expect(focusFromSelection(bad)).toBeNull()
    }
  })

  it("builds a request from identifiers and typed known inputs only", () => {
    const calcs = CalcResultSchema.array().parse(calcSite)
    const many = Array.from({ length: 10 }, (_, i) => ({ ...calcs[0].citations[0], chunk_id: `56#${i}` }))
    const record: InspectionRecord = {
      ...fromEvaluation("site_open_spaces", [...calcs, { ...calcs[0] }, { ...calcs[0], calc_type: "not_a_calc" }], {}),
      citations: [calcs[0].citations[0], { ...calcs[0].citations[0], chunk_id: null }, { ...calcs[0].citations[0], chunk_id: "<script>" }, calcs[0].citations[0], ...many],
      inputs: { plot_width_m: "10", plot_depth_m: 15, storeys: 2.5, seating_capacity: 40, front_gap_m: 0, building_width_m: 0, building_use: "residential", building_type: "castle", voltage_class: "extra_high", note: "x" },
    }
    const req = buildExplainRequest(record, { calc_type: "side_open_space", side: undefined }, "hi", "detailed")
    expect(req).toEqual({
      language: "hi",
      detail: "detailed",
      question: null,
      inputs: { plot_width_m: 10, plot_depth_m: 15, seating_capacity: 40, front_gap_m: 0, building_use: "residential", voltage_class: "extra_high" },
      calc_types: ["front_open_space", "rear_open_space", "side_open_space"],
      citation_ids: ["verified:56_1_front", "56#0", "56#1", "56#2", "56#3", "56#4", "56#5", "56#6"],
      focus: { calc_type: "side_open_space" },
    })
    expect(JSON.stringify(req)).not.toMatch(/passage|VERIFIED/)
    const answer = buildExplainRequest(fromAnswer(AnswerResponseSchema.parse(answerQ1), {}), { element: "road" }, "en", "brief")
    expect(answer.question).toBe(answerQ1.question)
    expect(answer.focus).toEqual({ element: "road" })
  })

  it("identifies a record by generatedAt and question, and by object so a same-second re-ask still resets", () => {
    const r = fromAnswer(AnswerResponseSchema.parse(answerQ1), {})
    expect(recordIdentity(null)).toBeNull()
    expect(recordIdentity(r)).toBe(recordIdentity(r))
    expect(recordIdentity(r)).toContain(`${r.generatedAt}|${r.question}|`)
    expect(recordIdentity({ ...r })).not.toBe(recordIdentity(r))
  })

  it("keeps only valid, typed inputs", () => {
    expect(pickInputs({ road_width_m: " 9 ", storeys: "3", left_gap_m: -1, plot_area_sqm: "abc", building_use: 5 })).toEqual({ road_width_m: 9, storeys: 3 })
  })

  it("derives a stable cache key regardless of key order", () => {
    const a: ExplainRequest = { language: "en", detail: "brief", question: "q", inputs: { road_width_m: 9, building_use: "residential" }, calc_types: ["front_open_space"], citation_ids: ["56#1"], focus: { calc_type: "front_open_space", side: "front" } }
    const b = { focus: { side: "front", calc_type: "front_open_space" }, citation_ids: ["56#1"], calc_types: ["front_open_space"], inputs: { building_use: "residential", road_width_m: 9 }, question: "q", detail: "brief", language: "en" } as ExplainRequest
    expect(explainCacheKey(a)).toBe(explainCacheKey(b))
    expect(explainCacheKey(a)).not.toBe(explainCacheKey({ ...a, detail: "detailed" }))
    expect(explainCacheKey(a)).not.toBe(explainCacheKey({ ...a, language: "hi" }))
    expect(explainCacheKey(a)).not.toBe(explainCacheKey({ ...a, focus: null }))
  })

  it("narrates label, summary and displayed sections in canonical order, never citations", () => {
    expect(displayedSections(aiEn).map((s) => s.key)).toEqual(["meaning", "why_it_applies", "calculation", "uncertainty", "next_step"])
    const text = narrationText(aiEn)
    expect(text.startsWith("Front open space for this house. Leave at least 3.6 m open")).toBe(true)
    expect(text.indexOf("Plain-language meaning.")).toBeLessThan(text.indexOf("What to verify next."))
    expect(text).not.toContain(PASSAGE_START)
    expect(narrationText(hiResp)).toContain("सरल भाषा में अर्थ।")
  })

  it("maps fallback reasons and adds the Hindi disclosure once", () => {
    expect(fallbackReason("timeout")).toBe("timeout")
    expect(fallbackReason("something_new")).toBe("unavailable")
    expect(fallbackReason("toString")).toBe("unavailable")
    expect(fallbackReason(null)).toBe("unavailable")
    expect(isTransient("rate_limited")).toBe(true)
    expect(isTransient("not_configured")).toBe(false)
    expect(isTransient("not_found")).toBe(false)
    expect(disclosuresFor({ language: "hi", disclosures: [HINDI_DISCLOSURE, "x"] })).toEqual([HINDI_DISCLOSURE, "x"])
    expect(disclosuresFor({ language: "hi", disclosures: [] })).toEqual([HINDI_DISCLOSURE])
    expect(disclosuresFor({ language: "en", disclosures: [] })).toEqual([])
  })

  it("keeps at most 20 AI explanations, evicting the least recently used", () => {
    for (let i = 0; i < 21; i++) explanationCache.set(`k${i}`, aiEn)
    expect(explanationCache.size).toBe(20)
    expect(explanationCache.get("k0")).toBeUndefined()
    expect(explanationCache.get("k20")).toBe(aiEn)
  })
})
