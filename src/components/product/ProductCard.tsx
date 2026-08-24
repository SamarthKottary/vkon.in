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
 * All three orientations therefore carry a **square** plate for the sharp
 * image: the vertical card as a full-width `aspect-square` band above its
 * text, the horizontal strip as a floated fixed square with the text
 * wrapping round it, the featured card the same full-width band as the
 * vertical one, just lower down. The strip's plate was a `w-24` portrait
 * sliver until 2026-08-19, which cropped ~35% off each side of a 1:1
 * photograph.
 *
 * `bg-surface-subtle` backs the plate, for the placeholder case and while an
 * image is loading. The featured card's blurred backdrop is the one
 * deliberate exception to "never crops" — see the note on `FeaturedCard`.
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
   * "featured" — image in the middle, its own blurred bleed standing in for a
   * background above and below it; home page only. See `FeaturedCard`.
   */
  orientation?: "vertical" | "horizontal" | "featured";
}) {
  const image = product.images[0];
  const Heading = headingLevel;

  if (orientation === "horizontal") {
    return <HorizontalCard product={product} priority={priority} Heading={Heading} />;
  }

  if (orientation === "featured") {
    return <FeaturedCard product={product} priority={priority} Heading={Heading} />;
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

/**
 * Featured card: the photograph in the middle, its own blurred bleed
 * standing in for a background above and below it (client, 2026-08-24).
 *
 * **One photograph, shown twice.** A backdrop copy fills the whole card —
 * `fill`, `object-cover`, blurred — and the sharp copy sits over it in a
 * square band partway down. Same idiom as `layout/SubscribePanel`'s bleed
 * background: `scale-110` on the blurred copy overshoots the frame enough
 * that blur's soft, half-transparent edge is pushed outside the card and
 * clipped by `overflow-hidden`, rather than showing as a faint halo. The
 * blur is lighter here than that panel's (`blur-md` against its `blur-lg`)
 * — this card is a few hundred pixels wide rather than the full viewport, and
 * the same blur *radius* reads as proportionally much softer on something
 * this much smaller.
 *
 * **The blurred copy is decorative and is allowed to crop; the sharp one is
 * not.** The component doc above is emphatic that this site's photography is
 * shot 1:1 so the plate never crops it, and that still holds for the sharp
 * copy — its band is `aspect-square`, matching the source exactly, same as
 * the plain vertical card's. The backdrop is a color wash standing in for a
 * background, not a presentation of the product, so `object-cover` cropping
 * it to fill a non-square card is fine — nobody is meant to read it as the
 * photograph.
 *
 * **Text sits on `band-*` tokens, not the usual `ink`/`muted`/`body`.** Those
 * are tuned for dark text on this site's pale surface; here the surface is a
 * photograph. `band-ink`/`band-body` are the same white-on-dark pairing the
 * hero and every masthead already use for exactly this reason.
 *
 * **Two scrim gradients, not one wash over the whole card** — the top band
 * darkens toward the top edge, the bottom band darkens toward the bottom
 * edge, and both fade to nothing by the time they reach the sharp image, so
 * the photograph itself is never dimmed.
 *
 * **Each is six or seven colour stops on an eased curve, not Tailwind's plain
 * `from`/`to` two-stop linear fade** (client, 2026-08-24 — the two-stop
 * version looked like it had a visible seam where it met the sharp image,
 * even though a pixel-by-pixel luminance sample down the card found no
 * actual jump there). The seam was real, just not a brightness discontinuity:
 * a linear gradient's rate of darkening is constant right up until the exact
 * pixel it ends, where the rate drops to zero all at once, and the human eye
 * reliably picks that up as an edge — a Mach band — independent of whether
 * the colour values either side of it actually differ. The fix is the
 * standard one: stops chosen so the curve's own rate of change *also* eases
 * toward zero near both ends, which is what the hand-placed stops below
 * approximate. Read the numbers as one curve, not several arbitrary values.
 *
 * **The curve is not symmetric — it holds flat at peak opacity through the
 * measured content zone, then eases down to transparent over the shorter gap
 * that remains before the image** (client, 2026-08-24 — an earlier, evenly-
 * eased version faded across the *whole* band, and every text element
 * measured close to invisible because all of them sit nearer the image than
 * the band's own midpoint). Top band content measures 83px inside a 128px
 * band, so the hold runs flat to 65%; bottom band content measures 172px
 * inside 224px, so the hold runs flat to 77%. If the content changes enough
 * to need re-tuning, measure the actual rendered heights again rather than
 * guessing new percentages — that is what caught this the first time.
 *
 * **The hold is genuinely flat, and the ease-down after it is its own small
 * smoothstep curve, not a linear taper** (client, 2026-08-24 again, same day
 * — holding peak *and* linearly tapering afterward reintroduced the Mach-band
 * seam from two entries up, just relocated: the rate of change jumped from
 * ~0 during the hold to a constant steep slope the instant the taper began,
 * which is the same kind of rate discontinuity as before, only compressed
 * into less space and so proportionally worse. Confirmed directly — the
 * two-derivative check flagged a rate change of 197 luminance-levels at one
 * point, against essentially anti-aliasing noise everywhere else.) The stops
 * below are computed from `peak × (1 − smoothstep(x))`, `x` running 0→1
 * across only the ease-down span, which has zero slope at both ends by
 * construction: matching the flat hold going in, and matching the fully
 * transparent, unchanging image going out. Verified in isolation — the
 * gradient alone, screenshotted against a flat backdrop with no text or
 * photo to confound the reading — at under 3 luminance-levels of rate
 * change anywhere along either curve.
 *
 * **The opacities (`scrim/62`, `scrim/65` peak) match `home/HeroRotator` and
 * `layout/SubscribePanel`'s weight, deliberately, not by coincidence** — a
 * first pass went to `scrim/92`, held solid across most of the band, which
 * read as a black bar rather than a lit photograph and was rejected on sight
 * (client, 2026-08-24). This is the correction, and it carries a known,
 * measured, accepted cost: against the current placeholder photography —
 * flat line-art on a near-white canvas, not real photographs — description
 * text still measures under full WCAG AA (3.7:1 against 4.5:1, after the
 * hold-longer fix above; it was 1.1:1 before that fix existed at all) even
 * though it now reads as clearly, visibly legible. Confirmed the opposite is
 * true of a real photograph: this is the same *opacity* the hero and
 * subscribe panel already use successfully, on images
 * with actual tonal range for a translucent dark layer to darken. Client
 * decision, holding this: the code should not be shaped around today's
 * placeholders, and this will read correctly once real product photography
 * replaces them — nothing here should change on that day, only the images
 * powering it. If a future pass is chasing weak contrast on this card, check
 * what `image.url` actually points at before touching the scrim again.
 *
 * Both scrim layers are `-z-10`, stacked under the
 * text in document order rather than the text carrying `relative z-10` —
 * doing it that way keeps the top and bottom content wrappers themselves
 * unpositioned, which matters because the stretched-link title sits inside
 * the top one: `after:absolute after:inset-0` climbs to the nearest
 * *positioned* ancestor, and if that wrapper were `relative` the link would
 * stretch to cover only itself instead of the whole card, the same trap
 * documented on `AddToCartButton`.
 *
 * **No image, no bleed.** A product with no photograph has nothing to
 * extend, so this falls back to the plain card's flat treatment rather than
 * blurring a placeholder — a blurred `PanelPlaceholder` icon would neither
 * look like a photograph nor read as obviously absent, worse than either.
 */
function FeaturedCard({
  product,
  priority,
  Heading,
}: {
  product: Product;
  priority: boolean;
  Heading: "h3" | "h4";
}) {
  const image = product.images[0];

  if (!image) {
    return (
      <article className="group relative flex h-full flex-col border border-line bg-surface-raised shadow-card transition-[box-shadow,border-color,transform,translate] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover">
        <div className="relative flex aspect-square items-center justify-center overflow-hidden border-b border-line bg-surface-subtle">
          <PanelPlaceholder className="h-20 w-20" />
        </div>
        <div className="flex flex-1 flex-col p-5">
          <p className="label-tech text-muted">{categoryLabel(product.category)}</p>
          <Heading className="mt-2.5 text-lg leading-snug">
            <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0">
              {product.name}
            </Link>
          </Heading>
          {product.tagline && (
            <p className="mt-2 text-sm leading-relaxed text-muted">{product.tagline}</p>
          )}
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

  return (
    <article className="group relative isolate flex h-full flex-col overflow-hidden border border-line bg-band shadow-card transition-[box-shadow,border-color,transform,translate] duration-200 hover:-translate-y-0.5 hover:border-band-line hover:shadow-card-hover">
      <Image
        src={image.url}
        alt=""
        aria-hidden
        fill
        sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 92vw"
        className="-z-10 scale-110 object-cover blur-md"
      />
      {/* Eased, five-stop gradients rather than Tailwind's plain `from`/`to` —
          see the note above on why a genuinely smooth fade needs more than two
          stops. `color-mix` against the `scrim` token rather than a literal
          hex: the token is what changes if the palette ever does, and this
          keeps reading it rather than a value copied out of it. Inline
          `style`, not utility classes, because a hand-tuned five-stop curve
          has no clean expression as Tailwind classes — the alternative was
          five chained `via-*` utilities with arbitrary percentage
          *and* opacity modifiers on each, which is harder to read than the
          curve it draws. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-32"
        style={{
          backgroundImage: `linear-gradient(to bottom,
            color-mix(in srgb, var(--color-scrim) 62%, transparent) 0%,
            color-mix(in srgb, var(--color-scrim) 62%, transparent) 65%,
            color-mix(in srgb, var(--color-scrim) 59%, transparent) 70%,
            color-mix(in srgb, var(--color-scrim) 50%, transparent) 75%,
            color-mix(in srgb, var(--color-scrim) 38%, transparent) 80%,
            color-mix(in srgb, var(--color-scrim) 24%, transparent) 85%,
            color-mix(in srgb, var(--color-scrim) 12%, transparent) 90%,
            color-mix(in srgb, var(--color-scrim) 4%, transparent) 95%,
            transparent 100%)`,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-56"
        style={{
          backgroundImage: `linear-gradient(to top,
            color-mix(in srgb, var(--color-scrim) 65%, transparent) 0%,
            color-mix(in srgb, var(--color-scrim) 65%, transparent) 77%,
            color-mix(in srgb, var(--color-scrim) 60%, transparent) 81%,
            color-mix(in srgb, var(--color-scrim) 47%, transparent) 85%,
            color-mix(in srgb, var(--color-scrim) 30%, transparent) 89%,
            color-mix(in srgb, var(--color-scrim) 14%, transparent) 93%,
            color-mix(in srgb, var(--color-scrim) 3%, transparent) 97%,
            transparent 100%)`,
        }}
      />

      <div className="p-5 pb-4">
        <p className="label-tech text-band-body">{categoryLabel(product.category)}</p>
        <Heading className="mt-2 text-lg leading-snug text-band-ink">
          {/* Stretched link — whole card is the target, one tab stop. Not
              inside a `relative` wrapper; see the note on the component for
              why that matters here specifically.

              **`after:z-[1]` is load-bearing, confirmed by testing, not a
              guess.** The image band below is `position: relative` — required
              for `next/image`'s `fill` — and being a later sibling than this
              one, it otherwise paints *above* this `::after` overlay and
              swallows clicks on the image even though the overlay's `inset-0`
              correctly spans the whole card. `z-[1]` only has to clear that
              band's implicit `z-index: auto` (0); the Add-to-cart button's
              own `z-10` still wins over this regardless. */}
          <Link
            href={`/products/${product.slug}`}
            className="after:absolute after:inset-0 after:z-[1]"
          >
            {product.name}
          </Link>
        </Heading>
      </div>

      <div className="relative aspect-square w-full">
        <Image
          src={image.url}
          alt={image.alt || product.name}
          fill
          sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 92vw"
          priority={priority}
          className="object-cover transition-transform duration-300 ease-out md:group-hover:scale-[1.06]"
        />

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

      <div className="flex flex-1 flex-col p-5 pt-4">
        {product.tagline && (
          <p className="text-sm leading-relaxed text-band-body">{product.tagline}</p>
        )}

        {product.hpRanges.length > 0 && (
          <dl className="mt-3 flex gap-2 text-sm">
            <dt className="label-tech pt-1 text-band-muted">Range</dt>
            <dd className="font-mono text-[0.8125rem] text-band-ink">
              {product.hpRanges.join(" · ")}
            </dd>
          </dl>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-6">
          <span className="flex items-center gap-2 text-sm font-medium text-band-ink transition-colors group-hover:text-band-accent">
            View details
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" />
          </span>
          <AddToCartButton slug={product.slug} name={product.name} size="compact" />
        </div>
      </div>
    </article>
  );
}
