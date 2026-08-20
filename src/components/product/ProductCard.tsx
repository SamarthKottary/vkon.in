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
 * **Both orientations fill their plate with `object-cover`** (client request,
 * 2026-08-19) — no padding, no letterboxing, so a picture reads as
 * photography rather than as a catalogue thumbnail. Anything whose subject
 * runs to the frame edge is centre-cropped: the vertical card to 4:3, the
 * horizontal strip to its narrow slot. That is an accepted trade while the
 * catalogue runs on drawn placeholders; real photography is to be shot to
 * those ratios. `bg-surface-subtle` still backs both plates, for the
 * placeholder case and while an image is loading.
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
      <div className="relative aspect-[4/3] overflow-hidden border-b border-line bg-surface-subtle">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt || product.name}
            fill
            sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 92vw"
            priority={priority}
            /* `object-cover` with no padding (client request, 2026-08-19):
               the photograph fills the plate edge to edge rather than
               floating inset on it. The trade is that a frame whose subject
               runs to the edges gets cropped to 4:3 — shots for this card
               want the panel centred with room around it. */
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
 * The image plate is a fixed width rather than a percentage, so a row of these
 * keeps its images aligned in a vertical band down the grid no matter how long
 * the product names run.
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

  return (
    <article className="group relative flex h-full border border-line bg-surface-raised shadow-card transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover">
      <div className="relative w-24 shrink-0 self-stretch overflow-hidden border-r border-line bg-surface-subtle sm:w-28">
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

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <p className="label-tech text-muted">{categoryLabel(product.category)}</p>

        <Heading className="mt-1.5 text-[0.9375rem] leading-snug">
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0">
            {product.name}
          </Link>
        </Heading>

        {product.tagline && (
          <p className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-muted">
            {product.tagline}
          </p>
        )}

        {product.hpRanges.length > 0 && (
          <p className="mt-auto pt-3 font-mono text-[0.75rem] text-ink">
            {product.hpRanges.join(" · ")}
          </p>
        )}
      </div>

      <ArrowRightIcon className="absolute bottom-4 right-4 h-4 w-4 text-muted transition-transform duration-150 group-hover:translate-x-1 group-hover:text-accent" />
    </article>
  );
}
