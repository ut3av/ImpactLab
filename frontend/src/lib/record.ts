import type { AnswerResponse, CalcResult, Citation, MissingInput, ProjectInputs, RegWarning, Status } from "@/types/api"
import { REQUIREMENTS } from "./inputs"

/** One inspectable result: from a question (/api/answer) or a form evaluation (/api/calculate). */
export type InspectionRecord = {
  kind: "answer" | "evaluation"
  question: string
  language: "en" | "hi"
  answerText: string | null
  answerSource: "ai" | "template" | "deterministic"
  answerModel?: string | null
  answerNote?: string | null
  primary: Status
  statuses: Status[]
  citations: Citation[]
  calcs: CalcResult[]
  missing: MissingInput[]
  warnings: RegWarning[]
  inputs: Record<string, string | number>
  searched?: { terms: string[]; rules: string[] }
  aiAvailable?: boolean
  generatedAt: string
}

const PRIORITY: Status[] = ["NOT_FOUND", "MORE_INFORMATION_NEEDED", "VERSION_REVIEW_NEEDED", "SOURCE_FOUND", "CALCULATION_COMPLETED", "VERIFIED", "ILLUSTRATIVE_ONLY"]

export function sortStatuses(s: Status[]): Status[] {
  return [...new Set(s)].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b))
}

export function fromAnswer(a: AnswerResponse, formInputs: ProjectInputs): InspectionRecord {
  return {
    kind: "answer",
    question: a.question,
    language: a.language,
    answerText: a.answer.text,
    answerSource: a.answer.source,
    answerModel: a.answer.model,
    answerNote: a.answer.note,
    primary: a.primary_status,
    statuses: a.statuses,
    citations: a.citations,
    calcs: a.calculations,
    missing: a.missing_inputs,
    warnings: a.warnings,
    inputs: { ...(formInputs as Record<string, number | string>), ...a.extracted_inputs },
    searched: { terms: a.search.query_terms, rules: a.search.rules_considered },
    aiAvailable: a.ai_available,
    generatedAt: a.generated_at,
  }
}

export function fromEvaluation(requirement: string, calcs: CalcResult[], inputs: ProjectInputs): InspectionRecord {
  const statuses: Status[] = []
  const missing: MissingInput[] = []
  const citations: Citation[] = []
  const seen = new Set<string>()
  for (const c of calcs) {
    if (c.status === "VERIFIED") statuses.push("VERIFIED", "CALCULATION_COMPLETED")
    else statuses.push(c.status)
    for (const m of c.missing_inputs) if (!missing.some((x) => x.field === m.field)) missing.push(m)
    for (const ct of c.citations) {
      const k = ct.chunk_id ?? ct.passage.slice(0, 60)
      if (!seen.has(k)) {
        seen.add(k)
        citations.push(ct)
      }
    }
  }
  if (missing.length) statuses.push("MORE_INFORMATION_NEEDED")
  const sorted = sortStatuses(statuses)
  const label = REQUIREMENTS.find(([k]) => k === requirement)?.[1] ?? requirement
  return {
    kind: "evaluation",
    question: `Requirement evaluated: ${label}`,
    language: "en",
    answerText: null,
    answerSource: "deterministic",
    primary: sorted[0] ?? "MORE_INFORMATION_NEEDED",
    statuses: sorted,
    citations,
    calcs,
    missing,
    warnings: [],
    inputs: inputs as Record<string, number | string>,
    generatedAt: new Date().toISOString(),
  }
}

export const INPUT_LABELS: Record<string, string> = {
  plot_width_m: "Plot width / frontage (m)",
  plot_depth_m: "Plot depth (m)",
  plot_area_sqm: "Plot area (sq m)",
  road_width_m: "Street width (m)",
  building_height_m: "Building height (m)",
  storeys: "Storeys",
  building_use: "Building use",
  building_type: "Building type",
  built_up_area_sqm: "Built-up area (sq m)",
  seating_capacity: "Seating capacity",
  voltage_class: "Overhead line type",
  building_width_m: "Building width (m)",
  building_depth_m: "Building depth (m)",
  front_gap_m: "Gap from front (m)",
  left_gap_m: "Gap from left (m)",
}
