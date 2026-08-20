"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, PlayIcon } from "@/components/icons/ui";
import { PanelPlaceholder } from "./PanelPlaceholder";
import { categoryLabel } from "@/content/taxonomy";
import type { Product } from "@/lib/types";

/**
 * Catalogue card.
 *
 * A bordered rectangle, no radius beyond 2px, no shadow. Hover darkens the
 * border rather than lifting the card.
 *
 * **Photography for this site is shot 1:1, and every plate that displays it
 * is 1:1** (client decision, 2026-08-19) — this card, the product detail
 * image and its thumbnails. Source and plate share a ratio, so `object-cover`
 * fills edge to edge and crops *nothing*, anywhere. That guarantee is the
 * whole point of the rule: give any of these plates a different aspect and it
 * silently starts cutting panels, which is invisible in review on drawn
 * placeholders and obvious on real photography.
 *
 * Both orientations therefore carry a **square** plate: the vertical card as
 * a full-width `aspect-square` band above its text, the horizontal strip as a
 * floated fixed square with the text wrapping round it. The strip's plate was
 * a `w-24` portrait sliver until 2026-08-19, which cropped ~35% off each side
 * of a 1:1 photograph.
 *
 * `bg-surface-subtle` backs the plate, for the placeholder case and while an
 * image is loading.
 */
export function ProductCard({
  product,
  priority = false,
  headingLevel = "h3",
  orientation = "vertical",
}: {
  product: Product;
  priority?: boolean;
  /** Set by the caller so the document keeps a single unbroken heading order. */
  headingLevel?: "h3" | "h4";
  /**
   * "vertical" — image above content, for the scrolling catalogue tracks.
   * "horizontal" — a compact strip, image left and content right, used on the
   * home page where several fit in a grid without dominating the section.
   */
  orientation?: "vertical" | "horizontal";
}) {
  const image = product.images[0];
  const Heading = headingLevel;

  if (orientation === "horizontal") {
    return <HorizontalCard product={product} priority={priority} Heading={Heading} />;
  }

  return (
    <article className="group relative flex h-full flex-col border border-line bg-surface-raised shadow-card transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover">
      <div className="relative aspect-square overflow-hidden border-b border-line bg-surface-subtle">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt || product.name}
            fill
            sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 92vw"
            priority={priority}
            /* `object-cover` with no padding, on a plate whose ratio matches
               the 1:1 photography spec — so this fills edge to edge and crops
               nothing. The pairing is the point: `aspect-square` above and
               this class are a matched set, and changing either alone starts
               cutting panels. See the note on the component. */
            className="object-cover transition-transform duration-300 ease-out md:group-hover:scale-[1.06]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <PanelPlaceholder className="h-20 w-20" />
          </div>
        )}

        {product.videoUrl && (
          <span
            className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center bg-action text-action-ink"
            title="Includes a video"
          >
            <PlayIcon className="h-3.5 w-3.5" />
            <span className="sr-only">Includes a video</span>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="label-tech text-muted">
          {categoryLabel(product.category)}
        </p>

        <Heading className="mt-2.5 text-lg leading-snug">
          {/* Stretched link — whole card is the target, one tab stop. */}
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0">
            {product.name}
          </Link>
        </Heading>

        {product.tagline && (
          <p className="mt-2 text-sm leading-relaxed text-muted">{product.tagline}</p>
        )}

        {product.hpRanges.length > 0 && (
          <dl className="mt-4 flex gap-2 text-sm">
            <dt className="label-tech pt-1 text-muted">Range</dt>
            <dd className="font-mono text-[0.8125rem] text-ink">
              {product.hpRanges.join(" · ")}
            </dd>
          </dl>
        )}

        <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-medium text-ink transition-colors group-hover:text-accent">
          View details
          <ArrowRightIcon className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" />
        </span>
      </div>
    </article>
  );
}

