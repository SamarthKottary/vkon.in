import Image from "next/image";
import Link from "next/link";
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
 *   │ image  │  Type · Rating · Supply
 *   └────────┘
 *   Name
 *
 * The identifying pair sits beside the image; `clear-left` on the name drops
 * it below the float so it gets the card's full width however long it runs.
 * That is what keeps a long product name legible in a ~320px card on a phone
 * — the two-flex-column build this replaced gave the square plate a width
 * equal to the card's height and crushed every line into what was left.
 *
 * **No tagline here** (client, 2026-08-20). The spec line does the describing
 * instead, which is denser and more useful for someone re-finding a product
 * they already looked at. The vertical card still carries the tagline.
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

  /* The top of the detail page's spec table, run together on one line —
     "Direct on line (DOL) · 3 – 10 HP · 3 phase". Values only: the labels
     ("Type", "Motor range", "Supply") are what a table column is for and
     would double the length here for no gain.

     Capped at three because that is what fits beside the image, and because
     the fourth row is usually Warranty, which is not identifying. Falls back
     to ratings for any product with no spec rows at all. */
  const specLine =
    product.spec.length > 0
      ? product.spec
          .slice(0, 3)
          .map((row) => row.value)
          .join("  ·  ")
      : product.hpRanges.join("  ·  ");

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

      {specLine && (
        <p className="mt-1.5 line-clamp-3 font-mono text-[0.75rem] leading-relaxed text-ink">
          {specLine}
        </p>
      )}

      {/* `clear-left` is what turns this into an L: the name drops below the
          floated image instead of continuing beside it, so it gets the card's
          full width however long it runs. */}
      <Heading className="clear-left pt-3 text-[0.9375rem] leading-snug">
        <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0">
          {product.name}
        </Link>
      </Heading>

      {/* `pb-9` on the card reserves the strip this sits in, so a tagline
          running to three lines cannot collide with it. */}
      <ArrowRightIcon className="absolute bottom-3.5 right-4 h-4 w-4 text-muted transition-transform duration-150 group-hover:translate-x-1 group-hover:text-accent" />
    </article>
  );
}
