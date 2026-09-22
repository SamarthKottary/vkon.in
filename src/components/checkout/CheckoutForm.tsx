"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { AlertIcon, PlusIcon, SpinnerIcon } from "@/components/icons/ui";
import { AddressForm } from "@/components/account/AddressForm";
import { AddressDialog, AddressPicker } from "@/components/account/AddressPicker";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { Button } from "@/components/ui/Button";
import { useCartLines } from "@/components/cart/useCart";
import { formatPaise, priceLines, totals } from "@/lib/pricing";
import {
  placeOrderAction,
  quoteDeliveryAction,
  type CheckoutState,
  type DeliveryQuoteState,
} from "@/app/(site)/account/private-actions";
import { CodConfirmDialog } from "@/components/checkout/CodConfirmDialog";
import { DeliveryPicker } from "@/components/checkout/DeliveryPicker";
import { loadRazorpay } from "@/components/checkout/PayNowButton";
import type { Address, Product } from "@/lib/types";

/**
 * Checkout: bill to, ship to, check the total, place the order.
 *
 * **The cart lives in `localStorage`, so the server cannot see it.** That is
 * `lib/cart.ts`'s deliberate design — no account needed to fill a basket — and
 * it means the lines have to be posted with the form. They go as slugs and
 * quantities in a hidden field and nothing more: `placeOrderAction` re-resolves
 * them against the live catalogue and re-prices them through the same
 * `lib/pricing` functions this component uses to draw the totals below. So the
 * figures on screen and the figures on the order come from one implementation,
 * and a tampered form field can change *what* is ordered but never what it
 * costs.
 *
 * **Nothing in the left-hand column is inside the order form.** It cannot be:
 * that column holds the add, edit and delete forms for the address book, and a
 * `<form>` inside a `<form>` is invalid HTML — the parser drops the inner tag
 * outright, so the inner Save button submits the *outer* form and saving an
 * address places an order. The order form is the summary panel on the right;
 * everything the customer chose reaches it through the hidden inputs there,
 * driven by the state below. This is why the note field is controlled rather
 * than left to the DOM: it lives in the left column and its value has to be
 * mirrored across.
 *
 * **The cart is emptied on the order page, never here.** `ClearCartOnPlaced`
 * does it once the order exists. This form used to leave a `sessionStorage`
 * flag on submit and act on it the next time it mounted — but it never mounts
 * on the order page, so the flag outlived the order and wiped the *next*
 * basket the moment its owner opened checkout (fixed 2026-09-15).
 */
