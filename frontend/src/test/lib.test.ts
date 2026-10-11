import { describe, expect, it } from "vitest"
import { buildScene } from "@/lib/geometry"
import { applyExtracted, EMPTY_FORM, parseInputs } from "@/lib/inputs"
import { fromEvaluation } from "@/lib/record"
import { AnswerResponseSchema, CalcResultSchema } from "@/types/api"
import answerQ1 from "./fixtures/answer-q1.json"
import notFound from "./fixtures/answer-notfound.json"
import calcSite from "./fixtures/calc-site.json"
import calcMissing from "./fixtures/calc-site-missing.json"

describe("parseInputs", () => {
  it("accepts valid numbers and keeps empty fields undefined", () => {
    const { inputs, errors } = parseInputs({ ...EMPTY_FORM, plot_width_m: "10", plot_depth_m: "15.5", building_use: "residential" })
    expect(errors).toEqual({})
    expect(inputs).toEqual({ plot_width_m: 10, plot_depth_m: 15.5, building_use: "residential" })
  })

  it.each([
    ["abc", "Enter a number"],
    ["-3", "Enter a number"],
    ["0", "greater than zero"],
    ["10 m", "Enter a number"],
    ["5000", "at most"],
  ])("rejects plot width %s", (raw, msg) => {
    const { inputs, errors } = parseInputs({ ...EMPTY_FORM, plot_width_m: raw })
    expect(errors.plot_width_m).toContain(msg)
    expect(inputs.plot_width_m).toBeUndefined()
  })

  it("rejects whole-number fields with decimals", () => {
    expect(parseInputs({ ...EMPTY_FORM, storeys: "2.5" }).errors.storeys).toContain("whole number")
  })

  it("flags plot area inconsistent with width × depth instead of adjusting it", () => {
    const { inputs, errors } = parseInputs({ ...EMPTY_FORM, plot_width_m: "10", plot_depth_m: "20", plot_area_sqm: "150" })
    expect(errors.plot_area_sqm).toContain("Does not match")
    expect(inputs.plot_area_sqm).toBeUndefined()
  })

  it("flags a building that does not fit on the plot", () => {
    const { errors } = parseInputs({ ...EMPTY_FORM, plot_width_m: "10", building_width_m: "9", left_gap_m: "2" })
    expect(errors.building_width_m).toBeDefined()
  })

  it("allows a zero gap", () => {
    expect(parseInputs({ ...EMPTY_FORM, front_gap_m: "0" }).inputs.front_gap_m).toBe(0)
  })

  it("applies only known extracted fields", () => {
    const next = applyExtracted(EMPTY_FORM, { road_width_m: 10, building_height_m: 9, nonsense: 1 })
    expect(next.road_width_m).toBe("10")
    expect(next.building_height_m).toBe("9")
    expect("nonsense" in next).toBe(false)
  })
})

describe("API fixtures match the client schemas", () => {
  it("parses real backend responses", () => {
    expect(AnswerResponseSchema.safeParse(answerQ1).success).toBe(true)
    expect(AnswerResponseSchema.safeParse(notFound).success).toBe(true)
    for (const c of calcSite) expect(CalcResultSchema.safeParse(c).success).toBe(true)
  })
})

describe("buildScene", () => {
  const calcs = calcSite.map((c) => CalcResultSchema.parse(c))
  const inputs = { plot_width_m: 10, plot_depth_m: 15, road_width_m: 9, building_width_m: 6, building_depth_m: 10, front_gap_m: 3, left_gap_m: 3 }

  it("draws rule-linked zones only from calculation results", () => {
    const s = buildScene(inputs, calcs)
    expect(s.plot).toEqual({ w: 10, d: 15 })
    const front = s.zones.find((z) => z.side === "front")!
    expect(front.depth).toBe(3)
    expect(front.rule).toBe("56(1)(a)")
    expect(front.state).toBe("verified")
    expect(s.zones.map((z) => z.side).sort()).toEqual(["front", "left", "rear", "right"])
  })

  it("marks a proposed gap below the computed minimum as a conflict", () => {
    const s = buildScene(inputs, calcs)
    expect(s.conflicts.map((z) => z.side)).toEqual(["right"]) // 10 - 3 - 6 = 1 m < 1.5 m
  })

  it("draws no zones and no plot without width and depth", () => {
    const s = buildScene({ plot_area_sqm: 150 }, calcs)
    expect(s.plot).toBeNull()
    expect(s.zones).toHaveLength(0)
  })

  it("shows unresolved edges instead of inventing a dimension", () => {
    const missing = calcMissing.map((c) => CalcResultSchema.parse(c))
    const s = buildScene({ plot_width_m: 10, plot_depth_m: 15, road_width_m: 9 }, missing)
    expect(s.zones).toHaveLength(0)
    expect(s.unresolved.map((u) => u.side).sort()).toEqual(["front", "left", "rear", "right"])
  })

  it("adds no building without a footprint", () => {
    expect(buildScene({ plot_width_m: 10, plot_depth_m: 15 }, []).building).toBeNull()
  })
})

describe("fromEvaluation", () => {
  it("aggregates statuses and missing inputs", () => {
    const r = fromEvaluation("site_open_spaces", calcMissing.map((c) => CalcResultSchema.parse(c)), {})
    expect(r.primary).toBe("MORE_INFORMATION_NEEDED")
    expect(r.missing.map((m) => m.field)).toContain("building_height_m")
    expect(r.statuses).not.toContain("VERIFIED")
  })
})
