import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { BanIcon, EyeIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { InfoNote } from "@/components/admin/InfoNote";
import { requireAdminPage } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listCustomersForAdmin, type AdminCustomer } from "@/lib/db/customers";
import { isSigninCodeOn } from "@/lib/db/settings";
import { formatPaise } from "@/lib/pricing";
import { setSigninCodeAction, blockCustomerAction } from "@/app/admin/actions";
import { DeleteUserButton } from "./DeleteUserButton";

export const dynamic = "force-dynamic";

/**
 * Every customer account (client, 2026-09-17: "add user section to the admin
 * to know all users").
 *
 * Read-only apart from four controls:
 *
 *  - **the sign-in code switch** at the top (super and admin);
 *  - **Login**, which opens that customer's account in a new tab (super,
 *    admin and support);
 *  - **Block / Unblock**, which prevents a customer from signing in. The
 *    button is visible to all roles but only executes for super and admin.
 *  - **Delete** (client, 2026-09-26), which removes the account and
 *    everything it owns. **Super users only**, and refused while the account
 *    has orders — those are the shop's records as much as the customer's, and
 *    `orders.customer_id` is `ON DELETE RESTRICT` to make sure of it.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    filter?: string;
    error?: string;
    /** The card an error belongs to — the message is shown on it, not on top. */
    user?: string;
    orders?: string;
    deleted?: string;
  }>;
}) {
  const admin = await requireAdminPage();
  /* The sign-in code switch is a global security control — super and admin only.
     "Login" is also available to support for customer-service purposes.
     Block/unblock is super and admin only — enforced in the action too.
     Viewer gets read-only access: no controls at all. */
  const canManageCode = admin.role === "super" || admin.role === "admin";
  const canSignInAs = admin.role === "super" || admin.role === "admin" || admin.role === "support";
  const canBlock = admin.role === "super" || admin.role === "admin";
  /* Deletion is the one control with nothing behind it — super only. */
  const canDelete = admin.role === "super";

  const { q = "", filter = "", error, user: flagged = "", orders = "", deleted } = await searchParams;
  const safeFilter = (filter === "active" || filter === "blocked") ? filter : "";

  const [users, codeOn] = await Promise.all([
    listCustomersForAdmin(q, safeFilter),
    canManageCode ? isSigninCodeOn() : Promise.resolve(true),
  ]);
  const withOrders = users.filter((u) => u.orderCount > 0).length;
  const blockedCount = users.filter((u) => u.blockedAt).length;

  return (
    <Container size="wide">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Users</h1>
          <p className="mt-1 text-sm text-muted">
            {users.length} {q ? "matching" : safeFilter ? safeFilter : "total"} · {withOrders} with orders
            {!safeFilter && blockedCount > 0 && ` · ${blockedCount} blocked`}
          </p>
        </div>

        {/* A plain GET form: the search lives in the URL, so a filtered list
            can be reloaded or bookmarked, and no client code is needed. */}
        <form action="/admin/users" className="flex w-full gap-2 sm:w-auto">
          {safeFilter && <input type="hidden" name="filter" value={safeFilter} />}
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

      {error === "access" && (
        <p
          role="alert"
          className="mt-6 flex items-center gap-3 border border-signal-500 bg-surface px-4 py-3 text-sm text-ink"
        >
          <svg aria-hidden className="h-4 w-4 shrink-0 text-signal-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
          <span>
            <span className="font-medium">You don&apos;t have permission to do that.</span>
            {" "}Only Super Users and Admins can block or unblock accounts.
          </span>
        </p>
      )}
      {deleted === "1" && (
        <p
          role="status"
          className="mt-6 border-l-2 border-accent bg-surface px-4 py-3 text-sm text-ink"
        >
          That account and everything it owned have been deleted.
        </p>
      )}
      {error === "block" && (
        <p
          role="status"
          className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-ink"
        >
          Could not block / unblock that account. Try again.
        </p>
      )}
      {error && !["block", "access", "delete", "delete-orders", "delete-access"].includes(error) && (
        <p
          role="status"
          className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-ink"
        >
          Could not change that.
        </p>
      )}

      <InfoNote title="How this page works">
        {canSignInAs && (
          <p>
            <span className="font-medium text-ink">Login</span> opens that
            customer&rsquo;s account in a new tab, exactly as they see it. They are
            not told, and it looks like their own sign-in, so treat it as
            borrowing their account: it is recorded against the session and in
            the server log. It also signs you out of any customer account you
            were using in this browser — your admin login is unaffected.
          </p>
        )}
        {canManageCode && (
          <p>
            <span className="font-medium text-ink">The emailed sign-in code</span>{" "}
            is the second factor on a customer account: signing in from a browser
            they have not used before, they are emailed a six-digit code. The
            switch below turns it off for{" "}
            <span className="font-medium text-ink">every customer at once</span>,
            not one account — while it is off, everybody signs in with their
            password alone. Turn it off only for a review that needs it —
            <span className="font-medium text-ink"> and turn it back on the moment
            that is finished.</span>
          </p>
        )}
        {canBlock && (
          <p>
            <span className="font-medium text-ink">Block</span> prevents a customer
            from signing in immediately — all their active sessions are ended at
            once. Unblocking restores access. Neither deletes the account or its orders.
          </p>
        )}
        <p>
          <span className="font-medium text-ink">Delete</span> (the red bin,
          super users only) removes the account and everything it owns — saved
          addresses, the saved cart, sign-in history and remembered devices —
          and cannot be undone. An account that has{" "}
          <span className="font-medium text-ink">placed an order cannot be
          deleted</span>: the order is the shop&rsquo;s record of what was sold
          and what tax was charged on it. Block those instead.
        </p>
      </InfoNote>

      {canManageCode && <SigninCodeSwitch on={codeOn} q={q} filter={safeFilter} />}

      {/* Filter tabs — All / Active / Blocked */}
      <nav aria-label="Filter users" className="mt-6 flex flex-wrap gap-2">
        {(
          [
            { value: "", label: "All" },
            { value: "active", label: "Active" },
            { value: "blocked", label: "Blocked" },
          ] as const
        ).map(({ value, label }) => {
          const current = safeFilter === value;
          const href = `/admin/users${value || q ? `?${[value ? `filter=${value}` : "", q ? `q=${encodeURIComponent(q)}` : ""].filter(Boolean).join("&")}` : ""}`;
          return (
            <Link
              key={value}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`inline-flex h-9 items-center border px-3 text-sm font-medium transition-colors ${
                current
                  ? "border-ink bg-ink text-surface"
                  : "border-line-strong text-ink hover:border-ink hover:bg-surface-subtle"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 space-y-3">
        {users.length === 0 ? (
          <div className="border border-line bg-surface px-6 py-16 text-center">
            <p className="text-ink">
              {q
                ? `No ${safeFilter || "users"} match "${q}".`
                : safeFilter === "blocked"
                  ? "No blocked accounts."
                  : "No users yet."}
            </p>
          </div>
        ) : (
          users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              canSignInAs={canSignInAs}
              canBlock={canBlock}
              canDelete={canDelete}
              q={q}
              filter={safeFilter}
              problem={flagged === user.id ? { error, orders } : null}
            />
          ))
        )}
      </div>
    </Container>
  );
}

/** Only rendered when the current admin is super or admin. */
function SigninCodeSwitch({ on, q, filter }: { on: boolean; q: string; filter: string }) {
  return (
    <section
      className={`mt-6 border-l-2 bg-surface px-4 py-3 ${on ? "border-line-strong" : "border-signal-500"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="min-w-0 text-sm">
          <span className="font-medium text-ink">Emailed sign-in code</span>
          <span className="text-body">
            {on ? " — on for every customer" : " — off for every customer, password only"}
          </span>
        </p>

        <form action={setSigninCodeAction} className="shrink-0">
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="filter" value={filter} />
          <input type="hidden" name="on" value={on ? "0" : "1"} />
          <button
            type="submit"
            role="switch"
            aria-checked={on}
            aria-label="Emailed sign-in code"
            className={`inline-flex h-7 w-12 items-center border p-0.5 transition-colors ${
              on ? "justify-end border-accent bg-accent" : "justify-start border-line-strong bg-surface-subtle"
            }`}
          >
            <span
              aria-hidden
              className={`block h-5 w-5 transition-colors ${on ? "bg-surface" : "bg-line-strong"}`}
            />
          </button>
        </form>
      </div>
    </section>
  );
}

function UserCard({
  user,
  canSignInAs,
  canBlock,
  canDelete,
  q,
  filter,
  problem,
}: {
  user: AdminCustomer;
  canSignInAs: boolean;
  canBlock: boolean;
  canDelete: boolean;
  q: string;
  filter: string;
  /** Why the last attempt on *this* account did not happen, if it did not. */
  problem: { error?: string; orders?: string } | null;
}) {
  const isBlocked = Boolean(user.blockedAt);
  const who = user.name?.split(" ")[0] || user.email;
  const refusal =
    problem?.error === "delete-orders"
      ? `${user.name || "This account"} has ${problem.orders ?? "some"} order${problem.orders === "1" ? "" : "s"}, and an order is the shop's record of what was sold. Block the account instead.`
      : problem?.error === "delete-access"
        ? "Only super users can delete an account."
        : problem?.error === "delete"
          ? "Could not delete that account. Try again."
          : null;

  return (
    <article
      id={`user-${user.id}`}
      className={`scroll-mt-24 border bg-surface p-5 ${isBlocked ? "border-signal-500 bg-signal-50" : "border-line"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">{user.name || "No name"}</h2>
            {isBlocked && <Badge tone="warn">Blocked</Badge>}
            {user.hasPassword && <Badge>Password</Badge>}
            {user.hasGoogle && <Badge>Google</Badge>}
            {user.emailVerified ? <Badge tone="brand">Email confirmed</Badge> : <Badge>Unconfirmed</Badge>}
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
          {isBlocked && user.blockedAt && (
            <p className="mt-1 text-xs text-signal-700">
              Blocked {formatDate(user.blockedAt)}
            </p>
          )}
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

        {/* Three marks rather than three bordered buttons (client, 2026-09-26):
            the row is the same on every card, so what each control does is
            carried by its icon, and only the destructive one is coloured. */}
        <div className="flex flex-wrap items-center gap-1">
          {/* Opens the customer's own account in a new tab. A POST, because it
              starts a session — see the route. */}
          {canSignInAs && !isBlocked && (
            <form action={`/admin/users/${user.id}/signin`} method="post" target="_blank">
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap px-2 font-medium text-ink transition-colors hover:text-accent"
              >
                <EyeIcon className="h-[1.1rem] w-[1.1rem]" />
                {/* The visible word leads the accessible name. */}
                Login
                <span className="sr-only"> as {who}</span>
              </button>
            </form>
          )}

          {/* Block / Unblock — visible to all, executes only for super/admin. */}
          <form action={blockCustomerAction}>
            <input type="hidden" name="id" value={user.id} />
            <input type="hidden" name="block" value={isBlocked ? "0" : "1"} />
            <input type="hidden" name="q" value={q} />
            <input type="hidden" name="filter" value={filter} />
            <button
              type="submit"
              disabled={!canBlock}
              title={canBlock ? undefined : "Only super users and admins can block accounts"}
              className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap px-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                isBlocked ? "text-accent hover:text-accent-strong" : "text-ink hover:text-signal-700"
              }`}
            >
              <BanIcon className="h-[1.1rem] w-[1.1rem]" />
              {isBlocked ? "Unblock" : "Block"}
              <span className="sr-only"> {who}</span>
            </button>
          </form>

          <DeleteUserButton
            id={user.id}
            name={user.name || user.email}
            q={q}
            filter={filter}
            disabled={!canDelete}
          />
        </div>
      </div>

      {/* On the card the button was pressed on, not in a banner at the top of
          the page — the same rule the orders page follows. */}
      {refusal && (
        <p
          role="alert"
          className="mt-3 border-l-2 border-signal-500 bg-surface-subtle px-3 py-2 text-sm text-ink"
        >
          {refusal}
        </p>
      )}
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
