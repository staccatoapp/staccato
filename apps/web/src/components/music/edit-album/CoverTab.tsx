import { useState } from "react";
import { Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DraftAlbum } from "../edit-album-utils";
import { CoverArt } from "./CoverArt";
import { microLabel } from "./fields";

export function CoverTab({
  album,
  setAlbumKey,
}: {
  album: DraftAlbum;
  setAlbumKey: <K extends keyof DraftAlbum>(k: K, v: DraftAlbum[K]) => void;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleUse = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setError("Enter a valid image URL.");
      return;
    }
    // The server downloads + caches the cover and only fetches over https.
    if (parsed.protocol !== "https:") {
      setError("Cover URL must start with https://");
      return;
    }
    setError(null);
    setAlbumKey("coverArtUrl", trimmed);
  };

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
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder="https://example.com/cover.jpg"
            />
            <Button variant="outline" onClick={handleUse}>
              Use
            </Button>
          </div>
          {error && <p className="text-[0.74rem] text-destructive">{error}</p>}
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
