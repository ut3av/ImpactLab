import type { InspectionRecord } from "@/lib/record"
import {
  BUILDING_TYPES,
  BUILDING_USES,
  CALC_TYPES,
  VOLTAGE_CLASSES,
  type CalcType,
  type ExplainFocus,
  type ExplainRequest,
  type FocusElement,
  type ProjectInputs,
  type Side,
  type UiLanguage,
} from "@/types/api"

/**
 * Builds /api/explain requests from an inspection record. Only identifiers and clerk inputs are
 * sent; the server rebuilds every passage, value, status and warning from its own data, so no
 * rule text, answer text or status ever leaves the client here.
 */

/** Sides each calculation draws on the plot (mirrors FOCUS_SIDES in backend/app/models/schemas.py). */
const FOCUS_SIDES: Partial<Record<CalcType, readonly Side[]>> = {
  front_open_space: ["front"],
  rear_open_space: ["rear"],
  side_open_space: ["left", "right"],
}
const ELEMENTS: readonly FocusElement[] = ["building", "plot", "road"]
/** Mirrors CITATION_ID_PATTERN in the backend: an id the server would reject is never sent. */
const CITATION_ID_RE = /^(?:verified:[a-z0-9_]{1,40}|\d{1,3}(?:-[A-Z])?#\d{1,4})$/
export const MAX_CITATION_IDS = 8
const MAX_QUESTION = 1000

type NumberField = { [K in keyof ProjectInputs]-?: NonNullable<ProjectInputs[K]> extends number ? K : never }[keyof ProjectInputs]
type StringField = Exclude<keyof ProjectInputs, NumberField>

const NUMBER_FIELDS: readonly NumberField[] = [
  "plot_width_m",
  "plot_depth_m",
  "plot_area_sqm",
  "road_width_m",
  "building_height_m",
  "storeys",
  "built_up_area_sqm",
  "seating_capacity",
  "building_width_m",
  "building_depth_m",
  "front_gap_m",
  "left_gap_m",
]
const INTEGER_FIELDS = new Set<NumberField>(["storeys", "seating_capacity"])
const ZERO_ALLOWED = new Set<NumberField>(["front_gap_m", "left_gap_m"])
const STRING_FIELDS: Record<StringField, readonly string[]> = {
  building_use: BUILDING_USES.map(([k]) => k),
  building_type: BUILDING_TYPES.map(([k]) => k),
  voltage_class: VOLTAGE_CLASSES.map(([k]) => k),
}

export function isCalcType(v: unknown): v is CalcType {
  return typeof v === "string" && (CALC_TYPES as readonly string[]).includes(v)
}

/** Inspector selection key ("calc_type:side", "building", "plot", "road") → explain focus, or null if not explainable. */
export function focusFromSelection(selected: string | null | undefined): ExplainFocus | null {
  if (!selected) return null
  if ((ELEMENTS as readonly string[]).includes(selected)) return { element: selected as FocusElement }
  const parts = selected.split(":")
  if (parts.length !== 2) return null
  const [calcType, side] = parts
  if (!isCalcType(calcType)) return null
  return FOCUS_SIDES[calcType]?.includes(side as Side) ? { calc_type: calcType, side: side as Side } : null
}

/** Known ProjectInputs keys only, with the types the server validates (numbers as numbers, enums as known strings). */
export function pickInputs(raw: Readonly<Record<string, unknown>>): ProjectInputs {
  const out: Record<string, number | string> = {}
  for (const k of NUMBER_FIELDS) {
    const v = raw[k]
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
    if (!Number.isFinite(n) || n < 0 || (n === 0 && !ZERO_ALLOWED.has(k)) || (INTEGER_FIELDS.has(k) && !Number.isInteger(n))) continue
    out[k] = n
  }
  for (const [k, allowed] of Object.entries(STRING_FIELDS)) {
    const v = raw[k]
    if (typeof v === "string" && allowed.includes(v)) out[k] = v
  }
  return out as ProjectInputs
}

function normaliseFocus(focus: ExplainFocus | null): ExplainFocus | null {
  if (!focus) return null
  if ("element" in focus) return { element: focus.element }
  return focus.side ? { calc_type: focus.calc_type, side: focus.side } : { calc_type: focus.calc_type }
}

export function buildExplainRequest(record: InspectionRecord, focus: ExplainFocus | null, language: UiLanguage, detail: ExplainRequest["detail"]): ExplainRequest {
  const question = record.kind === "answer" ? record.question.trim().slice(0, MAX_QUESTION) || null : null
  const calc_types = [...new Set(record.calcs.map((c) => c.calc_type).filter(isCalcType))]
  const ids = record.citations.map((c) => c.chunk_id).filter((id): id is string => typeof id === "string" && CITATION_ID_RE.test(id))
  return {
    language,
    detail,
    question,
    inputs: pickInputs(record.inputs),
    calc_types,
    citation_ids: [...new Set(ids)].slice(0, MAX_CITATION_IDS),
    focus: normaliseFocus(focus),
  }
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, sortKeys(x)]),
    )
  }
  return v
}

/** Stable cache key: the same request always yields the same string, whatever the key order. */
export function explainCacheKey(req: ExplainRequest): string {
  return JSON.stringify(sortKeys(req))
}

/** Identifies the entry point for a focus (null = the whole result), e.g. to mark the right button busy. */
export function focusKey(focus: ExplainFocus | null): string {
  if (!focus) return "result"
  if ("element" in focus) return `element:${focus.element}`
  return focus.side ? `calc:${focus.calc_type}:${focus.side}` : `calc:${focus.calc_type}`
}

const recordSeq = new WeakMap<InspectionRecord, number>()
let nextSeq = 0

/**
 * Identity of the result being explained: generatedAt + question, plus the record object itself
 * (generated_at has one-second resolution, so re-asking with changed inputs must still reset).
 */
export function recordIdentity(record: InspectionRecord | null): string | null {
  if (!record) return null
  let seq = recordSeq.get(record)
  if (seq === undefined) recordSeq.set(record, (seq = ++nextSeq))
  return `${record.generatedAt}|${record.question}|${seq}`
}
