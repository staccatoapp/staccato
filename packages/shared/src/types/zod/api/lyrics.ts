import { z } from "zod";

export const SyncedLyricsLineSchema = z.object({
  startingTime: z.number(),
  lyrics: z.string(),
});
export type SyncedLyricsLine = z.infer<typeof SyncedLyricsLineSchema>;

export const TrackLyricsSchema = z.object({
  trackId: z.string(),
  instrumental: z.boolean(),
  plainLyrics: z.string().nullable(),
  syncedLyrics: z.array(SyncedLyricsLineSchema).nullable(),
});
export type TrackLyrics = z.infer<typeof TrackLyricsSchema>;
