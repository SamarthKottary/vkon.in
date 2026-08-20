"use client";

import Image from "next/image";
import { useState } from "react";
import { PlayIcon } from "@/components/icons/ui";
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

  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);

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

  const current = items[Math.min(active, items.length - 1)];

  return (
    <div>
      <div className="relative aspect-square border border-line bg-surface">
        {current.kind === "image" ? (
          <Image
            src={current.image.url}
            alt={current.image.alt || productName}
            fill
            sizes="(min-width: 1024px) 34rem, 92vw"
            priority
            /* `object-cover` on a square plate, fed square photography — so
               this fills edge to edge and crops nothing. Every product image
               plate on the site is 1:1 for exactly this reason; see the note
               on `ProductCard`. */
            className="object-cover"
          />
        ) : playing && video ? (
          <iframe
            src={video.embedUrl}
            title={current.title || `${productName} video`}
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

      {items.length > 1 && (
        <ul className="mt-3 grid grid-cols-5 gap-3">
          {items.map((item, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => {
                  setActive(index);
                  setPlaying(false);
                }}
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
