"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, PauseIcon, PlayIcon } from "@/components/icons/ui";
import { ProductCard } from "@/components/product/ProductCard";
import type { Product } from "@/lib/types";

/**
 * "Featured products" — a horizontal, centre-snapping row.
 *
 * Same `hscroll` track idiom as `SectorBrowser`/`ProductRow`, with three
 * things those don't need, all asked for together because they serve one
 * effect — the centred card reading as the one currently "picked up":
 *
 *  - **Snap is `center`, not `start`.** The other tracks line a card up
 *    against the left edge; this one settles it in the middle, which is
 *    also the frame the "which card is active" check below reads from.
 *  - **A vertical mouse wheel pages the row.** Trackpads already send a
 *    horizontal delta on a two-finger swipe and need no help; a plain mouse
 *    wheel only ever sends a vertical one, which a horizontal-only track
 *    otherwise ignores completely.
 *  - **Exactly one card is ever popped, and only while this section itself is
 *    in view.** Scrolling the *page* to reach the section pops the centred
 *    card; scrolling past it and away un-pops it — arriving is what "reaches"
 *    a card here, not pointing at the row. An `IntersectionObserver` on the
 *    section root (not the track) drives that, separately from the one below
 *    that finds which card is centred. From there, whichever card's own
 *    centre sits closest to the track's centre is popped by default, checked
 *    by measuring rects on scroll and resize, the same way `sync` below
 *    already measures for the paging arrows. Pointing at a *different* card
 *    overrides it: `hoveredId` wins over the centred one whenever it is set,
 *    so hovering never leaves two cards popped at once.
 *
 *    (An earlier build used the narrowed-root-margin `IntersectionObserver`
 *    trick for the centred-card check too, and a plain "has the visitor done
 *    anything yet" flag for the section-in-view check. The first only reports
 *    an intersection change on crossing one of a fixed set of ratio
 *    thresholds, so a card change mid-scroll could go unreported until the
 *    ratio happened to cross one — this direct measure has no such gap. The
 *    second stayed popped forever once set, rather than un-popping on leaving
 *    the section, which is what this component is for.)
 *
 *  - **The row advances on its own, endlessly.** One card every 2s, and the
 *    first card follows the last with no rewind — the list is rendered twice
 *    and the scroll position is silently pulled back by one set-width each
 *    time it crosses the seam. Both copies hold identical content at that
 *    offset, so the jump is invisible; what a visitor sees is a belt.
 *
 *    Duplication is why every card carries a `uid` (`<product id>#<slot>`)
 *    rather than its bare product id: two elements now answer to the same
 *    product, and the centred-card pop below keys on the element. Without it
 *    both copies popped at once.
 *
 *    The belt only forms when one set genuinely overflows the track. Doubling
 *    a row that already fits would invent scrolling that is not wanted, so
 *    `canLoop` measures one set against the visible width — and measures it
 *    as `scrollWidth / 2` once doubled, which keeps the answer stable instead
 *    of flip-flopping as the DOM changes under it.
 *    It is gated the same way the hero's rotation is (see `HeroRotator`):
 *    off until an effect confirms `prefers-reduced-motion` is not set, frozen
 *    while the tab is hidden, and stopped whenever the section is out of view
 *    so a phone is not animating a row nobody is looking at. Hover and
 *    keyboard focus pause it too, or a card would slide out from under the
 *    pointer mid-read, and there is an explicit pause control for the visitors
 *    hovering cannot serve.
 *
 * The track carries generous vertical padding rather than `overflow-visible`
 * — horizontal scrolling needs `overflow-x: auto`, and the CSS overflow
 * rules compute the other axis to `auto` too the moment one axis isn't
 * `visible`, so the lifted card would clip against the track's own edge
 * without room either side to rise into.
 */
