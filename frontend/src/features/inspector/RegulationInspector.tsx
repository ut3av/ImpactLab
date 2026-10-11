import { AlertTriangle, BookOpen, ChevronDown, ExternalLink, FileText, Info, Printer, Sparkles, SquareFunction, X } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { AI_NOT_CONFIGURED_NOTE, EXPLAIN_GUIDANCE, pendingTargetLabel } from "@/features/explain/copy"
import { ExplainButton } from "@/features/explain/ExplainButton"
import { ExplainPanel } from "@/features/explain/ExplainPanel"
import { buildExplainRequest, focusFromSelection, focusKey, isCalcType, recordIdentity } from "@/features/explain/payload"
import { useExplanation } from "@/features/explain/useExplanation"
import { api, ApiError } from "@/lib/api"
import { useLanguagePreference } from "@/lib/language"
import { STATUS_META } from "@/lib/status"
import { INPUT_LABELS, type InspectionRecord } from "@/lib/record"
import { cn } from "@/lib/utils"
import type { CalcResult, Citation, ExplainFocus, RuleDetail, UiLanguage } from "@/types/api"

type Props = {
  record: InspectionRecord | null
  selected: string | null
  onSelect: (k: string | null) => void
  onReceipt: () => void
  error: string | null
  loading: boolean
  /** From /api/health. false: say up front that a basic (non-AI) explanation will be shown. */
  aiConfigured?: boolean
}

