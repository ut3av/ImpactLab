import { Box, Crosshair, Eye, LayoutGrid, RotateCcw } from "lucide-react"
import { Component, lazy, memo, Suspense, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { ZONE_COLORS, type SceneModel } from "@/lib/geometry"
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
    <div className="relative flex h-full min-h-[340px] flex-col">
      <div className="no-print flex items-center justify-between gap-2 border-b bg-paper/80 px-3 py-2">
        <div className="flex items-center gap-1" role="group" aria-label="View mode">
          <Button size="xs" variant={mode === "3d" ? "secondary" : "ghost"} disabled={!canWebgl} onClick={() => setMode("3d")} aria-pressed={mode === "3d"}>
            <Box className="size-3" aria-hidden /> 3D
          </Button>
          <Button size="xs" variant={mode === "plan" ? "secondary" : "ghost"} onClick={() => setMode("plan")} aria-pressed={mode === "plan"}>
            <LayoutGrid className="size-3" aria-hidden /> Plan
          </Button>
          {!canWebgl && <span className="ml-1 text-[11px] text-muted-foreground">3D unavailable (no WebGL) — showing plan</span>}
        </div>
        {mode === "3d" && model.plot && (
          <div className="flex items-center gap-1" role="group" aria-label="Camera">
            <Button size="xs" variant="ghost" onClick={() => view("iso")} title="Reset view">
              <RotateCcw className="size-3" aria-hidden /> Reset
            </Button>
            <Button size="xs" variant="ghost" onClick={() => view("top")} title="Top view">
              <Crosshair className="size-3" aria-hidden /> Top
            </Button>
            <Button size="xs" variant="ghost" onClick={() => view("front")} title="View from the street">
              <Eye className="size-3" aria-hidden /> Street
            </Button>
          </div>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        {!model.plot ? (
          <EmptyPlot />
        ) : mode === "3d" ? (
          <SceneBoundary fallback={<div className="h-full p-4">{plan}</div>}>
            <Suspense fallback={<div className="grid h-full place-items-center font-mono text-xs text-muted-foreground">Loading 3D view…</div>}>
              <PlotScene3D ref={scene} model={model} selected={selected} onSelect={onSelect} reducedMotion={reduced} />
            </Suspense>
          </SceneBoundary>
        ) : (
          <div className="h-full p-4">{plan}</div>
        )}
        {model.plot && <Legend model={model} />}
      </div>
    </div>
  )
})

function EmptyPlot() {
  return (
    <div className="drafting-grid grid h-full place-items-center p-6">
      <div className="max-w-xs text-center">
        <div className="mx-auto mb-3 grid size-10 place-items-center rounded-sm border border-dashed border-ink/30">
          <LayoutGrid className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <p className="text-sm font-medium text-ink">No plot drawn yet</p>
        <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
          Enter the plot <strong>width</strong> and <strong>depth</strong>. MIRA never infers dimensions from plot area alone.
        </p>
      </div>
    </div>
  )
}

function Legend({ model }: { model: SceneModel }) {
  const items = [
    { swatch: <span className="block size-3 rounded-[2px] border" style={{ background: `${ZONE_COLORS.verified}44`, borderColor: ZONE_COLORS.verified }} />, label: "Verified minimum open space (rule-linked)" },
    { swatch: <span className="hatch-amber block size-3 rounded-[2px] border border-review" />, label: "Unresolved / needs information" },
    { swatch: <span className="block size-3 rounded-[2px] border" style={{ background: `${ZONE_COLORS.conflict}44`, borderColor: ZONE_COLORS.conflict }} />, label: "Proposed gap below computed minimum" },
    { swatch: <span className="block size-3 rounded-[2px] border border-ink/60 bg-[#ddd6c8]" />, label: "Proposed design (illustrative)" },
  ]
  return (
    <div className="pointer-events-none absolute top-3 right-3 max-w-[250px] rounded-sm border bg-paper/95 p-2.5 shadow-sm">
      <p className="panel-label mb-1.5">Legend</p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2 text-[11px] text-ink/85">
            {i.swatch}
            {i.label}
          </li>
        ))}
      </ul>
      <p className={cn("mt-2 border-t pt-1.5 text-[10.5px] leading-snug text-muted-foreground")}>
        Visual explanation only — not a building plan or approval.
        {model.conflicts.length > 0 && <span className="block text-alert">{model.conflicts.length} gap(s) below a computed minimum.</span>}
      </p>
    </div>
  )
}