/**
 * Compact strip: square image on the left, text on the right.
 *
 * The image is a **floated fixed square** and the text wraps around it in an
 * L. Reading order is deliberate (client, 2026-08-20):
 *
 *   ┌────────┐  Sub-category
 *   │ image  │  · Type · Rating ·
 *   └────────┘  · Supply ·
 *
 *   Name
 *   Description
 *
 * The sub-category and specs sit beside the image; `clear-left` on the name
 * drops it and the description below the float so both get the card's full
 * width however long they run. That is what keeps a long product name legible
 * in a ~320px card on a phone — the two-flex-column build this replaced gave
 * the square plate a width equal to the card's height and crushed every line
 * into what was left.
 *
 * **Every spec row is rendered, and each wraps as a unit.** The spec list is
 * a wrapping flex row of `whitespace-nowrap` items, so a value never breaks
 * across lines mid-phrase — it moves to the next line whole. The block is
 * then capped to the image's height and clips, so it fills exactly the room
 * the card has at that breakpoint and never runs past the picture; an "etc"
 * marker appears over the last line when anything was cut. The full list
 * stays in the DOM, so the clip is visual only.
 *
 * That capping is why this is a client component: how much fits is a layout
 * question, and the only honest answer comes from measuring after layout.
 *
 * Fixed square rather than derived from the card height, so every card in a
 * row gets the same image size no matter how long its text runs.
 */
