import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExternalAlbumDetail } from "@staccato/shared";
import { AlbumHeader } from "@/components/music/AlbumHeader";
import { AlbumDetailSkeleton } from "@/components/music/AlbumDetailSkeleton";
import { TrackList } from "@/components/music/TrackList";

export const Route = createFileRoute("/explore/albums/$rgMbid")({
  component: ExternalAlbumPage,
});

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function BackLink() {
  return (
    <Link
      to="/explore"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft className="w-4 h-4" />
      Explore
    </Link>
  );
}

function ExternalAlbumPage() {
  const { rgMbid } = Route.useParams();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingMbid, setPlayingMbid] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setPlayingMbid(null);
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, []);

  function handlePreview(
    recordingMbid: string,
    artistName: string,
    title: string,
  ) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingMbid === recordingMbid) {
      audio.pause();
      setPlayingMbid(null);
      return;
    }
    window.dispatchEvent(new Event("staccato:preview-start"));
    audio.src = `/api/preview/${recordingMbid}/stream?${new URLSearchParams({ artistName, trackTitle: title })}`;
    audio.play().catch(() => {});
    setPlayingMbid(recordingMbid);
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ["external-album", rgMbid],
    queryFn: async (): Promise<ExternalAlbumDetail> => {
      const res = await fetch(`/api/search/external/albums/${rgMbid}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    staleTime: 300_000,
  });

  if (isLoading) return <AlbumDetailSkeleton />;

  if (isError || !data) {
    return (
      <div className="p-6">
        <BackLink />
        <p className="text-sm text-destructive mt-4">Failed to load album.</p>
      </div>
    );
  }

  const coverArtUrl = `https://coverartarchive.org/release-group/${data.releaseGroupMbid}/front`;
  const totalSeconds = data.tracks.reduce(
    (sum, t) => sum + Math.round((t.durationMs ?? 0) / 1000),
    0,
  );
  const discCount = new Set(data.tracks.map((t) => t.discPosition)).size;

  return (
    <div>
      <AlbumHeader
        title={data.title}
        artistName={data.artistName}
        releaseYear={data.releaseYear}
        coverArtUrl={coverArtUrl}
        trackCount={data.tracks.length}
        totalSeconds={totalSeconds}
        backLink={<BackLink />}
      >
        <Button variant="outline" disabled>
          Add to library
        </Button>
      </AlbumHeader>

      <div className="px-6 pb-8">
        <TrackList
          tracks={data.tracks.map((t) => ({
            key: t.recordingMbid,
            num:
              discCount > 1
                ? `${t.discPosition}-${t.trackPosition}`
                : String(t.trackPosition),
            title: t.title,
            formattedDuration: formatDuration(t.durationMs),
          }))}
          onPreviewTrack={(index) => {
            const t = data.tracks[index];
            if (!t) return;
            handlePreview(t.recordingMbid, data.artistName, t.title);
          }}
          isPreviewPlaying={(index) => {
            const t = data.tracks[index];
            return t ? t.recordingMbid === playingMbid : false;
          }}
        />
      </div>
      <audio ref={audioRef} />
    </div>
  );
}
