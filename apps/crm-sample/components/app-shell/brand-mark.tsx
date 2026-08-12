import { cn } from "@/lib/utils";

/** A wordless meridian: one ring, one crossing line. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-6 text-primary", className)}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.75"
        opacity="0.45"
      />
      <ellipse
        cx="12"
        cy="12"
        rx="4"
        ry="9"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M3 12h18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
