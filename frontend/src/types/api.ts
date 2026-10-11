import { z } from "zod"

export const StatusSchema = z.enum([
  "VERIFIED",
  "CALCULATION_COMPLETED",
  "SOURCE_FOUND",
  "MORE_INFORMATION_NEEDED",
  "NOT_FOUND",
  "VERSION_REVIEW_NEEDED",
  "ILLUSTRATIVE_ONLY",
])
export type Status = z.infer<typeof StatusSchema>

export const CitationSchema = z.object({
  rule: z.string(),
  sub_rule: z.string().nullable().optional(),
  title: z.string(),
  page: z.number().int(),
  passage: z.string(),
  document: z.string(),
  chunk_id: z.string().nullable().optional(),
  verified_table: z.boolean(),
  score: z.number().nullable().optional(),
})
export type Citation = z.infer<typeof CitationSchema>

export const MissingInputSchema = z.object({ field: z.string(), label: z.string(), reason: z.string() })
export type MissingInput = z.infer<typeof MissingInputSchema>

export const WarningSchema = z.object({
  code: z.string(),
  title: z.string(),
  detail: z.string(),
  source_url: z.string().nullable().optional(),
  affected_rules: z.array(z.string()).optional(),
})
export type RegWarning = z.infer<typeof WarningSchema>

export const ZoneSchema = z.object({
  side: z.enum(["front", "rear", "left", "right"]),
  depth_m: z.number(),
  rule: z.string(),
  label: z.string(),
  proposed_gap_m: z.number().nullable().optional(),
  check: z.enum(["meets_minimum", "below_minimum", "not_checked"]),
})
export type Zone = z.infer<typeof ZoneSchema>

const Scalar = z.union([z.number(), z.string()])

export const CalcResultSchema = z.object({
  calc_type: z.string(),
  label: z.string(),
  status: StatusSchema,
  value: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  display_value: z.string().nullable().optional(),
  inputs_used: z.record(z.string(), Scalar),
  steps: z.array(z.string()),
  conditions: z.array(z.string()),
  notes: z.array(z.string()),
  citations: z.array(CitationSchema),
  missing_inputs: z.array(MissingInputSchema),
  conditional_results: z.array(z.object({ condition: z.string(), result: z.string(), rule: z.string() })),
  zones: z.array(ZoneSchema),
  breakdown: z.record(z.string(), Scalar),
  summary_en: z.string().nullable().optional(),
  summary_hi: z.string().nullable().optional(),
})
export type CalcResult = z.infer<typeof CalcResultSchema>

export const AnswerResponseSchema = z.object({
  question: z.string(),
  language: z.enum(["en", "hi"]),
  answer: z.object({
    text: z.string(),
    source: z.enum(["ai", "template"]),
    model: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  }),
  primary_status: StatusSchema,
  statuses: z.array(StatusSchema),
  citations: z.array(CitationSchema),
  calculations: z.array(CalcResultSchema),
  missing_inputs: z.array(MissingInputSchema),
  warnings: z.array(WarningSchema),
  extracted_inputs: z.record(z.string(), Scalar),
  search: z.object({ query_terms: z.array(z.string()), top_score: z.number(), rules_considered: z.array(z.string()) }),
  ai_available: z.boolean(),
  generated_at: z.string(),
})
export type AnswerResponse = z.infer<typeof AnswerResponseSchema>

export const HealthSchema = z.object({
  status: z.string(),
  rules_loaded: z.number(),
  passages_indexed: z.number(),
  pages_loaded: z.number(),
  verified_sources: z.object({ ok: z.number(), total: z.number() }),
  ai_configured: z.boolean(),
  frontend_built: z.boolean(),
})
export type Health = z.infer<typeof HealthSchema>

