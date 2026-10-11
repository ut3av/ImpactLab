import { useEffect, useId, useMemo, useRef, useState } from "react"
import { StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { PlaybackControls, type PlaybackLabels } from "@/features/speech/PlaybackControls"
import { playbackStatusText } from "@/features/speech/status"
import { useNarration, type Narration } from "@/lib/speech/context"
import { cn } from "@/lib/utils"
import type { Citation, ExplainResponse, UiLanguage } from "@/types/api"
import {
  disclosuresFor,
  displayedSections,
  EXPLAIN_FOOTER,
  FALLBACK_REASONS,
  fallbackReason,
  hashText,
  isTransient,
  narrationText,
  SECTION_HEADINGS,
} from "./copy"
import type { Explanation } from "./useExplanation"

const READ_ALOUD: PlaybackLabels = { group: "Read aloud controls", play: "Read Aloud", pause: "Pause", resume: "Resume", stop: "Stop", replay: "Replay" }
const LANGS: readonly UiLanguage[] = ["en", "hi"]
const LONG_PASSAGE = 600
const DEVANAGARI = /[ऀ-ॿ]/

type Props = {
  explanation: Explanation
  /** Effective explanation language: the stored preference, else the record's language. */
  language: UiLanguage
  onLanguage: (lang: UiLanguage) => void
  /** What is being explained until the server names its own target. */
  pendingLabel: string
  /** Bumped by triggers below the panel: scroll it into view if needed, without moving focus. */
  scrollSignal: number
  /** Called after the clerk closes the panel (the inspector returns focus to the main trigger). */
  onClosed: () => void
}

/**
 * The one explanation panel of the inspector. Mounted for as long as there is a record so its live
 * region persists; the visible panel appears only while an explanation is loading, shown or failed.
 * Everything authoritative (status, citations, warnings, missing inputs) comes from the server response.
 */
export function ExplainPanel({ explanation, language, onLanguage, pendingLabel, scrollSignal, onClosed }: Props) {
  const { state, request, reset } = explanation
  const narration = useNarration("explain")
  const { stop } = narration
  const root = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const req = state.status === "idle" ? null : state.req
  const data = state.status === "success" ? state.data : null

  // The language follows the shared preference: a change here or in the Voice Guide re-requests (cache-aware).
  useEffect(() => {
    if (req && req.language !== language) {
      stop()
      request({ ...req, language })
    }
  }, [req, language, request, stop])

  // Scroll only when a trigger bumps the signal, never on (re)mount with an old value.
  const handledScroll = useRef(scrollSignal)
  useEffect(() => {
    if (scrollSignal === handledScroll.current) return
    handledScroll.current = scrollSignal
    if (scrollSignal <= 0) return
    const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    root.current?.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" })
  }, [scrollSignal])

  const narrated = useMemo(() => (data ? narrationText(data) : ""), [data])
  const narrationKey = data ? `explain:${hashText(narrated)}` : null
  // The displayed explanation changed (new response, language, detail, target, closed): stop the old narration first.
  useEffect(() => () => stop(), [narrationKey, stop])

  const retry = () => {
    if (!req) return
    stop()
    request(req, { force: true })
    heading.current?.focus() // the Try again button is replaced by the loading state
  }
  const close = () => {
    stop()
    reset()
    onClosed()
  }

  const open = state.status !== "idle"
  const live = state.status === "loading" ? "Generating explanation…" : data ? `Explanation ready: ${data.target.label}` : ""

  return (
    <div
      ref={root}
      data-explain-panel=""
      className={cn(open && "mt-2.5 space-y-3 rounded-sm border border-cobalt/35 bg-card p-3 shadow-[0_1px_0_rgba(0,0,0,0.03)]")}
      role={open ? "region" : undefined}
      aria-labelledby={open ? headingId : undefined}
    >
      {open && req && (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 id={headingId} ref={heading} tabIndex={-1} className="panel-label text-ink! outline-none">
                Explanation
              </h3>
              <p lang={data?.language} className="mt-0.5 text-[13px] leading-snug font-medium text-ink">
                {data ? data.target.label : pendingLabel}
              </p>
            </div>
            <Button type="button" size="xs" variant="ghost" onClick={close} className="shrink-0">
              Close explanation
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div role="group" aria-label="Explanation language" className="flex items-center gap-1">
              {LANGS.map((l) => (
                <Button
                  key={l}
                  type="button"
                  size="xs"
                  variant={language === l ? "secondary" : "ghost"}
                  aria-pressed={language === l}
                  onClick={() => {
                    if (l === language) return
                    stop()
                    onLanguage(l)
                  }}
                  className={cn(language === l && "ring-1 ring-cobalt/30")}
                >
                  {l === "en" ? (
                    "English"
                  ) : (
                    <>
                      Hindi (<span lang="hi">हिन्दी</span>)
                    </>
                  )}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-cobalt hover:text-cobalt"
              onClick={() => {
                stop()
                request({ ...req, detail: req.detail === "brief" ? "detailed" : "brief" })
              }}
            >
              {req.detail === "brief" ? "Show more detail" : "Show brief explanation"}
            </Button>
          </div>
        </div>
      )}

      {/* Persistent polite live region: present before the first request so the change is announced. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {live}
      </p>

      {state.status === "loading" && (
        <div aria-hidden="true" className="space-y-2 py-1">
          <div className="h-3 w-1/3 animate-pulse rounded-sm bg-muted" />
          <div className="h-3.5 w-full animate-pulse rounded-sm bg-muted" />
          <div className="h-3.5 w-11/12 animate-pulse rounded-sm bg-muted" />
          <div className="h-3.5 w-4/5 animate-pulse rounded-sm bg-muted" />
          <p className="pt-1 text-[11.5px] text-muted-foreground">Generating explanation…</p>
        </div>
      )}

      {state.status === "error" && (
        <div className="space-y-2">
          <div role="alert" className="rounded-sm border border-alert/40 bg-alert-soft p-2.5 text-alert">
            <p className="text-[12.5px] font-medium">The explanation could not be generated.</p>
            <p className="mt-0.5 text-[12px]">{state.message}</p>
          </div>
          <Button type="button" size="xs" variant="outline" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

      {data && narrationKey && <ExplainResult data={data} narration={narration} narrated={narrated} narrationKey={narrationKey} onRetry={retry} />}
    </div>
  )
}

function ExplainResult({ data, narration, narrated, narrationKey, onRetry }: { data: ExplainResponse; narration: Narration; narrated: string; narrationKey: string; onRetry: () => void }) {
  const lang = data.language
  const sections = displayedSections(data)
  const notes = disclosuresFor(data)
  return (
    <div className="space-y-3">
      <Provenance data={data} onRetry={onRetry} />
      <ReadAloud narration={narration} text={narrated} narrationKey={narrationKey} lang={lang} />

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={data.primary_status} />
        <span className="text-[11px] text-muted-foreground">Status from MIRA's verified data, not from the explanation</span>
      </div>

      <div lang={lang} className="space-y-2.5">
        <p className="text-[14px] leading-relaxed text-ink">{data.summary}</p>
        {sections.map((s) => (
          <section key={s.key} className="space-y-0.5">
            <h4 className="text-[12px] font-semibold text-ink">{SECTION_HEADINGS[s.key][lang]}</h4>
            <p className="text-[13px] leading-relaxed whitespace-pre-line text-ink/90">{s.text}</p>
          </section>
        ))}
      </div>

      {notes.length > 0 && (
        <ul className="space-y-1 border-l-2 border-rule-line pl-2.5 text-[11.5px] leading-snug text-muted-foreground">
          {notes.map((n) => (
            <li key={n} lang={DEVANAGARI.test(n) ? "hi" : "en"}>
              {n}
            </li>
          ))}
        </ul>
      )}

      {data.warnings.map((w) => (
        <div key={w.code} role="note" className="rounded-sm border border-review/50 bg-review-soft p-2.5">
          <p className="text-[12.5px] font-semibold text-[oklch(0.42_0.1_65)]">{w.title}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink/85">{w.detail}</p>
        </div>
      ))}

      {data.missing_inputs.length > 0 && (
        <div className="rounded-sm border border-dashed border-review/60 p-2.5">
          <p className="panel-label mb-1.5 text-[oklch(0.45_0.11_65)]!">Inputs still needed</p>
          <ul className="space-y-1">
            {data.missing_inputs.map((m) => (
              <li key={m.field} className="text-[12px] leading-snug">
                <span className="font-medium text-ink">{m.label}</span>
                <span className="text-muted-foreground"> — {m.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.citations.length > 0 ? (
        <section aria-label="Official source text used for this explanation" className="space-y-2">
          <div>
            <h4 className="panel-label text-ink!">Official source text used for this explanation</h4>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Official source text · English consolidated copy · not translated</p>
          </div>
          {data.citations.map((c, i) => (
            <SourcePassage key={(c.chunk_id ?? c.rule) + i} c={c} />
          ))}
        </section>
      ) : (
        <p className="text-[12px] text-muted-foreground">No rule passage supports this explanation, so no source text is quoted.</p>
      )}

      <p className="border-t pt-2 text-[11px] leading-snug text-muted-foreground">{EXPLAIN_FOOTER}</p>
    </div>
  )
}

function Provenance({ data, onRetry }: { data: ExplainResponse; onRetry: () => void }) {
  if (data.source === "ai")
    return (
      <div className="rounded-sm border border-cobalt/30 bg-cobalt-soft/50 px-2.5 py-2">
        <p className="font-mono text-[10px] font-medium tracking-wider text-cobalt uppercase">AI explanation{data.model ? ` · ${data.model}` : ""}</p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink/80">Generated by AI from the quoted rules. It is not the official text; check it against the source.</p>
      </div>
    )
  const reason = fallbackReason(data.fallback_reason)
  return (
    <div className="rounded-sm border border-border bg-muted/60 px-2.5 py-2">
      <p className="font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase">Basic explanation · not live AI</p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-ink/80">{FALLBACK_REASONS[reason]}</p>
      {isTransient(reason) && (
        <Button type="button" size="xs" variant="outline" onClick={onRetry} className="mt-1.5">
          Try again
        </Button>
      )}
    </div>
  )
}

function ReadAloud({ narration, text, narrationKey, lang }: { narration: Narration; text: string; narrationKey: string; lang: UiLanguage }) {
  const [touched, setTouched] = useState<string | null>(null)
  const status = narration.activeKey === narrationKey ? narration.status : "idle"
  const err = narration.error
  const noHindiVoice = lang === "hi" && narration.supported && ((narration.voicesLoaded && !narration.voiceAvailable.hi) || err?.code === "no-voice")
  const unavailable = !narration.supported || noHindiVoice
  const message = !narration.supported
    ? "Audio is not available in this browser; the explanation remains available as text."
    : noHindiVoice
      ? "No Hindi voice is installed on this device, so this explanation cannot be read aloud in Hindi. Add a Hindi (India) voice in your operating system's speech or language settings, or open MIRA in Microsoft Edge or Google Chrome. The explanation remains available as text."
      : err?.code === "no-voice"
        ? "No English voice is available in this browser; the explanation remains available as text."
        : err?.code === "blocked"
          ? "The browser blocked audio playback. Select Read Aloud again to retry."
          : err
            ? "Audio could not be played. The explanation remains available as text."
            : null
  const act = (run: () => void) => () => {
    setTouched(narrationKey)
    run()
  }
  return (
    <div className="space-y-1">
      <PlaybackControls
        status={status}
        played={narration.finishedKey === narrationKey}
        onPlay={act(() => narration.speak(narrationKey, text, lang))}
        onPause={act(narration.pause)}
        onResume={act(narration.resume)}
        onStop={act(narration.stop)}
        labels={READ_ALOUD}
        unavailable={unavailable}
        size="xs"
      />
      {message && <p className="text-[11.5px] leading-snug text-muted-foreground">{message}</p>}
      <p aria-live="polite" className="sr-only">
        {touched === narrationKey ? playbackStatusText(status, "en") : ""}
      </p>
    </div>
  )
}

function SourcePassage({ c }: { c: Citation }) {
  const long = c.passage.length > LONG_PASSAGE
  const [open, setOpen] = useState(!long)
  return (
    <article className="space-y-1">
      <p className="font-mono text-[11.5px] font-semibold text-ink">
        Rule {c.rule}
        {c.sub_rule ?? ""} · PDF p. {c.page}
        <span className="ml-1.5 font-sans text-[11.5px] font-normal text-muted-foreground">{c.title}</span>
      </p>
      <blockquote lang="en" className={cn("source-quote", !open && "max-h-32 overflow-hidden [mask-image:linear-gradient(black_70%,transparent)]")}>
        {c.passage}
      </blockquote>
      {long && (
        <button type="button" aria-expanded={open} className="text-[11.5px] text-cobalt hover:underline" onClick={() => setOpen((o) => !o)}>
          {open ? "Show less" : "Show full passage"}
        </button>
      )}
    </article>
  )
}
