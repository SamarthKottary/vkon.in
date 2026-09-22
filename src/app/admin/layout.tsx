import Link from "next/link";
import type { Metadata } from "next";
import { LogoutIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { getAdminSession } from "@/lib/auth";
import { Avatar } from "@/components/account/Avatar";
import { logoutAction } from "./actions";
import { AdminSidebar } from "./AdminSidebar";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/** Auth state is read per request; never cache the admin shell. */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminSession();
  const authed = Boolean(admin);

  // SEO link: hidden for everyone except super users (role rule 2026-09-21).
  const showSeo = admin?.role === "super";
  // Reviews: super and admin only.
  const showReviews = admin?.role === "super" || admin?.role === "admin";
  // User Access Levels: only super and admin.
  const showAccess = admin?.role === "super" || admin?.role === "admin";

  return (
    <div className="flex min-h-screen flex-col sm:flex-row bg-surface-subtle">
      <AdminSidebar
        logo={
          <Link href="/admin/products" className="flex items-baseline gap-2.5">
            <span className="text-lg font-semibold tracking-[-0.03em] text-ink">
              Vkon
            </span>
            <span className="label-tech text-muted">Admin</span>
          </Link>
        }
      >
        {authed && (
          <div className="flex-1 overflow-y-auto">
            <nav
              aria-label="Admin"
              className="flex flex-col gap-1 p-4"
            >
              <Link
                href="/admin/products"
                className="px-3 py-2 text-sm text-muted hover:text-ink hover:bg-surface-subtle rounded-md"
              >
                Products
              </Link>
              <Link
                href="/admin/orders"
                className="px-3 py-2 text-sm text-muted hover:text-ink hover:bg-surface-subtle rounded-md"
              >
                Orders
              </Link>
              <Link
                href="/admin/users"
                className="px-3 py-2 text-sm text-muted hover:text-ink hover:bg-surface-subtle rounded-md"
              >
                Users
              </Link>
              {showReviews && (
                <Link
                  href="/admin/reviews"
                  className="px-3 py-2 text-sm text-muted hover:text-ink hover:bg-surface-subtle rounded-md"
                >
                  Reviews
                </Link>
              )}
              <Link
                href="/admin/enquiries"
                className="px-3 py-2 text-sm text-muted hover:text-ink hover:bg-surface-subtle rounded-md"
              >
                Enquiries
              </Link>
              <Link
                href="/admin/subscribers"
                className="px-3 py-2 text-sm text-muted hover:text-ink hover:bg-surface-subtle rounded-md"
              >
                Subscribers
              </Link>
              {showSeo && (
                <Link
                  href="/admin/seo"
                  className="px-3 py-2 text-sm text-muted hover:text-ink hover:bg-surface-subtle rounded-md"
                >
                  SEO
                </Link>
              )}
              {showAccess && (
                <Link
                  href="/admin/users/access"
                  className="px-3 py-2 text-sm text-muted hover:text-ink hover:bg-surface-subtle rounded-md"
                >
                  Access
                </Link>
              )}
            </nav>
          </div>
        )}

        {authed && admin && (
          <div className="flex flex-col gap-3 p-4 border-t border-line mt-auto">
            <div className="flex items-center justify-between">
              <ThemeToggle />
              <Link
                href="/"
                className="text-sm text-muted hover:text-ink"
                target="_blank"
              >
                View site ↗
              </Link>
            </div>
            <Link
              href="/admin/profile"
              className="flex items-center gap-2 text-sm text-muted hover:text-ink mt-2"
              title="My profile"
            >
              <Avatar
                name={admin.name}
                email={admin.email}
                url={admin.avatarUrl}
                size={28}
              />
              <span className="truncate">{admin.name || "Profile"}</span>
            </Link>
            <form action={logoutAction} className="mt-1">
              <button
                type="submit"
                className="flex items-center gap-1.5 text-sm text-muted hover:text-ink"
              >
                <LogoutIcon className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        )}
      </AdminSidebar>

      <main className="flex-1 py-6 sm:py-10 min-w-0">{children}</main>
    </div>
  );
}
