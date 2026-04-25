import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, Clock, ListMusic, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PlaylistDetail } from "@staccato/shared";

export const Route = createFileRoute("/playlists/$playlistId")({
  component: PlaylistDetailPage,
});

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTotalDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}

function PlaylistDetailPage() {
  const { playlistId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["playlist", playlistId],
    queryFn: async (): Promise<PlaylistDetail> => {
      const res = await fetch(`/api/playlists/${playlistId}`);
      if (!res.ok) throw new Error("Failed to fetch playlist");
      return res.json();
    },
  });

  const playMutation = useMutation({
    mutationFn: async ({
      trackIds,
      startIndex,
    }: {
      trackIds: string[];
      startIndex: number;
    }) => {
      const res = await fetch("/api/playback/session/play", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds, startIndex }),
      });
      if (!res.ok) throw new Error("Failed to start playback");
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["playback-session"] }),
  });

  const editMutation = useMutation({
    mutationFn: async ({
      name,
      description,
    }: {
      name: string;
      description: string | null;
    }) => {
      const res = await fetch(`/api/playlists/${playlistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) throw new Error("Failed to update playlist");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      setEditOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/playlists/${playlistId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete playlist");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      navigate({ to: "/playlists" });
    },
  });

  const removeTrackMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const res = await fetch(
        `/api/playlists/${playlistId}/tracks/${entryId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to remove track");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });

  if (isLoading)
    return <div className="p-6 text-muted-foreground text-sm">Loading…</div>;

  if (isError || !data)
    return (
      <div className="p-6">
        <Link
          to="/playlists"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" /> Playlists
        </Link>
        <p className="text-sm text-destructive mt-4">Failed to load playlist.</p>
      </div>
    );

  const totalSeconds = data.tracks.reduce(
    (sum, t) => sum + (t.durationSeconds ?? 0),
    0,
  );
  const orderedTrackIds = data.tracks.map((t) => t.trackId);
  const coverArtUrl = data.tracks[0]?.coverArtUrl ?? null;

  return (
    <div className="p-6">
      <Link
        to="/playlists"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Playlists
      </Link>

      <div className="flex items-start gap-4 mb-6">
        <div className="w-32 h-32 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
          {coverArtUrl ? (
            <img
              src={coverArtUrl}
              alt={data.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <ListMusic className="w-12 h-12 text-muted-foreground/30" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold mb-1">{data.name}</h1>
          {data.description && (
            <p className="text-sm text-muted-foreground mb-2">
              {data.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground mb-4">
            {data.tracks.length}{" "}
            {data.tracks.length === 1 ? "track" : "tracks"}
            {totalSeconds > 0 && (
              <span className="before:content-['·'] before:mx-1.5">
                {formatTotalDuration(totalSeconds)}
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                playMutation.mutate({ trackIds: orderedTrackIds, startIndex: 0 })
              }
              disabled={data.tracks.length === 0 || playMutation.isPending}
              className="gap-2"
            >
              <Play className="w-4 h-4" />
              Play
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEditName(data.name);
                setEditDesc(data.description ?? "");
                setEditOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              variant="outline"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {data.tracks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No tracks yet. Add some from an album.
        </p>
      ) : (
        <div>
          <div className="grid grid-cols-[2rem_1fr_1fr_4rem_2rem_2rem] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-widest border-b border-border mb-1">
            <span className="text-right">#</span>
            <span>Title</span>
            <span>Artist</span>
            <span className="flex justify-end">
              <Clock className="w-3.5 h-3.5" />
            </span>
            <span />
            <span />
          </div>
          {data.tracks.map((track, index) => (
            <div
              key={track.entryId}
              className="group grid grid-cols-[2rem_1fr_1fr_4rem_2rem_2rem] gap-3 px-3 py-2.5 rounded-md text-sm hover:bg-accent/50 transition-colors"
            >
              <span className="text-right text-muted-foreground tabular-nums self-center text-xs">
                {index + 1}
              </span>
              <span className="text-foreground truncate self-center">
                {track.title}
              </span>
              <span className="text-muted-foreground truncate self-center text-xs">
                {track.artistName}
              </span>
              <span className="text-right text-muted-foreground tabular-nums self-center text-xs">
                {track.durationSeconds != null
                  ? formatDuration(track.durationSeconds)
                  : "—"}
              </span>
              <button
                onClick={() =>
                  playMutation.mutate({
                    trackIds: orderedTrackIds,
                    startIndex: index,
                  })
                }
                className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end items-center"
                aria-label={`Play ${track.title}`}
              >
                <Play className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={() => removeTrackMutation.mutate(track.entryId)}
                className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end items-center"
                aria-label={`Remove ${track.title}`}
              >
                <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Playlist name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <Input
              placeholder="Description (optional)"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                editMutation.mutate({
                  name: editName.trim(),
                  description: editDesc.trim() || null,
                })
              }
              disabled={!editName.trim() || editMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
