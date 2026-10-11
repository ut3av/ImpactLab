/** DOM lookups for the Voice Guide highlight. Targets are marked with data-guide="…". */

export type HighlightBox = { top: number; left: number; width: number; height: number }

/** First target that is on the page and rendered (not in a hidden tab, not zero-size). */
export function findGuideTarget(names: readonly string[]): HTMLElement | null {
  for (const name of names) {
    const el = document.querySelector<HTMLElement>(`[data-guide="${name}"]`)
    if (!el || el.closest("[hidden]")) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/** The part of an element not clipped by scrolling ancestors or the window; null when none is visible. */
export function visibleBox(el: HTMLElement): HighlightBox | null {
  const r = el.getBoundingClientRect()
  let { top, left, right, bottom } = r
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p)
    if (s.overflowX === "visible" && s.overflowY === "visible") continue
    const c = p.getBoundingClientRect()
    top = Math.max(top, c.top)
    left = Math.max(left, c.left)
    right = Math.min(right, c.right)
    bottom = Math.min(bottom, c.bottom)
  }
  top = Math.max(top, 0)
  left = Math.max(left, 0)
  right = Math.min(right, window.innerWidth)
  bottom = Math.min(bottom, window.innerHeight)
  return right - left >= 1 && bottom - top >= 1 ? { top, left, width: right - left, height: bottom - top } : null
}

