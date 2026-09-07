import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pocket:sidebar-width';

/** Narrow enough to still read a label, wide enough for a long collection name. */
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 460;
export const SIDEBAR_DEFAULT = 256;

export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT;
  return Math.min(Math.max(Math.round(value), SIDEBAR_MIN), SIDEBAR_MAX);
}

/**
 * The sidebar width, kept in this browser. It only applies from the large
 * breakpoint up, where the sidebar is a column; below that it is a drawer with
 * a fixed width and nothing to drag.
 */
export function useSidebarWidth(): {
  width: number;
  setWidth: (value: number) => void;
  reset: () => void;
} {
  const [width, setWidthState] = useState<number>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? clampSidebarWidth(Number(stored)) : SIDEBAR_DEFAULT;
    } catch {
      return SIDEBAR_DEFAULT;
    }
  });

  // Dragging writes on every pointer move, so the store is written after the
  // value settles rather than on each frame.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(width));
      } catch {
        // A private window with storage disabled just loses the preference.
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [width]);

  const setWidth = useCallback((value: number) => {
    setWidthState(clampSidebarWidth(value));
  }, []);

  const reset = useCallback(() => setWidthState(SIDEBAR_DEFAULT), []);

  return { width, setWidth, reset };
}
