"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons/ui";
import { ProductCard } from "@/components/product/ProductCard";
import type { CategoryMeta, Product } from "@/lib/types";

/**
 * One category on the catalogue: a heading, paging arrows, and a horizontal
 * track of wide cards.
 *
 * The arrows sit on the heading row rather than below the track, so every
 * category has its control in the same place and the eye does not hunt. They
 * disable at the ends instead of vanishing — a control that moves is worse than
 * one that is briefly inert — and the whole group is hidden when the row
 * already fits, since it could then never do anything.
 *
 * Scrolling is native with snap points; the arrows page by exactly one card,
 * measured from the DOM so the step follows the breakpoint rather than a
 * hard-coded width.
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
  const deskRef = useRef<HTMLDivElement>(null);
  const rowARef = useRef<HTMLUListElement>(null);
  const rowBRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  /* Three candidate scroll containers, only some of which are live at any
     breakpoint: below `lg` the two row `<ul>`s scroll independently and the
     wrapper is a plain column; at `lg` the `<ul>`s go `display: contents` and
     the wrapper becomes the single scrolling grid. A container that is not
     live reports `scrollWidth === clientWidth` (or 0 when it has no box), so
     `max <= 0` filters it out rather than needing a breakpoint check here. */
  const tracks = useCallback(() => {
    /* Annotated rather than inferred: the literal would otherwise be typed
       `(HTMLDivElement | HTMLUListElement | null)[]`, and `HTMLElement` is
       not assignable to that union, so the narrowing predicate below is
       rejected and every use downstream stays nullable. */
    const candidates: (HTMLElement | null)[] = [
      deskRef.current,
      rowARef.current,
      rowBRef.current,
    ];
    return candidates.filter((el): el is HTMLElement => el !== null);
  }, []);

  const sync = useCallback(() => {
    let left = false;
    let right = false;

    for (const el of tracks()) {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) continue;
      if (el.scrollLeft > 4) left = true;
      if (el.scrollLeft < max - 4) right = true;
    }

    setCanScroll({ left, right });
  }, [tracks]);

  /* No priming `sync()` call here: `observe()` fires the callback once for
     each element as soon as it starts observing, so the initial measurement
     arrives on its own. Calling it directly would also be setting state
     synchronously in an effect body, which `react-hooks/set-state-in-effect`
     rejects — the same rule the header's scroll handling is written around. */
  useEffect(() => {
    const observer = new ResizeObserver(sync);
    for (const el of tracks()) observer.observe(el);
    return () => observer.disconnect();
  }, [sync, tracks, products.length]);

  /* Pages every live track together. Manual scrolling stays independent —
     that is the point of the split — but one arrow pair driving both rows
     keeps a single control on the heading rather than a pair per row. */
  const page = (direction: 1 | -1) => {
    for (const el of tracks()) {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) continue;
      const first = el.querySelector("li");
      const step = first
        ? first.getBoundingClientRect().width + 24
        : el.clientWidth;
      el.scrollBy({ left: step * direction, behavior: "smooth" });
    }
  };

  /* Sequential halves, not alternating. The cards used to fill column-first
     so card 2 sat under card 1, but that pairing only holds while the rows
     move together — once each row scrolls on its own the column is broken by
     the first swipe, and a straight first-half / second-half split is both
     easier to follow and what lets `lg:contents` merge the two lists back
     into one correctly-ordered row without reordering anything. */
  const half = Math.ceil(products.length / 2);
  const rowA = products.slice(0, half);
  const rowB = products.slice(half);

  const showArrows = canScroll.left || canScroll.right;
  const headingId = `catalogue-${category.key}`;

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 id={headingId} className="text-xl leading-snug sm:text-2xl">
            {category.label}
          </h2>
          <p className="label-tech text-muted">
            {`${products.length} product${products.length === 1 ? "" : "s"}`}
          </p>
        </div>

        {showArrows && (
          <div className="flex items-center gap-2">
            <PageButton
              label={`Previous ${category.label}`}
              disabled={!canScroll.left}
              onClick={() => page(-1)}
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </PageButton>
            <PageButton
              label={`More ${category.label}`}
              disabled={!canScroll.right}
              onClick={() => page(1)}
            >
              <ArrowRightIcon className="h-4 w-4" />
            </PageButton>
          </div>
        )}
      </div>

      {/* Below `lg`: two rows, each its own scroll container, so swiping one
          leaves the other where it was. At `lg`: the two `<ul>`s go
          `display: contents`, their `<li>`s become items of this wrapper's
          grid, and the whole category is one side-by-side row again — no
          duplicated markup, and no second copy of every product image, which
          a `hidden lg:block` pair of layouts would have cost (see §9 on
          hidden `<Image fill>` resolving `sizes` to the largest candidate).

          The second row is only rendered when there is something in it. Grid
          materialises every explicit track whether or not an item lands in
          it, so an unconditional second row gave single-product categories an
          empty track plus its `gap-6` — dead space that read as a gap between
          one category and the next heading. Most categories hold exactly one
          product today, so that was visible the whole way down the page. */}
      <div
        ref={deskRef}
        onScroll={sync}
        className="hscroll mt-5 flex flex-col gap-6 lg:grid lg:snap-x lg:snap-mandatory lg:grid-flow-col lg:auto-cols-[calc((100%-3rem)/3)] lg:items-stretch lg:overflow-x-auto"
      >
        <ul
          ref={rowARef}
          onScroll={sync}
          className="hscroll flex snap-x snap-mandatory items-stretch gap-6 overflow-x-auto lg:contents"
        >
          {rowA.map((product, index) => (
            <li
              key={product.id}
              className="w-[82%] flex-none snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-auto"
            >
              <ProductCard product={product} priority={priority && index === 0} />
            </li>
          ))}
        </ul>

        {rowB.length > 0 && (
          <ul
            ref={rowBRef}
            onScroll={sync}
            className="hscroll flex snap-x snap-mandatory items-stretch gap-6 overflow-x-auto lg:contents"
          >
            {rowB.map((product) => (
              <li
                key={product.id}
                className="w-[82%] flex-none snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-auto"
              >
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-raised text-ink transition-colors hover:border-ink disabled:cursor-default disabled:text-muted disabled:opacity-40"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
