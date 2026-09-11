import Link from "next/link";
import { AlertIcon, CheckIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { pageMetadata } from "@/lib/seo";
import { confirmEmail, type VerifyOutcome } from "../actions";

export const metadata = pageMetadata({
  title: "Confirm your email",
  description: "Confirming your email address.",
  path: "/account/verify",
  noIndex: true,
});

export const dynamic = "force-dynamic";

/**
 * Where the link in the welcome mail lands.
 *
 * The token is consumed during the render, which is a write during a GET. That
 * is the shape every email-confirmation link has and it is fine here: the
 * write is idempotent, the token is single-use, and a link in an email cannot
 * be a POST. What it does mean is that this page must never be prefetched or
 * cached — `force-dynamic` above, and no `<Link>` anywhere points at it.
 */
const COPY: Record<VerifyOutcome, { heading: string; body: string; ok: boolean }> = {
  ok: {
    heading: "Email confirmed",
    body: "Thank you. That is your address confirmed — nothing else to do.",
    ok: true,
  },
  used: {
    heading: "Already confirmed",
    body: "This link has been used once already, which means your address is confirmed.",
    ok: true,
  },
  expired: {
    heading: "That link has expired",
    body: "Confirmation links are good for 48 hours. Nothing is lost — your account works either way, and we can send a new link when you next need one.",
    ok: false,
  },
  invalid: {
    heading: "That link is not valid",
    body: "It may have been copied incompletely. Try opening the link from your email again rather than pasting it.",
    ok: false,
  },
  unavailable: {
    heading: "We could not check that just now",
    body: "Something went wrong at our end. Please try the link again in a few minutes.",
    ok: false,
  },
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const outcome = await confirmEmail(token ?? "");
  const copy = COPY[outcome];

  return (
    <section className="py-16 sm:py-20 lg:py-24">
      <Container size="wide">
        <div className="mx-auto max-w-md border border-line bg-surface-raised p-8 text-center shadow-card">
          <span
            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
              copy.ok ? "bg-accent-soft text-accent" : "bg-surface-subtle text-muted"
            }`}
          >
            {copy.ok ? <CheckIcon className="h-7 w-7" /> : <AlertIcon className="h-7 w-7" />}
          </span>

          <h1 className="mt-6 text-2xl font-semibold text-ink">{copy.heading}</h1>
          <p className="mt-3 text-sm leading-relaxed text-body">{copy.body}</p>

          <Link
            href="/account"
            className="mt-8 inline-flex h-11 items-center justify-center bg-action px-6 text-sm font-medium text-action-ink transition-colors hover:bg-action-hover"
          >
            Go to my account
          </Link>
        </div>
      </Container>
    </section>
  );
}
