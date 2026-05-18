import { memo, useEffect, useMemo, useState } from "react";
import { User } from "lucide-react";
import { generateAlbumGradient } from "@/lib/music";
import { cn } from "@/lib/utils";

export const ArtistCard = memo(function ArtistCard({
  artist,
  albumCount,
}: {
  artist: { id: string; name: string; imageUrl: string | null };
  albumCount?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const gradient = useMemo(
    () => generateAlbumGradient(artist.name, ""),
    [artist.name],
  );

  useEffect(() => {
    setLoaded(false);
  }, [artist.imageUrl]);

  return (
    <div className="group cursor-pointer min-w-0 text-center">
      <div
        className="relative aspect-square w-full rounded-full overflow-hidden mb-2.5 shadow-md"
        style={{ background: gradient }}
      >
        {artist.imageUrl ? (
          <img
            src={artist.imageUrl}
            alt={artist.name}
            decoding="async"
            className={cn(
              "w-full h-full object-cover transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0",
            )}
            onLoad={() => setLoaded(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <User className="w-8 h-8 text-white/15" />
          </div>
        )}
      </div>
      <p className="text-[0.8125rem] font-semibold text-foreground truncate leading-snug">
        {artist.name}
      </p>
      {albumCount != null && (
        <p className="text-[0.72rem] text-muted-foreground mt-0.5">
          {albumCount} {albumCount === 1 ? "album" : "albums"}
        </p>
      )}
    </div>
  );
});
