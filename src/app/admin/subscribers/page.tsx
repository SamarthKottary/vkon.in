import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { isAuthenticated } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listSubscribers } from "@/lib/db/subscribers";
import { DeleteSubscriberButton } from "./DeleteSubscriberButton";
import { SubscriberTools } from "./SubscriberTools";

export const dynamic = "force-dynamic";

/**
 * The mailing list.
 *
 * Read and remove only — addresses arrive from the panel above the footer, and
 * there is no "add" here on purpose: an address somebody did not enter
 * themselves has not consented to anything.
 *
 * Nothing on this site sends mail. This page is where you get the list out to
 * whatever does.
 */
export default async function AdminSubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string; error?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/admin");

  const { removed, error } = await searchParams;
  const subscribers = await listSubscribers();

  return (
    <Container size="wide">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl">Subscribers</h1>
          <p className="mt-1 text-sm text-muted">
            {subscribers.length} address{subscribers.length === 1 ? "" : "es"} ·
            collected from the sign-up above the footer
          </p>
        </div>

        <SubscriberTools
          subscribers={subscribers.map((s) => ({
            email: s.email,
            createdAt: s.createdAt,
            source: s.source,
          }))}
        />
      </div>

      {!isDatabaseConfigured() && (
        <div className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm">
          <p className="font-medium text-ink">No database configured</p>
          <p className="mt-1 text-body">
            Set <code className="font-mono text-[0.8125rem]">DATABASE_URL</code> in{" "}
            <code className="font-mono text-[0.8125rem]">.env.local</code> and run{" "}
            <code className="font-mono text-[0.8125rem]">npm run db:setup</code>.
          </p>
        </div>
      )}

      {(removed || error) && (
        <p
          role="status"
          className={`mt-6 border-l-2 bg-surface px-4 py-3 text-sm text-ink ${
            error ? "border-signal-500" : "border-accent"
          }`}
        >
          {error ? "Could not remove that address." : "Address removed."}
        </p>
      )}

      {/* Stated plainly rather than assumed. Someone opening this page for the
          first time will reasonably think the site is mailing these people. */}
      <p className="mt-6 border-l-2 border-line-strong px-4 py-3 text-sm text-body">
        <span className="font-medium text-ink">Nothing is sent from here.</span>{" "}
        The site collects addresses; it does not mail them. Export the list into
        whatever you send with — and add an unsubscribe link there, because this
        page is the only way off the list at the moment.
      </p>

      <div className="mt-8 border border-line bg-surface">
        {subscribers.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-ink">No sign-ups yet.</p>
            <p className="mt-1 text-sm text-muted">
              Addresses entered in the panel above the footer appear here.
            </p>
          </div>
        ) : (
          <ul>
            {subscribers.map((subscriber) => (
              <li
                key={subscriber.id}
                className="flex flex-wrap items-center gap-4 border-b border-line p-4 last:border-b-0 sm:flex-nowrap"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-ink">
                    {subscriber.email}
                  </p>
                  <p className="label-tech mt-1.5 text-muted">
                    {formatDate(subscriber.createdAt)}
                    {subscriber.source ? ` · from ${subscriber.source}` : ""}
                  </p>
                </div>

                <DeleteSubscriberButton
                  id={subscriber.id}
                  email={subscriber.email}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}

/* Fixed locale and time zone, not the server's. Rendered on the server and
   never rehydrated, so leaving either to the environment makes the date depend
   on where the container happens to be running. */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
