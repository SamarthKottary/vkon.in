import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons/ui";
import { ProductCard } from "./ProductCard";
import type { CategoryMeta, Product } from "@/lib/types";

/** Home shows at most this many per category; the banner link covers the rest. */
const HOME_SLOTS = 6;

/**
 * One category, laid out as a horizontal track of cards.
 *
 * Scrolling is native CSS — `overflow-x` plus scroll snap — rather than a
 * JavaScript carousel with arrow buttons. Two reasons: this site targets low-end
 * Android phones, where a native scroller is smoother than anything scripted;
 * and a carousel would be the first client component in the public tree, which
 * ARCHITECTURE.md §7 keeps deliberately empty.
 *
 * The affordance is the card that peeks in at the right edge — card widths are
 * chosen so a row that overflows always shows a partial card. Keyboard users get
 * there by tabbing: focusing a card scrolls it into view.
 *
 * `lead` also picks the body layout:
 *   "banner"  — a fixed 3-column grid of compact horizontal cards, capped at
 *               HOME_SLOTS. Columns are fixed so a category with two products
 *               leaves the remaining cells empty rather than stretching two
 *               cards across the row.
 *   "heading" — the scrolling track of tall cards.
 *
 * `lead` picks how the category introduces itself:
 *   "banner"  — a full-width panel above the track carrying the description
 *               and a link into the filtered catalogue (home page)
 *   "heading" — a plain heading above the track (catalogue, where the filter
 *               row already frames the page)
 *
 * The banner was a tall card in the first cell of the track until 2026-08-11.
 * As a card it competed with the product cards beside it — same width, same
 * height, so it read as a product with no photograph. Across the top it reads
 * as what it is: a label for the row underneath.
 */
export function CategoryRow({
  category,
  products,
  lead = "heading",
  headingLevel = "h2",
  priority = false,
}: {
  category: CategoryMeta;
  products: Product[];
  lead?: "banner" | "heading";
  headingLevel?: "h2" | "h3";
  priority?: boolean;
}) {
  if (products.length === 0) return null;

  const Heading = headingLevel;
  const cardHeading = headingLevel === "h2" ? "h3" : "h4";
  const headingId = `category-${category.key}`;
  const count = `${products.length} product${products.length === 1 ? "" : "s"}`;

  return (
    <section aria-labelledby={headingId}>
      {lead === "heading" && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line pb-4">
          <Heading id={headingId} className="text-xl leading-snug sm:text-2xl">
            {category.label}
          </Heading>
          <p className="label-tech text-muted">{count}</p>
        </div>
      )}

      {lead === "banner" && (
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4 border border-line bg-surface-subtle px-6 py-5 sm:px-7 sm:py-6">
          <div className="max-w-xl">
            <Heading id={headingId} className="text-xl leading-snug sm:text-2xl">
              {category.label}
            </Heading>
            <p className="mt-2 text-sm leading-relaxed text-body">
              {category.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 sm:flex-col sm:items-end sm:gap-3">
            <p className="label-tech text-muted">{count}</p>
            <Link href={`/products?category=${category.key}`} className="link-cta">
              View all
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {lead === "banner" ? (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.slice(0, HOME_SLOTS).map((product, index) => (
            <li key={product.id}>
              <ProductCard
                product={product}
                orientation="horizontal"
                headingLevel={cardHeading}
                priority={priority && index === 0}
              />
            </li>
          ))}
        </ul>
      ) : (
        /* The negative margins let the track bleed to the viewport edge, so a
           card can scroll flush with the screen instead of stopping at the
           gutter. */
        <ul className="hscroll -mx-5 mt-6 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {products.map((product, index) => (
            <li
              key={product.id}
              className="w-[17rem] flex-none snap-start sm:w-[19rem]"
            >
              <ProductCard
                product={product}
                headingLevel={cardHeading}
                priority={priority && index === 0}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
