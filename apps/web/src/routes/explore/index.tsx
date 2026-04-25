import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ExternalSearchResults } from "@staccato/shared";

export const Route = createFileRoute("/explore/")({ component: ExplorePage });

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ExplorePage() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [playingMbid, setPlayingMbid] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["external-search", debouncedQ],
    queryFn: async (): Promise<ExternalSearchResults> => {
      const res = await fetch(
        `/api/search/external?q=${encodeURIComponent(debouncedQ)}`,
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedQ.length >= 2,
    staleTime: 60_000,
  });

  const handlePreview = (
    recordingMbid: string,
    artistName: string,
    title: string,
  ) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingMbid === recordingMbid) {
      audio.pause();
      setPlayingMbid(null);
      return;
    }

    window.dispatchEvent(new Event("staccato:preview-start"));
    const params = new URLSearchParams({ artistName, trackTitle: title });
    audio.src = `/api/preview/${recordingMbid}/stream?${params}`;
    audio.play().catch(() => {});
    setPlayingMbid(recordingMbid);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setPlayingMbid(null);
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, []);

  const hasResults =
    data &&
    (data.recordings.length > 0 ||
      data.artists.length > 0 ||
      data.releases.length > 0);

  return (
    <div className="p-6">
      <audio ref={audioRef} />
      <h1 className="text-2xl font-bold tracking-tight mb-6">Explore</h1>

      <Input
        placeholder="Search MusicBrainz..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-lg mb-6"
        autoFocus
      />

      {isFetching && (
        <p className="text-sm text-muted-foreground">Searching…</p>
      )}

      {!isFetching && debouncedQ.length >= 2 && !hasResults && (
        <p className="text-sm text-muted-foreground">
          No results for "{debouncedQ}"
        </p>
      )}

      {hasResults && (
        <div className="space-y-8">
          {data.artists.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Artists
              </h2>
              <div className="space-y-1">
                {data.artists.map((artist) => (
                  <div
                    key={artist.artistMbid}
                    className="px-3 py-2 rounded-md hover:bg-accent/50"
                  >
                    <p className="text-sm font-medium">{artist.name}</p>
                    {artist.disambiguation && (
                      <p className="text-xs text-muted-foreground">
                        {artist.disambiguation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.releases.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Releases
              </h2>
              <div className="space-y-1">
                {data.releases.map((release) => (
                  <div
                    key={release.releaseMbid}
                    className="grid grid-cols-[1fr_1fr_5rem] items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {release.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {release.artistName}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {release.releaseType ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {release.releaseYear ?? "—"}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.recordings.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Recordings
              </h2>
              <div className="space-y-1">
                {data.recordings.map((recording) => {
                  const isPlaying = playingMbid === recording.recordingMbid;
                  return (
                    <div
                      key={recording.recordingMbid}
                      className="grid grid-cols-[2rem_1fr_1fr_5rem_2rem] items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/50 group"
                    >
                      <div className="flex items-center justify-center text-muted-foreground">
                        <Music2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {recording.title}
                          {recording.inLibrary && (
                            <span className="ml-1 shrink-0 text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                              Library
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {recording.artistName}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {recording.releaseName ?? "—"}
                        {recording.releaseYear && (
                          <span className="before:content-['·'] before:mx-1">
                            {recording.releaseYear}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatDuration(recording.durationMs)}
                      </p>
                      <button
                        onClick={() =>
                          handlePreview(
                            recording.recordingMbid,
                            recording.artistName,
                            recording.title,
                          )
                        }
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        title={isPlaying ? "Stop preview" : "Preview"}
                      >
                        {isPlaying ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
