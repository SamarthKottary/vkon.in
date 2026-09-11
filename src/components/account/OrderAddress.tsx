import type { ShipTo } from "@/lib/types";

/**
 * An address as it was snapshotted onto an order.
 *
 * Shared by the customer's order page and the admin inbox, which is the point:
 * an order now carries two of these — `billTo` and `shipTo` — and three places
 * rendering the same eight fields by hand is three places to forget the GSTIN
 * line when somebody adds one.
 *
 * Deliberately tolerant of missing fields. Orders written before the billing
 * split, and before `gstin` existed, have neither, and a customer looking at
 * last month's order should see the address it was sent to rather than a crash.
 */
export function OrderAddress({ address }: { address: ShipTo }) {
  return (
    <>
      <p className="mt-3 font-semibold text-ink">{address.name}</p>
      <address className="mt-1.5 text-sm not-italic leading-relaxed text-body">
        {address.line1}
        {address.line2 && (
          <>
            <br />
            {address.line2}
          </>
        )}
        <br />
        {address.city}, {address.state} {address.postalCode}
        <br />
        {address.phone}
      </address>
      {address.gstin && (
        <p className="label-tech mt-3 break-all text-muted">GSTIN {address.gstin}</p>
      )}
    </>
  );
}

/**
 * Whether an order's two addresses are the same place.
 *
 * Compares the snapshots field by field rather than trusting an id, because
 * neither snapshot has one — that is what a snapshot is (see `orders.ship_to`
 * in schema.sql). Ticking "ship to the billing address" writes the same object
 * into both, so this is `true` for the common case; it is also `true` for the
 * orders placed before checkout asked separately, which is correct, because on
 * those the single address was both.
 */
export function sameOrderAddress(a: ShipTo, b: ShipTo): boolean {
  const keys: (keyof ShipTo)[] = [
    "name",
    "phone",
    "line1",
    "line2",
    "city",
    "state",
    "postalCode",
    "country",
    "gstin",
  ];
  return keys.every((key) => (a[key] ?? "") === (b[key] ?? ""));
}
