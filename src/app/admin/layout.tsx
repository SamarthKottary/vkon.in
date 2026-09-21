import Link from "next/link";
import type { Metadata } from "next";
import { LogoutIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { getAdminSession } from "@/lib/auth";
import { Avatar } from "@/components/account/Avatar";
import { logoutAction } from "./actions";

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
  // User Access Levels: only super and admin.
  const showAccess = admin?.role === "super" || admin?.role === "admin";

  return (
    <div className="flex min-h-full flex-col bg-surface-subtle">
      <header className="border-b border-line bg-surface">
        <Container size="wide">
          {/* `flex-wrap` and `min-h-14` rather than `h-14`: this row has never
              fitted a phone — it overflowed at 390px with four nav links long
              before Orders was a fifth — and a fixed height turns wrapping
              into overlapping. Nothing changes above `sm`. */}
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2 sm:py-0">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/admin/products" className="flex items-baseline gap-2.5">
                <span className="text-lg font-semibold tracking-[-0.03em] text-ink">
                  Vkon
                </span>
                <span className="label-tech text-muted">Automation · Admin</span>
              </Link>

              {authed && (
                <nav aria-label="Admin" className="flex flex-wrap items-center gap-x-5 gap-y-1">
                  <Link
                    href="/admin/products"
                    className="text-sm text-muted hover:text-ink"
                  >
                    Products
                  </Link>
                  {/* Orders before Enquiries: an order is a commitment
                      somebody is waiting on, an enquiry is a question. */}
                  <Link
                    href="/admin/orders"
                    className="text-sm text-muted hover:text-ink"
                  >
                    Orders
                  </Link>
                  <Link
                    href="/admin/users"
                    className="text-sm text-muted hover:text-ink"
                  >
                    Users
                  </Link>
                  <Link
                    href="/admin/enquiries"
                    className="text-sm text-muted hover:text-ink"
                  >
                    Enquiries
                  </Link>
                  <Link
                    href="/admin/subscribers"
                    className="text-sm text-muted hover:text-ink"
                  >
                    Subscribers
                  </Link>
                  {showSeo && (
                    <Link
                      href="/admin/seo"
                      className="text-sm text-muted hover:text-ink"
                    >
                      SEO
                    </Link>
                  )}
                  {showAccess && (
                    <Link
                      href="/admin/users/access"
                      className="text-sm text-muted hover:text-ink"
                    >
                      Access
                    </Link>
                  )}
                </nav>
              )}
            </div>

            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Link
                href="/"
                className="text-sm text-muted hover:text-ink"
                target="_blank"
              >
                View site
              </Link>
              {authed && admin && (
                <>
                  {/* Profile avatar / link */}
                  <Link
                    href="/admin/profile"
                    className="flex items-center gap-2 text-sm text-muted hover:text-ink"
                    title="My profile"
                  >
                    <Avatar name={admin.name} email={admin.email} url={admin.avatarUrl} size={28} />
                    <span className="hidden sm:inline">{admin.name || "Profile"}</span>
                  </Link>

                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 text-sm text-muted hover:text-ink"
                    >
                      <LogoutIcon className="h-4 w-4" />
                      Sign out
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </Container>
      </header>

      <main className="flex-1 py-10">{children}</main>
    </div>
  );
}
