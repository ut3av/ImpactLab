import { Button } from "@/components/ui/button"
import type { SpeechStatus } from "@/lib/speech/engine"
import { cn } from "@/lib/utils"

export type PlaybackLabels = {
  group: string
  play: string
  pause: string
  resume: string
  stop: string
  replay: string
}

type Props = {
  status: SpeechStatus
  /** The current content has already been played (idle then offers Replay instead of Play). */
  played: boolean
  /** Start the current content from the beginning (used by Play and Replay). */
  onPlay: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  labels: PlaybackLabels
  /** Audio cannot play at all (no speech support, no voice); controls are shown as unavailable. */
  unavailable?: boolean
  size?: "xs" | "sm"
  className?: string
}

const DISABLED = "aria-disabled:pointer-events-auto aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:bg-transparent"

/**
 * Text-only playback controls. Positions stay fixed (main action, Replay, Stop) so keyboard focus
 * never jumps when the state changes; unavailable actions are marked aria-disabled instead of
 * disappearing from under the focus.
 */
export function PlaybackControls({ status, played, onPlay, onPause, onResume, onStop, labels, unavailable, size = "sm", className }: Props) {
  const active = status !== "idle"
  const main =
    status === "speaking"
      ? { label: labels.pause, run: onPause }
      : status === "paused"
        ? { label: labels.resume, run: onResume }
        : { label: played ? labels.replay : labels.play, run: onPlay }
  const guard = (enabled: boolean, run: () => void) => () => {
    if (enabled) run()
  }
  return (
    <div role="group" aria-label={labels.group} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Button
        type="button"
        size={size}
        variant={active ? "secondary" : "outline"}
        aria-disabled={unavailable || undefined}
        onClick={guard(!unavailable, main.run)}
        className={cn("min-w-[6.5rem]", DISABLED)}
      >
        {main.label}
      </Button>
      {active && (
        <Button type="button" size={size} variant="ghost" onClick={onPlay} className={DISABLED}>
          {labels.replay}
        </Button>
      )}
      <Button
        type="button"
        size={size}
        variant="ghost"
        aria-disabled={!active || undefined}
        onClick={guard(active, onStop)}
        className={DISABLED}
      >
        {labels.stop}
      </Button>
    </div>
  )
}
