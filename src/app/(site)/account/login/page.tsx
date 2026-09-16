import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { getCurrentCustomer } from "@/lib/account";
import { isGoogleConfigured, safeNext } from "@/lib/google";
import { pageMetadata } from "@/lib/seo";
import { AuthPanel } from "./AuthPanel";

export const metadata = pageMetadata({
  title: "Sign in",
  description: "Sign in to your Vkon Automation account, or register a new one.",
  path: "/account/login",
  /* Nothing to index and nothing a search result should ever land on. */
  noIndex: true,
});

export const dynamic = "force-dynamic";

/** Why the round trip through Google failed, in words rather than a code.
 *  Anything not in this map falls through to `undefined` and shows nothing —
 *  the query string is visitor-controlled, so it is a key into fixed copy and
 *  never itself rendered. */
const NOTICES: Record<string, string> = {
  google: "We could not complete that Google sign-in. Please try again, or use a password.",
  expired: "That sign-in attempt timed out. Please try again.",
  state: "That sign-in could not be verified. Please start again.",
  unverified:
    "Google has not confirmed that email address, so we cannot use it to sign in. Please register with a password instead.",
  checkout: "Please sign in or register to finish your order.",
};

/** Shown after a successful password reset. Separate from `NOTICES` because it
 *  is good news, not a failure, and `resetPasswordAction` sends people here
 *  rather than signing them in — see the note there. */
const RESET_DONE =
  "Your password is set. Please sign in with it.";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; tab?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next ?? "/account");

  /* Already signed in: there is nothing on this page for them, and leaving it
     reachable means a stale tab can present a sign-in form to somebody who is
     already through it. */
  if (await getCurrentCustomer()) redirect(next);

  return (
    <section className="py-12 sm:py-16 lg:py-20">
      <Container size="wide">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-[2rem] leading-tight sm:text-[2.5rem]">Your account</h1>
          <p className="mt-3 leading-relaxed text-body">
            Sign in to see your orders and saved addresses, or register — it
            takes a moment.
          </p>
        </div>

        <div className="mt-10">
          <AuthPanel
            next={next}
            googleEnabled={isGoogleConfigured()}
            initialTab={params.tab === "register" ? "register" : "login"}
            notice={params.reset ? RESET_DONE : params.error ? NOTICES[params.error] : undefined}
          />
        </div>
      </Container>
    </section>
  );
}
