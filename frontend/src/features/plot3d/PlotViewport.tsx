import { Box, Crosshair, Eye, LayoutGrid, RotateCcw } from "lucide-react"
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
  const scene = useRef<SceneHandle>(null)
  const view = (v: CameraView) => scene.current?.setView(v)

  const plan = model.plot ? <PlotPlan2D model={model} selected={selected} onSelect={onSelect} /> : null

  return (
    <div className="relative flex h-full min-h-[360px] flex-col bg-slate-50">
      {/* Floating View Controls Pill */}
      <div className="no-print pointer-events-auto absolute top-3 left-3 z-20 flex flex-wrap items-center gap-1 rounded-full border border-slate-200/90 bg-white/95 p-1 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-1" role="group" aria-label="View mode">
          <button
            type="button"
            disabled={!canWebgl}
            onClick={() => setMode("3d")}
            aria-pressed={mode === "3d"}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-all",
              mode === "3d" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900",
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
              mode === "plan" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900",
            )}
          >
            <LayoutGrid className="size-3.5" aria-hidden /> 2D Plan View
          </button>
          {!canWebgl && (
            <span className="ml-1 px-2 font-mono text-[10.5px] font-medium text-slate-500">
              3D unavailable (no WebGL) — showing plan
            </span>
          )}
        </div>
        {mode === "3d" && model.plot && (
          <div className="flex items-center gap-0.5 border-l border-slate-200 pl-1" role="group" aria-label="Camera controls">
            <button
              type="button"
              onClick={() => view("iso")}
              title="Reset View"
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <RotateCcw className="size-3" aria-hidden /> Reset Camera
            </button>
            <button
              type="button"
              onClick={() => view("top")}
              title="Top View"
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Crosshair className="size-3" aria-hidden /> Top
            </button>
            <button
              type="button"
              onClick={() => view("front")}
              title="View from the street"
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Eye className="size-3" aria-hidden /> Street
            </button>
          </div>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        {!model.plot ? (
          <EmptyPlot />
        ) : mode === "3d" ? (
          <SceneBoundary fallback={<div className="h-full p-4">{plan}</div>}>
            <Suspense fallback={<div className="grid h-full place-items-center font-mono text-xs text-slate-500">Loading 3D workspace…</div>}>
              <PlotScene3D ref={scene} model={model} selected={selected} onSelect={onSelect} reducedMotion={reduced} />
            </Suspense>
          </SceneBoundary>
        ) : (
          <div className="h-full p-4 pt-14">{plan}</div>
        )}
        {model.plot && <Legend model={model} />}
      </div>
    </div>
  )
})

function EmptyPlot() {
  return (
    <div className="drafting-grid grid h-full place-items-center p-6">
      <div className="max-w-sm rounded-xl border border-slate-200/90 bg-white/95 p-6 text-center shadow-sm backdrop-blur-xs">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-blue-600">
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

function Legend({ model }: { model: SceneModel }) {
  const items = [
    { swatch: <span className="block size-3 rounded-xs border border-emerald-500 bg-emerald-500/30" />, label: "Verified minimum open space (Rule-linked)" },
    { swatch: <span className="hatch-amber block size-3 rounded-xs border border-amber-500" />, label: "Unresolved / Needs information" },
    { swatch: <span className="block size-3 rounded-xs border border-rose-500 bg-rose-500/30" />, label: "Proposed gap below computed minimum" },
    { swatch: <span className="block size-3 rounded-xs border border-slate-400 bg-slate-200" />, label: "Proposed building envelope" },
  ]
  return (
    <div className="pointer-events-none absolute top-3 right-3 max-w-[270px] rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-md backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1">
        <p className="font-mono text-[10.5px] font-bold tracking-wider text-slate-600 uppercase">Visual Legend</p>
        <span className="font-mono text-[10px] text-slate-400">Rule-to-Geometry</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2 text-[11px] font-medium text-slate-700">
            {i.swatch}
            <span>{i.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-slate-100 pt-1.5 text-[10px] leading-snug text-slate-400">
        Visual explanation only — not a building plan or approval.
        {model.conflicts.length > 0 && <span className="mt-0.5 block font-semibold text-rose-600">{model.conflicts.length} gap(s) below statutory minimum.</span>}
      </p>
    </div>
  )
}
