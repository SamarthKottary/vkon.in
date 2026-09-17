"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightIcon } from "@/components/icons/ui";
import { formatPaise } from "@/lib/pricing";
import { trackingLabel, trackingUrl } from "@/lib/tracking";
import { PayNowButton } from "@/components/checkout/PayNowButton";
import {
  isCod,
  isPaymentFailed,
  paymentMethodLabel,
  paymentStateLabel,
} from "@/lib/order-payment";
import type { Order, OrderStatus } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_STYLE: Record<OrderStatus, { label: string; className: string }> = {
  pending:   { label: "Pending",   className: "text-signal-700 bg-signal-500/10" },
  confirmed: { label: "Confirmed", className: "text-accent bg-accent-soft" },
  shipped:   { label: "Shipped",   className: "text-blue-700 bg-blue-50" },
  delivered: { label: "Delivered", className: "text-green-700 bg-green-50" },
  cancelled: { label: "Cancelled", className: "text-red-600 bg-red-50" },
};

/**
 * The status shown for an order. **An online order waiting to be paid says so**
 * — "Payment due", or "Payment failed" after an attempt — rather than
 * "Pending" (client, 2026-09-17): the order is not progressing until it is
 * paid, and "Pending" beside "Payment due" said the same thing twice. Both
 * have their own filter.
 */
const PAYMENT_FAILED_STYLE = { label: "Payment failed", className: "text-red-600 bg-red-50" };
const PAYMENT_DUE_STYLE = { label: "Payment due", className: "text-signal-700 bg-signal-500/10" };

function awaitingPayment(order: Order): boolean {
  return (
    !isCod(order) &&
    order.status === "pending" &&
    (order.paymentStatus === "unpaid" || order.paymentStatus === "failed")
  );
}

function displayStatus(order: Order): { key: string; label: string; className: string } {
  if (awaitingPayment(order)) {
    return isPaymentFailed(order)
      ? { key: "payment_failed", ...PAYMENT_FAILED_STYLE }
      : { key: "payment_due", ...PAYMENT_DUE_STYLE };
  }
  const s = STATUS_STYLE[order.status] ?? STATUS_STYLE.pending;
  return { key: order.status, ...s };
}

/** "COD", or "Online" with how it stands — "Paid" or "Refunded". Whether it is
 *  still to be paid is the status, so it is not repeated here. */
function paymentText(order: Order): { method: string; state: string | null } {
  if (isCod(order)) return { method: paymentMethodLabel(order), state: null };
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
    return { method: "Online", state: paymentStateLabel(order).label };
  }
  return { method: "Online", state: null };
}

/** A parcel with a courier tracking number can be followed on Shiprocket's
 *  public tracking page (client, 2026-09-17). */
function canTrack(order: Order): boolean {
  return Boolean(order.awb) && order.status !== "cancelled";
}

/**
 * Three buttons exist and a row shows at most two of them (client,
 * 2026-09-17): **Pay now** opens Razorpay on the spot, **Track order** opens
 * Shiprocket's page for the parcel, and **View details** opens the order.
 * Which of the first two appears depends on whether the order is waiting to
 * be paid or already has a tracking number; View details is always there.
 */
function OrderActions({ order }: { order: Order }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {awaitingPayment(order) && (
        <PayNowButton orderId={order.id} amountLabel={formatPaise(order.total)} compact />
      )}
      {canTrack(order) && (
        <a
          href={trackingUrl(order.awb!)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap border border-accent bg-accent px-4 text-xs font-semibold text-surface transition-colors hover:bg-accent-strong"
        >
          Track order
          <ArrowRightIcon className="h-3.5 w-3.5 -rotate-45" />
          <span className="sr-only">(opens Shiprocket in a new tab)</span>
        </a>
      )}
      <Link
        href={`/account/orders/${order.id}`}
        className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap border border-line-strong px-4 text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
      >
        View details
        <ArrowRightIcon className="h-3.5 w-3.5" />
      </Link>
    </span>
  );
}

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "All",       value: "all" },
  { label: "Pending",   value: "pending" },
  { label: "Payment due", value: "payment_due" },
  { label: "Payment failed", value: "payment_failed" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Shipped",   value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
];

