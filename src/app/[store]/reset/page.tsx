import { notFound } from "next/navigation";
import { getStoreBySlug } from "@/lib/db/stores";
import { StoreSetPassword } from "../StoreSetPassword";

export const dynamic = "force-dynamic";

/**
 * The emailed link lands here: choose a password, and go straight in.
 *
 * The token is checked when the form is submitted, not when the page is opened
 * — a link opened twice in a mail client must not burn itself before anybody
 * has typed anything.
 */
export default async function StoreResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ store: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { store: slug } = await params;
  const { token = "" } = await searchParams;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl">Set a password</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        For {store.nickname}. Once it is set you will be signed in.
      </p>
      {token ? (
        <StoreSetPassword slug={store.slug} token={token} />
      ) : (
        <p role="alert" className="mt-6 border border-signal-500 bg-surface px-4 py-3 text-sm text-ink">
          This link is missing its token. Use the exact link from the email, or
          ask for a new one from the store&rsquo;s sign-in page.
        </p>
      )}
    </div>
  );
}
