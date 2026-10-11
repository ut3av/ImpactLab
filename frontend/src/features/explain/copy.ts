import type { InspectionRecord } from "@/lib/record"
import { EXPLAIN_SECTION_KEYS, type ExplainFocus, type ExplainResponse, type ExplainSection, type FocusElement, type Side, type UiLanguage } from "@/types/api"

/** Section headings in canonical order; the explanation language decides which is shown. */
export const SECTION_HEADINGS: Record<ExplainSection["key"], Record<UiLanguage, string>> = {
  meaning: { en: "Plain-language meaning", hi: "सरल भाषा में अर्थ" },
  why_it_applies: { en: "Why it applies to these inputs", hi: "यह इस मामले पर क्यों लागू होता है" },
  evidence: { en: "What the source establishes", hi: "स्रोत से क्या स्थापित होता है" },
  calculation: { en: "How the result was obtained", hi: "परिणाम कैसे निकाला गया" },
  building_impact: { en: "Effect on the proposed building", hi: "प्रस्तावित भवन पर प्रभाव" },
  uncertainty: { en: "What remains uncertain", hi: "क्या अभी अनिश्चित है" },
  next_step: { en: "What to verify next", hi: "आगे क्या जाँचें" },
}

/** Why a basic (non-AI) explanation was shown. Unknown server reasons fall back to "unavailable". */
export const FALLBACK_REASONS = {
  not_configured: "Live AI is not configured on this server.",
  ai_disabled: "AI was not used for this request.",
  not_found: "The supplied rules do not answer this question, so AI was not used.",
  rate_limited: "The AI service is busy (rate limit). Try again in a moment.",
  timeout: "The AI service took too long to respond.",
  network: "The AI service could not be reached.",
  auth: "The AI service rejected the server's credentials.",
  model_unavailable: "The configured AI model is not available.",
  invalid_response: "The AI response was malformed, so it was discarded.",
  rejected: "The AI response failed MIRA's evidence checks, so it was discarded.",
  unavailable: "The AI service is unavailable.",
} as const
export type FallbackReason = keyof typeof FALLBACK_REASONS

/** Reasons where a second attempt may succeed, so "Try again" is offered. */
const TRANSIENT = new Set<FallbackReason>(["rate_limited", "timeout", "network", "unavailable", "invalid_response", "rejected"])

export function fallbackReason(reason: string | null | undefined): FallbackReason {
  return reason && Object.hasOwn(FALLBACK_REASONS, reason) ? (reason as FallbackReason) : "unavailable"
}
export function isTransient(reason: FallbackReason): boolean {
  return TRANSIENT.has(reason)
}

export const HINDI_DISCLOSURE = "यह व्याख्या है, मूल नियम पाठ नहीं। उद्धृत नियम पाठ अंग्रेज़ी में है और उसका अनुवाद नहीं किया गया है।"
export const EXPLAIN_GUIDANCE = "Ask a question or evaluate a requirement first. Explain with AI then explains that result in plain language."
export const AI_NOT_CONFIGURED_NOTE = "Live AI is not configured on this server; a basic explanation from the verified data is shown."
export const EXPLAIN_FOOTER = "Informational explanation. Not an official approval or legal opinion; the responsible authority's interpretation governs."

/** Non-empty sections in canonical order (the first one per key wins). */
export function displayedSections(resp: Pick<ExplainResponse, "sections">): ExplainSection[] {
  return EXPLAIN_SECTION_KEYS.flatMap((key) => {
    const s = resp.sections.find((x) => x.key === key && x.text.trim())
    return s ? [{ key, text: s.text.trim() }] : []
  })
}

/** Server disclosures plus, for Hindi, the fixed note that quoted rule text stays untranslated English. */
export function disclosuresFor(resp: Pick<ExplainResponse, "disclosures" | "language">): string[] {
  const list = resp.disclosures.map((d) => d.trim()).filter(Boolean)
  if (resp.language === "hi" && !list.includes(HINDI_DISCLOSURE)) list.push(HINDI_DISCLOSURE)
  return [...new Set(list)]
}

function asSentence(text: string, lang: UiLanguage): string {
  const t = text.trim()
  return /[.!?।:;]$/.test(t) ? t : `${t}${lang === "hi" ? "।" : "."}`
}

/** Exactly what Read Aloud speaks: target label, summary, then each displayed section heading and text. Never the citations. */
export function narrationText(resp: Pick<ExplainResponse, "language" | "target" | "summary" | "sections">): string {
  const lang = resp.language
  const parts = [resp.target.label, resp.summary]
  for (const s of displayedSections(resp)) parts.push(SECTION_HEADINGS[s.key][lang], s.text)
  return parts
    .filter((p) => p.trim())
    .map((p) => asSentence(p, lang))
    .join(" ")
}

/** Short stable hash (FNV-1a, 32-bit) so the narration key changes whenever the narrated text does. */
export function hashText(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

const SIDE_NAMES: Record<Side, string> = { front: "Front", rear: "Rear", left: "Left side", right: "Right side" }
const ELEMENT_LABELS: Record<FocusElement, string> = { building: "Proposed building", plot: "Plot boundary", road: "Street facing the plot" }

/** What is being explained, shown while loading (the response then names its own target). */
export function pendingTargetLabel(record: InspectionRecord, focus: ExplainFocus | null): string {
  if (!focus) return "Current result"
  if ("element" in focus) return ELEMENT_LABELS[focus.element]
  const calc = record.calcs.find((c) => c.calc_type === focus.calc_type)
  if (focus.side) return calc?.zones.find((z) => z.side === focus.side)?.label ?? `${SIDE_NAMES[focus.side]} open space`
  return calc?.label ?? focus.calc_type.replace(/_/g, " ")
}
