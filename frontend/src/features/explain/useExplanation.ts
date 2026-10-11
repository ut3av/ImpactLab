import { useCallback, useEffect, useRef, useState } from "react"
import { api, ApiError, RequestAborted } from "@/lib/api"
import type { ExplainRequest, ExplainResponse } from "@/types/api"
import { explainCacheKey } from "./payload"

export type ExplainState =
  | { status: "idle" }
  | { status: "loading"; key: string; req: ExplainRequest }
  | { status: "success"; key: string; req: ExplainRequest; data: ExplainResponse }
  | { status: "error"; key: string; req: ExplainRequest; message: string }

const IDLE: ExplainState = { status: "idle" }
const CACHE_MAX = 20

/**
 * In-memory LRU of live AI explanations for this page session. Basic (non-AI) results are never
 * stored, so a fallback shown during an outage cannot mask a later successful attempt.
 */
class LruCache<V> {
  private readonly map = new Map<string, V>()
  private readonly max: number
  constructor(max: number) {
    this.max = max
  }
  get(key: string): V | undefined {
    const v = this.map.get(key)
    if (v !== undefined) {
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }
  set(key: string, v: V) {
    this.map.delete(key)
    this.map.set(key, v)
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!)
  }
  get size() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
}

export const explanationCache = new LruCache<ExplainResponse>(CACHE_MAX)

export type Explanation = {
  state: ExplainState
  /** Start (or switch to) an explanation. The same request already loading or shown is ignored unless forced. */
  request: (req: ExplainRequest, opts?: { force?: boolean }) => void
  /** Abort any request in flight and return to idle. */
  reset: () => void
}

/**
 * One explanation at a time for the record identified by `identity`. A new request aborts the
 * previous one; aborted requests never surface as errors. The state resets (and any request is
 * aborted) when the identity changes or the component unmounts.
 */
export function useExplanation(identity: string | null): Explanation {
  const [box, setBox] = useState<{ id: string | null; s: ExplainState }>({ id: identity, s: IDLE })
  // Mirrors the committed state synchronously, so a second click in the same tick sees "loading".
  const latest = useRef(box)
  const inflight = useRef<AbortController | null>(null)

  const put = useCallback((id: string | null, s: ExplainState) => {
    latest.current = { id, s }
    setBox(latest.current)
  }, [])

  const abort = useCallback(() => {
    inflight.current?.abort()
    inflight.current = null
  }, [])

  useEffect(() => abort, [identity, abort])

  const request = useCallback(
    (req: ExplainRequest, opts?: { force?: boolean }) => {
      if (identity === null) return
      const key = explainCacheKey(req)
      const cur = latest.current.id === identity ? latest.current.s : IDLE
      if (!opts?.force && (cur.status === "loading" || cur.status === "success") && cur.key === key) return
      abort()
      const hit = opts?.force ? undefined : explanationCache.get(key)
      if (hit) {
        put(identity, { status: "success", key, req, data: hit })
        return
      }
      const ctrl = new AbortController()
      inflight.current = ctrl
      put(identity, { status: "loading", key, req })
      api.explain(req, ctrl.signal).then(
        (data) => {
          if (inflight.current !== ctrl) return
          inflight.current = null
          if (data.source === "ai") explanationCache.set(key, data)
          put(identity, { status: "success", key, req, data })
        },
        (e: unknown) => {
          if (e instanceof RequestAborted || inflight.current !== ctrl) return
          inflight.current = null
          put(identity, { status: "error", key, req, message: e instanceof ApiError ? e.message : "The explanation could not be loaded." })
        },
      )
    },
    [identity, abort, put],
  )

  const reset = useCallback(() => {
    abort()
    put(identity, IDLE)
  }, [identity, abort, put])

  return { state: box.id === identity ? box.s : IDLE, request, reset }
}
