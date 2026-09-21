import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { ResetForm } from "./ResetForm";
import { Logo } from "@/components/layout/Logo";

export const metadata = pageMetadata({
  title: "Reset password",
  description: "Set a new password for your account.",
  path: "/admin/reset",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function AdminResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7faf8] px-4 py-12">
      <div className="mb-8">
        <Link href="/">
          <Logo />
        </Link>
      </div>
      <div className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-[2rem] leading-tight sm:text-[2.5rem] font-semibold tracking-tight text-ink">
            Set a new password
          </h1>
          <p className="mt-3 leading-relaxed text-body">
            Choose a strong password to protect your admin account.
          </p>
        </div>

        <div className="mt-10 border border-line bg-surface-raised p-6 shadow-card sm:p-8">
          {token ? (
            <ResetForm token={token} />
          ) : (
            <p className="text-center text-sm font-medium text-red-600">
              This link is missing a token. Please use the exact link from your
              email.
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/admin" className="text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
