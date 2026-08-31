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
 * it already carries; nothing here needs its `scroll-padding-left`, tuned
 * for `snap-start` tracks with a peek of the next card, since each slide
 * here is `snap-center` and exactly the track's own width — there is
 * nothing to peek at either side.
 *
 * `active` is read back from `scrollLeft` on every scroll (native swipe,
 * arrow click, or thumbnail click all move the same track), the same
 * "measure, don't track redundant state by hand" idiom every scroll-driven
 * component on this site already uses — so a swipe past several images at
 * once still lands the thumbnail row and the arrows' disabled state on
 * whichever image the visitor actually stopped on.
 */
export function ProductMedia({
  images,
  videoUrl,
  videoTitle,
  productName,
}: {
  images: ProductImage[];
  videoUrl: string | null;
  videoTitle: string | null;
  productName: string;
}) {
  const video = parseVideoUrl(videoUrl);

  const items: MediaItem[] = [
    ...images.map((image) => ({ kind: "image" as const, image })),
    ...(video ? [{ kind: "video" as const, url: videoUrl!, title: videoTitle }] : []),
  ];

  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  /* One slide is exactly the track's own width — no gap, no peek of a
     neighbour — so `clientWidth` doubles as the step size and there is no
     separate measurement to keep in sync with it. */
  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
    setActive(Math.min(Math.round(el.scrollLeft / el.clientWidth), items.length - 1));
  }, [items.length]);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync]);

  const goTo = (index: number) => {
    const el = trackRef.current;
    if (!el) return;
    setPlaying(false);
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
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
          onScroll={sync}
          aria-label={`${productName} photos`}
          className="hscroll flex snap-x snap-proximity overflow-x-auto"
        >
          {items.map((item, index) => (
            <div
              key={index}
              className="relative aspect-square w-full flex-none snap-center border border-line bg-surface"
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
      </div>

      {items.length > 1 && (
        <ul className="mt-3 grid grid-cols-5 gap-3">
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
