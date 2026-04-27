import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ExternalSearchResults } from "@staccato/shared";
import { AlbumCard } from "@/components/music/AlbumCard";

export const Route = createFileRoute("/explore/")({ component: ExplorePage });

type Tab = "tracks" | "albums" | "artists";

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function hasMinLength(
  tab: Tab,
  f: { track: string; album: string; artist: string },
) {
  if (tab === "tracks")
    return f.track.length >= 2 || f.album.length >= 2 || f.artist.length >= 2;
  if (tab === "albums") return f.album.length >= 2 || f.artist.length >= 2;
  return f.artist.length >= 2;
}

function buildParams(
  tab: Tab,
  f: { track: string; album: string; artist: string },
): URLSearchParams {
  const p = new URLSearchParams();
  if (tab === "tracks") {
    p.set("type", "recording");
    if (f.track) p.set("recording", f.track);
    if (f.album) p.set("release", f.album);
    if (f.artist) p.set("artist", f.artist);
  } else if (tab === "albums") {
    p.set("type", "release");
    if (f.album) p.set("release", f.album);
    if (f.artist) p.set("artist", f.artist);
  } else {
    p.set("type", "artist");
    if (f.artist) p.set("artist", f.artist);
  }
  return p;
}

function ExplorePage() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tab, setTab] = useState<Tab>("tracks");
  const [fields, setFields] = useState({ track: "", album: "", artist: "" });
  const [debounced, setDebounced] = useState(fields);
  const [playingMbid, setPlayingMbid] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(fields), 300);
    return () => clearTimeout(t);
  }, [fields]);

  function switchTab(value: string | null) {
    if (!value) return;
    setTab(value as Tab);
    setFields({ track: "", album: "", artist: "" });
    setDebounced({ track: "", album: "", artist: "" });
  }

  const { data, isFetching } = useQuery({
    queryKey: [
      "external-search",
      tab,
      debounced.track,
      debounced.album,
      debounced.artist,
    ],
    queryFn: async (): Promise<ExternalSearchResults> => {
      const res = await fetch(
        `/api/search/external?${buildParams(tab, debounced)}`,
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: hasMinLength(tab, debounced),
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

  const searched = hasMinLength(tab, debounced);
  const hasResults =
    data &&
    (data.recordings.length > 0 ||
      data.artists.length > 0 ||
      data.releases.length > 0);

  const statusLine = isFetching ? (
    <p className="text-sm text-muted-foreground">Searching…</p>
  ) : searched && !hasResults ? (
    <p className="text-sm text-muted-foreground">No results found.</p>
  ) : null;

  return (
    <div className="p-6">
      <audio ref={audioRef} />
      <h1 className="text-2xl font-bold tracking-tight mb-6">Explore</h1>

      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList className="mb-3">
          <TabsTrigger value="tracks">Tracks</TabsTrigger>
          <TabsTrigger value="albums">Albums</TabsTrigger>
          <TabsTrigger value="artists">Artists</TabsTrigger>
        </TabsList>

        {/* ── Tracks tab ── */}
        <TabsContent value="tracks">
          <div className="max-w-lg mb-6 rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
            <Input
              className="border-0 rounded-none shadow-none focus-visible:ring-0"
              placeholder="Track title…"
              value={fields.track}
              onChange={(e) =>
                setFields((f) => ({ ...f, track: e.target.value }))
              }
              autoFocus
            />
            <div className="flex items-center border-t border-border">
              <span className="px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-20 shrink-0 border-r border-border py-2">
                Album
              </span>
              <Input
                className="border-0 rounded-none shadow-none focus-visible:ring-0 text-sm py-2 h-auto"
                placeholder="Album (optional)…"
                value={fields.album}
                onChange={(e) =>
                  setFields((f) => ({ ...f, album: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center border-t border-border">
              <span className="px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-20 shrink-0 border-r border-border py-2">
                By artist
              </span>
              <Input
                className="border-0 rounded-none shadow-none focus-visible:ring-0 text-sm py-2 h-auto"
                placeholder="Artist (optional)…"
                value={fields.artist}
                onChange={(e) =>
                  setFields((f) => ({ ...f, artist: e.target.value }))
                }
              />
            </div>
          </div>

          {statusLine}

          {data && data.recordings.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Tracks
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
        </TabsContent>

        {/* ── Albums tab ── */}
        <TabsContent value="albums">
          <div className="max-w-lg mb-6 rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
            <Input
              className="border-0 rounded-none shadow-none focus-visible:ring-0"
              placeholder="Album title…"
              value={fields.album}
              onChange={(e) =>
                setFields((f) => ({ ...f, album: e.target.value }))
              }
              autoFocus
            />
            <div className="flex items-center border-t border-border">
              <span className="px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-20 shrink-0 border-r border-border py-2">
                By artist
              </span>
              <Input
                className="border-0 rounded-none shadow-none focus-visible:ring-0 text-sm py-2 h-auto"
                placeholder="Artist (optional)…"
                value={fields.artist}
                onChange={(e) =>
                  setFields((f) => ({ ...f, artist: e.target.value }))
                }
              />
            </div>
          </div>

          {statusLine}

          {data && data.releases.length > 0 && (
            <div
              className="grid gap-x-4 gap-y-6"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              }}
            >
              {data.releases.map((release) => (
                <AlbumCard
                  key={release.releaseMbid}
                  title={release.title}
                  artistName={release.artistName}
                  releaseYear={release.releaseYear}
                  coverArtUrl={
                    release.releaseGroupMbid
                      ? `https://coverartarchive.org/release-group/${release.releaseGroupMbid}/front`
                      : null
                  }
                  href={`/explore/albums/${release.releaseGroupMbid ?? release.releaseMbid}`}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Artists tab ── */}
        <TabsContent value="artists">
          <div className="max-w-lg mb-6 rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
            <Input
              className="border-0 rounded-none shadow-none focus-visible:ring-0"
              placeholder="Artist name…"
              value={fields.artist}
              onChange={(e) =>
                setFields((f) => ({ ...f, artist: e.target.value }))
              }
              autoFocus
            />
          </div>

          {statusLine}

          {data && data.artists.length > 0 && (
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
