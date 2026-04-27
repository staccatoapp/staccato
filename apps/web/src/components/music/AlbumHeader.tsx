import { type ReactNode, useState } from "react";
import { Music2 } from "lucide-react";
import { generateAlbumGradient } from "@/lib/music";

function formatTotalDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}

export function AlbumHeader({
  title,
  artistName,
  releaseYear,
  coverArtUrl,
  trackCount,
  totalSeconds,
  backLink,
  children,
}: {
  title: string;
  artistName: string;
  releaseYear?: number | null;
  coverArtUrl?: string | null;
  trackCount: number;
  totalSeconds: number;
  backLink?: ReactNode;
  children?: ReactNode;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const gradient = generateAlbumGradient(title, artistName);
  const showGradient = !coverArtUrl || imgFailed;

  return (
    <div className="relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-50 blur-3xl scale-150"
        style={{ background: gradient }}
        aria-hidden="true"
      />
      <div className="relative px-6 pt-6 pb-8">
        {backLink}
        <div className="flex gap-6 mt-6 items-end">
          <div
            className="shrink-0 rounded-md shadow-2xl overflow-hidden"
            style={{
              width: "11rem",
              height: "11rem",
              background: showGradient ? gradient : undefined,
            }}
          >
            {coverArtUrl && !imgFailed ? (
              <img
                src={coverArtUrl}
                alt={title}
                className="w-full h-full object-cover"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music2 className="w-12 h-12 text-white/20" />
              </div>
            )}
          </div>

          <div className="min-w-0 pb-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Album
            </p>
            <h1 className="text-3xl font-bold tracking-tight leading-tight text-foreground mb-2 line-clamp-2">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {artistName}
              {releaseYear && (
                <span className="before:content-['·'] before:mx-1.5">
                  {releaseYear}
                </span>
              )}
              <span className="before:content-['·'] before:mx-1.5">
                {trackCount} tracks
              </span>
              {totalSeconds > 0 && (
                <span className="before:content-['·'] before:mx-1.5">
                  {formatTotalDuration(totalSeconds)}
                </span>
              )}
            </p>
            {children && <div className="mt-4 flex gap-2">{children}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
