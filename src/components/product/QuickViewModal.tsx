"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ProductMedia } from "@/components/product/ProductMedia";
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
          really should stay in place while its own column scrolls. */}
      <div className="relative flex max-h-full w-full max-w-4xl flex-col overflow-y-auto bg-surface shadow-modal sm:rounded-none md:flex-row md:overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 p-2 text-muted transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label="Close dialog"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        {/* Left Side - Image Gallery */}
        <div className="w-full bg-surface-subtle p-6 md:w-1/2 md:p-8 lg:p-10 border-b border-line md:border-b-0 md:border-r">
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
        <div className="flex w-full flex-col p-6 md:w-1/2 md:overflow-y-auto md:p-8 lg:p-10">
          <div className="flex flex-col">
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

            <div className="mt-8 flex items-center gap-4">
              <div className="flex-1">
                 <AddToCartButton slug={product.slug} name={product.name} />
              </div>
            </div>
            
            <Link 
              href={`/products/${product.slug}`} 
              onClick={onClose}
              className="mt-6 text-sm font-medium text-accent underline underline-offset-4 self-start"
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
