import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import {
  type IdentifyApplyResponse,
  IdentifyApplyResponseSchema,
  type IdentifyOrphansResponse,
  IdentifyOrphansResponseSchema,
  type IdentifyOrphanTrack,
  type IdentifyReleaseCandidate,
  type IdentifyReleaseTracklist,
  IdentifyReleaseTracklistSchema,
  type IdentifySearchResponse,
  IdentifySearchResponseSchema,
} from "@staccato/shared";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PER_PAGE = 5;

interface CurrentTrack {
  title: string;
  trackNumber: number | null;
  discNumber: number | null;
  durationSeconds: number | null;
}

export interface IdentifyAlbumDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  albumKey: string;
  album: {
    id: string;
    title: string;
    artistName: string;
    releaseMbid: string | null;
    releaseGroupMbid: string | null;
  };
  currentTracks: CurrentTrack[];
}

// ─── Helpers ────────────────────────────────────────────────
function fmtTime(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
function formatReleaseDate(d: string | null): string {
  if (!d) return "—";
  const [year, month, day] = d.split("-");
  if (!year) return "—";
  if (!month) return year;
  const monthName = MONTHS[Number(month) - 1] ?? "";
  if (!day) return `${monthName} ${year}`.trim();
  return `${monthName} ${Number(day)}, ${year}`;
}

type PairState =
  | "match"
  | "dur-drift"
  | "title-drift"
  | "both-drift"
  | "extra"
  | "missing";

interface CmpTrack {
  disc: number;
  n: number;
  title: string;
  dur: number | null;
}
interface CmpRow {
  key: string;
  cur: CmpTrack | null;
  cand: CmpTrack | null;
  state: PairState;
}

// Pair candidate vs current tracks by (disc, track) number.
function pairTracks(current: CmpTrack[], candidate: CmpTrack[]): CmpRow[] {
  const keyOf = (t: CmpTrack) => `${t.disc}:${t.n}`;
  const cMap = new Map(current.map((t) => [keyOf(t), t]));
  const dMap = new Map(candidate.map((t) => [keyOf(t), t]));
  const meta = new Map<string, { disc: number; n: number }>();
  for (const t of [...current, ...candidate]) {
    meta.set(keyOf(t), { disc: t.disc, n: t.n });
  }
  const keys = [...meta.entries()].sort(
    (a, b) => a[1].disc - b[1].disc || a[1].n - b[1].n,
  );
  return keys.map(([k]) => {
    const cur = cMap.get(k) ?? null;
    const cand = dMap.get(k) ?? null;
    let state: PairState = "match";
    if (!cur && cand) state = "extra";
    else if (cur && !cand) state = "missing";
    else if (cur && cand) {
      const titleSame = cur.title === cand.title;
      const durDrift =
        cur.dur != null && cand.dur != null && Math.abs(cur.dur - cand.dur) > 2;
      if (!titleSame && durDrift) state = "both-drift";
      else if (!titleSame) state = "title-drift";
      else if (durDrift) state = "dur-drift";
    }
    return { key: k, cur, cand, state };
  });
}

function pairStats(rows: CmpRow[]) {
  let match = 0,
    drift = 0,
    extra = 0,
    missing = 0;
  for (const r of rows) {
    if (r.state === "match") match++;
    else if (r.state === "extra") extra++;
    else if (r.state === "missing") missing++;
    else drift++;
  }
  return { match, drift, extra, missing, total: rows.length };
}

const STATE_DOT: Record<PairState, string> = {
  match: "bg-emerald-500",
  "dur-drift": "bg-amber-500",
  "title-drift": "bg-amber-500",
  "both-drift": "bg-amber-500",
  extra: "bg-orange-400",
  missing: "bg-destructive",
};
const STATE_LABEL: Record<PairState, string> = {
  match: "Match",
  "dur-drift": "Duration differs",
  "title-drift": "Title differs",
  "both-drift": "Title & duration differ",
  extra: "Bonus track",
  missing: "Missing",
};

const Dot = () => <span className="text-border">·</span>;

// ─── Search bar ─────────────────────────────────────────────
function SearchBar({
  release,
  setRelease,
  artist,
  setArtist,
  year,
  setYear,
  onSearch,
  loading,
}: {
  release: string;
  setRelease: (v: string) => void;
  artist: string;
  setArtist: (v: string) => void;
  year: string;
  setYear: (v: string) => void;
  onSearch: () => void;
  loading: boolean;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSearch();
  };
  const label =
    "text-[0.66rem] font-semibold tracking-widest uppercase text-muted-foreground mb-1.5 block";

  return (
    <div className="px-5 py-4 border-b border-border">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2.5 items-end">
        <div>
          <span className={label}>Release</span>
          <Input
            value={release}
            placeholder="Album title"
            onChange={(e) => setRelease(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <div>
          <span className={label}>Artist</span>
          <Input
            value={artist}
            placeholder="Artist name"
            onChange={(e) => setArtist(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <Button onClick={onSearch} disabled={loading} className="gap-2">
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
          {loading ? "Searching…" : "Search"}
        </Button>
      </div>

      <div className="flex items-center gap-2.5 mt-2.5">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <SlidersHorizontal className="w-3 h-3" />
          {showFilters ? "Hide filters" : "Filters"}
        </button>
        <Dot />
        <span className="text-xs text-muted-foreground/70">
          Searches musicbrainz.org
        </span>
      </div>

      {showFilters && (
        <div className="mt-3 max-w-[12rem]">
          <span className={label}>Year</span>
          <Input
            value={year}
            placeholder="e.g. 1977"
            inputMode="numeric"
            onChange={(e) => setYear(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
      )}
    </div>
  );
}

// ─── Result row ─────────────────────────────────────────────
function ResultRow({
  release,
  current,
  onClick,
}: {
  release: IdentifyReleaseCandidate;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg px-3.5 py-2.5 transition-colors hover:bg-accent/60 border",
        current ? "border-primary/40" : "border-transparent",
      )}
    >
      <div className="flex items-baseline gap-2.5 min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {release.title}
          {release.disambiguation && (
            <span className="text-muted-foreground font-normal">
              {" "}
              ({release.disambiguation})
            </span>
          )}
        </span>
        <span className="text-sm text-muted-foreground shrink-0">
          · {release.artistName}
        </span>
        {current && (
          <span className="ml-auto shrink-0 text-[0.62rem] font-semibold tracking-wider uppercase text-primary bg-primary/10 ring-1 ring-primary/30 px-1.5 py-0.5 rounded-full">
            Current
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground flex-wrap">
        {release.formatDetail && (
          <span className="inline-flex items-center gap-1.5">
            <Disc3 className="w-3 h-3 opacity-70" />
            {release.formatDetail}
          </span>
        )}
        {release.trackCount != null && (
          <>
            <Dot />
            <span className="tabular-nums">{release.trackCount} tracks</span>
          </>
        )}
        {release.country && (
          <>
            <Dot />
            <span className="tabular-nums tracking-wide">
              {release.country}
            </span>
          </>
        )}
        <Dot />
        <span className="tabular-nums">{formatReleaseDate(release.date)}</span>
        {release.label && (
          <>
            <Dot />
            <span className="truncate max-w-[14rem]">{release.label}</span>
          </>
        )}
      </div>
    </button>
  );
}

// ─── Comparison view ────────────────────────────────────────
function ComparisonCell({
  track,
  side,
  state,
}: {
  track: CmpTrack | null;
  side: "left" | "right";
  state: PairState;
}) {
  if (!track) {
    return (
      <div className="flex items-center justify-center min-h-[30px] rounded-md border border-dashed border-border/60 bg-foreground/[0.02] px-2.5 py-2 text-xs italic text-muted-foreground/70">
        {side === "left" ? "not on candidate" : "not on current"}
      </div>
    );
  }
  const isProblem = state !== "match";
  const titleAmber =
    (state === "title-drift" || state === "both-drift") && side === "right";
  const durAmber =
    (state === "dur-drift" || state === "both-drift") && side === "right";
  const bg =
    isProblem &&
    side === "right" &&
    (state === "dur-drift" || state === "title-drift" || state === "both-drift")
      ? "bg-amber-500/10"
      : state === "extra" && side === "right"
        ? "bg-orange-400/10"
        : state === "missing" && side === "left"
          ? "bg-destructive/10"
          : "";
  return (
    <div
      className={cn(
        "grid grid-cols-[22px_1fr_auto] gap-2.5 items-center min-h-[30px] rounded-md px-2.5 py-1.5",
        bg,
      )}
    >
      <span className="text-xs text-muted-foreground tabular-nums text-right">
        {track.n}
      </span>
      <span
        className={cn(
          "text-sm truncate",
          titleAmber ? "text-amber-400" : "text-foreground",
        )}
      >
        {track.title}
      </span>
      <span
        className={cn(
          "text-xs tabular-nums",
          durAmber ? "text-amber-400" : "text-muted-foreground",
        )}
      >
        {fmtTime(track.dur)}
      </span>
    </div>
  );
}

// Left-column cell offering to pull a stranded orphan track (from a different
// album row, same folder on disk) into the slot a candidate track is missing.
function AdoptCell({
  orphan,
  checked,
  onToggle,
}: {
  orphan: IdentifyOrphanTrack;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "grid grid-cols-[16px_1fr] gap-2.5 items-center text-left min-h-[30px] rounded-md border px-2.5 py-1.5 transition-colors",
        checked
          ? "border-primary/50 bg-primary/10"
          : "border-dashed border-border/60 bg-foreground/[0.02] hover:bg-accent/40",
      )}
    >
      <span
        className={cn(
          "w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0",
          checked ? "bg-primary border-primary" : "border-muted-foreground/40",
        )}
      >
        {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs truncate text-foreground">
          {orphan.title}
        </span>
        <span className="block text-[0.66rem] truncate text-muted-foreground">
          pull from {orphan.sourceAlbumTitle ?? "another album"}
        </span>
      </span>
    </button>
  );
}

function ComparisonView({
  rows,
  orphanByKey,
  adoptedIds,
  onToggleAdopt,
}: {
  rows: CmpRow[];
  orphanByKey: Map<string, IdentifyOrphanTrack>;
  adoptedIds: Set<string>;
  onToggleAdopt: (id: string) => void;
}) {
  const colClass =
    "min-w-0 rounded-xl border border-border bg-muted/30 px-3.5 py-3.5";
  const headClass =
    "text-[0.66rem] font-semibold tracking-widest uppercase text-muted-foreground pb-2.5 flex items-baseline gap-2";
  return (
    <div className="grid grid-cols-[1fr_28px_1fr] gap-0 px-5 pb-5">
      <div className={colClass}>
        <div className={headClass}>
          Current (in library)
          <span className="text-muted-foreground/60 tabular-nums">
            {rows.filter((r) => r.cur).length} tracks
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          {rows.map((r) => {
            const orphan =
              r.state === "extra" ? orphanByKey.get(r.key) : undefined;
            if (orphan) {
              return (
                <AdoptCell
                  key={`l-${r.key}`}
                  orphan={orphan}
                  checked={adoptedIds.has(orphan.id)}
                  onToggle={() => onToggleAdopt(orphan.id)}
                />
              );
            }
            return (
              <ComparisonCell
                key={`l-${r.key}`}
                track={r.cur}
                side="left"
                state={r.state}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-col items-center pt-9 gap-0.5">
        {rows.map((r) => (
          <div
            key={`c-${r.key}`}
            title={STATE_LABEL[r.state]}
            className="flex items-center justify-center min-h-[30px]"
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                STATE_DOT[r.state],
                r.state !== "match" && "ring-3 ring-current/20",
              )}
            />
          </div>
        ))}
      </div>

      <div className={colClass}>
        <div className={headClass}>
          Candidate (from MusicBrainz)
          <span className="text-muted-foreground/60 tabular-nums">
            {rows.filter((r) => r.cand).length} tracks
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          {rows.map((r) => (
            <ComparisonCell
              key={`r-${r.key}`}
              track={r.cand}
              side="right"
              state={r.state}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatPill({ dotClass, label }: { dotClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={cn("w-1.5 h-1.5 rounded-full", dotClass)} />
      {label}
    </span>
  );
}

// ─── Main dialog ────────────────────────────────────────────
export function IdentifyAlbumDialog({
  open,
  onOpenChange,
  albumKey,
  album,
  currentTracks,
}: IdentifyAlbumDialogProps) {
  const queryClient = useQueryClient();

  const [release, setRelease] = useState(album.title);
  const [artist, setArtist] = useState(album.artistName);
  const [year, setYear] = useState("");
  const [query, setQuery] = useState({
    release: album.title,
    artist: album.artistName,
    year: "",
  });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<IdentifyReleaseCandidate | null>(
    null,
  );
  const [adoptedIds, setAdoptedIds] = useState<Set<string>>(new Set());

  // Reset to a clean search state whenever the dialog (re)opens.
  useEffect(() => {
    if (!open) return;
    setRelease(album.title);
    setArtist(album.artistName);
    setYear("");
    setQuery({ release: album.title, artist: album.artistName, year: "" });
    setPage(0);
    setSelected(null);
  }, [open, album.title, album.artistName]);

  // Orphan adoption is keyed to the chosen release's missing slots — clear the
  // selection whenever the chosen release changes (including back to none).
  useEffect(() => {
    setAdoptedIds(new Set());
  }, [selected?.releaseMbid]);

  const toggleAdopt = (id: string) => {
    setAdoptedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const searchEnabled =
    open && (query.release.trim() !== "" || query.artist.trim() !== "");

  const searchQuery = useQuery({
    queryKey: ["identify-search", query],
    enabled: searchEnabled,
    staleTime: 60_000,
    queryFn: async (): Promise<IdentifySearchResponse> => {
      const params = new URLSearchParams({
        release: query.release,
        artist: query.artist,
      });
      if (query.year.trim()) params.set("year", query.year.trim());
      const res = await fetch(`/api/albums/identify/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      return IdentifySearchResponseSchema.parse(await res.json());
    },
  });

  const results = searchQuery.data?.results ?? [];
  const totalPages = Math.max(1, Math.ceil(results.length / PER_PAGE));
  const pageResults = results.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const tracklistQuery = useQuery({
    queryKey: ["identify-release", selected?.releaseMbid],
    enabled: !!selected,
    staleTime: 60_000,
    queryFn: async (): Promise<IdentifyReleaseTracklist> => {
      const res = await fetch(
        `/api/albums/identify/release/${selected!.releaseMbid}`,
      );
      if (!res.ok) throw new Error("Failed to load tracklist");
      return IdentifyReleaseTracklistSchema.parse(await res.json());
    },
  });

  // Tracks stranded in a different album row but sharing this album's folder —
  // candidates to pull in when a mistagged file fractured the folder.
  const orphansQuery = useQuery({
    queryKey: ["identify-orphans", album.id],
    enabled: open,
    staleTime: 60_000,
    queryFn: async (): Promise<IdentifyOrphansResponse> => {
      const res = await fetch(`/api/albums/${album.id}/identify/orphans`);
      if (!res.ok) throw new Error("Failed to load orphans");
      return IdentifyOrphansResponseSchema.parse(await res.json());
    },
  });

  const orphanByKey = useMemo(() => {
    const m = new Map<string, IdentifyOrphanTrack>();
    for (const o of orphansQuery.data?.orphans ?? []) {
      m.set(`${o.discNumber ?? 1}:${o.trackNumber ?? 0}`, o);
    }
    return m;
  }, [orphansQuery.data]);

  const applyMutation = useMutation({
    mutationFn: async (
      rel: IdentifyReleaseCandidate,
    ): Promise<IdentifyApplyResponse> => {
      const res = await fetch(`/api/albums/${album.id}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releaseMbid: rel.releaseMbid,
          releaseGroupMbid: rel.releaseGroupMbid,
          adoptTrackIds: [...adoptedIds],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Identify failed (${res.status})`);
      }
      return IdentifyApplyResponseSchema.parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["album", albumKey] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["artists"] });
      queryClient.invalidateQueries({
        queryKey: ["identify-orphans", album.id],
      });
      toast.success(`Album re-identified as "${data.title}"`, {
        description: `${data.remapped} of ${data.total} tracks updated${
          data.adopted > 0 ? `, ${data.adopted} pulled in` : ""
        }.`,
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const doSearch = () => {
    setSelected(null);
    setPage(0);
    setQuery({ release, artist, year });
  };

  const isCurrent = (r: IdentifyReleaseCandidate) =>
    album.releaseMbid
      ? r.releaseMbid === album.releaseMbid
      : !!album.releaseGroupMbid &&
        r.releaseGroupMbid === album.releaseGroupMbid;

  const currentCmp: CmpTrack[] = useMemo(
    () =>
      currentTracks.map((t) => ({
        disc: t.discNumber ?? 1,
        n: t.trackNumber ?? 0,
        title: t.title,
        dur: t.durationSeconds,
      })),
    [currentTracks],
  );

  const candidateCmp: CmpTrack[] = useMemo(
    () =>
      (tracklistQuery.data?.tracks ?? []).map((t) => ({
        disc: t.disc,
        n: t.track,
        title: t.title,
        dur: t.durationSeconds,
      })),
    [tracklistQuery.data],
  );

  const rows = useMemo(
    () => pairTracks(currentCmp, candidateCmp),
    [currentCmp, candidateCmp],
  );
  const stats = pairStats(rows);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (applyMutation.isPending && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-4xl p-0 gap-0 block overflow-hidden">
        <div className="flex flex-col max-h-[calc(100vh-7rem)]">
          {!selected ? (
            <>
              <div className="px-5 pt-4 pb-3.5 border-b border-border">
                <h2 className="text-base font-medium text-foreground font-heading">
                  Identify album
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Find the matching release on MusicBrainz to fix this album's
                  metadata.
                </p>
              </div>
              <SearchBar
                release={release}
                setRelease={setRelease}
                artist={artist}
                setArtist={setArtist}
                year={year}
                setYear={setYear}
                onSearch={doSearch}
                loading={searchQuery.isFetching}
              />
              <div className="flex-1 overflow-y-auto px-3 py-2 min-h-[14rem]">
                {searchQuery.isFetching ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Searching MusicBrainz…
                  </div>
                ) : searchQuery.isError ? (
                  <div className="flex flex-col items-center justify-center gap-1 py-14">
                    <div className="text-sm text-destructive">
                      Search failed.
                    </div>
                    <div className="text-xs text-muted-foreground">
                      MusicBrainz may be unavailable. Try again.
                    </div>
                  </div>
                ) : results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-14">
                    <Search className="w-5 h-5 text-muted-foreground/50" />
                    <div className="text-sm text-foreground">No matches.</div>
                    <div className="text-xs text-muted-foreground">
                      Try adjusting the release title or artist.
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {pageResults.map((r) => (
                      <ResultRow
                        key={r.releaseMbid}
                        release={r}
                        current={isCurrent(r)}
                        onClick={() => setSelected(r)}
                      />
                    ))}
                  </div>
                )}
              </div>
              {results.length > 0 && (
                <div className="flex items-center justify-between px-5 py-2.5 border-t border-border">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {page * PER_PAGE + 1}–
                    {Math.min((page + 1) * PER_PAGE, results.length)} of{" "}
                    {results.length} releases
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      className="gap-1"
                    >
                      <ChevronLeft className="w-3 h-3" /> Prev
                    </Button>
                    <span className="text-xs text-muted-foreground px-1.5 tabular-nums">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages - 1, p + 1))
                      }
                      className="gap-1"
                    >
                      Next <ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 px-5 pt-4 pb-3.5 border-b border-border">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setSelected(null)}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {selected.title}
                    {selected.disambiguation && (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        ({selected.disambiguation})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {selected.artistName}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap px-5 py-3 border-b border-border text-xs text-muted-foreground">
                {selected.formatDetail && (
                  <span className="inline-flex items-center gap-1.5">
                    <Disc3 className="w-3 h-3 opacity-80" />
                    {selected.formatDetail}
                  </span>
                )}
                {selected.trackCount != null && (
                  <>
                    <Dot />
                    <span>{selected.trackCount} tracks</span>
                  </>
                )}
                {selected.country && (
                  <>
                    <Dot />
                    <span>{selected.country}</span>
                  </>
                )}
                <Dot />
                <span>{formatReleaseDate(selected.date)}</span>
                {selected.label && (
                  <>
                    <Dot />
                    <span>{selected.label}</span>
                  </>
                )}
                <span className="ml-auto font-mono text-[0.7rem] text-muted-foreground/60">
                  {selected.releaseMbid}
                </span>
                {!tracklistQuery.isLoading && rows.length > 0 && (
                  <div className="basis-full flex gap-3.5 mt-1 text-xs">
                    <StatPill
                      dotClass={STATE_DOT.match}
                      label={`${stats.match} match`}
                    />
                    {stats.drift > 0 && (
                      <StatPill
                        dotClass={STATE_DOT["dur-drift"]}
                        label={`${stats.drift} drifted`}
                      />
                    )}
                    {stats.extra > 0 && (
                      <StatPill
                        dotClass={STATE_DOT.extra}
                        label={`${stats.extra} bonus`}
                      />
                    )}
                    {stats.missing > 0 && (
                      <StatPill
                        dotClass={STATE_DOT.missing}
                        label={`${stats.missing} missing`}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto pt-1">
                {tracklistQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Loading tracklist…
                  </div>
                ) : (
                  <ComparisonView
                    rows={rows}
                    orphanByKey={orphanByKey}
                    adoptedIds={adoptedIds}
                    onToggleAdopt={toggleAdopt}
                  />
                )}
              </div>

              <div className="flex items-center justify-between gap-2.5 px-5 py-3 border-t border-border bg-muted/40">
                <div className="text-xs text-muted-foreground">
                  {adoptedIds.size > 0
                    ? `Pulling in ${adoptedIds.size} orphaned track${adoptedIds.size > 1 ? "s" : ""} from this folder.`
                    : stats.drift + stats.missing > 0
                      ? "Some tracks don't match — verify before applying."
                      : stats.extra > 0
                        ? `Candidate includes ${stats.extra} bonus track${stats.extra > 1 ? "s" : ""}.`
                        : "Tracks match. Safe to apply."}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSelected(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => applyMutation.mutate(selected)}
                    disabled={applyMutation.isPending}
                    className="gap-2"
                  >
                    {applyMutation.isPending && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    Use this release
                    {!applyMutation.isPending && (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
