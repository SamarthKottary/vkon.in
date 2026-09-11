/**
 * The cart, kept in the visitor's own browser.
 *
 * Same shape as `lib/recent.ts` and for the same reasons — `localStorage`, no
 * account, no cookie, nothing leaving the device — with one difference that
 * matters and is easy to miss.
 *
 * **`recent.ts` subscribes to `storage` alone; this cannot.** That event fires
 * in *other* tabs only. It is enough there because the write happens on a
 * product page and the read on the home page, two separate documents. A cart
 * is read and written in the same document: press "Add to cart" and the header
 * count has to move now, in this tab. So writes here also dispatch a custom
 * event on `window`, and subscribers listen for both — the custom event for
 * this tab, `storage` for the others.
 *
 * **Slugs and quantities are stored, never product data.** Caching names,
 * images or prices would mean a product later renamed, repriced, unpublished
 * or deleted keeps showing its old self in the cart and links to a 404. The
 * cart page resolves slugs against the live catalogue and silently drops what
 * no longer exists — which is also what will make adding real prices later a
 * server-side concern rather than a migration of everyone's stored cart.
 *
 * There is no checkout yet. This is the state layer for one, deliberately
 * built so that adding payment later touches the pages and not this file.
 */

const KEY = "vkon-cart";
const GUEST_KEY = "vkon_guest_cart";
const DEVICE_KEY = "vkon_device_id";
const AUTH_KEY = "vkon_auth_status";

/** Same-tab change signal. See the note above on why `storage` is not enough. */
const EVENT = "vkon-cart-change";

/** Sanity caps, not business rules — they exist so a malformed or tampered
 *  value cannot render ten thousand rows or request a million units. */
const MAX_LINES = 50;
const MAX_QTY = 99;

export type CartLine = {
  /** Resolved against the live catalogue at render time. */
  slug: string;
  qty: number;
};

/**
 * Returns a stable unique ID for this browser/device.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "ephemeral";
  }
}

/**
 * Marks whether the current client is authenticated.
 */
export function setClientAuthStatus(authenticated: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (authenticated) {
      window.localStorage.setItem(AUTH_KEY, "true");
    } else {
      window.localStorage.removeItem(AUTH_KEY);
    }
  } catch {}
}

export function isClientAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUTH_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Reads unauthenticated guest items persisted specifically for this device.
 */
export function readGuestCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    return parseCart(raw ?? "");
  } catch {
    return [];
  }
}

/**
 * Writes guest items for this device.
 */
export function writeGuestCart(lines: CartLine[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(lines.slice(0, MAX_LINES)));
  } catch {}
}

/**
 * Clears guest items for this device (called once guest items have merged into a user account).
 */
export function clearGuestCart(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_KEY);
  } catch {}
}

/**
 * Handles user login: sets the active cart to the merged lines and clears the device guest cart.
 */
export function handleUserLogin(mergedLines: CartLine[]): void {
  setClientAuthStatus(true);
  clearGuestCart();
  writeCart(mergedLines);
}

/**
 * Handles user logout:
 * 1. Immediately wipes active visible cart so no user items leak.
 * 2. Restores only the items added as an unauthenticated guest on this device.
 */
export function handleUserLogout(): void {
  setClientAuthStatus(false);
  const guestLines = readGuestCart();
  // Overwrite visible cart with only guest lines (or empty)
  writeCart(guestLines);
}

/**
 * Raw stored value, for `useSyncExternalStore`.
 *
 * Returns the *string*, not a parsed array: the snapshot must be
 * referentially stable or React re-renders forever. Parse it in a `useMemo`
 * on the value this returns.
 */
export function getCartSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * `null`, and deliberately not `""` — the two states must stay
 * distinguishable. `""` means "storage was read and the cart is empty", so
 * show the empty message. `null` means "not read yet": the server render and
 * the hydration pass. Collapsing them flashes an empty cart at someone who
 * has one.
 */
export function getCartServerSnapshot(): string | null {
  return null;
}

export function subscribeCart(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function parseCart(raw: string): CartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const lines: CartLine[] = [];

    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const { slug, qty } = entry as { slug?: unknown; qty?: unknown };
      if (typeof slug !== "string" || !slug || seen.has(slug)) continue;

      const n = typeof qty === "number" && Number.isFinite(qty) ? Math.floor(qty) : 1;
      if (n < 1) continue;

      seen.add(slug);
      lines.push({ slug, qty: Math.min(n, MAX_QTY) });
      if (lines.length >= MAX_LINES) break;
    }

    return lines;
  } catch {
    return [];
  }
}

export function readCart(): CartLine[] {
  return parseCart(getCartSnapshot());
}

/** Writes, then tells this tab. Storage failing must never break a page. */
export function writeCart(lines: CartLine[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines.slice(0, MAX_LINES)));
    // If not authenticated, keep device guest cart in sync
    if (!isClientAuthenticated()) {
      window.localStorage.setItem(GUEST_KEY, JSON.stringify(lines.slice(0, MAX_LINES)));
    }
  } catch {
    // Private mode, a full quota, or someone else's key holding junk. The
    // dispatch below still runs so the UI reflects the attempt consistently
    // rather than half-updating.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Signal to open the slide-over Cart Drawer from the right. */
export const DRAWER_EVENT = "vkon-cart-drawer-open";

export function openCartDrawer(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DRAWER_EVENT));
}

export function subscribeCartDrawer(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DRAWER_EVENT, onChange);
  return () => window.removeEventListener(DRAWER_EVENT, onChange);
}

/** Format currency in INR (e.g. ₹818.63) */
export function formatRupees(amount: number): string {
  return "₹" + amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Adds, or increases an existing line. Returns the new total quantity. */
export function addToCart(slug: string, qty = 1): number {
  if (typeof window === "undefined" || !slug) return 0;

  const lines = readCart();
  const existing = lines.find((line) => line.slug === slug);

  if (existing) existing.qty = Math.min(existing.qty + qty, MAX_QTY);
  else lines.push({ slug, qty: Math.min(Math.max(qty, 1), MAX_QTY) });

  writeCart(lines);
  openCartDrawer();
  return cartCount(lines);
}

/** Sets an exact quantity; 0 or less removes the line. */
export function setCartQty(slug: string, qty: number): void {
  const lines = readCart();
  const next =
    qty < 1
      ? lines.filter((line) => line.slug !== slug)
      : lines.map((line) =>
          line.slug === slug ? { ...line, qty: Math.min(qty, MAX_QTY) } : line,
        );
  writeCart(next);
}

export function removeFromCart(slug: string): void {
  writeCart(readCart().filter((line) => line.slug !== slug));
}

export function clearCart(): void {
  writeCart([]);
}

/** Total units, not lines — what a cart badge conventionally shows. */
export function cartCount(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.qty, 0);
}
