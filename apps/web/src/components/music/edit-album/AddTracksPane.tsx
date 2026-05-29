import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/music";
import type { AddTrackItem } from "../edit-album-utils";

interface LibrarySearchResponse {
  tracks: AddTrackItem[];
}

export function AddTracksPane({
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
