import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppRoutes } from "@/App"
import { GuideHighlight } from "@/features/guide/GuideHighlight"
import { buildContextStep, EXAMPLE_QUESTION, GUIDE_STEPS, HI_ENGLISH_DISCLOSURE, narrationText, type GuideContext, type GuideStep } from "@/features/guide/steps"
import { PlotViewport } from "@/features/plot3d/PlotViewport"
import { buildScene } from "@/lib/geometry"
import { LANGUAGE_KEY } from "@/lib/language"
import { fromAnswer, fromEvaluation } from "@/lib/record"
import { SpeechController, toSpeakable } from "@/lib/speech/engine"
import { STATUS_META } from "@/lib/status"
import { AnswerResponseSchema, CalcResultSchema, type ProjectInputs } from "@/types/api"
import notFound from "./fixtures/answer-notfound.json"
import answerQ1 from "./fixtures/answer-q1.json"
import calcSiteMissing from "./fixtures/calc-site-missing.json"
import calcSite from "./fixtures/calc-site.json"
import health from "./fixtures/health.json"
import { fakeController, FakeSpeechSynthesis, fakeVoice } from "./mocks/speech"

// ---------------------------------------------------------------------- helpers

type Handler = (url: string) => { status?: number; body: unknown }

function mockFetch(handler: Handler) {
  const fn = vi.fn(async (url: string) => {
    const r = handler(url)
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } })
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

const routes: Handler = (url) => {
  if (url.endsWith("/api/health")) return { body: health }
  if (url.endsWith("/api/calculate")) return { body: calcSite }
  return { body: answerQ1 }
}

function renderApp(speech: SpeechController) {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <AppRoutes speech={speech} />
    </MemoryRouter>,
  )
  return user
}

const guideButton = () => screen.getByRole("button", { name: "Voice Guide" })

async function openGuide(user: ReturnType<typeof userEvent.setup>) {
  await user.click(guideButton())
  return screen.getByRole("dialog")
}

const stepTitle = (panel: HTMLElement) => within(panel).getByRole("heading", { level: 3 })
const button = (panel: HTMLElement, name: string) => within(panel).getByRole("button", { name })
const DEVANAGARI = /[ऀ-ॿ]/
const SPOKEN_STEP_1 = toSpeakable("What MIRA does.", "en")

function rect(x: number, y: number, w: number, h: number): DOMRect {
  return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect
}

let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;(window as unknown as { __wide?: boolean }).__wide = true
  mockFetch(routes)
  getUserMedia = vi.fn()
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } })
})

