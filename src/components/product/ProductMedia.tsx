"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from "@/components/icons/ui";
import { PanelPlaceholder } from "./PanelPlaceholder";
import { parseVideoUrl } from "@/lib/video";
import type { ProductImage } from "@/lib/types";

type MediaItem =
  | { kind: "image"; image: ProductImage }
  | { kind: "video"; url: string; title: string | null };

/**
 * Product media viewer — images and an optional video in one filmstrip.
 *
 * The video is represented by a poster plate with a play control; the provider
 * iframe is only injected after a click. Nothing is requested from YouTube or
 * Vimeo on page load, which keeps both the page weight and the third-party
 * cookies at zero for visitors who never press play.
 *
 * **Left/right arrows, and swipe on the main image, not just the thumbnail
 * strip below it** (client, 2026-08-28: "I want a left and right toggle
 * button to move to the next image or previous... in mobile view i want a
 * scroll button and be able to swipe to the next or previous image"). This
 * is the one component both the product page and `QuickViewModal` render
 * for their gallery, so the fix lives here once rather than twice.
 *
 * **A plain bounded `overflow-x-auto` track, one full-width slide per item,
 * not a belt.** Every other horizontal track on this site that scrolls
 * *forever* (`FeaturedProducts`) exists because a visitor is meant to keep
 * discovering more cards; a product's own photo set is small and finite —
 * there is a real first and last image, and stopping there is correct, not
 * a gap to route around. Reusing `.hscroll` for the scrollbar-hiding rule
 * it already carries — but explicitly cancelling its `scroll-padding-left`
 * with `scroll-pl-0` (client, 2026-08-31: "i can see the edge of the
 * previous image on the 2nd image and also it is not centered"). That
 * padding is tuned for a *different* track shape, one with a deliberate
 * peek of the next card — applied here, it shifts where native
 * `scroll-snap-align: start` actually lands (the browser aligns a slide's
 * start edge with the scrollport edge *plus* that padding, not the
 * scrollport edge itself), so a real swipe first settled with the previous
 * slide's own trailing edge still inside the viewport, then visibly
 * animated a second time as the settle-timer below corrected it — a real,
 * visible two-step motion, not just an imprecise final position. `scroll-
 * pl-0` removes the discrepancy at its source: each slide here is exactly
 * the track's own width, with nothing to peek at on either side, so native
 * snap should land it flush on the first try.
 *
 * **`snap-start`, not `snap-center`.** Tried `center` first on the
 * reasoning that it should not matter when a slide exactly fills the
 * snapport — it does: a real swipe past the midpoint measured landing 24px
 * short of the next slide's own left edge (928px against a 952px step),
 * not the clean whole multiple `start` alignment guarantees. This project
 * already has the same lesson on record for `FeaturedProducts`' own track
 * ("Snapping to `start`... is what naturally keeps every rest position a
 * whole multiple of one card's width from the last") and applies it again
 * here rather than re-deriving it by hitting the same rounding gap twice.
 *
 * **`snap-mandatory`, not `snap-proximity`** (client, 2026-08-28: "when i
 * scroll right or left i dont want the images to be attached but only one
 * image when i scroll") — a soft mobile swipe without much momentum can
 * end well short of a full slide-width under `proximity`, which only pulls
 * a scroll toward a snap point that was already going to land near one; the
 * gesture then rests exactly where the swipe stopped, showing a slice of
 * two images at once. `FeaturedProducts` and `RecentlyViewed` both use
 * `proximity` deliberately, because `mandatory` there was found to grab a
 * vertical wheel scroll that carried even a little incidental horizontal
 * noise, breaking the page scrolling past them — but that risk is about a
 * track sitting inline in a long page, competing with the page's own
 * scroll. This one does not: it is a small, self-contained square image
 * swiper, not a wide belt of peeking cards in the middle of page content,
 * so there is no ambient wheel gesture over it that `mandatory` could
 * wrongly capture — only a deliberate swipe or drag, which is exactly what
 * should always end on exactly one image.
 *
 * `active` is read back from `scrollLeft` on every scroll (native swipe,
 * arrow click, or thumbnail click all move the same track), the same
 * "measure, don't track redundant state by hand" idiom every scroll-driven
 * component on this site already uses — so a swipe past several images at
 * once still lands the thumbnail row and the arrows' disabled state on
 * whichever image the visitor actually stopped on.
 *
 * **A settle-timer forces exact alignment once scrolling stops, on top of
 * `snap-mandatory` rather than trusting it alone** (client, 2026-08-28:
 * "Cant we implement like in amazon, where when we scroll only one image
 * is visible at a time... the previous image is not visible" — asked after
 * `snap-mandatory` alone was shipped for the same complaint). Measured
 * directly that the browser's own snap machinery does not reliably land on
 * the exact slide boundary from every gesture shape: a real touch drag
 * past the midpoint settled — stably, not mid-animation — 24px short of
 * the next slide's own edge (928px against a 952px step) and stayed there.
 * `FeaturedProducts` hit an unrelated version of the same class of problem
 * (`scroll-snap-type` not resolving to a clean position on its own) and
 * settled it the same way this does: not by fighting the browser mid-
 * gesture, but by reading where a scroll actually stopped and correcting
 * to the nearest exact multiple immediately after, via the same settle-
 * timer shape as that component's own `sync`. Deliberately **not** a
 * custom touch-drag/transform pager instead (dragging the image with the
 * finger, animating a `translateX` by hand) — that would need to hijack
 * native touch scrolling to work at all, which is exactly the failure mode
 * `FeaturedProducts`' own history warns about at length for the analogous
 * wheel-event case (a handler that cannot safely tell a horizontal swipe
 * from a vertical page-scroll apart without risking breaking the one it
 * guesses wrong on) — solving *this* problem does not require taking on
 * that risk.
 *
 * **A `gap-x-3` between slides, not a border on each one** (client,
 * 2026-08-31: "The images should be separate and when i drag... do not add
 * borders to the image"). The previous pass's per-slide `border border-line`
 * put touching borders between two adjacent photos while dragging, which
 * reads as one seam rather than two distinct images — a small gap showing
 * the page's own background instead makes the separation obvious without
 * drawing on the photo itself. This changes the step between one slide and
 * the next from `clientWidth` alone to `clientWidth + SLIDE_GAP` everywhere
 * that step is used (`sync`, the settle-timer, `goTo`) — native
 * `snap-start` resolves correctly either way, since it snaps to each
 * child's actual rendered position, but this component's own JS math has to
 * account for the gap explicitly since it does not read the gap back from
 * the DOM.
 */
