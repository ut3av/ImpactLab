import { ArrowLeft, Download, Printer } from "lucide-react"
import { StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { INPUT_LABELS, type InspectionRecord } from "@/lib/record"
import { STATUS_META } from "@/lib/status"

export const RECEIPT_KEY = "mira:receipt"
export const RECEIPT_DISCLAIMER =
  "Informational regulatory reference. Not an official building approval or legal opinion. Final interpretation and decisions remain with the responsible authority."

export function saveReceipt(r: InspectionRecord) {
  sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(r))
}

export function loadReceipt(): InspectionRecord | null {
  try {
    const raw = sessionStorage.getItem(RECEIPT_KEY)
    return raw ? (JSON.parse(raw) as InspectionRecord) : null
  } catch {
    return null
  }
}

export function receiptId(r: InspectionRecord): string {
  let h = 0
  const s = r.question + r.generatedAt
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return `MIRA-${h.toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`
}

export function CounterReceipt({ record, onBack }: { record: InspectionRecord; onBack: () => void }) {
  const when = new Date(record.generatedAt)
  const id = receiptId(record)
  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ receipt_id: id, disclaimer: RECEIPT_DISCLAIMER, ...record }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `mira-receipt-${id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const inputs = Object.entries(record.inputs).filter(([, v]) => v !== "" && v !== undefined && v !== null)

  return (
    <div className="min-h-screen bg-background py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-3.5" aria-hidden /> Back to workbench
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadJson}>
            <Download className="size-3.5" aria-hidden /> JSON
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" aria-hidden /> Print / Save as PDF
          </Button>
        </div>
      </div>

      <article className="print-card mx-auto max-w-[210mm] border bg-white px-10 py-9 text-ink shadow-sm print:px-0 print:py-0" aria-label="Counter Receipt">
        <header className="flex items-start justify-between border-b-2 border-ink pb-4">
          <div className="flex items-center gap-3.5">
            <img src="/mira-mark.png" alt="MIRA" className="size-11 rounded-sm border border-ink/20 shrink-0" />
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Counter Receipt</p>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
                MIRA
              </h1>
              <p className="text-[12px] text-muted-foreground">Municipal Intelligence for Rules & Architecture · “See the Rules. Understand the Structure.”</p>
            </div>
          </div>
          <dl className="text-right font-mono text-[11px] leading-5">
            <div>
              <dt className="inline text-muted-foreground">Ref </dt>
              <dd className="inline font-semibold">{id}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Generated </dt>
              <dd className="inline">{when.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</dd>
            </div>
          </dl>
        </header>

        <p className="mt-3 rounded-sm border border-ink/30 px-3 py-2 text-[11.5px] leading-snug font-medium">{RECEIPT_DISCLAIMER}</p>

        <Section title="Question">
          <p lang={record.language} className="text-[14px] leading-relaxed">
            {record.question}
          </p>
        </Section>

        <Section title="Verification status">
          <div className="flex flex-wrap gap-1.5">
            {record.statuses.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted-foreground">{STATUS_META[record.primary].description}</p>
        </Section>

        {record.answerText && (
          <Section title={record.answerSource === "ai" ? `Answer (AI explanation${record.answerModel ? `, ${record.answerModel}` : ""})` : "Answer (deterministic summary)"}>
            <p lang={record.language} className="text-[14px] leading-relaxed">
              {record.answerText}
            </p>
            {record.language === "hi" && <p className="mt-1 text-[11px] text-muted-foreground">Hindi text is an explanation, not a quotation from the official Hindi PDF.</p>}
          </Section>
        )}

        {inputs.length > 0 && (
          <Section title="Inputs used">
            <table className="w-full text-[12px]">
              <tbody>
                {inputs.map(([k, v]) => (
                  <tr key={k} className="border-b border-dotted border-rule-line last:border-0">
                    <td className="py-1 pr-4 text-muted-foreground">{INPUT_LABELS[k] ?? k}</td>
                    <td className="py-1 font-mono">{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {record.calcs.length > 0 && (
          <Section title="Calculation details">
            {record.calcs.map((c) => (
              <div key={c.calc_type} className="mb-3 break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-semibold">{c.label}</p>
                  <p className="font-mono text-[13px] font-semibold">
                    {c.display_value ?? "Unresolved"} <span className="font-normal text-muted-foreground">[{STATUS_META[c.status].label}]</span>
                  </p>
                </div>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12px]">
                  {c.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                {c.conditional_results.map((r, i) => (
                  <p key={i} className="mt-0.5 text-[12px]">
                    Conditional: {r.condition}: {r.result} (Rule {r.rule})
                  </p>
                ))}
                {c.notes.map((n, i) => (
                  <p key={i} className="mt-0.5 text-[11.5px] text-muted-foreground">
                    Note: {n}
                  </p>
                ))}
              </div>
            ))}
          </Section>
        )}

        {(record.missing.length > 0 || record.warnings.length > 0) && (
          <Section title="Missing information and warnings">
            <ul className="list-disc space-y-1 pl-5 text-[12px]">
              {record.missing.map((m) => (
                <li key={m.field}>
                  <strong>Needed:</strong> {m.label} — {m.reason}
                </li>
              ))}
              {record.warnings.map((w) => (
                <li key={w.code}>
                  <strong>{w.title}.</strong> {w.detail}
                  {w.source_url && <span className="block font-mono text-[10.5px] break-all text-muted-foreground">{w.source_url}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Supporting rule text">
          {record.citations.length === 0 ? (
            <p className="text-[12.5px]">No supporting rule text — not found in the supplied rules.</p>
          ) : (
            record.citations.slice(0, 6).map((c, i) => (
              <div key={i} className="mb-3 break-inside-avoid">
                <p className="font-mono text-[12px] font-semibold">
                  Rule {c.rule}
                  {c.sub_rule ?? ""} — {c.title} · PDF page {c.page}
                  {c.verified_table ? " · table checked against PDF" : ""}
                </p>
                <blockquote className="source-quote mt-1 text-[11px]">{c.passage.length > 1400 ? c.passage.slice(0, 1400) + " …" : c.passage}</blockquote>
              </div>
            ))
          )}
        </Section>

        <footer className="mt-6 border-t pt-3 text-[10.5px] leading-snug text-muted-foreground">
          <p>
            Source document: M.P. Bhumi Vikas Rules, 2012 — English consolidated copy up to 06-03-2025 (Town and Country Planning Department, mptownplan.gov.in), as supplied in the Bhopal Impact Lab 2026 Track 1 participant pack. Amendments after that date, including the 28 Aug 2026 amendment to Rule 2(5)(c), are not included.
          </p>
          <p className="mt-1">Generated by MIRA, an open-source decision-support tool. This is not a government document.</p>
        </footer>
      </article>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid-page">
      <h2 className="mb-1.5 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}
