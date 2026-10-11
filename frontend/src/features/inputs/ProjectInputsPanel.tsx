import { Building2, ChevronDown, Compass, Layers, Play, RotateCcw, SlidersHorizontal, Sparkles } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { effectiveArea, REQUIREMENT_FIELDS, REQUIREMENTS, type FormState } from "@/lib/inputs"
import { cn } from "@/lib/utils"
import { BUILDING_TYPES, BUILDING_USES, type ProjectInputs, type Requirement } from "@/types/api"

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

export function ProjectInputsPanel(p: Props) {
  const needed = new Set(REQUIREMENT_FIELDS[p.requirement])
  const area = effectiveArea(p.inputs)
  const hasErrors = Object.keys(p.errors).length > 0

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
        className="h-8 rounded-md border-white/15 bg-white/5 pr-10 text-[13px] text-white shadow-2xs focus-visible:border-white/40 focus-visible:ring-1 focus-visible:ring-white/40"
      />
    </Field>
  )

  const select = (key: "building_use" | "building_type" | "voltage_class", label: string, options: readonly (readonly [string, string])[]) => (
    <Field id={key} label={label} needed={needed.has(key)}>
      <Select value={p.form[key] || undefined} onValueChange={(v) => p.onChange(key, v === "__none" ? "" : v)}>
        <SelectTrigger id={key} size="sm" className="h-8 w-full rounded-md border-white/15 bg-white/5 text-[12.5px] text-white shadow-2xs focus-visible:border-white/40 focus-visible:ring-1 focus-visible:ring-white/40">
          <SelectValue placeholder="Not specified" />
        </SelectTrigger>
        <SelectContent className="border-white/15 bg-[#181513] text-white shadow-xl">
          <SelectItem value="__none" className="text-stone-300 focus:bg-white/10 focus:text-white">Not specified</SelectItem>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v} className="text-[12.5px] text-stone-200 focus:bg-white/10 focus:text-white">
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )

  return (
    <form
      className="flex h-full flex-col bg-transparent text-white"
      aria-label="Project inputs"
      onSubmit={(e) => {
        e.preventDefault()
        p.onEvaluate()
      }}
    >
      <div className="flex-1 space-y-3 overflow-y-auto px-3.5 pt-3 pb-4 clean-scrollbar">
        {/* Compact Header with Actions */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-1.5 text-white">
            <SlidersHorizontal className="size-3.5 text-amber-400" />
            <span className="text-[12px] font-semibold">Inputs & Parameters</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={p.onExample}
              title="Fill example inputs"
              aria-label="Example"
              className="h-7 px-2 text-[11px] font-medium text-stone-200 hover:bg-white/10 border-white/15 bg-white/5 shadow-2xs"
            >
              <Sparkles className="size-3 mr-1 text-amber-400" />
              Example
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={p.onClear}
              title="Clear all inputs"
              aria-label="Clear inputs"
              className="size-7 text-stone-400 hover:text-white hover:bg-white/10"
            >
              <RotateCcw className="size-3" />
            </Button>
          </div>
        </div>

        {/* Target Requirement Selector */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
          <Label htmlFor="requirement" className="text-[10.5px] font-bold text-stone-400 uppercase tracking-wider mb-1 block">
            Target Requirement
          </Label>
          <Select value={p.requirement} onValueChange={(v) => p.onRequirement(v as Requirement)}>
            <SelectTrigger id="requirement" className="h-8 w-full rounded-md border-white/15 bg-white/5 text-[12.5px] font-medium text-white shadow-2xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-white/15 bg-[#181513] text-white shadow-xl">
              {REQUIREMENTS.map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-[12.5px] text-stone-200 focus:bg-white/10 focus:text-white">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 1. Plot Dimensions Accordion */}
        <CollapsibleCard title="1. Plot Dimensions" icon={<Compass className="size-3.5 text-amber-400" />} defaultOpen>
          <div className="grid grid-cols-2 gap-2">
            {num("plot_width_m", "Width / frontage", "m", "Along the road")}
            {num("plot_depth_m", "Depth", "m")}
          </div>
          {num("plot_area_sqm", "Plot area", "sq m", "Optional if width and depth are given")}
          {area !== undefined && (
            <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
              <span className="font-medium">Calculated Area (W × D):</span>
              <span className="font-semibold text-amber-300">{area} sq m</span>
            </div>
          )}
        </CollapsibleCard>

        {/* 2. Road Details Accordion */}
        <CollapsibleCard title="2. Road Details" icon={<Layers className="size-3.5 text-amber-400" />} defaultOpen>
          {num("road_width_m", "Width of street facing the plot", "m", "Determines front setback & FAR limits")}
        </CollapsibleCard>

        {/* 3. Building Parameters Accordion */}
        <CollapsibleCard title="3. Building Type & Use" icon={<Building2 className="size-3.5 text-amber-400" />} defaultOpen>
          <div className="space-y-2">
            {select("building_use", "Building use", BUILDING_USES)}
            {select("building_type", "Building type", BUILDING_TYPES)}
            <div className="grid grid-cols-2 gap-2">
              {num("building_height_m", "Height", "m")}
              {num("storeys", "Storeys", "no.")}
            </div>
            {num("built_up_area_sqm", "Proposed built-up area", "sq m")}
            {p.form.building_use === "cinema" && num("seating_capacity", "Seating capacity", "seats")}
          </div>
        </CollapsibleCard>

        {/* 4. Proposed Footprint (Collapsible) */}
        <CollapsibleCard title="4. Proposed Footprint" badge="Optional" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-2">
            {num("building_width_m", "Building width", "m")}
            {num("building_depth_m", "Building depth", "m")}
            {num("front_gap_m", "Gap from front", "m")}
            {num("left_gap_m", "Gap from left", "m")}
          </div>
        </CollapsibleCard>
      </div>

      {/* Single Prominent Bottom Button (Landing Page Style Pill) */}
      <div className="no-print sticky bottom-0 border-t border-white/10 bg-[rgba(18,16,14,0.95)] p-3 backdrop-blur-md shadow-[0_-4px_16px_rgba(0,0,0,0.5)]">
        <Button
          type="submit"
          disabled={p.busy || hasErrors}
          aria-label="Evaluate requirement / Evaluate Compliance · नियम जांचें"
          className="w-full bg-white hover:bg-amber-400 text-black hover:text-black font-bold text-[13px] h-10 rounded-full shadow-[0_4px_24px_rgba(0,0,0,0.4)] border border-white/25 transition-all hover:shadow-[0_0_25px_rgba(245,158,11,0.35)] active:scale-98 flex items-center justify-center gap-2"
        >
          <Play className="size-3.5 fill-current" aria-hidden /> Evaluate Compliance · नियम जांचें →
        </Button>
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
    <div className="rounded-lg border border-white/10 bg-[rgba(22,19,17,0.6)] shadow-2xs transition-all">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/5 rounded-lg transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[11.5px] font-semibold text-white uppercase tracking-wider">{title}</span>
          {badge && (
            <span className="rounded bg-white/10 px-1.5 py-0.2 text-[9.5px] font-medium text-stone-300">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown className={cn("size-3.5 text-stone-400 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && <div className="space-y-2 border-t border-white/10 p-2.5 pt-2">{children}</div>}
    </div>
  )
}

function Field(props: { id: string; label: string; unit?: string; hint?: string; error?: string; needed?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <Label htmlFor={props.id} className="flex items-center gap-1.5 text-[11.5px] font-medium text-stone-300">
        {props.needed && (
          <span className="size-1.5 rounded-full bg-amber-400 shrink-0" aria-label="used by this requirement" />
        )}
        {props.label}
      </Label>
      <div className="relative">
        {props.children}
        {props.unit && (
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded bg-white/10 border border-white/10 px-1.5 py-0.2 text-[10px] font-medium text-stone-300">
            {props.unit}
          </span>
        )}
      </div>
      {props.error ? (
        <p id={`${props.id}-err`} role="alert" className="text-[11px] font-medium text-rose-400">
          {props.error}
        </p>
      ) : (
        props.hint && <p className="text-[10px] text-stone-400 leading-tight">{props.hint}</p>
      )}
    </div>
  )
}
