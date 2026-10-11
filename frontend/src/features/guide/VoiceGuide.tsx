import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { MiraMark } from "@/components/brand/MiraLogo"
import { Button } from "@/components/ui/button"
import { webglAvailable } from "@/features/plot3d/PlotViewport"
import { PlaybackControls } from "@/features/speech/PlaybackControls"
import { playbackStatusText } from "@/features/speech/status"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { useLanguagePreference } from "@/lib/language"
import { useNarration } from "@/lib/speech/context"
import { cn } from "@/lib/utils"
import type { UiLanguage } from "@/types/api"
import { GuideHighlight } from "./GuideHighlight"
import { buildContextStep, GUIDE_PANEL_ID, GUIDE_STEPS, GUIDE_TEXT, hasScreenState, narrationText, stepKey, type GuideContext, type GuideStep } from "./steps"
import type { HighlightBox } from "./target"

const OWNER = "guide"
const TOTAL = GUIDE_STEPS.length
const TITLE_ID = `${GUIDE_PANEL_ID}-title`
const STEP_TITLE_ID = `${GUIDE_PANEL_ID}-step-title`
const LANG_ID = `${GUIDE_PANEL_ID}-language`
const DISABLED = "aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:bg-transparent"
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1"
/** Letter-spacing and small mono caps break Devanagari conjuncts; Hindi labels use normal spacing. */
const HI_LABEL = "font-sans text-[12px] tracking-normal"

type Phase = "intro" | "steps" | "context"

function stepAt(ctx: GuideContext, phase: Phase, index: number, lang: UiLanguage): GuideStep | null {
  if (phase === "intro") return null
  return phase === "context" ? buildContextStep(ctx, lang) : GUIDE_STEPS[index](ctx, lang)
}

function isTextField(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
}

type Props = {
  /** App state the guide describes (memoised by the Workbench). */
  ctx: GuideContext
  /** Close the guide; the Workbench returns focus to the header button. */
  onClose: () => void
}

/**
 * Non-modal, bilingual walkthrough with optional narration. It never traps focus or blocks the
 * app, never speaks on its own (only after Start Guide, Play, Replay or Explain current screen),
 * and keeps all of its state here so the Workbench and the 3D scene do not re-render for it.
 */
