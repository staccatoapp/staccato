import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ListMusic, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PlaylistListItem } from "@staccato/shared";

export const Route = createFileRoute("/playlists/")({
  component: PlaylistsPage,
});

function PlaylistsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data } = useQuery({
    queryKey: ["playlists"],
    queryFn: async (): Promise<{ items: PlaylistListItem[] }> => {
      const res = await fetch("/api/playlists");
      if (!res.ok) throw new Error("Failed to fetch playlists");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({
      name,
      description,
    }: {
      name: string;
      description?: string;
    }) => {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) throw new Error("Failed to create playlist");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      setDialogOpen(false);
      setNewName("");
      setNewDesc("");
    },
  });

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate({
      name: newName.trim(),
      description: newDesc.trim() || undefined,
    });
  };

  const items = data?.items ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Playlists</h1>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Playlist
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <ListMusic className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-sm">No playlists yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((p) => (
            <Link
              key={p.id}
              to="/playlists/$playlistId"
              params={{ playlistId: p.id }}
            >
              <div className="group cursor-pointer space-y-2">
                <div className="aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
                  {p.coverArtUrl ? (
                    <img
                      src={p.coverArtUrl}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ListMusic className="w-12 h-12 text-muted-foreground/30" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {p.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.trackCount} {p.trackCount === 1 ? "track" : "tracks"}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Playlist name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || createMutation.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
