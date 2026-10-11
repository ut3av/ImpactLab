import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppRoutes } from "@/App"
import { CounterReceipt, RECEIPT_DISCLAIMER } from "@/features/receipt/CounterReceipt"
import { fromAnswer } from "@/lib/record"
import { AnswerResponseSchema } from "@/types/api"
import answerQ1 from "./fixtures/answer-q1.json"
import notFound from "./fixtures/answer-notfound.json"
import calcSite from "./fixtures/calc-site.json"
import health from "./fixtures/health.json"

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown } | Promise<never>

function mockFetch(handler: Handler) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const r = await handler(url, init)
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

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  ;(window as unknown as { __wide?: boolean }).__wide = true
})
afterEach(() => vi.unstubAllGlobals())

describe("Workbench", () => {
  it("renders the three-panel workspace with empty states", async () => {
    mockFetch(routes)
    renderApp()
    expect(screen.getByText("NIYAM")).toBeInTheDocument()
    expect(screen.getByRole("form", { name: "Project inputs" })).toBeInTheDocument()
    expect(screen.getByText("No plot drawn yet")).toBeInTheDocument()
    expect(screen.getByText(/Ask a question in English or Hindi/)).toBeInTheDocument()
    await screen.findByText(/106 rules · 13\/13 tables verified/)
  })

  it("shows a server-unreachable state when health fails", async () => {
    mockFetch(() => Promise.reject(new TypeError("network")))
    renderApp()
    await screen.findByText("Server unreachable")
  })

  it("asks a question and shows verified evidence with rule and page", async () => {
    const fetch = mockFetch(routes)
    renderApp()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Question in English or Hindi"), "front open space 10 m street 9 m tall house")
    await user.click(screen.getByRole("button", { name: "Ask" }))
    const insp = screen.getByRole("complementary", { name: "Regulation inspector" })
    await within(insp).findByText("Minimum front open space")
    expect(within(insp).getAllByText("3.6 m").length).toBeGreaterThan(0)
    expect(insp.querySelector("[data-status=VERIFIED]")).not.toBeNull()
    expect(within(insp).getAllByText("PDF p. 77").length).toBeGreaterThan(0)
    expect(within(insp).getByText("Deterministic summary")).toBeInTheDocument()
    expect(within(insp).getAllByText(/Table checked against PDF/i).length).toBeGreaterThan(0)
    const call = fetch.mock.calls.find(([u]) => String(u).endsWith("/api/answer"))!
    expect(JSON.parse(String(call[1]!.body))).toMatchObject({ question: "front open space 10 m street 9 m tall house" })
    // Extracted inputs can be applied to the form
    await user.click(screen.getByRole("button", { name: /Use in project inputs/ }))
    expect(screen.getByLabelText(/Width of street facing the plot/)).toHaveValue("10")
  })

  it("shows the not-found state without citations", async () => {
    mockFetch((url) => (url.endsWith("/api/health") ? { body: health } : { body: notFound }))
    renderApp()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Question in English or Hindi"), "property tax{Enter}")
    const insp = screen.getByRole("complementary", { name: "Regulation inspector" })
    await within(insp).findByText(/^Not found in the supplied rules\./)
    expect(insp.querySelector("[data-status=NOT_FOUND]")).not.toBeNull()
    expect(within(insp).getByText(/No rule passage supports an answer/)).toBeInTheDocument()
  })

  it("shows API errors clearly", async () => {
    mockFetch((url) => (url.endsWith("/api/health") ? { body: health } : { status: 422, body: { detail: "plot_area_sqm does not match" } }))
    renderApp()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Question in English or Hindi"), "rear open space{Enter}")
    await screen.findByText("Request failed")
    expect(screen.getByText("plot_area_sqm does not match")).toBeInTheDocument()
  })

  it("validates inputs and blocks evaluation while invalid", async () => {
    mockFetch(routes)
    renderApp()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Width \/ frontage/), "abc")
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a number")
    expect(screen.getByRole("button", { name: /Evaluate requirement/ })).toBeDisabled()
  })

  it("evaluates inputs, draws rule-linked zones (plan fallback without WebGL) and links selection to the inspector", async () => {
    mockFetch(routes)
    renderApp()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /Example/ }))
    await user.click(screen.getByRole("button", { name: /Evaluate requirement/ }))
    expect(await screen.findByText(/3D unavailable \(no WebGL\)/)).toBeInTheDocument()
    const zone = await screen.findByRole("button", { name: /Front open space ≥ 3 m, rule 56\(1\)\(a\)/ })
    await user.click(zone)
    const insp = screen.getByRole("complementary", { name: "Regulation inspector" })
    expect(within(insp).getByText("Front open space ≥ 3 m — Rule 56(1)(a)")).toBeInTheDocument()
    expect(within(insp).getAllByText(/below minimum/).length).toBeGreaterThan(0)
  })

  it("uses tabs on small screens", async () => {
    ;(window as unknown as { __wide?: boolean }).__wide = false
    mockFetch(routes)
    renderApp()
    expect(screen.getByRole("tab", { name: "Inspector" })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole("tab", { name: "Inputs" }))
    expect(screen.getByLabelText(/Width \/ frontage/)).toBeVisible()
  })
})

describe("Counter Receipt", () => {
  const record = fromAnswer(AnswerResponseSchema.parse(answerQ1), {})

  it("contains the required fields and disclaimer", () => {
    render(<CounterReceipt record={record} onBack={() => {}} />)
    expect(screen.getByText(RECEIPT_DISCLAIMER)).toBeInTheDocument()
    expect(screen.getByText(record.question)).toBeInTheDocument()
    expect(screen.getAllByText(/Rule 56\(1\)\(a\)/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/PDF page 77/).length).toBeGreaterThan(0)
    expect(screen.getByText("Calculation details")).toBeInTheDocument()
    expect(screen.getByText(/Ref NL-|NL-/)).toBeInTheDocument()
  })

  it("prints via the browser", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {})
    render(<CounterReceipt record={record} onBack={() => {}} />)
    await userEvent.setup().click(screen.getByRole("button", { name: /Print/ }))
    expect(print).toHaveBeenCalled()
  })

  it("is reachable from the workbench and survives a direct visit", async () => {
    mockFetch(routes)
    renderApp()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Question in English or Hindi"), "front{Enter}")
    await user.click(await screen.findByRole("button", { name: /Counter Receipt/ }))
    expect(await screen.findByText(RECEIPT_DISCLAIMER)).toBeInTheDocument()
  })

  it("shows an empty state when there is no receipt", () => {
    mockFetch(routes)
    renderApp("/receipt")
    expect(screen.getByText("No receipt to show")).toBeInTheDocument()
  })
})
