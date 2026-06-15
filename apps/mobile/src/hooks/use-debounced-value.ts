import { useEffect, useState } from "react";

/**
 * Returns `value` delayed by `delayMs`, resetting the timer on every change.
 * Used to debounce the search query so typing doesn't fire a request per
 * keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
