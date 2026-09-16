import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/Container";

/** The particle-mesh artwork behind every section masthead, so the five pages
 *  that use it cannot drift onto different files. Resized from the supplied
 *  7801px original to 2400px, which is what the other backgrounds in `public/`
 *  run at — the original is 5MB and this site is built for rural phones. */
export const SECTION_BACKGROUND = "/section-background-halftone.jpg";

/**
 * Masthead for inner pages. Light, ruled, left-aligned — no dark band.
 *
 * `compact` is for pages whose masthead is a label on the way to something
 * else rather than the thing itself. The catalogue is the case it was added
 * for: a full-height masthead pushed the first row of products most of a
 * screen down, so the page opened on prose about products instead of on
 * products. `/protection`, where the masthead *is* the introduction, keeps the
 * roomy one.
 *
 * **`background` turns it into a dark band** (client, 2026-09-16), which is the
 * same treatment `/about` and `/contact` already give their own mastheads:
 * photograph, scrim, rule grid, band tokens for the type. It is the one
 * component so the five pages that now use it cannot drift apart, and so the
 * scrim recipe that makes the text readable lives in a single place.
 *
 * **The scrim is not decoration.** The artwork is dark but not uniformly so —
 * the particle mesh has bright nodes — and white text laid straight on it
 * fails contrast wherever one lands behind a letter. The flat wash sets a
 * floor, and the left-to-right gradient deepens it under the words, which sit
 * left.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  breadcrumb,
  compact = false,
  background,
  priority = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumb?: { label: string; href: string }[];
  compact?: boolean;
  /** A path under `public/`. Absent leaves the original light masthead. */
  background?: string;
  /** Set on a masthead that is the largest thing above the fold, so it is not
   *  lazy-loaded into a visible pop. Off elsewhere, since every one of these
   *  would otherwise compete with the page's real content for bandwidth on a
   *  rural connection. */
  priority?: boolean;
}) {
  const dark = Boolean(background);

  return (
    <section
      className={
        dark
          ? "relative isolate overflow-hidden border-b border-band-line bg-band"
          : "border-b border-line"
      }
    >
      {background && (
        <>
          <div className="absolute inset-0 -z-10">
            <Image
              src={background}
              alt=""
              fill
              sizes="100vw"
              priority={priority}
              className="object-cover"
            />
          </div>
          {/* Flat wash first, then a gradient that deepens toward the left
              where the type sits — the same order `/about` uses. */}
          <div aria-hidden className="absolute inset-0 -z-10 bg-scrim/55" />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-r from-scrim/85 via-scrim/60 to-scrim/25"
          />
          <div aria-hidden className="rule-grid absolute inset-0 -z-10 opacity-25" />
        </>
      )}

      <Container size="wide">
        {/* **A floor, and the text centred inside it.** Without one the band is
            only as tall as its own words, so checkout — whose description runs
            to a second line — stood 26px taller than cart and 52px taller than
            the account pages on a phone, and the set looked misaligned when
            moving between them (client, 2026-09-16). The floor is the tallest
            of them, so nothing is squeezed, and `justify-center` keeps a short
            title from sitting against the top edge of the extra room. */}
        <div
          className={`${background ? "flex min-h-[13rem] flex-col justify-center " : ""}${
            compact ? "py-7 sm:py-9" : "py-12 sm:py-16 lg:py-20"
          }`}
        >
          {breadcrumb && breadcrumb.length > 0 && (
            <nav aria-label="Breadcrumb" className="mb-8">
              <ol
                className={`label-tech flex flex-wrap items-center gap-2 ${
                  dark ? "text-band-muted" : "text-muted"
                }`}
              >
                {breadcrumb.map((crumb, index) => (
                  <li key={crumb.href} className="flex items-center gap-2">
                    {index > 0 && <span aria-hidden>/</span>}
                    <Link href={crumb.href} className={dark ? "hover:text-band-ink" : "hover:text-ink"}>
                      {crumb.label}
                    </Link>
                  </li>
                ))}
                {/* The page itself closes the trail. Taken from `title` rather
                    than passed again, so the two cannot disagree. */}
                <li className="flex items-center gap-2">
                  <span aria-hidden>/</span>
                  <span aria-current="page" className={dark ? "text-band-ink" : "text-ink"}>
                    {title}
                  </span>
                </li>
              </ol>
            </nav>
          )}

          {eyebrow && (
            <p className={`label-tech ${dark ? "text-band-accent-strong" : "text-accent"}`}>
              {eyebrow}
            </p>
          )}

          <h1
            className={`${dark ? "text-band-ink " : ""}${
              compact
                ? "mt-2 max-w-3xl text-[1.75rem] leading-tight sm:text-[2.25rem]"
                : "mt-4 max-w-3xl text-[2.25rem] leading-[1.08] sm:text-5xl lg:text-[3.5rem]"
            }`}
          >
            {title}
          </h1>

          {description && (
            <p
              className={`${dark ? "text-band-body " : "text-body "}${
                compact
                  ? "mt-2.5 max-w-2xl leading-relaxed"
                  : "mt-6 max-w-2xl text-lg leading-relaxed"
              }`}
            >
              {description}
            </p>
          )}
        </div>
      </Container>
    </section>
  );
}
