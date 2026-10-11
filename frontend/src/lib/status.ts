import type { Status } from "@/types/api"

export const STATUS_META: Record<Status, { label: string; hi: string; description: string; tone: "verified" | "cobalt" | "review" | "alert" | "neutral" }> = {
  VERIFIED: {
    label: "Verified",
    hi: "सत्यापित",
    description: "The applicable supplied rule and the inputs provided support this result.",
    tone: "verified",
  },
  CALCULATION_COMPLETED: {
    label: "Calculation completed",
    hi: "गणना पूर्ण",
    description: "Computed by deterministic code from identified inputs and a PDF-verified table.",
    tone: "cobalt",
  },
  SOURCE_FOUND: {
    label: "Source found",
    hi: "स्रोत मिला",
    description: "Relevant rule text was located. It has not been applied to this case — read the quoted passage.",
    tone: "neutral",
  },
  MORE_INFORMATION_NEEDED: {
    label: "More information needed",
    hi: "और जानकारी चाहिए",
    description: "The result cannot be determined until the listed inputs are provided.",
    tone: "review",
  },
  NOT_FOUND: {
    label: "Not found",
    hi: "नहीं मिला",
    description: "The supplied regulations do not establish an answer to this question.",
    tone: "alert",
  },
  VERSION_REVIEW_NEEDED: {
    label: "Version review needed",
    hi: "संस्करण जाँच आवश्यक",
    description: "A later amendment not included in the supplied rulebook may affect this answer.",
    tone: "review",
  },
  ILLUSTRATIVE_ONLY: {
    label: "Illustrative only",
    hi: "केवल उदाहरण",
    description: "Explanatory geometry, not a verified compliance result.",
    tone: "neutral",
  },
}

export const TONE_CLASSES = {
  verified: "border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-2xs backdrop-blur-xs",
  cobalt: "border-blue-500/40 bg-blue-500/15 text-blue-400 shadow-2xs backdrop-blur-xs",
  review: "border-[#d4af37]/60 bg-[#d4af37]/15 text-[#d4af37] shadow-2xs backdrop-blur-xs",
  alert: "border-rose-500/40 bg-rose-500/15 text-rose-400 shadow-2xs backdrop-blur-xs",
  neutral: "border-white/15 bg-white/10 text-white/90 shadow-2xs backdrop-blur-xs",
} as const

export function ruleRef(rule: string, sub?: string | null) {
  return `Rule ${rule}${sub ?? ""}`
}
