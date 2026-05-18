import { useEffect } from "react";
import type { RefObject } from "react";

interface Options {
  ref: RefObject<HTMLElement | null>;
  onIntersect: () => void;
  enabled: boolean;
  rootMargin?: string;
}

export function useInfiniteScrollSentinel({
  ref,
  onIntersect,
  enabled,
  rootMargin = "600px 0px",
}: Options) {
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onIntersect();
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, onIntersect, enabled, rootMargin]);
}
