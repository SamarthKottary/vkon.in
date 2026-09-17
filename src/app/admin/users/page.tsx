import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { isAuthenticated } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listCustomersForAdmin, type AdminCustomer } from "@/lib/db/customers";
import { formatPaise } from "@/lib/pricing";
import { setSigninCodeExemptAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

/**
 * Every customer account (client, 2026-09-17: "add user section to the admin
 * to know all users").
 *
 * Read-only apart from one switch: whether the account is asked for the
 * emailed sign-in code. Turning that off is for review accounts — the login
 * Razorpay's website verification asks for — and nothing else, so an account
 * without the code is shown in amber at the top of its row.
 *
 * No delete. An account owns orders, which are the business's records as much
 * as the customer's, and removing one is a decision with consequences this
 * page is not the place to take.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; updated?: string; error?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/admin");

  const { q = "", updated, error } = await searchParams;
  const users = await listCustomersForAdmin(q);
  const withOrders = users.filter((u) => u.orderCount > 0).length;
  const reviewAccounts = users.filter((u) => u.signinCodeExempt).length;

  return (
    <Container size="wide">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Users</h1>
          <p className="mt-1 text-sm text-muted">
            {users.length} {q ? "matching" : "total"} · {withOrders} with orders
            {reviewAccounts > 0 && ` · ${reviewAccounts} without the sign-in code`}
          </p>
        </div>

        {/* A plain GET form: the search lives in the URL, so a filtered list
            can be reloaded or bookmarked, and no client code is needed. */}
        <form action="/admin/users" className="flex w-full gap-2 sm:w-auto">
          <label htmlFor="user-search" className="sr-only">
            Search users
          </label>
          <input
            id="user-search"
            name="q"
            defaultValue={q}
            placeholder="Name, email or phone"
            className="h-10 min-w-0 flex-1 border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink sm:w-72"
          />
          <button
            type="submit"
            className="h-10 border border-line-strong px-4 text-sm font-medium text-ink hover:border-ink hover:bg-surface-subtle"
          >
            Search
          </button>
        </form>
      </div>

      {!isDatabaseConfigured() && (
        <div className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm">
          <p className="font-medium text-ink">No database configured</p>
        </div>
      )}

      {(updated || error) && (
        <p
          role="status"
          className={`mt-6 border-l-2 bg-surface px-4 py-3 text-sm text-ink ${
            error ? "border-signal-500" : "border-accent"
          }`}
        >
          {error
            ? "Could not update that account."
            : updated === "off"
              ? "Sign-in code turned off for that account. It now signs in with its password alone — turn the code back on once the review is done."
              : "Sign-in code turned back on for that account."}
        </p>
      )}

      <div className="mt-8 space-y-3">
        {users.length === 0 ? (
          <div className="border border-line bg-surface px-6 py-16 text-center">
            <p className="text-ink">{q ? `No users match “${q}”.` : "No users yet."}</p>
          </div>
        ) : (
          users.map((user) => <UserCard key={user.id} user={user} q={q} />)
        )}
      </div>
    </Container>
  );
}

function UserCard({ user, q }: { user: AdminCustomer; q: string }) {
  return (
    <article
      id={`user-${user.id}`}
      className={`scroll-mt-24 border bg-surface p-5 ${
        user.signinCodeExempt ? "border-signal-500" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">{user.name || "No name"}</h2>
            {user.hasPassword && <Badge>Password</Badge>}
            {user.hasGoogle && <Badge>Google</Badge>}
            {user.emailVerified ? <Badge tone="brand">Email confirmed</Badge> : <Badge>Unconfirmed</Badge>}
            {user.signinCodeExempt && <Badge tone="warn">No sign-in code</Badge>}
          </div>
          <p className="mt-1.5 break-all text-sm text-body">
            <a href={`mailto:${user.email}`} className="hover:text-accent hover:underline">
              {user.email}
            </a>
            {user.phone && (
              <>
                {" · "}
                <a
                  href={`tel:${user.phone.replace(/[^\d+]/g, "")}`}
                  className="font-mono hover:text-accent hover:underline"
                >
                  {user.phone}
                </a>
              </>
            )}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <Stat label="Orders" value={user.orderCount === 0 ? "None" : String(user.orderCount)} />
          <Stat label="Spent" value={user.orderTotal > 0 ? formatPaise(user.orderTotal) : "—"} />
          <Stat label="Joined" value={formatDate(user.createdAt)} />
          <Stat label="Last sign-in" value={user.lastSignInAt ? formatDate(user.lastSignInAt) : "—"} />
        </dl>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <p className="text-muted">
          {user.addressCount === 0
            ? "No saved addresses"
            : `${user.addressCount} saved address${user.addressCount === 1 ? "" : "es"}`}
        </p>

        <form
          action={setSigninCodeExemptAction}
          className="flex flex-wrap items-center gap-x-3 gap-y-2"
        >
          <input type="hidden" name="id" value={user.id} />
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="exempt" value={user.signinCodeExempt ? "0" : "1"} />
          <span className="text-muted">
            {user.signinCodeExempt
              ? "Signs in with password only"
              : "Asked for an emailed code on new browsers"}
          </span>
          <button
            type="submit"
            className="h-9 whitespace-nowrap border border-line-strong px-3 font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
          >
            {user.signinCodeExempt ? "Turn code back on" : "Turn off code (review account)"}
          </button>
        </form>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-tech text-muted">{label}</dt>
      <dd className="mt-0.5 tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/* Fixed locale and zone, as on the other admin pages: rendered on a server
   that may be anywhere. */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
