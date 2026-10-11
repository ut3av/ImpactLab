import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "@/hooks/useReducedMotion"

export function ArchitecturalCursor() {
  const reduced = useReducedMotion()
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)

  const [visible, setVisible] = useState(false)
  const [hoverState, setHoverState] = useState<string | null>(null)
  const [isDown, setIsDown] = useState(false)
  const [isFinePointer, setIsFinePointer] = useState(false)

  const mousePos = useRef({ x: -100, y: -100 })
  const ringPos = useRef({ x: -100, y: -100 })
  const animFrame = useRef<number | null>(null)

  useEffect(() => {
    // Only show custom cursor on desktop devices with fine pointer
    const checkFine = () => {
      setIsFinePointer(window.matchMedia("(pointer: fine)").matches)
    }
    checkFine()
    const mq = window.matchMedia("(pointer: fine)")
    mq.addEventListener?.("change", checkFine)
    return () => mq.removeEventListener?.("change", checkFine)
  }, [])

  useEffect(() => {
    if (!isFinePointer || reduced) return

    const onMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY }
      if (!visible) setVisible(true)

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX - 6}px, ${e.clientY - 6}px, 0)`
      }

      // Check for interactive targets
      const target = e.target as HTMLElement | null
      const cursorTarget = target?.closest("[data-cursor]") as HTMLElement | null
      if (cursorTarget) {
        const val = cursorTarget.getAttribute("data-cursor") || "inspect"
        setHoverState(val)
      } else {
        const isClickable = target?.closest("button, a, input, select, textarea, [role='button'], [role='tab']")
        if (isClickable) {
          setHoverState("hover")
        } else {
          setHoverState(null)
        }
      }
    }

    const onMouseDown = () => setIsDown(true)
    const onMouseUp = () => setIsDown(false)
    const onMouseLeave = () => setVisible(false)
    const onMouseEnter = () => setVisible(true)

    window.addEventListener("mousemove", onMouseMove, { passive: true })
    window.addEventListener("mousedown", onMouseDown)
    window.addEventListener("mouseup", onMouseUp)
    document.addEventListener("mouseleave", onMouseLeave)
    document.addEventListener("mouseenter", onMouseEnter)

    // Smooth lerp loop for the 36px outer ring
    const loop = () => {
      const targetX = mousePos.current.x
      const targetY = mousePos.current.y

      // Lerp coefficient for smooth trailing ring
      const factor = 0.18
      ringPos.current.x += (targetX - ringPos.current.x) * factor
      ringPos.current.y += (targetY - ringPos.current.y) * factor

      if (ringRef.current) {
        const offset = hoverState && hoverState !== "hover" ? 28 : hoverState === "hover" ? 22 : 18
        ringRef.current.style.transform = `translate3d(${ringPos.current.x - offset}px, ${ringPos.current.y - offset}px, 0)`
      }

      animFrame.current = requestAnimationFrame(loop)
    }

    animFrame.current = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("mouseup", onMouseUp)
      document.removeEventListener("mouseleave", onMouseLeave)
      document.removeEventListener("mouseenter", onMouseEnter)
      if (animFrame.current) cancelAnimationFrame(animFrame.current)
    }
  }, [isFinePointer, reduced, visible, hoverState])

  if (!isFinePointer || reduced) return null

  const getLabel = () => {
    if (!hoverState || hoverState === "hover") return null
    if (hoverState === "inspect") return "Inspect"
    if (hoverState === "enter") return "Enter"
    if (hoverState === "select") return "Select"
    return hoverState
  }

  const labelText = getLabel()

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-[9999] transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden="true"
    >
      {/* 12px Central Dot */}
      <div
        ref={dotRef}
        className={`fixed top-0 left-0 size-3 rounded-full will-change-transform transition-colors duration-200 ${
          hoverState
            ? "bg-cobalt shadow-[0_0_12px_rgba(59,130,246,0.8)]"
            : "bg-[#f5f4f0] shadow-[0_0_8px_rgba(255,255,255,0.4)]"
        }`}
      />

      {/* 36px Orbiting Translucent Ring */}
      <div
        ref={ringRef}
        className={`fixed top-0 left-0 rounded-full border border-white/30 backdrop-blur-[1px] will-change-transform transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          labelText
            ? "size-14 border-cobalt/80 bg-cobalt/10 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
            : hoverState === "hover"
            ? "size-11 border-white/60 bg-white/5"
            : isDown
            ? "size-7 border-cobalt/90 bg-cobalt/20"
            : "size-9 border-white/30 bg-transparent"
        }`}
      >
        {labelText && (
          <span
            ref={labelRef}
            className="absolute top-1/2 left-full ml-2 -translate-y-1/2 rounded-full border border-cobalt/40 bg-[#090807]/90 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-cobalt uppercase whitespace-nowrap shadow-lg backdrop-blur-sm"
          >
            {labelText}
          </span>
        )}
      </div>
    </div>
  )
}
