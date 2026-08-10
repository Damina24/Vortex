"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

/**
 * Custom window event fired after the user's credit balance changes (e.g., an
 * AI spend). Any mounted component can subscribe via `useLiveCredits` below.
 */
export const CREDITS_UPDATED_EVENT = "vortex:credits-updated";

/** Broadcast that the user's credit balance changed. Call after a successful spend. */
export function notifyCreditsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CREDITS_UPDATED_EVENT));
}

/**
 * True when an API call failed because the user ran out of credits. The
 * server-side AI routes return HTTP 402 with a human-readable message in
 * `error.response.data.error`.
 */
export function isInsufficientCreditsError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 402;
}

async function fetchLiveCreditsBalance(): Promise<number | null> {
  try {
    const response = await axios.get("/api/v1/me");
    const balance = response.data?.data?.user?.creditsBalance;
    return typeof balance === "number" ? balance : null;
  } catch {
    return null; // keep the last known balance if the network request fails
  }
}

/**
 * Live credit balance for client components. Starts from the server-provided
 * value, then refreshes from `/api/v1/me` on mount and whenever
 * `notifyCreditsUpdated()` fires (e.g., after an AI-powered spend).
 */
export function useLiveCredits(initialBalance: number) {
  const [balance, setBalance] = useState(initialBalance);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    const fresh = await fetchLiveCreditsBalance();
    if (isMounted.current) {
      if (fresh !== null) {
        setBalance(fresh);
      }
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    window.addEventListener(CREDITS_UPDATED_EVENT, refresh);
    // Sync with the DB on mount; the session token's balance can be stale.
    refresh();

    return () => {
      isMounted.current = false;
      window.removeEventListener(CREDITS_UPDATED_EVENT, refresh);
    };
  }, [refresh]);

  return { balance, isRefreshing, refresh };
}