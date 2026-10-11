import { ArrowDownToLine, Building2, Database, Globe2, Languages } from "lucide-react"
import { useState } from "react"
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
import { cn } from "@/lib/utils"

const TAB_CLS = "data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs data-[state=active]:ring-1 data-[state=active]:ring-slate-300 font-medium"

export function Workbench() {
  const wb = useWorkbench()
  const navigate = useNavigate()
  const wide = useMediaQuery("(min-width: 1024px)")
  const [lang, setLang] = useState<"en" | "hi">("en")

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
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50/75 px-3 py-2 text-[12px] text-slate-700 shadow-2xs">
          <span className="font-medium text-slate-800">Read from the question:</span>
          {Object.entries(wb.extracted).map(([k, v]) => (
            <span key={k} className="rounded border border-blue-100 bg-white px-2 py-0.5 font-mono text-[11px] font-medium text-slate-800 shadow-2xs">
              {INPUT_LABELS[k] ?? k}: {String(v)}
            </span>
          ))}
          <button type="button" onClick={wb.applyExtracted} className="ml-auto inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 hover:underline">
            <ArrowDownToLine className="size-3.5" aria-hidden /> Use in project inputs
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-900">
      <AppHeader health={wb.health} healthError={wb.healthError} lang={lang} onLangChange={setLang} />
      {wide ? (
        <main className="grid min-h-0 flex-1 grid-cols-[330px_minmax(0,1fr)_minmax(390px,460px)]">
          <aside className="min-h-0 border-r border-slate-200 bg-white shadow-2xs" aria-label="Project inputs">
            <PanelTitle n="01" title="Project inputs" />
            <div className="h-[calc(100%-41px)] clean-scrollbar overflow-y-auto">{inputsPanel}</div>
          </aside>
          <section className="flex min-h-0 flex-col bg-slate-50/60" aria-label="Interactive plot">
            <div className="border-b border-slate-200 bg-white px-4 py-3 shadow-2xs">{ask}</div>
            <PanelTitle n="02" title="Rule-to-Geometry Canvas" />
            <div className="min-h-0 flex-1 relative">{plot}</div>
          </section>
          <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white clean-scrollbar shadow-2xs" aria-label="Regulation inspector">
            <PanelTitle n="03" title="Regulation inspector & debugger" sticky />
            {inspector}
          </aside>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col bg-slate-50">
          <div className="border-b border-slate-200 bg-white px-3 py-3 shadow-2xs">{ask}</div>
          <Tabs defaultValue="inspector" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="mx-3 mt-2 grid w-auto grid-cols-3 bg-slate-200/80 p-1">
              <TabsTrigger value="inputs" className={TAB_CLS}>Inputs</TabsTrigger>
              <TabsTrigger value="plot" className={TAB_CLS}>Plot</TabsTrigger>
              <TabsTrigger value="inspector" className={TAB_CLS}>Inspector</TabsTrigger>
            </TabsList>
            <TabsContent value="inputs" className="min-h-0 flex-1 bg-white clean-scrollbar overflow-y-auto">
              {inputsPanel}
            </TabsContent>
            <TabsContent value="plot" className="min-h-[420px] flex-1 bg-slate-50">
              {plot}
            </TabsContent>
            <TabsContent value="inspector" className="min-h-0 flex-1 overflow-y-auto bg-white clean-scrollbar">
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
    <div className={`flex h-[41px] items-center justify-between border-b border-slate-200 bg-slate-50/90 px-4 backdrop-blur-xs ${sticky ? "sticky top-0 z-10" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-sm bg-blue-100 font-mono text-[10.5px] font-bold text-blue-700">{n}</span>
        <h2 className="panel-label text-slate-700!">{title}</h2>
      </div>
    </div>
  )
}

function AppHeader({
  health,
  healthError,
  lang,
  onLangChange,
}: {
  health: ReturnType<typeof useWorkbench>["health"]
  healthError: boolean
  lang: "en" | "hi"
  onLangChange: (l: "en" | "hi") => void
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-slate-200 bg-white px-4 py-2.5 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="grid size-8 place-items-center rounded-md border border-blue-200 bg-blue-50 text-blue-600 shadow-2xs">
          <Building2 className="size-4.5" aria-hidden />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-bold tracking-tight text-slate-900">
              MIRA
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Bhopal Municipal Corporation • M.P. Bhumi Vikas Rules
            </span>
          </div>
          <p className="text-[11px] font-medium text-slate-500">See the Rule. Understand Its Impact.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {/* Jurisdiction mobile badge */}
        <span className="sm:hidden inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
          BMC • M.P. Rules 2012
        </span>

        {/* Database Status */}
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10.5px] text-slate-600 shadow-2xs">
          <Database className="size-3 text-slate-400" aria-hidden />
          {healthError ? (
            <span className="font-semibold text-rose-600">Server unreachable</span>
          ) : health ? (
            `${health.rules_loaded} rules · ${health.verified_sources.ok}/${health.verified_sources.total} tables verified`
          ) : (
            "Connecting…"
          )}
        </span>

        <span
          className="hidden md:inline text-[11px] text-slate-400"
          title="Amendments after 6 March 2025, including 28 Aug 2026 to Rule 2(5)(c), are not in the supplied rulebook."
        >
          Consolidated to 06-03-2025
        </span>

        <span className="hidden lg:inline rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500 font-medium">
          Informational · Not an approval
        </span>

        {/* Language Switcher Toggle */}
        <div className="flex items-center rounded-md border border-slate-200 bg-slate-100 p-0.5 shadow-2xs" role="group" aria-label="Language selection">
          <button
            type="button"
            onClick={() => onLangChange("en")}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              lang === "en" ? "bg-white text-slate-900 font-semibold shadow-xs" : "text-slate-600 hover:text-slate-900",
            )}
            aria-pressed={lang === "en"}
          >
            <Globe2 className="size-3 text-slate-500" aria-hidden /> English
          </button>
          <button
            type="button"
            onClick={() => onLangChange("hi")}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              lang === "hi" ? "bg-white text-blue-700 font-semibold shadow-xs" : "text-slate-600 hover:text-slate-900",
            )}
            aria-pressed={lang === "hi"}
          >
            <Languages className="size-3 text-blue-600" aria-hidden /> हिंदी
          </button>
        </div>
      </div>
    </header>
  )
}

