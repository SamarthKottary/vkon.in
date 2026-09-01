"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon } from "@/components/icons/ui";
import { PanelPlaceholder } from "./PanelPlaceholder";
import { categoryLabel } from "@/content/taxonomy";
import { QuickViewModal } from "@/components/product/QuickViewModal";
import type { Product } from "@/lib/types";

/**
 * Cross-instance registry backing the vertical card's scroll-triggered
 * Quick View reveal, below — module scope, not component state, because
 * exclusivity (client: "I only want one quick view button to be visible at
 * a time") is a question no single card's own `IntersectionObserver` can
 * answer on its own: it needs every other currently-mounted vertical
 * card's visibility to compare against, and these are unrelated sibling
 * component instances with no shared parent state today. A plain `Map`
 * keyed by element, updated by whichever card's observer just ticked,
 * survives exactly as long as the cards do — each instance registers on
 * mount and removes itself on unmount, so navigating away (this module is
 * shared by `ProductCatalogue`'s grid and `RelatedProducts`' belt, on two
 * different routes that are never mounted together) or a filter change
 * that drops a card out of the list cleans up for free.
 */
const inViewRegistry = new Map<HTMLElement, number>();
let inViewWinner: HTMLElement | null = null;

/**
 * Highest `intersectionRatio` wins the fade-in; everyone else is pinned to
 * `--iv-progress: 0`, which the wrapper's own `transition-opacity` turns
 * into a real fade-out rather than a snap. `WIN_MARGIN` is hysteresis: the
 * challenger has to clear the current winner's ratio by a real amount, not
 * just tie it, or two cards hovering near-equal ratio at a scroll crossover
 * would flip the winner back and forth every observer tick instead of
 * handing off once, cleanly.
 */
const WIN_MARGIN = 0.03;

function reconcileInView() {
  let bestEl: HTMLElement | null = null;
  let bestRatio = 0;
  for (const [el, ratio] of inViewRegistry) {
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestEl = el;
    }
  }
  const heldRatio = inViewWinner ? (inViewRegistry.get(inViewWinner) ?? 0) : 0;
  if (
    inViewWinner &&
    inViewRegistry.has(inViewWinner) &&
    bestEl !== inViewWinner &&
    bestRatio <= heldRatio + WIN_MARGIN
  ) {
    bestEl = inViewWinner;
    bestRatio = heldRatio;
  }
  inViewWinner = bestRatio > 0 ? bestEl : null;

  for (const [el, ratio] of inViewRegistry) {
    const progress = el === inViewWinner ? Math.min(ratio / 0.5, 1) : 0;
    el.style.setProperty("--iv-progress", String(progress));
  }
}

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
 * wrapping round it, the featured card the same square, full-bleed, with
 * category, name, tagline and range overlaid directly on top of it — see the
 * note on `FeaturedCard`. The strip's plate was a `w-24` portrait sliver
 * until 2026-08-19, which cropped ~35% off each side of a 1:1 photograph.
 *
 * `bg-surface-subtle` backs the plate, for the placeholder case and while an
 * image is loading.
 */
