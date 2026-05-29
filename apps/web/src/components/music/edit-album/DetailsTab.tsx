import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DraftAlbum, DraftTrack } from "../edit-album-utils";
import { CoverArt } from "./CoverArt";
import { Field, microLabel } from "./fields";

export function DetailsTab({
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
