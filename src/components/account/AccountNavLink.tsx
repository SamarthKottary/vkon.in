"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * One sidebar link, which knows whether it is the current page.
 *
 * The only client component in the account shell. `usePathname` is the whole
 * reason it exists — everything else in `AccountShell` renders on the server.
 *
 * `/account` is matched exactly rather than by prefix, or it would light up on
 * `/account/orders` and `/account/addresses` as well and there would be two
 * current pages at once.
 */
export function AccountNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = href === "/account" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-11 items-center whitespace-nowrap border px-4 text-sm font-medium transition-colors lg:h-auto lg:border-0 lg:px-0 lg:py-3.5 ${
        active
          ? "border-accent bg-accent-soft text-ink lg:bg-transparent lg:text-accent"
          : "border-line text-muted hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
