import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { isAdminConfigured, isAuthenticated } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAuthenticated()) redirect("/admin/products");

  const configured = isAdminConfigured();
  const insecureOrigin = await isInsecureOrigin();

  return (
    <Container size="narrow">
      <div className="mx-auto max-w-sm border border-line bg-surface-raised p-8">
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

        {insecureOrigin && (
          <div className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-body">
            <p className="font-medium text-ink">
              Sign-in will not work over this address
            </p>
            <p className="mt-1 leading-relaxed">
              The session cookie is marked <code className="font-mono text-[0.8125rem]">Secure</code>,
              so the browser will only keep it on <strong>https://</strong> — or
              on <code className="font-mono text-[0.8125rem]">localhost</code>,
              which browsers treat as trustworthy. Over plain HTTP to any other
              host the cookie is silently dropped, the password is accepted, and
              you land back on this form.
            </p>
            <p className="mt-2 leading-relaxed">
              Open{" "}
              <code className="font-mono text-[0.8125rem]">http://localhost:3000/admin</code>{" "}
              instead, or reach the live site over https.
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

/**
 * Whether the admin is being reached somewhere the session cookie cannot survive.
 *
 * `lib/auth.ts` sets `secure: true` in production, and that is correct — an
 * admin session must not ride over plain HTTP. The trap is that it fails
 * *silently*: the browser accepts the login, discards the cookie, and the next
 * request is anonymous, so the redirect to /admin/products bounces straight
 * back here. Nothing in the UI said why, and the obvious reading is "my
 * password is wrong".
 *
 * Browsers exempt localhost and the loopback addresses as trustworthy origins,
 * which is why this works in local development and not over the LAN IP that
 * `next start` prints beside it.
 *
 * Detection only — this deliberately does not weaken the cookie.
 */
async function isInsecureOrigin(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return false;

  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim();
  if (proto === "https") return false;

  const host = (h.get("host") ?? "").split(":")[0].toLowerCase();
  return !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
}