export function VoiceGuide({ ctx, onClose }: Props) {
  const [pref, setPref] = useLanguagePreference()
  const lang: UiLanguage = pref ?? "en"
  const t = GUIDE_TEXT[lang]
  const reduced = useReducedMotion()
  const webgl = useMemo(() => webglAvailable(), [])
  const full = useMemo<GuideContext>(() => ({ ...ctx, webgl }), [ctx, webgl])
  const [phase, setPhase] = useState<Phase>("intro")
  const [index, setIndex] = useState(0)
  const [side, setSide] = useState<"left" | "right">("right")
  const n = useNarration(OWNER)
  /** Narrate each newly shown step; on after Start / Play / Replay, off after Stop or when another narration takes over. */
  const auto = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const focusStepHeading = useRef(false)

  const step = useMemo(() => stepAt(full, phase, index, lang), [full, phase, index, lang])
  const key = step ? stepKey(step, lang) : null
  const hiMissing = n.voicesLoaded && !n.voiceAvailable.hi
  const canSpeak = (l: UiLanguage) => n.supported && !(l === "hi" && hiMissing)
  const speakStep = (s: GuideStep | null, l: UiLanguage) => {
    if (s && canSpeak(l)) n.speak(stepKey(s, l), narrationText(s, l), l)
  }

  // Opening only moves focus; it never starts speech.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // Start Guide / Explain current screen remove the button that had focus: continue at the step title.
  useEffect(() => {
    if (!focusStepHeading.current) return
    focusStepHeading.current = false
    stepHeadingRef.current?.focus()
  }, [phase])

  useEffect(() => {
    if (n.engineOwner && n.engineOwner !== OWNER) auto.current = false
  }, [n.engineOwner])

  // The explanation of the current screen changed while it was being read (the clerk selected
  // something else): never keep reading stale text.
  const lastKey = useRef(key)
  useEffect(() => {
    const prev = lastKey.current
    lastKey.current = key
    if (!prev || prev === key || n.activeKey !== prev) return
    if (step && auto.current && n.status === "speaking" && canSpeak(lang)) speakStep(step, lang)
    else n.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const begin = (next: Phase) => {
    focusStepHeading.current = true
    setPhase(next)
    setIndex(0)
    auto.current = true
    speakStep(stepAt(full, next, 0, lang), lang)
  }

  const go = (delta: number) => {
    const next = index + delta
    if (phase !== "steps" || next < 0 || next >= TOTAL) return
    const wasSpeaking = n.status === "speaking"
    setIndex(next)
    const s = stepAt(full, "steps", next, lang)
    if (auto.current && wasSpeaking && s && canSpeak(lang)) speakStep(s, lang)
    else n.stop()
  }

  const changeLanguage = (l: UiLanguage) => {
    if (l === lang) return
    const wasSpeaking = n.status === "speaking"
    setPref(l)
    n.clearError()
    const s = stepAt(full, phase, index, l)
    if (s && auto.current && wasSpeaking && canSpeak(l)) speakStep(s, l)
    else n.stop()
  }

  const play = () => {
    auto.current = true
    speakStep(step, lang)
  }
  const stopVoice = () => {
    auto.current = false
    n.stop()
  }
  const close = () => {
    auto.current = false
    n.stop()
    onClose()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.shiftKey && phase === "steps" && !isTextField(e.target)) {
      e.preventDefault()
      go(e.key === "ArrowRight" ? 1 : -1)
    }
  }

  // Desktop: sit at the bottom-right (clear of the sticky Evaluate buttons) unless the highlighted region is on the right half.
  const onBox = useCallback((b: HighlightBox | null) => {
    setSide(b && b.left + b.width / 2 >= window.innerWidth / 2 ? "left" : "right")
  }, [])
  const targets = step?.highlight ?? []
  const panelSide = targets.length ? side : "right"

  let audioNote: string | null = null
  if (!n.supported || n.error?.code === "unsupported") audioNote = t.unsupported
  else if (lang === "hi" && (hiMissing || n.error?.code === "no-voice")) audioNote = t.noVoiceHi
  else if (n.error) audioNote = n.error.code === "blocked" ? t.blocked : n.error.code === "no-voice" ? t.noVoiceEn : t.failed

  const announcement = !step ? "" : phase === "steps" ? t.stepAnnouncement(index + 1, TOTAL, step.title) : t.contextAnnouncement(step.title)
  const last = index === TOTAL - 1

  return (
    <section
      id={GUIDE_PANEL_ID}
      role="dialog"
      aria-modal="false"
      aria-labelledby={TITLE_ID}
      lang={lang}
      onKeyDown={onKeyDown}
      className={cn(
        "z-[45] flex flex-col bg-paper text-ink",
        ctx.wide
          ? cn("fixed bottom-4 max-h-[min(70vh,640px)] w-[360px] max-w-[calc(100vw-2rem)] rounded-md border shadow-[0_10px_30px_rgba(20,30,50,0.16)]", panelSide === "left" ? "left-4" : "right-4")
          : "relative max-h-[50vh] w-full shrink-0 border-t-2 border-t-cobalt/40 shadow-[0_-6px_18px_rgba(20,30,50,0.10)]",
        !reduced && "animate-in duration-200 fade-in-0 slide-in-from-bottom-2",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="grid size-5 place-items-center rounded-[3px] bg-[#0b0a08] p-0.5 text-[#fffefd]">
            <MiraMark size={13} />
          </div>
          <h2 id={TITLE_ID} ref={headingRef} tabIndex={-1} className={cn("panel-label rounded-sm text-cobalt!", lang === "hi" && HI_LABEL, FOCUS)}>
            {t.title}
          </h2>
        </div>
        <Button type="button" size="xs" variant="ghost" onClick={close}>
          {t.close}
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {phase === "intro" && <p className="text-[13px] leading-relaxed text-ink/85">{t.intro}</p>}

        <div role="group" aria-labelledby={LANG_ID} className="flex flex-wrap items-center gap-2">
          <span id={LANG_ID} className="text-[12px] font-medium text-ink/80">
            {t.language}
          </span>
          <div className="inline-flex rounded-md border bg-card p-0.5">
            {(["en", "hi"] as const).map((l) => (
              <button
                key={l}
                type="button"
                lang="en"
                aria-pressed={lang === l}
                onClick={() => changeLanguage(l)}
                className={cn("rounded-[4px] px-2.5 py-1 text-[12px] font-medium", FOCUS, lang === l ? "bg-cobalt text-paper" : "text-ink/80 hover:bg-muted")}
              >
                {l === "en" ? "English" : (
                  <>
                    Hindi (<span lang="hi">हिन्दी</span>)
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
        {lang === "hi" && <p className="text-[11.5px] leading-snug text-muted-foreground">{GUIDE_TEXT.hi.hindiScope}</p>}

        {phase === "intro" ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" onClick={() => begin("steps")}>
              {t.start}
            </Button>
            {hasScreenState(full) && (
              <Button type="button" size="sm" variant="outline" onClick={() => begin("context")}>
                {t.explainScreen}
              </Button>
            )}
          </div>
        ) : (
          step && (
            <article aria-labelledby={STEP_TITLE_ID} className="space-y-2.5 border-t pt-3">
              {phase === "steps" ? (
                <div className="space-y-1.5">
                  <p className={cn("text-[11px] text-muted-foreground", lang === "hi" ? "font-sans" : "font-mono")}>{t.progress(index + 1, TOTAL)}</p>
                  <div aria-hidden="true" className="flex gap-1">
                    {GUIDE_STEPS.map((_, i) => (
                      <span key={i} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-cobalt" : "bg-rule-line")} />
                    ))}
                  </div>
                </div>
              ) : (
                <p className={cn("panel-label", lang === "hi" && HI_LABEL)}>{t.currentScreen}</p>
              )}
              <h3 id={STEP_TITLE_ID} ref={stepHeadingRef} tabIndex={-1} className={cn("rounded-sm text-[15px] leading-snug font-semibold text-ink", FOCUS)}>
                {step.title}
              </h3>
              {step.paragraphs.map((p, i) => (
                <p key={i} className="text-[13px] leading-relaxed text-ink/90">
                  {p}
                </p>
              ))}
              {step.example && (
                <div className="rounded-sm border border-cobalt/30 bg-cobalt-soft/60 p-2.5">
                  <p className={cn("panel-label text-cobalt!", lang === "hi" && HI_LABEL)}>{t.tryThis}</p>
                  <p lang={/[ऀ-ॿ]/.test(step.example) ? "hi" : "en"} className="mt-1 text-[13px] leading-relaxed text-ink">
                    {step.example}
                  </p>
                </div>
              )}
            </article>
          )
        )}

        <div aria-live="polite">
          {audioNote && <p className="rounded-sm border border-review/50 bg-review-soft p-2.5 text-[12px] leading-snug text-ink/90">{audioNote}</p>}
        </div>
      </div>

      {phase !== "intro" && (
        <div className="space-y-2 border-t px-4 py-2.5">
          <PlaybackControls
            status={n.status}
            played={!!key && n.finishedKey === key}
            onPlay={play}
            onPause={n.pause}
            onResume={n.resume}
            onStop={stopVoice}
            labels={t.playback}
            unavailable={!canSpeak(lang)}
            size="xs"
          />
          <div className="flex items-center justify-between gap-2">
            {phase === "steps" ? (
              <>
                <Button type="button" size="sm" variant="outline" aria-disabled={index === 0 || undefined} onClick={() => go(-1)} className={DISABLED}>
                  {t.previous}
                </Button>
                <Button type="button" size="sm" aria-disabled={last || undefined} onClick={() => go(1)} className={cn(DISABLED, "aria-disabled:hover:bg-primary")}>
                  {t.next}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" className="ml-auto" onClick={() => begin("steps")}>
                {t.start}
              </Button>
            )}
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <p className="sr-only" aria-live="polite">
        {phase === "intro" ? "" : playbackStatusText(n.status, lang)}
      </p>

      {targets.length > 0 && <GuideHighlight targets={targets} reducedMotion={reduced} onBox={onBox} />}
    </section>
  )
}