export function ProductCard({
  product,
  priority = false,
  headingLevel = "h3",
  orientation = "vertical",
  isPopped = false,
  onQuickViewOpenChange,
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
  isPopped?: boolean;
  onQuickViewOpenChange?: (isOpen: boolean) => void;
}) {
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);
  const image = product.images[0];
  const Heading = headingLevel;
  const router = useRouter();

  /* Reveals Quick View on the catalogue grid (vertical orientation) purely
     from scroll position, once a card is roughly half visible — the touch
     equivalent of the hover reveal every orientation already has, since a
     touch device has no cursor to trigger `group-hover` at all (client,
     2026-08-31: "in mobile view in all products page when i scroll down...
     i want the quick view button to appear when the card is 50% or
     something visible... same as in how we implement it in featured
     product cards. But i want the quick button to show... at the bottom
     part of the image in all products page" — same trigger as
     `FeaturedProducts`' centred-card pop, kept at its existing bottom
     position here rather than moved to the image centre, which is that
     component's own look, not this one's).

     Continuous, not a binary flip (client, later: "i want the quick view
     button to appear only on cards which are visible, they should have
     similar smooth fading animation") — `--iv-progress` ramps 0→1 as the
     card's own `intersectionRatio` goes 0%→50%, rather than snapping
     opacity on right at the 50% boundary the way a single-threshold
     observer + `entry.isIntersecting` did before. Written straight to the
     DOM on this wrapper as a CSS custom property, not React state — the
     same reason `home/FeaturedProducts` writes `--pop-progress` the same
     way: this fires on every `IntersectionObserver` tick, and routing that
     through a re-render is cost this component does not need to pay. The
     Quick View wrapper below reads it back via `var(--iv-progress,0)`,
     scoped to `[@media(hover:none)]` so a real hover-capable device is
     structurally unable to have scroll position affect anything there —
     unlike `FeaturedProducts`' `--pop-progress` (only ever written from a
     `touchstart`-started loop, so it is simply never set at all on a
     mouse-only device), a vertical page scroll happens on every device
     alike, so this needs the explicit media gate that one does not.
     Declared unconditionally here for the same reason as the gallery state
     above: only the vertical branch renders the ref this observes, but
     hooks cannot be called conditionally.

     Exclusive across every mounted card, not per-card independent
     (client, immediately after testing the fade above: "I only want one
     quick view button to be visible at a time... it dosent fade away or
     fade in it looks like its on all cards") — without coordination, any
     card past 50% visible shows its own button, and on a phone tall enough
     to fit more than one card at a time (routine on this grid's actual
     card proportions) two would sit at opacity 1 simultaneously with
     nothing to visibly animate between them, reading exactly like "always
     on." Coordinated through the module-level registry above instead:
     every card reports its own ratio in on every observer tick, `100%`
     included now, not capped at the 50% this wrapper's own opacity caps
     at — the registry needs the true ratio past that point to correctly
     judge "more visible than the current winner" between two cards that
     are each already past half visible. Only the registry's own winner
     gets a nonzero `--iv-progress`; every other registered card is pinned
     to `0`, which this wrapper's existing `transition-opacity` turns into
     a real fade-out the instant it stops winning — so scrolling past one
     card into the next reads as a single continuous handoff, the outgoing
     one fading down as the incoming one fades up, not two independent
     animations that happen to overlap. */
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    inViewRegistry.set(el, 0);
    const thresholds = Array.from({ length: 21 }, (_, i) => i / 20);
    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRegistry.set(el, entry.intersectionRatio);
        reconcileInView();
      },
      { threshold: thresholds },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      inViewRegistry.delete(el);
      if (inViewWinner === el) inViewWinner = null;
      reconcileInView();
    };
  }, []);

  /* The vertical (catalogue-grid) card's own image gallery — left/right
     arrows, swipe, and dots below the image (client, 2026-08-28: "in all
     products page lets have left and right buttons on the product cards
     as well to scroll. In mobile view i also want swipe scrolling... Lets
     have dots below the image... it should move when swipe or toggle like
     in featured product section").

     Declared here, unconditionally, rather than inside a separate
     `VerticalCard` function the way `HorizontalCard`/`FeaturedCard` already
     are — `isQuickViewOpen` just above is the same shape already: state
     this component only *uses* in one branch, called every render
     regardless of `orientation`, because the rules of hooks forbid calling
     it only for some. Matching that rather than extracting a fourth
     function keeps this one addition consistent with how the file already
     reads, not a second convention living next to the first. */
  const galleryRef = useRef<HTMLDivElement>(null);
  const gallerySettleTimer = useRef<number | null>(null);
  const galleryActiveRef = useRef(0);
  const [galleryActive, setGalleryActive] = useState(0);
  const [galleryCanScroll, setGalleryCanScroll] = useState({ left: false, right: false });

  /* Same "one slide is exactly the track's own width" idiom as
     `product/ProductMedia`, and the same settle-timer forcing exact
     alignment on top of `snap-mandatory` — see that component's own note
     for why the browser's snap alone measured short of the true boundary
     on a real swipe, and why a settle-timer fixes it without needing to
     hijack the touch gesture itself.

     A `gap-x-3` between slides, same as `ProductMedia`'s identical change
     and for the same reason (client: "the images should be separate...
     do not add borders to the image") — a thin strip of the card's own
     background between photos while dragging, not a border on either one.
     `GALLERY_GAP` is `12`, matching `gap-x-3`, and has to change if that
     class ever does; every place below that used to treat `clientWidth`
     alone as the step between slides now uses `clientWidth + GALLERY_GAP`. */
  const GALLERY_GAP = 12;

  const gallerySync = useCallback(() => {
    const el = galleryRef.current;
    if (!el || el.clientWidth === 0) return;
    const max = el.scrollWidth - el.clientWidth;
    setGalleryCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
    const active = Math.min(Math.round(el.scrollLeft / (el.clientWidth + GALLERY_GAP)), product.images.length - 1);
    galleryActiveRef.current = active;
    setGalleryActive(active);
  }, [product.images.length]);

  const onGalleryScroll = useCallback(() => {
    gallerySync();
    if (gallerySettleTimer.current !== null) window.clearTimeout(gallerySettleTimer.current);
    gallerySettleTimer.current = window.setTimeout(() => {
      const el = galleryRef.current;
      if (!el || el.clientWidth === 0) return;
      const step = el.clientWidth + GALLERY_GAP;
      const nearest = Math.round(el.scrollLeft / step);
      const target = nearest * step;
      if (Math.abs(el.scrollLeft - target) > 1) {
        el.scrollTo({ left: target, behavior: "smooth" });
      }
    }, 100);
  }, [gallerySync]);

  /* The hover-pop on this card's own `<article>` (`hover:-inset-x-2.5`,
     below) is a real layout resize, not just the `scale()` sitting next to
     it — so the track's `clientWidth` genuinely grows a few pixels while
     hovered and shrinks back on unhover. A resize mid-gallery leaves
     `scrollLeft` unchanged in absolute pixels, which is no longer an exact
     multiple of the new, different slide width once there's a non-first,
     non-last slide for it to be off from — the same partial-slide sliver
     the settle-timer above exists to prevent, just triggered by a resize
     instead of a scroll. Re-pinning to the known active slide on every
     resize tick (a plain assignment, not `scrollTo`, so it doesn't animate
     against the CSS hover transition already in motion) keeps the view
     glued to that slide throughout the pop, no separate scroll event
     required. */
  const onGalleryResize = useCallback(() => {
    gallerySync();
    /* A resize that overlaps an in-flight scroll — an arrow click first
       triggers `:hover`, so the pop's own resize events land throughout
       the same smooth `scrollTo` its click just started — must not force
       a competing instant jump here. The settle-timer above already
       re-reads a fresh `clientWidth` once that scroll genuinely stops, so
       deferring to it (a pending timer means a scroll is in flight or just
       ended) keeps the two corrections from fighting over the same pixel. */
    if (gallerySettleTimer.current !== null) return;
    const el = galleryRef.current;
    if (!el || el.clientWidth === 0) return;
    const target = galleryActiveRef.current * (el.clientWidth + GALLERY_GAP);
    if (Math.abs(el.scrollLeft - target) > 1) {
      el.scrollLeft = target;
    }
  }, [gallerySync]);

  useEffect(() => {
    if (product.images.length <= 1) return;
    gallerySync();
    const el = galleryRef.current;
    if (!el) return;
    const observer = new ResizeObserver(onGalleryResize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [gallerySync, onGalleryResize, product.images.length]);

  useEffect(
    () => () => {
      if (gallerySettleTimer.current !== null) window.clearTimeout(gallerySettleTimer.current);
    },
    [],
  );

  /* `stopPropagation` on every caller, same as the Quick View button
     already needs: this card is one stretched link end to end (the
     `Heading` link's `after:absolute after:inset-0` reaches the whole
     `<article>`, not just the image, on this orientation), so a click on
     an arrow or a dot has to stop it reaching that link and navigating
     away from what was only ever a "look at the next photo" click. A
     genuine swipe never has this problem on its own — a drag that moves
     the pointer suppresses the click a browser would otherwise fire at
     release, the same standard behaviour every native scroll-inside-a-link
     pattern already relies on. */
  const goToImage = (index: number, event?: { preventDefault: () => void; stopPropagation: () => void }) => {
    event?.preventDefault();
    event?.stopPropagation();
    const el = galleryRef.current;
    if (!el) return;
    el.scrollTo({ left: index * (el.clientWidth + GALLERY_GAP), behavior: "smooth" });
  };

  if (orientation === "horizontal") {
    return <HorizontalCard product={product} priority={priority} Heading={Heading} isPopped={isPopped} />;
  }

  if (orientation === "featured") {
    return <FeaturedCard product={product} priority={priority} Heading={Heading} isPopped={isPopped || false} onQuickViewOpenChange={onQuickViewOpenChange} />;
  }

  return (
    <div ref={cardRef} className="relative h-full w-full">
      <article data-popped={isPopped || undefined} className="group absolute inset-x-0 top-1/2 z-10 flex h-full min-h-full -translate-y-1/2 flex-col border border-line bg-surface-raised shadow-card transition-all duration-300 hover:z-20 hover:h-fit hover:-inset-x-2.5 hover:scale-[1.04] hover:-translate-y-[calc(50%+6px)] hover:border-accent hover:shadow-card-hover data-[popped=true]:z-20 data-[popped=true]:h-fit data-[popped=true]:-inset-x-2.5 data-[popped=true]:scale-[1.04] data-[popped=true]:-translate-y-[calc(50%+6px)] data-[popped=true]:border-accent data-[popped=true]:shadow-card-hover">
      {/* `z-20` here, not only on the arrows/Quick View button nested
          inside it — found missing the same way as the dot row's own fix
          below: a real swipe on the image itself, not just an arrow
          click, was silently swallowed by the title `Link`'s
          `after:absolute after:inset-0`. That pseudo-element has no
          explicit z-index of its own, so it stacks by DOM order among
          other unelevated elements — and this wrapper sits *earlier* in
          the article than the text block the link lives in, which is
          exactly the ordering that let the link win. Elevating the whole
          image wrapper once here covers the track inside it along with
          everything already elevated individually (arrows, Quick View),
          rather than needing the same fix repeated on each.

          That same elevation, though, puts this wrapper above the title
          `Link`'s own stretched hit area at every point over the image, so
          a plain tap here — anywhere the arrows/dots/Quick View above don't
          already `stopPropagation` it first — now has nothing under it to
          navigate. `onClick` below stands in for the link at exactly the
          points those controls leave alone; a real swipe never reaches it,
          for the same reason `goToImage`'s own comment gives: a drag that
          moves the pointer suppresses the click a browser would otherwise
          fire at release. */}
      <div
        className="relative z-20 aspect-square overflow-hidden border-b border-line bg-surface-subtle"
        onClick={() => router.push(`/products/${product.slug}`)}
      >
        {image ? (
          product.images.length > 1 ? (
            <div
              ref={galleryRef}
              onScroll={onGalleryScroll}
              aria-label={`${product.name} photos`}
              className="hscroll flex h-full snap-x snap-mandatory gap-x-3 overflow-x-auto scroll-pl-0"
            >
              {product.images.map((img, index) => (
                <div key={index} className="relative h-full w-full flex-none snap-start">
                  <Image
                    src={img.url}
                    alt={img.alt || product.name}
                    fill
                    sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 92vw"
                    /* Only the card's opening image loads eagerly — every
                       other one is a sibling in the same scrollable row,
                       and `priority` on all of them would preload every
                       photo on a card most visitors never swipe past the
                       first image of. */
                    priority={priority && index === 0}
                    className="object-cover transition-transform duration-300 ease-out md:group-hover:scale-[1.06]"
                  />
                </div>
              ))}
            </div>
          ) : (
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
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <PanelPlaceholder className="h-20 w-20" />
          </div>
        )}

        {/* Left/right arrows over the image — always visible, not a
            hover-reveal like Quick View below: a touch device has no
            hover state at all, and the client asked for these to work on
            mobile specifically, alongside the swipe rather than instead
            of it. Same bare-chevron, theme-invariant styling as
            `product/ProductMedia`'s own arrows, for one consistent look
            everywhere a product's photos are paged through. */}
        {product.images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => goToImage(galleryActive - 1, e)}
              disabled={!galleryCanScroll.left}
              aria-label={`Previous photo of ${product.name}`}
              className="absolute left-2 top-1/2 z-20 flex h-8 w-8 [transform:translateY(-50%)] items-center justify-center rounded-full border border-[#dde1e5] bg-[#ffffff] text-[#14171a] shadow-card transition-colors hover:border-[#14171a] disabled:cursor-default disabled:opacity-40"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => goToImage(galleryActive + 1, e)}
              disabled={!galleryCanScroll.right}
              aria-label={`Next photo of ${product.name}`}
              className="absolute right-2 top-1/2 z-20 flex h-8 w-8 [transform:translateY(-50%)] items-center justify-center rounded-full border border-[#dde1e5] bg-[#ffffff] text-[#14171a] shadow-card transition-colors hover:border-[#14171a] disabled:cursor-default disabled:opacity-40"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Dots on the image itself, not a row underneath it (client: "The
            dots should not be seperate row but on the image itself at the
            bottom") — same per-photo indicator as before, reimplemented
            as an overlay instead of a block-level row. `home/FeaturedProducts`'
            own dot row was the visual reference for the dot shape only; that
            component's dots sit below a whole carousel of cards, a
            different piece of UI, not something to import a dependency on
            here. Reads `galleryActive`, the same state the arrows and the
            swipe both already drive, so a swipe moves these exactly as a
            toggle click does.

            The outer strip spans the image's full width (so it stays
            centred regardless of dot count) but is `pointer-events-none` —
            only the pill inside it, sized to its own content, takes clicks.
            Without that split, the empty space either side of the pill
            would sit on top of the swipeable track (this row already needs
            its own `z-20` for the same stretched-link reason as the arrows
            above) and silently block a swipe or tap started there.

            No pill behind them (client: "I only want dots no boundary on
            them, also make it smaller and let it have green") — each
            button is its own `pointer-events-auto` island directly on the
            strip instead of one shared content box, so there's no
            background shape left to draw. A plain green dot alone can
            still vanish against this shop's mostly-light studio photos, so
            each one keeps a fine `shadow` (a soft dark edge, not a visible
            box) for legibility instead of a background — the same
            "must read on any photo" reasoning as the arrows and the
            previous pill, just without a boundary this time. Colour is
            still the hardcoded light-mode accent green, not the `bg-accent`
            token, for the same reason as the arrows: this sits on a photo
            unrelated to the site's own light/dark theme, and the token
            resolves to a different, lighter green in dark mode that has no
            connection to what's under it here. */}
        {product.images.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex items-center justify-center gap-1">
            {product.images.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={(e) => goToImage(index, e)}
                aria-label={`Show photo ${index + 1} of ${product.name}`}
                aria-current={index === galleryActive}
                className="pointer-events-auto flex h-4 w-3 items-center justify-center"
              >
                <span
                  className={`block h-1 rounded-full shadow-[0_0_1px_rgba(0,0,0,0.6)] transition-all duration-300 ${
                    index === galleryActive ? "w-3 bg-[#23703d]" : "w-1 bg-[#23703d]/45 hover:bg-[#23703d]/70"
                  }`}
                />
              </button>
            ))}
          </div>
        )}

        {/* Quick View Button — raised to `bottom-10` only when the dots
            pill above is actually rendered (multi-photo cards), to clear
            it now that both can be on screen at once (dots always, this on
            hover); at a shared fixed position the two would overlap
            whenever a visitor hovered a multi-photo card. Single-photo
            cards have no dots to clear, so this stays at its original
            `bottom-4`.

            `[@media(hover:none)]:[opacity:var(--iv-progress,0)]` is the
            scroll-triggered reveal above — additive to hover, not a
            replacement for it, and deliberately left at this same bottom
            position rather than moved to the image centre the way
            `FeaturedCard`'s own version reveals (client: "the quick button
            to show as it shows in all products at the bottom part of the
            image in all products page and at the centre in featured
            product cards section"). Base `opacity-0` still covers the
            plain hover-only case: the media-scoped rule does not apply at
            all on a real hover-capable device, so there is nothing there to
            override it outside of an actual `:hover`.

            Duration is split by the same media feature (client, after
            confirming the exclusive handoff above: "make the fading away
            and in slower") — `600ms` on touch, where this is the
            fade-away/fade-in this request is about, `300ms` unchanged on
            hover, which nobody asked to slow down and which this split
            leaves alone. */}
        <div
          className={`absolute left-1/2 z-20 -translate-x-1/2 opacity-0 [@media(hover:none)]:[opacity:var(--iv-progress,0)] transition-opacity [@media(hover:hover)]:duration-300 [@media(hover:none)]:duration-[600ms] group-hover:opacity-100 group-data-[popped=true]:opacity-100 ${
            product.images.length > 1 ? "bottom-10" : "bottom-4"
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsQuickViewOpen(true);
              if (onQuickViewOpenChange) onQuickViewOpenChange(true);
            }}
            className="whitespace-nowrap rounded-full bg-surface/90 px-4 py-1.5 text-sm font-medium text-ink shadow-sm backdrop-blur-sm transition-colors hover:bg-surface"
          >
            Quick view
          </button>
        </div>

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

        {product.price != null && (
          <p className="mt-1 text-lg font-semibold text-ink">
            ₹ {product.price.toLocaleString("en-IN")}
          </p>
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
            `relative z-10` to sit above the stretched link's overlay.

            Both controls now get `FeaturedCard`'s footer treatment (client,
            2026-08-27: "same animation in view details and add button in
            all products page, same as ... featured product cards"). The
            underline keys off the plain, unnamed `group-hover:` already
            colouring "View details" — no named group like `FeaturedCard`'s
            `group/details` is needed, because this card's whole surface is
            already the one hover target `AddToCartButton` alone breaks out
            of, unlike `FeaturedCard`, whose stretched link stops at the
            image and leaves this row as a second, independent hover
            target. `[transform:translateX(0.25rem)]`, not `translate-x-1`
            — this line was already being rewritten for the sweep, so this
            is where that Tailwind gap (on record elsewhere, including
            `FeaturedCard`'s own copy of this same arrow before its 2026-08-26
            fix) gets fixed here too, rather than left as a second
            unfixed instance next to an already-fixed one. */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-6">
          <span className="relative flex items-center gap-2 text-sm font-medium text-ink transition-colors group-hover:text-accent">
            <span className="relative">
              View details
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-0.5 h-px origin-left bg-accent [transform:scaleX(0)] transition-transform duration-200 ease-out group-hover:[transform:scaleX(1)]"
              />
            </span>
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-150 group-hover:[transform:translateX(0.25rem)]" />
          </span>
          <div className="transition-transform duration-200 ease-out [transform:scale(1)] hover:[transform:scale(1.08)]">
            <AddToCartButton slug={product.slug} name={product.name} size="compact" />
          </div>
        </div>
      </div>

    </article>

    {/* INVISIBLE CLONE */}
    <div className="invisible flex h-full flex-col pointer-events-none aria-hidden" aria-hidden="true">
      <div className="aspect-square" />
      <div className="flex flex-1 flex-col p-5">
        <p className="label-tech">{categoryLabel(product.category)}</p>
        <Heading className="mt-2.5 text-lg leading-snug">{product.name}</Heading>
        <div className="mt-auto pt-6"><div className="h-9" /></div>
      </div>
    </div>

    {isQuickViewOpen && (
      <QuickViewModal product={product} onClose={() => {
        setIsQuickViewOpen(false);
        if (onQuickViewOpenChange) onQuickViewOpenChange(false);
      }} />
    )}
  </div>
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
  isPopped,
}: {
  product: Product;
  priority: boolean;
  Heading: "h3" | "h4";
  isPopped?: boolean;
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

      {product.price != null && (
        <p className="mt-1 text-sm font-semibold text-ink">
          ₹ {product.price.toLocaleString("en-IN")}
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
      {/* `transition-transform duration-200 ease-out [transform:scale(1)]
          hover:[transform:scale(1.08)]` matches `home/FeaturedProducts`'
          own add-to-cart wrapper exactly (client, 2026-08-27: "add to cart
          button have the same animation as in add button in featured
          product cards") — same reasoning as that one: `AddToCartButton`
          itself is shared across every card on the site, so wrapping it in
          a plain `<div>` that scales on its own hover, rather than editing
          the button, keeps every other card's instance exactly as it was. */}
      <div className="absolute bottom-3 right-4 transition-transform duration-200 ease-out [transform:scale(1)] hover:[transform:scale(1.08)]">
          <AddToCartButton slug={product.slug} name={product.name} size="compact" />
      </div>
    </article>
  );
}

/**
 * Featured card: the product photograph, full-bleed and edge to edge, with
 * category, name, tagline and range overlaid directly on it (client,
 * 2026-08-25 — "there should only be the product image and no other space
 * top and bottom for text… like in hero slideshow on top or subscriber
 * section where behind text there is dark tint"). Only those four fields
 * live on the photograph; "View details" and Add-to-cart sit in their own
 * flat row below the image (client, next day — "lets have the view details
 * and add button down below the image, in a separate row"), which is why
 * the card is no longer `aspect-square` end to end: the image is, the card
 * itself is that square plus a footer row's worth of extra height.
 *
 * **One `aspect-square` image, `fill` + `object-cover`, sized to just the
 * image sub-box, not the whole card.** The component doc above holds
 * without exception: this site's photography is shot 1:1 so a square plate
 * never crops it.
 *
 * **Text on the image sits on `band-*` tokens** — the white-on-dark pairing
 * `home/Hero` and `layout/SubscribePanel` already use for text over a
 * photograph. **The footer row below does not** (client, 2026-08-26) — it
 * has its own light, frosted `bg-surface-raised` surface now, independent of
 * the card's own `bg-band`, so it takes the site's ordinary `ink`/`accent`
 * pair instead. The image and the footer are now two different surfaces
 * wearing two different token families, on purpose.
 *
 * **The scrim follows `home/HeroRotator` and `layout/SubscribePanel`'s plain
 * two-stop idiom, but shaped as a vignette, not a content-covering band**
 * (client, 2026-08-26 — see that day's changelog entry for the exact
 * numbers). Every earlier pass on this card held flat at peak through the
 * measured text; this one holds only through the outer 10% of a
 * deliberately shortened band and fades the rest of the way to transparent,
 * trading guaranteed text coverage for more visible photograph. Re-measure
 * contrast if the content, the spacing or these numbers change enough to
 * matter — it was already below AA against the current placeholder
 * photography before this pass, and this pass does not improve that.
 *
 * **A single `inset-0` content wrapper, scoped to the image sub-box, holds
 * both on-image text blocks — not two separately-positioned ones**, for the
 * stretched-link reason on record in the 2026-08-25 changelog entry: `flex
 * flex-col justify-between` pushes the top block up and the bottom block
 * down without either needing its own `absolute top-0`/`bottom-0`, which
 * would otherwise become the nearest positioned ancestor for the name
 * `Link`'s `after:absolute after:inset-0` and shrink the stretched link
 * down to whichever block holds it.
 *
 * **The stretched link now only spans the image**, not the footer row below
 * it — a direct consequence of the row living outside the image sub-box
 * that link climbs to. "View details" is a real, second `Link` to the same
 * destination rather than the decorative span it was before, because the
 * footer is no longer inside the stretched link's reach and needs its own
 * way to navigate; `AddToCartButton`'s own `relative z-10` continues to be
 * what keeps it clickable, unrelated to any of this.
 *
 * **No image, no overlay.** A product with no photograph has nothing to lay
 * text over, so this falls back to the plain card's flat treatment.
 */
function FeaturedCard({
  product,
  priority,
  Heading,
  isPopped,
  onQuickViewOpenChange,
}: {
  product: Product;
  priority: boolean;
  Heading: "h3" | "h4";
  isPopped: boolean;
  onQuickViewOpenChange?: (isOpen: boolean) => void;
}) {
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);
  const image = product.images[0];


  if (!image) {
    return (
      <div className="relative h-full w-full">
      <article data-popped={isPopped || undefined} className="group absolute inset-x-0 top-1/2 z-10 flex h-full min-h-full -translate-y-1/2 flex-col border border-line bg-surface-raised shadow-card transition-all duration-300 hover:z-20 hover:h-fit hover:-inset-x-3 hover:-translate-y-[calc(50%+6px)] hover:border-accent hover:shadow-card-hover data-[popped=true]:z-20 data-[popped=true]:h-fit data-[popped=true]:-inset-x-3 data-[popped=true]:-translate-y-[calc(50%+6px)] data-[popped=true]:border-accent data-[popped=true]:shadow-card-hover">
        <div className="relative flex aspect-square items-center justify-center overflow-hidden border-b border-line bg-surface-subtle">
          <PanelPlaceholder className="h-20 w-20" />
          
          <div
            data-quickview-wrapper
            data-featured-quickview
            /* Opacity has two independent drivers, deliberately not
               reconciled into one — a pointer device (`group-hover`) and a
               touch one (`--pop-progress`, written by `FeaturedProducts`'
               own `dragLoop`, continuous rather than a flip — see that
               function's own note for why it is a dedicated
               `requestAnimationFrame` loop tied to the touch gesture
               itself now, not something driven off `scroll` events the
               way the first two passes at this both were).
               `group-data-[popped=true]` — the discrete pop this card's
               own border/scale/lift below still use, unchanged — was here
               too until it turned out to fight the continuous value:
               `data-popped` only flips at the exact crossed-over instant,
               so it pinned the *outgoing* card's Quick View at a flat `1`
               for almost the entire drag instead of letting
               `--pop-progress` fade it down, then jumped the incoming card
               straight to `1` rather than letting it rise smoothly —
               confirmed directly, sampling opacity through a slow drag
               showed the outgoing card sitting at `1.00` unmoving until
               the very last step. Removed here; still exactly what drives
               the article's own pop.

               `[@media(hover:hover)]:transition-opacity duration-300` for
               a pointer only, not applied on touch at all any more — a
               real CSS transition chases whatever value it is last given,
               and a value updating every animation frame needs no
               transition to look smooth (each frame is already close to
               the last one); adding one would only add lag on top of an
               already-continuous signal. A short touch-only transition was
               tried here for one pass specifically because the previous
               driver (`measure()`, on `scroll`) could not guarantee a
               per-frame update on real mobile hardware and the transition
               was papering over that gap — no longer needed once the
               driver itself became genuinely per-frame. Scoping the
               remaining transition to devices that actually have `:hover`
               keeps the smooth fade for a pointer's hover exactly as
               before.

               `data-featured-quickview` — a second marker, alongside
               `data-quickview-wrapper` on the same element — is a
               teammate's addition (2026-09-01, pulled in the same day):
               `FeaturedProducts`' own `isOverFooter` now also matches this
               attribute, so hovering Quick View pauses autoplay the same
               way hovering the footer row already did (client: "when i
               point the mouse on the quick view its should not scroll to
               right automatically"). Independent of everything else on
               this element — it is a plain hit-test marker, unrelated to
               which opacity mechanism is driving the button underneath
               it.

               `bottom-[10%] left-1/2 -translate-x-1/2`, not centred
               (client, 2026-09-01: "place quick view in the feature card
               25% above from the bottom of the image", then "make 15%
               from bottom", then "i changed to 10%") — replaces the
               previous `top-1/2 -translate-y-1/2` dead-centre position;
               horizontal centring is untouched. */
            className="absolute bottom-[10%] left-1/2 z-20 -translate-x-1/2 [opacity:var(--pop-progress,0)] [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:duration-300 group-hover:opacity-100"
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsQuickViewOpen(true);
                if (onQuickViewOpenChange) onQuickViewOpenChange(true);
              }}
              className="whitespace-nowrap rounded-full bg-surface/90 px-4 py-1.5 text-sm font-medium text-ink shadow-sm backdrop-blur-sm transition-colors hover:bg-surface"
            >
              Quick view
            </button>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <p className="label-tech text-muted">{categoryLabel(product.category)}</p>
          <Heading className="mt-2.5 text-lg leading-snug">
            <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0">
              {product.name}
            </Link>
          </Heading>
          {product.tagline && (
            <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-300 group-hover:grid-rows-[1fr] group-hover:opacity-100 group-hover:mt-2">
              <p className="overflow-hidden text-sm leading-relaxed text-muted">
                {product.tagline}
              </p>
            </div>
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

      {/* INVISIBLE CLONE */}
      <div className="invisible flex h-full flex-col pointer-events-none aria-hidden" aria-hidden="true">
        <div className="aspect-square" />
        <div className="flex flex-1 flex-col p-5">
          <p className="label-tech">{categoryLabel(product.category)}</p>
          <Heading className="mt-2.5 text-lg leading-snug">{product.name}</Heading>
          <div className="mt-auto pt-6"><div className="h-9" /></div>
        </div>
      </div>

      {isQuickViewOpen && (
        <QuickViewModal product={product} onClose={() => {
          setIsQuickViewOpen(false);
          if (onQuickViewOpenChange) onQuickViewOpenChange(false);
        }} />
      )}
    </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <article data-popped={isPopped || undefined} className="group absolute inset-x-0 top-1/2 z-10 flex h-full min-h-full -translate-y-1/2 flex-col overflow-hidden border border-line bg-band shadow-card transition-all duration-300 hover:z-20 hover:h-fit hover:-inset-x-3 hover:-translate-y-[calc(50%+6px)] hover:border-accent hover:shadow-card-hover data-[popped=true]:z-20 data-[popped=true]:h-fit data-[popped=true]:-inset-x-3 data-[popped=true]:-translate-y-[calc(50%+6px)] data-[popped=true]:border-accent data-[popped=true]:shadow-card-hover">
      <div className="relative isolate aspect-square w-full shrink-0 overflow-hidden">
        <Image
          src={image.url}
          alt={image.alt || product.name}
          fill
          sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 92vw"
          priority={priority}
          /* `[transform:scale(1.06)]`, not `scale-[1.06]` — see the
             2026-08-25 changelog entry: the bracket-value form of `scale-*`
             silently fails to compile under this stacked `md:group-hover:`
             variant in this Tailwind version, same category of gap as
             `-translate-y-*` and `scale-x-*` elsewhere in this file and in
             `ui/Button`. */
          className="object-cover transition-transform duration-300 ease-out md:group-hover:[transform:scale(1.06)]"
        />

        <div
          data-quickview-wrapper
          data-featured-quickview
          /* Opacity has two independent drivers, deliberately not
             reconciled into one — a pointer device (`group-hover`) and a
             touch one (`--pop-progress`, written by `FeaturedProducts`'
             own `dragLoop`, continuous rather than a flip — see that
             function's own note for why it is a dedicated
             `requestAnimationFrame` loop tied to the touch gesture itself
             now, not something driven off `scroll` events the way the
             first two passes at this both were). `group-data-[popped=true]`
             — the discrete pop this card's own border/scale/lift below
             still use, unchanged — was here too until it turned out to
             fight the continuous value: `data-popped` only flips at the
             exact crossed-over instant, so it pinned the *outgoing* card's
             Quick View at a flat `1` for almost the entire drag instead of
             letting `--pop-progress` fade it down, then jumped the
             incoming card straight to `1` rather than letting it rise
             smoothly — confirmed directly, sampling opacity through a slow
             drag showed the outgoing card sitting at `1.00` unmoving until
             the very last step. Removed here; still exactly what drives
             the article's own pop.

             `[@media(hover:hover)]:transition-opacity duration-300` for a
             pointer only, not applied on touch at all any more — a real
             CSS transition chases whatever value it is last given, and a
             value updating every animation frame needs no transition to
             look smooth (each frame is already close to the last one);
             adding one would only add lag on top of an already-continuous
             signal. A short touch-only transition was tried here for one
             pass specifically because the previous driver (`measure()`,
             on `scroll`) could not guarantee a per-frame update on real
             mobile hardware and the transition was papering over that gap
             — no longer needed once the driver itself became genuinely
             per-frame. Scoping the remaining transition to devices that
             actually have `:hover` keeps the smooth fade for a pointer's
             hover exactly as before.

             `data-featured-quickview` — a teammate's addition, pulled in
             the same day: `FeaturedProducts`' own `isOverFooter` now also
             matches this attribute, so hovering Quick View pauses autoplay
             the same way hovering the footer row already did (client:
             "when i point the mouse on the quick view its should not
             scroll to right automatically"). A plain hit-test marker,
             independent of which opacity mechanism drives the button
             underneath it.

             `bottom-[10%] left-1/2 -translate-x-1/2`, not centred (client,
             2026-09-01: "place quick view in the feature card 25% above
             from the bottom of the image", then "make 15% from bottom",
             then "i changed to 10%") — replaces the previous `top-1/2
             -translate-y-1/2` dead-centre position; horizontal centring is
             untouched. Kept in sync with the no-image branch above, which
             the client's own edit changed directly in this file. */
          className="absolute bottom-[10%] left-1/2 z-20 -translate-x-1/2 [opacity:var(--pop-progress,0)] [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:duration-300 group-hover:opacity-100"
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsQuickViewOpen(true);
              if (onQuickViewOpenChange) onQuickViewOpenChange(true);
            }}
            className="whitespace-nowrap rounded-full bg-surface/90 px-4 py-1.5 text-sm font-medium text-ink shadow-sm backdrop-blur-sm transition-colors hover:bg-surface"
          >
            Quick view
          </button>
        </div>

        {/* Top and bottom scrims — reshaped into a vignette, not a
            content-covering band (client, 2026-08-26: "reduce the dark tint
            length from top and bottom corner towards the center by 40%...
            the top and bottom most corner like 10% length should be darker
            by 30% and gradually fade towards the centre"). This is a
            deliberate departure from every earlier pass on this card, which
            held flat at peak through the measured text — the client is
            trading that guaranteed coverage for more visible photograph,
            compensating on the text side instead (bright white and accent
            -green below, not a bigger dark patch behind it).

            Length cut 40%: 85px→51px top, 100px→60px bottom. Peak raised
            30% off the previous pass's 47% (→61%, rounded to 60%) and held
            only through the outer 10% of that shorter band, easing straight
            to transparent for the remaining 90% — so most of both bands is
            actually a fade, not a hold, and text sitting past the first 10%
            (nearly all of it) reads against a partial tint at best.

            **Lengthened again by 20%** (client, 2026-08-26, next request —
            the second line of the heading was reading close to invisible
            against this placeholder's white background, flagged in the
            previous entry) — 51px→61px top, 60px→72px bottom. The 10% hold
            stays a percentage of the band, so it grows in step (≈6.1px top,
            ≈7.2px bottom); this extends how far the fade reaches toward the
            centre rather than changing its shape. Helps, does not fully fix
            — the underlying problem named in the previous entry (a fixed
            fraction of the band, not a hold sized to the actual text, so
            content further into the fade still reads against less cover the
            further in it sits) is structural, not a sizing error, and a 20%
            length increase alone does not resolve it.

            **Lengthened another 20% on top of that** (client, same request
            repeated) — 61px→73px top, 72px→86px bottom. Same caveat carries
            forward unchanged: still a fixed-fraction hold on a longer band,
            not a hold sized to the text, so this keeps helping by degrees
            without closing the gap the structural fix would.

            **Bottom lengthened another 20% on its own, top untouched**
            (client, 2026-08-27: "increase the dark tint length on the
            bottom part of the image by 20% more... only increase tint
            length of bottom part") — 86px→103px (86 × 1.2 = 103.2,
            rounded). Top stays 73px; the two bands no longer move
            together, which they always could in principle — nothing tied
            them — this is just the first time only one of them changed. */}
        {/* **TEST — client, 2026-08-28: "instead of black tint lets have
            white tint and lets have the name, tagline and range written in
            black instead... just for checking if it looks good, be ready
            to revert if i think its not good."** Scoped to literal colours
            (`#ffffff` here, `#14171a` — light mode's own `--color-ink` —
            on the text below) rather than new tokens in `globals.css`,
            specifically so this whole experiment is one file and reverts
            with a single `git checkout` if it doesn't hold up. Not
            `var(--color-scrim)` inverted, and not `text-ink` for the
            text either: `--color-ink` flips to near-white in dark mode,
            which would undo the "black text" half of this the moment
            dark mode was on — the point of the `band-*` family this is
            standing in for is to be theme-invariant, since the photograph
            behind it does not change with the site's theme, and this
            test needs the same property. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[73px]"
          style={{
            backgroundImage: `linear-gradient(to bottom,
              color-mix(in srgb, #ffffff 60%, transparent) 0%,
              color-mix(in srgb, #ffffff 60%, transparent) 10%,
              transparent 100%)`,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[103px]"
          style={{
            backgroundImage: `linear-gradient(to top,
              color-mix(in srgb, #ffffff 60%, transparent) 0%,
              color-mix(in srgb, #ffffff 60%, transparent) 10%,
              transparent 100%)`,
          }}
        />

        {/* One wrapper, the whole image — see the component note on why the
            stretched link needs this rather than two separately-positioned
            top/bottom blocks. */}
        <div className="absolute inset-0 flex flex-col justify-between p-3">
          <div>
            {/* `band-accent-strong`, not `band-accent` — same reasoning as
               `home/HeroRotator`'s eyebrow: 11px over a photograph needs the
               brighter of the two greens (client, 2026-08-26: "make sub
               category name in matching green"). Left green through the
               white-tint test below — the client's request named "the
               name, tagline and range", not the category label, so this
               one is untouched; worth a look in the test screenshot, since
               a green tuned bright *for a dark background* may not read
               as cleanly against the new white one. */}
            <p className="label-tech text-band-accent-strong">{categoryLabel(product.category)}</p>
            {/* `text-[#14171a]` (light mode's own `--color-ink`), not
               `text-band-ink` — see the test note on the scrim above for
               why literal, theme-invariant colours rather than new
               tokens. */}
            <Heading className="mt-1 text-base leading-snug text-[#14171a]">
              {/* Stretched link — the image is the target, one tab stop.
                  Scoped to the image sub-box now, not the whole card; see
                  the component note. */}
              <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0">
                {product.name}
              </Link>
            </Heading>

            {product.price != null && (
              <p className="mt-1 text-base font-semibold text-[#14171a]">
                ₹ {product.price.toLocaleString("en-IN")}
              </p>
            )}
          </div>

          <div>
            {product.tagline && (
              <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-300 group-hover:grid-rows-[1fr] group-hover:opacity-100 group-hover:mt-1.5">
                <p className="overflow-hidden line-clamp-2 text-[0.8125rem] leading-relaxed text-[#14171a]">
                  {product.tagline}
                </p>
              </div>
            )}

            {product.hpRanges.length > 0 && (
              <dl className="mt-1.5 flex gap-2 text-[0.8125rem]">
                <dt className="label-tech pt-0.5 text-[#14171a]">Range</dt>
                <dd className="font-mono text-[0.75rem] text-[#14171a]">
                  {product.hpRanges.join(" · ")}
                </dd>
              </dl>
            )}
          </div>
        </div>

        {product.videoUrl && (
          <span
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center bg-action text-action-ink"
            title="Includes a video"
          >
            <PlayIcon className="h-3.5 w-3.5" />
            <span className="sr-only">Includes a video</span>
          </span>
        )}


      </div>

      {/* Footer row, below the image, flat — not overlaid on the photograph.
          Shortened (`p-3`, not `p-4`) and given its own light, frosted
          surface rather than inheriting the card's dark `bg-band` (client,
          2026-08-26: "I dont want black in the row in light mode... blur the
          background and change colour to something that matches the web
          page"). `bg-surface-raised` is already theme-aware — white in light
          mode, the same near-black the row already was in dark mode — so
          this needed no separate dark-mode override to satisfy "not black in
          light mode" specifically: dark mode keeps looking the way it did.
          `/90` plus `backdrop-blur-sm` is what makes it a frosted panel
          rather than a flat opaque one, matching the "blur the background"
          ask, even though nothing but the image sits behind it — the panel
          reads as glass regardless of what (if anything) shows through.

          `ink`/`accent`, not `band-ink`/`band-accent`: this row is a light
          surface now, not a photograph, so it takes the site's normal
          light-surface pair. Briefly green by default (client, 2026-08-25:
          "change the view details button to matching green as well"), then
          corrected back to neutral-until-hovered the next day (client,
          2026-08-26: "the view details button should be black in light mode
          and white in dark mode only when i bring cursor over it" — `ink` is
          exactly that pairing) — the same convention every other card's
          "View details" already follows, `text-ink` resting,
          `hover:text-accent` on interaction.

          **Both controls got a livelier hover (client, 2026-08-26: "make the
          animation of the view details and add button better")**, each
          scoped to just this footer rather than touching the shared
          components underneath:

          "View details" gains an underline that sweeps in from the left —
          the same idiom as `ui/Button`'s `sweep` prop, scaled down to a
          1px rule instead of a fill. `[transform:scaleX(0)]`, not
          `scale-x-0`: that named utility is one of the ones already on
          record as silently absent from this Tailwind version (see
          `ui/Button`'s `sweepClasses`), so this uses the same
          arbitrary-property workaround rather than risking the same silent
          no-op in new code.

          `AddToCartButton` itself is shared across every card on the site,
          so its own hover stays exactly as it was — this wraps *only this
          instance* in a plain `<div>` that scales up on hover instead,
          which cannot affect the button anywhere else it's used. The wrapper
          adds no `position`/`z-index` of its own, so the button's existing
          `relative z-10` (needed generically, though this particular footer
          has nothing left for it to escape now that the stretched link is
          scoped to the image above) keeps working exactly as it did.

          The hover effects themselves are plain CSS `:hover`/`group-hover`
          and depend on nothing outside this file.

          **`data-featured-footer` is a cross-component contract, not
          decoration.** `home/FeaturedProducts` geometrically scans for this
          exact attribute on every pointer move and skips its autoplay tick
          while the cursor is inside it (client, 2026-08-26: "only the view
          details and add button row should be able to pause when the cursor
          hovers"). Renaming or removing it here silently disables that, with
          no type error to catch it — the belt simply stops pausing.

          It marks this row and nothing else: not the image above, not the
          card as a whole. An earlier attempt at the same idea marked the two
          controls individually instead; this is the wider of the two scopes
          the client has asked for, chosen deliberately — see the note on
          `home/FeaturedProducts` for the trade-off that comes with the extra
          width, and for why the *timing* problem that sank the first attempt
          is solved differently now. */}
      <div
        data-featured-footer
        className="mt-auto flex items-center justify-between gap-3 bg-surface-raised/90 p-3 backdrop-blur-sm"
      >
        <Link
          href={`/products/${product.slug}`}
          /* `shrink-0 whitespace-nowrap` (client, 2026-08-27: "the view
             details button is in 2 lines... I want it to be in one line" —
             happening "sometimes", not always, is the tell). This row's
             other child, `AddToCartButton`, already carries both classes
             itself and explains why in its own doc comment: once a product
             is already in the cart it swaps for the wider `QuantityStepper`,
             and a flex child with no `shrink-0` of its own absorbs 100% of
             the resulting squeeze — which is exactly this Link, exactly
             when the row runs out of room, exactly the "sometimes" the
             client saw. `shrink-0` stops it giving up width at all;
             `whitespace-nowrap` stops the text wrapping even if it
             somehow still did. */
          className="group/details relative flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-ink transition-colors hover:text-accent"
        >
          <span className="relative">
            View details
            <span
              aria-hidden
              className="absolute inset-x-0 -bottom-0.5 h-px origin-left bg-accent [transform:scaleX(0)] transition-transform duration-200 ease-out group-hover/details:[transform:scaleX(1)]"
            />
          </span>
          <ArrowRightIcon className="h-4 w-4 transition-transform duration-150 group-hover/details:translate-x-1" />
        </Link>
        <div className="transition-transform duration-200 ease-out [transform:scale(1)] hover:[transform:scale(1.08)]">
          <AddToCartButton slug={product.slug} name={product.name} size="compact" />
        </div>
      </div>

    </article>

    {/* INVISIBLE CLONE */}
    <div className="invisible flex h-full flex-col pointer-events-none aria-hidden" aria-hidden="true">
      <div className="aspect-square w-full" />
      <div className="p-3"><div className="h-9" /></div>
    </div>

    {isQuickViewOpen && (
      <QuickViewModal product={product} onClose={() => {
        setIsQuickViewOpen(false);
        if (onQuickViewOpenChange) onQuickViewOpenChange(false);
      }} />
    )}
  </div>
  );
}
