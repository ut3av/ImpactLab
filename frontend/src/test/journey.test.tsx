import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppRoutes } from "@/App"
import { explanationCache } from "@/features/explain/useExplanation"
import { ExplainResponseSchema, type ExplainRequest } from "@/types/api"
import answerQ1 from "./fixtures/answer-q1.json"
import calcSite from "./fixtures/calc-site.json"
import health from "./fixtures/health.json"
import { fakeController } from "./mocks/speech"

/**
 * The primary clerk journey across both features, in order, with one shared narration engine:
 * open app → start Voice Guide → navigate → ask → inspect rule and evidence → Explain with AI →
 * review → Read Aloud → stop → select a plan constraint → explain it → switch to Hindi → confirm
 * UI text and narration language (guide included).
 */

const DEVANAGARI = /[ऀ-ॿ]/
const SOURCE = answerQ1.citations[0]

const resultEn = ExplainResponseSchema.parse({
  language: "en",
  detail: "brief",
  source: "basic",
  model: null,
  fallback_reason: "not_configured",
  target: { kind: "result", label: answerQ1.question, status: "CALCULATION_COMPLETED" },
  summary: "Minimum front open space: 3.6 m (Rule 56(1)(a), PDF p. 77).",
  sections: [
    { key: "meaning", text: "Rule 56(1)(a) sets the minimum front open space for a residential building up to 12.5 m high." },
    { key: "next_step", text: "Confirm the street width against the applicant's documents." },
  ],
  primary_status: "CALCULATION_COMPLETED",
  statuses: ["CALCULATION_COMPLETED", "VERIFIED"],
  citations: [SOURCE],
  warnings: [],
  missing_inputs: [],
  disclosures: [],
  generated_at: "2026-10-11T08:00:00+00:00",
})

const constraintEn = ExplainResponseSchema.parse({
  ...resultEn,
  target: { kind: "constraint", label: "Front open space ≥ 3 m — Rule 56(1)(a)", status: "VERIFIED", calc_type: "front_open_space", side: "front" },
  summary: "The minimum front open space is 3 m under Rule 56(1)(a); the proposed front gap of 3 m meets this minimum.",
  sections: [{ key: "building_impact", text: "Proposed front gap 3 m against the computed minimum 3 m: meets this minimum (this single check only; not an approval)." }],
})

const constraintHi = ExplainResponseSchema.parse({
  ...constraintEn,
  language: "hi",
  target: { ...constraintEn.target, label: "सामने की खुली जगह ≥ 3 मीटर — नियम 56(1)(a)" },
  summary: "न्यूनतम सामने की खुली जगह 3 मीटर है, नियम 56(1)(a) के अनुसार।",
  sections: [{ key: "building_impact", text: "प्रस्तावित सामने की दूरी 3 मीटर इस न्यूनतम को पूरा करती है (केवल यह एक जांच; यह अनुमोदन नहीं है)।" }],
  disclosures: ["यह हिन्दी व्याख्या है; उद्धृत नियम पाठ मूल अंग्रेज़ी में है और अनूदित नहीं है।"],
})

const RULE_56 = {
  rule: "56",
  title: "Residential Buildings",
  part: "Part IV",
  page_start: 77,
  page_end: 80,
  embedded_in: null,
  document: SOURCE.document,
  passages: [{ chunk_id: "56#0", page: 77, sub_rule: "(1)", text: SOURCE.passage, is_comment: false }],
}

let getUserMedia: ReturnType<typeof vi.fn>

