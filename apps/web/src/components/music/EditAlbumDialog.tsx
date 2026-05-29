import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Disc3,
  GripVertical,
  Loader2,
  Music2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import type { AlbumEditResponse } from "@staccato/shared";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTime, generateAlbumGradient } from "@/lib/music";
import {
  type DraftAlbum,
  type DraftCredit,
  type DraftTrack,
  type SourceTrack,
  buildEditPayload,
  computeDirty,
  JOIN_PHRASES,
  normalizeCredits,
  renumberTracks,
  toDraftTrack,
} from "./edit-album-utils";

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

const GROUP_PREFIX = "disc:";
const groupKey = (disc: number) => `${GROUP_PREFIX}${disc}`;
const discFromKey = (key: string) => Number(key.slice(GROUP_PREFIX.length));

// ─── Small shared bits ──────────────────────────────────────
const microLabel =
  "text-[0.62rem] font-semibold tracking-[0.1em] uppercase text-muted-foreground";

function CoverArt({
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
  return (
    <div
      className="shrink-0 relative overflow-hidden flex items-center justify-center shadow-[0_20px_50px_oklch(0_0_0/0.5),0_0_0_1px_oklch(0_0_0/0.3)_inset]"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: album.coverArtUrl
          ? `center/cover no-repeat url("${album.coverArtUrl}")`
          : gradient,
      }}
    >
      {!album.coverArtUrl && (
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

// ─── Main dialog ────────────────────────────────────────────
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
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <X className="size-4" />
              </Button>
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

// ─── Details tab ────────────────────────────────────────────
function DetailsTab({
  album,
  setAlbumKey,
  tracks,
}: {
  album: DraftAlbum;
  setAlbumKey: <K extends keyof DraftAlbum>(k: K, v: DraftAlbum[K]) => void;
  tracks: DraftTrack[];
}) {
  const totalSeconds = tracks.reduce((s, t) => s + (t.dur || 0), 0);
  const totalMin = Math.round(totalSeconds / 60);
  return (
    <div className="px-6 pt-6 pb-7">
      <div className="grid grid-cols-[minmax(0,1fr)_216px] gap-10 items-start">
        <div>
          <p className={cn(microLabel, "mb-3")}>Album information</p>
          <div className="flex flex-col gap-3.5">
            <Field label="Title">
              <Input
                value={album.title}
                onChange={(e) => setAlbumKey("title", e.target.value)}
              />
            </Field>
            <Field
              label="Album artist"
              hint="The primary artist credited on the release."
            >
              <Input
                value={album.artistName}
                onChange={(e) => setAlbumKey("artistName", e.target.value)}
              />
            </Field>
            <Field label="Release year">
              <Input
                type="number"
                className="w-40 tabular-nums"
                value={album.releaseYear ?? ""}
                onChange={(e) =>
                  setAlbumKey(
                    "releaseYear",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </Field>
          </div>
        </div>

        <div>
          <p className={cn(microLabel, "mb-3")}>Preview</p>
          <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-foreground/[0.03] border border-border">
            <CoverArt album={album} size={168} radius={10} />
            <div className="w-full">
              <div className="text-[0.98rem] font-bold text-foreground leading-tight break-words">
                {album.title || "Untitled album"}
              </div>
              <div className="text-[0.82rem] text-muted-foreground mt-0.5">
                {album.artistName || "Unknown artist"}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[0.72rem] text-muted-foreground/70 tabular-nums">
                <span>{album.releaseYear || "—"}</span>
                <span>·</span>
                <span>
                  {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
                </span>
                {totalSeconds > 0 && (
                  <>
                    <span>·</span>
                    <span>{totalMin} min</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={cn(microLabel, "mb-1.5 block")}>{label}</span>
      {children}
      {hint && (
        <span className="block text-[0.7rem] text-muted-foreground mt-1">
          {hint}
        </span>
      )}
    </label>
  );
}

// ─── Cover tab ──────────────────────────────────────────────
function CoverTab({
  album,
  setAlbumKey,
}: {
  album: DraftAlbum;
  setAlbumKey: <K extends keyof DraftAlbum>(k: K, v: DraftAlbum[K]) => void;
}) {
  const [url, setUrl] = useState("");
  return (
    <div className="px-6 pt-6 pb-7">
      <p className={cn(microLabel, "mb-3")}>Cover art</p>
      <div className="grid grid-cols-[200px_1fr] gap-5">
        <CoverArt album={album} size={200} radius={12} />
        <div className="flex flex-col gap-3.5">
          {/* Upload zone — disabled until the Phase-2 upload endpoint exists. */}
          <div
            aria-disabled
            className="rounded-[10px] border-[1.5px] border-dashed border-input bg-foreground/[0.02] px-4 py-5 text-center opacity-60 cursor-not-allowed"
          >
            <div className="flex justify-center mb-2 text-muted-foreground">
              <Upload className="size-5" />
            </div>
            <div className="text-[0.84rem] font-medium text-foreground mb-0.5">
              Drag &amp; drop upload coming soon
            </div>
            <div className="text-[0.74rem] text-muted-foreground">
              For now, paste an image URL below.
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[0.7rem] text-muted-foreground/70 tracking-[0.08em] uppercase">
              paste url
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/cover.jpg"
            />
            <Button
              variant="outline"
              onClick={() => {
                if (url.trim()) setAlbumKey("coverArtUrl", url.trim());
              }}
            >
              Use
            </Button>
          </div>
          {album.coverArtUrl && (
            <button
              type="button"
              onClick={() => setAlbumKey("coverArtUrl", null)}
              className="self-start text-[0.74rem] text-muted-foreground hover:text-destructive transition-colors"
            >
              Remove cover (use placeholder)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tracks tab ─────────────────────────────────────────────
const TRACK_GRID = "grid-cols-[24px_36px_1fr_52px_52px]";

function buildOrder(
  tracks: DraftTrack[],
  extraDiscs: number[],
): Record<string, string[]> {
  const discs = [
    ...new Set([...tracks.map((t) => t.disc), ...extraDiscs]),
  ].sort((a, b) => a - b);
  const order: Record<string, string[]> = {};
  for (const d of discs) {
    order[groupKey(d)] = tracks.filter((t) => t.disc === d).map((t) => t.id);
  }
  return order;
}

function TracksTab({
  tracks,
  extraDiscs,
  allDiscs,
  multiDisc,
  expandedId,
  onToggleExpand,
  onTracksReorder,
  setTrack,
  removeTrack,
  addDisc,
  removeDisc,
  onAddTracks,
}: {
  tracks: DraftTrack[];
  extraDiscs: number[];
  allDiscs: number[];
  multiDisc: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onTracksReorder: (next: DraftTrack[]) => void;
  setTrack: (id: string, patch: Partial<DraftTrack>) => void;
  removeTrack: (id: string) => void;
  addDisc: () => void;
  removeDisc: (disc: number) => void;
  onAddTracks: () => void;
}) {
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const [order, setOrder] = useState<Record<string, string[]>>(() =>
    buildOrder(tracks, extraDiscs),
  );
  const orderRef = useRef(order);
  const draggingRef = useRef(false);

  // Re-sync the dnd ordering from the draft whenever it changes outside of a
  // drag (disc edits, add/remove track, add disc, reset).
  useEffect(() => {
    if (draggingRef.current) return;
    const next = buildOrder(tracks, extraDiscs);
    orderRef.current = next;
    setOrder(next);
  }, [tracks, extraDiscs]);

  const propagate = (current: Record<string, string[]>) => {
    const next: DraftTrack[] = [];
    for (const key of Object.keys(current).sort(
      (a, b) => discFromKey(a) - discFromKey(b),
    )) {
      const disc = discFromKey(key);
      for (const id of current[key] ?? []) {
        const t = byId.get(id);
        if (t) next.push({ ...t, disc });
      }
    }
    onTracksReorder(renumberTracks(next));
  };

  return (
    <div className="px-5 pt-4 pb-7">
      <div className="flex items-center justify-between mb-3">
        <p className={microLabel}>
          Tracks · {tracks.length}
          {multiDisc ? ` across ${allDiscs.length} discs` : ""}
        </p>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={addDisc}
            className="gap-1.5"
          >
            <Disc3 className="size-3.5" />
            Add disc
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onAddTracks}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Add tracks
          </Button>
        </div>
      </div>

      {/* Column headers */}
      <div
        className={cn(
          "grid gap-2.5 px-2 pt-1 pb-2 border-b border-border text-[0.6rem] font-semibold tracking-[0.08em] uppercase text-muted-foreground/70",
          TRACK_GRID,
        )}
      >
        <span />
        <span className="text-center">#</span>
        <span>Title · artist</span>
        <span className="text-right">Time</span>
        <span />
      </div>

      <DragDropProvider
        onDragStart={() => {
          draggingRef.current = true;
        }}
        onDragOver={(event) => {
          const next = move(orderRef.current, event) as Record<
            string,
            string[]
          >;
          orderRef.current = next;
          setOrder(next);
        }}
        onDragEnd={(event) => {
          draggingRef.current = false;
          if (event.canceled) {
            const reset = buildOrder(tracks, extraDiscs);
            orderRef.current = reset;
            setOrder(reset);
            return;
          }
          propagate(orderRef.current);
        }}
      >
        {allDiscs.map((disc) => {
          const ids = order[groupKey(disc)] ?? [];
          const empty = ids.length === 0;
          const removable = empty && allDiscs.length > 1;
          return (
            <DiscGroup
              key={disc}
              disc={disc}
              count={ids.length}
              multiDisc={multiDisc}
              removable={removable}
              onRemove={() => removeDisc(disc)}
            >
              {empty ? (
                <div className="my-1.5 px-2 py-4 text-center text-[0.74rem] text-muted-foreground/70 rounded-lg border-[1.5px] border-dashed border-border">
                  Drag tracks here
                </div>
              ) : (
                ids.map((id, index) => {
                  const t = byId.get(id);
                  if (!t) return null;
                  return (
                    <SortableTrackRow
                      key={id}
                      track={t}
                      index={index}
                      group={groupKey(disc)}
                      expanded={expandedId === id}
                      onToggleExpand={() => onToggleExpand(id)}
                      setTrack={(patch) => setTrack(id, patch)}
                      onRemove={() => removeTrack(id)}
                    />
                  );
                })
              )}
            </DiscGroup>
          );
        })}
      </DragDropProvider>
    </div>
  );
}

function DiscGroup({
  disc,
  count,
  multiDisc,
  removable,
  onRemove,
  children,
}: {
  disc: number;
  count: number;
  multiDisc: boolean;
  removable: boolean;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: groupKey(disc),
    type: "disc",
    accept: "track",
  });
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg transition-colors",
        isDropTarget && "bg-primary/10",
      )}
    >
      {multiDisc && (
        <div className="flex items-center gap-2 px-2 pt-3.5 pb-1.5">
          <Disc3 className="size-3.5 text-muted-foreground" />
          <span className="text-[0.7rem] font-bold tracking-[0.08em] uppercase text-foreground">
            Disc {disc}
          </span>
          <span className="text-[0.7rem] text-muted-foreground/70">
            · {count} {count === 1 ? "track" : "tracks"}
          </span>
          <div className="flex-1" />
          {removable && (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Remove empty disc"
              onClick={onRemove}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      )}
      <div className={multiDisc ? "mb-2" : "mt-1"}>{children}</div>
    </div>
  );
}

function SortableTrackRow({
  track,
  index,
  group,
  expanded,
  onToggleExpand,
  setTrack,
  onRemove,
}: {
  track: DraftTrack;
  index: number;
  group: string;
  expanded: boolean;
  onToggleExpand: () => void;
  setTrack: (patch: Partial<DraftTrack>) => void;
  onRemove: () => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: track.id,
    index,
    type: "track",
    accept: "track",
    group,
  });

  return (
    <div
      ref={ref}
      className={cn(
        "group relative rounded-lg border transition-colors",
        expanded
          ? "bg-foreground/[0.04] border-border mb-1.5"
          : "border-transparent hover:bg-foreground/[0.025]",
        isDragging && "opacity-40",
      )}
    >
      <div className={cn("grid gap-2.5 items-center px-2 py-1.5", TRACK_GRID)}>
        <button
          ref={handleRef}
          type="button"
          title="Drag to reorder"
          className={cn(
            "inline-flex justify-center text-muted-foreground/70 cursor-grab transition-opacity",
            expanded ? "opacity-100" : "opacity-40 group-hover:opacity-100",
          )}
        >
          <GripVertical className="size-3.5" />
        </button>
        <RowNumberInput value={track.n} onChange={(v) => setTrack({ n: v })} />
        <div className="min-w-0">
          <button
            type="button"
            onClick={onToggleExpand}
            title="Edit details"
            className="flex items-center h-7 px-2 w-full text-left text-[0.84rem] text-foreground truncate"
          >
            {track.title || (
              <span className="text-muted-foreground/70">Untitled track</span>
            )}
          </button>
          <div className="px-2 text-[0.72rem] truncate">
            {track.artists
              .filter((a) => a.name.trim() !== "")
              .map((a, i, arr) => (
                <span key={i}>
                  {i > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      {(arr[i - 1]?.joinPhrase ?? "").trim() || "·"}{" "}
                    </span>
                  )}
                  <span
                    className={
                      i === 0 ? "text-muted-foreground" : "text-foreground"
                    }
                  >
                    {a.name}
                  </span>
                </span>
              ))}
          </div>
        </div>
        <span className="text-right text-[0.76rem] text-muted-foreground tabular-nums">
          {formatTime(track.dur)}
        </span>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            title={expanded ? "Done" : "Edit details"}
            onClick={onToggleExpand}
          >
            <Pencil className={cn("size-3", expanded && "text-primary")} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Remove track"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3.5 pt-0.5 pr-3 pb-3.5 pl-[42px]">
          <div className="grid grid-cols-[1fr_84px] gap-3 items-start">
            <Field label="Title">
              <Input
                value={track.title}
                onChange={(e) => setTrack({ title: e.target.value })}
              />
            </Field>
            <Field label="Disc">
              <Input
                type="number"
                className="tabular-nums"
                value={track.disc}
                onChange={(e) =>
                  setTrack({
                    disc:
                      e.target.value === ""
                        ? 1
                        : Math.max(1, Number(e.target.value)),
                  })
                }
              />
            </Field>
          </div>
          <ArtistCreditsEditor
            artists={track.artists}
            onChange={(artists) => setTrack({ artists })}
            onDone={onToggleExpand}
          />
        </div>
      )}
    </div>
  );
}

function RowNumberInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      aria-label="Track number"
      value={value}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, "");
        onChange(digits === "" ? 0 : Number(digits));
      }}
      className="h-7 w-[30px] mx-auto text-center rounded-md bg-transparent border border-transparent text-[0.84rem] text-foreground tabular-nums font-mono outline-none focus:bg-input focus:border-ring transition-colors"
    />
  );
}

