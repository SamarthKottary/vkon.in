"use client";

import Image from "next/image";
import Link from "next/link";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
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
    <article className="group relative flex h-full flex-col border border-line bg-surface-raised shadow-card transition-[box-shadow,border-color,transform,translate] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover">
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

        {/* "View details" stays a `<span>`, not a second link: the card is
            already one stretched link and adding another would give it two tab
            stops for the same destination. The cart button beside it is the
            only real control here, which is why it — and it alone — carries
            `relative z-10` to sit above the stretched link's overlay. */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-6">
          <span className="flex items-center gap-2 text-sm font-medium text-ink transition-colors group-hover:text-accent">
            View details
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" />
          </span>
          <AddToCartButton slug={product.slug} name={product.name} size="compact" />
        </div>
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
 * **The spec block is five lines at every width** — a fixed height, so what
 * follows lines up across a row. Values wrap like ordinary text, so a long one
 * takes two of those lines rather than overhanging the card, and a line
 * carrying one spec is fine. Where the list runs past those five lines, the
 * mark sits **on the trailing dot of the last spec that fitted** — `· value···`
 * with no gap — by measuring that dot after layout. No column is reserved for
 * it, so every line runs the card's full width.
 *
 * That measurement is the only reason this is a client component, and it is
 * not avoidable: which spec ends the fifth line depends on where the text
 * wrapped. Pinning the mark to the corner instead needs no JS but leaves a gap
 * between the last value and the dots, which is what it looked like before.
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

  /* Whether to close the list with a marker. Nothing is measured, so this is
     a count comparison rather than a fact about the render: more specs than
     there are lines to hold them almost certainly means some were cut.

     A measure-then-hide build came before this and is worth not repeating: it
     clipped the list to the image's height and computed what fitted, which
     needed a client component, and still lost every value wider than its
     column because a non-wrapping value has no line to fall to. Letting text
     wrap dissolved the problem instead of solving it. */
  /* Where the truncation mark goes, in the wrapper's coordinates — or `null`
     when the whole list fitted and there is nothing to mark.

     This has to be measured. The mark replaces the trailing dot of whichever
     spec ends up last on the fifth line, and which spec that is depends on
     where the text wrapped, which only layout knows. Pinning it to the corner
     instead is what left a gap between the last spec and the dots.

     **It cannot oscillate.** Specs are never added or removed by the result —
     every one stays in the DOM at its own size, and the mark is absolutely
     positioned, so placing it changes no geometry. Each pass measures exactly
     what the last one did. */
  const specRef = useRef<HTMLParagraphElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const [markAt, setMarkAt] = useState<{ left: number; top: number } | null>(
    null,
  );
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    const el = specRef.current;
    if (!el) return;

    const measure = () => {
      const items = [...el.querySelectorAll<HTMLElement>("[data-spec]")];
      if (items.length === 0) return;

      /* Rects, not `offsetLeft`: this block is `display: flex`, so it
         establishes a formatting context, refuses to overlap the float and is
         placed beside the image. Its items' offsets carry that shift while
         `clientWidth` does not, and comparing the two reports the first spec
         as overflowing every time. */
      const box = el.getBoundingClientRect();
      if (box.width === 0) return;

      const anchor = el.parentElement?.getBoundingClientRect();
      if (!anchor) return;

      const rects = items.map((item) => item.getBoundingClientRect());

      let last = -1;
      for (let index = 0; index < rects.length; index += 1) {
        if (rects[index].bottom > box.bottom + 1) break;
        last = index;
      }

      if (last === rects.length - 1 || last < 0) {
        setShown(null);
        setMarkAt(null);
        return;
      }

      /* Everything past the last wholly-visible spec is hidden, not merely
         left to the clip. A spec starting on the fifth line and wrapping onto
         a sixth still paints that first line inside the box — so it appeared
         half-cut *below* the truncation mark, which is the one thing the mark
         is there to prevent. */
      setShown(last + 1);

      /* Sit on the last spec's trailing dot rather than after it, so the mark
         reads as that dot widened to three rather than as a separate thing.
         `DOT` is the `w-4` box each dot occupies.

         Clamped, not stepped back to an earlier spec: where the last spec ends
         hard against the right edge the mark would overhang by a few pixels,
         and nudging it left covers the tail of that value. Retreating a spec
         instead put the mark mid-line, tens of pixels adrift of the value it
         belongs to. */
      /* Measure the spec's **trailing dot element**, which is the thing being
         replaced. Two nearer-looking options are both wrong: the spec's
         bounding rect is the union of its lines, so a value that wraps inside
         itself reports the wider line and the earlier top, putting the mark
         level with a line the value had not finished on; and a `Range` over
         the contents returns runs per line, whose last rect is not the dot box
         and lands a few pixels early, far enough to cover the value's final
         letter.

         The dot is an `inline-block`, so its own rect is exact and already on
         the right line. */
      const dot = items[last].lastElementChild;
      const dotRect = dot?.getBoundingClientRect() ?? rects[last];

      const markWidth = markRef.current?.offsetWidth ?? 0;
      const limit = box.right - markWidth;

      setMarkAt({
        left: Math.min(dotRect.left, limit) - anchor.left,
        top: dotRect.top - anchor.top,
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(el);

    /* Again once the webfont swaps in: this box is a fixed height and a
       full-width block, so the observer will not fire a second time on its
       own, and a first pass against fallback metrics would stick. */
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
    <article className="group relative h-full overflow-hidden border border-line bg-surface-raised p-4 pb-12 shadow-card transition-[box-shadow,border-color,transform,translate] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover">
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
      {/* **Five lines, at every width.** Fixed, not a maximum, so every card's
          block is the same height and what follows it lines up across a row.
          20px lines (`leading-5`) against 6.25rem is exactly five, so the clip
          lands on a line boundary rather than slicing through one.

          Values wrap like ordinary text, so a long spec takes two of those
          lines rather than overhanging the card, and a line carrying a single
          spec is fine.

          `pl-4` pairs with the `-ml-4` on each leading dot: mid-line the dot
          lands on the previous spec's trailing dot and the two superimpose,
          reading as one; at a line start it falls clear into the padding. */}
      {specs.length > 0 && (
        <div className="relative mt-1.5">
          <p
            ref={specRef}
            className="flex h-[6.25rem] flex-wrap items-baseline gap-x-0 overflow-hidden pl-4 font-mono text-[0.75rem] leading-5 text-ink"
          >
            {specs.map((value, index) => (
              <span
                key={`${value}-${index}`}
                data-spec
                /* `whitespace-nowrap` is what makes the value an atomic unit:
                   without it a multi-word value like "Direct on line (DOL)"
                   breaks mid-phrase, which both looks wrong and leaves the
                   flex-wrapped line short of the card's right edge instead of
                   moving the whole value down.

                   `opacity-0`, never `hidden`: a hidden spec must keep its
                   space or the geometry changes on every pass and the
                   measurement never settles. It also stays in the
                   accessibility tree, so the full list is still read out. */
                className={`whitespace-nowrap${
                  shown !== null && index >= shown ? " opacity-0" : ""
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

          {/* Three dots in place of the last visible spec's trailing one, so
              the line closes `· value ···` with no gap. Always mounted so its
              width can be read on the pass that positions it, and absolutely
              placed so it disturbs no layout. It carries the card's background
              to cover the single dot it stands in for. */}
          <span
            ref={markRef}
            aria-hidden
            style={markAt ?? undefined}
            className={`absolute bg-surface-raised font-mono text-[0.75rem] leading-5 text-muted ${
              markAt ? "" : "opacity-0"
            }`}
          >
            ···
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

      {/* The corner arrow was a decoration for a card that was entirely a
          link. With a real control here it would read as a second button and
          compete with it, so the button takes the strip the card's bottom
          padding reserves, and the card still navigates from anywhere the
          button is not.
          
          `pb-12`, not `pb-9`: the button is 36px tall at `bottom-3`, so it
          occupies 12–48px from the card's foot. At `pb-9` the content box
          ended at 36px and the button's top 12px sat over it — invisible
          while the label was an icon and the description happened to stop
          short, but a longer one ran underneath. 48px of padding puts the
          button entirely in the reserved strip. */}
      <div className="absolute bottom-3 right-4">
        <AddToCartButton slug={product.slug} name={product.name} size="compact" />
      </div>
    </article>
  );
}
