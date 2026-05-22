import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ExternalSearchResults, RecommendedTrack } from "@staccato/shared";
import { AlbumCard } from "@/components/music/AlbumCard";
import { RecommendationTile } from "@/components/explore/RecommendationTile";
import {
  RecommendedTrackListHeader,
  RecommendedTrackRow,
  type TrackRowData,
} from "@/components/explore/RecommendedTrackRow";
import { generateAlbumGradient } from "@/lib/music";
import {
  useRecommendedPlaylists,
  useRecommendedTracks,
} from "@/hooks/useRecommendations";
import { usePreviewAudio } from "@/hooks/usePreviewAudio";
import { useRetryDownload } from "@/hooks/useRequestDownload";
import { useRequestDownloadDialog } from "@/hooks/useRequestDownloadDialog";
import { RequestDownloadDialog } from "@/components/downloads/RequestDownloadDialog";
import { toUiStatus, useDownloads } from "@/hooks/useDownloads";

export const Route = createFileRoute("/explore/")({ component: ExplorePage });

function ExplorePage() {
  const navigate = useNavigate();
  const { audioRef, playingMbid, handlePreview } = usePreviewAudio();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recDismissed, setRecDismissed] = useState<Set<string>>(new Set());

  const { data: recTracks, isLoading: recTracksLoading } =
    useRecommendedTracks();
  const { data: recPlaylists, isLoading: recPlaylistsLoading } =
    useRecommendedPlaylists();
  const { byReleaseGroup } = useDownloads();
  const requestDialog = useRequestDownloadDialog();
  const retryDownload = useRetryDownload();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const searched = debounced.trim().length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ["external-search", debounced],
    queryFn: async (): Promise<ExternalSearchResults> => {
      const res = await fetch(
        `/api/search/external?q=${encodeURIComponent(debounced.trim())}`,
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: searched,
    staleTime: 60_000,
  });

  const handleRecommendedTrackPlay = (track: TrackRowData) => {
    if (!track.recordingMbid) return;
    handlePreview(track.recordingMbid, track.artistName ?? "", track.title);
  };

  function addTrackToLibrary(track: RecommendedTrack) {
    if (!track.releaseGroupMbid || !track.artistMbid || !track.artistName) {
      return;
    }
    requestDialog.openSingle({
      subject: "track",
      subjectName: track.title,
      payload: {
        releaseGroupMbid: track.releaseGroupMbid,
        artistMbid: track.artistMbid,
        artistName: track.artistName,
        albumTitle: track.albumTitle,
      },
    });
  }

  function retryTrack(track: RecommendedTrack, requestId: string) {
    if (!track.releaseGroupMbid || !track.artistMbid || !track.artistName) {
      return;
    }
    retryDownload.mutate({
      requestId,
      payload: {
        releaseGroupMbid: track.releaseGroupMbid,
        artistMbid: track.artistMbid,
        artistName: track.artistName,
        albumTitle: track.albumTitle,
      },
    });
  }

  const isSearchActive = query.length > 0;
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

      <div className="max-w-lg mb-6">
        <Input
          placeholder="Search tracks, albums and artists…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {statusLine}

      {isSearchActive && data && (
        <div className="space-y-8">
          {/* ── Tracks ── */}
          {data.recordings.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Tracks
              </h2>
              <RecommendedTrackListHeader showActions={false} />
              {data.recordings.map((recording, i) => (
                <RecommendedTrackRow
                  key={recording.recordingMbid}
                  track={{
                    recordingMbid: recording.recordingMbid,
                    title: recording.title,
                    artistName: recording.artistName,
                    albumTitle: recording.releaseName ?? null,
                    coverArtUrl: recording.coverArtUrl,
                    durationMs: recording.durationMs,
                    inLibrary: recording.inLibrary ?? false,
                    releaseYear: recording.releaseYear,
                  }}
                  index={i}
                  isPlaying={playingMbid === recording.recordingMbid}
                  inLibrary={recording.inLibrary ?? false}
                  onPlay={(t) => {
                    if (!t.recordingMbid) return;
                    handlePreview(t.recordingMbid, t.artistName ?? "", t.title);
                  }}
                />
              ))}
            </section>
          )}

          {/* ── Albums ── */}
          {data.releases.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Albums
              </h2>
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
                    coverArtUrl={release.coverArtUrl}
                    href={`/albums/${release.releaseGroupMbid ?? release.releaseMbid}`}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Artists ── */}
          {data.artists.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Artists
              </h2>
              <div className="space-y-1">
                {data.artists.map((artist) => (
                  <Link
                    key={artist.artistMbid}
                    to="/artists/$artistKey"
                    params={{ artistKey: artist.artistMbid }}
                    className="block px-3 py-2 rounded-md hover:bg-accent/50 transition-colors"
                  >
                    <p className="text-sm font-medium">{artist.name}</p>
                    {artist.disambiguation && (
                      <p className="text-xs text-muted-foreground">
                        {artist.disambiguation}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {!isSearchActive && (
        <div className="mt-10 space-y-10">
          {/* Recommended playlists */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Recommended for you
            </h2>
            {recPlaylistsLoading || !recPlaylists ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : recPlaylists.status === "no-token" ? (
              <p className="text-sm text-muted-foreground">
                Connect your ListenBrainz account in Settings to get playlist
                recommendations.
              </p>
            ) : recPlaylists.status === "warming" ? (
              <p className="text-sm text-muted-foreground">
                Generating recommendations…
              </p>
            ) : recPlaylists.status === "error" && !recPlaylists.data ? (
              <p className="text-sm text-muted-foreground">
                Couldn't load recommendations. We'll retry shortly.
              </p>
            ) : (
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                }}
              >
                {(recPlaylists.data ?? []).map((playlist) => (
                  <RecommendationTile
                    key={playlist.id}
                    rec={{
                      id: playlist.id,
                      name: playlist.name,
                      description: playlist.description ?? "",
                      tag: "For you",
                      trackCount: playlist.trackCount,
                      gradient: generateAlbumGradient(
                        playlist.name,
                        "recommendation",
                      ),
                      accentColor: "oklch(0.72 0.18 280)",
                    }}
                    onClick={() =>
                      navigate({
                        to: "/explore/recommendations/$recId",
                        params: { recId: playlist.id },
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>
          {/* Tracks you'll like */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Tracks you'll like
            </h2>
            {recTracksLoading || !recTracks ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : recTracks.status === "no-token" ? (
              <p className="text-sm text-muted-foreground">
                Connect your ListenBrainz account in Settings to get track
                recommendations.
              </p>
            ) : recTracks.status === "warming" ? (
              <p className="text-sm text-muted-foreground">
                Generating recommendations…
              </p>
            ) : recTracks.status === "error" && !recTracks.data ? (
              <p className="text-sm text-muted-foreground">
                Couldn't load recommendations. We'll retry shortly.
              </p>
            ) : recTracks.status === "ready" && recTracks.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not enough listening history yet. Keep listening!
              </p>
            ) : (
              <>
                <RecommendedTrackListHeader />
                {(recTracks.data ?? [])
                  .filter((t) => !recDismissed.has(t.recordingMbid))
                  .map((track, i) => {
                    const download = track.releaseGroupMbid
                      ? byReleaseGroup.get(track.releaseGroupMbid)
                      : undefined;
                    const downloadStatus = download
                      ? toUiStatus(download.status)
                      : null;
                    const addDisabledReason =
                      !track.releaseGroupMbid ||
                      !track.artistMbid ||
                      !track.artistName
                        ? "Insufficient metadata"
                        : null;
                    return (
                      <RecommendedTrackRow
                        key={track.recordingMbid}
                        track={track}
                        index={i}
                        isPlaying={playingMbid === track.recordingMbid}
                        inLibrary={track.inLibrary}
                        downloadStatus={downloadStatus}
                        addDisabledReason={addDisabledReason}
                        onPlay={handleRecommendedTrackPlay}
                        onAddToLibrary={() => addTrackToLibrary(track)}
                        onRetry={
                          download ? () => retryTrack(track, download.id) : undefined
                        }
                        onDismiss={() =>
                          setRecDismissed((s) => new Set(s).add(track.recordingMbid))
                        }
                      />
                    );
                  })}
              </>
            )}
          </section>
        </div>
      )}

      <RequestDownloadDialog {...requestDialog.dialogProps} />
    </div>
  );
}
