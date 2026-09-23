"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a media query.
 *
 * `useSyncExternalStore` is what makes this safe to use in a prerendered tree:
 * React renders the server snapshot on the server and on the first client pass,
 * then re-renders once the real query has been read, so the value can never
 * cause a hydration mismatch — only a reflow after hydration. Reach for this
 * when a layout decision genuinely depends on the viewport and CSS alone cannot
 * express it, such as *moving* a panel between two slots rather than hiding it.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
