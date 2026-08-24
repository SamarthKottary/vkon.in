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

/**
 * Opt-in hover fill — a `::before` layer that scales from nothing to full
 * width, left edge anchored, so it reads as sweeping in rather than fading
 * in (client, 2026-08-24: "animate like loading from left to right").
 *
 * `-z-10` on the pseudo-element, not `z-10` on the label, and `isolate` on
 * the button so that stacking is scoped here rather than competing with
 * z-index elsewhere on the page. The label and icon are ordinary, unpositioned
 * children — CSS already paints plain in-flow content above a negative-z-index
 * layer within the same stacking context, so nothing extra is needed to keep
 * the text readable through the sweep. Same reasoning as the scrim layers on
 * `product/ProductCard`'s featured orientation, which is where this project
 * first ran into the alternative (`z-10` on content) actually failing.
 *
 * `bg-accent`: the brand green, already themed correctly in both modes via
 * the `accent` token, rather than a colour invented for this one effect.
 *
 * **The transform is an arbitrary property, `[transform:scaleX(...)]`, not
 * the named `scale-x-0`/`scale-x-100` utilities.** Those do not exist in this
 * Tailwind version — v3 had per-axis `scale-x-*`/`scale-y-*` as named
 * utilities and v4 dropped them, confirmed by grepping the installed
 * package's own compiled source for `scale-x`, which returns nothing.
 * Written first with the named form: every class applied (`before:absolute`,
 * `before:content-['']`, `before:bg-accent` all rendered correctly, confirmed
 * in the DOM), only the transform silently did nothing — no error, just an
 * unstyled no-op, which is the dangerous failure mode a missing utility can
 * have. Arbitrary properties bypass Tailwind's utility-name lookup entirely,
 * so this does not depend on which named scale utilities a given version
 * happens to ship.
 */
const sweepClasses =
  "relative isolate overflow-hidden before:absolute before:inset-0 before:-z-10 " +
  "before:origin-left before:[transform:scaleX(0)] before:bg-accent " +
  "before:transition-transform before:duration-700 before:ease-out before:content-[''] " +
  "hover:before:[transform:scaleX(1)] focus-visible:before:[transform:scaleX(1)]";

type BaseProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  /** Adds the left-to-right hover fill described above. Opt-in — most
   *  buttons on the site do not carry it, so it stays off a shared
   *  component's default rather than becoming something every button does. */
  sweep?: boolean;
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
    sweep = false,
    children,
    ...rest
  } = props;

  const classes = `${shared} ${variants[variant]} ${sizes[size]} ${sweep ? sweepClasses : ""} ${className}`;

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
