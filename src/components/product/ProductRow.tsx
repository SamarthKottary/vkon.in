"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons/ui";
import { ProductCard } from "@/components/product/ProductCard";
import type { CategoryMeta, Product } from "@/lib/types";

/**
 * One category on the catalogue: a heading, then the category's products in
 * **two independently scrolling rows**.
 *
 * Cards fill **column-first** — card 2 sits under card 1, card 3 to the right
 * of card 1, card 4 under card 3, and so on. Three cards are visible per row
 * at `lg`, two at `sm`, one on a phone, so a category of six fills the desktop
 * view exactly and the seventh is the first thing you scroll to.
 *
 * **Each row scrolls on its own and carries its own arrows.** Paging the top
 * row leaves the bottom one where it was. That is why the rows are two
 * separate scroll containers rather than one two-row grid, and why the arrow
 * pair moved off the heading and onto each row: a single control driving both
 * rows would contradict the independence the split exists to provide.
 *
 * Because the two rows never merge into one at any breakpoint, this needs no
 * `display: contents` trick and no duplicated markup — an earlier build did
 * merge them at `lg` and had to work around both.
 *
 * The second row is only rendered when there is something in it; a category
 * holding one product would otherwise get an empty track and its margin,
 * which read as a gap before the next category.
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

  /* Column-first, so the pair a visitor sees stacked at rest is 1/2, then
     3/4 beside it. Alternate indices are exactly that ordering: evens on top,
     odds beneath. Note the pairing only holds at rest — the rows scroll
     independently, so the first swipe offsets them, which is intended. */
  const top = products.filter((_, index) => index % 2 === 0);
  const bottom = products.filter((_, index) => index % 2 === 1);

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

      <div className="mt-5 flex flex-col gap-8">
        <Track
          products={top}
          category={category.label}
          rowLabel="top row"
          priority={priority}
        />
        {bottom.length > 0 && (
          <Track
            products={bottom}
            category={category.label}
            rowLabel="second row"
          />
        )}
      </div>
    </section>
  );
}

/**
 * A single scrolling row and the arrows that drive it.
 *
 * Self-contained on purpose: each instance owns its ref, its scrollability
 * state and its own controls, which is what makes two of them independent
 * without any coordination between them.
 */
function Track({
  products,
  category,
  rowLabel,
  priority = false,
}: {
  products: Product[];
  category: string;
  /** Distinguishes the two rows for screen readers. */
  rowLabel: string;
  priority?: boolean;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
  }, []);

  /* No priming `sync()` call: `observe()` fires the callback once as soon as
     it starts observing, so the first measurement arrives on its own. Calling
     it here would also be setting state synchronously in an effect body,
     which `react-hooks/set-state-in-effect` rejects. */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync, products.length]);

  /** Pages by one card, measured from the DOM so it follows the breakpoint. */
  const page = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 24 : el.clientWidth;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  const showArrows = canScroll.left || canScroll.right;

  return (
    <div>
      {/* Hidden entirely when the row already fits — a control that can never
          do anything is noise, and with two rows there would be two of them.
          They disable at the ends rather than vanishing, so the pair does not
          move while you use it. */}
      {showArrows && (
        <div className="mb-2 flex items-center justify-end gap-2">
          <PageButton
            label={`Previous ${category}, ${rowLabel}`}
            disabled={!canScroll.left}
            onClick={() => page(-1)}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </PageButton>
          <PageButton
            label={`More ${category}, ${rowLabel}`}
            disabled={!canScroll.right}
            onClick={() => page(1)}
          >
            <ArrowRightIcon className="h-4 w-4" />
          </PageButton>
        </div>
      )}

      <ul
        ref={trackRef}
        onScroll={sync}
        aria-label={`${category}, ${rowLabel}`}
        className="hscroll flex snap-x snap-mandatory items-stretch gap-6 overflow-x-auto"
      >
        {products.map((product, index) => (
          <li
            key={product.id}
            className="w-[82%] flex-none snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]"
          >
            <ProductCard product={product} priority={priority && index === 0} />
          </li>
        ))}
      </ul>
    </div>
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
