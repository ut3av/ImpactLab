import { Eraser, Play, SquareDashed } from "lucide-react"
import type { ReactNode } from "react"
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
        className="h-8 bg-card pr-12 font-mono text-[13px] tabular-nums"
      />
    </Field>
  )

  const select = (key: "building_use" | "building_type" | "voltage_class", label: string, options: readonly (readonly [string, string])[]) => (
    <Field id={key} label={label} needed={needed.has(key)}>
      <Select value={p.form[key] || undefined} onValueChange={(v) => p.onChange(key, v === "__none" ? "" : v)}>
        <SelectTrigger id={key} size="sm" className="w-full bg-card text-[13px]">
          <SelectValue placeholder="Not specified" />
        </SelectTrigger>
        <SelectContent>
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
      className="flex h-full flex-col"
      aria-label="Project inputs"
      onSubmit={(e) => {
        e.preventDefault()
        p.onEvaluate()
      }}
    >
      <div className="flex-1 space-y-5 overflow-y-auto px-4 pt-4 pb-6">
        <section>
          <Label htmlFor="requirement" className="panel-label mb-1.5 block">
            Requirement being examined
          </Label>
          <Select value={p.requirement} onValueChange={(v) => p.onRequirement(v as Requirement)}>
            <SelectTrigger id="requirement" className="w-full bg-card text-[13px] font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REQUIREMENTS.map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
            Fields marked <span className="font-mono text-cobalt">●</span> are used by this requirement. Nothing is assumed for empty fields.
          </p>
        </section>

        <Group title="Plot">
          <div className="grid grid-cols-2 gap-3">
            {num("plot_width_m", "Width / frontage", "m", "Along the road")}
            {num("plot_depth_m", "Depth", "m")}
          </div>
          {num("plot_area_sqm", "Plot area", "sq m", "Optional if width and depth are given")}
          {area !== undefined && !p.form.plot_area_sqm && (
            <p className="font-mono text-[11px] text-muted-foreground">Area from width × depth: {area} sq m</p>
          )}
          {num("road_width_m", "Width of street facing the plot", "m")}
        </Group>

        <Group title="Building">
          {select("building_use", "Building use", BUILDING_USES)}
          {select("building_type", "Building type", BUILDING_TYPES)}
          <div className="grid grid-cols-2 gap-3">
            {num("building_height_m", "Height", "m")}
            {num("storeys", "Storeys", "no.")}
          </div>
          {num("built_up_area_sqm", "Proposed built-up area", "sq m", "Fees use built-up area, not plot area")}
          {p.form.building_use === "cinema" && num("seating_capacity", "Seating capacity", "seats")}
        </Group>

        <Group title="Proposed footprint" badge="Design geometry">
          <p className="-mt-1 text-[11.5px] leading-snug text-muted-foreground">
            Optional. Draws the proposed building and compares its gaps with verified minimums.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {num("building_width_m", "Building width", "m")}
            {num("building_depth_m", "Building depth", "m")}
            {num("front_gap_m", "Gap from front", "m")}
            {num("left_gap_m", "Gap from left", "m")}
          </div>
        </Group>

        <Group title="Services">{select("voltage_class", "Nearby overhead line", VOLTAGE_CLASSES)}</Group>
      </div>

      <div className="no-print sticky bottom-0 flex items-center gap-2 border-t bg-paper/95 px-4 py-3 backdrop-blur-sm">
        <Button type="submit" size="sm" disabled={p.busy || hasErrors} className="flex-1">
          <Play className="size-3.5" aria-hidden /> Evaluate requirement
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={p.onExample} title="Fill example inputs (not a real case)">
          <SquareDashed className="size-3.5" aria-hidden />
          Example
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" onClick={p.onClear} aria-label="Clear inputs">
          <Eraser className="size-3.5" />
        </Button>
      </div>
    </form>
  )
}

function Group({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 flex w-full items-center gap-2">
        <span className="panel-label">{title}</span>
        <span className="h-px flex-1 bg-rule-line" />
        {badge && <span className="font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase">{badge}</span>}
      </legend>
      {children}
    </fieldset>
  )
}

function Field(props: { id: string; label: string; unit?: string; hint?: string; error?: string; needed?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id} className="flex items-center gap-1.5 text-[12px] font-medium text-ink/85">
        {props.needed && (
          <span className="font-mono text-[9px] text-cobalt" aria-label="used by this requirement">
            ●
          </span>
        )}
        {props.label}
      </Label>
      <div className="relative">
        {props.children}
        {props.unit && (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[11px] text-muted-foreground">
            {props.unit}
          </span>
        )}
      </div>
      {props.error ? (
        <p id={`${props.id}-err`} role="alert" className={cn("text-[11px] text-alert")}>
          {props.error}
        </p>
      ) : (
        props.hint && <p className="text-[11px] text-muted-foreground">{props.hint}</p>
      )}
    </div>
  )
}
