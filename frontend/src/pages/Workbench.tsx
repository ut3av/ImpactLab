import { ArrowDownToLine, BookOpen, Database, Globe2, Headphones, History, Languages, LayoutGrid, RotateCcw, Search, X } from "lucide-react"
import { useCallback, useMemo, useRef, useState, type RefObject } from "react"
import { useNavigate } from "react-router-dom"
import { MiraMark } from "@/components/brand/MiraLogo"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AskBar } from "@/features/ask/AskBar"
import { GUIDE_PANEL_ID, type GuideContext } from "@/features/guide/steps"
import { VoiceGuide } from "@/features/guide/VoiceGuide"
import { ProjectInputsPanel } from "@/features/inputs/ProjectInputsPanel"
import { RegulationInspector } from "@/features/inspector/RegulationInspector"
import { PlotViewport } from "@/features/plot3d/PlotViewport"
import { saveReceipt } from "@/features/receipt/CounterReceipt"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useWorkbench } from "@/hooks/useWorkbench"
import { INPUT_LABELS } from "@/lib/record"
import { cn } from "@/lib/utils"
export function Workbench() {
  const wb = useWorkbench()
  const navigate = useNavigate()
  const wide = useMediaQuery("(min-width: 1024px)")
  const aiConfigured = !!wb.health?.ai_configured
  const [lang, setLang] = useState<"en" | "hi">("en")
  const [activeNav, setActiveNav] = useState<"workbench" | "rules" | "history">("workbench")
  const [ruleBookOpen, setRuleBookOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Only open/closed lives here; the guide keeps its own step, language and narration state.
  const [guideOpen, setGuideOpen] = useState(false)
  const guideButton = useRef<HTMLButtonElement>(null)
  const toggleGuide = useCallback(() => setGuideOpen((o) => !o), [])
  const closeGuide = useCallback(() => {
    setGuideOpen(false)
    guideButton.current?.focus()
  }, [])
  const guideCtx = useMemo<GuideContext>(
    () => ({ record: wb.record, selected: wb.selected, scene: wb.scene, aiConfigured, wide }),
    [wb.record, wb.selected, wb.scene, aiConfigured, wide],
  )

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
    <RegulationInspector
      record={wb.record}
      selected={wb.selected}
      onSelect={wb.setSelected}
      onReceipt={openReceipt}
      error={wb.error}
      loading={wb.busy}
      aiConfigured={aiConfigured}
    />
  )
  // Stable props: PlotViewport is memoised so guide and narration updates never re-render the 3D scene.
  const plot = <PlotViewport model={wb.scene} selected={wb.selected} onSelect={wb.setSelected} />
  const ask = (
    <div className="space-y-1.5" data-guide="ask">
      <AskBar busy={wb.busy} aiConfigured={aiConfigured} useAi={wb.useAi} onUseAi={wb.setUseAi} onAsk={wb.ask} />
      {Object.keys(wb.extracted).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/80 px-2.5 py-1.5 text-[11.5px] text-slate-700 shadow-2xs">
          <span className="font-semibold text-slate-800">Extracted from query:</span>
          {Object.entries(wb.extracted).map(([k, v]) => (
            <span key={k} className="rounded border border-blue-100 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-800 shadow-2xs">
              {INPUT_LABELS[k] ?? k}: {String(v)}
            </span>
          ))}
          <button type="button" onClick={wb.applyExtracted} className="ml-auto inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 hover:underline">
            <ArrowDownToLine className="size-3" aria-hidden /> Use in project inputs
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-dvh flex-col bg-[#0d0e12] text-white font-sans">
      <AppHeader
        health={wb.health}
        healthError={wb.healthError}
        guideOpen={guideOpen}
        onToggleGuide={toggleGuide}
        guideButtonRef={guideButton}
        lang={lang}
        onLangChange={setLang}
        onReset={wb.clear}
        activeNav={activeNav}
        onNavChange={(tab) => {
          setActiveNav(tab)
          if (tab === "rules") setRuleBookOpen(true)
          if (tab === "history") setHistoryOpen(true)
        }}
      />
      {wide ? (
        <main className="grid min-h-0 flex-1 grid-cols-[290px_minmax(0,1fr)_340px]">
          {/* Left Panel: Inputs Drawer */}
          <aside className="min-h-0 border-r border-white/12 bg-[rgba(17,24,39,0.85)] shadow-2xs backdrop-blur-md" aria-label="Project inputs" data-guide="inputs">
            <PanelTitle n="01" title="Project inputs" />
            <div className="h-[calc(100%-38px)] clean-scrollbar overflow-y-auto">{inputsPanel}</div>
          </aside>

          {/* Center Panel: Hero 3D/2D Mapping Canvas (Maximum Screen Space) */}
          <section className="flex min-h-0 flex-col bg-[#0d0e12]" aria-label="Interactive plot">
            <div className="border-b border-white/12 bg-[rgba(17,24,39,0.85)] px-3.5 py-2 backdrop-blur-md shadow-2xs">{ask}</div>
            <PanelTitle n="02" title="Rule-to-Geometry Canvas" />
            <div className="min-h-0 flex-1 relative" data-guide="viewport">
              {plot}
            </div>
          </section>

          {/* Right Panel: Minimal Regulation Inspector */}
          <aside className="min-h-0 overflow-y-auto border-l border-white/12 bg-[rgba(17,24,39,0.85)] clean-scrollbar shadow-2xs backdrop-blur-md text-white" aria-label="Regulation inspector" data-guide="inspector">
            <PanelTitle n="03" title="Regulation inspector" sticky />
            {inspector}
          </aside>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col bg-[#0d0e12]">
          <div className="border-b border-white/12 bg-[rgba(17,24,39,0.85)] px-3 py-2 shadow-2xs">{ask}</div>
          <Tabs defaultValue="plot" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="mx-3 mt-1.5 grid w-auto grid-cols-3 bg-[#131722] border border-white/12 p-0.5 text-white/70">
              <TabsTrigger value="inputs" className="data-[state=active]:bg-white data-[state=active]:text-black font-semibold">Inputs</TabsTrigger>
              <TabsTrigger value="plot" className="data-[state=active]:bg-white data-[state=active]:text-black font-semibold">Plot</TabsTrigger>
              <TabsTrigger value="inspector" className="data-[state=active]:bg-white data-[state=active]:text-black font-semibold">Inspector</TabsTrigger>
            </TabsList>
            <TabsContent value="inputs" className="min-h-0 flex-1 bg-[rgba(17,24,39,0.85)] clean-scrollbar overflow-y-auto" data-guide="inputs">
              {inputsPanel}
            </TabsContent>
            <TabsContent value="plot" className="min-h-[420px] flex-1 bg-[#f8fafc]" data-guide="viewport">
              {plot}
            </TabsContent>
            <TabsContent value="inspector" className="min-h-0 flex-1 overflow-y-auto bg-[rgba(17,24,39,0.85)] text-white clean-scrollbar" data-guide="inspector">
              {inspector}
            </TabsContent>
          </Tabs>
        </main>
      )}

      {guideOpen && <VoiceGuide ctx={guideCtx} onClose={closeGuide} />}
      {ruleBookOpen && <RuleBookModal onClose={() => setRuleBookOpen(false)} onSelectRule={(q) => { wb.ask(q); setRuleBookOpen(false); }} />}
      {historyOpen && <HistoryModal record={wb.record} onClose={() => setHistoryOpen(false)} onAsk={(q) => { wb.ask(q); setHistoryOpen(false); }} />}
    </div>
  )
}

function PanelTitle({ n, title, sticky }: { n: string; title: string; sticky?: boolean }) {
  return (
    <div className={`flex h-[38px] items-center justify-between border-b border-white/12 bg-[rgba(17,24,39,0.9)] px-3.5 backdrop-blur-md ${sticky ? "sticky top-0 z-10" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="flex size-4.5 items-center justify-center rounded-sm bg-white/10 border border-white/20 font-sans text-[10px] font-bold text-white">{n}</span>
        <h2 className="font-sans text-[11.5px] font-semibold text-white tracking-tight">{title}</h2>
      </div>
    </div>
  )
}

type HeaderProps = {
  health: ReturnType<typeof useWorkbench>["health"]
  healthError: boolean
  guideOpen: boolean
  onToggleGuide: () => void
  guideButtonRef: RefObject<HTMLButtonElement | null>
  lang: "en" | "hi"
  onLangChange: (l: "en" | "hi") => void
  onReset: () => void
  activeNav: "workbench" | "rules" | "history"
  onNavChange: (t: "workbench" | "rules" | "history") => void
}

function AppHeader({
  health,
  healthError,
  guideOpen,
  onToggleGuide,
  guideButtonRef,
  lang,
  onLangChange,
  onReset,
  activeNav,
  onNavChange,
}: HeaderProps) {
  const verifiedText = healthError ? "Server unreachable" : health ? `${health.rules_loaded} rules · ${health.verified_sources.ok}/${health.verified_sources.total} tables verified` : "Connecting…"

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/10 bg-[rgba(13,14,18,0.95)] px-4 py-2 shadow-xs backdrop-blur-md text-white">
      {/* 1. Left: MIRA Logo + Subtitle */}
      <div className="flex items-center gap-3">
        <div className="grid size-8 place-items-center rounded-lg border border-white/15 bg-white/5 p-1 text-white shadow-xs">
          <MiraMark size={20} />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-bold tracking-tight text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.35)]">
              MIRA
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10.5px] font-medium text-white/70">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Bhopal Municipal Corporation • Bhumi Vikas Rules
            </span>
          </div>
        </div>
      </div>

      {/* 2. Center: Clean Navigation Tabs */}
      <nav className="flex items-center rounded-lg border border-white/12 bg-white/5 p-0.5 shadow-2xs" aria-label="Main Navigation">
        <button
          type="button"
          onClick={() => onNavChange("workbench")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition-all",
            activeNav === "workbench"
              ? "bg-white/15 text-white font-semibold border border-white/30 shadow-xs"
              : "text-white/60 hover:text-white hover:bg-white/5",
          )}
        >
          <LayoutGrid className="size-3.5 text-white" />
          <span>Workbench / नक्शा</span>
        </button>
        <button
          type="button"
          onClick={() => onNavChange("rules")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition-all",
            activeNav === "rules"
              ? "bg-white/15 text-white font-semibold border border-white/30 shadow-xs"
              : "text-white/60 hover:text-white hover:bg-white/5",
          )}
        >
          <BookOpen className="size-3.5 text-white/70" />
          <span>Rule Book</span>
        </button>
        <button
          type="button"
          onClick={() => onNavChange("history")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition-all",
            activeNav === "history"
              ? "bg-white/15 text-white font-semibold border border-white/30 shadow-xs"
              : "text-white/60 hover:text-white hover:bg-white/5",
          )}
        >
          <History className="size-3.5 text-white/70" />
          <span>History</span>
        </button>
      </nav>

      {/* 3. Right: Essential Actions & Compressed Tooltips */}
      <div className="flex items-center gap-2">
        {/* Reset Workspace button */}
        <button
          type="button"
          onClick={onReset}
          title="Clear / Reset Workspace"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/15 hover:text-rose-300 hover:border-rose-500/40 transition-colors shadow-2xs"
        >
          <RotateCcw className="size-3" aria-hidden />
          <span>Reset</span>
        </button>

        {/* Language toggle: [ English | हिंदी ] */}
        <div className="flex items-center rounded-lg border border-white/15 bg-white/5 p-0.5 shadow-2xs" role="group" aria-label="Language selection">
          <button
            type="button"
            onClick={() => onLangChange("en")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
              lang === "en" ? "bg-white/15 text-white font-semibold border border-white/30 shadow-xs" : "text-white/60 hover:text-white",
            )}
            aria-pressed={lang === "en"}
          >
            <Globe2 className="size-3 text-white" aria-hidden /> English
          </button>
          <button
            type="button"
            onClick={() => onLangChange("hi")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
              lang === "hi" ? "bg-white/15 text-white font-semibold border border-white/30 shadow-xs" : "text-white/60 hover:text-white",
            )}
            aria-pressed={lang === "hi"}
          >
            <Languages className="size-3 text-white" aria-hidden /> हिंदी
          </button>
        </div>

        {/* Subtle Database Status Pill */}
        <span
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/75 shadow-2xs font-sans"
          title="Consolidated to 06-03-2025 · Bhopal Municipal Corporation"
        >
          <Database className="size-3 text-white/50" aria-hidden />
          <span>{verifiedText}</span>
        </span>

        {/* Voice Guide Button (accessible & compact) */}
        <button
          ref={guideButtonRef}
          type="button"
          data-guide="guide-button"
          aria-expanded={guideOpen}
          aria-controls={GUIDE_PANEL_ID}
          onClick={onToggleGuide}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/15 px-2.5 py-1 text-[11.5px] font-semibold text-amber-300 hover:bg-amber-400/25 transition-colors shadow-2xs"
          title="Voice Guide"
        >
          <Headphones className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Voice Guide</span>
        </button>
      </div>
    </header>
  )
}

function RuleBookModal({ onClose, onSelectRule }: { onClose: () => void; onSelectRule: (q: string) => void }) {
  const [search, setSearch] = useState("")
  const rules = [
    { num: "56", title: "Open Spaces (Front, Rear, Side Setbacks)", desc: "Table-based minimum clearances for residential & commercial plots.", page: 77 },
    { num: "26", title: "Floor Area Ratio (FAR) & Covered Area", desc: "Density and maximum allowable built-up area formulas.", page: 42 },
    { num: "14", title: "Development & Building Permissions", desc: "Statutory sanction timelines, deemed approval, and renewals.", page: 24 },
    { num: "7", title: "Documents for Sanction Application", desc: "Checklist of mandatory drawings, ownership, and structural certificates.", page: 12 },
    { num: "57", title: "Interior Open Spaces & Courtyards", desc: "Minimum light and ventilation court dimensions.", page: 81 },
    { num: "80", title: "Parking Requirements", desc: "Off-street parking space norms per tenement and square metre.", page: 104 },
  ]
  const filtered = rules.filter((r) => r.num.includes(search) || r.title.toLowerCase().includes(search.toLowerCase()) || r.desc.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#131722] p-5 shadow-2xl text-white animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4.5 text-white" />
            <h3 className="text-base font-bold text-white">Bhopal Municipal Rule Book</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white">
            <X className="size-4.5" />
          </button>
        </div>
        <div className="mt-3.5 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules (e.g. 56, open spaces, FAR, parking)..."
            className="w-full rounded-xl border border-white/15 bg-[#0d0e12] pl-9 pr-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-white focus:ring-1 focus:ring-white/30"
          />
        </div>
        <div className="mt-3.5 max-h-80 overflow-y-auto space-y-2 clean-scrollbar pr-1">
          {filtered.map((r) => (
            <div
              key={r.num}
              onClick={() => onSelectRule(`What is Rule ${r.num}? ${r.title}`)}
              className="group cursor-pointer rounded-xl border border-white/10 bg-white/5 p-3 hover:border-white/30 hover:bg-white/10 transition-all shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[13px] text-white group-hover:text-amber-200">
                  Rule {r.num} · {r.title}
                </span>
                <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white">
                  PDF p. {r.page}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-white/60">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function HistoryModal({ record, onClose, onAsk }: { record: ReturnType<typeof useWorkbench>["record"]; onClose: () => void; onAsk: (q: string) => void }) {
  const recent = [
    "My house faces a 10 m wide street and will be 9 m tall. How much open space do I leave at the front?",
    "What is the minimum rear open space for a 150 sq m residential plot?",
    "मेरा प्लॉट 200 वर्ग मीटर का है और सामने 9 मीटर चौड़ी सड़क है। आगे कितनी जगह खाली छोड़नी होगी?",
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#131722] p-5 shadow-2xl text-white animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <History className="size-4.5 text-white" />
            <h3 className="text-base font-bold text-white">Evaluation History</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white">
            <X className="size-4.5" />
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {record && (
            <div className="rounded-xl border border-white/15 bg-white/10 p-3 shadow-2xs">
              <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wide">Current Evaluation</span>
              <p className="mt-0.5 text-[13px] font-semibold text-white">{record.question}</p>
            </div>
          )}
          <p className="text-[11px] font-bold text-white/60 uppercase tracking-wider mt-3">Recent Inquiries</p>
          {recent.map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onAsk(q)}
              className="w-full text-left rounded-xl border border-white/10 bg-white/5 p-3 text-[12.5px] text-white/75 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all shadow-2xs"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
