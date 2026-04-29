import { z } from "zod";
import { APP_USER_AGENT } from "../constants.js";
import type { SyncedLyricsRow } from "@staccato/shared";

const LRCLIB_BASE = "https://lrclib.net/api";

export const LrclibResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  trackName: z.string(),
  artistName: z.string(),
  albumName: z.string(),
  duration: z.number(),
  instrumental: z.boolean(),
  plainLyrics: z.string().nullable(),
  syncedLyrics: z.string().nullable(),
  lyricsfile: z.string().nullable().optional(),
});

export type LrclibResponse = z.infer<typeof LrclibResponseSchema>;

export async function fetchLyrics(params: {
  artistName: string;
  trackName: string;
  albumName: string;
  durationSeconds: number;
}): Promise<LrclibResponse | null> {
  try {
    const query = new URLSearchParams({
      artist_name: params.artistName,
      track_name: params.trackName,
      album_name: params.albumName,
      duration: String(params.durationSeconds),
    });
    const res = await fetch(`${LRCLIB_BASE}/get?${query}`, {
      headers: { "User-Agent": APP_USER_AGENT },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json = await res.json();
    return LrclibResponseSchema.parse(json);
  } catch {
    return null;
  }
}

// Parses "[MM:SS.cs] text" lines into SyncedLyricsRow[]
export function parseSyncedLyrics(raw: string): SyncedLyricsRow[] {
  return raw
    .split("\n")
    .map((line) => {
      const bracket = line.indexOf("]");
      if (bracket === -1 || line[0] !== "[") return null;
      const timestamp = line.slice(1, bracket);
      const text = line.slice(bracket + 1).trim();
      if (!text) return null;
      const colon = timestamp.indexOf(":");
      if (colon === -1) return null;
      const minutes = parseInt(timestamp.slice(0, colon), 10);
      const seconds = parseFloat(timestamp.slice(colon + 1));
      if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
      return { startingTime: minutes * 60 + seconds, lyrics: text };
    })
    .filter((row): row is SyncedLyricsRow => row !== null);
}
