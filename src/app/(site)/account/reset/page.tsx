import Link from "next/link";
import { AlertIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { pageMetadata } from "@/lib/seo";
import { ResetForm } from "./ResetForm";

export const metadata = pageMetadata({
  title: "Set a new password",
  description: "Choose a new password for your account.",
  path: "/account/reset",
  noIndex: true,
});

export const dynamic = "force-dynamic";

/**
 * Where the link in the reset mail lands.
 *
 * **The token is not checked here, only carried.** Validating it on render
 * would consume it — the check and the use are one atomic UPDATE, by design
 * (see `consumeToken`) — so merely opening the page would burn the link and
 * the form below it would then always fail. A missing token is caught here; a
 * wrong or expired one is reported by the action, after there is a password to
 * set with it.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <section className="py-12 sm:py-16 lg:py-20">
      <Container size="wide">
        <div className="mx-auto w-full max-w-md">
          <div className="text-center">
            <h1 className="text-[2rem] leading-tight sm:text-[2.5rem]">
              Set a new password
            </h1>
          </div>

          <div className="mt-10 border border-line bg-surface-raised p-6 shadow-card sm:p-8">
            {token ? (
              <ResetForm token={token} />
            ) : (
              <div className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle text-muted">
                  <AlertIcon className="h-6 w-6" />
                </span>
                <p className="mt-5 font-medium text-ink">
                  This link is missing its code
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  It was probably copied incompletely. Open the link from your
                  email again, or ask for a new one.
                </p>
                <Link
                  href="/account/forgot"
                  className="mt-6 inline-flex h-11 items-center justify-center bg-action px-6 text-sm font-medium text-action-ink transition-colors hover:bg-action-hover"
                >
                  Send me a new link
                </Link>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-muted">
            <Link href="/account/login" className="text-accent hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </Container>
    </section>
  );
}
