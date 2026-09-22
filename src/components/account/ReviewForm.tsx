"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { StarGlyph, Stars, formatRating } from "@/components/product/Stars";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  removeReviewMediaAction,
  saveReviewAction,
  uploadReviewMediaAction,
  type ReviewState,
} from "@/app/(site)/account/private-actions";

/** What each rating means, said the way other shops say it. */
const MEANINGS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Poor",
  2: "Not great",
  3: "Fine",
  4: "Good",
  5: "Excellent",
};

const COMMENT_MIN = 20;
const COMMENT_MAX = 2000;
/** Matches `REVIEW_MEDIA_MAX` and the caps in `lib/storage.ts`. */
const MEDIA_MAX = 4;
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
/** What a photo is shrunk to before it is sent. Wide enough to see a wiring
 *  detail, small enough to upload from a village. */
const PHOTO_PX = 1600;

type Media = { url: string; kind: "image" | "video" };

/**
 * One product's review, on a delivered order (client, 2026-09-22: "after an
 * order is delivered, customer can give review … on the order info page there
 * will be review of each product").
 *
 * **Radio buttons, not a hover-tracking star widget.** Five inputs labelled
 * "1 star" … "5 stars" are reachable by keyboard and by a screen reader, work
 * before JavaScript arrives, and post a value the server re-validates; the
 * stars are the label's appearance. `peer-checked` colours them, so choosing
 * one needs no state at all — `hovered` only adds the fill that follows the
 * pointer.
 *
 * An already-reviewed product opens showing what was written, because an edit
 * is a rewrite of the same review (and sends it back to be approved).
 */
