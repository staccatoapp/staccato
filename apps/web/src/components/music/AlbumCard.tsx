import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Music2, Play } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { generateAlbumGradient } from "@/lib/music";

export function AlbumCard({
  title,
  artistName,
  releaseYear,
  coverArtUrl,
  href,
}: {
  title: string;
  artistName: string;
  releaseYear?: number | null;
  coverArtUrl?: string | null;
  href: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const gradient = generateAlbumGradient(title, artistName);
  const showGradient = !coverArtUrl || imgFailed;

  return (
    <Link
      to={href as Parameters<typeof Link>[0]["to"]}
      className="group block cursor-pointer min-w-0"
    >
      <div
        className="relative aspect-square w-full rounded-lg overflow-hidden mb-2.5 shadow-md"
        style={{ background: showGradient ? gradient : undefined }}
      >
        {coverArtUrl && !imgFailed ? (
          <img
            src={coverArtUrl}
            alt={title}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Music2 className="w-8 h-8 text-white/15" />
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
      <p className="text-[0.72rem] text-muted-foreground truncate mt-0.5">
        {artistName}
        {releaseYear && <span> · {releaseYear}</span>}
      </p>
    </Link>
  );
}

export function AlbumCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-square w-full rounded-lg mb-2.5" />
      <Skeleton className="h-3.5 w-3/4 mb-1.5" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
