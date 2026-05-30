import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import {
  type ArtistDiscographyItem,
  type UnifiedArtistDetail,
  UnifiedArtistDetailSchema,
} from "@staccato/shared";
import { AlbumCard } from "@/components/music/AlbumCard";
import { ArtistHeader } from "@/components/music/ArtistHeader";
import { ArtistDetailSkeleton } from "@/components/music/ArtistDetailSkeleton";

export const Route = createFileRoute("/artists/$artistKey")({
  component: ArtistDetailPage,
});

function BackLink({ source }: { source: "local" | "external" }) {
  const to = source === "external" ? "/explore" : "/library";
  const label = source === "external" ? "Explore" : "Library";
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft className="w-4 h-4" />
      {label}
    </Link>
  );
}

function discographyHref(item: ArtistDiscographyItem): string {
  return item.inLibrary
    ? `/albums/${item.id}`
    : `/albums/${item.releaseGroupMbid}`;
}

function discographyKey(item: ArtistDiscographyItem): string {
  return item.inLibrary ? item.id : item.releaseGroupMbid;
}

function Discography({ items }: { items: ArtistDiscographyItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No releases found.</p>;
  }
  return (
    <div
      className="grid gap-x-4 gap-y-6"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
    >
      {items.map((item) => (
        <div key={discographyKey(item)} className="relative">
          <AlbumCard
            title={item.title}
            artistName={null}
            releaseYear={item.releaseYear}
            coverArtUrl={item.coverArtUrl}
            href={discographyHref(item)}
          />
          {item.inLibrary && (
            <span className="absolute top-2 left-2 z-10 text-[0.625rem] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-black/55 text-white pointer-events-none">
              In library
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function ArtistDetailPage() {
  const { artistKey } = Route.useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["artist", artistKey],
    queryFn: async (): Promise<UnifiedArtistDetail> => {
      const res = await fetch(`/api/artists/${artistKey}`);
      if (!res.ok) throw new Error("Failed to fetch artist");
      return UnifiedArtistDetailSchema.parse(await res.json());
    },
    staleTime: 60_000,
  });

  if (isLoading) return <ArtistDetailSkeleton />;
  if (isError || !data) {
    return (
      <div className="p-6">
        <Link
          to="/library"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </Link>
        <p className="text-sm text-destructive mt-4">Failed to load artist.</p>
      </div>
    );
  }

  const name = data.artist.name;
  const imageUrl = data.artist.imageUrl;
  const subtitle =
    data.source === "external"
      ? (data.artist.disambiguation ?? undefined)
      : undefined;
  const albumCount = data.albums.length;

  return (
    <div>
      <ArtistHeader
        name={name}
        imageUrl={imageUrl}
        albumCount={subtitle ? null : albumCount}
        subtitle={subtitle}
        backLink={<BackLink source={data.source} />}
      />

      <div className="px-6 pt-6 pb-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Discography
        </h2>
        <Discography items={data.albums} />
      </div>

      {data.source === "local" && data.appearsOn.length > 0 && (
        <div className="px-6 pb-8">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Appears On
          </h2>
          <Discography items={data.appearsOn} />
        </div>
      )}
    </div>
  );
}
