import { useEffect, useState } from "react";
import { ListMusic } from "lucide-react";
import { generateAlbumGradient } from "@/lib/music";
import { cn } from "@/lib/utils";

/**
 * Playlist thumbnail artwork. Renders a 2x2 mosaic when exactly 4 cover arts are
 * available, a single full-bleed cover for 1–3, and a gradient + icon
 * placeholder when none exist. Fills its (sized, overflow-hidden) parent.
 */
export function PlaylistArtwork({
  coverArtUrls,
  name,
  iconClassName,
}: {
  coverArtUrls: string[];
  name: string;
  iconClassName?: string;
}) {
  const gradient = generateAlbumGradient(name, "");

  if (coverArtUrls.length === 4) {
    return (
      <div
        className="grid grid-cols-2 grid-rows-2 w-full h-full"
        style={{ background: gradient }}
      >
        {coverArtUrls.map((url, i) => (
          <img
            key={`${url}-${i}`}
            src={url}
            alt=""
            decoding="async"
            className="w-full h-full object-cover"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full" style={{ background: gradient }}>
      {coverArtUrls[0] ? (
        <SingleCover url={coverArtUrls[0]} name={name} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <ListMusic
            className={cn("w-1/4 h-1/4 text-white/20", iconClassName)}
          />
        </div>
      )}
    </div>
  );
}

function SingleCover({ url, name }: { url: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
  }, [url]);

  return (
    <img
      src={url}
      alt={name}
      decoding="async"
      className={cn(
        "w-full h-full object-cover transition-opacity duration-200",
        loaded ? "opacity-100" : "opacity-0",
      )}
      onLoad={() => setLoaded(true)}
    />
  );
}