export function FeaturedProducts({ products }: { products: Product[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  const [centeredId, setCenteredId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /* Whether the section itself is in the viewport — see the comment on the
     component for why this, and not an interaction flag, gates the pop. */
  const [inView, setInView] = useState(false);
  /* A touch tap can fire a stray `mouseover` that would stick `hoveredId` on
     whatever card was first touched and hide the border from the card the
     swipe later centres. Trusting hover only where a fine pointer genuinely
     exists keeps every touch device on the centred card. */
  const [hoverCapable, setHoverCapable] = useState(false);
  /* Autoplay stays off until an effect confirms motion is welcome, so a
     reduced-motion visitor never sees one unrequested step — matching how
     `HeroRotator` gates its rotation. */
  const [autoplay, setAutoplay] = useState(false);
  const [paused, setPaused] = useState(false);
  /* Pointer or keyboard is on the row right now. Separate from `paused`: this
     one resumes by itself when they leave, the button does not. */
  const [engaged, setEngaged] = useState(false);
  /* Whether one set of cards overflows the track, and so whether the belt is
     rendered at all. See the note on the component. */
  const [canLoop, setCanLoop] = useState(false);

  useEffect(() => {
    setHoverCapable(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAutoplay(!motion.matches);
    sync();
    motion.addEventListener("change", sync);
    return () => motion.removeEventListener("change", sync);
  }, []);

  /* A background tab still fires timers, so without this the row scrolls on
     unseen and the visitor returns to it part-way through a card. */
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const poppedId = inView ? (hoverCapable ? hoveredId ?? centeredId : centeredId) : null;

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });

    /* One set's width, whether or not it is currently doubled — so enabling
       the belt cannot change the measurement that decided to enable it. */
    const oneSet = canLoop ? el.scrollWidth / 2 : el.scrollWidth;
    setCanLoop(oneSet > el.clientWidth + 8);

    const trackMid = el.getBoundingClientRect().left + el.clientWidth / 2;
    let bestId: string | null = null;
    let bestDistance = Infinity;
    for (const card of el.querySelectorAll<HTMLElement>("[data-product-id]")) {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - trackMid);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = card.dataset.productId ?? null;
      }
    }
    setCenteredId(bestId);
  }, [canLoop]);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync, products.length]);

  /** Pages by one card, measured from the DOM so it follows the breakpoint.
   *
   *  On a belt it first pulls the scroll position back across the seam if it
   *  has drifted past one set-width — instantly, and *before* the smooth step
   *  rather than during it. The two copies are identical at that offset so the
   *  jump cannot be seen, and doing it between animations rather than inside
   *  one avoids cancelling a scroll already in flight. Paging backwards from
   *  the start does the mirror, which is what lets the arrows run the belt in
   *  reverse instead of stopping dead at zero. */
  const page = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 24 : el.clientWidth;

    if (canLoop) {
      const oneSet = el.scrollWidth / 2;
      if (direction === 1 && el.scrollLeft >= oneSet) el.scrollLeft -= oneSet;
      else if (direction === -1 && el.scrollLeft < step) el.scrollLeft += oneSet;
    }

    el.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  /* One card every 4s, wrapping to the start at the end.
     
     `page(1)` is reused rather than duplicated so the auto step and the arrow
     step are the same distance by construction. The wrap is a plain scroll to
     0: the alternative — rendering the list twice and silently resetting
     `scrollLeft` by one set-width for a seamless belt — collides with the
     centred-card logic above, which keys the pop on `data-product-id`, and a
     duplicated list means two elements answer to the same id.
     
     `running` folds in every reason to hold still: reduced motion, an
     explicit pause, a hidden tab, a pointer or keyboard on the row, the
     section being off-screen, and nothing to scroll in the first place. */
  const running =
    autoplay && !paused && !engaged && inView && (canLoop || canScroll.right);

  useEffect(() => {
    if (!running) return;
    /* No end to test for: `page` carries the seam, so every tick is the same
       single step whether or not it happens to cross it. */
    const id = window.setInterval(() => page(1), 2000);
    return () => window.clearInterval(id);
  }, [running, canLoop]);

  /** A plain mouse wheel's vertical delta pages the row; a trackpad's own
   *  horizontal delta is left alone so its native momentum keeps working. */
  const onWheel = (event: React.WheelEvent<HTMLUListElement>) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.currentTarget.scrollBy({ left: event.deltaY });
    event.preventDefault();
  };

  if (products.length === 0) return null;

  /* On a belt neither end is ever reached, so nothing is ever disabled. */
  const showArrows = canLoop || canScroll.left || canScroll.right;
  const arrowsEnabled = canLoop
    ? { left: true, right: true }
    : canScroll;

  /* The belt: one set for the eye, a second so there is always a card
     following the last. `uid` keeps the two copies distinguishable — the pop
     below keys on it, and React needs it for `key`. */
  const slots = (canLoop ? [...products, ...products] : products).map(
    (product, index) => ({ product, index, uid: `${product.id}#${index}` }),
  );

  return (
    <div ref={rootRef}>
      {/* Heading and arrows as flex siblings in one row — same idiom as
          `RecentlyViewed` — rather than the arrows stacked in their own block
          beneath the heading, which is what left a tall gap above the track. */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl leading-snug sm:text-2xl">Featured products</h2>
          <p className="mt-2 text-sm text-muted">
            A handful pulled out from the catalogue.
          </p>
        </div>

        {showArrows && (
          <div className="flex items-center gap-3">
            {/* WCAG 2.2.2: content that moves on its own for more than five
                seconds needs a way to stop it, and hovering is not one — it
                does nothing for a touch or keyboard visitor. Same control the
                hero carries, for the same reason. */}
            {autoplay && (
              <PageButton
                label={`${paused ? "Resume" : "Pause"} the featured products row`}
                disabled={false}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? (
                  <PlayIcon className="h-3.5 w-3.5" />
                ) : (
                  <PauseIcon className="h-3.5 w-3.5" />
                )}
              </PageButton>
            )}
            <PageButton
              label="Previous featured product"
              disabled={!arrowsEnabled.left}
              onClick={() => page(-1)}
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </PageButton>
            <PageButton
              label="More featured products"
              disabled={!arrowsEnabled.right}
              onClick={() => page(1)}
            >
              <ArrowRightIcon className="h-4 w-4" />
            </PageButton>
          </div>
        )}
      </div>

      {/* Hover is read from one `mouseover` on the track, not per-card
          `mouseenter`/`mouseleave`: moving between cards that way passes
          through a frame with nothing hovered, and the pop flicked back to
          the centred card for that frame. `mouseover` resolves the card under
          the pointer directly with no gap, and a move over the inter-card gap
          keeps the last card rather than clearing — only leaving the whole
          track clears. */}
      <ul
        ref={trackRef}
        onScroll={sync}
        onWheel={onWheel}
        onMouseOver={(event) => {
          const card = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-product-id]",
          );
          if (card) setHoveredId(card.dataset.productId ?? null);
        }}
        onMouseEnter={() => setEngaged(true)}
        onMouseLeave={() => {
          setHoveredId(null);
          setEngaged(false);
        }}
        /* Capture-phase, so focus landing on a card's link counts — focus
           events do not bubble. A keyboard visitor reading the row should not
           have it move under them either. */
        onFocusCapture={() => setEngaged(true)}
        onBlurCapture={() => setEngaged(false)}
        aria-label="Featured products"
        className="hscroll mt-8 flex snap-x snap-mandatory items-stretch gap-6 overflow-x-auto px-1 py-4"
      >
        {slots.map(({ product, index, uid }) => (
          <li
            key={uid}
            data-product-id={uid}
            /* The second copy is scenery, not content: a screen reader that
               met every product twice would report a list of twelve where the
               catalogue holds six.
               
               `inert`, not `aria-hidden` alone. Each card holds focusable
               things — its title link, and now an add-to-cart button — and
               `aria-hidden` hides them from assistive technology while leaving
               them in the tab order, which is the one combination ARIA
               forbids: a keyboard lands on a control a screen reader has just
               been told does not exist. `inert` takes the subtree out of both,
               and implies the hidden semantics, so it replaces rather than
               joins the old attribute. */
            inert={canLoop && index >= products.length}
            className={`relative w-[82%] flex-none snap-center sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)] ${
              poppedId === uid ? "z-10" : "z-0"
            }`}
          >
            {/* The pop transform sits on this inner layer, never on the `<li>`
                that carries the hover handlers: scaling and lifting the hover
                target itself moves its edge out from under the pointer, which
                fires `mouseleave` → `mouseenter` in a loop — the border flicked
                back to the centred card and back again, worst on the last card
                near the track edge. The `<li>` only toggles z-index (no reflow,
                no jitter); this layer pops. `transition` (not a `transform`-only
                list) because v4's `scale`/`translate` are their own properties. */}
            <div
              className={`h-full rounded-[2px] transition duration-300 ease-out ${
                poppedId === uid
                  ? "-translate-y-2.5 scale-[1.05] outline outline-2 -outline-offset-2 outline-accent shadow-card-hover"
                  : "outline outline-2 -outline-offset-2 outline-transparent"
              }`}
            >
              <ProductCard product={product} priority={index === 0} />
            </div>
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
