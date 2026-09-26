import Link from "next/link";
import type { AdminRole } from "@/lib/types";

const ROLE_LABELS: Record<AdminRole, string> = {
  super: "Super User",
  admin: "Admin",
  support: "Support",
  viewer: "Viewer",
  inventory: "Inventory",
};

/**
 * Inline 403 panel — rendered inside the admin shell when the signed-in
 * operator navigates to a page their role cannot access.
 *
 * Stays at the requested URL rather than redirecting, so the address bar
 * explains what they tried to visit and the Back button works naturally.
 * The panel replaces the page content; the header/nav stay intact.
 *
 * "page" is the human name of the restricted section (e.g. "Reviews").
 * "role" is the current user's role, shown in the message so they understand
 * why and who to ask if they need access.
 */
export function AccessDenied({
  page,
  role,
  requiredRoles,
}: {
  page: string;
  role: AdminRole;
  /** The roles that *can* access this page, for the hint message. */
  requiredRoles: AdminRole[];
}) {
  const requiredLabels = requiredRoles.map((r) => ROLE_LABELS[r]);
  const lastRequired = requiredLabels.at(-1) ?? "";
  const listedRoles =
    requiredLabels.length === 1
      ? lastRequired
      : `${requiredLabels.slice(0, -1).join(", ")} or ${lastRequired}`;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-20 text-center">
      {/* Lock icon */}
      <svg
        aria-hidden
        className="mb-6 h-12 w-12 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 10.5V7a4.5 4.5 0 0 0-9 0v3.5m-1 0h11a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1Z"
        />
      </svg>

      <h1 className="text-2xl font-semibold text-ink">Access denied</h1>

      <p className="mt-3 max-w-sm text-sm text-body">
        The <span className="font-medium text-ink">{page}</span> section is
        only available to {listedRoles}. You are signed in as a{" "}
        <span className="font-medium text-ink">{ROLE_LABELS[role]}</span>.
      </p>

      <p className="mt-2 max-w-sm text-sm text-muted">
        Ask a Super User or Admin to change your access level if you need it.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/admin/products"
          className="h-10 border border-ink bg-ink px-5 text-sm font-medium text-surface flex items-center hover:opacity-90"
        >
          Go to Products
        </Link>
        <Link
          href="/admin/users/access"
          className="h-10 border border-line-strong px-5 text-sm font-medium text-ink flex items-center hover:border-ink hover:bg-surface-subtle"
        >
          View my access level
        </Link>
      </div>
    </div>
  );
}
