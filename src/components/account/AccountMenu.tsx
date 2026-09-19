"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LogoutIcon,
  PackageIcon,
  UserIcon,
} from "@/components/icons/ui";
import { logoutAction } from "@/app/(site)/account/actions";
import { handleUserLogout } from "@/lib/cart";
import { Avatar } from "@/components/account/Avatar";

/**
 * The header's account control: a link when signed out, a menu when signed in.
 *
 * **The customer arrives as a prop, read on the server in `(site)/layout`.**
 * Same arrangement as the products dropdown and the search index: the layout
 * is `force-dynamic` and already runs per request, and this component is
 * `"use client"` so it cannot query anything itself. It also means the signed-
 * in state is server-rendered rather than appearing after hydration, so the
 * header does not flicker from "Sign in" to a name on every page load.
 *
 * **Only a display name and an email come through.** Nothing about the session
 * or the account beyond what is drawn here is sent to the browser.
 */

export type HeaderCustomer = { name: string; email: string; avatarUrl: string | null };

export function AccountMenu({ customer }: { customer: HeaderCustomer | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /* Signed out: a plain link, and the page it goes to comes back here
     afterwards. `next` is read and re-checked server-side (`safeNext`), so a
     crafted value cannot turn the sign-in into an off-site redirect. */
  const signInHref =
    pathname && pathname.startsWith("/account")
      ? "/account/login"
      : `/account/login?next=${encodeURIComponent(pathname || "/")}`;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!customer) {
    return (
      <Link
        href={signInHref}
        className="inline-flex h-11 items-center justify-center gap-2 px-1 text-ink transition-colors hover:text-accent md:px-2"
      >
        <UserIcon className="h-5 w-5" />
        <span className="hidden text-sm font-medium uppercase lg:inline">Sign in</span>
      </Link>
    );
  }

  const first = customer.name.trim().split(/\s+/)[0] || "Account";

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-11 items-center justify-center gap-2 px-1 text-ink transition-colors hover:text-accent md:px-2"
      >
        {/* Their picture, or the initial as before (2026-09-19). */}
        <Avatar name={customer.name} email={customer.email} url={customer.avatarUrl} size={28} />
        {/* The visible text leads the accessible name — §9's rule about
            `aria-label` replacing visible text and breaking voice control.
            Below `lg` there is no visible text, so the name comes from the
            `sr-only` span instead of an attribute that would override it. */}
        <span className="hidden max-w-[7rem] truncate text-sm font-medium lg:inline">
          {first}
        </span>
        <span className="sr-only lg:hidden">My account</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="My account"
          className="absolute right-0 top-full z-50 mt-1 w-60 border border-line bg-surface-raised shadow-card"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{customer.name || first}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{customer.email}</p>
          </div>

          <nav className="py-1">
            <MenuLink href="/account" onNavigate={() => setOpen(false)}>
              <UserIcon className="h-4 w-4" />
              My account
            </MenuLink>
            <MenuLink href="/account/orders" onNavigate={() => setOpen(false)}>
              <PackageIcon className="h-4 w-4" />
              Order history
            </MenuLink>
          </nav>

          {/* A form, not a link. Signing out is a state change, and a GET that
              changes state can be triggered by any image tag on any page —
              which is how a prefetch or a scanner logs somebody out. */}
          <form
            action={logoutAction}
            onSubmit={() => handleUserLogout()}
            className="border-t border-line"
          >
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-subtle"
            >
              <LogoutIcon className="h-4 w-4" />
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink transition-colors hover:bg-surface-subtle"
    >
      {children}
    </Link>
  );
}
