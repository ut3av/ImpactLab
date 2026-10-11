import { ArrowUp, ListChecks, Search, Sparkles } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/** The official Track 1 sample questions (resources/sample_questions.md). Questions only — no answers. */
export const SAMPLE_QUESTIONS = [
  "My house faces a 10 m wide street and will be 9 m tall. How much open space do I leave at the front?",
  "I want a farm house on agricultural land. What is the minimum plot size and the maximum FAR?",
  "My development permission was granted in 2023. How long does it stay valid, and how many times can I renew it?",
  "I applied for building permission and the authority has not replied. What happens if they miss the deadline?",
  "How far must my balcony stay from a low-voltage overhead electric line, vertically and horizontally?",
  "Who is allowed to sign and submit my building plans?",
  "What documents go with an application for building permission?",
  "What is the fee for building permission for a residential house?",
  "Can I change my plan after it is sanctioned?",
  "What is the minimum rear open space for a 150 sq m residential plot?",
  "Do I need separate development permission for a 300 sq m plot that matches the Development Plan?",
  "Which rule decides what happens when the Development Plan and these rules disagree?",
  "What are the rules for lifts in a building taller than 15 m?",
  "मेरा प्लॉट 200 वर्ग मीटर का है और सामने 9 मीटर चौड़ी सड़क है। आगे कितनी जगह खाली छोड़नी होगी?",
  "बिल्डिंग परमिशन की फीस कितनी है और किस नियम में लिखी है?",
  "How do I pay my property tax online?",
  "What is the current market rate for land in Kolar Road, Bhopal?",
]

type Props = {
  busy: boolean
  aiConfigured: boolean
  useAi: boolean
  onUseAi: (v: boolean) => void
  onAsk: (q: string) => void
}

export function AskBar({ busy, aiConfigured, useAi, onUseAi, onAsk }: Props) {
  const [q, setQ] = useState("")
  const [showSamples, setShowSamples] = useState(false)
  const trimmed = q.trim()
  const tooLong = q.length > 1000
  const submit = () => {
    if (trimmed && !tooLong && !busy) onAsk(trimmed)
  }

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xs transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"
      >
        <Search className="size-4 text-slate-400 ml-1 shrink-0" aria-hidden />
        <label htmlFor="question" className="sr-only">
          Question in English or Hindi
        </label>
        <Textarea
          id="question"
          value={q}
          rows={1}
          placeholder="Ask in English or Hindi / हिंदी में पूछें — e.g. “My plot is 200 sq m on a 9 m road. What front open space applies?”"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          aria-invalid={tooLong}
          className="max-h-32 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-[13.5px] text-slate-900 shadow-none focus-visible:ring-0 placeholder:text-slate-400 leading-normal"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!trimmed || tooLong || busy}
          aria-label="Ask"
          className="size-8.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-2xs shrink-0 transition-transform active:scale-95 disabled:bg-slate-100 disabled:text-slate-400"
        >
          <ArrowUp className="size-4" />
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={() => setShowSamples((s) => !s)}
          aria-expanded={showSamples}
          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ListChecks className="size-3.5 text-slate-400" aria-hidden /> Sample questions (Official BMC Set)
        </button>
        <label className={cn("inline-flex items-center gap-2 text-[11.5px] font-medium", aiConfigured ? "text-slate-700" : "text-slate-400")}>
          <Sparkles className="size-3.5 text-blue-500" aria-hidden />
          {aiConfigured ? "AI Explanation (Cerebras)" : "AI explanation not configured"}
          <Switch size="sm" checked={aiConfigured && useAi} disabled={!aiConfigured} onCheckedChange={onUseAi} aria-label="Use AI explanation" />
        </label>
        {tooLong && <p className="w-full text-[11px] font-medium text-rose-600">Questions are limited to 1000 characters.</p>}
      </div>
      {showSamples && (
        <ul className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl clean-scrollbar" role="listbox" aria-label="Sample questions">
          {SAMPLE_QUESTIONS.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                lang={/[ऀ-ॿ]/.test(s) ? "hi" : "en"}
                onClick={() => {
                  setQ(s)
                  setShowSamples(false)
                  onAsk(s)
                }}
                className="flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <span className="w-5 shrink-0 font-mono text-[11px] font-semibold text-slate-400">{i + 1}</span>
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

