import { type ReactNode, useState } from "react";
import { User } from "lucide-react";
import { generateAlbumGradient } from "@/lib/music";

export function ArtistHeader({
  name,
  imageUrl,
  albumCount,
  subtitle,
  backLink,
  children,
}: {
  name: string;
  imageUrl?: string | null;
  albumCount?: number | null;
  subtitle?: string | null;
  backLink?: ReactNode;
  children?: ReactNode;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const gradient = generateAlbumGradient(name, "");
  const showGradient = !imageUrl || imgFailed;

  const fallbackSubtitle =
    albumCount != null
      ? `${albumCount} ${albumCount === 1 ? "album" : "albums"}`
      : null;
  const metaLine = subtitle ?? fallbackSubtitle;

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
            className="shrink-0 rounded-full overflow-hidden shadow-2xl"
            style={{
              width: "11rem",
              height: "11rem",
              background: showGradient ? gradient : undefined,
            }}
          >
            {imageUrl && !imgFailed ? (
              <img
                src={imageUrl}
                alt={name}
                className="w-full h-full object-cover"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-14 h-14 text-white/20" />
              </div>
            )}
          </div>

          <div className="min-w-0 pb-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Artist
            </p>
            <h1 className="text-4xl font-bold tracking-tight leading-tight text-foreground mb-2 line-clamp-2">
              {name}
            </h1>
            {metaLine && (
              <p className="text-sm text-muted-foreground">{metaLine}</p>
            )}
            {children && <div className="mt-4 flex gap-2">{children}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
