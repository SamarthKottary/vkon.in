import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { InfoNote } from "@/components/admin/InfoNote";
import { getAdminSession } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listCustomersForAdmin, type AdminCustomer } from "@/lib/db/customers";
import { isSigninCodeOn } from "@/lib/db/settings";
import { formatPaise } from "@/lib/pricing";
import { setSigninCodeAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

/**
 * Every customer account (client, 2026-09-17: "add user section to the admin
 * to know all users").
 *
 * Read-only apart from two things, both of them super-user and admin only
 * (client, 2026-09-21):
 *
 *  - **the sign-in code switch** at the top, which is on or off for every
 *    customer at once — it replaced a button per account;
 *  - **Sign in as**, which opens that customer's account in a new tab.
 *
 * No delete. An account owns orders, which are the business's records as much
 * as the customer's, and removing one is a decision with consequences this
 * page is not the place to take.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin");
  /* Both controls on this page change how customers sign in, or act as one.
     Support and viewer accounts read the list; they do not get either. */
  const canManage = admin.role === "super" || admin.role === "admin";

  const { q = "", error } = await searchParams;
  const [users, codeOn] = await Promise.all([listCustomersForAdmin(q), isSigninCodeOn()]);
  const withOrders = users.filter((u) => u.orderCount > 0).length;

  return (
    <Container size="wide">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Users</h1>
          <p className="mt-1 text-sm text-muted">
            {users.length} {q ? "matching" : "total"} · {withOrders} with orders
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

      {/* Only failures are announced (client, 2026-09-21). A successful flip
          needs no sentence: the switch beside it has already moved, which is
          the same news said twice. A failure does, because the switch will
          have stayed where it was and silence would read as "nothing
          happened" either way. */}
      {error && (
        <p
          role="status"
          className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-ink"
        >
          Could not change that.
        </p>
      )}

      <InfoNote title="How this page works">
        <p>
          <span className="font-medium text-ink">The emailed sign-in code</span>{" "}
          is the second factor on a customer account: signing in from a browser
          they have not used before, they are emailed a six-digit code. The
          switch below turns it off for{" "}
          <span className="font-medium text-ink">every customer at once</span>,
          not one account — while it is off, everybody signs in with their
          password alone.
        </p>
        <p>
          Turn it off only for a review that needs it — the test login
          Razorpay&rsquo;s website verification asks for, whose reviewers cannot
          read the account&rsquo;s inbox —{" "}
          <span className="font-medium text-ink">and turn it back on the moment
          that is finished.</span>
        </p>
        <p>
          <span className="font-medium text-ink">Sign in as</span> opens that
          customer&rsquo;s account in a new tab, exactly as they see it. They are
          not told, and it looks like their own sign-in, so treat it as
          borrowing their account: it is recorded against the session and in
          the server log. It also signs you out of any customer account you
          were using in this browser — your admin login is unaffected.
        </p>
        <p>
          Both are for super users and admins. Accounts cannot be deleted here:
          an account owns orders, which are the business&rsquo;s records as much
          as the customer&rsquo;s.
        </p>
      </InfoNote>

      <SigninCodeSwitch on={codeOn} q={q} canManage={canManage} />

      <div className="mt-8 space-y-3">
        {users.length === 0 ? (
          <div className="border border-line bg-surface px-6 py-16 text-center">
            <p className="text-ink">{q ? `No users match “${q}”.` : "No users yet."}</p>
          </div>
        ) : (
          users.map((user) => (
            <UserCard key={user.id} user={user} canManage={canManage} />
          ))
        )}
      </div>
    </Container>
  );
}

/**
 * The one switch for the emailed sign-in code (client, 2026-09-21: "a toggle
 * switch to turn code ON/OFF at the top", then "let there just be a switch
 * with a short description, all info should be inside" the info note).
 *
 * A form and a button, not a checkbox with JavaScript behind it: the switch
 * has to work before any script arrives, and a security control that quietly
 * fails to submit is worse than a plain button. `role="switch"` with
 * `aria-checked` is what makes it a switch to a screen reader; the track and
 * knob are the visual half of the same thing.
 *
 * One line, and amber while it is off — the reasoning is in the info note
 * above it, but *that it is off* has to be visible without opening anything.
 */
function SigninCodeSwitch({
  on,
  q,
  canManage,
}: {
  on: boolean;
  q: string;
  canManage: boolean;
}) {
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

        {canManage ? (
          <form action={setSigninCodeAction} className="shrink-0">
            <input type="hidden" name="q" value={q} />
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
        ) : (
          <p className="shrink-0 text-sm text-muted">Super users and admins can change this.</p>
        )}
      </div>
    </section>
  );
}

function UserCard({ user, canManage }: { user: AdminCustomer; canManage: boolean }) {
  return (
    <article id={`user-${user.id}`} className="scroll-mt-24 border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">{user.name || "No name"}</h2>
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

        {/* Opens the customer's own account in a new tab. A POST, because it
            starts a session — see the route. */}
        {canManage && (
          <form action={`/admin/users/${user.id}/signin`} method="post" target="_blank">
            <button
              type="submit"
              className="h-9 whitespace-nowrap border border-line-strong px-3 font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
            >
              Sign in as {user.name?.split(" ")[0] || "this customer"}
            </button>
          </form>
        )}
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
