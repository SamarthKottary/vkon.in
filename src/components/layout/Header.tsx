"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/icons/Logo";
import { CloseIcon, MenuIcon, PhoneIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { primaryNav } from "@/content/nav";
import { site } from "@/content/site";
import { telLink } from "@/lib/contact";

/**
 * Flat header on a hairline rule. No blur, no shadow, no colour change on
 * scroll — the rule is always there and the header simply stays put.
 *
 * Dropping `backdrop-blur` also removed the containing block that used to trap
 * the fixed drawer, so the drawer no longer needs to be a sibling. It still is,
 * because a dialog belongs outside the banner landmark.
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-surface">
        <Container size="wide">
          <div className="flex h-16 items-center justify-between gap-6">
            {/* Logo and nav travel together on the left, so the primary links
                sit next to the brand rather than floating mid-header. The
                right-hand group is pushed over by justify-between on the
                parent — exactly one of the two right-hand groups is ever
                displayed, so it always resolves to a clean two-column bar. */}
            <div className="flex items-center gap-1">
              <Link href="/" className="shrink-0">
                <Logo />
              </Link>

              <nav aria-label="Primary" className="hidden md:ml-6 md:block">
                <ul className="flex items-center">
                  {primaryNav.map((link) => (
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
            </div>

            <div className="hidden items-center gap-5 md:flex">
              <a
                href={telLink()}
                className="flex items-center gap-2 text-sm font-medium text-ink hover:text-accent"
              >
                <PhoneIcon className="h-4 w-4 text-muted" />
                {site.phone.display}
              </a>
              <ThemeToggle />
            </div>

            <div className="flex items-center gap-2 md:hidden">
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
