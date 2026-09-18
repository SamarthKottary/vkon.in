import { NextResponse } from "next/server";
import { getCustomerServer } from "@/lib/account";
import { cancelOrder } from "@/lib/db/orders";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const customer = await getCustomerServer();
  if (!customer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orderId = typeof params.id === "string" ? params.id : "";
  if (!orderId) {
    return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
  }

  try {
    const success = await cancelOrder(orderId, customer.id);
    if (!success) {
      return NextResponse.json({ error: "Order could not be cancelled" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[cancel order] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
