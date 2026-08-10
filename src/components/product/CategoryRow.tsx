import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons/ui";
import { ProductCard } from "./ProductCard";
import type { CategoryMeta, Product } from "@/lib/types";

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
 * `lead` picks how the category introduces itself:
 *   "card"    — an intro panel as the first cell of the track (home page)
 *   "heading" — a plain heading above the track (catalogue, where the filter
 *               row already frames the page)
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
  lead?: "card" | "heading";
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

      {/* The negative margins let the track bleed to the viewport edge, so a card
          can scroll flush with the screen instead of stopping at the gutter. */}
      <ul
        className={`hscroll -mx-5 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 ${
          lead === "heading" ? "mt-6" : ""
        }`}
      >
        {lead === "card" && (
          <li className="w-[17rem] flex-none snap-start sm:w-[19rem]">
            <div className="flex h-full flex-col border border-line bg-surface-subtle p-6">
              <Heading id={headingId} className="text-xl leading-snug sm:text-2xl">
                {category.label}
              </Heading>
              <p className="mt-3 text-sm leading-relaxed text-body">
                {category.description}
              </p>
              <p className="label-tech mt-6 text-muted">{count}</p>
              <Link
                href={`/products?category=${category.key}`}
                className="link-cta mt-auto pt-6"
              >
                View all
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </li>
        )}

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
    </section>
  );
}
