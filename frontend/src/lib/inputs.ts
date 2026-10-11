import type { ProjectInputs, Requirement } from "@/types/api"

export type FormState = Record<keyof ProjectInputs, string>

export const EMPTY_FORM: FormState = {
  plot_width_m: "",
  plot_depth_m: "",
  plot_area_sqm: "",
  road_width_m: "",
  building_height_m: "",
  storeys: "",
  building_use: "",
  building_type: "",
  built_up_area_sqm: "",
  seating_capacity: "",
  voltage_class: "",
  building_width_m: "",
  building_depth_m: "",
  front_gap_m: "",
  left_gap_m: "",
}

type NumField = { key: keyof ProjectInputs; min: number; max: number; int?: boolean; allowZero?: boolean }

export const NUMERIC_FIELDS: NumField[] = [
  { key: "plot_width_m", min: 0, max: 1000 },
  { key: "plot_depth_m", min: 0, max: 1000 },
  { key: "plot_area_sqm", min: 0, max: 1_000_000 },
  { key: "road_width_m", min: 0, max: 200 },
  { key: "building_height_m", min: 0, max: 500 },
  { key: "storeys", min: 1, max: 200, int: true },
  { key: "built_up_area_sqm", min: 0, max: 10_000_000 },
  { key: "seating_capacity", min: 1, max: 100_000, int: true },
  { key: "building_width_m", min: 0, max: 1000 },
  { key: "building_depth_m", min: 0, max: 1000 },
  { key: "front_gap_m", min: 0, max: 1000, allowZero: true },
  { key: "left_gap_m", min: 0, max: 1000, allowZero: true },
]

/** Which inputs each requirement uses (for guidance only; the backend decides what is missing). */
export const REQUIREMENT_FIELDS: Record<Requirement, (keyof ProjectInputs)[]> = {
  site_open_spaces: ["plot_width_m", "plot_depth_m", "road_width_m", "building_height_m", "building_use", "building_type"],
  front_open_space: ["road_width_m", "building_height_m", "building_use"],
  rear_open_space: ["plot_width_m", "plot_depth_m", "building_height_m", "building_use"],
  side_open_space: ["plot_width_m", "building_height_m", "building_use", "building_type"],
  building_permission_fee: ["built_up_area_sqm", "building_use", "building_height_m", "storeys"],
  electric_line_clearance: ["voltage_class"],
}

export const REQUIREMENTS: [Requirement, string][] = [
  ["site_open_spaces", "All open spaces (front, rear, side)"],
  ["front_open_space", "Front open space"],
  ["rear_open_space", "Rear open space"],
  ["side_open_space", "Side open space"],
  ["building_permission_fee", "Building permission fee"],
  ["electric_line_clearance", "Distance from overhead electric line"],
]

const NUM_RE = /^\d+(\.\d+)?$/

export function parseInputs(form: FormState): { inputs: ProjectInputs; errors: Partial<Record<keyof ProjectInputs, string>> } {
  const inputs: ProjectInputs = {}
  const errors: Partial<Record<keyof ProjectInputs, string>> = {}
  for (const f of NUMERIC_FIELDS) {
    const raw = form[f.key].trim()
    if (!raw) continue
    if (!NUM_RE.test(raw)) {
      errors[f.key] = "Enter a number (digits only, no units)."
      continue
    }
    const v = Number(raw)
    if (f.int && !Number.isInteger(v)) errors[f.key] = "Enter a whole number."
    else if (f.allowZero ? v < f.min : v <= f.min) errors[f.key] = f.allowZero ? "Cannot be negative." : "Must be greater than zero."
    else if (v > f.max) errors[f.key] = `Must be at most ${f.max.toLocaleString("en-IN")}.`
    else (inputs as Record<string, number>)[f.key] = v
  }
  for (const k of ["building_use", "building_type", "voltage_class"] as const) {
    if (form[k]) inputs[k] = form[k]
  }
  const { plot_width_m: w, plot_depth_m: d, plot_area_sqm: a } = inputs
  if (w && d && a && Math.abs(w * d - a) > Math.max(0.5, 0.02 * a)) {
    errors.plot_area_sqm = `Does not match width × depth (${(w * d).toFixed(2)} sq m). Correct one value.`
  }
  if (w && inputs.building_width_m && inputs.building_width_m + (inputs.left_gap_m ?? 0) > w + 1e-9) {
    errors.building_width_m = "Building plus left gap is wider than the plot."
  }
  if (d && inputs.building_depth_m && inputs.building_depth_m + (inputs.front_gap_m ?? 0) > d + 1e-9) {
    errors.building_depth_m = "Building plus front gap is deeper than the plot."
  }
  for (const k of Object.keys(errors) as (keyof ProjectInputs)[]) delete inputs[k]
  return { inputs, errors }
}

export function effectiveArea(inputs: ProjectInputs): number | undefined {
  if (inputs.plot_area_sqm) return inputs.plot_area_sqm
  if (inputs.plot_width_m && inputs.plot_depth_m) return Math.round(inputs.plot_width_m * inputs.plot_depth_m * 100) / 100
  return undefined
}

/** Merge values the backend extracted from a question into the form (only fields the form knows). */
export function applyExtracted(form: FormState, extracted: Record<string, string | number>): FormState {
  const next = { ...form }
  for (const [k, v] of Object.entries(extracted)) {
    if (k in next) next[k as keyof FormState] = String(v)
  }
  return next
}