export function CheckoutForm({
  products,
  addresses,
}: {
  products: Product[];
  addresses: Address[];
}) {
  const uid = useId();
  const formId = `${uid}-order`;
  const lines = useCartLines();
  const router = useRouter();
  const [state, formAction] = useActionState<CheckoutState, FormData>(placeOrderAction, {
    status: "idle",
  });
  const [paymentMode, setPaymentMode] = useState<"online" | "cod">("online");
  const [payError, setPayError] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  /**
   * The cash-on-delivery confirmation (client, 2026-09-18).
   *
   * An online order has Razorpay's window as its moment of commitment; COD had
   * none. The submit is stopped once, the dialog asks, and Confirm submits the
   * same form again — `confirmedCod` is a ref, not state, because the second
   * submit happens in the same tick as setting it and state would not have
   * landed yet.
   */
  const [codConfirm, setCodConfirm] = useState(false);
  const confirmedCod = useRef(false);
  const orderFormRef = useRef<HTMLFormElement>(null);

  const preferred = () => addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "";

  const [billingId, setBillingId] = useState(preferred);
  const [shippingId, setShippingId] = useState(preferred);
  /**
   * Ticked by default, because for nearly everybody the two are the same place
   * and the client's ordering — billing first, shipping second — only makes
   * sense if the second step is usually a formality.
   */
  const [sameAsBilling, setSameAsBilling] = useState(true);

  /** Which address the dialog is open on, if any — `addressId: null` is a new
   *  one. One at a time: two open forms are two Save buttons and no way to
   *  tell which is which. */
  const [editor, setEditor] = useState<Editor | null>(null);

  const priced = useMemo(() => priceLines(lines ?? [], products), [lines, products]);

  /**
   * The last delivery quote the server returned, tagged with what it was for.
   *
   * **Stored with its key, and "loading" is derived from that rather than
   * stored.** The obvious shape — a `quote` state reset to `null` at the top
   * of the effect — needs a synchronous `setState` inside that effect, which
   * is what `react-hooks/set-state-in-effect` exists to stop and what this
   * codebase has been bitten by twice (§9). Keeping the answer's key beside it
   * means a result for a destination the customer has already moved off simply
   * does not match, and reads as "still asking" with nothing written.
   */
  const [quoted, setQuoted] = useState<{ key: string; value: DeliveryQuoteState } | null>(
    null,
  );

  /* Units, not line count — "1 item" beside a subtotal for two of the same
     panel reads as a miscount, and a customer checking this figure is
     counting what they are paying for, not how many distinct products that
     comes from. */
  const totalQty = priced.reduce((sum, line) => sum + line.qty, 0);

  const billing = addresses.find((a) => a.id === billingId) ?? null;

  /**
   * Keeps the two selections pointing at rows that still exist.
   *
   * Every address mutation here goes through a server action that
   * `revalidatePath`s this route, so a save or a delete arrives as a new
   * `addresses` prop rather than as local state. Two things have to happen when
   * it does: a *deleted* address must not stay selected — the order would fail
   * server-side with "please choose an address" pointing at a card that is no
   * longer on screen — and a *newly added* one should become the selection for
   * whichever section asked for it, which is the only reason anybody opens that
   * form mid-checkout.
   *
   * The new row is found by id difference rather than by position: the picker
   * lists the default first, so ticking "use this as my default" while adding
   * moves the new row to the top, and a positional guess tied to either order
   * would be wrong exactly when the customer was most explicit.
   */
  const knownIds = useRef<Set<string>>(new Set(addresses.map((a) => a.id)));
  const awaiting = useRef<Section | null>(null);
  useEffect(() => {
    const ids = new Set(addresses.map((a) => a.id));
    const added = addresses.find((a) => !knownIds.current.has(a.id));
    knownIds.current = ids;

    if (added && awaiting.current) {
      if (awaiting.current === "billing") setBillingId(added.id);
      else setShippingId(added.id);
      awaiting.current = null;
    }

    const fallback = addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "";
    setBillingId((current) => (current && ids.has(current) ? current : fallback));
    setShippingId((current) => (current && ids.has(current) ? current : fallback));
  }, [addresses]);

  /**
   * Asks the server what delivery costs, whenever the destination changes.
   *
   * The destination is the shipping address, or the billing one while "ship to
   * the billing address" is ticked — so changing *either* selection, or the
   * checkbox, re-quotes.
   *
   * **The sequence number is what makes this correct.** Two quotes can be in
   * flight at once (tick the box, untick it, pick another address), and they
   * can come back in any order; without the guard a slow answer for the
   * address the customer has already moved off would overwrite the right one,
   * and the figure on screen would be for somewhere else. Only the newest
   * request is allowed to write.
   *
   * `cartKey` rather than `lines`: the array is a fresh object on every render
   * of the parent, and using it directly would re-quote on every keystroke
   * elsewhere on the page.
   */
  const destinationId = sameAsBilling ? billingId : shippingId;
  const destination = addresses.find((a) => a.id === destinationId);
  const cartKey = JSON.stringify(priced.map((line) => [line.slug, line.qty]));
  const quoteKey = `${destinationId}|${destination?.postalCode}|${destination?.state}|${destination?.city}|${paymentMode}|${cartKey}`;
  const canQuote = Boolean(destinationId) && priced.length > 0;

  /**
   * What the Delivery row shows.
   *
   * `null` is "still asking" and renders as "Calculating…"; a settled
   * `unavailable` renders as the phone-call wording. Both are derived, so
   * nothing here writes state during a render or an effect.
   *
   * **`lines === null` is "not read yet", not "empty"** — the cart lives in
   * `localStorage` and `useSyncExternalStore` returns the server snapshot
   * (`null`) on the first render. Treating that as `unavailable` showed
   * "Quoted on our call" for every visitor until hydration replaced it, which
   * on a slow phone was long enough to read. Showing "Calculating…" instead
   * is honest: the answer is coming, the cart just has not loaded yet.
   */
  const quote: DeliveryQuoteState | null =
    lines === null
      ? null
      : !canQuote
        ? { status: "unavailable" }
        : quoted?.key === quoteKey
          ? quoted.value
          : null;

  const options = quote?.status === "quoted" ? quote.options : [];

  /**
   * Which delivery service is selected.
   *
   * Held as an id rather than an index, because the list is refetched whenever
   * the address or the cart changes and an index would silently point at a
   * different courier. An id that is no longer offered simply stops matching,
   * and the cheapest — `options[0]`, since the list is price-sorted — takes
   * over, which is also the default before anything is chosen.
   */
  const [courierId, setCourierId] = useState<number | null>(null);
  const chosen =
    options.find((o) => o.courierId === courierId) ?? options[0] ?? null;

  const shippingPaise = chosen?.ratePaise ?? 0;

  /* Declared after the quote because it depends on it: the delivery charge is
     part of the total the moment the courier gives one. */
  const money = useMemo(() => totals(priced, shippingPaise), [priced, shippingPaise]);

  /**
   * The sequence guard on top of the key.
   *
   * The key alone decides what is *displayed*; this decides what is allowed to
   * be *written*. Two quotes can be in flight at once — tick the box, untick
   * it, pick another address — and they can come back in any order. Without
   * this, a slow answer for an address the customer has already moved off
   * would land last and leave the panel showing "Calculating…" forever,
   * because its key no longer matches.
   */
  const quoteSeq = useRef(0);
  useEffect(() => {
    if (!canQuote) return;

    const seq = ++quoteSeq.current;
    const key = quoteKey;

    quoteDeliveryAction({
      addressId: destinationId,
      paymentMode,
      lines: JSON.parse(cartKey).map(([slug, qty]: [string, number]) => ({ slug, qty })),
    })
      .then((value) => {
        if (seq === quoteSeq.current) setQuoted({ key, value });
      })
      .catch(() => {
        /* A network failure is not the customer's problem: fall back to the
           wording the site used before live rates existed. */
        if (seq === quoteSeq.current) setQuoted({ key, value: { status: "unavailable" } });
      });
  }, [canQuote, quoteKey, destinationId, cartKey]);

  useEffect(() => {
    if (state.status === "requires_payment" && state.orderId) {
      let active = true;
      (async () => {
        setPayBusy(true);
        setPayError(null);
        try {
          const ready = await loadRazorpay();
          if (!ready) {
            if (active) {
              setPayError("Could not load the payment window. Check your connection and try again.");
              setPayBusy(false);
            }
            return;
          }

          const response = await fetch("/api/payment/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: state.orderId }),
          });

          if (!response.ok) {
            if (active) {
              /* `price_changed` cannot normally happen here — the order was
                 priced by `placeOrderAction` seconds ago — but if a price
                 moved in between, say so rather than charging the new figure
                 unannounced. Accepting it belongs on the order page, where
                 the dialog lists what changed. */
              const body = (await response.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
              };
              setPayError(
                body.error === "price_changed"
                  ? `${body.message ?? "Prices have changed."} Your order is saved — open it from My account to review and pay.`
                  : "Could not start the payment. Please try again.",
              );
              setPayBusy(false);
            }
            return;
          }

          const config = await response.json();
          const razorpay = new window.Razorpay!({
            key: config.key,
            amount: config.amount,
            currency: config.currency,
            name: config.name,
            description: config.description,
            order_id: config.orderId,
            prefill: config.prefill,
            theme: { color: "#23703d" },
            handler: async (result: any) => {
              try {
                const verify = await fetch("/api/payment/verify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    orderId: state.orderId,
                    razorpayOrderId: result.razorpay_order_id,
                    razorpayPaymentId: result.razorpay_payment_id,
                    signature: result.razorpay_signature,
                  }),
                });

                if (!verify.ok) {
                  setPayError("Your payment went through, but we could not confirm it here. It will update shortly.");
                  setPayBusy(false);
                  return;
                }
                router.push(`/account/orders/${state.orderId}?placed=${encodeURIComponent(config.orderNumber)}`);
              } catch {
                setPayError("Your payment went through, but we could not confirm it here. It will update shortly.");
                setPayBusy(false);
              }
            },
            modal: {
              /* The window closed without a successful payment — failed, or
                 abandoned. The order exists and is in their order history
                 with Pay now, so the cart is emptied there (`?unpaid=`),
                 not left full for a second, duplicate order (client,
                 2026-09-17). Emptied on the order page, not here, for the
                 reason `ClearCartOnPlaced` records. */
              ondismiss: () => {
                if (active) {
                  setPayBusy(false);
                  router.push(
                    `/account/orders/${state.orderId}?unpaid=${encodeURIComponent(config.orderNumber)}`,
                  );
                }
              },
            },
          });
          razorpay.open();
        } catch (err) {
          console.error("[pay] failed:", err);
          if (active) {
            setPayError("Could not start the payment. Please try again.");
            setPayBusy(false);
          }
        }
      })();
      return () => {
        active = false;
      };
    }
  }, [state, router]);

  if (lines === null) {
    /* Storage has not been read yet. Rendering "your cart is empty" for this
       frame would flash it at somebody who has three things in theirs — the
       contract `useCartLines` states. */
    return <div className="h-64" aria-hidden />;
  }

  if (priced.length === 0) {
    return (
      <div className="border border-line bg-surface-raised px-6 py-16 text-center shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-subtle text-muted">
          <PanelPlaceholder className="h-7 w-7" />
        </span>
        <p className="mt-5 text-lg font-bold text-ink">Your cart is empty</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Add something from the catalogue and it will show up here.
        </p>
        <Link
          href="/products"
          className="mt-7 inline-flex h-11 items-center justify-center bg-accent px-6 text-sm font-bold uppercase tracking-wider text-surface shadow-sm transition-colors hover:bg-accent-strong"
        >
          Browse products
        </Link>
      </div>
    );
  }

  const bySlug = new Map(products.map((p) => [p.slug, p]));
  /* Out of stock since the basket was filled (client, 2026-09-22). The button
     waits and the line is named; `placeOrderAction` refuses it again anyway,
     which is the control — this is so nobody reaches that refusal by
     surprise after filling in an address. */
  const outOfStock = priced
    .map((line) => bySlug.get(line.slug))
    .filter((product) => product?.outOfStock)
    .map((product) => product!.name);
  const ready =
    Boolean(billingId) && (sameAsBilling || Boolean(shippingId)) && outOfStock.length === 0;

  /* Editing leaves the selection alone. It used to select the card being
     edited, because the form opened inline under the grid and the highlighted
     card was the only sign of which address it was for; the dialog says so
     itself, and fixing a typo in the office address should not quietly make it
     where the order goes. */
  const openEditor = (section: Section, addressId: string | null) => {
    if (addressId === null) awaiting.current = section;
    setEditor({ section, addressId });
  };
  const closeEditor = () => {
    awaiting.current = null;
    setEditor(null);
  };
  const editing = editor ? addresses.find((a) => a.id === editor.addressId) : undefined;

  return (
    /* Summary sizing (client, 2026-09-17). It was a fixed 22rem beside a
       column capped at 42rem, which left ~190px of nothing between them and
       wrapped the panel's copy; grown to fill that gap (~31rem) it was then
       asked to be "a bit" narrower. So: 22rem at `lg`, where there is no
       slack and the address column gives way first, and 28rem from `xl`.
       `justify-between` keeps the panel's right edge on the container's —
       the header's — with what is left over as gutter. */
    <div className="grid gap-10 lg:grid-cols-[minmax(0,42rem)_22rem] lg:items-start lg:justify-between lg:gap-12 xl:grid-cols-[minmax(0,42rem)_28rem]">
      {/* Every box in this column — the address pickers, the ship-to box, the
          order lines — shares one width and one right edge: the grid track's
          42rem cap above. Below `lg` the summary stacks underneath at full
          width, and this column matches it. */}
      <div className="min-w-0 space-y-10">
        {(state.status === "error" || payError) && (
          <p
            role="alert"
            className="flex items-start gap-2 border-l-2 border-red-600 bg-surface-subtle px-4 py-3 text-sm text-red-700"
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {payError || state.message}
          </p>
        )}

        {/* 1 — Billing. First because it is the one an invoice is made out to
            and the one a GSTIN belongs to; the delivery step below defaults to
            repeating it. */}
        <section>
          <StepHeading
            step={1}
            title="Billing address"
            hint="Whom the invoice is made out to. Add a GSTIN here if you are buying in a business's name."
          />

          {addresses.length > 0 ? (
            <div className="mt-6">
              <AddressPicker
                addresses={addresses}
                selectedId={billingId}
                group={`${uid}-billing`}
                onSelect={setBillingId}
                onEdit={(address) => openEditor("billing", address.id)}
                onAdd={() => openEditor("billing", null)}
                showGstin
              />
            </div>
          ) : (
            /* Nothing saved yet, so there is nothing to pick from and nothing
               a dialog would be hiding: the form is the step. No Cancel —
               there is nowhere to go back to. The first address becomes the
               selection through the fallback in the effect above, without the
               `awaiting` marker. */
            <div className="mt-6 border border-line-strong bg-surface-raised p-5 shadow-card sm:p-6">
              <AddressForm />
            </div>
          )}
        </section>

        {/* 2 — Shipping. */}
        <section>
          <StepHeading
            step={2}
            title="Shipping address"
            hint="Where the goods actually go. Untick the box if that is somewhere else."
          />

          {/* `p-4`, a 16px checkbox and `gap-3`: the same text column as the
              address picker and the step heading. */}
          <label className="mt-6 flex cursor-pointer items-start gap-3 border border-line bg-surface-subtle p-4 text-sm">
            <input
              type="checkbox"
              checked={sameAsBilling}
              onChange={(event) => setSameAsBilling(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
            />
            <span>
              <span className="font-medium text-ink">
                Ship to the billing address
              </span>
              {billing && sameAsBilling && (
                <span className="mt-1 block leading-relaxed text-muted">
                  {billing.line1}, {billing.city}, {billing.state}{" "}
                  {billing.postalCode}
                </span>
              )}
            </span>
          </label>

          {!sameAsBilling && (
            <>
              {addresses.length > 0 ? (
                <div className="mt-5">
                  <AddressPicker
                    addresses={addresses}
                    selectedId={shippingId}
                    group={`${uid}-shipping`}
                    onSelect={setShippingId}
                    onEdit={(address) => openEditor("shipping", address.id)}
                    onAdd={() => openEditor("shipping", null)}
                  />
                </div>
              ) : (
                <AddAddressButton onClick={() => openEditor("shipping", null)} />
              )}
            </>
          )}
        </section>

        {/* 3 — What is being bought. */}
        <section>
          <StepHeading step={3} title="Your order" />

          <ul className="mt-6 divide-y divide-line border border-line bg-surface-raised shadow-card">
            {priced.map((line) => {
              const product = bySlug.get(line.slug);
              const image = product?.images[0];
              return (
                /* The line total drops under the unit price below `sm`
                   instead of sitting in a third column. At 390px, once the
                   thumbnail and a two-line product name have taken their
                   width, there is not enough left for a rupee figure beside
                   them — the two ran into each other. */
                <li key={line.slug} className="flex items-start gap-3 px-4 py-4 sm:items-center sm:gap-4 sm:py-5">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden border border-line bg-surface-subtle">
                    {image ? (
                      <Image
                        src={image.url}
                        alt=""
                        fill
                        sizes="4rem"
                        className="object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-muted">
                        <PanelPlaceholder className="h-6 w-6" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-ink sm:text-base">
                      {line.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-sm text-muted">
                        {formatPaise(line.unitPrice)} × {line.qty}
                      </p>
                      <p className="font-bold tabular-nums text-ink sm:hidden">
                        {formatPaise(line.lineTotal)}
                      </p>
                    </div>
                  </div>
                  <p className="hidden shrink-0 font-bold tabular-nums text-ink sm:block">
                    {formatPaise(line.lineTotal)}
                  </p>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-sm text-muted">
            Need to change quantities?{" "}
            <Link href="/cart" className="text-accent hover:underline">
              Back to the cart
            </Link>
            .
          </p>
        </section>

        {/* Portalled to `<body>`, so where it sits in this tree does not put
            its form inside the order form. `key` so switching from one address
            to another starts a fresh form rather than keeping the first one's
            typed values. `onDone` leaves `awaiting` set: a new address has to
            arrive in `addresses` before the effect can select it. */}
        {editor && (
          <AddressDialog
            key={`${editor.section}:${editor.addressId ?? "new"}`}
            address={editing}
            onDone={() => setEditor(null)}
            onCancel={closeEditor}
          />
        )}
      </div>

      {/* The order form itself. Small on purpose: hidden fields carrying the
          choices made on the left, the totals, and the one submit button. */}
      <form
        id={formId}
        ref={orderFormRef}
        action={formAction}
        onSubmit={(event) => {
          if (paymentMode !== "cod" || confirmedCod.current) return;
          event.preventDefault();
          setCodConfirm(true);
        }}
        /* Not sticky (client, 2026-09-17). The panel is taller than a
           laptop viewport, so `sticky` never kept the button in view; what it
           did do was start sliding the panel down the page as soon as the left
           column grew taller than it — opening the address list was enough —
           which read as the order total moving on its own. */
        className="border border-line bg-surface p-5 shadow-card sm:p-6"
      >
        {/* What the server re-resolves. Prices are deliberately absent: the
            browser has no say in what anything costs. */}
        <input
          type="hidden"
          name="lines"
          value={JSON.stringify(priced.map((line) => ({ slug: line.slug, qty: line.qty })))}
        />
        <input type="hidden" name="billingAddressId" value={billingId} />
        <input type="hidden" name="shippingAddressId" value={sameAsBilling ? "" : shippingId} />
        {sameAsBilling && <input type="hidden" name="sameAsBilling" value="on" />}
        <input type="hidden" name="notes" value="" />
        {/* The *id* of the chosen service, never its price. The server looks it
            up in a quote it fetches itself, so the worst this field can do is
            pick a different real service at its real cost. */}
        <input type="hidden" name="courierId" value={chosen?.courierId ?? ""} />

        {/* One heading style, one inset (the panel's padding), and one radio
            column (`px-4`/`p-4` boxes, 16px radios, `gap-3`) for the delivery
            and payment choices, so the panel's pieces line up with each other
            (client, 2026-09-17). */}
        <PanelHeading>Order total</PanelHeading>

        <div className="divide-y divide-line text-sm">
          <Row
            label={`Subtotal · ${totalQty} item${totalQty === 1 ? "" : "s"}`}
            value={formatPaise(money.subtotal)}
            strong
          />
          <Row label="CGST 9%" value={formatPaise(money.cgst)} />
          <Row label="SGST 9%" value={formatPaise(money.sgst)} />
          {/* Three states, and each is honest about what is known. A real
              rate once the courier has given one; "Calculating…" while the
              request is out; and the phone-call wording when there is no
              number — an unserviceable PIN code, a courier API that timed out,
              or no Shiprocket account configured at all. The last of those is
              exactly what this row said before live rates existed, so an
              unconfigured site is unchanged. Which service it is lives in the
              delivery box below; this row is only the charge. */}
          <Row
            label="Delivery"
            value={
              quote === null
                ? "Calculating…"
                : chosen
                  ? formatPaise(chosen.ratePaise)
                  : "Quoted on our call"
            }
          />

          <div className="flex items-center justify-between gap-3 py-4 text-base font-bold">
            <span className="text-ink">Total</span>
            <span className="text-xl font-bold tabular-nums text-accent sm:text-2xl">
              {formatPaise(money.total)}
            </span>
          </div>
        </div>

        {/* Above the payment method, as the client asked. */}
        <DeliveryPicker
          options={quote === null ? null : options}
          chosenId={chosen?.courierId ?? null}
          onChoose={setCourierId}
          group={`${uid}-courier`}
        />

        <PanelHeading className="mt-8">Payment Method</PanelHeading>
        <div className="mt-4 space-y-3">
          <PaymentOption
            value="online"
            current={paymentMode}
            onChange={setPaymentMode}
            title="Online Payment"
            detail="Pay securely with UPI, Credit/Debit Cards, or Netbanking."
          />
          <PaymentOption
            value="cod"
            current={paymentMode}
            onChange={setPaymentMode}
            title="Cash on Delivery (COD)"
            detail="Pay with cash when your order is delivered."
          />
        </div>

        {billing?.gstin && (
          <p className="mt-5 text-xs leading-relaxed text-muted">
            Invoiced to{" "}
            <span className="font-mono font-medium text-ink">{billing.gstin}</span>
          </p>
        )}

        {outOfStock.length > 0 && (
          <p role="alert" className="mb-3 border-l-2 border-price-off bg-surface px-4 py-3 text-sm text-ink">
            {outOfStock.join(" and ")} {outOfStock.length === 1 ? "is" : "are"} out of
            stock. Remove {outOfStock.length === 1 ? "it" : "them"} from your{" "}
            <Link href="/cart" className="text-accent hover:underline">
              cart
            </Link>{" "}
            to order the rest.
          </p>
        )}

        <PlaceOrder disabled={!ready || payBusy} paymentMode={paymentMode} />

        {!ready && (
          <p className="mt-3 text-center text-sm text-muted">
            {billingId
              ? "Choose a shipping address to continue."
              : "Choose a billing address to continue."}
          </p>
        )}
        {codConfirm && (
          <CodConfirmDialog
            amountLabel={formatPaise(money.total)}
            onCancel={() => setCodConfirm(false)}
            onConfirm={() => {
              confirmedCod.current = true;
              setCodConfirm(false);
              /* The same form, submitted for real this time. `requestSubmit`
                 rather than `submit`: `submit()` bypasses React and the server
                 action would never run. */
              orderFormRef.current?.requestSubmit();
            }}
          />
        )}

        {/* No note under the button (client, 2026-09-17). */}
      </form>
    </div>
  );
}

type Section = "billing" | "shipping";
type Editor = { section: Section; addressId: string | null };

function PanelHeading({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`border-b border-line pb-3 text-base font-bold uppercase tracking-wider text-ink ${className}`}
    >
      {children}
    </h2>
  );
}

function PaymentOption({
  value,
  current,
  onChange,
  title,
  detail,
}: {
  value: "online" | "cod";
  current: "online" | "cod";
  onChange: (value: "online" | "cod") => void;
  title: string;
  detail: string;
}) {
  const selected = value === current;
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 border p-4 transition-colors ${
        selected ? "border-accent bg-accent-soft/40" : "border-line hover:border-line-strong"
      }`}
    >
      <input
        type="radio"
        name="paymentMode"
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        /* `mt-1` centres the 16px radio on the title's 24px line. */
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
      />
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{detail}</span>
      </span>
    </label>
  );
}

function StepHeading({
  step,
  title,
  hint,
}: {
  step: number;
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-3 text-lg font-semibold text-ink sm:text-xl">
        {/* Decorative — the heading text already reads in order, and a screen
            reader announcing "one billing address" helps nobody.
            Filled rather than outlined: as a 7px-bordered box holding muted
            text it read as a disabled input at a glance, not as step one of
            three. */}
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center bg-ink text-sm font-bold text-surface"
        >
          {step}
        </span>
        {title}
      </h2>
      {hint && (
        <p className="mt-2 max-w-xl pl-11 text-sm leading-relaxed text-muted">{hint}</p>
      )}
    </div>
  );
}

function AddAddressButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 inline-flex items-center gap-2 border border-line-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
    >
      <PlusIcon className="h-4 w-4" />
      Add an address
    </button>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <span className={`min-w-0 ${strong ? "font-semibold text-ink" : "text-muted"}`}>
        {label}
      </span>
      <span
        className={`shrink-0 tabular-nums ${strong ? "font-semibold text-ink" : "font-medium text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}

function PlaceOrder({ disabled, paymentMode }: { disabled: boolean; paymentMode: "online" | "cod" }) {
  const { pending } = useFormStatus();
  const busy = pending || disabled;
  return (
    <Button
      type="submit"
      disabled={busy}
      size="lg"
      variant="accent"
      className="mt-5 w-full"
    >
      {busy && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Processing…" : paymentMode === "online" ? "Pay Now" : "Place order"}
    </Button>
  );
}
