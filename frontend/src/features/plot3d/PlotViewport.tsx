import { Box, ChevronDown, Info, LayoutGrid, RotateCcw } from "lucide-react"
import { Component, lazy, memo, Suspense, useMemo, useRef, useState, type ReactNode } from "react"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import type { SceneModel } from "@/lib/geometry"
import { cn } from "@/lib/utils"
import { PlotPlan2D } from "./PlotPlan2D"
import type { CameraView, SceneHandle } from "./PlotScene3D"

const PlotScene3D = lazy(() => import("./PlotScene3D"))

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas")
    return !!(c.getContext("webgl2") || c.getContext("webgl"))
  } catch {
    return false
  }
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

type Props = { model: SceneModel; selected: string | null; onSelect: (k: string | null) => void }

/** Memoised: Voice Guide and narration updates in the Workbench must never re-render or remount the 3D scene. */
export const PlotViewport = memo(function PlotViewport({ model, selected, onSelect }: Props) {
  const reduced = useReducedMotion()
  const canWebgl = useMemo(webglAvailable, [])
  const [mode, setMode] = useState<"3d" | "plan">(canWebgl ? "3d" : "plan")
  const [legendOpen, setLegendOpen] = useState(false)
  const scene = useRef<SceneHandle>(null)
  const view = (v: CameraView) => scene.current?.setView(v)

  const plan = model.plot ? <PlotPlan2D model={model} selected={selected} onSelect={onSelect} /> : null

  return (
    <div className="relative flex h-full min-h-[400px] flex-col bg-slate-50 overflow-hidden">
      {/* Floating Canvas Controls (Top-Left Pill) */}
      <div className="no-print pointer-events-auto absolute top-3 left-3 z-20 flex items-center gap-1 rounded-full border border-slate-200/90 bg-white/95 p-1 shadow-sm backdrop-blur-md">
        <button
          type="button"
          disabled={!canWebgl}
          onClick={() => setMode("3d")}
          aria-pressed={mode === "3d"}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-all",
            mode === "3d" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900",
            !canWebgl && "opacity-50 cursor-not-allowed",
          )}
        >
          <Box className="size-3.5" aria-hidden /> 3D View
        </button>
        <button
          type="button"
          onClick={() => setMode("plan")}
          aria-pressed={mode === "plan"}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-all",
            mode === "plan" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900",
          )}
        >
          <LayoutGrid className="size-3.5" aria-hidden /> 2D Plan
        </button>
        {mode === "3d" && model.plot && (
          <button
            type="button"
            onClick={() => view("iso")}
            title="Reset View"
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 border-l border-slate-200 pl-2"
          >
            <RotateCcw className="size-3" aria-hidden /> Reset View
          </button>
        )}
        {!canWebgl && (
          <span className="px-2 text-[10.5px] font-medium text-slate-500">
            3D unavailable (no WebGL) — showing plan
          </span>
        )}
      </div>

      {/* Floating Collapsible Legend Chip (Top-Right) */}
      {model.plot && (
        <div className="no-print pointer-events-auto absolute top-3 right-3 z-20">
          <button
            type="button"
            onClick={() => setLegendOpen((o) => !o)}
            aria-expanded={legendOpen}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/95 px-3 py-1.5 text-[11.5px] font-medium text-slate-700 shadow-sm backdrop-blur-md hover:bg-slate-50 transition-all"
          >
            <Info className="size-3.5 text-blue-600" aria-hidden />
            <span>Legend</span>
            <ChevronDown className={cn("size-3 text-slate-400 transition-transform duration-200", legendOpen && "rotate-180")} />
          </button>
          {legendOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-lg backdrop-blur-md transition-all">
              <p className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-2">Visual Mapping Legend</p>
              <ul className="space-y-1.5 text-[11px] text-slate-600">
                <li className="flex items-center gap-2">
                  <span className="size-3 rounded-xs border border-emerald-500 bg-emerald-500/30 shrink-0" />
                  <span>Verified setback (Rule-linked)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-3 rounded-xs border border-amber-500 bg-amber-500/30 shrink-0" />
                  <span>Unresolved / Needs inputs</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-3 rounded-xs border border-rose-500 bg-rose-500/30 shrink-0" />
                  <span>Below statutory minimum</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-3 rounded-xs border border-slate-400 bg-slate-200 shrink-0" />
                  <span>Proposed building massing</span>
                </li>
              </ul>
              <p className="mt-2.5 border-t border-slate-100 pt-1.5 text-[10px] text-slate-400">
                Visual explanation only — not a building approval.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Hero Canvas Area */}
      <div className="relative flex-1 overflow-hidden drafting-grid">
        {!model.plot ? (
          <EmptyPlot />
        ) : mode === "3d" ? (
          <SceneBoundary fallback={<div className="h-full p-4">{plan}</div>}>
            <Suspense fallback={<div className="grid h-full place-items-center text-xs text-slate-500">Loading 3D workspace…</div>}>
              <PlotScene3D ref={scene} model={model} selected={selected} onSelect={onSelect} reducedMotion={reduced} />
            </Suspense>
          </SceneBoundary>
        ) : (
          <div className="h-full p-6 pt-16">{plan}</div>
        )}
      </div>
    </div>
  )
})

function EmptyPlot() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-sm rounded-2xl border border-slate-200/90 bg-white/95 p-6 text-center shadow-sm backdrop-blur-xs">
        <div className="mx-auto mb-3.5 grid size-12 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-blue-600">
          <LayoutGrid className="size-6" aria-hidden />
        </div>
        <p className="text-sm font-semibold text-slate-900">No plot drawn yet</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">
          Enter the plot <strong>width</strong> and <strong>depth</strong> in Project Inputs. MIRA never infers dimensions from plot area alone.
        </p>
      </div>
    </div>
  )
}
