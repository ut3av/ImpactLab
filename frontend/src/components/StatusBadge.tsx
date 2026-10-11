import { AlertTriangle, CheckCircle2, CircleDashed, FileSearch, HelpCircle, History, Calculator } from "lucide-react"
import { STATUS_META, TONE_CLASSES } from "@/lib/status"
import { cn } from "@/lib/utils"
import type { Status } from "@/types/api"

const ICONS: Record<Status, typeof CheckCircle2> = {
  VERIFIED: CheckCircle2,
  CALCULATION_COMPLETED: Calculator,
  SOURCE_FOUND: FileSearch,
  MORE_INFORMATION_NEEDED: HelpCircle,
  NOT_FOUND: CircleDashed,
  VERSION_REVIEW_NEEDED: History,
  ILLUSTRATIVE_ONLY: AlertTriangle,
}

export function StatusBadge({ status, size = "sm", className }: { status: Status; size?: "sm" | "md"; className?: string }) {
  const meta = STATUS_META[status]
  const Icon = ICONS[status]
  return (
    <span
      title={meta.description}
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border font-mono font-medium tracking-wide uppercase",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]",
        TONE_CLASSES[meta.tone],
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden />
      {meta.label}
    </span>
  )
}
