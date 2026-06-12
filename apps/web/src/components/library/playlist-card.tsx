import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import type { PlaylistListItem } from "@staccato/shared";
import { PlaylistArtwork } from "@/components/library/playlist-artwork";

export const PlaylistCard = memo(function PlaylistCard({
  playlist,
}: {
  playlist: PlaylistListItem;
}) {
  return (
    <Link
      to="/playlists/$playlistId"
      params={{ playlistId: playlist.id }}
      className="group block cursor-pointer min-w-0"
    >
      <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-2.5 shadow-md">
        <PlaylistArtwork
          coverArtUrls={playlist.coverArtUrls}
          name={playlist.name}
        />
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
        {playlist.name}
      </p>
      <p className="text-[0.72rem] text-muted-foreground mt-0.5">
        {playlist.trackCount} {playlist.trackCount === 1 ? "track" : "tracks"}
      </p>
    </Link>
  );
});