export function ProductMedia({
  images,
  videoUrl,
  videoTitle,
  productName,
  compact = false,
}: {
  images: ProductImage[];
  videoUrl: string | null;
  videoTitle: string | null;
  productName: string;
  /**
   * `QuickViewModal` only (client: "if there more than one image in a
   * product do not show preview at the bottom, just the dots are enough.
   * Otherwise the image becomes too small" — then, once shipped: "This is
   * only for mobile view. In desktop view its fine to show preview below
   * like previous") — swaps the thumbnail grid for a small dot row
   * overlaid on the image itself, but only below `md`; at `md` and up this
   * prop changes nothing, same thumbnail grid as ever. The dot shape is
   * `ProductCard`'s own catalogue-grid gallery dots, reused rather than
   * invented twice for the identical trade-off. The product detail page
   * passes nothing and keeps
   * the thumbnail grid exactly as it always has: that page has the room
   * for it, and showing the actual photos to jump to is strictly more
   * useful there than a plain position indicator.
   */
  compact?: boolean;
}) {
  const video = parseVideoUrl(videoUrl);

  const items: MediaItem[] = [
    ...images.map((image) => ({ kind: "image" as const, image })),
    ...(video ? [{ kind: "video" as const, url: videoUrl!, title: videoTitle }] : []),
  ];

  const trackRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | null>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  /* Each slide is still exactly the track's own width, but a `gap-x-3`
     between them now (client: "the images should be separate... do not add
     borders to the image" — a thin strip of the page's own background
     between slides while dragging, instead of the per-slide `border` the
     previous pass used, which touching borders make read as one seam
     rather than two distinct photos). The step between one slide's start
     and the next is therefore `clientWidth + SLIDE_GAP`, not `clientWidth`
     alone — `SLIDE_GAP` is `12`, matching `gap-x-3` (`0.75rem`) exactly, so
     it has to change here if that class ever does. */
  const SLIDE_GAP = 12;

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
    setActive(Math.min(Math.round(el.scrollLeft / (el.clientWidth + SLIDE_GAP)), items.length - 1));
  }, [items.length]);

  /* Forces `scrollLeft` to the nearest exact multiple of one slide's step
     (width plus gap) — see the component note on why this exists alongside
     `snap-mandatory` rather than instead of a custom pager. Armed on every
     scroll and only fires once scrolling has genuinely stopped, the same
     "never correct mid-gesture" rule `FeaturedProducts`' own settle timer
     follows, for the same reason: doing this while a touch drag is still
     in progress would mean fighting it. */
  const onScroll = useCallback(() => {
    sync();
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const el = trackRef.current;
      if (!el || el.clientWidth === 0) return;
      const step = el.clientWidth + SLIDE_GAP;
      const nearest = Math.round(el.scrollLeft / step);
      const target = nearest * step;
      if (Math.abs(el.scrollLeft - target) > 1) {
        el.scrollTo({ left: target, behavior: "smooth" });
      }
    }, 100);
  }, [sync]);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync]);

  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    [],
  );

  const goTo = (index: number) => {
    const el = trackRef.current;
    if (!el) return;
    setPlaying(false);
    el.scrollTo({ left: index * (el.clientWidth + SLIDE_GAP), behavior: "smooth" });
  };

  const step = (direction: 1 | -1) => goTo(active + direction);

  if (items.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center border border-line bg-surface-subtle">
        <div className="text-center">
          <PanelPlaceholder className="mx-auto h-24 w-24" />
          <p className="label-tech mt-4 text-muted">Photography to follow</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={onScroll}
          aria-label={`${productName} photos`}
          className="hscroll flex snap-x snap-mandatory gap-x-3 overflow-x-auto scroll-pl-0"
        >
          {items.map((item, index) => (
            <div
              key={index}
              className="relative aspect-square w-full flex-none snap-start bg-surface"
            >
              {item.kind === "image" ? (
                <Image
                  src={item.image.url}
                  alt={item.image.alt || productName}
                  fill
                  sizes="(min-width: 1024px) 34rem, 92vw"
                  /* Only the slide that opens the gallery loads eagerly —
                     every other one is a sibling in the same scrollable
                     row now, and `priority` on all of them would preload
                     every photo at once regardless of which one, if any,
                     a visitor ever actually swipes to. */
                  priority={index === 0}
                  /* `object-cover` on a square plate, fed square photography — so
                     this fills edge to edge and crops nothing. Every product image
                     plate on the site is 1:1 for exactly this reason; see the note
                     on `ProductCard`. */
                  className="object-cover"
                />
              ) : playing && video ? (
                <iframe
                  src={video.embedUrl}
                  title={item.title || `${productName} video`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  className="group absolute inset-0 flex h-full w-full items-center justify-center bg-band"
                >
                  {video?.thumbnailUrl && (
                    <Image
                      src={video.thumbnailUrl}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 34rem, 92vw"
                      unoptimized
                      className="object-cover opacity-70 transition-opacity group-hover:opacity-50"
                    />
                  )}
                  <span className="relative flex items-center gap-3 bg-surface px-5 py-3 text-sm font-medium text-ink">
                    <PlayIcon className="h-4 w-4" />
                    Play video
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Same control at every width, mobile included — not a
            desktop-only affordance alongside the swipe, the swipe's
            equivalent for a pointer or a tap.

            **Bare chevrons, not full arrows** (client, 2026-08-28: "lets
            make the image left and right buttons just < >") — `Chevron*`,
            not `Arrow*`: this project's own `Arrow*` icons draw a full
            shaft-and-head arrow, while `Chevron*` is the bare angle-bracket
            glyph the client's ASCII actually described, already established
            elsewhere on the site (`home/FeaturedProducts`' own paging row)
            for exactly this "just the bracket" look.

            **Literal light-mode colours, not the `line`/`surface-raised`/
            `ink` tokens** (client, same message: "do not change colour of
            the button in dark mode") — those three tokens each carry a
            separate dark-mode value by design, which is exactly the
            behaviour being turned off here: `#dde1e5`/`#ffffff`/`#14171a`
            are those tokens' own *light*-mode values, hardcoded so this one
            control stops following the site's theme rather than picking a
            new, different fixed appearance. */}
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={!canScroll.left}
              aria-label={`Previous ${productName} photo`}
              className="absolute left-2 top-1/2 flex h-9 w-9 [transform:translateY(-50%)] items-center justify-center rounded-full border border-[#dde1e5] bg-[#ffffff] text-[#14171a] shadow-card transition-colors hover:border-[#14171a] disabled:cursor-default disabled:opacity-40"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={!canScroll.right}
              aria-label={`Next ${productName} photo`}
              className="absolute right-2 top-1/2 flex h-9 w-9 [transform:translateY(-50%)] items-center justify-center rounded-full border border-[#dde1e5] bg-[#ffffff] text-[#14171a] shadow-card transition-colors hover:border-[#14171a] disabled:cursor-default disabled:opacity-40"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </>
        )}

        {/* `compact` swaps the thumbnail grid below for this instead, below
            `md` only (client: "This is only for mobile view. In desktop
            view its fine to show preview below like previous") — same
            overlaid-dot shape `ProductCard`'s own catalogue-grid gallery
            already uses, including the same `pointer-events-none` strip
            with only each pill itself clickable, so the empty space either
            side of a short dot row doesn't sit on top of the swipeable
            track and block a drag started there. `md:hidden` rather than a
            separate mobile-only render path — both this and the thumbnail
            grid below stay mounted at every width; only which one is
            visible changes at the breakpoint, so nothing has to
            mount/unmount (and lose scroll position or focus) on a resize
            across it. */}
        {compact && items.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex items-center justify-center gap-1 md:hidden">
            {items.map((item, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goTo(index)}
                aria-label={
                  item.kind === "video"
                    ? `Show video of ${productName}`
                    : `Show photo ${index + 1} of ${productName}`
                }
                aria-current={index === active}
                className="pointer-events-auto flex h-4 w-3 items-center justify-center"
              >
                <span
                  className={`block h-1 rounded-full shadow-[0_0_1px_rgba(0,0,0,0.6)] transition-all duration-300 ${
                    index === active ? "w-3 bg-[#23703d]" : "w-1 bg-[#23703d]/45 hover:bg-[#23703d]/70"
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length > 1 && (
        <ul className={`mt-3 grid grid-cols-5 gap-3 ${compact ? "hidden md:grid" : ""}`}>
          {items.map((item, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => goTo(index)}
                aria-label={
                  item.kind === "video"
                    ? `Show video of ${productName}`
                    : `Show image ${index + 1} of ${productName}`
                }
                aria-current={index === active}
                className={`relative block aspect-square w-full overflow-hidden border bg-surface transition-colors ${
                  index === active
                    ? "border-ink"
                    : "border-line hover:border-line-strong"
                }`}
              >
                {item.kind === "image" ? (
                  <Image
                    src={item.image.url}
                    alt=""
                    fill
                    sizes="6rem"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-action text-action-ink">
                    <PlayIcon className="h-4 w-4" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
