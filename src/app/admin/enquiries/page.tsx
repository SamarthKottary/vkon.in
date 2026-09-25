import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { requireAdminPage } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { enquiryCounts, listEnquiriesPage } from "@/lib/db/enquiries";
import { InfoNote } from "@/components/admin/InfoNote";
import { ListPager, ListSearch } from "@/components/admin/ListControls";
import { listSearch, readListQuery } from "@/lib/admin-list";
import { EnquiryActions } from "./EnquiryActions";

export const dynamic = "force-dynamic";

/**
 * The enquiry inbox.
 *
 * **Nothing tells you an enquiry has arrived.** No mail is sent by this
 * codebase, so this page is the only place one appears — which is why the
 * contact page puts phone and WhatsApp above the form, and why the count of
 * unhandled enquiries is the loudest thing here. docs/ADMIN.md §7.7 records
 * what closing that gap would take.
 */
export default async function AdminEnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string; error?: string; q?: string; page?: string }>;
}) {
  const admin = await requireAdminPage();

  const params = await searchParams;
  const { removed, error } = params;
  /* Search by name, email or phone, a fixed number per page (client,
     2026-09-19). The header still counts every enquiry. */
  const query = readListQuery(params);
  const [{ rows: enquiries, total, page }, counts] = await Promise.all([
    listEnquiriesPage(query),
    enquiryCounts(),
  ]);
  const open = counts.open;
  const keep = { q: query.q };
  /* Posted with each card's buttons, so they come back to this page. */
  const view = listSearch({ q: query.q, page });

  return (
    <Container size="wide">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl">Enquiries</h1>
          <p className="mt-1 text-sm text-muted">
            {counts.total} total ·{" "}
            {open === 0 ? "none waiting" : `${open} waiting for a reply`}
          </p>
        </div>

        <ListSearch
          path="/admin/enquiries"
          q={query.q}
          placeholder="Name, email or phone"
          label="Search enquiries"
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
          {error ? "Could not do that." : "Enquiry deleted."}
        </p>
      )}

      <InfoNote title="How this page works">
        <p>
          <span className="font-medium text-ink">Nothing is emailed to you.</span>{" "}
          An enquiry appears here and nowhere else, so this page needs checking
          through the day. Reply from your own phone or mail client using the
          details on each one.
        </p>
        <p>
          Search by name, email address or phone number; ten enquiries are
          shown at a time. Marking one handled keeps it — it is a record of who
          asked for what, and when.
        </p>
      </InfoNote>

      <div className="mt-8 space-y-4">
        {enquiries.length === 0 ? (
          <div className="border border-line bg-surface px-6 py-16 text-center">
            {query.q ? (
              <p className="text-ink">No enquiries match “{query.q}”.</p>
            ) : (
              <>
                <p className="text-ink">No enquiries yet.</p>
                <p className="mt-1 text-sm text-muted">
                  Messages sent from the contact page appear here.
                </p>
              </>
            )}
          </div>
        ) : (
          enquiries.map((enquiry) => (
            <article
              key={enquiry.id}
              id={`enquiry-${enquiry.id}`}
              className={`scroll-mt-24 border bg-surface p-5 ${
                enquiry.handled ? "border-line opacity-70" : "border-line-strong"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-ink">{enquiry.name}</h2>
                    {enquiry.handled ? (
                      <Badge>Handled</Badge>
                    ) : (
                      <Badge tone="brand">New</Badge>
                    )}
                  </div>
                  <p className="label-tech mt-1.5 text-muted">
                    {formatDate(enquiry.createdAt)}
                    {enquiry.source ? ` · from ${enquiry.source}` : ""}
                  </p>
                </div>

                <EnquiryActions
                  id={enquiry.id}
                  name={enquiry.name}
                  handled={enquiry.handled}
                  view={view}
                  role={admin.role}
                />
              </div>

              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="label-tech pt-0.5 text-muted">Email</dt>
                  <dd>
                    <a
                      href={`mailto:${enquiry.email}?subject=${encodeURIComponent(
                        "Re: your enquiry to Vkon Automation",
                      )}`}
                      className="break-all font-mono text-ink hover:text-accent"
                    >
                      {enquiry.email}
                    </a>
                  </dd>
                </div>
                {enquiry.phone && (
                  <div className="flex gap-2">
                    <dt className="label-tech pt-0.5 text-muted">Phone</dt>
                    <dd>
                      <a
                        href={`tel:${enquiry.phone.replace(/[^\d+]/g, "")}`}
                        className="font-mono text-ink hover:text-accent"
                      >
                        {enquiry.phone}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>

              {/* `whitespace-pre-wrap` so the line breaks somebody typed survive.
                  The value is interpolated as text, never as markup. */}
              <p className="mt-4 whitespace-pre-wrap border-t border-line pt-4 leading-relaxed text-body">
                {enquiry.message}
              </p>
            </article>
          ))
        )}
        {total > 0 && (
          <div className="border border-line bg-surface">
            <ListPager path="/admin/enquiries" page={page} total={total} keep={keep} />
          </div>
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
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
