import Image from "next/image";

/**
 * Brand lockup, supplied as two artworks — dark ink for light surfaces, white
 * ink for dark ones — with their flat backgrounds keyed out to transparency.
 *
 * Which one shows depends on *the surface*, not only the theme:
 *
 *  - `tone="light"` means the mark sits on a permanently dark band (the
 *    footer). That band is dark in both themes, so it always takes the
 *    white-ink artwork and never swaps.
 *  - `tone="dark"` means an ordinary page surface, which flips with the theme.
 *    Both files are rendered and CSS picks one, because the theme lives in a
 *    `data-theme` attribute rather than a media query — the `dark:` variant
 *    reads that attribute, and it is already set before first paint by
 *    ThemeScript, so there is no flash of the wrong mark.
 *
 * The cost of the CSS swap is that a browser fetches both files on pages with
 * a theme-dependent logo. They are ~30 KB each before optimisation and next/image
 * serves far less, which is cheaper than the flash a JS swap would cause.
 */
const LIGHT_SURFACE = "/brand/vkon-logo-light.png";
const DARK_SURFACE = "/brand/vkon-logo-dark.png";

export function Logo({
  className = "",
  tone = "dark",
}: {
  className?: string;
  /** `light` = sitting on a permanently dark surface, e.g. the footer. */
  tone?: "dark" | "light";
}) {
  if (tone === "light") {
    return (
      <span className={`inline-flex shrink-0 items-center ${className}`}>
        <Image
          src={DARK_SURFACE}
          alt="Vkon Automation"
          width={640}
          height={262}
          priority
          className="h-9 w-auto"
        />
      </span>
    );
  }

  return (
    <span className={`inline-flex shrink-0 items-center ${className}`}>
      <Image
        src={LIGHT_SURFACE}
        alt="Vkon Automation"
        width={640}
        height={257}
        priority
        className="h-9 w-auto dark:hidden"
      />
      {/* Same alt as the light one, and deliberately NOT aria-hidden. Only one
          is ever displayed, and `display:none` takes the other out of the
          accessibility tree — so marking this one decorative left the header
          link with no accessible name at all in dark mode. */}
      <Image
        src={DARK_SURFACE}
        alt="Vkon Automation"
        width={640}
        height={262}
        priority
        className="hidden h-9 w-auto dark:block"
      />
    </span>
  );
}
