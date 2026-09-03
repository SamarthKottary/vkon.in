"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ProductMedia } from "@/components/product/ProductMedia";
import { SpecTable } from "@/components/product/SpecTable";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { ProductPrice } from "@/components/product/ProductPrice";
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

      {/* Modal Content — a single clean rectangle at every width, capped so
          it never outgrows the viewport (`max-h-[90vh]`, `md:max-h-[85vh]`).

          Below `md` it stacks (image over content) and the whole card is one
          scroll surface (`overflow-y-auto`) — client: "I want the entire
          image and content tab to scrollable as single entity."

          At `md` and up it is a two-pane row (`md:flex-row md:overflow-hidden`)
          whose two columns are stretched to equal height by flex's default
          `align-items: stretch`, so the card stays a rectangle whichever side
          is taller — never the L-shape a grid produced (image in one cell, the
          footer hanging in a separate row below it with the left side blank).
          The image column fills its half; the details column carries its own
          internal scroll and a pinned footer — see each below.

          **`md:max-h-[min(85vh,600px)]`, not a flat `85vh`** (client: "move
          add cart section up") — a long Specification table pushed the card to
          the full `85vh`, which on a tall window left the square image
          centred in a much taller column with big blank margins and the footer
          sitting low. Capping the desktop height at 600px keeps the modal
          compact — image, content and the Add to cart footer all sit higher —
          while `min(85vh, …)` still yields to the viewport on a short window
          so it never overflows off-screen. */}
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-y-auto bg-surface shadow-modal sm:rounded-none md:max-h-[min(85vh,600px)] md:flex-row md:overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 p-2 text-muted transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label="Close dialog"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        {/* Left Side - Image Gallery. `md:items-center md:justify-center` (a
            flex column) keeps the image centred in its half when the details
            column beside it is the taller of the two and stretches this one
            past the image's own height — so any extra space sits evenly above
            and below the photo rather than pooling under it. */}
        <div className="flex w-full flex-col bg-surface-subtle p-6 md:w-1/2 md:items-center md:justify-center md:p-8 lg:p-10 border-b border-line md:border-b-0 md:border-r">
          {/* Capped below `md` (client: "let it adjust the image size by
              fitting it as needed to fit the quick view panel in mobile
              view") — `ProductMedia`'s own square plate is otherwise `w-full`
              of whatever contains it, which on a narrow phone meant the image
              alone (plus the thumbnail row and arrows below it) could run to a
              third or more of the viewport's own height before any content was
              visible at all. Scoped to this wrapper, not `ProductMedia`
              itself — that component is shared with the product detail page,
              which still wants its own full-width treatment untouched.
              `md:max-w-none` hands the width back to this column at the
              breakpoint where this becomes a real side-by-side layout.

              `80%`, not the original `55%` (client, once the thumbnail grid
              moved to overlaid dots on mobile: "in mobile there is space for
              image size to increase"). */}
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

        {/* Right Side - Details. A flex column filling its half of the card;
            below `md` it is a plain block in the card's own single scroll. */}
        <div className="flex w-full flex-col md:w-1/2 md:overflow-hidden">
          {/* Content — `md:min-h-0 md:overflow-y-auto`, NOT `md:flex-1`
              (client: "move add cart section up"). `flex-1` made this box
              claim the column's whole leftover height, so the footer below
              was shoved to the card's very bottom with blank space between it
              and short content. Without it, the box takes its natural height
              and the footer sits directly beneath — `min-h-0` still lets it
              shrink and scroll under its own scrollbar when the content (a
              long Specification table) genuinely exceeds the column, so the
              footer stays put in that case too. */}
          <div className="p-6 md:min-h-0 md:overflow-y-auto md:p-8 lg:p-10">
            <p className="label-tech text-muted mb-2">{categoryLabel(product.category)}</p>
            <h2 className="text-2xl leading-snug sm:text-3xl text-ink">
              <Link href={`/products/${product.slug}`} className="hover:text-accent transition-colors" onClick={onClose}>
                {product.name}
              </Link>
            </h2>

            {/* The price moved to the pinned footer, beside Add to cart
                (client, 2026-09-03: "In quick view panel price will be
                displayed on the left and add to cart on the right"). Moved,
                not duplicated — it is the same decision the cards took. */}

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

            {/* Specification — same `SpecTable` the product detail page uses,
                so a spec row reads identically whether opened here or there
                (client, 2026-09-02: "also add Specification of the product in
                the quick view card after RANGE"). Renders nothing when a
                product has no spec rows. */}
            {product.spec.length > 0 && (
              <div className="mt-6 border-t border-line pt-4">
                <p className="label-tech text-muted">Specification</p>
                <div className="mt-2">
                  <SpecTable rows={product.spec} />
                </div>
              </div>
            )}

            {/* "View full details" — after the Specification, right-aligned
                (client, 2026-09-02: "move view full details in add to cart
                section and move after specification align to right"). It sits
                in the scrollable content, not the pinned footer below, so the
                footer now carries only the Add to cart control. */}
            <div className="mt-6 flex justify-end">
              <Link
                href={`/products/${product.slug}`}
                onClick={onClose}
                className="text-sm font-medium text-accent underline underline-offset-4"
              >
                View full details
              </Link>
            </div>
          </div>

          {/* Add to cart — the only control in the pinned footer now;
              "View full details" moved up into the scrollable content, after
              the Specification (see above).

              At `md` and up it is the flex sibling the content region above
              does not consume, so it sits at the bottom of the details
              column, static.

              Below `md` the whole card is one scroll surface, so a plain
              block here would scroll away with the content — `sticky bottom-0`
              instead pins it to the bottom of the card's viewport while the
              image and content scroll behind it (client, 2026-09-02: "in
              mobile view why add to card section is not pinned static like it
              done in desktop view"). `md:static` hands it back to the flex
              layout at the breakpoint where that takes over. `shrink-0` keeps
              it from being squeezed when the content is long. */}
          <div className="sticky bottom-0 z-10 shrink-0 border-t border-line bg-surface p-6 md:static md:p-8 lg:p-10">
            {/* Price left, Add to cart right (client, 2026-09-03). `min-w-0`
                on the price and `shrink-0` on the button so a long figure
                truncates rather than squeezing the control — the button
                widens into a `QuantityStepper` once the product is in the
                cart, and an unprotected flex sibling absorbs that whole
                squeeze.

                Without a price the button keeps the full width it had before
                this row gained a second child, so an unpriced product's
                footer is unchanged. */}
            <div className="grid grid-cols-2 gap-3 items-center sm:flex sm:items-center sm:justify-between sm:gap-4">
              {product.price != null && (
                <div className="min-w-0">
                  <ProductPrice product={product} size="regular" />
                </div>
              )}
              <div className={product.price != null ? "min-w-0" : "col-span-2"}>
                <AddToCartButton slug={product.slug} name={product.name} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
