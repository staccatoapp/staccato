import { Skeleton } from "@/components/ui/skeleton";

export function ArtistDetailSkeleton() {
  return (
    <div>
      <div className="px-6 pt-6 pb-8 bg-muted/30">
        <Skeleton className="h-4 w-16" />
        <div className="flex gap-6 mt-6 items-end">
          <Skeleton className="w-44 h-44 shrink-0 rounded-full" />
          <div className="space-y-3 pb-1 flex-1">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </div>
      <div
        className="px-6 pt-6 grid gap-x-4 gap-y-6"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-square w-full rounded-md" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
