import { cn } from "@/lib/utils"

type MiraMarkProps = {
  className?: string
  size?: number | string
  variant?: "svg" | "raster"
  transparent?: boolean
}

/**
 * Official MIRA Geometric Emblem
 * Represents Municipal Intelligence for Rules & Architecture.
 */
export function MiraMark({
  className,
  size = 28,
  variant = "svg",
  transparent = false,
}: MiraMarkProps) {
  if (variant === "raster") {
    return (
      <img
        src={transparent ? "/mira-mark-transparent.png" : "/mira-mark.png"}
        alt="MIRA Logo"
        width={typeof size === "number" ? size : undefined}
        height={typeof size === "number" ? size : undefined}
        className={cn("shrink-0 object-contain rounded-[4px]", className)}
      />
    )
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 257 250"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path d="M 116 131 L 116 197 L 117 203 L 123 218 L 135 232 L 146 240 L 156 245 L 170 249 L 256 249 L 256 201 L 252 191 L 242 180 L 190 131 Z" />
      <path d="M 256 0 L 199 0 L 178 4 L 163 10 L 144 22 L 129 36 L 110 60 L 95 83 L 94 0 L 76 0 L 65 2 L 53 6 L 41 12 L 31 19 L 17 33 L 12 40 L 5 54 L 1 68 L 0 77 L 0 249 L 94 249 L 95 109 L 256 109 Z" />
    </svg>
  )
}

type MiraLogoProps = {
  className?: string
  size?: "sm" | "md" | "lg"
  showTagline?: boolean
}

/**
 * Full MIRA Brand Header Block
 */
export function MiraLogo({
  className,
  size = "md",
  showTagline = true,
}: MiraLogoProps) {
  const markSize = size === "sm" ? 22 : size === "md" ? 28 : 36
  const textClasses =
    size === "sm"
      ? "text-[14px]"
      : size === "md"
        ? "text-[16px]"
        : "text-[20px]"
  const subClasses =
    size === "sm"
      ? "text-[10px]"
      : size === "md"
        ? "text-[11px]"
        : "text-[12px]"

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <div className="grid place-items-center rounded-[4px] bg-[#0b0a08] p-1.5 text-[#fffefd] shadow-xs">
        <MiraMark size={markSize} />
      </div>
      <div className="leading-tight">
        <div className={cn("font-semibold tracking-wider uppercase", textClasses)}>
          MIRA
        </div>
        {showTagline && (
          <div className={cn("text-muted-foreground", subClasses)}>
            See the Rules. Understand the Structure.
          </div>
        )}
      </div>
    </div>
  )
}
