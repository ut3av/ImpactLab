import { z } from "zod"
import {
  AnswerResponseSchema,
  CalcResultSchema,
  ExplainResponseSchema,
  HealthSchema,
  RuleDetailSchema,
  type AnswerResponse,
  type CalcResult,
  type ExplainRequest,
  type ExplainResponse,
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

/** Thrown when the caller's own AbortSignal cancelled the request (an obsolete request, not a failure). */
export class RequestAborted extends Error {
  constructor() {
    super("Request cancelled.")
    this.name = "RequestAborted"
  }
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "")

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit, timeoutMs = 45_000, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new RequestAborted()
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, timeoutMs)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener("abort", onAbort)
  const url = `${BASE_URL}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    })
  } catch (e) {
    if (signal?.aborted && !timedOut) throw new RequestAborted()
    throw new ApiError(
      (e as Error).name === "AbortError" ? "The server took too long to respond." : "Cannot reach the MIRA server.",
      0,
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON body */
  }
  if (signal?.aborted) throw new RequestAborted()
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
  /** Explain the current result or selection. The server rebuilds all rule text from the identifiers sent. */
  explain: (body: ExplainRequest, signal?: AbortSignal): Promise<ExplainResponse> =>
    request("/api/explain", ExplainResponseSchema, { method: "POST", body: JSON.stringify(body) }, 50_000, signal),
}
