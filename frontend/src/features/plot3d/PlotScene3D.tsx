import { CameraControls, Edges, Grid, Html, Line } from "@react-three/drei"
import { Canvas, type ThreeEvent } from "@react-three/fiber"
import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from "react"
import { ZONE_COLORS, type SceneModel, type SceneZone } from "@/lib/geometry"

export type CameraView = "iso" | "top" | "front"
export type SceneHandle = { setView: (v: CameraView) => void }

type Props = {
  model: SceneModel
  selected: string | null
  onSelect: (key: string | null) => void
  reducedMotion: boolean
}

/** Html labels portal into a wrapper we own, so unmounting the canvas never removes their container first. */
const PortalCtx = createContext<RefObject<HTMLDivElement> | null>(null)

const PAPER = "#f8fafc"
const INK = "#0f172a"

/** Lightweight scene: flat planes, one box, a few lines and labels; renders on demand only. */
const PlotScene3D = forwardRef<SceneHandle, Props>(function PlotScene3D({ model, selected, onSelect, reducedMotion }, ref) {
  const controls = useRef<CameraControls>(null)
  const wrap = useRef<HTMLDivElement>(null!)
  const plot = model.plot!
  const roadW = model.road?.width ?? 0
  const span = Math.max(plot.w, plot.d + roadW, 10)

  const setView = (v: CameraView) => {
    const c = controls.current
    if (!c) return
    const d = span * 1.35
    const cz = roadW / 2
    const anim = !reducedMotion
    if (v === "top") void c.setLookAt(0, d * 1.25, cz + 0.001, 0, 0, cz, anim)
    else if (v === "front") void c.setLookAt(0, d * 0.35, plot.d / 2 + roadW + d * 0.9, 0, 1, 0, anim)
    else void c.setLookAt(-d * 0.75, d * 0.8, plot.d / 2 + d * 0.85, 0, 0, cz * 0.5, anim)
  }
  useImperativeHandle(ref, () => ({ setView }))
  useEffect(() => {
    setView("iso")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plot.w, plot.d, roadW])

  return (
    <div ref={wrap} className="relative h-full w-full">
    <PortalCtx.Provider value={wrap}>
    <Canvas
      frameloop="demand"
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "low-power" }}
      camera={{ fov: 38, near: 0.1, far: 2000, position: [-span, span, span] }}
      onPointerMissed={() => onSelect(null)}
      aria-label="Interactive 3D plot view"
    >
      <color attach="background" args={[PAPER]} />
      <ambientLight intensity={0.95} />
      <directionalLight position={[-20, 35, 25]} intensity={1.2} />
      <hemisphereLight args={["#ffffff", "#e2e8f0", 0.45]} />
      <Grid
        position={[0, -0.01, 0]}
        args={[200, 200]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#e2e8f0"
        sectionSize={5}
        sectionThickness={0.9}
        sectionColor="#cbd5e1"
        fadeDistance={span * 4}
        fadeStrength={1.5}
        infiniteGrid
      />
      <PortalCtx.Provider value={wrap}>
        <Plot model={model} selected={selected} onSelect={onSelect} />
      </PortalCtx.Provider>
      <CameraControls ref={controls} makeDefault minDistance={4} maxDistance={span * 6} maxPolarAngle={Math.PI / 2.05} smoothTime={reducedMotion ? 0 : 0.25} />
    </Canvas>
    </PortalCtx.Provider>
    </div>
  )
})

export default PlotScene3D

function toWorld(plot: { w: number; d: number }, x: number, y: number): [number, number] {
  return [x - plot.w / 2, plot.d / 2 - y]
}

function Plot({ model, selected, onSelect }: { model: SceneModel; selected: string | null; onSelect: (k: string | null) => void }) {
  const plot = model.plot!
  const roadW = model.road?.width
  const hw = plot.w / 2
  const hd = plot.d / 2
  const boundary = useMemo(
    () => [[-hw, 0.03, hd], [hw, 0.03, hd], [hw, 0.03, -hd], [-hw, 0.03, -hd], [-hw, 0.03, hd]] as [number, number, number][],
    [hw, hd],
  )
  const roadDepth = roadW ?? 6

  return (
    <group>
      {/* Plot surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} onClick={(e) => { e.stopPropagation(); onSelect("plot") }}>
        <planeGeometry args={[plot.w, plot.d]} />
        <meshStandardMaterial color={selected === "plot" ? "#f1f5f9" : "#ffffff"} />
      </mesh>
      <Line points={boundary} color={INK} lineWidth={2.2} />

      {/* Road along the frontage (realistic asphalt tone) */}
      <group onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect("road") }}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, hd + roadDepth / 2]}>
          <planeGeometry args={[Math.max(plot.w * 2.2, 30), roadDepth]} />
          <meshStandardMaterial color={roadW ? "#334155" : "#475569"} transparent opacity={roadW ? 0.95 : 0.65} />
        </mesh>
        <Line
          points={[[-Math.max(plot.w * 1.1, 15), 0.02, hd + roadDepth / 2], [Math.max(plot.w * 1.1, 15), 0.02, hd + roadDepth / 2]]}
          color="#ffffff"
          lineWidth={1.6}
          dashed
          dashSize={1.2}
          gapSize={1}
        />
      </group>
      <Tag position={[-Math.max(plot.w * 0.85, 12), 0.05, hd + roadDepth / 2]} tone="neutral">
        {roadW ? `Street ${roadW} m` : "Street width not given"}
      </Tag>

      {/* Plot dimensions (user input) */}
      <Line points={[[-hw, 0.04, hd + 0.35], [hw, 0.04, hd + 0.35]]} color="#475569" lineWidth={1.2} />
      <Tag position={[0, 0.05, hd + 0.9]} tone="ink">{`${plot.w} m`}</Tag>
      <Line points={[[-hw - 0.35, 0.04, hd], [-hw - 0.35, 0.04, -hd]]} color="#475569" lineWidth={1.2} />
      <Tag position={[-hw - 1.3, 0.05, 0]} tone="ink">{`${plot.d} m`}</Tag>

      {model.zones.map((z) => (
        <ZoneMesh key={z.key} z={z} plot={plot} selected={selected === z.key} onSelect={onSelect} />
      ))}

      {model.unresolved.map((u) => {
        const pts: Record<string, [number, number, number][]> = {
          front: [[-hw, 0.06, hd - 0.15], [hw, 0.06, hd - 0.15]],
          rear: [[-hw, 0.06, -hd + 0.15], [hw, 0.06, -hd + 0.15]],
          left: [[-hw + 0.15, 0.06, hd], [-hw + 0.15, 0.06, -hd]],
          right: [[hw - 0.15, 0.06, hd], [hw - 0.15, 0.06, -hd]],
        }
        const mid = pts[u.side]
        const pos: [number, number, number] = [(mid[0][0] + mid[1][0]) / 2, 0.1, (mid[0][2] + mid[1][2]) / 2]
        return (
          <group key={u.key} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(u.key) }}>
            <Line points={mid} color={ZONE_COLORS.unresolved} lineWidth={3} dashed dashSize={0.6} gapSize={0.4} />
            <Tag position={pos} tone="review" onClick={() => onSelect(u.key)}>
              {u.label}
            </Tag>
          </group>
        )
      })}

      {model.building && <Building b={model.building} plot={plot} selected={selected === "building"} onSelect={onSelect} />}
    </group>
  )
}

