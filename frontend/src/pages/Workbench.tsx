import { ArrowDownToLine, Database, ScanSearch } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AskBar } from "@/features/ask/AskBar"
import { ProjectInputsPanel } from "@/features/inputs/ProjectInputsPanel"
import { RegulationInspector } from "@/features/inspector/RegulationInspector"
import { PlotViewport } from "@/features/plot3d/PlotViewport"
import { saveReceipt } from "@/features/receipt/CounterReceipt"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useWorkbench } from "@/hooks/useWorkbench"
import { INPUT_LABELS } from "@/lib/record"

const TAB_CLS = "data-[state=active]:bg-card data-[state=active]:text-ink data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-cobalt/30"

export function Workbench() {
  const wb = useWorkbench()
  const navigate = useNavigate()
  const wide = useMediaQuery("(min-width: 1024px)")

  const openReceipt = () => {
    if (!wb.record) return
    saveReceipt(wb.record)
    navigate("/receipt")
  }

  const inputsPanel = (
    <ProjectInputsPanel
      form={wb.form}
      errors={wb.errors}
      inputs={wb.inputs}
      requirement={wb.requirement}
      busy={wb.busy}
      onChange={wb.setField}
      onRequirement={wb.setRequirement}
      onEvaluate={wb.evaluate}
      onClear={wb.clear}
      onExample={wb.loadExample}
    />
  )
  const inspector = (
    <RegulationInspector record={wb.record} selected={wb.selected} onSelect={wb.setSelected} onReceipt={openReceipt} error={wb.error} loading={wb.busy} />
  )
  const plot = (
    <PlotViewport
      model={wb.scene}
      selected={wb.selected}
      onSelect={(k) => {
        wb.setSelected(k)
      }}
    />
  )
  const ask = (
    <div className="space-y-2">
      <AskBar busy={wb.busy} aiConfigured={!!wb.health?.ai_configured} useAi={wb.useAi} onUseAi={wb.setUseAi} onAsk={wb.ask} />
      {Object.keys(wb.extracted).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-cobalt/30 bg-cobalt-soft/60 px-2.5 py-1.5 text-[12px]">
          <span className="text-ink/80">Read from the question:</span>
          {Object.entries(wb.extracted).map(([k, v]) => (
            <span key={k} className="rounded-sm bg-paper px-1.5 py-0.5 font-mono text-[11px]">
              {INPUT_LABELS[k] ?? k}: {String(v)}
            </span>
          ))}
          <button type="button" onClick={wb.applyExtracted} className="ml-auto inline-flex items-center gap-1 font-medium text-cobalt hover:underline">
            <ArrowDownToLine className="size-3" aria-hidden /> Use in project inputs
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-dvh flex-col bg-background">
      <AppHeader health={wb.health} healthError={wb.healthError} />
      {wide ? (
        <main className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_minmax(380px,460px)]">
          <aside className="min-h-0 border-r bg-paper" aria-label="Project inputs">
            <PanelTitle n="01" title="Project inputs" />
            <div className="h-[calc(100%-41px)]">{inputsPanel}</div>
          </aside>
          <section className="flex min-h-0 flex-col" aria-label="Interactive plot">
            <div className="border-b bg-background px-4 py-3">{ask}</div>
            <PanelTitle n="02" title="Interactive plot · Rule-to-Geometry" />
            <div className="min-h-0 flex-1">{plot}</div>
          </section>
          <aside className="min-h-0 overflow-y-auto border-l bg-paper" aria-label="Regulation inspector">
            <PanelTitle n="03" title="Regulation inspector" sticky />
            {inspector}
          </aside>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="border-b px-3 py-3">{ask}</div>
          <Tabs defaultValue="inspector" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="mx-3 mt-2 grid w-auto grid-cols-3">
              <TabsTrigger value="inputs" className={TAB_CLS}>Inputs</TabsTrigger>
              <TabsTrigger value="plot" className={TAB_CLS}>Plot</TabsTrigger>
              <TabsTrigger value="inspector" className={TAB_CLS}>Inspector</TabsTrigger>
            </TabsList>
            <TabsContent value="inputs" className="min-h-0 flex-1 bg-paper">
              {inputsPanel}
            </TabsContent>
            <TabsContent value="plot" className="min-h-[420px] flex-1">
              {plot}
            </TabsContent>
            <TabsContent value="inspector" className="min-h-0 flex-1 overflow-y-auto bg-paper">
              {inspector}
            </TabsContent>
          </Tabs>
        </main>
      )}
    </div>
  )
}

function PanelTitle({ n, title, sticky }: { n: string; title: string; sticky?: boolean }) {
  return (
    <div className={`flex h-[41px] items-center gap-2 border-b bg-paper px-4 ${sticky ? "sticky top-0 z-10" : ""}`}>
      <span className="font-mono text-[10px] text-cobalt">{n}</span>
      <h2 className="panel-label text-ink!">{title}</h2>
    </div>
  )
}

function AppHeader({ health, healthError }: { health: ReturnType<typeof useWorkbench>["health"]; healthError: boolean }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b bg-ink px-4 py-2.5 text-paper">
      <div className="flex items-center gap-3">
        <div className="grid size-7 place-items-center rounded-[3px] border border-paper/30">
          <ScanSearch className="size-4" aria-hidden />
        </div>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight">
            NIYAM<span className="text-[oklch(0.75_0.12_264)]">LENS</span>
          </p>
          <p className="text-[11px] text-paper/65">See the rule. Understand its impact.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-paper/75">
        <span className="inline-flex items-center gap-1.5">
          <Database className="size-3" aria-hidden />
          {healthError ? (
            <span className="text-[oklch(0.8_0.12_40)]">Server unreachable</span>
          ) : health ? (
            `${health.rules_loaded} rules · ${health.verified_sources.ok}/${health.verified_sources.total} tables verified`
          ) : (
            "Connecting…"
          )}
        </span>
        <span title="Amendments after 6 March 2025, including 28 Aug 2026 to Rule 2(5)(c), are not in the supplied rulebook.">
          M.P. Bhumi Vikas Rules 2012 · consolidated to 06-03-2025
        </span>
        <span className="rounded-sm border border-paper/25 px-1.5 py-0.5">Informational · not an approval</span>
      </div>
    </header>
  )
}
