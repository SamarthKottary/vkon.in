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

  /* **Every spec is rendered; measurement decides how many are *shown*.**
     The block is a fixed height matching the image, so it fills whatever room
     the card has at that breakpoint rather than a fixed count. A server-side
     character budget was tried first and had to be tuned to the narrowest
     card, which left obvious empty space on every wider one.

     A spec is dropped only when it is not wholly visible: past the bottom of
     the box, or run off the right edge of the card. The second is the one that
     bites in practice — a value too long to wrap cannot move down a line, so
     it overhangs the side and is cut there. A value is never left half-shown,
     since that reads as a rendering fault rather than as truncation. One
     further spec is given up only where the marker would not otherwise fit on
     the line beside it.

     The marker lands on **that** line: it is positioned at the point the first
     dropped spec would have started, so it continues the list from where it
     stops rather than sitting apart from it.

     **Why this cannot oscillate**, which is the usual hazard with measure-then-
     hide: dropped specs stay in the DOM at `opacity-0`, so they keep occupying
     their space. Layout is therefore identical whatever the count, every pass
     measures the same geometry, and the result is idempotent. Opacity also
     keeps the full list in the accessibility tree, so a screen reader gets
     every spec while the eye gets the ones that fit. */
  const specRef = useRef<HTMLParagraphElement>(null);
  const etcRef = useRef<HTMLSpanElement>(null);
  const [shownSpecs, setShownSpecs] = useState(specs.length);
  const [markerAt, setMarkerAt] = useState<{ left: number; top: number } | null>(
    null,
  );

  useEffect(() => {
    const el = specRef.current;
    if (!el) return;

    const measure = () => {
      const items = Array.from(el.querySelectorAll<HTMLElement>("[data-spec]"));
      if (items.length === 0) return;

      /* Viewport rects, not `offsetLeft`/`offsetTop`. This block is
         `display: flex`, so it establishes a formatting context and refuses to
         overlap the float — the browser sets it *beside* the image instead.
         Its offset parent is the wrapper, so every item's `offsetLeft` carried
         that ~144px shift while `clientWidth` did not, and the comparison
         between them reported the very first spec as overflowing. Rects are in
         one coordinate space and cannot drift like that. */
      const box = el.getBoundingClientRect();
      if (box.width === 0) return;

      const anchor = el.parentElement?.getBoundingClientRect();
      const rects = items.map((item) => item.getBoundingClientRect());
      const lineHeight = rects[0].height;

      /* Everything wholly inside the box, which means clearing **both** edges:

           - past the bottom — it landed on a fifth line and is not shown;
           - past the right — a value too long to wrap cannot move to the next
             line (it is `whitespace-nowrap`), so it runs off the side of the
             card and is cut there instead. This is the case that shows up on
             the fourth line of a narrow card.

         The first item failing either ends the list; everything after it is
         further down or further out still. */
      let count = items.length;

      for (let index = 0; index < rects.length; index += 1) {
        const rect = rects[index];
        const pastBottom = rect.bottom > box.bottom + 1;
        const pastRight = rect.right > box.right + 1;

        if (pastBottom || pastRight) {
          count = index;
          break;
        }
      }

      /* Never hide everything. A value wider than the whole column fails the
         right-edge test wherever it is put, so if the first one is that wide
         the loop above stops at zero — and dropping it would take every spec
         after it too. One clipped spec beats an empty line. */
      count = Math.max(1, count);

      if (count === items.length) {
        setShownSpecs(count);
        setMarkerAt(null);
        return;
      }

      /* Give back specs one at a time until the marker fits on the line the
         list stops at. Only bites when that line is nearly full — usually
         nothing is given up. Always keeps one spec. */
      const etcWidth = etcRef.current?.offsetWidth ?? 0;
      while (count > 1) {
        const last = rects[count - 1];
        const onLastLine = last.bottom > box.bottom - lineHeight + 1;
        if (!onLastLine) break;
        if (last.right + etcWidth <= box.right + 1) break;
        count -= 1;
      }

      /* Back into the wrapper's coordinates, which is what the absolutely
         positioned marker is placed against. */
      const last = rects[count - 1];
      setShownSpecs(count);
      setMarkerAt(
        anchor && last
          ? { left: last.right - anchor.left, top: last.top - anchor.top }
          : { left: 0, top: 0 },
      );
    };

    /* Fires once on observe, so no priming call — which would also be
       setting state synchronously in an effect body. */
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    /* And again once the webfont has swapped in. This box is a fixed height
       and a full-width block, so its own dimensions never change once laid
       out and the observer will not fire a second time — a first measurement
       taken against fallback metrics would otherwise stick for good. Plex
       Mono is wider than most fallbacks, so that reads as "nothing fits" and
       collapses the list to a single spec. */
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
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
      {/* `h-28` at every width, not `h-24` on a phone: the spec block beside
          it is four lines tall throughout, and four 20px lines starting below
          the sub-category label need a 112px image to sit within. A 96px one
          left the last line overhanging the picture. */}
      <div className="relative float-left mr-4 h-28 w-28 overflow-hidden border border-line bg-surface-subtle">
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
      {/* Height is **fixed at four lines**, not a maximum, and the same at
          every width. Fixing it is what keeps the "etc" marker on the last
          line in every card rather than wherever that card's content happened
          to end, so the markers align across a row. It costs no space — the
          float already reserves the image's full height beside it, so a short
          spec list leaves that area blank either way.

          `leading-5` rather than `leading-relaxed` so the arithmetic is exact:
          20px lines against a 5rem box is precisely four. At 1.625 the lines
          were 19.5px, so the box ran 2px past the last line and the marker sat
          just below the text it aligns with. */}
      {specs.length > 0 && (
        <div className="relative mt-1.5">
          <p
            ref={specRef}
            className="flex h-[5rem] flex-wrap items-baseline gap-x-0 overflow-hidden pl-4 font-mono text-[0.75rem] leading-5 text-ink"
          >
            {specs.map((value, index) => (
              <span
                key={`${value}-${index}`}
                data-spec
                /* `opacity-0`, not `hidden`: a dropped spec must keep its
                   space or the measurement above would change every pass and
                   never settle. See the note on the effect. */
                className={`whitespace-nowrap ${
                  index < shownSpecs ? "" : "opacity-0"
                }`}
              >
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

          {/* Always mounted, so the effect can read its width on the very pass
              that decides whether to place it — `opacity-0` rather than
              conditional rendering. Absolute, so carrying it permanently costs
              no layout, and so it can be put exactly where the list stopped.
              `aria-hidden` because it is a visual affordance only: the specs
              it stands in for are still in the DOM above, so a screen reader
              gets the whole list. */}
          <span
            ref={etcRef}
            aria-hidden
            style={markerAt ?? undefined}
            className={`absolute whitespace-nowrap font-mono text-[0.75rem] leading-5 text-muted ${
              markerAt ? "" : "opacity-0"
            }`}
          >
            {/* Built exactly like a spec — same fixed-width dot boxes, same
                `-ml-4` on the leading one. Placed at the point the next spec
                would have started, that pull-back lands its dot on the last
                shown spec's trailing dot and the two superimpose, so the
                marker joins the list's rhythm instead of doubling a dot. */}
            <span className="-ml-4 inline-block w-4 text-center">·</span>
            etc
            <span className="inline-block w-4 text-center">·</span>
          </span>
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
