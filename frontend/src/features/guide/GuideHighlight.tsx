import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { findGuideTarget, visibleBox, type HighlightBox } from "./target"

const sameBox = (a: HighlightBox | null, b: HighlightBox | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)

const raf = (cb: () => void) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(cb) : (setTimeout(cb, 16) as unknown as number))
const cancelRaf = (id: number) => (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id))

const OFFSET = 4

type Props = {
  /** data-guide names, best first; the first present and visible one is outlined. */
  targets: readonly string[]
  reducedMotion: boolean
  /** Reports the outlined region (or null) so the guide panel can stay clear of it. */
  onBox?: (box: HighlightBox | null) => void
}

/**
 * Outlines the region the guide is talking about. No backdrop and no pointer events, so the app
 * underneath stays fully usable. Follows the target through scrolling, resizing and re-renders
 * (rAF-throttled); draws nothing when the target is missing or not visible.
 */
export function GuideHighlight({ targets, reducedMotion, onBox }: Props) {
  const [box, setBox] = useState<HighlightBox | null>(null)
  const names = targets.join("|")

  useEffect(() => {
    const list = names ? names.split("|") : []
    let frame = 0
    let current: HTMLElement | null = null
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => schedule()) : null
    const measure = () => {
      frame = 0
      const el = findGuideTarget(list)
      if (el !== current) {
        if (current) ro?.unobserve(current)
        current = el
        if (el) {
          ro?.observe(el)
          // Bring a new target into view only when (almost) none of it is visible.
          const v = visibleBox(el)
          if (!v || v.height < Math.min(el.getBoundingClientRect().height, 48))
            el.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: reducedMotion ? "auto" : "smooth" })
        }
      }
      const next = el ? visibleBox(el) : null
      setBox((prev) => (sameBox(prev, next) ? prev : next))
    }
    function schedule() {
      if (!frame) frame = raf(measure)
    }
    schedule()
    window.addEventListener("resize", schedule)
    window.addEventListener("scroll", schedule, true)
    // Targets appear and disappear as results load, tabs switch and sections expand.
    const mo = typeof MutationObserver === "function" ? new MutationObserver(schedule) : null
    mo?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-state", "data-guide", "open"] })
    return () => {
      if (frame) cancelRaf(frame)
      window.removeEventListener("resize", schedule)
      window.removeEventListener("scroll", schedule, true)
      ro?.disconnect()
      mo?.disconnect()
    }
  }, [names, reducedMotion])

  useEffect(() => {
    onBox?.(box)
  }, [box, onBox])

  if (!box || typeof document === "undefined") return null
  const top = Math.max(box.top - OFFSET, 2)
  const left = Math.max(box.left - OFFSET, 2)
  const width = Math.min(box.left + box.width + OFFSET, window.innerWidth - 2) - left
  const height = Math.min(box.top + box.height + OFFSET, window.innerHeight - 2) - top
  return createPortal(
    <div
      aria-hidden="true"
      data-guide-highlight=""
      className={cn(
        "pointer-events-none fixed z-40 rounded-md border-2 border-cobalt shadow-[0_0_0_4px_color-mix(in_oklch,var(--cobalt)_14%,transparent),0_6px_20px_rgba(20,30,50,0.12)]",
        !reducedMotion && "transition-[top,left,width,height] duration-200 ease-out",
      )}
      style={{ top, left, width, height }}
    />,
    document.body,
  )
}
