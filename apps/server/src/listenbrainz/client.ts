// TODO - abstract clients so that different scrobbling services are plug and play/not called directly

import { z } from "zod";

const LB_API_BASE = "https://api.listenbrainz.org/1";

// ── Zod schemas for LB API responses ─────────────────────────────────────────

const LBPlaylistExtSchema = z
  .object({
    "https://musicbrainz.org/doc/jspf#playlist": z
      .object({ expires_at: z.string().optional() })
      .optional(),
  })
  .optional();

const LBPlaylistsListSchema = z.object({
  playlists: z.array(
    z.object({
      playlist: z.object({
        identifier: z.string(),
        title: z.string(),
        annotation: z.string().optional(),
        track_count: z.number().optional(),
        extension: LBPlaylistExtSchema,
      }),
    }),
  ),
});

const LBPlaylistTrackSchema = z.object({
  identifier: z.union([z.string(), z.array(z.string())]),
  title: z.string(),
  creator: z.string().optional(),
  album: z.string().optional(),
  duration: z.number().optional(),
});

const LBPlaylistDetailSchema = z.object({
  playlist: z.object({
    identifier: z.string(),
    title: z.string(),
    annotation: z.string().optional(),
    extension: LBPlaylistExtSchema,
    track: z.array(LBPlaylistTrackSchema),
  }),
});

const LBCFRecommendationsSchema = z.object({
  payload: z.object({
    mbids: z.array(
      z.object({
        recording_mbid: z.string(),
        score: z.number().optional(),
      }),
    ),
    expires_at: z.string().optional(),
  }),
});

// ── Types inferred from schemas ───────────────────────────────────────────────

export interface LBPlaylistSummary {
  id: string;
  title: string;
  description: string | null;
  trackCount: number;
  expiresAt: string | null;
}

export interface LBPlaylistTrack {
  recordingMbid: string | null;
  title: string;
  artistName: string | null;
  albumTitle: string | null;
  durationMs: number | null;
}

export interface LBPlaylistDetail {
  id: string;
  title: string;
  description: string | null;
  expiresAt: string | null;
  tracks: LBPlaylistTrack[];
}

// ── Rate-limit-aware fetch ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lbFetch(url: string, token: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Token ${token}` },
  });
  const remaining = Number(res.headers.get("X-RateLimit-Remaining") ?? 1);
  const resetInMs =
    Number(res.headers.get("X-RateLimit-Reset-In") ?? 0) * 1000;
  if (remaining === 0 && resetInMs > 0) await sleep(resetInMs);
  return res;
}

function extractPlaylistId(identifier: string): string {
  return identifier.split("/").filter(Boolean).pop() ?? identifier;
}

function extractRecordingMbid(
  identifier: string | string[],
): string | null {
  const id = Array.isArray(identifier) ? identifier[0] : identifier;
  if (!id) return null;
  const match = id.match(
    /musicbrainz\.org\/recording\/([0-9a-f-]{36})/i,
  );
  return match?.[1] ?? null;
}

// ── New exported functions ────────────────────────────────────────────────────

export async function getRecommendedPlaylists(
  username: string,
  token: string,
): Promise<LBPlaylistSummary[]> {
  try {
    const res = await lbFetch(
      `${LB_API_BASE}/user/${username}/playlists/recommendations`,
      token,
    );
    if (!res.ok) return [];
    const data = LBPlaylistsListSchema.parse(await res.json());
    return data.playlists.map(({ playlist: p }) => ({
      id: extractPlaylistId(p.identifier),
      title: p.title,
      description: p.annotation ?? null,
      trackCount: p.track_count ?? 0,
      expiresAt:
        p.extension?.["https://musicbrainz.org/doc/jspf#playlist"]
          ?.expires_at ?? null,
    }));
  } catch {
    return [];
  }
}

export async function getPlaylistDetail(
  playlistId: string,
  token: string,
): Promise<LBPlaylistDetail | null> {
  try {
    const res = await lbFetch(
      `${LB_API_BASE}/playlist/${playlistId}`,
      token,
    );
    if (!res.ok) return null;
    const data = LBPlaylistDetailSchema.parse(await res.json());
    const p = data.playlist;
    return {
      id: extractPlaylistId(p.identifier),
      title: p.title,
      description: p.annotation ?? null,
      expiresAt:
        p.extension?.["https://musicbrainz.org/doc/jspf#playlist"]
          ?.expires_at ?? null,
      tracks: p.track.map((t) => ({
        recordingMbid: extractRecordingMbid(t.identifier),
        title: t.title,
        artistName: t.creator ?? null,
        albumTitle: t.album ?? null,
        durationMs: t.duration ?? null,
      })),
    };
  } catch {
    return null;
  }
}

export async function getCFRecommendations(
  username: string,
  token: string,
  count = 10,
): Promise<string[]> {
  try {
    const res = await lbFetch(
      `${LB_API_BASE}/cf/recommendation/user/${username}/recording?count=${count}`,
      token,
    );
    if (!res.ok) return [];
    const data = LBCFRecommendationsSchema.parse(await res.json());
    return data.payload.mbids
      .slice(0, count)
      .map((m) => m.recording_mbid);
  } catch {
    return [];
  }
}

export async function validateToken(
  token: string,
): Promise<{ valid: boolean; userName?: string }> {
  try {
    console.log("Validating ListenBrainz token");
    const res = await fetch(`${LB_API_BASE}/validate-token`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!res.ok) return { valid: false };
    const data = (await res.json()) as { valid: boolean; user_name?: string };
    return { valid: data.valid, userName: data.user_name };
  } catch {
    return { valid: false };
  }
}

// TODO - create type for input data
// TODO - add more fields as needed, currently just the basics to get scrobbling working
export async function submitListen(data: {
  token: string;
  listenType: string;
  artistName: string;
  trackName: string;
  listenedAt: number;
  trackMbid: string | null;
}) {
  const dataToSubmit = {
    listen_type: data.listenType,
    payload: [
      {
        listened_at: data.listenedAt,
        track_metadata: {
          artist_name: data.artistName,
          track_name: data.trackName,
          additional_info: {
            recording_mbid: data.trackMbid,
          },
        },
      },
    ],
  };

  try {
    console.log("Submitting listen to ListenBrainz");
    console.log(JSON.stringify(dataToSubmit));
    const res = await fetch(`${LB_API_BASE}/submit-listens`, {
      method: "POST",
      headers: {
        Authorization: `Token ${data.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dataToSubmit),
    });
    if (!res.ok) {
      console.log(await res.text());
      throw new Error(`Failed to submit listen: ${res.status}`);
    }
  } catch (error) {
    console.error("Error submitting listen to ListenBrainz:", error);
    throw error;
  }
}
