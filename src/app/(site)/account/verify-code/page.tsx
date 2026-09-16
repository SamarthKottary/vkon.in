import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { getCurrentCustomer } from "@/lib/account";
import { findCustomerById } from "@/lib/db/customers";
import { readChallenge } from "@/lib/signin-challenge";
import { pageMetadata } from "@/lib/seo";
import { CodeForm } from "./CodeForm";

export const metadata = pageMetadata({
  title: "Enter your code",
  description: "Finish signing in to your Vkon Automation account.",
  path: "/account/verify-code",
  noIndex: true,
});

export const dynamic = "force-dynamic";

/**
 * Step two of signing in, reached only with a pending challenge cookie.
 *
 * The cookie names the account; this page turns that into an address to show
 * and nothing more. Somebody who lands here without a challenge — a bookmark,
 * a back button after finishing — is sent to the sign-in form rather than
 * shown an empty box, and somebody already signed in has no business here at
 * all.
 */
export default async function VerifyCodePage() {
  if (await getCurrentCustomer()) redirect("/account");

  const challenge = await readChallenge();
  if (!challenge) redirect("/account/login");

  const customer = await findCustomerById(challenge.customerId).catch(() => null);
  if (!customer) redirect("/account/login");

  return (
    <section className="py-12 sm:py-16 lg:py-20">
      <Container size="wide">
        <div className="mx-auto w-full max-w-md">
          <div className="text-center">
            <h1 className="text-[2rem] leading-tight sm:text-[2.5rem]">
              Check your email
            </h1>
            <p className="mt-3 leading-relaxed text-body">
              We have sent a six-digit code to finish signing you in. We only
              ask for this on a device we have not seen you on before.
            </p>
          </div>

          <div className="mt-10 border border-line bg-surface-raised p-6 shadow-card sm:p-8">
            <CodeForm email={customer.email} />
          </div>
        </div>
      </Container>
    </section>
  );
}
