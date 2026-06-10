import PQueue from "p-queue";
import { z } from "zod";
import { APP_USER_AGENT } from "../constants.js";
import { serverConfig } from "../config/server-config.js";
import { getEnvironment } from "../environment/environment.js";
import { createRateLimitGate, parseRetryAfterMs } from "../lib/rate-limit.js";
import { logger } from "../logger.js";
import type {
  LastfmEntityRef,
  LastfmEntityType,
  LastfmPopularity,
  LastfmTag,
} from "./types.js";

const log = logger.child({ module: "lastfm" });

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

const env = getEnvironment();

// Last.fm publishes no hard limit, only a "reasonable usage" cap; ~5 req/s per
// API key is the community ceiling. One shared queue governs all calls with no
// bursting by default, tunable via STACCATO_SERVER_LASTFM_* env knobs. Mirrors
// the MusicBrainz client's p-queue pattern (apps/server/src/musicbrainz/client.ts).
const lfmQueue = new PQueue({
  concurrency: env.STACCATO_SERVER_LASTFM_CONCURRENCY,
  intervalCap: env.STACCATO_SERVER_LASTFM_INTERVAL_CAP,
  interval: env.STACCATO_SERVER_LASTFM_RATE_LIMIT_MS,
  carryoverConcurrencyCount: true,
});

// Cooperative backoff on top of the steady-state queue: when Last.fm pushes
// back (429 / error 29) this pauses all calls, growing the cooldown
// exponentially per consecutive hit.
const rateLimit = createRateLimitGate();

function apiKey(): string | null {
  return serverConfig.get().lastfm.apiKey;
}

// Last.fm auth params that must never reach logs. Read methods never set these
// (the api_key is added to the URL separately, not via `params`), but future
// signed/write calls — scrobbling's per-user session key `sk` and the `api_sig`
// signature — would, so redact defensively before logging any param bag.
const SENSITIVE_PARAM_KEYS = new Set(["api_key", "sk", "api_sig", "token"]);
function safeParams(params: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (!SENSITIVE_PARAM_KEYS.has(k)) out[k] = v;
  }
  return out;
}

/** Low-level GET against the Last.fm 2.0 API. Returns parsed JSON or null.
 * Never throws. Logs failures object-first with the method for context. */
