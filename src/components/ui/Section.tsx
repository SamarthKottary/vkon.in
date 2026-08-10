import type { ReactNode } from "react";
import { Container } from "./Container";

export function Section({
  children,
  className = "",
  id,
  tone = "surface",
  size = "default",
  bordered = true,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: "surface" | "subtle" | "dark";
  size?: "default" | "narrow" | "wide";
  /** Hairline rule at the top — the primary means of separating sections. */
  bordered?: boolean;
}) {
  const tones = {
    surface: "bg-surface",
    subtle: "bg-surface-subtle",
    dark: "bg-band text-band-body",
  };

  const border =
    bordered && tone !== "dark" ? "border-t border-line" : "";

  return (
    <section
      id={id}
      className={`py-16 sm:py-20 lg:py-24 ${tones[tone]} ${border} ${className}`}
    >
      <Container size={size}>{children}</Container>
    </section>
  );
}

/**
 * Section heading. Left-aligned always — centred body copy is one of the
 * strongest generic-template signals, and neither reference site uses it.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  tone = "light",
  className = "",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  const isDark = tone === "dark";

  return (
    <div className={`max-w-3xl ${className}`}>
      {eyebrow && (
        <p
          className={`label-tech mb-4 ${isDark ? "text-band-accent" : "text-accent"}`}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={`text-[1.75rem] leading-[1.15] sm:text-4xl ${isDark ? "text-band-ink" : ""}`}
      >
        {title}
      </h2>
      {description && (
        <p
          className={`mt-5 max-w-2xl text-[1.0625rem] leading-relaxed ${
            isDark ? "text-band-muted" : "text-body"
          }`}
        >
          {description}
        </p>
      )}
    </div>
  );
}
