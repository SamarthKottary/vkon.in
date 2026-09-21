import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listAdminUsers } from "@/lib/db/adminUsers";
import { AddAdminUserForm } from "@/components/admin/AddAdminUserForm";
import type { AdminUser } from "@/lib/types";
import {
  updateAdminRoleAction,
  deleteAdminUserAction,
} from "@/app/admin/actions";

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
};

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const admin = await requireAdmin();

  // Support and Viewer roles get a 403.
  if (admin.role === "support" || admin.role === "viewer") {
    redirect("/admin/products");
  }

  const users = await listAdminUsers();
  const params = await searchParams;

  const errorMsg = params.error ? ERROR_MESSAGES[params.error] : null;

  return (
    <div className="space-y-10 p-6 sm:p-8 lg:p-10">
      <div>
        <h1 className="text-2xl font-semibold text-ink">User Access Levels</h1>
        <p className="mt-1 text-sm text-muted">
          Manage who can access the admin panel and at what permission level.
        </p>
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
      {errorMsg && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Role reference */}
      <section className="border border-line bg-surface-raised p-6 shadow-card">
        <h2 className="text-base font-semibold text-ink">Role permissions</h2>
        <div className="mt-4 overflow-x-auto">
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
      </section>

      {/* Current users */}
      <section className="border border-line bg-surface-raised shadow-card">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold text-ink">
            Admin users ({users.length})
          </h2>
        </div>
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              currentAdminId={admin.id}
              currentAdminRole={admin.role}
            />
          ))}
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
              <option value="admin">Admin</option>
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

          {/* Delete form */}
          <form action={deleteAdminUserAction}>
            <input type="hidden" name="id" value={user.id} />
            <button
              type="submit"
              className="border border-red-200 bg-surface px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Remove
            </button>
          </form>
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
  { feature: "Enquiries (mark/delete)", super: "✓", admin: "✓", support: "View", viewer: "View" },
  { feature: "Users (customer accounts)", super: "✓", admin: "✓", support: "View", viewer: "View" },
  { feature: "SEO settings", super: "✓", admin: "—", support: "—", viewer: "—" },
  { feature: "Admin user management", super: "✓", admin: "✓", support: "—", viewer: "—" },
];
