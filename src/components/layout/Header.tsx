"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CartLink } from "@/components/cart/CartLink";
import { Logo } from "@/components/icons/Logo";
import { CloseIcon, MenuIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { HeaderSearch, type SearchEntry } from "@/components/layout/HeaderSearch";
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
 * **How it retracts depends on whether the page has a curtain.**
 *
 * On `/`, `/products`, `/about` and `/contact` the page is a pinned hero or
 * masthead with one opaque sheet rising over it, marked `data-curtain`. There
 * the sheet drives the header: it stays put for the whole time the sheet is
 * still below it — the entire hero, however tall that is on this device — and
 * then the sheet's leading edge carries it off the top, 1:1, as if pushing it
 * (client, 2026-09-03: "the top bar should not go away untill the curtain
 * comes up… It should be like the curtain pushing the top bar up and it goes
 * away"). Scrolling up still returns it immediately, so the nav is never more
 * than a flick away further down a long page.
 *
 * Everywhere else it keeps the original behaviour — retract on the way down,
 * return on the way up — under three rules that keep it from being annoying:
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
export function Header({
  menu = [],
  searchProducts = [],
  suggestionTerms = [],
}: {
  menu?: MenuSector[];
  searchProducts?: SearchEntry[];
  suggestionTerms?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hidden, setHidden] = useState(false);
  const lastYRef = useRef(0);
  const tickingRef = useRef(false);
  const headerRef = useRef<HTMLElement>(null);
  /** Last committed scroll direction, once past the DELTA noise floor. */
  const upRef = useRef(false);
  /**
   * The current page's curtain sheet, or null on a page without one.
   *
   * Looked up from the DOM rather than passed in as a prop because the curtain
   * belongs to the page and the header belongs to the layout — `(site)/layout`
   * renders this component once for every route under it and never re-renders
   * per page, so there is nothing to thread a prop through.
   */
  const curtainRef = useRef<HTMLElement | null>(null);
  const panelOpen = open || productsOpen || searchOpen;
  const panelOpenRef = useRef(false);

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
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const onScroll = useCallback(() => {
    if (tickingRef.current) return;
    tickingRef.current = true;

    window.requestAnimationFrame(() => {
      tickingRef.current = false;
      const y = Math.max(0, window.scrollY);
      const previous = lastYRef.current;
      const header = headerRef.current;
      const curtain = curtainRef.current;

      /* Pages without a curtain keep the original behaviour: retract on the
         way down past HIDE_AFTER, return on the way up. */
      if (!curtain || !header) {
        if (Math.abs(y - previous) < DELTA) return;
        lastYRef.current = y;
        setHidden(y > previous && y > HIDE_AFTER);
        return;
      }

      /* Never retract out from under an open panel — same rule as the class
         expression below, and for the same reason: the drawer's close button
         and the products dropdown both travel with the header. */
      if (panelOpenRef.current) return;

      /**
       * On a curtain page the sheet drives the header, not the scroll
       * direction (client: "the top bar should not go away untill the curtain
       * comes up… It should be like the curtain pushing the top bar up and it
       * goes away").
       *
       * `push` is how far the curtain's leading edge has travelled into the
       * header's own band: 0 for the whole time the sheet is still below the
       * header — which is the entire pinned hero or masthead, the part the
       * client wants the nav to sit through — then rising 1:1 with the sheet
       * until it has taken the header's full height. Reading the edge's real
       * position is what keeps this correct on every page and viewport: the
       * hero is a screenful tall on a desktop and content-tall on a phone, so
       * there is no scroll distance that could have been hard-coded here.
       */
      const height = header.offsetHeight;
      const edge = curtain.getBoundingClientRect().top;
      const push = Math.min(height, Math.max(0, height - edge));

      /* The direction still matters, but only to bring the header back: the
         DELTA floor gates the direction, never the push, so the push stays
         pixel-continuous instead of stepping in 6px jumps. */
      let up = upRef.current;
      if (Math.abs(y - previous) >= DELTA) {
        up = y < previous;
        upRef.current = up;
        lastYRef.current = y;
      }

      const offset = up ? 0 : push;
      /* Rigid while the curtain is pushing — a transition here would let the
         header drift out of contact with the edge that is supposed to be
         moving it — and eased on the way back, which is the one moment it
         moves on its own. Clearing the property returns it to the class. */
      header.style.transition = up ? "" : "none";
      header.style.transform = offset === 0 ? "" : `translate3d(0,${-offset}px,0)`;
    });
  }, []);

  /* The curtain belongs to the page, so a client-side navigation swaps it.
     Clearing the inline transform matters as much as re-reading the element:
     left behind on a page with no curtain to bring it back, it would strand
     the header off screen. */
  useEffect(() => {
    curtainRef.current = document.querySelector<HTMLElement>("[data-curtain]");
    const header = headerRef.current;
    if (header) {
      header.style.transition = "";
      header.style.transform = "";
    }
  }, [pathname]);

  /* Mirrored into a ref because `onScroll` is built once and never sees a
     later render's state. Clearing the transform on open is what actually
     brings the header back down under a panel opened while it was pushed. */
  useEffect(() => {
    panelOpenRef.current = panelOpen;
    if (!panelOpen) return;
    const header = headerRef.current;
    if (header) {
      header.style.transition = "";
      header.style.transform = "";
    }
  }, [panelOpen]);

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
        ref={headerRef}
        /* `relative` is what the dropdown positions against. It must not
           retract while that panel is open, or the panel travels off screen
           with it.

           These classes are the whole story only on a page with no curtain.
           Where there is one, `onScroll` writes an inline transform instead
           and `hidden` stays false — the inline value wins, and clearing it
           hands the header back to `translate-y-0` here. */
        className={`sticky top-0 z-50 border-b border-line bg-surface transition-transform duration-300 ${
          hidden && !open && !productsOpen && !searchOpen ? "-translate-y-full" : "translate-y-0"
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
              {/* `data-brand-logo` is the landing target the intro splash flies
                  its logo to; see `layout/IntroSplash`. */}
              <Link href="/" data-brand-logo className="inline-flex items-center">
                <Logo />
              </Link>
            </div>

            <nav aria-label="Primary" className="hidden md:block">
              <ul className="flex items-center">
                {/* Home first, then the Products dropdown (client, 2026-08-31:
                    "add HOME button before PRODUCTS") — `ProductsMenu` is its
                    own component with its own trigger, not one of the plain
                    links `primaryNav.map` below renders, so Home has to be
                    placed explicitly ahead of it here rather than simply
                    reordering the array. */}
                {primaryNav
                  .filter((link) => link.href === "/")
                  .map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={isActive(link.href) ? "page" : undefined}
                        className={`relative flex h-16 items-center px-4 text-sm font-medium uppercase transition-colors ${
                          isActive(link.href)
                            ? "text-ink after:absolute after:inset-x-4 after:bottom-0 after:h-[2px] after:bg-accent"
                            : "text-muted hover:text-ink"
                        }`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}

                <li>
                  <ProductsMenu
                    menu={menu}
                    open={productsOpen}
                    onToggle={() => {
                      /* Both this panel and `HeaderSearch`'s are `absolute
                         inset-x-0 top-full` against the same positioned
                         `Container` — unlike the mobile drawer (which
                         visually covers this whole row while open, making
                         the point moot), search's trigger stays reachable
                         while this one is open, since neither sits below
                         `md` where the other is hidden. Two panels open at
                         once would render on top of each other at the
                         identical position, so opening one closes the
                         other. */
                      setSearchOpen(false);
                      setProductsOpen((v) => !v);
                    }}
                    onClose={closeProducts}
                    active={isActive("/products")}
                  />
                </li>

                {primaryNav
                  .filter((link) => link.href !== "/products" && link.href !== "/")
                  .map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={isActive(link.href) ? "page" : undefined}
                        className={`relative flex h-16 items-center px-4 text-sm font-medium uppercase transition-colors ${
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
              <HeaderSearch
                products={searchProducts}
                suggestionTerms={suggestionTerms}
                open={searchOpen}
                onToggle={() => {
                  setProductsOpen(false);
                  setSearchOpen((v) => !v);
                }}
                onClose={closeSearch}
              />
              <CartLink />
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
                      className={`block px-5 py-4 text-base font-medium uppercase ${
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
