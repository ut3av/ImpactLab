import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("min-width: 1024px") ? (window as unknown as { __wide?: boolean }).__wide ?? true : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
// jsdom lacks these; Radix Select uses them.
Element.prototype.scrollIntoView ||= function () {}
Element.prototype.hasPointerCapture ||= () => false
Element.prototype.releasePointerCapture ||= () => {}
window.ResizeObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
