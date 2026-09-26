import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { ForgotForm } from "./ForgotForm";
import { Logo } from "@/components/icons/Logo";

export const metadata = pageMetadata({
  title: "Forgotten password",
  description: "Send yourself a link to set a new password.",
  path: "/admin/forgot",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default function AdminForgotPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-12">
      <div className="mb-8">
        <Link href="/">
          <Logo />
        </Link>
      </div>
      <div className="w-full max-w-md">
        <div className="text-center">
          {/* Not "superuser" (client, 2026-09-26: an inventory user pressed
              Forgotten password and was told this page was for somebody else).
              It is every operator's now — admin, support, viewer, inventory —
              and the wording says what it does rather than who it is for. */}
          <h1 className="text-[2rem] leading-tight sm:text-[2.5rem] font-semibold tracking-tight text-ink">
            Reset your password
          </h1>
          <p className="mt-3 leading-relaxed text-body">
            Give us the email address on your account and we will send you a
            link to choose a new password.
          </p>
        </div>

        <div className="mt-10 border border-line bg-surface-raised p-6 shadow-card sm:p-8">
          <ForgotForm />
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
