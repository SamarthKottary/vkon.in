import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * Rectangular, flat, 2px corners. No pills, no shadows.
 *
 * `primary` is near-black rather than green on purpose — see rule 3 in
 * globals.css. Green is for links and active state, not for every button on the
 * page. Use the `.link-cta` class for quieter, inline calls to action.
 */

type Variant = "primary" | "outline" | "ghost" | "accent" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-action text-action-ink hover:bg-action-hover",
  outline:
    "border border-line-strong bg-surface text-ink hover:border-ink hover:bg-surface-subtle",
  ghost: "text-ink hover:bg-surface-subtle",
  accent: "bg-accent text-surface hover:bg-accent-strong hover:text-ink",
  danger: "border border-red-300 bg-surface text-red-700 hover:bg-red-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.8125rem] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[0.9375rem] gap-2.5",
};

const shared =
  "inline-flex items-center justify-center rounded-sm font-medium whitespace-nowrap " +
  "transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none";

type BaseProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = BaseProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof BaseProps> & { href?: never };

type ButtonAsLink = BaseProps &
  Omit<ComponentPropsWithoutRef<"a">, keyof BaseProps> & { href: string };

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const {
    variant = "primary",
    size = "md",
    className = "",
    children,
    ...rest
  } = props;

  const classes = `${shared} ${variants[variant]} ${sizes[size]} ${className}`;

  if ("href" in rest && typeof rest.href === "string") {
    const { href, ...anchorProps } = rest;
    const isRouted = href.startsWith("/") && !href.startsWith("//");

    if (!isRouted) {
      return (
        <a href={href} className={classes} {...anchorProps}>
          {children}
        </a>
      );
    }

    return (
      <Link href={href} className={classes} {...anchorProps}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(rest as ComponentPropsWithoutRef<"button">)}>
      {children}
    </button>
  );
}
