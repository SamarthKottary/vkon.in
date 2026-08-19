"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/icons/Logo";
import { CloseIcon, MenuIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ProductsMenu, type MenuSector } from "@/components/layout/ProductsMenu";
import { primaryNav } from "@/content/nav";

/**
 * Flat header on a hairline rule. No blur, no shadow, no colour change on
 * scroll — the rule is always there and the header simply stays put.
 *
 * Dropping `backdrop-blur` also removed the containing block that used to trap
 * the fixed drawer, so the drawer no longer needs to be a sibling. It still is,
 * because a dialog belongs outside the banner landmark.
 *
 * It retracts on the way down the page and returns on the way up. Three rules
 * keep that from being annoying:
 *   - it never hides within the first HIDE_AFTER px, so the top of the page
 *     always has its header;
 *   - a movement under DELTA px is ignored, so momentum scrolling and the
 *     rubber-band at the end of a page do not flicker it;
 *   - it never hides while the mobile drawer is open, which would take the
 *     close button off screen. That is the `!open` in the class expression,
 *     not an effect — setting state from an effect is what the lint rule
 *     `react-hooks/set-state-in-effect` exists to stop, and it is unnecessary
 *     here because the render already knows both values.
 * It only ever translates — staying in the DOM and in the tab order, so a
 * keyboard user tabbing into it brings it straight back.
 */

/** Scrolled distance before hiding is allowed at all. */
const HIDE_AFTER = 120;
/** Movement below this is treated as noise rather than a direction change. */
const DELTA = 6;
export function Header({ menu = [] }: { menu?: MenuSector[] }) {
  const [open, setOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hidden, setHidden] = useState(false);
  const lastYRef = useRef(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("a, button")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key !== "Tab" || !panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /* No effect closing this on `pathname` change: every link inside the panel
     calls `onClose` as it is followed, which is the only way to navigate from
     it. Setting state from an effect is what `react-hooks/set-state-in-effect`
     exists to stop. */
  const closeProducts = useCallback(() => setProductsOpen(false), []);

  const onScroll = useCallback(() => {
    if (tickingRef.current) return;
    tickingRef.current = true;

    window.requestAnimationFrame(() => {
      tickingRef.current = false;
      const y = Math.max(0, window.scrollY);
      const previous = lastYRef.current;

      if (Math.abs(y - previous) < DELTA) return;
      lastYRef.current = y;

      setHidden(y > previous && y > HIDE_AFTER);
    });
  }, []);

  useEffect(() => {
    lastYRef.current = Math.max(0, window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header
        /* `relative` is what the dropdown positions against. It must not
           retract while that panel is open, or the panel travels off screen
           with it. */
        className={`sticky top-0 z-50 border-b border-line bg-surface transition-transform duration-300 ${
          hidden && !open && !productsOpen ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <Container size="wide" className="relative">
          {/* Three tracks — logo left, nav centred, controls right. Both side
              tracks are `md:flex-1` so the nav lands on the true horizontal
              centre of the page rather than half-way between logo and controls
              (which would drift with each label change). On mobile the nav is
              hidden and `ml-auto` on the right group takes over the alignment. */}
          <div className="flex h-16 items-center gap-6">
            <div className="shrink-0 md:flex-1">
              <Link href="/" className="inline-flex items-center">
                <Logo />
              </Link>
            </div>

            <nav aria-label="Primary" className="hidden md:block">
              <ul className="flex items-center">
                <li>
                  <ProductsMenu
                    menu={menu}
                    open={productsOpen}
                    onToggle={() => setProductsOpen((v) => !v)}
                    onClose={closeProducts}
                    active={isActive("/products")}
                  />
                </li>

                {primaryNav
                  .filter((link) => link.href !== "/products")
                  .map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={isActive(link.href) ? "page" : undefined}
                        className={`relative flex h-16 items-center px-4 text-sm font-medium transition-colors ${
                          isActive(link.href)
                            ? "text-ink after:absolute after:inset-x-4 after:bottom-0 after:h-[2px] after:bg-accent"
                            : "text-muted hover:text-ink"
                        }`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
              </ul>
            </nav>

            {/* The phone number used to sit here. It moved to the floating
                buttons at the bottom left (`FloatingContact`), because this
                header retracts on the way down the page and took the only way
                to call with it. */}
            <div className="ml-auto flex items-center gap-2 md:ml-0 md:flex-1 md:justify-end md:gap-5">
              <ThemeToggle />
              <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(true)}
                aria-expanded={open}
                aria-controls="mobile-menu"
                className="-mr-2 inline-flex h-11 w-11 items-center justify-center text-ink hover:bg-surface-subtle md:hidden"
              >
                <MenuIcon />
                <span className="sr-only">Open menu</span>
              </button>
            </div>
          </div>
        </Container>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/50"
          />
          <div
            ref={panelRef}
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className="absolute inset-y-0 right-0 flex w-full max-w-xs flex-col bg-surface"
          >
            <div className="flex h-16 items-center justify-between border-b border-line px-5">
              <Logo />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="-mr-2 inline-flex h-11 w-11 items-center justify-center text-ink hover:bg-surface-subtle"
              >
                <CloseIcon />
                <span className="sr-only">Close menu</span>
              </button>
            </div>

            <nav aria-label="Mobile" className="flex-1 overflow-y-auto">
              <ul>
                {primaryNav.map((link) => (
                  <li key={link.href} className="border-b border-line">
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive(link.href) ? "page" : undefined}
                      className={`block px-5 py-4 text-base font-medium ${
                        isActive(link.href)
                          ? "text-accent"
                          : "text-ink hover:bg-surface-subtle"
                      }`}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
