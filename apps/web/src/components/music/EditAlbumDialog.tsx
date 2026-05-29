import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { AlbumEditResponse } from "@staccato/shared";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type AddTrackItem,
  type DraftAlbum,
  type DraftTrack,
  type SourceTrack,
  buildEditPayload,
  computeDirty,
  normalizeCredits,
  renumberTracks,
  toDraftTrack,
} from "./edit-album-utils";
import { AddTracksPane } from "./edit-album/AddTracksPane";
import { CoverTab } from "./edit-album/CoverTab";
import { DetailsTab } from "./edit-album/DetailsTab";
import { TracksTab } from "./edit-album/TracksTab";

type TabId = "details" | "cover" | "tracks";

export interface EditAlbumDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  albumKey: string;
  album: {
    id: string;
    title: string;
    artistName: string;
    releaseYear: number | null;
    coverArtUrl: string | null;
  };
  tracks: SourceTrack[];
  defaultTab?: TabId;
}

export function EditAlbumDialog({
  open,
  onOpenChange,
  albumKey,
  album,
  tracks,
  defaultTab = "details",
}: EditAlbumDialogProps) {
  const queryClient = useQueryClient();

  // The original (pre-edit) snapshot, derived from props. Used for the dirty
  // diff and to re-seed the draft each time the dialog opens.
  const originalAlbum = useMemo<DraftAlbum>(
    () => ({
      title: album.title,
      artistName: album.artistName,
      releaseYear: album.releaseYear,
      coverArtUrl: album.coverArtUrl,
    }),
    [album.title, album.artistName, album.releaseYear, album.coverArtUrl],
  );
  const originalTracks = useMemo<DraftTrack[]>(
    () => tracks.map((t) => toDraftTrack(t, album.artistName)),
    [tracks, album.artistName],
  );

  const [tab, setTab] = useState<TabId>(defaultTab);
  const [draftAlbum, setDraftAlbum] = useState<DraftAlbum>(originalAlbum);
  const [draftTracks, setDraftTracks] = useState<DraftTrack[]>(originalTracks);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingTracks, setAddingTracks] = useState(false);
  const [extraDiscs, setExtraDiscs] = useState<number[]>([]);

  // Reset the draft to the original whenever the dialog (re)opens.
  useEffect(() => {
    if (!open) return;
    setTab(defaultTab);
    setDraftAlbum(originalAlbum);
    setDraftTracks(originalTracks);
    setExpandedId(null);
    setAddingTracks(false);
    setExtraDiscs([]);
  }, [open, defaultTab, originalAlbum, originalTracks]);

  const dirty = computeDirty(
    originalAlbum,
    originalTracks,
    draftAlbum,
    draftTracks,
  );

  const setAlbumKey = <K extends keyof DraftAlbum>(k: K, v: DraftAlbum[K]) =>
    setDraftAlbum((a) => ({ ...a, [k]: v }));

  const trackDiscs = [...new Set(draftTracks.map((t) => t.disc))];
  const allDiscs = [...new Set([...trackDiscs, ...extraDiscs])].sort(
    (a, b) => a - b,
  );
  const multiDisc = allDiscs.length > 1;

  const setTrack = (id: string, patch: Partial<DraftTrack>) =>
    setDraftTracks((prev) => {
      let next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      if ("disc" in patch) {
        next = renumberTracks([...next].sort((a, b) => a.disc - b.disc));
      }
      return next;
    });

  const removeTrack = (id: string) =>
    setDraftTracks((prev) => renumberTracks(prev.filter((t) => t.id !== id)));

  const addDisc = () =>
    setExtraDiscs((d) => [
      ...d,
      (allDiscs.length ? Math.max(...allDiscs) : 0) + 1,
    ]);

  const removeDisc = (disc: number) =>
    setExtraDiscs((d) => d.filter((x) => x !== disc));

  const addTracks = (items: AddTrackItem[]) => {
    const targetDisc = allDiscs[allDiscs.length - 1] ?? 1;
    const added: DraftTrack[] = items.map((it) => ({
      id: it.id,
      n: 0,
      disc: targetDisc,
      title: it.title,
      dur: it.durationSeconds ?? 0,
      artists: normalizeCredits(it.artists, it.artistName),
    }));
    setDraftTracks((prev) =>
      renumberTracks([...prev, ...added].sort((a, b) => a.disc - b.disc)),
    );
    setAddingTracks(false);
  };

  const saveMutation = useMutation({
    mutationFn: async (): Promise<AlbumEditResponse> => {
      const res = await fetch(`/api/albums/${album.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildEditPayload(draftAlbum, draftTracks)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["album", albumKey] });
      toast.success("Album updated");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const tabs: { id: TabId; label: string; count: number | null }[] = [
    { id: "details", label: "Details", count: null },
    { id: "cover", label: "Cover art", count: null },
    { id: "tracks", label: "Tracks", count: draftTracks.length },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saveMutation.isPending && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[900px] p-0 gap-0 block overflow-hidden">
        <div className="flex flex-col h-[716px] max-h-[calc(100vh-5rem)]">
          {/* Header */}
          <div className="px-5 pt-4 border-b border-border shrink-0">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-foreground tracking-[-0.005em] font-heading">
                  Edit album
                </h2>
                <p className="text-[0.78rem] text-muted-foreground mt-0.5">
                  {album.title} · {album.artistName}
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              {tabs.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setAddingTracks(false);
                      setTab(t.id);
                    }}
                    className={cn(
                      "-mb-px inline-flex items-center gap-1.5 px-3 pt-2.5 pb-3.5 text-[0.85rem] border-b-2 transition-colors",
                      active
                        ? "text-foreground font-semibold border-primary"
                        : "text-muted-foreground font-medium border-transparent hover:text-foreground",
                    )}
                  >
                    {t.label}
                    {t.count !== null && (
                      <span
                        className={cn(
                          "text-[0.7rem] text-muted-foreground/80 px-1.5 py-px rounded-full tabular-nums",
                          active ? "bg-foreground/10" : "bg-foreground/[0.04]",
                        )}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === "details" && (
              <DetailsTab
                album={draftAlbum}
                setAlbumKey={setAlbumKey}
                tracks={draftTracks}
              />
            )}
            {tab === "cover" && (
              <CoverTab album={draftAlbum} setAlbumKey={setAlbumKey} />
            )}
            {tab === "tracks" && !addingTracks && (
              <TracksTab
                tracks={draftTracks}
                extraDiscs={extraDiscs}
                allDiscs={allDiscs}
                multiDisc={multiDisc}
                expandedId={expandedId}
                onToggleExpand={(id) =>
                  setExpandedId((cur) => (cur === id ? null : id))
                }
                onTracksReorder={setDraftTracks}
                setTrack={setTrack}
                removeTrack={removeTrack}
                addDisc={addDisc}
                removeDisc={removeDisc}
                onAddTracks={() => setAddingTracks(true)}
              />
            )}
            {tab === "tracks" && addingTracks && (
              <AddTracksPane
                albumArtist={draftAlbum.artistName}
                existingIds={draftTracks.map((t) => t.id)}
                onBack={() => setAddingTracks(false)}
                onAdd={addTracks}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border bg-muted/40 shrink-0">
            <div className="flex items-center gap-2 text-[0.78rem] text-muted-foreground">
              {dirty > 0 ? (
                <>
                  <span className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
                  {dirty === 1
                    ? "1 unsaved change"
                    : `${dirty} unsaved changes`}
                </>
              ) : (
                <span className="text-muted-foreground/70">No changes</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={dirty === 0 || saveMutation.isPending}
                className="gap-2"
              >
                {saveMutation.isPending && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                Save changes
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
