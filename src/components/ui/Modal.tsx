"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons/ui";

/**
 * The dialog the rest of the site is measured against — `AddressDialog`'s
 * frame, lifted out so the others match it (client, 2026-09-18: "the pop up
 * should be like edit address pop up").
 *
 * What it carries, and why each piece is here rather than in the caller:
 *
 *  - **Portalled to `<body>`**, so a dialog opened from inside checkout's order
 *    `<form>` is not a form inside a form — the trap `CheckoutForm` records at
 *    length — and nothing above it in the tree can clip it.
 *  - **Blur, no tint.** A `bg-ink/50` wash is dark in the light theme and
 *    *light* in the dark one, where `ink` is near-white, so it brightened the
 *    page instead of dimming it.
 *  - **Escape, the backdrop and the X all close**, and focus moves to the
 *    panel on open and back to whatever had it on close.
 *  - **The page behind does not scroll** while it is open.
 *
 * `onClose` is held in a ref so this setup runs once: keyed on the callback it
 * re-ran on every re-render of the page behind, and each re-run pulled focus
 * out of whatever the person was using.
 *
 * It renders only when the caller renders it — after a click, never during the
 * first paint — so there is no `mounted` state, which §9 forbids anyway.
 */
export function Modal({
  title,
  onClose,
  children,
  /** Wider than the default for a form; the default suits a short message. */
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  const uid = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden
        onClick={() => closeRef.current()}
        className="absolute inset-0 backdrop-blur-md"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        tabIndex={-1}
        className={`relative max-h-[92svh] w-full overflow-y-auto border border-line-strong bg-surface-raised p-5 shadow-2xl outline-none sm:p-6 ${
          size === "lg" ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={`${uid}-title`} className="text-xl font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => closeRef.current()}
            className="-mt-1 flex h-10 w-10 shrink-0 items-center justify-center text-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {children}
      </div>
    </div>,
    document.body,
  );
}