// ─── Artist credits editor ──────────────────────────────────
function ArtistCreditsEditor({
  artists,
  onChange,
  onDone,
}: {
  artists: DraftCredit[];
  onChange: (artists: DraftCredit[]) => void;
  onDone: () => void;
}) {
  const list = artists.length ? artists : [{ name: "", joinPhrase: null }];

  const setRow = (i: number, patch: Partial<DraftCredit>) =>
    onChange(list.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  const addArtist = () => {
    const next = list.map((a, idx) =>
      idx === list.length - 1
        ? { ...a, joinPhrase: a.joinPhrase || "feat." }
        : a,
    );
    next.push({ name: "", joinPhrase: null });
    onChange(next);
  };

  const removeArtist = (i: number) => {
    let next = list.filter((_, idx) => idx !== i);
    if (!next.length) next = [{ name: "", joinPhrase: null }];
    const last = next[next.length - 1];
    if (last) next[next.length - 1] = { ...last, joinPhrase: null };
    onChange(next);
  };

  const grid = "grid grid-cols-[1fr_132px_28px] gap-2.5";

  return (
    <div>
      <div
        className={cn(
          grid,
          "pb-1.5 text-[0.62rem] font-semibold tracking-[0.1em] uppercase text-muted-foreground",
        )}
      >
        <span>Track artist</span>
        <span>Join phrase</span>
        <span />
      </div>
      <datalist id="edit-join-phrases">
        {JOIN_PHRASES.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="flex flex-col gap-2">
        {list.map((a, i) => {
          const isLast = i === list.length - 1;
          return (
            <div key={i} className={cn(grid, "items-center")}>
              <CreditInput
                value={a.name}
                placeholder={i === 0 ? "Primary artist" : "Featured artist"}
                onChange={(v) => setRow(i, { name: v })}
              />
              <CreditInput
                value={a.joinPhrase ?? ""}
                placeholder={isLast ? "—" : "feat."}
                disabled={isLast}
                list="edit-join-phrases"
                title={
                  isLast
                    ? "Add another artist to set a join phrase"
                    : "Phrase linking to the next artist"
                }
                onChange={(v) => setRow(i, { joinPhrase: v })}
              />
              {list.length > 1 ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Remove artist"
                  onClick={() => removeArtist(i)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </Button>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>
      <div className={cn(grid, "items-center mt-2.5")}>
        <div className="flex justify-start">
          <Button
            variant="ghost"
            size="sm"
            onClick={addArtist}
            className="gap-1.5"
          >
            <Plus className="size-3" />
            Add track artist
          </Button>
        </div>
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onDone}
            className="gap-1.5"
          >
            <Check className="size-3" />
            Done editing
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreditInput({
  value,
  onChange,
  placeholder,
  disabled,
  list,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  list?: string;
  title?: string;
}) {
  return (
    <Input
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      list={list}
      title={title}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ─── Add tracks sub-pane ────────────────────────────────────
interface AddTrackItem {
  id: string;
  title: string;
  artistName: string;
  albumTitle: string | null;
  durationSeconds: number | null;
  artists: {
    artistId: string;
    name: string;
    joinPhrase: string | null;
    position: number;
  }[];
}

interface LibrarySearchResponse {
  tracks: AddTrackItem[];
}

function AddTracksPane({
  albumArtist,
  existingIds,
  onBack,
  onAdd,
}: {
  albumArtist: string;
  existingIds: string[];
  onBack: () => void;
  onAdd: (items: AddTrackItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, AddTrackItem>>(
    new Map(),
  );
  const existing = useMemo(() => new Set(existingIds), [existingIds]);

  const searchQuery = useQuery({
    queryKey: ["library-search", query],
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<LibrarySearchResponse> => {
      const res = await fetch(
        `/api/library/search?q=${encodeURIComponent(query.trim())}`,
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
  });

  const results = (searchQuery.data?.tracks ?? []).filter(
    (t) => !existing.has(t.id),
  );
  const sameArtist = results.filter((t) => t.artistName === albumArtist);
  const others = results.filter((t) => t.artistName !== albumArtist);

  const toggle = (item: AddTrackItem) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });

  return (
    <div className="flex flex-col h-full px-5 pt-3.5 pb-6">
      <div className="flex items-center gap-2.5 mb-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="size-3" />
          Back to tracks
        </Button>
        <div className="flex-1 text-right text-[0.78rem] text-muted-foreground">
          {selected.size > 0 ? (
            <>
              <span className="text-foreground font-semibold">
                {selected.size}
              </span>{" "}
              selected
            </>
          ) : (
            "Pick tracks from your library"
          )}
        </div>
      </div>

      <div className="relative mb-3.5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search library by title, artist or album"
          className="h-9 pl-9"
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 -mr-2 pr-1.5">
        {query.trim().length < 2 ? (
          <p className="text-center text-[0.8rem] text-muted-foreground/70 py-12">
            Type at least 2 characters to search your library.
          </p>
        ) : searchQuery.isFetching ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Searching…
          </div>
        ) : results.length === 0 ? (
          <p className="text-center text-[0.8rem] text-muted-foreground/70 py-12">
            No matching tracks.
          </p>
        ) : (
          <>
            <AddTrackGroup
              title={`${albumArtist} tracks`}
              tracks={sameArtist}
              selected={selected}
              onToggle={toggle}
              highlight
            />
            <AddTrackGroup
              title="Everything else"
              tracks={others}
              selected={selected}
              onToggle={toggle}
            />
          </>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Map())}
          >
            Clear
          </Button>
          <Button size="sm" onClick={() => onAdd([...selected.values()])}>
            Add {selected.size} {selected.size === 1 ? "track" : "tracks"}
          </Button>
        </div>
      )}
    </div>
  );
}

function AddTrackGroup({
  title,
  tracks,
  selected,
  onToggle,
  highlight,
}: {
  title: string;
  tracks: AddTrackItem[];
  selected: Map<string, AddTrackItem>;
  onToggle: (item: AddTrackItem) => void;
  highlight?: boolean;
}) {
  if (tracks.length === 0) return null;
  return (
    <div className="mb-4">
      <div
        className={cn(
          "px-2 mb-1.5 text-[0.65rem] font-semibold tracking-[0.1em] uppercase",
          highlight ? "text-primary" : "text-muted-foreground",
        )}
      >
        {title}
      </div>
      <div>
        {tracks.map((t) => {
          const isSel = selected.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onToggle(t)}
              className={cn(
                "grid grid-cols-[22px_1fr_56px] gap-3 items-center w-full text-left px-2.5 py-2 rounded-lg border transition-colors",
                isSel
                  ? "bg-primary/10 border-primary/30"
                  : "border-transparent hover:bg-foreground/[0.04]",
              )}
            >
              <span
                className={cn(
                  "size-4 rounded-[5px] border-[1.5px] inline-flex items-center justify-center",
                  isSel
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-input",
                )}
              >
                {isSel && <Check className="size-2.5" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.86rem] font-medium text-foreground truncate">
                  {t.title}
                </span>
                <span className="block text-[0.74rem] text-muted-foreground truncate">
                  {t.artistName}
                  {t.albumTitle ? ` · ${t.albumTitle}` : ""}
                </span>
              </span>
              <span className="text-right text-[0.74rem] text-muted-foreground tabular-nums">
                {t.durationSeconds == null
                  ? "—"
                  : formatTime(t.durationSeconds)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
