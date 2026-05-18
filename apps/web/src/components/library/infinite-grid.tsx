import { Fragment, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";

interface InfiniteGridProps<T> {
  items: T[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage?: boolean;
  onEndReached: () => void;
  renderItem: (item: T) => ReactNode;
  renderSkeleton: () => ReactNode;
  skeletonCount?: number;
  minColumnWidth?: number;
  footerSkeletonCount?: number;
}

function buildGridStyle(minColumnWidth: number): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
    gap: "1.5rem 1rem",
  };
}

export function InfiniteGrid<T extends { id?: string }>({
  items,
  isLoading,
  isFetchingNextPage,
  hasNextPage = true,
  onEndReached,
  renderItem,
  renderSkeleton,
  skeletonCount = 18,
  minColumnWidth = 140,
  footerSkeletonCount = 6,
}: InfiniteGridProps<T>) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useInfiniteScrollSentinel({
    ref: sentinelRef,
    onIntersect: onEndReached,
    enabled: hasNextPage && !isFetchingNextPage && items.length > 0,
  });

  const gridStyle = buildGridStyle(minColumnWidth);

  if (items.length === 0) {
    if (!isLoading) return null;
    return (
      <div style={gridStyle}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <Fragment key={i}>{renderSkeleton()}</Fragment>
        ))}
      </div>
    );
  }

  return (
    <>
      <div style={gridStyle}>
        {items.map((item, i) => (
          <Fragment key={item.id ?? i}>{renderItem(item)}</Fragment>
        ))}
        {isFetchingNextPage &&
          Array.from({ length: footerSkeletonCount }).map((_, i) => (
            <Fragment key={`skel-${i}`}>{renderSkeleton()}</Fragment>
          ))}
      </div>
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
    </>
  );
}