function ZoneMesh({ z, plot, selected, onSelect }: { z: SceneZone; plot: { w: number; d: number }; selected: boolean; onSelect: (k: string) => void }) {
  const [hover, setHover] = useState(false)
  const [cx, cz] = toWorld(plot, z.x + z.w / 2, z.y + z.d / 2)
  const color = z.check === "below_minimum" ? ZONE_COLORS.conflict : ZONE_COLORS[z.state]
  const opacity = selected ? 0.55 : hover ? 0.42 : 0.28
  useEffect(() => {
    document.body.style.cursor = hover ? "pointer" : ""
    return () => {
      document.body.style.cursor = ""
    }
  }, [hover])
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[cx, 0.02 + (selected ? 0.01 : 0), cz]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(z.key)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
        }}
        onPointerOut={() => setHover(false)}
      >
        <planeGeometry args={[Math.max(z.w, 0.01), Math.max(z.d, 0.01)]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
        <Edges color={color} />
      </mesh>
      <Tag position={[cx, 0.12, cz]} tone={z.check === "below_minimum" ? "alert" : z.state === "unresolved" ? "review" : "cobalt"} onClick={() => onSelect(z.key)}>
        {`${z.depth} m · R${z.rule}`}
      </Tag>
    </group>
  )
}

function Building({ b, plot, selected, onSelect }: { b: NonNullable<SceneModel["building"]>; plot: { w: number; d: number }; selected: boolean; onSelect: (k: string) => void }) {
  const [cx, cz] = toWorld(plot, b.x + b.w / 2, b.y + b.d / 2)
  const portal = useContext(PortalCtx)
  return (
    <mesh
      position={[cx, b.h / 2, cz]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect("building")
      }}
    >
      <boxGeometry args={[b.w, b.h, b.d]} />
      <meshStandardMaterial color={selected ? "#cbd5e1" : "#e2e8f0"} transparent opacity={0.88} roughness={0.4} />
      <Edges color="#475569" />
      <Html position={[0, b.h / 2 + 0.6, 0]} center zIndexRange={[20, 0]} portal={portal ?? undefined}>
        <span className="pointer-events-none rounded-md border border-slate-200 bg-white/95 px-2 py-0.5 font-mono text-[10px] whitespace-nowrap text-slate-800 shadow-sm">
          Proposed building · illustrative{b.heightGiven ? ` · ${b.h} m` : " · height not given"}
        </span>
      </Html>
    </mesh>
  )
}

const TAG_TONES = {
  ink: "border-slate-300 bg-white text-slate-800 shadow-xs",
  neutral: "border-slate-200 bg-white/95 text-slate-600 shadow-xs",
  cobalt: "border-blue-300 bg-blue-50 text-blue-700 shadow-xs font-semibold",
  review: "border-amber-300 bg-amber-50 text-amber-800 shadow-xs font-semibold",
  alert: "border-rose-300 bg-rose-50 text-rose-700 shadow-xs font-semibold",
} as const

function Tag({ position, tone, children, onClick }: { position: [number, number, number]; tone: keyof typeof TAG_TONES; children: string; onClick?: () => void }) {
  const portal = useContext(PortalCtx)
  return (
    <Html position={position} center zIndexRange={[10, 0]} portal={portal ?? undefined}>
      <button
        type="button"
        tabIndex={-1}
        onClick={onClick}
        className={`rounded-md border px-2 py-0.5 font-mono text-[10px] whitespace-nowrap shadow-xs ${TAG_TONES[tone]} ${onClick ? "cursor-pointer hover:border-blue-400" : "pointer-events-none"}`}
      >
        {children}
      </button>
    </Html>
  )
}
