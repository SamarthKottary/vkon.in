import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { pageMetadata } from "@/lib/seo";
import { ForgotForm } from "./ForgotForm";

export const metadata = pageMetadata({
  title: "Forgotten password",
  description: "Send yourself a link to set a new password.",
  path: "/account/forgot",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return (
    <section className="py-12 sm:py-16 lg:py-20">
      <Container size="wide">
        <div className="mx-auto w-full max-w-md">
          <div className="text-center">
            <h1 className="text-[2rem] leading-tight sm:text-[2.5rem]">
              Set a new password
            </h1>
            <p className="mt-3 leading-relaxed text-body">
              Give us the address on your account and we will send you a link.
              It is also how you set a password for the first time if you have
              only ever signed in with Google.
            </p>
          </div>

          <div className="mt-10 border border-line bg-surface-raised p-6 shadow-card sm:p-8">
            <ForgotForm />
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
