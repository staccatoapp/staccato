import { Skeleton } from "@/components/ui/skeleton";

export function AlbumDetailSkeleton() {
  return (
    <div>
      <div className="px-6 pt-6 pb-8 bg-muted/30">
        <Skeleton className="h-4 w-16" />
        <div className="flex gap-6 mt-6 items-end">
          <Skeleton className="w-44 h-44 shrink-0 rounded-md" />
          <div className="space-y-3 pb-1 flex-1">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      </div>
      <div className="px-6 pt-4 space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}