function mockFetch() {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    let body: unknown = answerQ1
    if (url.endsWith("/api/health")) body = health
    else if (url.endsWith("/api/calculate")) body = calcSite
    else if (url.includes("/api/rules/")) body = RULE_56
    else if (url.endsWith("/api/explain")) {
      const req = JSON.parse(String(init!.body)) as ExplainRequest
      body = req.focus ? (req.language === "hi" ? constraintHi : constraintEn) : resultEn
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

const explainBodies = (fetch: ReturnType<typeof mockFetch>) =>
  fetch.mock.calls.filter(([u]) => String(u).endsWith("/api/explain")).map(([, init]) => JSON.parse(String(init!.body)) as ExplainRequest)

beforeEach(() => {
  ;(window as unknown as { __wide?: boolean }).__wide = true
  explanationCache.clear()
  getUserMedia = vi.fn()
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Clerk journey: Voice Guide → question → Explain with AI → Read Aloud → constraint → Hindi", () => {
  it("works end to end with one narration engine and no microphone access", async () => {
    const fetch = mockFetch()
    const { synth, controller } = fakeController()
    const user = userEvent.setup()

    // 1. Open the application. Nothing is spoken on load.
    render(
      <MemoryRouter>
        <AppRoutes speech={controller} />
      </MemoryRouter>,
    )
    await screen.findByText(/106 rules · 13\/13 tables verified/)
    expect(synth.speak).not.toHaveBeenCalled()

    // 2. Start the Voice Guide. Opening is silent; Start Guide narrates step 1 in English.
    await user.click(screen.getByRole("button", { name: "Voice Guide" }))
    let guide = screen.getByRole("dialog", { name: "Voice Guide" })
    expect(synth.speak).not.toHaveBeenCalled()
    await user.click(within(guide).getByRole("button", { name: "Start Guide" }))
    expect(within(guide).getByText("Step 1 of 7")).toBeInTheDocument()
    expect(synth.current?.lang).toBe("en-IN")
    const step1Utterance = synth.current!

    // 3. Navigate. The previous step's narration is cancelled and never resumes.
    await user.click(within(guide).getByRole("button", { name: "Next" }))
    await user.click(within(guide).getByRole("button", { name: "Next" }))
    expect(within(guide).getByText("Step 3 of 7")).toBeInTheDocument()
    expect(synth.cancel).toHaveBeenCalled()
    await waitFor(() => expect(synth.queue).not.toContain(step1Utterance))
    expect(within(guide).getByRole("heading", { level: 3 })).toHaveTextContent(/answer/i)
    await user.click(within(guide).getByRole("button", { name: "Close Guide" }))
    expect(screen.queryByRole("dialog", { name: "Voice Guide" })).toBeNull()
    expect(synth.queue).toHaveLength(0) // closing stops narration immediately

    // 4. Ask a supported regulatory question.
    await user.type(screen.getByLabelText("Question in English or Hindi"), `${answerQ1.question}{Enter}`)
    const insp = screen.getByRole("complementary", { name: "Regulation inspector" })
    await within(insp).findByText("Minimum front open space")
    expect(within(insp).getAllByText("3.6 m").length).toBeGreaterThan(0)

    // 5. Inspect the rule and its source evidence.
    expect(within(insp).getAllByText("PDF p. 77").length).toBeGreaterThan(0)
    await user.click(within(insp).getAllByRole("button", { name: /Open whole rule/ })[0])
    const drawer = await screen.findByRole("dialog", { name: /Rule 56/ })
    await within(drawer).findByText(/Residential Buildings/)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Rule 56/ })).toBeNull())

    // 6. Explain with AI: identifiers only, focus on the whole result.
    await user.click(within(insp).getByRole("button", { name: "Explain with AI: this result" }))
    const explanation = await screen.findByRole("region", { name: "Explanation" })
    await within(explanation).findByText(resultEn.summary)
    const [first] = explainBodies(fetch)
    expect(first).toMatchObject({ question: answerQ1.question, calc_types: ["front_open_space"], focus: null, language: "en", detail: "brief" })
    expect(first.citation_ids).toContain("verified:56_1_front")
    expect(JSON.stringify(first)).not.toContain("Every Residential Building")

    // 7. Review: provenance label, plain-language section, official source text kept alongside.
    expect(within(explanation).getByText(/Basic explanation/)).toBeInTheDocument()
    expect(within(explanation).getByText("Plain-language meaning")).toBeInTheDocument()
    expect(within(explanation).getAllByText(/Official source text/).length).toBeGreaterThan(0)
    expect(within(explanation).getAllByText(/Every Residential Building having height up to 12.5 meters/).length).toBeGreaterThan(0)
    expect(within(insp).getByText(/Deterministic summary/)).toBeInTheDocument() // the original answer stays visible

    // 8. Read the explanation aloud.
    const before = synth.spoken.length
    await user.click(within(explanation).getByRole("button", { name: "Read Aloud" }))
    expect(synth.spoken.length).toBeGreaterThan(before)
    expect(synth.current?.lang).toBe("en-IN")
    // Narration goes sentence by sentence: the target label first, then the summary as displayed.
    for (let i = 0; i < 5 && !synth.textSince(before).includes("3.6 metres"); i++) synth.finishCurrent()
    expect(synth.textSince(before)).toContain("Minimum front open space: 3.6 metres")
    expect(synth.queue.length).toBeGreaterThan(0) // still mid-narration

    // 9. Stop speech.
    const readControls = within(explanation).getByRole("group", { name: "Read aloud controls" })
    await user.click(within(readControls).getByRole("button", { name: "Stop" }))
    expect(synth.queue).toHaveLength(0)
    expect(within(readControls).getByRole("button", { name: /Read Aloud|Replay/ })).toBeInTheDocument()

    // 10. Select a visual constraint in the plan view.
    await user.click(screen.getByRole("button", { name: /Example/ }))
    await user.click(screen.getByRole("button", { name: /Evaluate requirement/ }))
    await within(insp).findByText("Rule-to-geometry results")
    await user.click(await screen.findByRole("button", { name: /Front open space ≥ 3 m, rule 56\(1\)\(a\)/ }))
    expect(within(insp).getByText("Front open space ≥ 3 m — Rule 56(1)(a)")).toBeInTheDocument()

    // 11. Explain the selected constraint.
    await user.click(within(insp).getByRole("button", { name: "Explain with AI: selected constraint" }))
    const constraintPanel = await screen.findByRole("region", { name: "Explanation" })
    await within(constraintPanel).findByText(constraintEn.summary)
    expect(explainBodies(fetch).at(-1)!.focus).toEqual({ calc_type: "front_open_space", side: "front" })

    // 12. Change the language to Hindi: a new request, Hindi text, official source still English.
    const langGroup = within(constraintPanel).getByRole("group", { name: "Explanation language" })
    await user.click(within(langGroup).getByRole("button", { name: /Hindi/ }))
    await within(screen.getByRole("region", { name: "Explanation" })).findByText(constraintHi.summary)
    expect(explainBodies(fetch).at(-1)).toMatchObject({ language: "hi", focus: { calc_type: "front_open_space", side: "front" } })
    expect(within(screen.getByRole("region", { name: "Explanation" })).getAllByText(/Every Residential Building/).length).toBeGreaterThan(0)

    // 13. Narration follows the language: Read Aloud speaks Hindi with a hi-IN voice...
    const hiPanel = screen.getByRole("region", { name: "Explanation" })
    await user.click(within(hiPanel).getByRole("button", { name: "Read Aloud" }))
    expect(synth.current?.lang).toBe("hi-IN")
    expect(DEVANAGARI.test(synth.current!.text)).toBe(true)
    // ...and the guide, opened afterwards, is in Hindi; starting it replaces the explanation narration (no overlap).
    const hiUtterance = synth.current!
    await user.click(screen.getByRole("button", { name: "Voice Guide" }))
    guide = screen.getByRole("dialog")
    expect(DEVANAGARI.test(within(guide).getByRole("heading", { level: 2 }).textContent ?? "")).toBe(true)
    await user.click(within(guide).getByRole("button", { name: "गाइड शुरू करें" }))
    expect(synth.queue).not.toContain(hiUtterance)
    expect(synth.queue).toHaveLength(1)
    expect(synth.current?.lang).toBe("hi-IN")
    expect(within(hiPanel).getByRole("button", { name: /Read Aloud|Replay/ })).toBeInTheDocument() // explanation shows idle again
    await user.keyboard("{Escape}")
    await waitFor(() => expect(synth.queue).toHaveLength(0))

    expect(getUserMedia).not.toHaveBeenCalled()
  }, 30_000)
})