export function ReviewForm({
  orderId,
  productId,
  slug,
  productName,
  review,
}: {
  orderId: string;
  productId: string;
  slug: string;
  productName: string;
  /** What this customer wrote before, if anything. */
  review: {
    rating: number;
    comment: string;
    media: Media[];
    status: "pending" | "approved" | "rejected";
  } | null;
}) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(saveReviewAction, {
    status: "idle",
  });
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState(review?.comment ?? "");
  const [media, setMedia] = useState<Media[]>(review?.media ?? []);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  /* The form lives in a pop-up (client, 2026-09-22): an order of five items
     was five stacked forms down the page, and only one is ever being filled
     in. Closed is the resting state, even before a first review. */
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  /* Saved: close it. The order page revalidates behind the pop-up, so what
     is underneath is already the new review by the time it goes. Written in a
     render rather than an effect on purpose — §9 forbids a synchronous
     setState in an effect body, and this is the same information. */
  if (state.status === "ok" && open && !closing) {
    setClosing(true);
    setOpen(false);
  }
  if (state.status !== "ok" && closing) setClosing(false);

  const shown = hovered || rating;
  const tooShort = comment.trim().length > 0 && comment.trim().length < COMMENT_MIN;

  /* **Never "your review was not published"** (client, 2026-09-22). A
     customer sees their own review whatever the admin has decided about
     showing it to strangers; being told it was turned down invites a row over
     a judgement they cannot see the reasons for. */
  const summary = review ? (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Stars rating={review.rating} size={15} />
        <span className="text-sm font-medium text-ink">{formatRating(review.rating)} out of 5</span>
        <span className="text-sm text-muted">Your review</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-accent hover:underline"
        >
          Edit
        </button>
      </div>
      {review.comment && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-body">{review.comment}</p>
      )}
      {review.media.length > 0 && <MediaStrip media={review.media} />}
    </div>
  ) : (
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
      Write a review
    </Button>
  );

  /**
   * Sends the chosen files, one at a time, and keeps what came back.
   *
   * **Photos are redrawn in the browser first** (`shrinkImage`), the same
   * trick the profile picture uses: a phone photo is several megabytes, and
   * on a rural connection that is a minute of waiting for something that will
   * be looked at 600px wide. A clip cannot be shrunk here, so it is only
   * size-checked and sent as it is.
   */
  async function addFiles(chosen: File[]) {
    setMediaError(null);
    const room = MEDIA_MAX - media.length;
    if (room <= 0) return;
    if (chosen.length > room) {
      setMediaError(`Only ${MEDIA_MAX} files in total — the first ${room} were used.`);
    }

    for (const file of chosen.slice(0, room)) {
      const isVideo = file.type.startsWith("video/");
      if (isVideo && file.size > VIDEO_MAX_BYTES) {
        setMediaError("That clip is too large — 25 MB is the limit. Try a shorter one.");
        continue;
      }

      let body: Blob = file;
      if (!isVideo) {
        try {
          body = await shrinkImage(file, PHOTO_PX);
        } catch {
          setMediaError("That file could not be opened as a photo.");
          continue;
        }
      }

      const form = new FormData();
      form.set("file", body, isVideo ? file.name : "photo.webp");
      await new Promise<void>((resolve) => {
        startUpload(async () => {
          const result = await uploadReviewMediaAction(form);
          if (result.status === "error") setMediaError(result.message);
          else setMedia((current) => [...current, { url: result.url, kind: result.kind }]);
          resolve();
        });
      });
    }
  }

  if (!open) return summary;

  return (
    <Modal
      title={review ? "Edit your review" : "Write a review"}
      onClose={() => setOpen(false)}
      size="lg"
    >
      <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="rating" value={rating || ""} />

      <fieldset>
        <legend className="text-sm font-medium text-ink">Your rating of {productName}</legend>
        {/* **Half a star per click.** Each star is two buttons side by side —
            its left half sets x.5, its right half sets x — which is how 4.5
            gets given at all (client, 2026-09-22). Buttons rather than radios
            now that there are ten of them: the value travels in the hidden
            field above, and every one of them is still reachable by keyboard
            and announces what it sets. */}
        <div
          className="mt-2 flex items-center gap-1"
          onMouseLeave={() => setHovered(0)}
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <span key={star} className="relative inline-flex">
              <StarGlyph size={30} fill={Math.max(0, Math.min(1, shown - star + 1))} />
              {[star - 0.5, star].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  onMouseEnter={() => setHovered(value)}
                  onFocus={() => setHovered(value)}
                  onBlur={() => setHovered(0)}
                  aria-pressed={rating === value}
                  className={`absolute inset-y-0 w-1/2 cursor-pointer ${
                    value === star ? "right-0" : "left-0"
                  }`}
                >
                  <span className="sr-only">
                    {value} star{value === 1 ? "" : "s"} — {MEANINGS[Math.ceil(value) as 1 | 2 | 3 | 4 | 5]}
                  </span>
                </button>
              ))}
            </span>
          ))}

          {/* What the stars mean, the way every other shop says it. */}
          {shown > 0 && (
            <span className="ml-2 text-sm">
              <span className="font-medium text-ink">{formatRating(shown)}</span>{" "}
              <span className="text-muted">— {MEANINGS[Math.ceil(shown) as 1 | 2 | 3 | 4 | 5]}</span>
            </span>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Tap the left half of a star for a half rating — 4.5, say.
        </p>
      </fieldset>

      <div>
        <label htmlFor={`comment-${productId}`} className="text-sm font-medium text-ink">
          Comment <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id={`comment-${productId}`}
          name="comment"
          rows={3}
          value={comment}
          maxLength={COMMENT_MAX}
          onChange={(event) => setComment(event.target.value)}
          placeholder="How has it worked for you?"
          className="mt-1.5 w-full border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        />
        <p className={`mt-1 text-xs ${tooShort ? "text-signal-700" : "text-muted"}`}>
          {comment.trim().length === 0
            ? `Leave it empty, or write at least ${COMMENT_MIN} characters.`
            : `${comment.trim().length} of ${COMMENT_MAX} characters${
                tooShort ? ` — ${COMMENT_MIN - comment.trim().length} more needed` : ""
              }`}
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-ink">
          Photos or a clip <span className="font-normal text-muted">(optional)</span>
        </p>
        {media.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {media.map((item) => (
              <div key={item.url} className="relative">
                <MediaThumb item={item} />
                <button
                  type="button"
                  onClick={() => {
                    setMedia((current) => current.filter((m) => m.url !== item.url));
                    /* The file goes with it — an upload nobody kept is
                       nobody's, and it is ours to clean up. */
                    void removeReviewMediaAction(item.url);
                  }}
                  aria-label="Remove this file"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line-strong bg-surface text-xs text-ink hover:border-ink"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
          multiple
          className="hidden"
          onChange={(event) => {
            const chosen = [...(event.target.files ?? [])];
            event.target.value = "";
            void addFiles(chosen);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={uploading || media.length >= MEDIA_MAX}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? "Uploading…" : media.length > 0 ? "Add another" : "Add photos or a clip"}
        </Button>
        <p className={`mt-1 text-xs ${mediaError ? "text-signal-700" : "text-muted"}`}>
          {mediaError ??
            `Up to ${MEDIA_MAX} files. Photos are shrunk before they are sent; a clip can be up to 25 MB.`}
        </p>
      </div>

      <input type="hidden" name="media" value={JSON.stringify(media)} />

      {state.status !== "idle" && state.message && (
        <p
          role="status"
          className={`text-sm ${state.status === "error" ? "text-signal-700" : "text-accent"}`}
        >
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || rating === 0 || tooShort}>
          {pending ? "Saving…" : review ? "Update review" : "Submit review"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>

      </form>
    </Modal>
  );
}

/** A row of what is attached, on a review that is being read rather than
 *  written. Clips carry their own controls; nothing plays by itself. */
export function MediaStrip({ media }: { media: Media[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {media.map((item) => (
        <MediaThumb key={item.url} item={item} />
      ))}
    </div>
  );
}

function MediaThumb({ item }: { item: Media }) {
  if (item.kind === "video") {
    return (
      <video
        src={item.url}
        controls
        preload="metadata"
        className="h-20 w-20 border border-line bg-surface-subtle object-cover"
      />
    );
  }
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
      {/* A plain `img`, not `next/image`: these are customer uploads at
          unknown sizes, shown at 80px, and the optimiser would be a round
          trip for nothing. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.url}
        alt=""
        loading="lazy"
        className="h-20 w-20 border border-line bg-surface-subtle object-cover"
      />
    </a>
  );
}

/**
 * The photo, redrawn at no more than `max` px on its long side, as WebP
 * (JPEG where the browser cannot make WebP). Keeps the aspect ratio — unlike
 * the avatar's square crop, a review photo of a wiring job must not be cut.
 */
async function shrinkImage(file: File, max: number): Promise<Blob> {
  const src = URL.createObjectURL(file);
  try {
    const img = new window.Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    if (!width || !height) throw new Error("empty image");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.imageSmoothingQuality = "high";
    context.drawImage(img, 0, 0, width, height);

    const encode = (type: string, quality: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    const webp = await encode("image/webp", 0.82);
    if (webp && webp.type === "image/webp") return webp;
    const jpeg = await encode("image/jpeg", 0.85);
    if (!jpeg) throw new Error("could not encode");
    return jpeg;
  } finally {
    URL.revokeObjectURL(src);
  }
}
