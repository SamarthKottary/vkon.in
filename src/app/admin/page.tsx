import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { isAdminConfigured, isAuthenticated } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAuthenticated()) redirect("/admin/products");

  const configured = isAdminConfigured();

  return (
    <Container size="narrow">
      <div className="mx-auto max-w-sm border border-line bg-surface p-8">
        <h1 className="text-2xl">Sign in</h1>
        <p className="mt-2 text-sm text-muted">
          Product management for vkon.in
        </p>

        {!configured && (
          <div className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-body">
            <p className="font-medium text-ink">Not configured</p>
            <p className="mt-1 leading-relaxed">
              Set <code className="font-mono text-[0.8125rem]">ADMIN_PASSWORD</code>{" "}
              and <code className="font-mono text-[0.8125rem]">AUTH_SECRET</code>{" "}
              in <code className="font-mono text-[0.8125rem]">.env.local</code>,
              then restart the server.
            </p>
          </div>
        )}

        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </Container>
  );
}
