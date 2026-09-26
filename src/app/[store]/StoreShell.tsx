"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/icons/Logo";
import { ConsoleSidebar } from "@/components/layout/ConsoleSidebar";
import { LogoutIcon } from "@/components/icons/ui";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { storeSignOutAction } from "./actions";

/**
 * The frame every store page sits in: the store's name, **Stocks** and
 * **Profile**, and a way out.
 *
 * **Down the left, like the admin** (client, 2026-09-26) and in the same
 * component, so a store console and the admin console are the same shape on a
 * phone as on a desk. Two places to be, so two links and no menu: counting what
 * is on the shelves, which is the page it opens on, and the store's own
 * details.
 *
 * Signed out there is no sidebar at all — a sign-in form needs no navigation,
 * and a column of links to pages that will bounce you is worse than none.
 */
export function StoreShell({
  slug,
  name,
  signedIn,
  children,
}: {
  slug: string;
  name: string;
  signedIn: boolean;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const onProfile = path?.endsWith("/profile") ?? false;

  const logo = (
    <Link href={`/${slug}`} className="flex min-w-0 items-baseline gap-2.5">
      <Logo className="h-6 w-auto shrink-0" />
      <span className="label-tech truncate text-muted">{name}</span>
    </Link>
  );

  if (!signedIn) {
    return (
      <div className="flex min-h-screen flex-col bg-surface-subtle">
        <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-4 sm:h-16 sm:px-6">
          {logo}
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">{children}</main>
      </div>
    );
  }

  const link = (href: string, label: string, current: boolean) => (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`rounded-md px-3 py-2 text-sm transition-colors ${
        current ? "bg-surface-subtle font-medium text-ink" : "text-muted hover:bg-surface-subtle hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex min-h-screen flex-col bg-surface-subtle sm:flex-row">
      <ConsoleSidebar logo={logo}>
        <div className="flex-1 overflow-y-auto">
          <nav aria-label="This store" className="flex flex-col gap-1 p-4">
            {link(`/${slug}`, "Stocks", !onProfile)}
            {link(`/${slug}/profile`, "Profile", onProfile)}
          </nav>
        </div>

        <div className="mt-auto flex flex-col gap-3 border-t border-line p-4">
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <form action={storeSignOutAction}>
              <input type="hidden" name="slug" value={slug} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
              >
                <LogoutIcon className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </ConsoleSidebar>

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