afterEach(() => {
  // No microphone, ever.
  expect(getUserMedia).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------- panel

describe("Voice Guide panel", () => {
  it("opens as a non-modal dialog, moves focus in, and returns focus to the header button on close", async () => {
    const { synth, controller } = fakeController()
    const user = renderApp(controller)
    expect(guideButton()).toHaveAttribute("aria-expanded", "false")
    expect(guideButton()).toHaveAttribute("aria-controls", "voice-guide")

    const panel = await openGuide(user)
    expect(panel).toHaveAttribute("id", "voice-guide")
    expect(panel).toHaveAttribute("aria-modal", "false")
    expect(panel).toHaveAccessibleName("Voice Guide")
    expect(guideButton()).toHaveAttribute("aria-expanded", "true")
    expect(within(panel).getByRole("heading", { level: 2, name: "Voice Guide" })).toHaveFocus()
    // Opening never speaks, and an empty workspace has nothing to explain yet.
    expect(synth.speak).not.toHaveBeenCalled()
    expect(within(panel).queryByRole("button", { name: "Explain current screen" })).toBeNull()

    await user.click(button(panel, "Close Guide"))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(guideButton()).toHaveFocus()

    // The header button toggles it too.
    await user.click(guideButton())
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    await user.click(guideButton())
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("Start Guide shows step 1 and narrates exactly its title and body", async () => {
    const { synth, controller } = fakeController()
    const user = renderApp(controller)
    const panel = await openGuide(user)
    await user.click(button(panel, "Start Guide"))

    expect(stepTitle(panel)).toHaveTextContent("What MIRA does")
    expect(stepTitle(panel)).toHaveFocus()
    expect(within(panel).getByText("Step 1 of 7")).toBeInTheDocument()
    expect(within(panel).getByText("Step 1 of 7: What MIRA does")).toHaveClass("sr-only")
    expect(synth.current?.text).toContain(SPOKEN_STEP_1)
    expect(controller.getSnapshot()).toMatchObject({ status: "speaking", owner: "guide", key: "guide:intro:en" })
    act(() => synth.finishAll())
    expect(synth.textSince()).toContain("It is not a building approval.")
  })

  it("Next and Previous change text and progress, cancelling the previous step's speech", async () => {
    const { synth, controller } = fakeController()
    const user = renderApp(controller)
    const panel = await openGuide(user)
    await user.click(button(panel, "Start Guide"))
    expect(button(panel, "Previous")).toHaveAttribute("aria-disabled", "true")
    const staleEnd = synth.current!.onend
    const cancels = synth.cancel.mock.calls.length

    await user.click(button(panel, "Next"))
    expect(within(panel).getByText("Step 2 of 7")).toBeInTheDocument()
    expect(stepTitle(panel)).toHaveTextContent("Ask a question")
    expect(button(panel, "Next")).toHaveFocus() // focus is never moved on a step change
    expect(within(panel).getByText(EXAMPLE_QUESTION.en)).toBeInTheDocument()
    expect(synth.cancel.mock.calls.length).toBeGreaterThan(cancels)
    expect(synth.queue).toHaveLength(1)
    expect(synth.current?.text).toContain("Ask a question.")
    expect(synth.queue.some((u) => u.text.includes(SPOKEN_STEP_1))).toBe(false)

    // A late callback from step 1 is ignored.
    act(() => staleEnd?.({}))
    expect(controller.getSnapshot()).toMatchObject({ status: "speaking", key: "guide:ask:en" })
    expect(synth.queue).toHaveLength(1)

    await user.click(button(panel, "Previous"))
    expect(within(panel).getByText("Step 1 of 7")).toBeInTheDocument()
    expect(synth.current?.text).toContain(SPOKEN_STEP_1)
  })

  it("Pause, Resume, Replay and Stop drive the engine; Next after Stop stays silent", async () => {
    const { synth, controller } = fakeController()
    const user = renderApp(controller)
    const panel = await openGuide(user)
    await user.click(button(panel, "Start Guide"))
    const controls = within(panel).getByRole("group", { name: "Voice playback" })
    const ctl = (name: string) => within(controls).getByRole("button", { name })

    await user.click(ctl("Pause Voice"))
    expect(controller.getSnapshot().status).toBe("paused")
    expect(synth.queue).toHaveLength(0)
    expect(within(panel).getByText("Narration paused")).toBeInTheDocument()

    await user.click(ctl("Resume Voice"))
    expect(controller.getSnapshot().status).toBe("speaking")
    act(() => synth.finishCurrent())
    expect(synth.current?.text).not.toContain(SPOKEN_STEP_1)

    await user.click(ctl("Replay"))
    expect(synth.current?.text).toContain(SPOKEN_STEP_1)

    await user.click(ctl("Stop Voice"))
    expect(controller.getSnapshot()).toMatchObject({ status: "idle", owner: null })
    expect(synth.queue).toHaveLength(0)
    expect(ctl("Stop Voice")).toHaveAttribute("aria-disabled", "true")
    expect(within(panel).getByText("Narration stopped")).toBeInTheDocument()

    const spoken = synth.spoken.length
    await user.click(button(panel, "Next"))
    expect(synth.spoken).toHaveLength(spoken)
    expect(controller.getSnapshot().status).toBe("idle")

    await user.click(ctl("Play Voice"))
    expect(controller.getSnapshot()).toMatchObject({ status: "speaking", key: "guide:ask:en" })
    act(() => synth.finishAll())
    expect(controller.getSnapshot().finished).toEqual({ owner: "guide", key: "guide:ask:en" })
    expect(ctl("Replay")).toBeInTheDocument()
  })

  it("stops auto-narrating when another narration takes over the engine", async () => {
    const { synth, controller } = fakeController()
    const user = renderApp(controller)
    const panel = await openGuide(user)
    await user.click(button(panel, "Start Guide"))
    act(() => {
      controller.speak({ owner: "explain", key: "e1", text: "An explanation is being read.", lang: "en" })
    })
    expect(button(panel, "Play Voice")).toBeInTheDocument() // the guide is idle for its own content
    await user.click(button(panel, "Next"))
    expect(controller.getSnapshot()).toMatchObject({ status: "speaking", owner: "explain" })
    expect(synth.current?.text).toBe("An explanation is being read.")
  })

  it("closing stops narration immediately (Close Guide and the header toggle)", async () => {
    const { synth, controller } = fakeController()
    const user = renderApp(controller)
    let panel = await openGuide(user)
    await user.click(button(panel, "Start Guide"))
    expect(controller.getSnapshot().status).toBe("speaking")
    await user.click(button(panel, "Close Guide"))
    expect(controller.getSnapshot()).toMatchObject({ status: "idle", owner: null })
    expect(synth.queue).toHaveLength(0)

    panel = await openGuide(user)
    expect(synth.queue).toHaveLength(0) // reopening does not resume or speak
    await user.click(button(panel, "Start Guide"))
    await user.click(guideButton())
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(controller.getSnapshot().status).toBe("idle")
    expect(synth.queue).toHaveLength(0)
  })

  it("supports arrow keys and Escape only while focus is inside the panel", async () => {
    const { controller } = fakeController()
    const user = renderApp(controller)
    const panel = await openGuide(user)
    await user.click(button(panel, "Start Guide"))

    await user.keyboard("{ArrowRight}")
    expect(within(panel).getByText("Step 2 of 7")).toBeInTheDocument()
    await user.keyboard("{ArrowRight}{ArrowRight}")
    expect(within(panel).getByText("Step 4 of 7")).toBeInTheDocument()
    await user.keyboard("{ArrowLeft}")
    expect(within(panel).getByText("Step 3 of 7")).toBeInTheDocument()
    for (let i = 0; i < 6; i++) await user.keyboard("{ArrowRight}")
    expect(within(panel).getByText("Step 7 of 7")).toBeInTheDocument()
    expect(button(panel, "Next")).toHaveAttribute("aria-disabled", "true")

    // Outside the panel, arrows and Escape belong to the app.
    const question = screen.getByLabelText("Question in English or Hindi")
    await user.click(question)
    await user.keyboard("{ArrowLeft}{Escape}")
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(within(panel).getByText("Step 7 of 7")).toBeInTheDocument()

    act(() => stepTitle(panel).focus())
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(guideButton()).toHaveFocus()
  })

  it("switches to Hindi: Devanagari text, persisted choice and hi-IN narration", async () => {
    const { synth, controller } = fakeController()
    const user = renderApp(controller)
    const panel = await openGuide(user)
    await user.click(button(panel, "Start Guide"))
    expect(synth.current?.lang).toBe("en-IN")

    await user.click(button(panel, "Hindi (हिन्दी)"))
    expect(button(panel, "Hindi (हिन्दी)")).toHaveAttribute("aria-pressed", "true")
    expect(button(panel, "English")).toHaveAttribute("aria-pressed", "false")
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe("hi")
    expect(panel).toHaveAccessibleName("वॉइस गाइड")
    expect(within(panel).getByText(/हिन्दी केवल वॉइस गाइड और व्याख्या पर लागू है/)).toBeInTheDocument()
    expect(within(panel).getByText("चरण 1 / 7")).toBeInTheDocument()
    expect(stepTitle(panel).textContent).toMatch(DEVANAGARI)
    // It was speaking, so the same step is narrated again in Hindi.
    expect(synth.current?.lang).toBe("hi-IN")
    expect(synth.current?.text).toMatch(DEVANAGARI)
    expect(controller.getSnapshot().key).toBe("guide:intro:hi")
    expect(button(panel, "आवाज़ रोकें")).toBeInTheDocument()

    await user.click(button(panel, "अगला"))
    expect(within(panel).getByText(EXAMPLE_QUESTION.hi)).toBeInTheDocument()
    expect(synth.current?.lang).toBe("hi-IN")

    await user.click(button(panel, "English"))
    expect(stepTitle(panel)).toHaveTextContent("Ask a question")
    expect(synth.current?.lang).toBe("en-IN")
  })

  it("explains when no Hindi voice is installed and keeps the Hindi text", async () => {
    const { synth, controller } = fakeController(new FakeSpeechSynthesis([fakeVoice("en-IN", "English (India)")]))
    const user = renderApp(controller)
    const panel = await openGuide(user)
    await user.click(button(panel, "Hindi (हिन्दी)"))
    expect(within(panel).getByText(/इस डिवाइस पर कोई हिन्दी आवाज़ इंस्टॉल नहीं है/)).toBeInTheDocument()

    await user.click(button(panel, "गाइड शुरू करें"))
    expect(stepTitle(panel).textContent).toMatch(DEVANAGARI)
    expect(synth.speak).not.toHaveBeenCalled()
    const play = button(panel, "आवाज़ चलाएँ")
    expect(play).toHaveAttribute("aria-disabled", "true")
    await user.click(play)
    expect(synth.speak).not.toHaveBeenCalled()

    // English narration still works on the same device.
    await user.click(button(panel, "English"))
    expect(within(panel).queryByText(/No Hindi voice is installed/)).toBeNull()
    await user.click(button(panel, "Play Voice"))
    expect(synth.current?.lang).toBe("en-IN")
  })

  it("works fully without SpeechSynthesis and says so", async () => {
    const controller = new SpeechController({ synth: null, Utterance: null })
    const user = renderApp(controller)
    const panel = await openGuide(user)
    expect(within(panel).getByText(/Audio narration is not available in this browser/)).toBeInTheDocument()
    await user.click(button(panel, "Start Guide"))
    expect(stepTitle(panel)).toHaveTextContent("What MIRA does")
    expect(button(panel, "Play Voice")).toHaveAttribute("aria-disabled", "true")
    await user.click(button(panel, "Play Voice"))
    await user.click(button(panel, "Next"))
    expect(within(panel).getByText("Step 2 of 7")).toBeInTheDocument()
    expect(controller.getSnapshot().status).toBe("idle")
  })

  it("explains the current screen from real state and follows a new selection", async () => {
    const { synth, controller } = fakeController()
    const user = renderApp(controller)
    await user.click(screen.getByRole("button", { name: /Example/ }))
    await user.click(screen.getByRole("button", { name: /Evaluate requirement/ }))
    const insp = screen.getByRole("complementary", { name: "Regulation inspector" })
    await within(insp).findByText("Minimum front open space")

    const panel = await openGuide(user)
    await user.click(button(panel, "Explain current screen"))
    expect(within(panel).getByText("Current screen")).toBeInTheDocument()
    expect(stepTitle(panel)).toHaveTextContent("Current result")
    expect(panel).toHaveTextContent(/10 m wide and 15 m deep/)
    expect(panel).toHaveTextContent(/Rule 56\(1\)\(a\), PDF page 77/)
    expect(synth.current?.text).toContain("Current result.")

    // Selecting a zone on the plan changes the explanation; narration follows the new text.
    await user.click(screen.getByRole("button", { name: /Right open space ≥ 1.5 m, rule 56\(3\)/ }))
    expect(stepTitle(panel)).toHaveTextContent("Selected: right side open space")
    expect(panel).toHaveTextContent(/at least 1.5 m, set by Rule 56\(3\), PDF page 78/)
    expect(panel).toHaveTextContent(/below this minimum/)
    expect(synth.current?.text).toContain("Selected: right side open space.")
    expect(controller.getSnapshot().key).toMatch(/^guide:context-[a-z0-9]+:en$/)

    await user.click(button(panel, "Start Guide"))
    expect(within(panel).getByText("Step 1 of 7")).toBeInTheDocument()
  })

  it("keeps the app interactive while the guide is open", async () => {
    const { controller } = fakeController()
    const user = renderApp(controller)
    const panel = await openGuide(user)
    await user.click(button(panel, "Start Guide"))
    const question = screen.getByLabelText("Question in English or Hindi")
    await user.type(question, "rear open space")
    expect(question).toHaveValue("rear open space")
    await user.click(screen.getByRole("button", { name: /Example/ }))
    expect(screen.getByLabelText(/Width \/ frontage/)).toHaveValue("10")
    expect(screen.getByRole("dialog")).toBe(panel)
  })

  it("uses a bottom sheet and tab hints below 1024px", async () => {
    ;(window as unknown as { __wide?: boolean }).__wide = false
    const { controller } = fakeController()
    const user = renderApp(controller)
    const panel = await openGuide(user)
    expect(panel.className).toContain("max-h-[50vh]")
    await user.click(button(panel, "Start Guide"))
    for (let i = 0; i < 3; i++) await user.click(button(panel, "Next"))
    expect(panel).toHaveTextContent(/the plot is in the Plot tab/)
  })

  it("never re-renders the plot for guide state: PlotViewport is memoised", () => {
    expect((PlotViewport as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.memo"))
  })
})

// ---------------------------------------------------------------------- highlight

describe("Guide highlight", () => {
  it("outlines an existing target, keeps the panel clear of it, and skips missing targets", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const g = this.dataset.guide
      if (g === "ask") return rect(100, 60, 400, 90)
      if (g === "inspector") return rect(700, 40, 320, 700)
      return rect(0, 0, 0, 0)
    })
    const { controller } = fakeController()
    const user = renderApp(controller)
    const panel = await openGuide(user)
    await user.click(button(panel, "Start Guide"))
    expect(document.querySelector("[data-guide-highlight]")).toBeNull() // step 1 points at nothing
    // With nothing highlighted the card sits bottom-right, clear of the sticky Evaluate/Example buttons.
    expect(panel.className).toContain("right-4")

    await user.click(button(panel, "Next"))
    await waitFor(() => expect(document.querySelector("[data-guide-highlight]")).not.toBeNull())
    const hl = document.querySelector<HTMLElement>("[data-guide-highlight]")!
    expect(hl).toHaveAttribute("aria-hidden", "true")
    expect(hl.className).toContain("pointer-events-none")
    expect(hl.style.top).toBe("56px")
    expect(hl.style.left).toBe("96px")
    expect(hl.style.width).toBe("408px")
    // The ask box is on the left half, so the panel moves to the bottom-right.
    await waitFor(() => expect(panel.className).toContain("right-4"))

    await user.click(button(panel, "Next"))
    await waitFor(() => expect(document.querySelector<HTMLElement>("[data-guide-highlight]")?.style.left).toBe("696px"))
    await waitFor(() => expect(panel.className).toContain("left-4"))

    // Step 7 without a result has no receipt button to point at.
    for (let i = 0; i < 4; i++) await user.click(button(panel, "Next"))
    expect(within(panel).getByText("Step 7 of 7")).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector("[data-guide-highlight]")).toBeNull())
  })

  it("draws nothing for missing, hidden or zero-size targets and scrolls off-screen targets into view", async () => {
    const hidden = document.createElement("div")
    hidden.dataset.guide = "hidden-one"
    hidden.hidden = true
    document.body.append(hidden)
    const far = document.createElement("div")
    far.dataset.guide = "far"
    document.body.append(far)
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.dataset.guide === "hidden-one") return rect(10, 10, 100, 100)
      if (this.dataset.guide === "far") return rect(10, 2000, 200, 100)
      return rect(0, 0, 0, 0)
    })
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
    const onBox = vi.fn()

    const view = render(<GuideHighlight targets={["does-not-exist", "hidden-one"]} reducedMotion onBox={onBox} />)
    await new Promise((r) => setTimeout(r, 40))
    expect(document.querySelector("[data-guide-highlight]")).toBeNull()
    expect(onBox).toHaveBeenLastCalledWith(null)
    view.unmount()

    render(<GuideHighlight targets={["far"]} reducedMotion />)
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest", behavior: "auto" }))
    expect(document.querySelector("[data-guide-highlight]")).toBeNull()
    hidden.remove()
    far.remove()
  })
})

