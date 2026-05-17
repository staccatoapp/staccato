import { forwardRef, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import type { GridComponents, GridListProps, GridItemProps } from "react-virtuoso";
import { useScrollParent } from "@/lib/scroll-parent";

interface InfiniteGridProps<T> {
  items: T[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  onEndReached: () => void;
  renderItem: (item: T) => ReactNode;
  renderSkeleton: () => ReactNode;
  skeletonCount?: number;
  minColumnWidth?: number;
  footerSkeletonCount?: number;
}

type GridContext = {
  gridStyle: CSSProperties;
  isFetchingNextPage: boolean;
  footerSkeletonCount: number;
  renderSkeleton: () => ReactNode;
};

function buildGridStyle(minColumnWidth: number): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
    gap: "1.5rem 1rem",
  };
}

const ITEM_STYLE: CSSProperties = { minWidth: 0 };

const ListContainer = forwardRef<
  HTMLDivElement,
  GridListProps & { context?: GridContext }
>(function ListContainer({ style, children, context, ...props }, ref) {
  const merged = useMemo<CSSProperties>(
    () => ({ ...context?.gridStyle, ...style }),
    [context?.gridStyle, style],
  );
  return (
    <div ref={ref} {...props} style={merged}>
      {children}
    </div>
  );
});

function ItemContainer({
  children,
  context: _ctx,
  ...props
}: GridItemProps & { context?: GridContext }) {
  return (
    <div {...props} style={ITEM_STYLE}>
      {children}
    </div>
  );
}

function GridFooter({ context }: { context?: GridContext }) {
  if (!context?.isFetchingNextPage) return null;
  return (
    <div className="mt-6" style={context.gridStyle}>
      {Array.from({ length: context.footerSkeletonCount }).map((_, i) => (
        <div key={i} style={ITEM_STYLE}>
          {context.renderSkeleton()}
        </div>
      ))}
    </div>
  );
}

const gridComponents: GridComponents<GridContext> = {
  List: ListContainer,
  Item: ItemContainer,
  Footer: GridFooter,
};

export function InfiniteGrid<T>({
  items,
  isLoading,
  isFetchingNextPage,
  onEndReached,
  renderItem,
  renderSkeleton,
  skeletonCount = 18,
  minColumnWidth = 140,
  footerSkeletonCount = 6,
}: InfiniteGridProps<T>) {
  const scrollParent = useScrollParent();
  const gridStyle = useMemo(() => buildGridStyle(minColumnWidth), [minColumnWidth]);

  const context = useMemo<GridContext>(
    () => ({
      gridStyle,
      isFetchingNextPage,
      footerSkeletonCount,
      renderSkeleton,
    }),
    [gridStyle, isFetchingNextPage, footerSkeletonCount, renderSkeleton],
  );

  if (items.length === 0 || !scrollParent) {
    if (!isLoading) return null;
    return (
      <div style={gridStyle}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} style={ITEM_STYLE}>
            {renderSkeleton()}
          </div>
        ))}
      </div>
    );
  }

  return (
    <VirtuosoGrid<T, GridContext>
      customScrollParent={scrollParent}
      initialItemCount={Math.min(items.length, 24)}
      data={items}
      context={context}
      components={gridComponents}
      itemContent={(_, item) => renderItem(item)}
      endReached={onEndReached}
      increaseViewportBy={1600}
    />
  );
}
