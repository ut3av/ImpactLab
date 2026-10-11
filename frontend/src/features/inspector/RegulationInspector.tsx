import { AlertTriangle, BookOpen, ChevronDown, ExternalLink, FileText, Info, Printer, Sparkles, SquareFunction, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { api, ApiError } from "@/lib/api"
import { STATUS_META } from "@/lib/status"
import { INPUT_LABELS, type InspectionRecord } from "@/lib/record"
import { cn } from "@/lib/utils"
import type { CalcResult, Citation, RuleDetail } from "@/types/api"

type Props = {
  record: InspectionRecord | null
  selected: string | null
  onSelect: (k: string | null) => void
  onReceipt: () => void
  error: string | null
  loading: boolean
}

export function RegulationInspector({ record, selected, onSelect, onReceipt, error, loading }: Props) {
  const [ruleOpen, setRuleOpen] = useState<string | null>(null)
  const selCalcType = selected?.split(":")[0]

  if (loading) return <InspectorSkeleton />
  if (error)
    return (
      <div className="p-4" role="alert">
        <div className="rounded-sm border border-alert/40 bg-alert-soft p-3 text-sm text-alert">
          <p className="font-medium">Request failed</p>
          <p className="mt-1 text-[13px]">{error}</p>
        </div>
      </div>
    )
  if (!record) return <InspectorEmpty />

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="panel-label">{record.kind === "answer" ? "Question" : "Evaluation"}</p>
            <p lang={record.language} className="mt-0.5 text-[14px] leading-snug font-medium text-ink">
              {record.question}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onReceipt} className="no-print shrink-0">
            <Printer className="size-3.5" aria-hidden /> Counter Receipt
          </Button>
        </div>
        <StatusBanner record={record} />
      </header>

      {selected && <SelectionNote selected={selected} record={record} onClear={() => onSelect(null)} />}

      {record.answerText && (
        <section aria-label="Answer" className="rounded-sm border bg-card p-3 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
          <div className="mb-1.5 flex items-center gap-2">
            {record.answerSource === "ai" ? (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-wider text-cobalt uppercase">
                <Sparkles className="size-3" aria-hidden /> AI explanation{record.answerModel ? ` · ${record.answerModel}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                <SquareFunction className="size-3" aria-hidden /> Deterministic summary
              </span>
            )}
          </div>
          <p lang={record.language} className={cn("text-[14px] leading-relaxed text-ink", record.primary === "NOT_FOUND" && "font-medium")}>
            {record.answerText}
          </p>
          {record.answerNote && <p className="mt-2 text-[11.5px] text-muted-foreground">{record.answerNote}</p>}
          {record.language === "hi" && (
            <p className="mt-1 text-[11.5px] text-muted-foreground">Hindi text is an explanation, not a quotation from the official Hindi PDF.</p>
          )}
        </section>
      )}

      {record.warnings.map((w) => (
        <section key={w.code} role="note" className="rounded-sm border border-review/50 bg-review-soft p-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[oklch(0.42_0.1_65)]">
            <AlertTriangle className="size-3.5" aria-hidden /> {w.title}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-ink/85">{w.detail}</p>
          {w.source_url && (
            <a href={w.source_url} target="_blank" rel="noreferrer noopener" className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-cobalt underline-offset-2 hover:underline">
              Amendment reference (external, not verified by NIYAMLENS) <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </section>
      ))}

      {record.missing.length > 0 && (
        <section aria-label="Missing information" className="rounded-sm border border-dashed border-review/60 p-3">
          <p className="panel-label mb-2 text-[oklch(0.45_0.11_65)]!">More information needed</p>
          <ul className="space-y-1.5">
            {record.missing.map((m) => (
              <li key={m.field} className="text-[12.5px] leading-snug">
                <span className="font-medium text-ink">{m.label}</span>
                <span className="text-muted-foreground"> — {m.reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-muted-foreground">Add these in Project inputs and evaluate again. No value is assumed.</p>
        </section>
      )}

      {record.calcs.length > 0 && (
        <section aria-label="Calculations" className="space-y-2">
          <p className="panel-label">Rule-to-geometry results</p>
          {record.calcs.map((c) => (
            <CalcCard key={c.calc_type} calc={c} active={selCalcType === c.calc_type} onOpenRule={setRuleOpen} onSelect={onSelect} />
          ))}
        </section>
      )}

      <section aria-label="Evidence" className="space-y-2">
        <p className="panel-label">Evidence from the supplied rules</p>
        {record.citations.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No rule passage supports an answer. Nothing is cited.</p>
        ) : (
          record.citations.map((c, i) => <CitationCard key={(c.chunk_id ?? "") + i} c={c} onOpenRule={setRuleOpen} />)
        )}
      </section>

      {record.searched && (
        <details className="group rounded-sm border bg-paper p-2.5 text-[12px]">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-muted-foreground">
            <ChevronDown className="size-3 transition-transform group-open:rotate-180" aria-hidden /> What was searched
          </summary>
          <p className="mt-2 font-mono text-[11px] text-ink/80">Terms: {record.searched.terms.join(", ") || "—"}</p>
          <p className="mt-1 font-mono text-[11px] text-ink/80">Rules ranked: {record.searched.rules.join(", ") || "—"}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Local search over 106 rule records (English consolidated text up to 6 Mar 2025).</p>
        </details>
      )}

      {ruleOpen && <RuleDrawer id={ruleOpen} onClose={() => setRuleOpen(null)} />}
    </div>
  )
}

function StatusBanner({ record }: { record: InspectionRecord }) {
  const meta = STATUS_META[record.primary]
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={record.primary} size="md" />
        {record.statuses
          .filter((s) => s !== record.primary)
          .map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
      </div>
      <p className="text-[12px] leading-snug text-muted-foreground">{meta.description}</p>
    </div>
  )
}

function CalcCard({ calc, active, onOpenRule, onSelect }: { calc: CalcResult; active: boolean; onOpenRule: (id: string) => void; onSelect: (k: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [active])
  const resolved = calc.status === "VERIFIED" || calc.status === "CALCULATION_COMPLETED"
  return (
    <div
      ref={ref}
      data-active={active}
      className={cn(
        "rounded-sm border bg-card p-3 transition-shadow",
        active && "ring-2 ring-cobalt/50",
        !resolved && "border-review/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-medium text-ink">{calc.label}</p>
          <p className={cn("mt-0.5 font-mono text-[20px] leading-tight font-semibold tabular-nums", resolved ? "text-ink" : "text-[oklch(0.45_0.11_65)]")}>
            {calc.display_value && resolved ? calc.display_value : calc.display_value ? `${calc.display_value} (provisional)` : "Unresolved"}
          </p>
        </div>
        <StatusBadge status={calc.status} />
      </div>

      {calc.zones.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {calc.zones.map((z) => (
            <button
              key={z.side}
              type="button"
              onClick={() => onSelect(`${calc.calc_type}:${z.side}`)}
              className={cn(
                "rounded-sm border px-1.5 py-0.5 font-mono text-[10.5px]",
                z.check === "below_minimum" ? "border-alert/50 bg-alert-soft text-alert" : z.check === "meets_minimum" ? "border-verified/40 bg-verified-soft text-verified" : "border-border bg-muted text-muted-foreground",
              )}
              title="Highlight on plot"
            >
              {z.side}: ≥ {z.depth_m} m
              {z.proposed_gap_m != null && ` · proposed ${z.proposed_gap_m} m ${z.check === "below_minimum" ? "✕ below minimum" : "✓ meets minimum"}`}
            </button>
          ))}
        </div>
      )}

      {Object.keys(calc.inputs_used).length > 0 && (
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
          {Object.entries(calc.inputs_used).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{INPUT_LABELS[k] ?? k}</dt>
              <dd className="font-mono text-ink tabular-nums">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      {calc.steps.length > 0 && (
        <ol className="mt-2.5 space-y-1 border-l border-rule-line pl-3 text-[12px] leading-snug text-ink/85">
          {calc.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}

      {calc.conditional_results.length > 0 && (
        <div className="mt-2.5 rounded-sm bg-review-soft/70 p-2">
          <p className="mb-1 text-[11px] font-medium text-[oklch(0.42_0.1_65)]">Conditional — not applied until confirmed</p>
          <ul className="space-y-1 text-[12px] text-ink/85">
            {calc.conditional_results.map((r, i) => (
              <li key={i}>
                <span className="text-muted-foreground">{r.condition}:</span> {r.result} <span className="font-mono text-[10.5px] text-muted-foreground">(Rule {r.rule})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {calc.conditions.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11.5px] text-muted-foreground">
          {calc.conditions.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}

      {Object.keys(calc.breakdown).length > 0 && calc.calc_type === "building_permission_fee" && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-[11.5px]">
          {"application_fee_rs" in calc.breakdown && (
            <>
              <dt className="text-muted-foreground">Application fee (Rule 21(2)(ii))</dt>
              <dd className="font-mono">Rs. {Number(calc.breakdown.application_fee_rs).toLocaleString("en-IN")}</dd>
            </>
          )}
          {"permission_fee_rs" in calc.breakdown && (
            <>
              <dt className="text-muted-foreground">Permission fee (Rule 21(3))</dt>
              <dd className="font-mono">Rs. {Number(calc.breakdown.permission_fee_rs).toLocaleString("en-IN")}</dd>
            </>
          )}
        </dl>
      )}

      {calc.summary_en && !resolved && <p className="mt-2 text-[12px] leading-snug text-ink/80">{calc.summary_en}</p>}

      {calc.notes.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11.5px] leading-snug text-muted-foreground">
          {calc.notes.map((n, i) => (
            <li key={i} className="flex gap-1.5">
              <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
              {n}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1">
        {calc.citations.map((c, i) => (
          <button key={i} type="button" onClick={() => onOpenRule(c.rule)} className="rounded-sm border border-cobalt/30 bg-cobalt-soft px-1.5 py-0.5 font-mono text-[10.5px] text-cobalt hover:bg-cobalt/10">
            R{c.rule}
            {c.sub_rule} · p.{c.page}
          </button>
        ))}
      </div>
    </div>
  )
}

function CitationCard({ c, onOpenRule }: { c: Citation; onOpenRule: (id: string) => void }) {
  const [open, setOpen] = useState(c.passage.length < 700)
  return (
    <article className="rounded-sm border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className="font-mono text-[12.5px] font-semibold text-ink">
          Rule {c.rule}
          {c.sub_rule ?? ""}
          <span className="ml-1.5 font-sans text-[12px] font-normal text-muted-foreground">{c.title}</span>
        </p>
        <span className="font-mono text-[11px] text-muted-foreground">PDF p. {c.page}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {c.verified_table && (
          <span className="rounded-sm border border-verified/40 bg-verified-soft px-1.5 py-0.5 font-mono text-[9.5px] tracking-wide text-verified uppercase">Table checked against PDF</span>
        )}
        <span className="text-[10.5px] text-muted-foreground">Source text · {c.document}</span>
      </div>
      <blockquote className={cn("source-quote mt-2", !open && "max-h-40 overflow-hidden [mask-image:linear-gradient(black_70%,transparent)]")}>{c.passage}</blockquote>
      <div className="mt-1.5 flex gap-3">
        {c.passage.length >= 700 && (
          <button type="button" className="text-[11.5px] text-cobalt hover:underline" onClick={() => setOpen((o) => !o)}>
            {open ? "Show less" : "Show full passage"}
          </button>
        )}
        <button type="button" className="inline-flex items-center gap-1 text-[11.5px] text-cobalt hover:underline" onClick={() => onOpenRule(c.rule)}>
          <BookOpen className="size-3" aria-hidden /> Open whole rule
        </button>
      </div>
    </article>
  )
}

function RuleDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [rule, setRule] = useState<RuleDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setRule(null)
    setErr(null)
    api.rule(id).then(
      (r) => live && setRule(r),
      (e: ApiError) => live && setErr(e.message),
    )
    return () => {
      live = false
    }
  }, [id])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end bg-ink/25" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Rule ${id}`}
        className="flex h-full w-full max-w-xl flex-col bg-paper shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="panel-label">Full rule text</p>
            <p className="font-mono text-sm font-semibold">
              Rule {id}
              {rule && <span className="ml-2 font-sans font-normal text-muted-foreground">{rule.title}</span>}
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {err && <p className="text-sm text-alert">{err}</p>}
          {!rule && !err && <p className="font-mono text-xs text-muted-foreground">Loading…</p>}
          {rule && (
            <>
              <p className="text-[12px] text-muted-foreground">
                {rule.part} · PDF pages {rule.page_start}–{rule.page_end}
                {rule.embedded_in && ` · printed inside Rule ${rule.embedded_in}`}
              </p>
              {rule.passages.map((p) => (
                <div key={p.chunk_id}>
                  <p className="mb-1 font-mono text-[10.5px] text-muted-foreground">
                    PDF p. {p.page}
                    {p.sub_rule ? ` · ${p.sub_rule}` : ""}
                    {p.is_comment ? " · court comment (not rule text)" : ""}
                  </p>
                  <blockquote className={cn("source-quote", p.is_comment && "border-rule-line opacity-80")}>{p.text}</blockquote>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function SelectionNote({ selected, record, onClear }: { selected: string; record: InspectionRecord; onClear: () => void }) {
  let title = ""
  let body = ""
  if (selected === "building") {
    title = "Proposed building — user design geometry"
    body = "Drawn from the dimensions you entered. It is illustrative only and is not a building plan, a compliance result or an approval."
  } else if (selected === "road") {
    title = "Street facing the plot"
    body = record.inputs.road_width_m
      ? `Width entered: ${record.inputs.road_width_m} m. Rule 56(1)(a) uses this width to select the front open space for residential buildings up to 12.5 m.`
      : "Street width not entered; front open space cannot be selected without it."
  } else if (selected === "plot") {
    title = "Plot boundary — user input"
    body = "Width and depth as entered. The plot area used for the rear open space is width × depth unless you enter an area."
  } else {
    const [calcType, side] = selected.split(":")
    const calc = record.calcs.find((c) => c.calc_type === calcType)
    const zone = calc?.zones.find((z) => z.side === side)
    title = zone ? `${zone.label} — Rule ${zone.rule}` : `${side} open space — unresolved`
    body = zone
      ? `${calc?.status === "VERIFIED" ? "Verified" : "Computed"} from the source table shown below. ${zone.proposed_gap_m != null ? `Proposed gap: ${zone.proposed_gap_m} m (${zone.check === "below_minimum" ? "below" : "meets"} this minimum — this single check only).` : ""}`
      : `No verified dimension can be drawn: ${calc?.missing_inputs.map((m) => m.label).join("; ") || "the applicable rule could not be established"}.`
  }
  return (
    <div className="flex items-start gap-2 rounded-sm border border-cobalt/35 bg-cobalt-soft/60 p-2.5">
      <FileText className="mt-0.5 size-3.5 shrink-0 text-cobalt" aria-hidden />
      <div className="flex-1">
        <p className="text-[12.5px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-ink/80">{body}</p>
        {selected === "building" && <StatusBadge status="ILLUSTRATIVE_ONLY" className="mt-1.5" />}
      </div>
      <button type="button" onClick={onClear} aria-label="Clear selection" className="text-muted-foreground hover:text-ink">
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function InspectorEmpty() {
  return (
    <div className="space-y-4 p-5">
      <p className="panel-label">Regulation inspector</p>
      <p className="text-[14px] leading-relaxed text-ink">
        Ask a question in English or Hindi, or enter project inputs and evaluate a requirement. Every result shows its rule number, PDF page and the exact source text.
      </p>
      <ul className="space-y-2 text-[12.5px] text-muted-foreground">
        <li>• Values are computed only from tables checked against the supplied English PDF.</li>
        <li>• Missing inputs are asked for, never assumed.</li>
        <li>• Questions outside the rules return “Not found in the supplied rules.”</li>
      </ul>
    </div>
  )
}

function InspectorSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-2/3 animate-pulse rounded-sm bg-muted" />
      <div className="h-6 w-1/3 animate-pulse rounded-sm bg-muted" />
      <div className="h-24 animate-pulse rounded-sm bg-muted" />
      <div className="h-32 animate-pulse rounded-sm bg-muted" />
    </div>
  )
}
