import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { requireInventory } from "@/lib/auth";
import { getStoreById } from "@/lib/db/stores";
import { issueStoreSession } from "@/lib/store-auth";

export async function GET(request: NextRequest) {
  await requireInventory();

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");
  const slug = searchParams.get("slug");

  if (!id || !slug) {
    redirect("/admin/inventory");
  }

  const store = await getStoreById(id);
  if (!store || store.blockedAt) {
    redirect("/admin/inventory");
  }

  await issueStoreSession(id);
  redirect(`/${slug}`);
}
