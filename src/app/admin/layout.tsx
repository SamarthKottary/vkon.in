import Link from "next/link";
import type { Metadata } from "next";
import { LogoutIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { isAuthenticated } from "@/lib/auth";
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
  const authed = await isAuthenticated();

  return (
    <div className="flex min-h-full flex-col bg-surface-subtle">
      <header className="border-b border-line bg-surface">
        <Container size="wide">
          <div className="flex h-14 items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <Link href="/admin/products" className="flex items-baseline gap-2.5">
                <span className="text-lg font-semibold tracking-[-0.03em] text-ink">
                  Vkon
                </span>
                <span className="label-tech text-muted">Automation · Admin</span>
              </Link>

              {authed && (
                <nav aria-label="Admin" className="flex items-center gap-5">
                  <Link
                    href="/admin/products"
                    className="text-sm text-muted hover:text-ink"
                  >
                    Products
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
                  <Link
                    href="/admin/seo"
                    className="text-sm text-muted hover:text-ink"
                  >
                    SEO
                  </Link>
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
              {authed && (
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 text-sm text-muted hover:text-ink"
                  >
                    <LogoutIcon className="h-4 w-4" />
                    Sign out
                  </button>
                </form>
              )}
            </div>
          </div>
        </Container>
      </header>

      <main className="flex-1 py-10">{children}</main>
    </div>
  );
}
