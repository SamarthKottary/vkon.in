import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listAdminUsers } from "@/lib/db/adminUsers";
import { AddAdminUserForm } from "@/components/admin/AddAdminUserForm";
import { AccessDenied } from "@/components/admin/AccessDenied";
import type { AdminUser } from "@/lib/types";
import {
  updateAdminRoleAction,
  deleteAdminUserAction,
  clearAdminPasswordAction,
} from "@/app/admin/actions";
import { InfoIcon } from "@/components/icons/ui";
import { DeleteUserButton } from "./DeleteUserButton";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  super: "Super User",
  admin: "Admin",
  support: "Support",
  viewer: "Viewer",
};

const ERROR_MESSAGES: Record<string, string> = {
  "1": "Something went wrong. Please try again.",
  self: "You cannot modify your own account here.",
  invalid: "That request was invalid.",
  privilege: "Only a Super User can set the Super User role.",
  "last-super": "The last Super User account cannot be deleted.",
  access: "You don't have permission to do that. Your role does not allow this action.",
};

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const admin = await requireAdmin();

  // Support and Viewer roles see a denial panel instead of being redirected.
  if (admin.role === "support" || admin.role === "viewer") {
    return (
      <div className="px-6 sm:px-8 lg:px-10">
        <AccessDenied
          page="User Access Levels"
          role={admin.role}
          requiredRoles={["super", "admin"]}
        />
      </div>
    );
  }

  const params = await searchParams;
  const q = params.q || "";
  const users = await listAdminUsers(q);

  const errorMsg = params.error ? ERROR_MESSAGES[params.error] : null;

  return (
    <div className="space-y-10 p-6 sm:p-8 lg:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">User Access Levels</h1>
          <p className="mt-1 text-sm text-muted">
            Manage who can access the admin panel and at what permission level.
          </p>
        </div>

        <form action="/admin/users/access" className="flex w-full gap-2 sm:w-auto">
          <label htmlFor="user-search" className="sr-only">
            Search admin users
          </label>
          <input
            id="user-search"
            name="q"
            defaultValue={q}
            placeholder="Name or email"
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

      {params.updated && (
        <div className="border border-accent bg-accent-soft px-4 py-3 text-sm text-ink">
          Role updated successfully.
        </div>
      )}
      {params.deleted && (
        <div className="border border-accent bg-accent-soft px-4 py-3 text-sm text-ink">
          User removed.
        </div>
      )}
      {params.cleared && (
        <div className="border border-accent bg-accent-soft px-4 py-3 text-sm text-ink">
          Password cleared. The user will be asked to set a new password on their next sign-in.
        </div>
      )}
      {errorMsg && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Role reference */}
      <details className="group border border-line bg-surface-raised shadow-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-6 marker:hidden">
          <h2 className="text-base font-semibold text-ink">Role permissions</h2>
          <InfoIcon className="h-5 w-5 text-muted transition-colors group-hover:text-ink" />
        </summary>
        <div className="overflow-x-auto px-6 pb-6 pt-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="pb-2 text-left font-semibold text-ink">Feature</th>
                <th className="pb-2 text-center font-semibold text-ink">Super</th>
                <th className="pb-2 text-center font-semibold text-ink">Admin</th>
                <th className="pb-2 text-center font-semibold text-ink">Support</th>
                <th className="pb-2 text-center font-semibold text-ink">Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-muted">
              {PERMISSIONS.map((row) => (
                <tr key={row.feature}>
                  <td className="py-2 pr-4">{row.feature}</td>
                  <td className="py-2 text-center">{row.super}</td>
                  <td className="py-2 text-center">{row.admin}</td>
                  <td className="py-2 text-center">{row.support}</td>
                  <td className="py-2 text-center">{row.viewer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Current users */}
      <section className="border border-line bg-surface-raised shadow-card">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold text-ink">
            Admin users ({users.length})
          </h2>
        </div>
        <ul className="divide-y divide-line">
          {users.length === 0 ? (
            <li className="px-6 py-8 text-center text-sm text-ink">
              {q ? `No users match “${q}”.` : "No users yet."}
            </li>
          ) : (
            users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                currentAdminId={admin.id}
                currentAdminRole={admin.role}
              />
            ))
          )}
        </ul>
      </section>

      {/* Add user */}
      <section className="border border-line bg-surface-raised p-6 shadow-card">
        <h2 className="mb-4 text-base font-semibold text-ink">Add a user</h2>
        <AddAdminUserForm currentRole={admin.role} />
      </section>
    </div>
  );
}

function UserRow({
  user,
  currentAdminId,
  currentAdminRole,
}: {
  user: AdminUser;
  currentAdminId: string;
  currentAdminRole: string;
}) {
  const isSelf = user.id === currentAdminId;
  const canManage = !isSelf && (currentAdminRole === "super" || user.role !== "super");

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 px-6 py-4" id={`user-${user.id}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">{user.name || user.email}</span>
          {isSelf && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-surface">
              You
            </span>
          )}
          <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-muted">
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
          {!user.hasPassword && (
            <span className="rounded-full bg-signal-100 px-2 py-0.5 text-xs text-signal-700">
              No password set
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">{user.email}</p>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Role change form */}
          <form action={updateAdminRoleAction}>
            <input type="hidden" name="id" value={user.id} />
            <select
              name="role"
              defaultValue={user.role}
              className="border border-line bg-surface px-2 py-1 text-xs text-ink"
            >
              {currentAdminRole === "super" && <option value="super">Super User</option>}
              {(currentAdminRole === "super" || user.role === "admin") && <option value="admin">Admin</option>}
              <option value="support">Support</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="submit"
              className="ml-2 border border-line bg-surface-raised px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface"
            >
              Save role
            </button>
          </form>

          {/* Clear Password form */}
          {user.hasPassword && (
            <form action={clearAdminPasswordAction}>
              <input type="hidden" name="id" value={user.id} />
              <button
                type="submit"
                className="border border-line-strong bg-surface px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface-subtle"
              >
                Clear password
              </button>
            </form>
          )}

          {/* Delete form */}
          <DeleteUserButton id={user.id} name={user.name} roleName={ROLE_LABELS[user.role]} />
        </div>
      )}
    </li>
  );
}

const PERMISSIONS = [
  { feature: "Products (create/edit/delete)", super: "✓", admin: "✓", support: "View", viewer: "View" },
  { feature: "Orders (status change)", super: "✓", admin: "✓", support: "✓", viewer: "View" },
  { feature: "Orders (refund)", super: "✓", admin: "✓", support: "—", viewer: "—" },
  { feature: "Subscribers (delete)", super: "✓", admin: "✓", support: "View", viewer: "View" },
  { feature: "Enquiries (mark handled)", super: "✓", admin: "✓", support: "✓", viewer: "View" },
  { feature: "Enquiries (delete)", super: "✓", admin: "✓", support: "—", viewer: "—" },
  { feature: "Users (customer accounts)", super: "✓", admin: "✓", support: "View", viewer: "View" },
  { feature: "SEO settings", super: "✓", admin: "—", support: "—", viewer: "—" },
  { feature: "Admin user management", super: "✓", admin: "✓", support: "—", viewer: "—" },
];
