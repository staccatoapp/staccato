import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/music";
import type { DraftTrack } from "../edit-album-utils";
import { ArtistCreditsEditor } from "./ArtistCreditsEditor";
import { Field } from "./fields";
import { TRACK_GRID } from "./tracks-shared";

export function SortableTrackRow({
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