async function lfmGet(
  method: string,
  params: Record<string, string>,
): Promise<unknown | null> {
  const key = apiKey();
  if (!key) {
    log.debug({ method }, "lastfm call skipped: no api key configured");
    return null;
  }
  const search = new URLSearchParams({
    method,
    api_key: key,
    format: "json",
    ...params,
  });
  const url = `${LASTFM_BASE}?${search.toString()}`;
  try {
    const res = await lfmQueue.add(async () => {
      const waitMs = rateLimit.waitMs();
      if (waitMs > 0) {
        log.debug({ method, waitMs }, "lastfm waiting out rate-limit backoff");
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      log.debug({ method }, "making lastfm request");
      return fetch(url, {
        headers: {
          "User-Agent": APP_USER_AGENT,
          Accept: "application/json",
        },
      });
    });
    if (!res) throw new Error("lastfm queue returned no response");
    // HTTP 429 is the documented rate-limit signal; honour Retry-After if set.
    if (res.status === 429) {
      const backoffMs = rateLimit.noteLimited({
        retryAfterMs: parseRetryAfterMs(res.headers.get("retry-after")),
      });
      log.warn(
        { status: 429, operation: method, backoffMs },
        "lastfm rate limited (429); backing off",
      );
      return null;
    }
    if (!res.ok) {
      log.warn(
        { status: res.status, operation: method, params: safeParams(params) },
        "lastfm non-ok response",
      );
      return null;
    }
    const body = (await res.json()) as { error?: number; message?: string };
    if (body && typeof body === "object" && "error" in body && body.error) {
      // Last.fm returns HTTP 200 with an {error, message} envelope on app errors.
      // Error 29 = "Rate Limit Exceeded" — back off rather than keep calling.
      if (body.error === 29) {
        const backoffMs = rateLimit.noteLimited();
        log.warn(
          { operation: method, lastfmError: 29, backoffMs },
          "lastfm rate limited (code 29); backing off",
        );
        return null;
      }
      log.warn(
        { operation: method, lastfmError: body.error, message: body.message },
        "lastfm api error envelope",
      );
      return null;
    }
    rateLimit.noteSuccess();
    return body;
  } catch (err) {
    log.warn({ err, operation: method }, "lastfm request failed");
    return null;
  }
}

// --- Defensive parsing of Last.fm's loosely-typed JSON ---------------------
// Last.fm wraps single results in objects and arrays inconsistently; coerce.
const TagSchema = z.object({
  name: z.string(),
  count: z.coerce.number().optional(),
});
const TopTagsSchema = z.object({
  toptags: z.object({ tag: z.array(TagSchema).optional() }).optional(),
});
const SimilarTagsSchema = z.object({
  similartags: z
    .object({ tag: z.array(z.object({ name: z.string() })).optional() })
    .optional(),
});
const SimilarArtistsSchema = z.object({
  similarartists: z
    .object({ artist: z.array(z.object({ name: z.string() })).optional() })
    .optional(),
});
const TagTopTracksSchema = z.object({
  tracks: z
    .object({
      track: z
        .array(
          z.object({
            name: z.string(),
            mbid: z.string().optional(),
            artist: z.object({ name: z.string() }).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
const ArtistTopTracksSchema = z.object({
  toptracks: z
    .object({
      track: z
        .array(
          z.object({
            name: z.string(),
            mbid: z.string().optional(),
            artist: z.object({ name: z.string() }).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const SimilarTracksSchema = z.object({
  similartracks: z
    .object({
      track: z
        .array(
          z.object({
            name: z.string(),
            mbid: z.string().optional(),
            match: z.coerce.number().optional(),
            artist: z.object({ name: z.string() }).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

function methodFor(
  entityType: LastfmEntityType,
  verb: "gettoptags" | "getinfo",
): string {
  return `${entityType}.${verb}`;
}

/** Build the name/mbid params for a given entity level. MBID wins; otherwise
 * artist (+ track/album) names are the fallback (spec §7 MBID coverage risk). */
function refParams(
  entityType: LastfmEntityType,
  ref: LastfmEntityRef,
): Record<string, string> | null {
  if (ref.mbid) return { mbid: ref.mbid };
  if (!ref.artist) return null;
  const params: Record<string, string> = { artist: ref.artist };
  if (entityType === "track") {
    if (!ref.title) return null;
    params.track = ref.title;
  } else if (entityType === "album") {
    if (!ref.album) return null;
    params.album = ref.album;
  }
  return params;
}

/** Weighted top tags for a track/album/artist. Empty array on any failure. */
export async function getTopTags(
  entityType: LastfmEntityType,
  ref: LastfmEntityRef,
): Promise<LastfmTag[]> {
  const params = refParams(entityType, ref);
  if (!params) return [];
  const body = await lfmGet(methodFor(entityType, "gettoptags"), params);
  if (!body) return [];
  const parsed = TopTagsSchema.safeParse(body);
  if (!parsed.success) {
    log.warn(
      { operation: methodFor(entityType, "gettoptags"), err: parsed.error },
      "lastfm getTopTags parse failed",
    );
    return [];
  }
  return (parsed.data.toptags?.tag ?? []).map((t) => ({
    name: t.name,
    weight: t.count ?? 0,
  }));
}

/** listeners/playcount for a track or artist. null on failure. */
export async function getPopularity(
  entityType: "track" | "artist",
  ref: LastfmEntityRef,
): Promise<LastfmPopularity | null> {
  const params = refParams(entityType, ref);
  if (!params) return null;
  const body = await lfmGet(methodFor(entityType, "getinfo"), params);
  if (!body) return null;
  const root =
    entityType === "track"
      ? (body as { track?: { listeners?: unknown; playcount?: unknown } }).track
      : (
          body as {
            artist?: { stats?: { listeners?: unknown; playcount?: unknown } };
          }
        ).artist?.stats;
  const listeners = Number(root?.listeners ?? NaN);
  const playcount = Number(root?.playcount ?? NaN);
  if (Number.isNaN(listeners) || Number.isNaN(playcount)) return null;
  return { listeners, playcount };
}

/** Adjacent genre tags via tag.getSimilar. Empty on failure. */
export async function getSimilarTags(tag: string): Promise<string[]> {
  const body = await lfmGet("tag.getsimilar", { tag });
  if (!body) return [];
  const parsed = SimilarTagsSchema.safeParse(body);
  if (!parsed.success) {
    log.warn(
      { operation: "tag.getsimilar", err: parsed.error },
      "lastfm getSimilarTags parse failed",
    );
    return [];
  }
  return (parsed.data.similartags?.tag ?? []).map((t) => t.name);
}

/** Popularity-ranked top tracks for a tag (tag.getTopTracks). The response is
 * already ranked by Last.fm, so the returned order IS the popularity ranking —
 * callers derive `popularityRank` from the index, no getPopularity calls needed
 * (recs spec §7.1/7.2). `mbid` is the recording MBID, null when Last.fm omits or
 * blanks it. Entries without an artist name are dropped (unresolvable). Empty
 * array on any failure. */
export async function getTopTracksForTag(
  tag: string,
  limit = 100,
): Promise<Array<{ name: string; artist: string; mbid: string | null }>> {
  const body = await lfmGet("tag.gettoptracks", { tag, limit: String(limit) });
  if (!body) return [];
  const parsed = TagTopTracksSchema.safeParse(body);
  if (!parsed.success) {
    log.warn(
      { operation: "tag.gettoptracks", err: parsed.error },
      "lastfm getTopTracksForTag parse failed",
    );
    return [];
  }
  return (parsed.data.tracks?.track ?? [])
    .map((t) => ({
      name: t.name,
      artist: t.artist?.name ?? "",
      mbid: t.mbid && t.mbid.length > 0 ? t.mbid : null,
    }))
    .filter((t) => t.artist.length > 0);
}

/** Popularity-ranked top tracks for an artist (artist.getTopTracks). Like
 * getTopTracksForTag, the response is already ranked, so the returned order IS
 * the popularity ranking — callers derive `popularityRank` from the index. The
 * artist is addressed by MBID when present, else by name (refParams), mirroring
 * getTopTags. `mbid` is the recording MBID, null when Last.fm omits/blanks it.
 * Entries without an artist name are dropped. Empty array on any failure. */
export async function getTopTracksForArtist(
  ref: LastfmEntityRef,
  limit = 100,
): Promise<Array<{ name: string; artist: string; mbid: string | null }>> {
  const params = refParams("artist", ref);
  if (!params) return [];
  const body = await lfmGet("artist.gettoptracks", {
    ...params,
    limit: String(limit),
  });
  if (!body) return [];
  const parsed = ArtistTopTracksSchema.safeParse(body);
  if (!parsed.success) {
    log.warn(
      { operation: "artist.gettoptracks", err: parsed.error },
      "lastfm getTopTracksForArtist parse failed",
    );
    return [];
  }
  return (parsed.data.toptracks?.track ?? [])
    .map((t) => ({
      name: t.name,
      artist: t.artist?.name ?? "",
      mbid: t.mbid && t.mbid.length > 0 ? t.mbid : null,
    }))
    .filter((t) => t.artist.length > 0);
}

/** Adjacent artists via artist.getSimilar. Empty on failure. */
export async function getSimilarArtists(artist: string): Promise<string[]> {
  const body = await lfmGet("artist.getsimilar", { artist });
  if (!body) return [];
  const parsed = SimilarArtistsSchema.safeParse(body);
  if (!parsed.success) {
    log.warn(
      { operation: "artist.getsimilar", err: parsed.error },
      "lastfm getSimilarArtists parse failed",
    );
    return [];
  }
  return (parsed.data.similarartists?.artist ?? []).map((a) => a.name);
}

/** Tracks similar to a given track via track.getSimilar — Last.fm's co-listening
 * signal, the seed for playlist track-suggestions (SP3). Addresses the track by
 * MBID when present, else artist+title (refParams). Response is ordered by
 * descending `match`; order preserved. `matchScore` is Last.fm's 0..1 similarity.
 * Entries without an artist name are dropped (unresolvable). Empty array on any
 * failure or missing api key (no fetch). */
export async function getSimilarTracks(
  ref: LastfmEntityRef,
  limit = 100,
): Promise<
  Array<{
    name: string;
    artist: string;
    mbid: string | null;
    matchScore: number;
  }>
> {
  const params = refParams("track", ref);
  if (!params) return [];
  const body = await lfmGet("track.getsimilar", {
    ...params,
    limit: String(limit),
  });
  if (!body) return [];
  const parsed = SimilarTracksSchema.safeParse(body);
  if (!parsed.success) {
    log.warn(
      { operation: "track.getsimilar", err: parsed.error },
      "lastfm getSimilarTracks parse failed",
    );
    return [];
  }
  return (parsed.data.similartracks?.track ?? [])
    .map((t) => ({
      name: t.name,
      artist: t.artist?.name ?? "",
      mbid: t.mbid && t.mbid.length > 0 ? t.mbid : null,
      matchScore: t.match ?? 0,
    }))
    .filter((t) => t.artist.length > 0);
}