export function RegulationInspector({ record, selected, onSelect, onReceipt, error, loading, aiConfigured }: Props) {
  const [ruleOpen, setRuleOpen] = useState<string | null>(null)
  const selCalcType = selected?.split(":")[0]
  const [langPref, setLangPref] = useLanguagePreference()
  const language: UiLanguage = langPref ?? record?.language ?? "en"
  const explanation = useExplanation(recordIdentity(record))
  const [scrollTick, setScrollTick] = useState(0)
  const mainExplain = useRef<HTMLButtonElement>(null)
  const aiNoteId = useId()

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

  const ex = explanation.state
  const busyFocus = ex.status === "loading" ? focusKey(ex.req.focus) : null
  const selectionFocus = selected ? focusFromSelection(selected) : null
  /** Every entry point feeds the one panel; triggers below it scroll it into view while focus stays on the trigger. */
  const explain = (focus: ExplainFocus | null, scroll: boolean) => {
    explanation.request(buildExplainRequest(record, focus, language, "brief"))
    setScrollTick((t) => (scroll ? t + 1 : 0))
  }

  return (
    <div className="space-y-4 p-4 text-slate-900">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase">
              {record.kind === "answer" ? "Question Examined" : "Statutory Evaluation"}
            </p>
            <p lang={record.language} className="mt-1 text-[15px] leading-snug font-semibold text-slate-900">
              {record.question}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onReceipt} className="no-print shrink-0" data-guide="receipt">
            <Printer className="size-3.5" aria-hidden /> Counter Receipt
          </Button>
        </div>
        <StatusBanner record={record} />
      </header>

      {selected && (
        <SelectionNote
          selected={selected}
          record={record}
          onClear={() => onSelect(null)}
          onExplain={selectionFocus ? () => explain(selectionFocus, true) : undefined}
          explainBusy={!!selectionFocus && busyFocus === focusKey(selectionFocus)}
        />
      )}

      {record.answerText && (
        <section aria-label="Answer" data-guide="answer" className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-2 flex items-center gap-2">
            {record.answerSource === "ai" ? (
              <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold tracking-wider text-blue-700 uppercase bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                <Sparkles className="size-3" aria-hidden /> AI explanation{record.answerModel ? ` · ${record.answerModel}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold tracking-wider text-slate-600 uppercase bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                <SquareFunction className="size-3 text-slate-500" aria-hidden /> Deterministic summary
              </span>
            )}
          </div>
          <p lang={record.language} className={cn("text-[14px] leading-relaxed text-slate-800", record.primary === "NOT_FOUND" && "font-medium text-slate-700")}>
            {record.answerText}
          </p>
          {record.answerNote && <p className="mt-2.5 text-[11.5px] text-slate-500 leading-relaxed border-t border-slate-100 pt-2">{record.answerNote}</p>}
          {record.language === "hi" && (
            <p className="mt-1 text-[11px] text-slate-400">Hindi text is an explanation, not a quotation from the official Hindi PDF.</p>
          )}
        </section>
      )}

      <div data-guide="explain">
        <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <ExplainButton
            ref={mainExplain}
            label="Explain with AI"
            ariaLabel="Explain with AI: this result"
            busy={busyFocus === "result"}
            onClick={() => explain(null, false)}
            describedBy={aiConfigured === false ? aiNoteId : undefined}
          />
          {aiConfigured === false && (
            <p id={aiNoteId} className="min-w-0 flex-1 text-[11.5px] leading-snug text-slate-500">
              {AI_NOT_CONFIGURED_NOTE}
            </p>
          )}
        </div>
        <ExplainPanel
          explanation={explanation}
          language={language}
          onLanguage={setLangPref}
          pendingLabel={ex.status === "idle" ? "" : pendingTargetLabel(record, ex.req.focus)}
          scrollSignal={scrollTick}
          onClosed={() => mainExplain.current?.focus()}
        />
      </div>

      {record.warnings.length > 0 && (
        <div data-guide="warnings" className="space-y-3">
          {record.warnings.map((w) => (
            <section key={w.code} role="note" className="rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 shadow-2xs">
              <p className="flex items-center gap-1.5 text-[13px] font-bold text-amber-900">
                <AlertTriangle className="size-4 text-amber-600 shrink-0" aria-hidden /> {w.title}
              </p>
              <p className="mt-1 text-[12.5px] leading-snug text-amber-950/80">{w.detail}</p>
              {w.source_url && (
                <a href={w.source_url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-blue-700 underline-offset-2 hover:underline">
                  Amendment reference (external, not verified by MIRA) <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </section>
          ))}
        </div>
      )}

      {record.missing.length > 0 && (
        <section aria-label="Missing information" data-guide="missing" className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-3.5 shadow-2xs">
          <p className="font-mono text-[11px] font-bold tracking-wide uppercase text-amber-900 mb-2">More information needed</p>
          <ul className="space-y-1.5">
            {record.missing.map((m) => (
              <li key={m.field} className="text-[12.5px] leading-snug">
                <span className="font-semibold text-slate-900">{m.label}</span>
                <span className="text-slate-600"> — {m.reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11.5px] text-slate-500">Add these in Project inputs and evaluate again. No value is assumed.</p>
        </section>
      )}

      {record.calcs.length > 0 && (
        <section aria-label="Calculations" data-guide="calculations" className="space-y-3">
          <p className="font-mono text-[10.5px] font-bold tracking-wider text-slate-500 uppercase">Rule-to-geometry results</p>
          {record.calcs.map((c) => {
            const ct = c.calc_type
            return (
              <CalcCard
                key={ct}
                calc={c}
                active={selCalcType === ct}
                onOpenRule={setRuleOpen}
                onSelect={onSelect}
                onExplain={isCalcType(ct) ? () => explain({ calc_type: ct }, true) : undefined}
                explainBusy={busyFocus === `calc:${ct}`}
              />
            )
          })}
        </section>
      )}

      <section aria-label="Evidence" data-guide="evidence" className="space-y-3">
        <p className="font-mono text-[10.5px] font-bold tracking-wider text-slate-500 uppercase">Evidence from the supplied rules</p>
        {record.citations.length === 0 ? (
          <p className="text-[12.5px] text-slate-500 rounded-lg border border-slate-200 bg-slate-50 p-3">No rule passage supports an answer. Nothing is cited.</p>
        ) : (
          record.citations.map((c, i) => <CitationCard key={(c.chunk_id ?? "") + i} c={c} onOpenRule={setRuleOpen} />)
        )}
      </section>

      {record.searched && (
        <details className="group rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[12px]">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-slate-600">
            <ChevronDown className="size-3.5 text-slate-400 transition-transform group-open:rotate-180" aria-hidden /> What was searched
          </summary>
          <p className="mt-2 font-mono text-[11px] text-slate-700">Terms: {record.searched.terms.join(", ") || "—"}</p>
          <p className="mt-1 font-mono text-[11px] text-slate-700">Rules ranked: {record.searched.rules.join(", ") || "—"}</p>
          <p className="mt-1 text-[11px] text-slate-400">Local search over 106 rule records (English consolidated text up to 6 Mar 2025).</p>
        </details>
      )}

      {/* Prominent Bottom Action: Print / Export Docket */}
      <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 p-3.5 backdrop-blur-xs shadow-[0_-4px_12px_rgba(0,0,0,0.04)] -mx-4 -mb-4 mt-6">
        <Button
          onClick={onReceipt}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[13px] h-9.5 rounded-lg shadow-xs transition-all active:scale-99 flex items-center justify-center gap-2"
        >
          <Printer className="size-4" aria-hidden /> Print / Export Verification Docket
        </Button>
      </div>

      {ruleOpen && <RuleDrawer id={ruleOpen} onClose={() => setRuleOpen(null)} />}
    </div>
  )
}

function StatusBanner({ record }: { record: InspectionRecord }) {
  const meta = STATUS_META[record.primary]
  return (
    <div className="space-y-1.5" data-guide="status">
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

function CalcCard({
  calc,
  active,
  onOpenRule,
  onSelect,
  onExplain,
  explainBusy,
}: {
  calc: CalcResult
  active: boolean
  onOpenRule: (id: string) => void
  onSelect: (k: string) => void
  onExplain?: () => void
  explainBusy: boolean
}) {
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
        "rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all",
        active && "ring-2 ring-blue-500/70 border-blue-300",
        !resolved && "border-amber-300 bg-amber-50/15",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-slate-700">{calc.label}</p>
          <p className={cn("mt-1 font-mono text-[22px] leading-tight font-bold tabular-nums", resolved ? "text-slate-900" : "text-amber-700")}>
            {calc.display_value && resolved ? calc.display_value : calc.display_value ? `${calc.display_value} (provisional)` : "Unresolved"}
          </p>
        </div>
        <StatusBadge status={calc.status} />
      </div>

      {calc.zones.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {calc.zones.map((z) => (
            <button
              key={z.side}
              type="button"
              onClick={() => onSelect(`${calc.calc_type}:${z.side}`)}
              className={cn(
                "rounded-md border px-2 py-0.8 font-mono text-[10.5px] font-medium transition-colors",
                z.check === "below_minimum" ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100" : z.check === "meets_minimum" ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
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
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-[11.5px]">
          {Object.entries(calc.inputs_used).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500 font-medium">{INPUT_LABELS[k] ?? k}</dt>
              <dd className="font-mono text-slate-800 font-semibold tabular-nums text-right">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      {calc.steps.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-200/80 bg-slate-50/80 p-2.5">
          <p className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1.5">Deterministic Math Breakdown</p>
          <ol className="space-y-1 border-l-2 border-blue-500 pl-3 text-[12px] leading-relaxed text-slate-700 font-mono">
            {calc.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      {calc.conditional_results.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
          <p className="mb-1 text-[11px] font-bold text-amber-900">Conditional — not applied until confirmed</p>
          <ul className="space-y-1 text-[12px] text-amber-950/80">
            {calc.conditional_results.map((r, i) => (
              <li key={i}>
                <span className="font-medium text-amber-900">{r.condition}:</span> {r.result} <span className="font-mono text-[10.5px] text-slate-500">(Rule {r.rule})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {calc.conditions.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11.5px] text-slate-500">
          {calc.conditions.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}

      {Object.keys(calc.breakdown).length > 0 && calc.calc_type === "building_permission_fee" && (
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-[11.5px]">
          {"application_fee_rs" in calc.breakdown && (
            <>
              <dt className="text-slate-500">Application fee (Rule 21(2)(ii))</dt>
              <dd className="font-mono font-semibold text-slate-800 text-right">Rs. {Number(calc.breakdown.application_fee_rs).toLocaleString("en-IN")}</dd>
            </>
          )}
          {"permission_fee_rs" in calc.breakdown && (
            <>
              <dt className="text-slate-500">Permission fee (Rule 21(3))</dt>
              <dd className="font-mono font-semibold text-slate-800 text-right">Rs. {Number(calc.breakdown.permission_fee_rs).toLocaleString("en-IN")}</dd>
            </>
          )}
        </dl>
      )}

      {calc.summary_en && !resolved && <p className="mt-2 text-[12px] leading-snug text-slate-600">{calc.summary_en}</p>}

      {calc.notes.length > 0 && (
        <ul className="mt-2.5 space-y-1 text-[11.5px] leading-snug text-slate-500">
          {calc.notes.map((n, i) => (
            <li key={i} className="flex gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
              {n}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {calc.citations.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onOpenRule(c.rule)}
            className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.8 font-mono text-[10.5px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
          >
            R{c.rule}
            {c.sub_rule} · p.{c.page}
          </button>
        ))}
        {onExplain && (
          <ExplainButton
            tone="quiet"
            label="Explain this calculation"
            ariaLabel={`Explain this calculation: ${calc.label}`}
            busy={explainBusy}
            onClick={onExplain}
            className="no-print ml-auto"
          />
        )}
      </div>
    </div>
  )
}

function CitationCard({ c, onOpenRule }: { c: Citation; onOpenRule: (id: string) => void }) {
  const [open, setOpen] = useState(c.passage.length < 700)
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className="font-mono text-[13.5px] font-bold text-slate-900">
          Rule {c.rule}
          {c.sub_rule ?? ""}
          <span className="ml-2 font-sans text-[12.5px] font-normal text-slate-500">{c.title}</span>
        </p>
        <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-slate-600">
          PDF p. {c.page}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {c.verified_table && (
          <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800 tracking-wide uppercase">
            Table checked against PDF
          </span>
        )}
        <span className="text-[11px] font-medium text-slate-400">Source text · {c.document}</span>
      </div>
      <blockquote className={cn("source-quote mt-2.5", !open && "max-h-40 overflow-hidden [mask-image:linear-gradient(black_70%,transparent)]")}>
        {c.passage}
      </blockquote>
      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[12px]">
        {c.passage.length >= 700 ? (
          <button type="button" className="font-medium text-blue-600 hover:text-blue-800 hover:underline" onClick={() => setOpen((o) => !o)}>
            {open ? "Show less" : "Show full passage"}
          </button>
        ) : <span />}
        <button type="button" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800 hover:underline" onClick={() => onOpenRule(c.rule)}>
          <BookOpen className="size-3.5" aria-hidden /> Open whole rule
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
    <div className="no-print fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Rule ${id}`}
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl border-l border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="font-mono text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">Full rule text</p>
            <p className="font-mono text-sm font-bold text-slate-900">
              Rule {id}
              {rule && <span className="ml-2 font-sans font-normal text-slate-500">{rule.title}</span>}
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-slate-800">
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex-1 space-y-3.5 overflow-y-auto p-4 clean-scrollbar text-slate-900">
          {err && <p className="text-sm font-medium text-rose-600">{err}</p>}
          {!rule && !err && <p className="font-mono text-xs text-slate-400">Loading…</p>}
          {rule && (
            <>
              <p className="text-[12px] text-slate-500 font-medium">
                {rule.part} · PDF pages {rule.page_start}–{rule.page_end}
                {rule.embedded_in && ` · printed inside Rule ${rule.embedded_in}`}
              </p>
              {rule.passages.map((p) => (
                <div key={p.chunk_id}>
                  <p className="mb-1 font-mono text-[11px] font-medium text-slate-500">
                    PDF p. {p.page}
                    {p.sub_rule ? ` · ${p.sub_rule}` : ""}
                    {p.is_comment ? " · court comment (not rule text)" : ""}
                  </p>
                  <blockquote className={cn("source-quote", p.is_comment && "border-slate-300 opacity-80")}>{p.text}</blockquote>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function SelectionNote({
  selected,
  record,
  onClear,
  onExplain,
  explainBusy,
}: {
  selected: string
  record: InspectionRecord
  onClear: () => void
  onExplain?: () => void
  explainBusy: boolean
}) {
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
    <div data-guide="selection" className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/80 p-3 shadow-2xs">
      <FileText className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden />
      <div className="flex-1">
        <p className="text-[13px] font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-slate-700">{body}</p>
        {selected === "building" && <StatusBadge status="ILLUSTRATIVE_ONLY" className="mt-2" />}
        {onExplain && (
          <ExplainButton
            tone="secondary"
            label="Explain with AI"
            ariaLabel="Explain with AI: selected constraint"
            busy={explainBusy}
            onClick={onExplain}
            className="no-print mt-2 bg-white"
          />
        )}
      </div>
      <button type="button" onClick={onClear} aria-label="Clear selection" className="text-slate-400 hover:text-slate-700 transition-colors">
        <X className="size-4" />
      </button>
    </div>
  )
}

function InspectorEmpty() {
  const guidanceId = useId()
  return (
    <div className="space-y-4 p-5 text-slate-900">
      <p className="font-mono text-[10.5px] font-bold tracking-wider text-slate-500 uppercase">Regulation inspector</p>
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-2xs space-y-2.5">
        <p className="text-[14px] leading-relaxed font-medium text-slate-800">
          Ask a question in English or Hindi, or enter project inputs and evaluate a requirement. Every result shows its rule number, PDF page and the exact source text.
        </p>
        <ul className="space-y-2 text-[12.5px] text-slate-600">
          <li className="flex items-start gap-1.5"><span className="text-blue-600 font-bold">•</span> Values are computed only from tables checked against the supplied English PDF.</li>
          <li className="flex items-start gap-1.5"><span className="text-blue-600 font-bold">•</span> Missing inputs are asked for, never assumed.</li>
          <li className="flex items-start gap-1.5"><span className="text-blue-600 font-bold">•</span> Questions outside the rules return “Not found in the supplied rules.”</li>
        </ul>
      </div>
      <div data-guide="explain" className="space-y-1.5 border-t border-slate-200 pt-4">
        <ExplainButton label="Explain with AI" unavailable describedBy={guidanceId} />
        <p id={guidanceId} className="text-[12.5px] leading-snug text-slate-500">
          {EXPLAIN_GUIDANCE}
        </p>
      </div>
    </div>
  )
}

function InspectorSkeleton() {
  return (
    <div className="space-y-3.5 p-4" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-2/3 animate-pulse rounded-md bg-slate-200" />
      <div className="h-6 w-1/3 animate-pulse rounded-md bg-slate-200" />
      <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
    </div>
  )
}
