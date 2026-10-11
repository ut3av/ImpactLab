import { z } from "zod"
import {
  AnswerResponseSchema,
  CalcResultSchema,
  HealthSchema,
  RuleDetailSchema,
  type AnswerResponse,
  type CalcResult,
  type Health,
  type ProjectInputs,
  type Requirement,
  type RuleDetail,
} from "@/types/api"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit, timeoutMs = 45_000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    })
  } catch (e) {
    throw new ApiError(
      (e as Error).name === "AbortError" ? "The server took too long to respond." : "Cannot reach the NIYAMLENS server.",
      0,
    )
  } finally {
    clearTimeout(timer)
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail
    throw new ApiError(typeof detail === "string" ? detail : `Request failed (${res.status}).`, res.status)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ApiError("The server returned an unexpected response.", res.status)
  return parsed.data
}

export const api = {
  health: (): Promise<Health> => request("/api/health", HealthSchema),
  answer: (question: string, inputs: ProjectInputs, useAi = true): Promise<AnswerResponse> =>
    request("/api/answer", AnswerResponseSchema, {
      method: "POST",
      body: JSON.stringify({ question, inputs, use_ai: useAi }),
    }),
  calculate: (calcType: Requirement, inputs: ProjectInputs): Promise<CalcResult[]> =>
    request("/api/calculate", z.array(CalcResultSchema), {
      method: "POST",
      body: JSON.stringify({ calc_type: calcType, inputs }),
    }),
  rule: (id: string): Promise<RuleDetail> => request(`/api/rules/${encodeURIComponent(id)}`, RuleDetailSchema),
}
