import { Building, ChevronDown, Compass, Eraser, Layers, Play, Sparkles, SquareDashed, Zap } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { effectiveArea, REQUIREMENT_FIELDS, REQUIREMENTS, type FormState } from "@/lib/inputs"
import { cn } from "@/lib/utils"
import { BUILDING_TYPES, BUILDING_USES, VOLTAGE_CLASSES, type ProjectInputs, type Requirement } from "@/types/api"

type Props = {
  form: FormState
  errors: Partial<Record<keyof ProjectInputs, string>>
  inputs: ProjectInputs
  requirement: Requirement
  busy: boolean
  onChange: (key: keyof FormState, value: string) => void
  onRequirement: (r: Requirement) => void
  onEvaluate: () => void
  onClear: () => void
  onExample: () => void
}

const PRESETS: { label: string; values: Partial<FormState> }[] = [
  {
    label: "200 sq.m Detached",
    values: {
      plot_width_m: "10",
      plot_depth_m: "20",
      plot_area_sqm: "200",
      road_width_m: "9",
      building_use: "residential",
      building_type: "detached",
      building_height_m: "7.5",
      storeys: "2",
      built_up_area_sqm: "160",
      building_width_m: "7",
      building_depth_m: "12",
      front_gap_m: "4.5",
      left_gap_m: "1.5",
    },
  },
  {
    label: "Commercial 12m Road",
    values: {
      plot_width_m: "18",
      plot_depth_m: "30",
      plot_area_sqm: "540",
      road_width_m: "12",
      building_use: "commercial",
      building_type: "detached",
      building_height_m: "12",
      storeys: "3",
      built_up_area_sqm: "450",
      building_width_m: "12",
      building_depth_m: "20",
      front_gap_m: "6",
      left_gap_m: "3",
    },
  },
  {
    label: "Row Housing",
    values: {
      plot_width_m: "6",
      plot_depth_m: "15",
      plot_area_sqm: "90",
      road_width_m: "7.5",
      building_use: "residential",
      building_type: "row_housing",
      building_height_m: "6",
      storeys: "2",
      built_up_area_sqm: "80",
      building_width_m: "6",
      building_depth_m: "10",
      front_gap_m: "2",
      left_gap_m: "0",
    },
  },
]

