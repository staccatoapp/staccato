import { useEffect, useState } from "react";
import { Music2 } from "lucide-react";
import { generateAlbumGradient } from "@/lib/music";
import type { DraftAlbum } from "../edit-album-utils";

export function CoverArt({
  album,
  size,
  radius,
}: {
  album: DraftAlbum;
  size: number;
  radius: number;
}) {
  const gradient = generateAlbumGradient(
    album.title || " ",
    album.artistName || " ",
  );
  // Render the cover via an <img> over a gradient background rather than
  // interpolating the URL into an inline `background` string. coverArtUrl is
  // user-supplied (Cover tab) and albums are shared across users, so string
  // interpolation would be a stored CSS-injection vector; React escapes the
  // src attribute. Mirrors AlbumHeader's gradient-with-img-fallback pattern.
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [album.coverArtUrl]);
  const showImage = !!album.coverArtUrl && !imgFailed;
  return (
    <div
      className="shrink-0 relative overflow-hidden flex items-center justify-center shadow-[0_20px_50px_oklch(0_0_0/0.5),0_0_0_1px_oklch(0_0_0/0.3)_inset]"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: gradient,
      }}
    >
      {showImage ? (
        <img
          src={album.coverArtUrl ?? undefined}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <Music2
          className="text-white/25"
          style={{
            width: Math.round(size * 0.28),
            height: Math.round(size * 0.28),
          }}
        />
      )}
    </div>
  );
}