// ---------------------------------------------------------------------- content

const calcs = calcSite.map((c) => CalcResultSchema.parse(c))
const missingCalcs = calcSiteMissing.map((c) => CalcResultSchema.parse(c))
const INPUTS: ProjectInputs = {
  plot_width_m: 10,
  plot_depth_m: 15,
  road_width_m: 9,
  building_height_m: 7,
  building_use: "residential",
  building_type: "detached",
  building_width_m: 6,
  building_depth_m: 10,
  front_gap_m: 3,
  left_gap_m: 3,
}

function ctxOf(over: Partial<GuideContext> = {}): GuideContext {
  return { record: null, selected: null, scene: buildScene({}, []), aiConfigured: false, wide: true, ...over }
}
const evaluated = (over: Partial<GuideContext> = {}) =>
  ctxOf({ record: fromEvaluation("site_open_spaces", calcs, INPUTS), scene: buildScene(INPUTS, calcs), ...over })
const textOf = (s: GuideStep) => [s.title, ...s.paragraphs, s.example ?? ""].join("\n")

describe("guide steps", () => {
  it("has seven steps in both languages with matching ids and no icon glyphs", () => {
    expect(GUIDE_STEPS).toHaveLength(7)
    for (const ctx of [ctxOf(), evaluated(), evaluated({ wide: false, aiConfigured: true, webgl: false })]) {
      const en = GUIDE_STEPS.map((b) => b(ctx, "en"))
      const hi = GUIDE_STEPS.map((b) => b(ctx, "hi"))
      expect(new Set(en.map((s) => s.id)).size).toBe(7)
      expect(hi.map((s) => s.id)).toEqual(en.map((s) => s.id))
      for (const s of [...en, ...hi]) {
        expect(s.title.length).toBeGreaterThan(3)
        expect(s.paragraphs.length).toBeGreaterThan(0)
        expect(textOf(s)).not.toMatch(/[✓✕✔✖→★●⚠]|\p{Extended_Pictographic}/u)
      }
      for (const s of hi) expect(s.title).toMatch(DEVANAGARI)
    }
  })

  it("introduces MIRA with the rulebook date, supported calculations and the approval disclaimer", () => {
    const t = textOf(GUIDE_STEPS[0](ctxOf(), "en"))
    for (const s of ["M.P. Bhumi Vikas Rules, 2012", "6 March 2025", "108 pages", "Rules 56 and 42", "Rule 21", "Rule 52", "checked against the official PDF", "not a building approval"])
      expect(t).toContain(s)
    expect(textOf(GUIDE_STEPS[0](ctxOf(), "hi"))).toContain("6 मार्च 2025")
  })

  it("step 2 gives the example question and only mentions the AI switch when AI is configured", () => {
    const en = GUIDE_STEPS[1](ctxOf(), "en")
    expect(en.example).toBe(EXAMPLE_QUESTION.en)
    expect(en.highlight).toEqual(["ask"])
    expect(textOf(en)).toContain("without live AI")
    expect(textOf(en)).not.toContain("“AI explanation” switch")
    expect(textOf(GUIDE_STEPS[1](ctxOf({ aiConfigured: true }), "en"))).toContain("“AI explanation” switch")
    expect(GUIDE_STEPS[1](ctxOf(), "hi").example).toBe(EXAMPLE_QUESTION.hi)
    expect(narrationText(en, "en")).toContain(`Try this: ${EXAMPLE_QUESTION.en}`)
    expect(textOf(GUIDE_STEPS[1](ctxOf({ wide: false }), "en"))).toContain("Inputs tab")
  })

  it("context sentences come from state (steps 3 to 7)", () => {
    const ctx = evaluated()
    const r = ctx.record!
    expect(textOf(GUIDE_STEPS[2](ctx, "en"))).toContain(`Right now the status is “${STATUS_META[r.primary].label}”, with 3 cited passages and 3 calculations.`)
    expect(textOf(GUIDE_STEPS[2](ctxOf(), "en"))).toContain("There is no result yet")
    for (const s of ["Verified", "Calculation completed", "Source found", "More information needed", "Not found", "Version review needed"])
      expect(textOf(GUIDE_STEPS[2](ctxOf(), "hi"))).toContain(`“${s}”`)

    const plot = textOf(GUIDE_STEPS[3](ctx, "en"))
    expect(plot).toContain("Right now the plot is 10 m wide and 15 m deep. Open space zones drawn: 4.")
    expect(plot).toContain("Proposed gaps below a computed minimum: 1.")
    expect(textOf(GUIDE_STEPS[3](ctxOf(), "en"))).toContain("No plot is drawn yet")
    expect(textOf(GUIDE_STEPS[3](ctxOf({ webgl: false }), "en"))).toContain("“Plan” view is shown instead")
    expect(textOf(GUIDE_STEPS[3](ctx, "hi"))).toContain("10 मीटर चौड़ा और 15 मीटर गहरा")

    expect(textOf(GUIDE_STEPS[4](ctx, "en"))).toContain("the current result cites “R56(1)(a) · p.77”")
    expect(GUIDE_STEPS[4](ctx, "en").highlight?.[0]).toBe("calculations")

    const warn = textOf(GUIDE_STEPS[5](ctx, "en"))
    for (const s of ["6 March 2025", "28 August 2026", "Rule 2(5)(c)", "500 sq m", "Hindi version prevails", "Rule 4", "property tax"]) expect(warn).toContain(s)
    expect(warn).toContain("no warnings and no missing inputs")
    expect(textOf(GUIDE_STEPS[5](ctx, "hi"))).toContain("28 अगस्त 2026")

    const missingCtx = ctxOf({ record: fromEvaluation("site_open_spaces", missingCalcs, {}), scene: buildScene({}, missingCalcs) })
    expect(textOf(GUIDE_STEPS[5](missingCtx, "en"))).toContain("Missing now: Proposed building height (m); Building use;")
    const hiMissing = textOf(GUIDE_STEPS[5](missingCtx, "hi"))
    expect(hiMissing).toContain("अभी यह जानकारी चाहिए: भवन की ऊँचाई; भवन का उपयोग; भवन का प्रकार।")
    expect(hiMissing).not.toContain(HI_ENGLISH_DISCLOSURE)
    expect(GUIDE_STEPS[5](missingCtx, "en").highlight).toEqual(["missing", "inspector"])

    expect(textOf(GUIDE_STEPS[6](ctx, "en"))).toContain("button is available now")
    expect(GUIDE_STEPS[6](ctx, "en").highlight).toEqual(["receipt", "inspector"])
    expect(textOf(GUIDE_STEPS[6](ctxOf(), "en"))).toContain("There is no result yet")
    expect(GUIDE_STEPS[6](ctxOf(), "en").highlight).toEqual([])
  })
})

