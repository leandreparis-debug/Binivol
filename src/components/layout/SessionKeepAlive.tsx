"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const RENEW_EVERY_MS = 60 * 60 * 1000;
const STORAGE_KEY = "binivol:session-renewed-at";

function lastRenewal(): number {
  try {
    return Number(sessionStorage.getItem(STORAGE_KEY) ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Renews the 12 h session after each hour of activity: on navigation, when
 * the last renewal is older than one hour, it calls Auth.js's session
 * endpoint, which extends the database session and its cookie.
 */
export function SessionKeepAlive() {
  const pathname = usePathname();
  useEffect(() => {
    if (Date.now() - lastRenewal() < RENEW_EVERY_MS) return;
    void fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" }).then(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {
        // Storage unavailable (private mode): renewal simply happens again.
      }
    });
  }, [pathname]);
  return null;
}
