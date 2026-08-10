import { NextResponse } from "next/server";
import { isDatabaseConfigured, query } from "@/lib/db/client";

/**
 * Real health check: does this instance actually reach its database?
 *
 * Public page reads deliberately fail soft — an unreachable database renders an
 * empty catalogue rather than a 500, which is right for visitors. The cost is
 * that "GET / returns 200" proves almost nothing, and a deploy verified only on
 * that basis went green while every query was failing. This endpoint is the
 * thing `cicd/verify.sh` and the deploy console check instead.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { status: "error", database: "unconfigured" },
      { status: 503 },
    );
  }

  const started = Date.now();
  try {
    const rows = await query<{ products: string }>(
      "SELECT count(*)::text AS products FROM products",
    );
    return NextResponse.json(
      {
        status: "ok",
        database: "ok",
        products: Number(rows[0]?.products ?? 0),
        latencyMs: Date.now() - started,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // The message is the operator's only clue; it never reaches a visitor
    // because nothing links here.
    console.error("[health] database check failed:", error);
    return NextResponse.json(
      { status: "error", database: (error as Error).message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