export function ProjectInputsPanel(p: Props) {
  const needed = new Set(REQUIREMENT_FIELDS[p.requirement])
  const area = effectiveArea(p.inputs)
  const hasErrors = Object.keys(p.errors).length > 0

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    Object.entries(preset.values).forEach(([k, v]) => {
      p.onChange(k as keyof FormState, v ?? "")
    })
  }

  const num = (key: keyof FormState, label: string, unit: string, hint?: string) => (
    <Field key={key} id={key} label={label} unit={unit} hint={hint} error={p.errors[key]} needed={needed.has(key)}>
      <Input
        id={key}
        inputMode="decimal"
        autoComplete="off"
        value={p.form[key]}
        aria-invalid={!!p.errors[key]}
        aria-describedby={p.errors[key] ? `${key}-err` : undefined}
        onChange={(e) => p.onChange(key, e.target.value)}
        className="h-8.5 rounded-md border-slate-300 bg-white pr-12 font-mono text-[13px] text-slate-900 tabular-nums shadow-2xs focus-visible:border-blue-600 focus-visible:ring-1 focus-visible:ring-blue-600"
      />
    </Field>
  )

  const select = (key: "building_use" | "building_type" | "voltage_class", label: string, options: readonly (readonly [string, string])[]) => (
    <Field id={key} label={label} needed={needed.has(key)}>
      <Select value={p.form[key] || undefined} onValueChange={(v) => p.onChange(key, v === "__none" ? "" : v)}>
        <SelectTrigger id={key} size="sm" className="h-8.5 w-full rounded-md border-slate-300 bg-white text-[13px] text-slate-900 shadow-2xs focus-visible:border-blue-600 focus-visible:ring-1 focus-visible:ring-blue-600">
          <SelectValue placeholder="Not specified" />
        </SelectTrigger>
        <SelectContent className="border-slate-200 bg-white shadow-lg">
          <SelectItem value="__none">Not specified</SelectItem>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )

  return (
    <form
      className="flex h-full flex-col bg-white"
      aria-label="Project inputs"
      onSubmit={(e) => {
        e.preventDefault()
        p.onEvaluate()
      }}
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pt-3.5 pb-6 clean-scrollbar">
        {/* Quick-fill Presets */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase">
              Quick-Fill Presets
            </span>
            <span className="text-[10px] text-slate-400">Standard BMC Cases</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((pr) => (
              <button
                key={pr.label}
                type="button"
                onClick={() => applyPreset(pr)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-2xs transition-all hover:border-blue-300 hover:bg-blue-50/80 hover:text-blue-700 active:scale-98"
              >
                <Sparkles className="size-2.5 text-blue-500" aria-hidden />
                {pr.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target Requirement Selector */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 shadow-2xs">
          <Label htmlFor="requirement" className="font-mono text-[11px] font-semibold tracking-wide text-slate-600 uppercase mb-1.5 block">
            Requirement being examined
          </Label>
          <Select value={p.requirement} onValueChange={(v) => p.onRequirement(v as Requirement)}>
            <SelectTrigger id="requirement" className="h-9 w-full rounded-md border-slate-300 bg-white text-[13px] font-semibold text-slate-900 shadow-2xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white shadow-lg">
              {REQUIREMENTS.map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-slate-800">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-[11px] leading-tight text-slate-500">
            Fields marked <span className="font-mono font-bold text-blue-600">●</span> are required for this check. No assumptions are made.
          </p>
        </div>

        {/* Card 1: Plot Dimensions */}
        <CollapsibleCard title="1. Plot Dimensions" icon={<Compass className="size-3.5 text-blue-600" />} defaultOpen>
          <div className="grid grid-cols-2 gap-2.5">
            {num("plot_width_m", "Width / frontage", "m", "Along the road")}
            {num("plot_depth_m", "Depth", "m")}
          </div>
          {num("plot_area_sqm", "Plot area", "sq m", "Optional if width and depth are given")}
          {area !== undefined && (
            <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50/70 px-2.5 py-1.5 text-[11.5px] text-blue-900 shadow-2xs">
              <span className="font-medium">Calculated Area (W × D):</span>
              <span className="font-mono font-bold text-blue-700">{area} sq m</span>
            </div>
          )}
        </CollapsibleCard>

        {/* Card 2: Street Details */}
        <CollapsibleCard title="2. Street Details" icon={<Layers className="size-3.5 text-blue-600" />} defaultOpen>
          {num("road_width_m", "Width of street facing the plot", "m", "Determines front setback & FAR limits")}
        </CollapsibleCard>

        {/* Card 3: Building Parameters */}
        <CollapsibleCard title="3. Building Parameters" icon={<Building className="size-3.5 text-blue-600" />} defaultOpen>
          <div className="space-y-2.5">
            {select("building_use", "Building use", BUILDING_USES)}
            {select("building_type", "Building type", BUILDING_TYPES)}
            <div className="grid grid-cols-2 gap-2.5">
              {num("building_height_m", "Height", "m")}
              {num("storeys", "Storeys", "no.")}
            </div>
            {num("built_up_area_sqm", "Proposed built-up area", "sq m", "Fees use built-up area, not plot area")}
            {p.form.building_use === "cinema" && num("seating_capacity", "Seating capacity", "seats")}
          </div>
        </CollapsibleCard>

        {/* Card 4: Proposed Footprint */}
        <CollapsibleCard title="4. Proposed Footprint" badge="Design geometry" defaultOpen={false}>
          <p className="text-[11px] leading-snug text-slate-500">
            Optional. Visualizes the proposed massing and compares setbacks against statutory minimums.
          </p>
          <div className="grid grid-cols-2 gap-2.5 mt-2">
            {num("building_width_m", "Building width", "m")}
            {num("building_depth_m", "Building depth", "m")}
            {num("front_gap_m", "Gap from front", "m")}
            {num("left_gap_m", "Gap from left", "m")}
          </div>
        </CollapsibleCard>

        {/* Card 5: Services */}
        <CollapsibleCard title="5. Electrical Services" icon={<Zap className="size-3.5 text-blue-600" />} defaultOpen={false}>
          {select("voltage_class", "Nearby overhead line", VOLTAGE_CLASSES)}
        </CollapsibleCard>
      </div>

      {/* Action Footer */}
      <div className="no-print sticky bottom-0 space-y-2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.03)] backdrop-blur-xs">
        <Button
          type="submit"
          disabled={p.busy || hasErrors}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[13px] h-9 shadow-xs transition-all active:scale-99"
        >
          <Play className="size-3.5 mr-1.5 fill-current" aria-hidden /> Evaluate requirement
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={p.onExample}
            title="Fill example inputs (not a real case)"
            className="flex-1 border-slate-200 bg-slate-50 text-[11.5px] text-slate-700 hover:bg-slate-100"
          >
            <SquareDashed className="size-3 mr-1 text-slate-500" aria-hidden />
            Fill Example
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={p.onClear}
            className="text-[11.5px] text-slate-500 hover:text-slate-800"
            aria-label="Clear inputs"
          >
            <Eraser className="size-3 mr-1" /> Clear
          </Button>
        </div>
      </div>
    </form>
  )
}

function CollapsibleCard({
  title,
  icon,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string
  icon?: ReactNode
  badge?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-xs transition-all">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50/70 rounded-t-lg transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[12px] font-semibold text-slate-800">{title}</span>
          {badge && (
            <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[9px] font-medium tracking-wide text-slate-500 uppercase">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown className={cn("size-3.5 text-slate-400 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && <div className="space-y-2.5 border-t border-slate-100 p-3 pt-2.5">{children}</div>}
    </div>
  )
}

function Field(props: { id: string; label: string; unit?: string; hint?: string; error?: string; needed?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id} className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
        {props.needed && (
          <span className="font-mono text-[9px] text-blue-600 font-bold" aria-label="used by this requirement">
            ●
          </span>
        )}
        {props.label}
      </Label>
      <div className="relative">
        {props.children}
        {props.unit && (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] font-medium text-slate-500">
            {props.unit}
          </span>
        )}
      </div>
      {props.error ? (
        <p id={`${props.id}-err`} role="alert" className="text-[11px] font-medium text-rose-600">
          {props.error}
        </p>
      ) : (
        props.hint && <p className="text-[10.5px] text-slate-400 leading-tight">{props.hint}</p>
      )}
    </div>
  )
}

