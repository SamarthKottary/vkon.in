import { requireAdminPage } from "@/lib/auth";
import { Avatar } from "@/components/account/Avatar";
import { AdminProfileForm } from "@/components/admin/AdminProfileForm";
import { AdminAvatarForm } from "@/components/admin/AdminAvatarForm";
import { AdminPasswordCard } from "@/components/admin/AdminPasswordCard";
import { InvoiceGstinForm } from "@/components/admin/InvoiceGstinForm";
import { getInvoiceGstin } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  super: "Super User",
  admin: "Admin",
  support: "Support",
  viewer: "Viewer",
};

export default async function AdminProfilePage() {
  const admin = await requireAdminPage();
  const gstin = admin.role === "super" ? await getInvoiceGstin() : "";

  return (
    <div className="space-y-10 p-6 sm:p-8 lg:p-10">
      <div>
        <h1 className="text-2xl font-semibold text-ink">My profile</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your name, profile picture and password.
        </p>
      </div>

      <section className="border border-line bg-surface-raised p-6 shadow-card sm:p-8">
        <h2 className="text-lg font-semibold text-ink">Your details</h2>

        <div className="mt-6">
          <AdminAvatarForm
            name={admin.name}
            email={admin.email}
            url={admin.avatarUrl}
            source={admin.avatarSource}
          />
        </div>

        {/* Role badge — read-only */}
        <div className="mt-5 border-t border-line pt-4">
          <span className="label-tech block text-xs font-semibold uppercase tracking-wider text-muted">
            Role
          </span>
          <div className="mt-2 inline-flex items-center gap-2 border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink shadow-sm">
            {ROLE_LABELS[admin.role] ?? admin.role}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {admin.email}
          </p>
        </div>

        <div className="mt-6 max-w-md">
          <AdminProfileForm name={admin.name} />
        </div>

        <div className="mt-8">
          <AdminPasswordCard hasPassword={admin.hasPassword} role={admin.role} />
        </div>
      </section>

      {/* The business's own details, not this operator's — so it is a super
          user's to set, and it sits in its own card (client, 2026-09-25). */}
      {admin.role === "super" && (
        <section className="border border-line bg-surface-raised p-6 shadow-card sm:p-8">
          <h2 className="text-lg font-semibold text-ink">Invoice details</h2>
          <p className="mt-1 text-sm text-muted">
            Used on every invoice a customer downloads from their order history.
          </p>
          <div className="mt-6 max-w-md">
            <InvoiceGstinForm gstin={gstin} />
          </div>
        </section>
      )}
    </div>
  );
}
