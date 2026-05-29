import { useEffect, useMemo, useRef, useState } from "react";
import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { Disc3, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type DraftTrack, renumberTracks } from "../edit-album-utils";
import { SortableTrackRow } from "./TrackRow";
import { discFromKey, groupKey, TRACK_GRID } from "./tracks-shared";
import { microLabel } from "./fields";

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

export function TracksTab({
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