describe("buildContextStep", () => {
  it("explains how to begin when nothing is on screen", () => {
    const s = buildContextStep(ctxOf(), "en")
    expect(s.title).toBe("Getting started")
    expect(s.highlight).toEqual(["ask"])
    expect(buildContextStep(ctxOf(), "hi").title).toMatch(DEVANAGARI)
  })

  it("describes a drawn plot without a result", () => {
    const s = buildContextStep(ctxOf({ scene: buildScene(INPUTS, []) }), "en")
    expect(s.title).toBe("Your workspace")
    expect(textOf(s)).toContain("10 m wide and 15 m deep from your inputs, facing a street 9 m wide")
    expect(s.highlight).toEqual(["viewport"])
  })

  it("summarises a result with inputs used, rule, page, value and status (EN and HI)", () => {
    const en = textOf(buildContextStep(evaluated(), "en"))
    expect(en).toContain("Requirement evaluated: All open spaces (front, rear, side).")
    expect(en).toContain("The plot is drawn 10 m wide and 15 m deep, with 4 open space zones. 1 proposed gap is below a computed minimum.")
    expect(en).toContain("Minimum front open space: 3 m. Status: “Verified”. Inputs used: street width 9 m, building use residential, building height 7 m. Rule applied: Rule 56(1)(a), PDF page 77.")
    expect(buildContextStep(evaluated(), "en").highlight?.[0]).toBe("calculations")

    const hi = textOf(buildContextStep(evaluated(), "hi"))
    expect(hi).toContain("मौजूदा परिणाम")
    expect(hi).toContain("10 मीटर चौड़ा और 15 मीटर गहरा")
    expect(hi).toContain("सामने की न्यूनतम खुली जगह: सामने कम से कम 3 मीटर।")
    expect(hi).toContain("सामने की सड़क की चौड़ाई 9 मीटर, भवन का उपयोग आवासीय")
    expect(hi).toContain("नियम 56(1)(a), पीडीएफ पृष्ठ 77")
    expect(hi).not.toContain(HI_ENGLISH_DISCLOSURE)
    expect(hi).not.toMatch(/\bresidential\b|\bMinimum\b/)
  })

  it("prioritises the selected constraint and its single proposed-gap check", () => {
    const s = buildContextStep(evaluated({ selected: "side_open_space:right" }), "en")
    expect(s.title).toBe("Selected: right side open space")
    expect(textOf(s)).toContain("at least 1.5 m, set by Rule 56(3), PDF page 78")
    expect(textOf(s)).toContain("Your proposed gap on this side is 1 m, which is below this minimum, so it is drawn in red.")
    expect(s.highlight?.[0]).toBe("selection")
    const hi = textOf(buildContextStep(evaluated({ selected: "side_open_space:right" }), "hi"))
    expect(hi).toContain("दाईं ओर की खुली जगह")
    expect(hi).toContain("कम से कम 1.5 मीटर")
  })

  it("explains an unresolved edge with the inputs it needs", () => {
    const ctx = ctxOf({ record: fromEvaluation("site_open_spaces", missingCalcs, INPUTS), scene: buildScene(INPUTS, missingCalcs), selected: "front_open_space:front" })
    const en = textOf(buildContextStep(ctx, "en"))
    expect(en).toContain("The front open space cannot be drawn on the plot yet.")
    expect(en).toContain("It needs: Proposed building height (m); Building use.")
    const hi = textOf(buildContextStep(ctx, "hi"))
    expect(hi).toContain("इसके लिए यह जानकारी चाहिए: भवन की ऊँचाई; भवन का उपयोग।")
  })

  it("describes selected user geometry as illustrative", () => {
    const b = textOf(buildContextStep(evaluated({ selected: "building" }), "en"))
    expect(b).toContain("6 m wide and 10 m deep, 7 m high")
    expect(b).toContain("illustrative only")
    expect(textOf(buildContextStep(evaluated({ selected: "road" }), "en"))).toContain("The street facing the plot is 9 m wide")
    expect(textOf(buildContextStep(evaluated({ selected: "plot" }), "en"))).toContain("Width times depth is 150 sq m.")
  })

  it("explains an answer without calculations and discloses English-only text in Hindi", () => {
    const record = fromAnswer(AnswerResponseSchema.parse(notFound), {})
    const en = buildContextStep(ctxOf({ record }), "en")
    expect(en.title).toBe("Current answer")
    expect(textOf(en)).toContain("Overall status: “Not found”")
    expect(textOf(en)).toContain("Not found in the supplied rules.")
    expect(textOf(en)).toContain("Nothing is cited")
    const hi = buildContextStep(ctxOf({ record }), "hi")
    expect(hi.title).toBe("मौजूदा जवाब")
    expect(hi.paragraphs.at(-1)).toBe(HI_ENGLISH_DISCLOSURE)

    const q1 = fromAnswer(AnswerResponseSchema.parse(answerQ1), {})
    expect(textOf(buildContextStep(ctxOf({ record: { ...q1, calcs: [] } }), "en"))).toContain("Cited: Rule 56(1)(a), PDF page 77; Rule 56(1), PDF page 77; Rule 56(7), PDF page 80.")
  })

  it("discloses unknown English-only labels in Hindi instead of mixing silently", () => {
    const odd = { ...calcs[0], calc_type: "new_server_calc", label: "Some new requirement", display_value: "about 2 units", unit: "units", value: 2, zones: [] }
    const ctx = ctxOf({ record: fromEvaluation("front_open_space", [odd], {}) })
    expect(buildContextStep(ctx, "hi").paragraphs.at(-1)).toBe(HI_ENGLISH_DISCLOSURE)
  })

  it("changes its id (and so its narration key) whenever the explanation changes", () => {
    const a = buildContextStep(evaluated(), "en")
    expect(buildContextStep(evaluated(), "en").id).toBe(a.id)
    expect(buildContextStep(evaluated({ selected: "building" }), "en").id).not.toBe(a.id)
    expect(a.id).toMatch(/^context-[a-z0-9]+$/)
  })
})