function HorizontalCard({
  product,
  priority,
  Heading,
}: {
  product: Product;
  priority: boolean;
  Heading: "h3" | "h4";
}) {
  const image = product.images[0];

  /* Every row of the detail page's spec table, values only — the labels
     ("Type", "Motor range", "Supply") are what a table column is for and
     would double the length here for no gain. Uncapped: a product with eight
     spec rows shows all eight. Falls back to ratings for any product with no
     spec rows at all. */
  const specs =
    product.spec.length > 0
      ? product.spec.map((row) => row.value)
      : product.hpRanges;

  /* **Every spec is rendered; CSS decides how many are seen.** The block is
     capped to the image's height and clips, so it fills whatever room the
     card actually has at that breakpoint — four lines on a wide card, three
     on a phone — instead of stopping at a fixed count. A character budget
     was tried first and had to be tuned to the narrowest card, which left
     obvious empty space on every wider one.

     All this measures is *whether* the list overflows, so the "etc" marker
     can be shown. That is one boolean and it never changes the content, so
     there is no feedback loop between measuring and what is measured. */
  const specRef = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const el = specRef.current;
    if (!el) return;
    /* Fires once on observe, so no priming call — which would also be
       setting state synchronously in an effect body. */
    const observer = new ResizeObserver(() =>
      setClipped(el.scrollHeight > el.clientHeight + 1),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [specs.length]);

  return (
    <article className="group relative h-full overflow-hidden border border-line bg-surface-raised p-4 pb-9 shadow-card transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover">
      {/* Floated, not a flex column. The text runs alongside the image and
          then continues *underneath* it, wrapping round in an L — which is
          what keeps a long product name readable in a ~320px card on a
          phone. The previous build put the image in a full-height flex
          column, so its square plate was as wide as the card was tall and
          squeezed every line of text into the remaining sliver.

          Fixed square rather than height-derived: the size is then the same
          on every card regardless of how long its text runs, so the images
          line up down a row. */}
      <div className="relative float-left mr-4 h-24 w-24 overflow-hidden border border-line bg-surface-subtle sm:h-28 sm:w-28">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt || product.name}
            fill
            sizes="7rem"
            priority={priority}
            className="object-cover transition-transform duration-300 ease-out md:group-hover:scale-[1.06]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <PanelPlaceholder className="h-10 w-10" />
          </div>
        )}

        {product.videoUrl && (
          <span
            className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center bg-action text-action-ink"
            title="Includes a video"
          >
            <PlayIcon className="h-2.5 w-2.5" />
            <span className="sr-only">Includes a video</span>
          </span>
        )}
      </div>

      {/* Beside the image: sub-category, then the specification line. */}
      <p className="label-tech text-muted">{categoryLabel(product.category)}</p>

      {/* Wrapping flex rather than one joined string, so each spec is an
          atomic unit: `whitespace-nowrap` stops a value breaking across lines
          mid-phrase, and flex wrapping moves the whole value to the next line
          the moment it no longer fits.

          Target, with a dot after every spec *and* opening every line:

              · spec1 · spec2 ·
              · spec3 ·

          Note what that asks for: mid-line, one dot sits between two specs,
          but at a wrap the dot appears twice — closing the line above and
          opening the line below. CSS has no "first on this line" selector, so
          it cannot be written as a rule.

          The way it is built: **every spec carries both a leading and a
          trailing dot**, each in a fixed-width centred box, and the leading
          dot is pulled back by exactly that width (`-ml-4` against the box's
          `w-4`). Mid-line it therefore lands precisely on the previous spec's
          trailing dot — two identical glyphs in identical boxes, superimposed,
          reading as the single dot the design wants. When a spec wraps, the
          pull-back has nothing to sit on and the dot falls at the line's
          start, which is where the container's matching `pl-4` reserves room
          for it.

          `gap-x-0` is load-bearing: any gap would break the superimposition
          and show the pair as two dots. The dot boxes supply the spacing
          instead. Each spec keeps its dots inside its own nowrap span, so the
          whole unit still wraps together and a dot is never orphaned. */}
      {/* Height is **fixed**, not a maximum: exactly three lines beside the
          96px image on a phone, four beside the 112px one from `sm`. Fixing
          it is what keeps the "etc" marker on the last line in every card
          rather than wherever that card's content happened to end, so the
          markers align across a row. It costs no space — the float already
          reserves the image's full height beside it, so a short spec list
          leaves that area blank either way.

          `leading-5` rather than `leading-relaxed` so the arithmetic is
          exact: 20px lines against a 3.75rem / 5rem box is precisely 3 and 4
          lines. At 1.625 the lines were 19.5px, so the box ran 2px past the
          last line and the marker sat just below the text it aligns with. */}
      {specs.length > 0 && (
        <div className="relative mt-1.5">
          <p
            ref={specRef}
            className="flex h-[3.75rem] flex-wrap items-baseline gap-x-0 overflow-hidden pl-4 font-mono text-[0.75rem] leading-5 text-ink sm:h-[5rem]"
          >
            {specs.map((value, index) => (
              <span key={`${value}-${index}`} className="whitespace-nowrap">
                <span
                  aria-hidden
                  className="-ml-4 inline-block w-4 text-center text-muted"
                >
                  ·
                </span>
                {value}
                <span
                  aria-hidden
                  className="inline-block w-4 text-center text-muted"
                >
                  ·
                </span>
              </span>
            ))}
          </p>

          {/* Sits over the end of the last visible line, carrying the card's
              own background so it masks whatever it covers. `aria-hidden`
              because it is a visual affordance only — the specs it stands in
              for are still in the DOM above, so a screen reader gets the
              whole list rather than a truncated one. */}
          {clipped && (
            <span
              aria-hidden
              className="absolute bottom-0 right-0 bg-surface-raised pl-2 font-mono text-[0.75rem] leading-5 text-muted"
            >
              {/* Bracketed the same way a spec is, and with the same
                  fixed-width dot boxes, so it sits in the rhythm of the list
                  rather than reading as a different kind of thing. */}
              <span className="inline-block w-4 text-center">·</span>
              etc
              <span className="inline-block w-4 text-center">·</span>
            </span>
          )}
        </div>
      )}

      {/* `clear-left` is what turns this into an L: the name drops below the
          floated image instead of continuing beside it, so it and the
          description get the card's full width however long they run. */}
      <Heading className="clear-left pt-3 text-[0.9375rem] leading-snug">
        <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0">
          {product.name}
        </Link>
      </Heading>

      {product.tagline && (
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
          {product.tagline}
        </p>
      )}

      {/* `pb-9` on the card reserves the strip this sits in, so a tagline
          running to three lines cannot collide with it. */}
      <ArrowRightIcon className="absolute bottom-3.5 right-4 h-4 w-4 text-muted transition-transform duration-150 group-hover:translate-x-1 group-hover:text-accent" />
    </article>
  );
}
