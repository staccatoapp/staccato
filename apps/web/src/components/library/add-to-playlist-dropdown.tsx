import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { PlaylistListResponseSchema } from "@staccato/shared";
import type { PlaylistListItem } from "@staccato/shared";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function PlaylistCheckboxRow({
  trackId,
  playlist,
}: {
  trackId: string;
  playlist: PlaylistListItem;
}) {
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState(false);

  const isMember = playlist.isMember ?? false;
  const entryId = playlist.memberEntryId ?? undefined;

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/playlists/${playlist.id}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds: [trackId] }),
      });
      if (!res.ok) throw new Error("Failed to add track");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist", playlist.id] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!entryId) return;
      const res = await fetch(
        `/api/playlists/${playlist.id}/tracks/${entryId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to remove track");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist", playlist.id] });
    },
  });

  const toggle = () => {
    if (isMember && entryId) {
      removeMutation.mutate();
    } else if (!isMember) {
      addMutation.mutate();
    }
  };

  return (
    <button
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 w-full text-left transition-colors",
        hovered ? "bg-white/5" : "bg-transparent",
      )}
      onClick={toggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "w-4 h-4 rounded shrink-0 border flex items-center justify-center transition-colors",
          isMember
            ? "bg-primary border-primary"
            : "bg-transparent border-white/25",
        )}
      >
        {isMember && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
      </div>
      <span
        className={cn(
          "text-[0.8125rem] truncate transition-colors",
          isMember ? "text-foreground font-medium" : "text-muted-foreground",
        )}
      >
        {playlist.name}
      </span>
    </button>
  );
}

export function AddToPlaylistDropdown({
  trackId,
  onOpenChange: notifyParent,
}: {
  trackId: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  const { data: playlistsData } = useQuery({
    queryKey: ["playlists", trackId],
    queryFn: async (): Promise<{ items: PlaylistListItem[] }> => {
      const res = await fetch(
        `/api/playlists?containsTrackId=${encodeURIComponent(trackId)}`,
      );
      if (!res.ok) throw new Error("Failed to fetch playlists");
      return PlaylistListResponseSchema.parse(await res.json());
    },
    enabled: open,
    staleTime: 60_000,
  });

  const playlists = playlistsData?.items ?? [];

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen);
    notifyParent?.(newOpen);
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-white/20 transition-colors"
        title="Add to playlist"
      >
        <Plus className="w-3.5 h-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="end"
        className="w-[200px] p-0 overflow-hidden"
      >
        <div className="px-3 py-2 border-b border-white/10">
          <span className="text-[0.68rem] font-semibold uppercase tracking-widest text-muted-foreground">
            Add to playlist
          </span>
        </div>
        {playlists.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No playlists yet
          </p>
        ) : (
          playlists.map((pl) => (
            <PlaylistCheckboxRow key={pl.id} trackId={trackId} playlist={pl} />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
