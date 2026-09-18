import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentCustomer } from "@/lib/account";
import { cancelOrder } from "@/lib/db/orders";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedParams = await params;
  const orderId = typeof resolvedParams.id === "string" ? resolvedParams.id : "";
  if (!orderId) {
    return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
  }

  try {
    const success = await cancelOrder(orderId, customer.id);
    if (!success) {
      return NextResponse.json({ error: "Order could not be cancelled" }, { status: 400 });
    }
    
    revalidatePath("/account/orders");
    revalidatePath(`/account/orders/${orderId}`);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[cancel order] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