type SortKey = "date" | "items" | "total";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="inline-flex flex-col items-center justify-center ml-1.5 gap-[2px]">
      <svg
        width="9"
        height="6"
        viewBox="0 0 9 6"
        fill="currentColor"
        className={`transition-colors ${
          active && dir === "asc"
            ? "text-accent"
            : active
            ? "text-muted/30"
            : "text-muted group-hover:text-ink"
        }`}
        aria-hidden="true"
      >
        <path d="M4.5 0.5L8.5 5.5H0.5L4.5 0.5Z" />
      </svg>
      <svg
        width="9"
        height="6"
        viewBox="0 0 9 6"
        fill="currentColor"
        className={`transition-colors ${
          active && dir === "desc"
            ? "text-accent"
            : active
            ? "text-muted/30"
            : "text-muted group-hover:text-ink"
        }`}
        aria-hidden="true"
      >
        <path d="M4.5 5.5L0.5 0.5H8.5L4.5 5.5Z" />
      </svg>
    </span>
  );
}

export function OrderHistoryTable({ orders }: { orders: Order[] }) {
  const router = useRouter();
  /**
   * The whole row opens the order (client, 2026-09-17), not only its button.
   * A click on a link or button inside keeps its own job — Track parcel still
   * opens Shiprocket — and a click that ends a text selection (somebody
   * copying the order number) does not navigate. The order number is a real
   * link too, so keyboard users and "open in new tab" still work.
   */
  const openOrder = (event: React.MouseEvent, id: string) => {
    if ((event.target as HTMLElement).closest("a, button")) return;
    if (window.getSelection()?.toString()) return;
    router.push(`/account/orders/${id}`);
  };
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!filterDropdownRef.current?.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilterOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filterOpen]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = orders.filter((o) => {
      const matchesStatus = statusFilter === "all" || displayStatus(o).key === statusFilter;
      const matchesSearch =
        !q ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });

    rows.sort((a, b) => {
      let diff = 0;
      if (sortKey === "date")  diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortKey === "items") diff = a.items.length - b.items.length;
      if (sortKey === "total") diff = a.total - b.total;
      return sortDir === "asc" ? diff : -diff;
    });

    return rows;
  }, [orders, search, statusFilter, sortKey, sortDir]);

  const thClass = "group select-none cursor-pointer whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted hover:text-ink transition-colors";
  const thInner = "inline-flex items-center gap-1.5";

  return (
    <div className="mt-4">
      {/* ── Stats row ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-ink tabular-nums">{orders.length}</span>
        <span className="text-sm text-muted">{orders.length === 1 ? "order" : "orders"} total</span>
      </div>

      {/* ── Search + status filter ────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Search — grows to fill remaining space */}
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <input
            id="order-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order ID or product…"
            className="h-10 w-full border border-line bg-surface-raised pl-9 pr-4 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        {/* Status filter custom dropdown — compact on mobile, expands right below */}
        <div ref={filterDropdownRef} className="relative w-28 shrink-0 sm:w-36">
          <button
            type="button"
            id="order-status-filter"
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
            aria-haspopup="listbox"
            className="flex h-10 w-full items-center justify-between border border-line bg-surface-raised px-3 text-left text-sm text-ink transition-colors hover:border-accent focus:border-accent focus:outline-none"
          >
            <span className="truncate">
              {STATUS_FILTERS.find((f) => f.value === statusFilter)?.label ?? "All"}
            </span>
            <svg
              className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${filterOpen ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {/* Expanded dropdown menu */}
          {filterOpen && (
            <div
              role="listbox"
              aria-label="Filter by status"
              className="absolute right-0 top-full z-30 mt-1 min-w-full w-36 border border-line bg-surface-raised py-1 shadow-card sm:w-40"
            >
              {STATUS_FILTERS.map((f) => {
                const isSelected = statusFilter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      setStatusFilter(f.value);
                      setFilterOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-surface-subtle ${
                      isSelected ? "font-semibold text-accent" : "text-ink"
                    }`}
                  >
                    <span>{f.label}</span>
                    {isSelected && (
                      <svg className="h-3.5 w-3.5 text-accent" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Filtered count */}
      {statusFilter !== "all" || search ? (
        <p className="mt-3 text-xs text-muted">
          Showing {filtered.length} of {orders.length} {orders.length === 1 ? "order" : "orders"}
        </p>
      ) : null}

      {/* ── Table / Cards ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="mt-6 border border-line bg-surface-raised px-6 py-12 text-center">
          <p className="font-semibold text-ink">No orders match</p>
          <p className="mt-1 text-sm text-muted">Try a different search or clear the filter.</p>
        </div>
      ) : (
        <>
          {/* Desktop table — from `xl` only (2026-09-17). With the Payment
              column and a second button for trackable parcels it needs ~930px,
              which the account column only has at `xl`; between `sm` and `xl`
              it scrolled sideways inside its box. The cards below cover
              everything narrower. */}
          <div className="mt-4 hidden overflow-x-auto border border-line bg-surface-raised shadow-card xl:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-subtle">
                <tr>
                  <th scope="col" className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-muted">
                    Order ID
                  </th>
                  <th
                    scope="col"
                    className={`px-4 py-3.5 ${thClass}`}
                    onClick={() => handleSort("date")}
                    aria-sort={sortKey === "date" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span className={thInner}>
                      Date
                      <SortIcon active={sortKey === "date"} dir={sortDir} />
                    </span>
                  </th>
                  <th
                    scope="col"
                    className={`px-4 py-3.5 text-center ${thClass}`}
                    onClick={() => handleSort("items")}
                    aria-sort={sortKey === "items" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span className={`${thInner} justify-center`}>
                      Items
                      <SortIcon active={sortKey === "items"} dir={sortDir} />
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-muted">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-muted">
                    Payment
                  </th>
                  <th
                    scope="col"
                    className={`px-4 py-3.5 text-right ${thClass}`}
                    onClick={() => handleSort("total")}
                    aria-sort={sortKey === "total" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span className={`${thInner} justify-end`}>
                      Total
                      <SortIcon active={sortKey === "total"} dir={sortDir} />
                    </span>
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-muted">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const s = displayStatus(order);
                  const pay = paymentText(order);
                  return (
                    <tr
                      key={order.id}
                      onClick={(event) => openOrder(event, order.id)}
                      onMouseEnter={() => router.prefetch(`/account/orders/${order.id}`)}
                      /* A border round the row on hover (client, 2026-09-17):
                         an outline, because a `tr` cannot carry a border of
                         its own in a collapsed table. */
                      className="cursor-pointer transition-colors hover:bg-surface-subtle/50 hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-accent"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/account/orders/${order.id}`}
                          className="whitespace-nowrap font-mono text-sm font-semibold text-ink hover:text-accent hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="px-4 py-4 text-center text-sm text-body">
                        {order.items.length}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 text-xs font-semibold ${s.className}`}>
                          {s.label}
                        </span>
                        {/* Where a shipped parcel actually is, from the courier —
                            "Out for delivery" is the one worth seeing without
                            opening the order. */}
                        {order.status === "shipped" && trackingLabel(order.trackingStatus) && (
                          <span className="mt-1 block text-xs text-muted">
                            {trackingLabel(order.trackingStatus)}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm">
                        <span className="font-medium text-ink">{pay.method}</span>
                        {pay.state && (
                          <span className="mt-0.5 block text-xs text-muted">{pay.state}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right font-bold tabular-nums text-accent whitespace-nowrap">
                        {formatPaise(order.total)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <OrderActions order={order} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cards, below `xl` */}
          <ul className="mt-4 space-y-3 xl:hidden">
            {filtered.map((order) => {
              const s = displayStatus(order);
              const pay = paymentText(order);
              return (
                <li
                  key={order.id}
                  onClick={(event) => openOrder(event, order.id)}
                  className="cursor-pointer border border-line bg-surface-raised p-4 shadow-card transition-colors hover:border-accent"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={`/account/orders/${order.id}`}
                      className="font-mono text-sm font-semibold text-ink hover:text-accent"
                    >
                      {order.orderNumber}
                    </Link>
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold ${s.className}`}>
                      {s.label}
                    </span>
                  </div>
                  {/* Wraps: with the payment method added, a shipped online order's
                      line (date · items · Online · Paid · In transit) no longer
                      fits one row at 390px. */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{formatDate(order.createdAt)}</span>
                    <span aria-hidden>·</span>
                    <span>{order.items.length} {order.items.length === 1 ? "item" : "items"}</span>
                    <span aria-hidden>·</span>
                    <span>{pay.state ? `${pay.method} · ${pay.state}` : pay.method}</span>
                    {order.status === "shipped" && trackingLabel(order.trackingStatus) && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{trackingLabel(order.trackingStatus)}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                    <span className="text-base font-bold tabular-nums text-accent">
                      {formatPaise(order.total)}
                    </span>
                    <OrderActions order={order} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
