import { ArrowUp, Search } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type Props = {
  busy: boolean
  aiConfigured: boolean
  useAi: boolean
  onUseAi: (v: boolean) => void
  onAsk: (q: string) => void
}

export function AskBar({ busy, onAsk }: Props) {
  const [q, setQ] = useState("")
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
        className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 shadow-md backdrop-blur-md transition-all focus-within:border-white/35 focus-within:ring-2 focus-within:ring-white/15"
      >
        <Search className="size-4 text-stone-400 shrink-0 ml-0.5" aria-hidden />
        <label htmlFor="question" className="sr-only">
          Question in English or Hindi
        </label>
        <Textarea
          id="question"
          value={q}
          rows={1}
          placeholder="Ask in English or Hindi / नियम पूछें — e.g. “What front open space applies on a 9 m road?”"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          aria-invalid={tooLong}
          className="max-h-24 min-h-8 flex-1 resize-none border-0 bg-transparent px-1.5 py-1 text-[13px] text-white shadow-none focus-visible:ring-0 placeholder:text-stone-400 leading-normal"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!trimmed || tooLong || busy}
          aria-label="Ask"
          className="size-7.5 rounded-lg bg-white text-black hover:bg-amber-400 hover:text-black shadow-xs shrink-0 transition-transform active:scale-95 disabled:bg-white/10 disabled:text-stone-500"
        >
          <ArrowUp className="size-3.5" />
        </Button>
      </form>
      {tooLong && <p className="mt-1 px-1 text-[11px] font-medium text-rose-400">Questions are limited to 1000 characters.</p>}
    </div>
  )
}