export const RuleDetailSchema = z.object({
  rule: z.string(),
  title: z.string(),
  part: z.string(),
  page_start: z.number(),
  page_end: z.number(),
  embedded_in: z.string().nullable(),
  document: z.string(),
  passages: z.array(
    z.object({ chunk_id: z.string(), page: z.number(), sub_rule: z.string().nullable(), text: z.string(), is_comment: z.boolean() }),
  ),
})
export type RuleDetail = z.infer<typeof RuleDetailSchema>

// ---------------------------------------------------------------------- explanations

export const CALC_TYPES = [
  "front_open_space",
  "rear_open_space",
  "side_open_space",
  "site_open_spaces",
  "building_permission_fee",
  "electric_line_clearance",
] as const
export type CalcType = (typeof CALC_TYPES)[number]
export type Side = Zone["side"]
export type FocusElement = "building" | "plot" | "road"
export type UiLanguage = "en" | "hi"

/** What the clerk selected. The server rebuilds all evidence from these identifiers. */
export type ExplainFocus = { calc_type: CalcType; side?: Side } | { element: FocusElement }

export type ExplainRequest = {
  language: UiLanguage
  detail: "brief" | "detailed"
  question: string | null
  inputs: ProjectInputs
  calc_types: CalcType[]
  citation_ids: string[]
  focus: ExplainFocus | null
}

export const EXPLAIN_SECTION_KEYS = ["meaning", "why_it_applies", "evidence", "calculation", "building_impact", "uncertainty", "next_step"] as const
export const ExplainSectionSchema = z.object({ key: z.enum(EXPLAIN_SECTION_KEYS), text: z.string() })
export type ExplainSection = z.infer<typeof ExplainSectionSchema>

export const ExplainResponseSchema = z.object({
  language: z.enum(["en", "hi"]),
  detail: z.enum(["brief", "detailed"]),
  source: z.enum(["ai", "basic"]),
  model: z.string().nullable().optional(),
  // Kept open so a newer server reason never breaks the client; known values are mapped in the UI.
  fallback_reason: z.string().nullable().optional(),
  target: z.object({
    kind: z.enum(["result", "calculation", "constraint", "element"]),
    label: z.string(),
    status: StatusSchema,
    calc_type: z.string().nullable().optional(),
    side: z.enum(["front", "rear", "left", "right"]).nullable().optional(),
    element: z.enum(["building", "plot", "road"]).nullable().optional(),
  }),
  summary: z.string(),
  sections: z.array(ExplainSectionSchema),
  primary_status: StatusSchema,
  statuses: z.array(StatusSchema),
  citations: z.array(CitationSchema),
  warnings: z.array(WarningSchema),
  missing_inputs: z.array(MissingInputSchema),
  disclosures: z.array(z.string()),
  generated_at: z.string(),
})
export type ExplainResponse = z.infer<typeof ExplainResponseSchema>

export const BUILDING_USES = [
  ["residential", "Residential"],
  ["commercial", "Commercial / shops / factory"],
  ["shop_cum_residence", "Shop-cum-residence"],
  ["industrial_admin", "Administrative block in a factory"],
  ["social_educational", "Social / charitable / educational"],
  ["cinema", "Cinema theatre"],
] as const
export const BUILDING_TYPES = [
  ["detached", "Detached"],
  ["semi_detached", "Semi-detached"],
  ["row", "Row-type"],
] as const
export const VOLTAGE_CLASSES = [
  ["low_medium", "Low / medium voltage or service line"],
  ["high_upto_33kv", "High voltage up to 33 kV"],
  ["extra_high", "Extra high voltage above 33 kV"],
] as const

export type ProjectInputs = Partial<{
  plot_width_m: number
  plot_depth_m: number
  plot_area_sqm: number
  road_width_m: number
  building_height_m: number
  storeys: number
  building_use: string
  building_type: string
  built_up_area_sqm: number
  seating_capacity: number
  voltage_class: string
  building_width_m: number
  building_depth_m: number
  front_gap_m: number
  left_gap_m: number
}>

export type Requirement = "site_open_spaces" | "front_open_space" | "rear_open_space" | "side_open_space" | "building_permission_fee" | "electric_line_clearance"
