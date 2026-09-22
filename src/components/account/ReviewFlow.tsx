"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ReviewForm, MediaStrip } from "@/components/account/ReviewForm";
import { Stars, formatRating } from "@/components/product/Stars";

/**
 * Reviewing the products on one order, one pop-up at a time (client,
 * 2026-09-22).
 *
 * **One flow per order, not one form per line.** An order of five delivered
 * items used to be five expanded review blocks down the page; now each line
 * has a button, only one review is open at a time, and opening another closes
 * the one before it by construction — there is a single `open` index here, not
 * a piece of state per row.
 *
 * **"Write reviews" steps through what is left.** Saving or cancelling moves
 * to the next product that has not been reviewed and stops when there are
 * none, so a customer can do a whole order in one go without hunting for the
 * next button. A product already reviewed is skipped — it is not asked about
 * twice.
 */

export type FlowReview = {
  rating: number;
  comment: string;
  media: { url: string; kind: "image" | "video" }[];
  status: "pending" | "approved" | "rejected";
};

export type FlowItem = {
  productId: string;
  slug: string;
  name: string;
  review: FlowReview | null;
};

type Flow = {
  items: FlowItem[];
  open: (productId: string) => void;
  /** The first product with no review, or null when they are all done. */
  startSequence: () => void;
  remaining: number;
};

const FlowContext = createContext<Flow | null>(null);

export function ReviewFlowProvider({
  orderId,
  items,
  children,
}: {
  orderId: string;
  items: FlowItem[];
  children: React.ReactNode;
}) {
  /**
   * What is open, and **which of the two things it is** — the form, or the
   * review as written.
   *
   * The mode is decided when it opens and kept, rather than read from the
   * item each render. Saving revalidates the page, so the item gains its
   * review a moment later; with the mode derived from that, the form was
   * swapped for the summary underneath the customer and unmounted before it
   * could say it had finished — leaving the pop-up open on a review they had
   * just written. Holding the mode keeps the form mounted until it closes
   * itself.
   */
  const [open, setOpen] = useState<{ productId: string; mode: "write" | "view" } | null>(null);
  /* True while stepping through the unreviewed ones, so closing one opens the
     next; a single "Show review" is not a sequence. */
  const [sequencing, setSequencing] = useState(false);

  const unreviewed = useMemo(() => items.filter((item) => !item.review), [items]);

  const openProduct = useCallback(
    (productId: string) => {
      const item = items.find((entry) => entry.productId === productId);
      if (!item) return;
      setSequencing(false);
      setOpen({ productId, mode: item.review ? "view" : "write" });
    },
    [items],
  );

  const startSequence = useCallback(() => {
    const first = items.find((item) => !item.review);
    if (!first) return;
    setSequencing(true);
    setOpen({ productId: first.productId, mode: "write" });
  }, [items]);

  /* Saving or cancelling: the next one that still needs a review, skipping
     everything already done — including the one just written. */
  const close = useCallback(() => {
    setOpen((current) => {
      if (!current || !sequencing) {
        if (!current || !sequencing) setSequencing(false);
        return null;
      }
      const index = items.findIndex((item) => item.productId === current.productId);
      const next = items
        .slice(index + 1)
        .find((item) => !item.review && item.productId !== current.productId);
      if (!next) {
        setSequencing(false);
        return null;
      }
      return { productId: next.productId, mode: "write" };
    });
  }, [items, sequencing]);

  const current = open ? items.find((item) => item.productId === open.productId) ?? null : null;

  const value = useMemo<Flow>(
    () => ({ items, open: openProduct, startSequence, remaining: unreviewed.length }),
    [items, openProduct, startSequence, unreviewed.length],
  );

  return (
    <FlowContext.Provider value={value}>
      {children}
      {current && open && (
        <Modal
          title={
            open.mode === "view"
              ? "Your review"
              : current.review
                ? "Edit your review"
                : `Review ${current.name}`
          }
          onClose={close}
          size="lg"
        >
          {open.mode === "view" && current.review ? (
            <ReviewSummary
              item={current}
              onEdit={() => setOpen({ productId: current.productId, mode: "write" })}
            />
          ) : (
            <ReviewForm
              /* Keyed by product: moving to the next one in a sequence must
                 start a fresh form, not carry the last one's stars over. */
              key={current.productId}
              orderId={orderId}
              productId={current.productId}
              slug={current.slug}
              productName={current.name}
              review={current.review}
              onDone={close}
            />
          )}
        </Modal>
      )}
    </FlowContext.Provider>
  );
}

/** What was written, inside the pop-up, with a way to change it. */
function ReviewSummary({ item, onEdit }: { item: FlowItem; onEdit: () => void }) {
  const review = item.review!;
  return (
    <div className="space-y-3">
      <p className="font-medium text-ink">{item.name}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Stars rating={review.rating} size={16} />
        <span className="text-sm font-medium text-ink">{formatRating(review.rating)} out of 5</span>
        <button type="button" onClick={onEdit} className="text-sm text-accent hover:underline">
          Edit
        </button>
      </div>
      {review.comment && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-body">{review.comment}</p>
      )}
      {review.media.length > 0 && <MediaStrip media={review.media} />}
    </div>
  );
}

/** The button on one line of the order. */
export function ItemReviewButton({ productId }: { productId: string }) {
  const flow = useContext(FlowContext);
  const item = flow?.items.find((entry) => entry.productId === productId);
  if (!flow || !item) return null;
  /* Smaller than `Button size="sm"` (client, 2026-09-22): this sits under a
     price on a line of an order, where it is a quiet secondary action, not
     the thing the row is for. */
  return (
    <button
      type="button"
      onClick={() => flow.open(productId)}
      className="inline-flex h-7 items-center whitespace-nowrap border border-line-strong px-2.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
    >
      {item.review ? "Show review" : "Write a review"}
    </button>
  );
}

/** The one button that walks the whole order, for the order history row. */
export function StartReviewsButton({ className = "" }: { className?: string }) {
  const flow = useContext(FlowContext);
  if (!flow || flow.remaining === 0) return null;
  return (
    <button type="button" onClick={flow.startSequence} className={className}>
      Write {flow.remaining === 1 ? "review" : "reviews"}
    </button>
  );
}
