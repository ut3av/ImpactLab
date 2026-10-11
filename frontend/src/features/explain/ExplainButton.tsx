import type { Ref } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const ARIA_DISABLED = "aria-disabled:pointer-events-auto aria-disabled:cursor-not-allowed aria-disabled:opacity-55 aria-disabled:active:translate-y-0"

type Props = {
  /** Visible text. */
  label: string
  /** Distinct accessible name when several triggers share the same visible text. */
  ariaLabel?: string
  /** A request from this trigger is in flight: shows "Explaining…" and ignores clicks. */
  busy?: boolean
  /** Nothing to explain yet. Marked aria-disabled (not disabled) so it stays focusable and discoverable. */
  unavailable?: boolean
  onClick?: () => void
  tone?: "primary" | "secondary" | "quiet"
  describedBy?: string
  ref?: Ref<HTMLButtonElement>
  className?: string
}

/** Text-only entry point for Explain with AI. Busy/unavailable never use `disabled`, so keyboard focus is never lost. */
export function ExplainButton({ label, ariaLabel, busy = false, unavailable = false, onClick, tone = "primary", describedBy, ref, className }: Props) {
  const inert = busy || unavailable
  return (
    <Button
      ref={ref}
      type="button"
      size={tone === "quiet" ? "xs" : "sm"}
      variant={tone === "primary" ? "default" : tone === "secondary" ? "outline" : "ghost"}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      aria-disabled={inert || undefined}
      aria-describedby={describedBy}
      onClick={() => {
        if (!inert) onClick?.()
      }}
      className={cn(ARIA_DISABLED, tone === "quiet" && "px-1.5 text-cobalt hover:text-cobalt", className)}
    >
      {busy ? "Explaining…" : label}
    </Button>
  )
}
