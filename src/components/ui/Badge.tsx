import type { ReactNode } from "react";

/**
 * Square technical tag, not a pill.
 *
 * Used sparingly — category on a product card, status in the admin. If a page
 * has more than a couple of these it has stopped being a catalogue and started
 * being a dashboard.
 */
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "warn" | "onDark";
  className?: string;
}) {
  const tones = {
    neutral: "border-line-strong text-body bg-surface",
    brand: "border-accent text-accent bg-accent-soft",
    // signal-700, not signal-500: amber needs to darken to clear AA on white.
    warn: "border-signal-500 text-signal-700 bg-surface",
    onDark: "border-band-line text-band-body bg-white/5",
  };

  return (
    <span
      className={`label-tech inline-flex items-center border px-2 py-1 ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
