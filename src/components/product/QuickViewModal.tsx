"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ProductMedia } from "@/components/product/ProductMedia";
import { SpecTable } from "@/components/product/SpecTable";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { CloseIcon } from "@/components/icons/ui";
import { categoryLabel } from "@/content/taxonomy";
import type { Product } from "@/lib/types";

export function QuickViewModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const imageColRef = useRef<HTMLDivElement>(null);
  const [imageHeight, setImageHeight] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    // Prevent scrolling on the body when modal is open
    document.body.style.overflow = "hidden";
    
    // Close on escape
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  /** Measures the image column's own rendered height so the text column
   *  beside it (below) can be capped to exactly that, at `md` and up —
   *  the actual fix for "Add to cart starts at the image's bottom edge,"
   *  after three CSS-only passes each fixed one reported case and broke
   *  another (client, across several rounds: "add cart button always stay
   *  in same position irrespictive of any content above it," then, once a
   *  longer Specification table made the *text* side taller than the
   *  image for the first time: "remove footer at right where product
   *  image is present keep it how it was in commit 408b75c8 for image
   *  section, and move cart section footer to up which starts from the
   *  bottom of image").
   *
   *  None of `align-items: stretch` + `flex-1`, a two-row CSS grid sized
   *  to `max(image, text)`, or that grid capped with `minmax(0, 1fr)` can
   *  express "this row's height is *this specific cell's* content height"
   *  — only "the taller of the two," a different question the moment text
   *  content (now including Specification) can plausibly be taller than
   *  the image. A `ResizeObserver` on the image column answers the actual
   *  question directly instead of approximating it with row-sizing rules.
   *
   *  **`getBoundingClientRect().height`, not the observer entry's own
   *  `contentRect.height`** — `contentRect` excludes padding, so on this
   *  column's `p-6`/`md:p-8`/`lg:p-10` it under-measured by up to 2×40px,
   *  a real (if minor) discrepancy caught on review before this shipped.
   *
   *  **A synchronous first read via `useLayoutEffect`, before the
   *  `ResizeObserver` attaches** — the observer's own first callback is
   *  inherently async (fires on a later frame, never synchronously even
   *  inside a layout effect), so without this, the very first paint would
   *  briefly render with no cap at all.
   *
   *  **Depends on `mounted`, not `[]`** — this component returns `null`
   *  until `mounted` flips true (the escape-key/body-scroll effect above),
   *  so `imageColRef.current` is still `null` on the very first commit; an
   *  empty dependency array would run once against that `null` and never
   *  again, silently never observing anything. */
  useLayoutEffect(() => {
    if (!mounted) return;
    const el = imageColRef.current;
    if (!el) return;
    setImageHeight(el.getBoundingClientRect().height);
    const observer = new ResizeObserver(() => {
      setImageHeight(el.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted]);

  if (!mounted) return null;

  // Blank lines separate paragraphs in the admin textarea. We just show the first one.
  const firstParagraph = (product.description || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)[0];

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Quick view of ${product.name}`}
      style={imageHeight != null ? ({ "--qv-image-h": `${Math.round(imageHeight)}px` } as React.CSSProperties) : undefined}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content — one scrolling surface below `md`, not two
          (client: "only the content is scrollable, not the image. I want
          the entire image and content tab to scrollable as single
          entity"). Previously `overflow-hidden` here pushed all the
          overflow onto the details column's own `overflow-y-auto` below,
          leaving the image stuck outside any scroll — this wrapper now
          scrolls the stacked image+details column together instead, and
          only hands scrolling back to the details column at `md`, where
          the layout is genuinely two side-by-side panes and the image
          really should stay in place while its own column scrolls.

          **`md:grid md:grid-cols-2 md:grid-rows-[var(--qv-image-h)_auto]`,
          not `md:flex-row`** — a flex row's `align-items: stretch`
          equalises the row to the *taller* column's own natural size, and
          once the right column's total need (text content plus the
          footer sitting below it) exceeds the image's own height, the row
          grows to match *that*, stretching the image column down with
          blank space to fill the gap — reopening the exact visible gap
          this was meant to close, confirmed on review of a screenshot
          before it shipped. A grid row sized to an *explicit* length
          (the measured `--qv-image-h`, not `auto` or `minmax`) has no such
          feedback loop: row 1's height is that value, full stop, entirely
          decoupled from what either cell inside it actually contains.
          Image and text share row 1 (plain DOM order); the footer alone
          gets `md:col-start-2`, which drops it to row 2 since row 1's
          second column is already taken — row 2 is `auto`, sized purely
          by the footer's own content, never influencing row 1. */}
      <div className="relative flex max-h-full w-full max-w-4xl flex-col overflow-y-auto bg-surface shadow-modal sm:rounded-none md:grid md:grid-cols-2 md:grid-rows-[var(--qv-image-h)_auto] md:overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 p-2 text-muted transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label="Close dialog"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        {/* Left Side - Image Gallery */}
        <div ref={imageColRef} className="w-full bg-surface-subtle p-6 md:w-1/2 md:p-8 lg:p-10 border-b border-line md:border-b-0 md:border-r">
           {/* Capped below `md` (client: "let it adjust the image size by
               fitting it as needed to fit the quick view panel in mobile
               view") — `ProductMedia`'s own square plate is otherwise
               `w-full` of whatever contains it, which on a narrow phone
               meant the image alone (plus the thumbnail row and arrows
               below it) could run to a third or more of the viewport's own
               height before any content was visible at all. Scoped to this
               wrapper, not `ProductMedia` itself — that component is shared
               with the product detail page, which still wants its own
               full-width treatment untouched. `md:max-w-none` hands the
               width back to the existing `md:w-1/2` column at the
               breakpoint where this becomes a real side-by-side layout
               instead of a stacked one.

               `80%`, not the original `55%` (client, once the thumbnail
               grid below moved to overlaid dots on mobile: "in mobile
               there is space for image size to increase") — the grid's own
               removal freed exactly the space the tighter cap was
               originally leaving room for, so once it was gone the image
               was smaller than it needed to be for no remaining reason. */}
           <div className="mx-auto w-full max-w-[80%] md:max-w-none">
             <ProductMedia
                images={product.images}
                videoUrl={product.videoUrl}
                videoTitle={product.videoTitle}
                productName={product.name}
                compact
              />
           </div>
        </div>

        {/* Right Side - Details */}
        <div className="flex w-full flex-col md:contents">
          {/* Text content — row 1, column 2 (plain DOM order; grid
              auto-placement drops it beside the image). Its own box is
              stretched to row 1's *explicit* height by grid's default
              per-cell alignment, so `overflow-y-auto` has a real, fixed
              ceiling to scroll under the moment content exceeds it — a
              short product just leaves blank space below its last row,
              same as before. */}
          <div className="overflow-y-auto p-6 md:p-8 lg:p-10">
            <p className="label-tech text-muted mb-2">{categoryLabel(product.category)}</p>
            <h2 className="text-2xl leading-snug sm:text-3xl text-ink">
              <Link href={`/products/${product.slug}`} className="hover:text-accent transition-colors" onClick={onClose}>
                {product.name}
              </Link>
            </h2>

            {product.price != null && (
              <p className="mt-3 text-2xl font-semibold text-ink">
                ₹ {product.price.toLocaleString("en-IN")}
              </p>
            )}

            {product.tagline && (
              <p className="mt-4 text-body leading-relaxed">
                {product.tagline}
              </p>
            )}

            {firstParagraph && (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                {firstParagraph}
              </p>
            )}

            {product.hpRanges.length > 0 && (
              <div className="mt-6 border-t border-line pt-4">
                 <p className="label-tech text-muted">Range</p>
                 <p className="mt-2 font-mono text-sm text-ink">
                   {product.hpRanges.join(" · ")}
                 </p>
              </div>
            )}

            {/* Specification — same `SpecTable` the product detail page
                uses, so a spec row reads identically whether opened here
                or there (client, 2026-09-02: "also add Specification of
                the product in the quick view card after RANGE"). Renders
                nothing on its own when a product has no spec rows. */}
            {product.spec.length > 0 && (
              <div className="mt-6 border-t border-line pt-4">
                 <p className="label-tech text-muted">Specification</p>
                 <div className="mt-2">
                   <SpecTable rows={product.spec} />
                 </div>
              </div>
            )}
          </div>

          {/* Add to cart + "View full details" — grid row 2, column 2
              (`md:col-start-2`; below `md` the grid isn't active, so this
              is a plain block stacked after the text, same as before).
              Always renders at row 1's bottom edge — the image's own
              measured height, exactly, never inflated by how tall the text
              column's own content needs to be. */}
          <div className="border-t border-line bg-surface p-6 md:col-start-2 md:p-8 lg:p-10">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                 <AddToCartButton slug={product.slug} name={product.name} />
              </div>
            </div>

            <Link
              href={`/products/${product.slug}`}
              onClick={onClose}
              className="mt-4 block text-sm font-medium text-accent underline underline-offset-4"
            >
              View full details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
