import { ProductCard } from "@/components/product/ProductCard";
import type { CategoryMeta, Product } from "@/lib/types";

/**
 * One category on the catalogue: a heading, then the category's products in
 * a responsive grid.
 *
 * **Row-first, three per row from `xl`, two from `sm`, one below it**
 * (client, 2026-08-27: "product cards in a category to be arranged 3 in
 * row. Then the 4th card will come to the next row and then 7th card to
 * the next row and so on… in mobile view the products should be one in
 * each row… when i reduce web page size it should adjust by bringing
 * product cards down… from 3 to 2 to 1"). Ordinary breakpoint-switched
 * `grid-cols-N`, which gives ordinary row-major flow (1 2 3 / 4 5 6 / 7 8
 * 9) with no script watching anything — but every tier's columns are
 * `minmax(17.5rem,1fr)`, not a bare `1fr` (client, same day, next message:
 * "when i reduce page size, do not reduce the product card size"): a bare
 * `1fr` column is still exactly as wide as the results area divided by the
 * column count, so a card's actual rendered width would keep shrinking
 * continuously with the browser window at any width *between* two
 * breakpoints — only the *column count* was ever discrete, not the card
 * itself, and that continuous part is what the client was seeing. The
 * floor stops a card ever rendering narrower than 17.5rem; a short row
 * (fewer products than columns) or a wide one still lets cards grow past
 * that floor to fill the space evenly, since it is a `minmax` floor, not a
 * fixed size.
 *
 * **Three columns start at `xl` (1280px), not `lg` (1024px), and the floor
 * is 17.5rem, not a rounder 18rem or 20rem — both numbers were solved for,
 * not guessed.** This grid sits beside a fixed `14rem` filter rail from
 * `lg` up (`ProductCatalogue`'s `lg:grid-cols-[minmax(0,14rem)_...]`), so
 * the results column is narrower than the viewport by the rail, its
 * `3rem` gap, and the page's own side padding — at `lg`'s own lower edge
 * (1024px) that leaves only ~688px for the grid, enough for two
 * comfortable columns but not three without shrinking below the floor.
 * `Container size="wide"` caps at `max-w-7xl` (1280px) — which is exactly
 * Tailwind's `xl` — so past that point the page stops growing and the
 * results column settles at a known ceiling, ~944px; three 17.5rem columns
 * plus two `1.5rem` gaps is 888px, comfortably under it. Below `lg`, the
 * rail collapses to a toggle button and stops competing for width at all,
 * so the *same* floor clears two columns far earlier there (from `sm`,
 * 640px) without ever needing three; picking `xl` for three specifically —
 * rather than, say, `auto-fit` sizing every tier off the grid's own actual
 * width — is what keeps the column count strictly 3 → 2 → 1 as the window
 * narrows. `auto-fit` was tried first and produces a real, measured
 * regression here: the rail's own disappearance at `lg`'s boundary hands
 * the grid back more width than it had just above that boundary, so a
 * width-driven column count jumps 3 → 2 → **3** → 2 → 1 while narrowing
 * through 1024–960px — not what "reduce from 3 to 2 to 1" asked for.
 *
 * **Replaced two independently-scrolling, column-first tracks with paging
 * arrows** (client, same message: "lets remove the left and right toggle
 * button"). That build filled column-first — card 2 under card 1, not
 * beside it — specifically so each row's *own* scroll made sense as a
 * self-contained unit; once nothing scrolls, column-first ordering is not
 * "3 in a row, 4th starts the next row" at all, it is two ordinary reading
 * orders decided by an implementation detail the visitor never sees framed as
 * such. This file was `"use client"` for that build's `ResizeObserver` and
 * scroll-position state; none of that remains, so this is a plain server
 * component now, needing neither the directive nor a ref of its own.
 */
export function ProductRow({
  category,
  products,
  priority = false,
}: {
  category: CategoryMeta;
  products: Product[];
  priority?: boolean;
}) {
  const headingId = `catalogue-${category.key}`;

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line pb-4">
        <h2 id={headingId} className="text-xl leading-snug sm:text-2xl">
          {category.label}
        </h2>
        <p className="label-tech text-muted">
          {`${products.length} product${products.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <ul className="mt-5 grid grid-cols-[minmax(17.5rem,1fr)] gap-6 sm:grid-cols-[repeat(2,minmax(17.5rem,1fr))] xl:grid-cols-[repeat(3,minmax(17.5rem,1fr))]">
        {products.map((product, index) => (
          <li key={product.id}>
            <ProductCard product={product} priority={priority && index === 0} />
          </li>
        ))}
      </ul>
    </section>
  );
}
