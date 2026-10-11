import { ZONE_COLORS, type SceneModel } from "@/lib/geometry"

/** Top-down SVG plan: the accessible / no-WebGL equivalent of the 3D scene. */
export function PlotPlan2D({ model, selected, onSelect }: { model: SceneModel; selected: string | null; onSelect: (k: string | null) => void }) {
  const plot = model.plot!
  const roadD = model.road?.width ?? 6
  const pad = Math.max(plot.w, plot.d) * 0.18 + 2
  const vbW = plot.w + pad * 2
  const vbH = plot.d + roadD + pad * 2
  // SVG y grows downward: rear at the top, road at the bottom (as seen from the street).
  const Y = (y: number) => pad + (plot.d - y)
  const fs = Math.max(vbW, vbH) / 38

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className="h-full w-full"
      role="img"
      aria-label={`Plan view of a ${plot.w} m by ${plot.d} m plot`}
      onClick={() => onSelect(null)}
    >
      <defs>
        <pattern id="amber-hatch" width="0.8" height="0.8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="0.8" height="0.8" fill={ZONE_COLORS.unresolved} fillOpacity="0.12" />
          <line x1="0" y1="0" x2="0" y2="0.8" stroke={ZONE_COLORS.unresolved} strokeWidth="0.25" strokeOpacity="0.6" />
        </pattern>
      </defs>
      <rect x={0} y={pad + plot.d} width={vbW} height={roadD} fill={model.road?.width ? "#334155" : "#475569"} opacity={model.road?.width ? 1 : 0.7} />
      <line x1={0} x2={vbW} y1={pad + plot.d + roadD / 2} y2={pad + plot.d + roadD / 2} stroke="#ffffff" strokeWidth={fs * 0.14} strokeDasharray={`${fs} ${fs * 0.8}`} />
      <text x={fs * 0.6} y={pad + plot.d + roadD / 2 - fs * 0.3} fontSize={fs * 0.85} fill="#f8fafc" fontFamily="Geist Mono Variable, monospace" fontWeight="600">
        {model.road?.width ? `Street ${model.road.width} m` : "Street width not given"}
      </text>

      <rect x={pad} y={pad} width={plot.w} height={plot.d} fill="#ffffff" stroke="#0f172a" strokeWidth={fs * 0.12} />

      {model.zones.map((z) => {
        const color = z.check === "below_minimum" ? ZONE_COLORS.conflict : ZONE_COLORS[z.state]
        const sel = selected === z.key
        return (
          <g
            key={z.key}
            role="button"
            tabIndex={0}
            aria-label={`${z.label}, rule ${z.rule}`}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(z.key)
            }}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(z.key)}
            className="cursor-pointer focus:outline-none"
          >
            <rect
              x={pad + z.x}
              y={Y(z.y + z.d)}
              width={z.w}
              height={z.d}
              fill={z.state === "unresolved" ? "url(#amber-hatch)" : color}
              fillOpacity={z.state === "unresolved" ? 1 : sel ? 0.5 : 0.25}
              stroke={color}
              strokeWidth={fs * (sel ? 0.16 : 0.07)}
            />
            <text
              x={pad + z.x + z.w / 2}
              y={Y(z.y + z.d / 2)}
              fontSize={Math.min(fs * 0.75, Math.max(z.w, z.d) * 0.12)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={color}
              fontFamily="Geist Mono Variable, monospace"
              transform={z.w < z.d * 0.5 ? `rotate(-90 ${pad + z.x + z.w / 2} ${Y(z.y + z.d / 2)})` : undefined}
            >
              {`${z.depth} m · R${z.rule}`}
            </text>
          </g>
        )
      })}

      {model.unresolved.map((u) => {
        const seg = {
          front: [pad, Y(0), pad + plot.w, Y(0)],
          rear: [pad, Y(plot.d), pad + plot.w, Y(plot.d)],
          left: [pad, Y(0), pad, Y(plot.d)],
          right: [pad + plot.w, Y(0), pad + plot.w, Y(plot.d)],
        }[u.side]
        return (
          <line
            key={u.key}
            x1={seg[0]}
            y1={seg[1]}
            x2={seg[2]}
            y2={seg[3]}
            stroke={ZONE_COLORS.unresolved}
            strokeWidth={fs * 0.3}
            strokeDasharray={`${fs * 0.6} ${fs * 0.4}`}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(u.key)
            }}
          >
            <title>{u.label}</title>
          </line>
        )
      })}

      {model.building && (
        <g
          onClick={(e) => {
            e.stopPropagation()
            onSelect("building")
          }}
          className="cursor-pointer"
        >
          <rect
            x={pad + model.building.x}
            y={Y(model.building.y + model.building.d)}
            width={model.building.w}
            height={model.building.d}
            fill={selected === "building" ? "#cbd5e1" : "#e2e8f0"}
            stroke="#475569"
            strokeWidth={fs * 0.08}
          />
          <text x={pad + model.building.x + model.building.w / 2} y={Y(model.building.y + model.building.d / 2)} fontSize={Math.min(fs * 0.7, model.building.w * 0.1)} textAnchor="middle" fill="#0f172a" fontFamily="Geist Mono Variable, monospace" fontWeight="600">
            <tspan x={pad + model.building.x + model.building.w / 2} dy="-0.3em">Proposed</tspan>
            <tspan x={pad + model.building.x + model.building.w / 2} dy="1.2em">(illustrative)</tspan>
          </text>
        </g>
      )}

      <text x={pad + plot.w / 2} y={pad - fs * 0.6} fontSize={fs * 0.8} textAnchor="middle" fill="#475569" fontFamily="Geist Mono Variable, monospace" fontWeight="600">
        {`${plot.w} m`}
      </text>
      <text x={pad - fs * 0.6} y={pad + plot.d / 2} fontSize={fs * 0.8} textAnchor="end" dominantBaseline="middle" fill="#475569" fontFamily="Geist Mono Variable, monospace" fontWeight="600">
        {`${plot.d} m`}
      </text>
    </svg>
  )
}
