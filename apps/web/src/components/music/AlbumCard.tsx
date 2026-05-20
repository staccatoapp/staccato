import { memo, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, Music2, Play, TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { generateAlbumGradient } from "@/lib/music";
import { cn } from "@/lib/utils";

export const AlbumCard = memo(function AlbumCard({
  title,
  artistName,
  releaseYear,
  coverArtUrl,
  href,
  confidenceScore,
  pendingTrackCount,
  threshold = 0.75,
}: {
  title: string;
  artistName?: string | null;
  releaseYear?: number | null;
  coverArtUrl?: string | null;
  href: string;
  confidenceScore?: number | null;
  pendingTrackCount?: number;
  threshold?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const resolutionDone = pendingTrackCount === 0;
  const badgeStatus =
    !resolutionDone || pendingTrackCount === undefined
      ? null
      : confidenceScore === null || confidenceScore === undefined
        ? "no_match"
        : confidenceScore < threshold
          ? "low_confidence"
          : null;
  const pct =
    badgeStatus === "low_confidence" && confidenceScore != null
      ? Math.round(confidenceScore * 100)
      : null;

  const gradient = useMemo(
    () => generateAlbumGradient(title, artistName ?? ""),
    [title, artistName],
  );

  useEffect(() => {
    setImgFailed(false);
    setLoaded(false);
  }, [coverArtUrl]);

  return (
    <Link
      to={href as Parameters<typeof Link>[0]["to"]}
      className="group block cursor-pointer min-w-0"
    >
      <div
        className="relative aspect-square w-full rounded-lg overflow-hidden mb-2.5 shadow-md"
        style={{ background: gradient }}
      >
        {coverArtUrl && !imgFailed ? (
          <img
            src={coverArtUrl}
            alt={title}
            decoding="async"
            className={cn(
              "w-full h-full object-cover transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0",
            )}
            onLoad={() => setLoaded(true)}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Music2 className="w-8 h-8 text-white/15" />
          </div>
        )}
        {badgeStatus === "no_match" && (
          <div className="absolute top-2 left-2 z-10">
            <Badge className="gap-1 text-[0.65rem] px-1.5 py-0.5 bg-black/70 text-white border-0 backdrop-blur-sm hover:bg-black/70">
              <Ban className="w-3 h-3" />
              No match
            </Badge>
          </div>
        )}
        {badgeStatus === "low_confidence" && (
          <div className="absolute top-2 left-2 z-10">
            <Badge className="gap-1 text-[0.65rem] px-1.5 py-0.5 bg-amber-500/80 text-white border-0 backdrop-blur-sm hover:bg-amber-500/80">
              <TriangleAlert className="w-3 h-3" />
              {pct}%
            </Badge>
          </div>
        )}
        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg translate-y-2.5 group-hover:translate-y-0 transition-transform duration-200">
            <Play
              className="w-4 h-4 text-primary-foreground ml-0.5"
              fill="currentColor"
            />
          </div>
        </div>
      </div>
      <p className="text-[0.8125rem] font-semibold text-foreground truncate leading-snug">
        {title}
      </p>
      {(artistName || releaseYear) && (
        <p className="text-[0.72rem] text-muted-foreground truncate mt-0.5">
          {artistName}
          {artistName && releaseYear && <span> · </span>}
          {releaseYear && <span>{releaseYear}</span>}
        </p>
      )}
    </Link>
  );
});

export function AlbumCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-square w-full rounded-lg mb-2.5" />
      <Skeleton className="h-3.5 w-3/4 mb-1.5" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
