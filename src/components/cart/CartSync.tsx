"use client";

import { useEffect, useRef } from "react";
import {
  readCart,
  readGuestCart,
  handleUserLogin,
  handleUserLogout,
  isClientAuthenticated,
  setClientAuthStatus,
  subscribeCart,
} from "@/lib/cart";
import { syncCartAction, saveAccountCartAction } from "@/app/(site)/account/private-actions";

interface CartSyncProps {
  customerId: string | null;
}

/**
 * CartSync manages cart persistence and synchronization between the client
 * browser and PostgreSQL across authentication states.
 *
 * Rules:
 * 1. Scenario 1 (Guest Cart Merge on Login):
 *    When a guest logs in, any items added as a guest are merged into their
 *    Postgres account cart. The merged cart is written to the active cart,
 *    and the device guest store is cleared.
 *
 * 2. Scenario 2 (Cart Isolation on Logout & Device ID Guest Restoration):
 *    When an authenticated user logs out, the active cart is immediately cleared
 *    to prevent data leakage on shared devices. The backend DB cart remains intact.
 *    Any items previously added on this device as a guest are restored.
 *
 * 3. Ongoing sync:
 *    While authenticated, cart modifications (add/qty/remove) are debounced
 *    and saved to PostgreSQL.
 */
export function CartSync({ customerId }: CartSyncProps) {
  const prevCustomerIdRef = useRef<string | null>(customerId);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    const prevCustomerId = prevCustomerIdRef.current;

    // Detect Logout: customerId transitioned from a user id to null, or client claims auth but server says null
    if (!customerId) {
      if (prevCustomerId !== null || isClientAuthenticated()) {
        handleUserLogout();
      }
      prevCustomerIdRef.current = null;
      return;
    }

    // Detect Login / Session start: customerId is present
    const runLoginSync = async () => {
      const needsSync = prevCustomerId !== customerId || !isClientAuthenticated();
      prevCustomerIdRef.current = customerId;

      if (!needsSync || isSyncingRef.current) return;

      isSyncingRef.current = true;
      try {
        const guestLines = readGuestCart();
        const activeLines = readCart();
        // If guestLines has items use them; otherwise use activeLines if client was unauthenticated
        const itemsToMerge = guestLines.length > 0 ? guestLines : (!isClientAuthenticated() ? activeLines : []);

        const merged = await syncCartAction(itemsToMerge);
        handleUserLogin(merged);
      } catch (err) {
        console.error("[CartSync] Failed to merge cart on login:", err);
        setClientAuthStatus(true);
      } finally {
        isSyncingRef.current = false;
      }
    };

    runLoginSync();
  }, [customerId]);

  // Debounce syncing active cart edits to PostgreSQL when authenticated
  useEffect(() => {
    if (!customerId) return;

    const unsubscribe = subscribeCart(() => {
      if (isSyncingRef.current) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const lines = readCart();
          const result = await saveAccountCartAction(lines);
          // The session ended somewhere else while this tab stayed open.
          // Stop claiming to be signed in; the next render decides the rest,
          // and the basket in localStorage is left exactly as it is.
          if (result.status === "signed-out") {
            setClientAuthStatus(false);
            unsubscribe();
          }
        } catch (err) {
          console.error("[CartSync] Failed to persist cart to DB:", err);
        }
      }, 600);
    });

    return () => {
      unsubscribe();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [customerId]);

  return null;
}
