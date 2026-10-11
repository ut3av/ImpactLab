import type { CalcResult, ProjectInputs, Status, Zone } from "@/types/api"

/** Plot coordinates: x runs along the road frontage (0 = left boundary), y runs from the road edge (0) to the rear. */
export type Rect = { x: number; y: number; w: number; d: number }

export type SceneZone = Rect & {
  key: string
  side: Zone["side"]
  depth: number
  label: string
  rule: string
  calcType: string
  state: "verified" | "computed" | "unresolved"
  check: Zone["check"]
  proposedGap?: number | null
}

export type UnresolvedEdge = { key: string; side: Zone["side"]; calcType: string; label: string }

export type SceneModel = {
  plot: { w: number; d: number } | null
  road: { width: number | null } | null
  zones: SceneZone[]
  unresolved: UnresolvedEdge[]
  building: (Rect & { h: number; heightGiven: boolean; positionGiven: boolean }) | null
  conflicts: SceneZone[]
}

const SIDE_LABEL: Record<Zone["side"], string> = { front: "Front", rear: "Rear", left: "Left side", right: "Right side" }
const CALC_SIDES: Record<string, Zone["side"][]> = {
  front_open_space: ["front"],
  rear_open_space: ["rear"],
  side_open_space: ["left", "right"],
}

function stateFor(status: Status): SceneZone["state"] {
  if (status === "VERIFIED") return "verified"
  if (status === "CALCULATION_COMPLETED") return "computed"
  return "unresolved"
}

export function zoneKey(calcType: string, side: string) {
  return `${calcType}:${side}`
}

export function buildScene(inputs: ProjectInputs, calcs: CalcResult[]): SceneModel {
  const W = inputs.plot_width_m
  const D = inputs.plot_depth_m
  const plot = W && D ? { w: W, d: D } : null
  const zones: SceneZone[] = []
  const unresolved: UnresolvedEdge[] = []

  const depthOf = (side: Zone["side"]) => {
    for (const c of calcs) for (const z of c.zones) if (z.side === side) return z.depth_m
    return 0
  }

  for (const c of calcs) {
    const sides = CALC_SIDES[c.calc_type]
    if (!sides) continue
    const drawn = new Set(c.zones.map((z) => z.side))
    for (const side of sides) {
      if (!drawn.has(side)) {
        unresolved.push({ key: zoneKey(c.calc_type, side), side, calcType: c.calc_type, label: `${SIDE_LABEL[side]} open space — unresolved` })
      }
    }
    if (!plot) continue
    for (const z of c.zones) {
      if (z.depth_m <= 0) continue
      const dep = Math.min(z.depth_m, z.side === "front" || z.side === "rear" ? plot.d : plot.w)
      let r: Rect
      if (z.side === "front") r = { x: 0, y: 0, w: plot.w, d: dep }
      else if (z.side === "rear") r = { x: 0, y: plot.d - dep, w: plot.w, d: dep }
      else {
        const f = Math.min(depthOf("front"), plot.d)
        const b = Math.min(depthOf("rear"), plot.d - f)
        r = { x: z.side === "left" ? 0 : plot.w - dep, y: f, w: dep, d: Math.max(plot.d - f - b, 0) }
      }
      zones.push({
        ...r,
        key: zoneKey(c.calc_type, z.side),
        side: z.side,
        depth: z.depth_m,
        label: z.label,
        rule: z.rule,
        calcType: c.calc_type,
        state: stateFor(c.status),
        check: z.check,
        proposedGap: z.proposed_gap_m,
      })
    }
  }

  let building: SceneModel["building"] = null
  if (plot && inputs.building_width_m && inputs.building_depth_m) {
    const bw = Math.min(inputs.building_width_m, plot.w)
    const bd = Math.min(inputs.building_depth_m, plot.d)
    const positionGiven = inputs.left_gap_m !== undefined && inputs.front_gap_m !== undefined
    building = {
      x: inputs.left_gap_m ?? (plot.w - bw) / 2,
      y: inputs.front_gap_m ?? (plot.d - bd) / 2,
      w: bw,
      d: bd,
      h: inputs.building_height_m ?? 3,
      heightGiven: inputs.building_height_m !== undefined,
      positionGiven,
    }
  }

  const roadWidth = inputs.road_width_m ?? null
  return {
    plot,
    road: plot ? { width: roadWidth } : null,
    zones,
    unresolved,
    building,
    conflicts: zones.filter((z) => z.check === "below_minimum"),
  }
}

export const ZONE_COLORS = {
  verified: "#2f4fc7",
  computed: "#2f4fc7",
  unresolved: "#c08a2a",
  conflict: "#b9442f",
} as const
